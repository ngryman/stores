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
 * @param flavor
 * @param fetch
 * @param options
 * @returns {Function}
 */

function stores(flavor, fetch, options) {
	// arguments juggling
	if ('object' == typeof fetch) {
		options = fetch;
		fetch = null;
	}

	if ('string' == typeof flavor) {
		var name = flavor[0].toUpperCase() + flavor.slice(1) + 'Store';
		flavor = stores[name];
	}

	/* jshint newcap: false */
	var store = new flavor(options);
	if (fetch)
		store.fetch(fetch);

	return function(req, res, next) {
		store.get(req, res, next);
	};
}

/**
 * Exports.
 */

stores.Store = require('./store/store').Store;

module.exports = stores;