/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

'use strict';

// TODO: handle http methods: https://github.com/koajs/static-cache/blob/master/index.js

/**
 * Module dependencies.
 */

var Store = require('./store').Store,
	fs = require('graceful-fs-stream'),
	path = require('path'),
	util = require('util'),
	mkdirp = require('mkdirp');

/**
 *
 * @param {object} [options]
 * @constructor
 */
function FileStore(options) {
	Store.call(this, options);

	this.root = options.root || process.cwd();
	this.depth = options.depth || 4;
}

util.inherits(FileStore, Store);

/**
 * Fetches cache data if it exists.
 *
 * @param {Bucket} bucket
 * @param {function} callback
 * @private
 */
FileStore.prototype._get = function(bucket, callback) {
	var filename = path.resolve(
		path.join(this.root, buildFilename(bucket.id, this.depth))
	);

	// if file exists, passes a readable stream
	fs.exists(filename, function(exists) {
		var slot;
		if (exists)
			slot = fs.createReadStream(filename);
		callback(null, slot);
	});

	// stores file info in the bucket, for further use
	bucket.filename = filename;
	bucket.pathname = path.dirname(filename);
};

/**
 * Creates the directory structure and a stream to the file cache.
 *
 * @param {Bucket} bucket
 * @param {function} callback
 * @private
 */
FileStore.prototype._lock = function(bucket, callback) {
	// creates the directory structure, opens the new file
	// and passes a writable stream
	mkdirp(bucket.pathname, function(err) {
		if (err) return callback(err);

		var slot = fs.createWriteStream(bucket.filename);
		callback(null, slot);
	});
};

/**
 * Creates a balanced directory structure for each cache file.
 * Storing too much files in the same directory has a negative impact in
 * most of filesystems.
 * This ensure that there is not more that 256 directory per depth, expect for the final directory.
 * We use the id (a strong hash) to generate the filename.
 * So the final directory should not contain so much files neither.
 * Balancing is taken care of naturally by the hash.
 *
 * @param {string} id
 * @param {number} depth
 * @return {string}
 * @private
 */
function buildFilename(id, depth) {
	var filename = '',
		i = 0,
		length = id.length;

	for ( ; i < depth && i < length; i += 2)
		filename += id.substr(i, 2) + path.sep;
	filename += id.substr(i);

	return filename;
}

/**
 * Exports.
 */

module.exports.FileStore = FileStore;