/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

/**
 * Middleware.
 *
 * @param {Store|string} store
 * @param {function} [fetch]
 * @param {object} [options]
 * @returns {Function}
 */

function stores(store, fetch, options) {
	// arguments juggling
	if ('object' == typeof fetch) {
		options = fetch;
		fetch = null;
	}

	// if string, fetches flavor + Store constructor
	if ('string' == typeof store) {
		var name = store[0].toUpperCase() + store.slice(1) + 'Store';
		store = stores[name];
	}

	// if constructor, instantiates it
	if ('function' == typeof store)
		/* jshint newcap: false */
		store = new store(options);

	// global fetch
	if (fetch)
		store.fetch(fetch);

	// middleware!
	return function(req, res, next) {
		store.get(req, res, next);
	};
}

/**
 * Exports.
 */

stores.Bucket = require('./bucket').Bucket;
stores.Store = require('./store/store').Store;
stores.FileStore = require('./store/file').FileStore;

module.exports = stores;