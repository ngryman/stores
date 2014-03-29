/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

var lock = require('../lock'),
	Bucket = require('../bucket').Bucket,
	EventEmitter = require('events').EventEmitter,
	PassThrough = require('stream').PassThrough,
	curry = require('curry'),
	util = require('util'),
	crypto = require('crypto');

var pending = {};

/**
 *
 * @constructor
 */
function Store() {
//	/**/
//	app.use(store(function(req, slot, done) {
//		process(req, res, done);
//	}));
//
//	/**/
//	var store = new FileStore();
//
//	store.get(req, res, next).fetch(function(req, slot, done) {
//		process(operations, slot, done);
//	})
//	.on('hit', function(id, slot) {
//	})
//	.on('miss', function(id, slot) {
//	})
//	.on('error', function(err) {
//	});
}

util.inherits(Store, EventEmitter);

/**
 *
 * @param req
 * @param res
 * @param next
 * @returns {req}
 */
Store.prototype.get = function(req, res, next) {
	var bucket = this._createBucket(req);
	var onerror = emitError(this, next);
	var store = this;
	var miss = false;

	// try to get resource
	store._get(bucket, function(err, bucket) {
		if (err) return onerror(500, err);

		console.log('GET', req.id);

		// headers
		res.on('header', function() {
			res.header('X-Cache', miss ? 'MISS' : 'HIT');
		});

		/** hit */

		// pipes bucket's slot to the response, and we're done
		if (bucket.slot) {
			bucket.slot.pipe(res).on('error', onerror(410));
			store.emit('hit', bucket.id, bucket.slot);
			return;
		}

		/** miss */

		// already locked, set the bucket as pending
		// from now on it will wait until it's unlocked
		if (lock.locked(bucket)) {
			console.log('LOCKED', req.id);
			lock.pending(bucket, req, res, next);
			console.log('PENDING', req.id);
			return;
		}

		// first checks that we have so way to fetch fresh data
		var fetch = bucket._fetch || store._fetch;
		if (!fetch)
			return onerror(404, new Error('no fetch method specified'));

		// associate a lock to this bucket, avoiding other request to lock and fetch it
		lock.lock(bucket);
		console.log('LOCK', req.id);

		// locks a writable slot.
		// Fetched data will be written to that slot.
		store._lock(bucket, function(err, bucket) {
			if (err) return onerror(500, err);

			// we'll broadcast fetched data...
			var broadcast = new PassThrough();
			// allows piping 100 requests!
			broadcast.setMaxListeners(100);

			// ... to the slot, in order to store it
			broadcast.pipe(bucket.slot);

			// ... to the current response
			broadcast.pipe(res);

			// mark as miss
			miss = true;

			// ... to all other pending buckets
			// this ensure a fast response for the first part of pending buckets
			console.log('CLEAR MEM', req.id);
			lock.clear(bucket, function(bucket) {
				console.log('PIPING TO ', bucket._req.id);
				broadcast.pipe(bucket._res);
			});

			broadcast.on('error', onerror(500));

			// when the slot is ready
			bucket.slot.on('finish', function() {
				// we tell other pending buckets to get it from the store again
				console.log('CLEAR RETRY', req.id);
				lock.clear(bucket, function(bucket) {
					console.log('RETRY ON', bucket._req.id);
					store.get.call(store, bucket._req, bucket._res, bucket._next);
				});

				// finally unlock the bucket, it's ready!
				lock.unlock(bucket);
				console.log('UNLOCk', req.id);
			});

			// brains!
			fetch(req, broadcast, onerror(500));
		});
	});

	return bucket;
};

/**
 *
 * @param fetch
 * @returns {Store}
 */
Store.prototype.fetch = function(fetch) {
	this._fetch = fetch;
	return this;
};

Store.prototype._createBucket = function(req) {
	var id = crypto.createHash('sha256')
		.update(req.url)
		.digest('hex');

	return new Bucket(id);
};

/**
 *
 * @private
 */
Store.prototype._unlock = function() {

};

/**
 *
 * @param source
 * @param next
 * @param status
 * @param err
 */
var emitError = curry(function(source, next, status, err) {
	err.status = status;
	source.emit('error', err);
	next(err);
});

/**
 * Exports.
 */

module.exports.Store = Store;