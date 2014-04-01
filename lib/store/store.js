/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

var Bucket = require('../bucket').Bucket,
	EventEmitter = require('events').EventEmitter,
	PassThrough = require('stream').PassThrough,
	util = require('util');

var DEBUG = ('development' == process.env.NODE_ENV);

/**
 * Store facility.
 *
 * @param {object} [options]
 * @constructor
 */
function Store(options) {
	options = options || {};

	this.maxPending = options.maxPending || 100;
	this.writeRetries = options.writeRetries || 3;
}

util.inherits(Store, EventEmitter);

/**
 *
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @param {function} [fetch]
 */
Store.prototype.get = function(req, res, next, fetch) {
	var bucket = Bucket.get(req, this);

	// debug headers
	if (DEBUG)
		res.on('header', function() {
			res.header('X-Cache', req.cacheHit ? 'hit' : 'miss');
			if ('string' == typeof req.cacheHit)
				res.header('X-Cache-Hit', req.cacheHit);
		});

	// if bucket is sealed, resource is flagged as not accessible,
	// so we send a 404
	if (bucket.sealed(req))
		return onError.call(this, req, bucket, 404, new Error('cache bucket sealed'));

	// try to get a resource from the cache
	setImmediate(
		this._get.bind(this,
			bucket,
			onGet.bind(this, req, bucket, fetch)
		)
	);
};

/**
 *
 * @param {function} fetch
 * @return {Store}
 */
Store.prototype.fetch = function(fetch) {
	this._fetch = fetch;
	return this;
};

/**
 *
 * @param {object} req
 * @param {Bucket} bucket
 * @param {function} fetch
 * @param {Error} err
 * @param {Readable} slot
 * @private
 */
function onGet(req, bucket, fetch, err, slot) {
	if (err) return onError.call(this, req, bucket, 404, err);

	// already locked, set the bucket as pending
	// from now on it will wait until it's unlocked
	if (bucket.locked(req))
		return bucket.pending(req);

	/** hit */

	// pipes bucket's slot to the response, and we're done
	if (slot) {
		req.cacheHit = req.cacheHit || true;
		this.emit('hit', req, bucket, 'string' == typeof req.cacheHit ? req.cacheHit : undefined);
		slot.pipe(req.res);
		slot.on('error', onError.bind(this, req, bucket, 500));
		bucket.release(req);
		return;
	}

	/** miss */

	// first checks that we have a way to fetch fresh data
	fetch = fetch || this._fetch;
	if (!fetch)
		return onError.call(this, req, bucket, 404, new Error('no fetch method specified'));

	// associate a lock to this bucket, avoiding other request to lock and fetch it
	bucket.lock(req);

	// locks a writable cache slot.
	// Fetched data will be written to that slot.
	setImmediate(
		this._lock.bind(this,
			bucket,
			onLock.bind(this, req, bucket, fetch)
		)
	);
}

/**
 *
 * @param {object} req
 * @param {Bucket} bucket
 * @param {function} fetch
 * @param {Error} err
 * @param {Writable} slot
 * @private
 */
function onLock(req, bucket, fetch, err, slot) {
	if (err) return onError.call(this, req, bucket, 500, err);

	// emit a miss event right now
	this.emit('miss', req, bucket);

	// we'll directly broadcast fetched data...
	var broadcast = new PassThrough();
	broadcast.setMaxListeners(this.maxPending);

	// ... to the current response
	broadcast.pipe(req.res);

	// ... to the cache slot, in order to store it
	broadcast.pipe(slot);

	// when the slot is ready
	slot.on('finish', function() {
		// we tell other pending buckets to get it from the store again
		bucket.clearPending(onHitDeferred.bind(this, bucket));

		// finally unlock the bucket, it's ready!
		bucket.unlock(req);
	}.bind(this));

	// when an error occurred
	slot.on('error', function() {
		// increment write errors count
		bucket.writeErrors++;

		// too many write errors, seals the bucket
		if (bucket.writeErrors > this.writeRetries)
			bucket.seal(req);

		// we tell other pending buckets to get it from the store again
		bucket.clearPending(onHitDeferred.bind(this, bucket));

		// finally unlock the bucket, it's ready!
		bucket.unlock(req);
	}.bind(this));

	// ... to all other pending requests
	// this ensure a fast response for requests that arrived
	// between bucket's lock and slot's lock
	bucket.clearPending(onHitHot.bind(this, bucket, broadcast));

	// brains!
	fetch(req, broadcast, onError.bind(this, req, bucket, 500));
}

/**
 *
 * @param {Bucket} bucket
 * @param {Readable} slot
 * @param {object} req
 * @private
 */
function onHitHot(bucket, slot, req) {
	// emits a hit event, type hot
	this.emit('hit', req, bucket, 'hot');
	// marks as hip hop
	req.cacheHit = 'hot';
	// releases bucket as we're done
	bucket.release(req);
	// pipes slot to response
	slot.pipe(req.res);
}

/**
 *
 * @param {Bucket} bucket
 * @param {object} req
 * @private
 */
function onHitDeferred(bucket, req) {
	// note: we don't emit an event here as we call store.get

	// marks as hit deferred
	req.cacheHit = 'deferred';
	// releases bucket as we're done
	bucket.release(req);
	// get from cache
	this.get(req, req.res, req.next);
}

/**
 *
 * @param {object} req
 * @param {Bucket} bucket
 * @param {number} status
 * @param {Error} err
 */
function onError(req, bucket, status, err) {
	// sets http status
	err.status = status;
	// emits a error event
	this.emit('error', err);
	// releases bucket as we're done
	bucket.release(req);
	// passes to next error handler
	req.next(err);
}

/**
 * Exports.
 */

module.exports.Store = Store;