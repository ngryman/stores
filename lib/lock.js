/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

var queues = {};

/**
 *
 * @type {{}}
 */
var lock = {};

/**
 *
 * @param bucket
 * @returns {boolean}
 */
lock.locked = function(bucket) {
	return (null != queues[bucket.id]);
};

/**
 *
 * @param bucket
 */
lock.lock = function(bucket) {
	queues[bucket.id] = [];
};

/**
 *
 * @param bucket
 */
lock.unlock = function(bucket) {
	queues[bucket.id] = null;
};

/**
 *
 * @param bucket
 * @param req
 * @param res
 * @param next
 */
lock.pending = function(bucket, req, res, next) {
	bucket._req = req;
	bucket._res = res;
	bucket._next = next;
	queues[bucket.id].push(bucket);
};

/**
 *
 * @param bucket
 * @param fn
 */
lock.clear = function(bucket, fn) {
	queues[bucket.id].forEach(fn);
	queues[bucket.id].length = 0;
};

/**
 * Exports.
 */
module.exports = lock;