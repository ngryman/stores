/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

function Bucket(id) {
	this.id = id;
}

Bucket.prototype.fetch = function(fetch) {
	this._fetch = fetch;
	return this;
};

/**
 * Exports.
 */

module.exports.Bucket = Bucket;