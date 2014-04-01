/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */
var crypto = require('crypto');

function Bucket(id, store) {
	this.id = id;
	this.store = store;
	this.container = store._buckets;
	this.refCount = 1;
	this.writeErrors = 0;
}

Bucket.prototype.locked = function(req) {
	var locked = (null != this.container[this.id]._queue);
	if (locked)
		this.store.emit('bucket:locked', req, this);
	return locked;
};

Bucket.prototype.lock = function(req) {
	this.container[this.id]._queue = [];
	this.store.emit('bucket:lock', req, this);
};

Bucket.prototype.unlock = function(req) {
	this.container[this.id]._queue = null;
	this.store.emit('bucket:unlock', req, this);
	this.release(req);
};

Bucket.prototype.pending = function(req) {
	this.container[this.id]._queue.push(req);
	this.store.emit('bucket:pending', req, this);
};

Bucket.prototype.clearPending = function(fn) {
	var bucket = this.container[this.id];
	bucket._queue.forEach(fn);
	bucket._queue.length = 0;
};

Bucket.prototype.release = function(req) {
	this.refCount--;
	this.store.emit('bucket:release', req, this);
	if (0 === this.refCount && 0 === this.writeErrors) {
		this.container[this.id] = null;
		this.store.emit('bucket:destroy', req, this);
	}
};

Bucket.prototype.sealed = function(req) {
	var sealed = this.container[this.id]._sealed;
	if (sealed)
		this.store.emit('bucket:sealed', req, this);
	return sealed;
};

Bucket.prototype.seal = function(req) {
	this.container[this.id]._sealed = true;
	this.store.emit('bucket:seal', req, this);
};

Bucket.get = function(req, store) {
	var id = crypto.createHash('sha256')
		.update(req.url)
		.digest('hex');

	if (!store._buckets)
		store._buckets = {};

	var container = store._buckets,
		bucket = container[id];

	if (bucket) {
		bucket.refCount++;
		store.emit('bucket:get', req, bucket);
	}
	else {
		bucket = new Bucket(id, store);
		store.emit('bucket:new', req, bucket);
		container[id] = bucket;
	}

	return bucket;
};

/**
 * Exports.
 */

module.exports.Bucket = Bucket;