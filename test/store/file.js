/*!
 * stores
 * Copyright (c) 2014 Nicolas Gryman <ngryman@gmail.com>
 * MIT Licensed
 */

/* jshint expr: true */
'use strict';

/**
 * Module dependencies.
 */

var stores = require('../..'),
	Store = stores.Store,
	FileStore = stores.FileStore,
	curry = require('curry'),
	express = require('express'),
	request = require('supertest'),
	fs = require('graceful-fs-stream'),
	path = require('path'),
	chai = require('chai'),
	sinon = require('sinon'),
	should = chai.should();

chai.use(require('sinon-chai'));

/**
 * Test constants.
 */

var fixturesPath = path.join(__dirname, '..', 'fixtures'),
	cachePath = path.join(fixturesPath, 'cache'),
	proseText = fs.readFileSync(path.join(fixturesPath, 'prose.html'), 'utf8');

/**
 * Test helpers.
 */

function createApp(middleware) {
	var app = express();

	// useful to track request
	var id = 0;
	app.use(function(req, res, next) {
		req.id = id++;
		next();
	});

	if (middleware instanceof Store) {
		app.use(function(req, res, next) {
			var fetch = !middleware._fetch ? fetchTest : null;
			middleware.get(req, res, next, fetch);
		});
	}
	else
		app.use(middleware);

	// avoids logging error
	app.use(function(err, req, res, next) {
		res.send(err.status);
	});

	return app;
}

function fetchTest(req, slot) {
	fs.createReadStream(fixturesPath + req.url).pipe(slot);
}

function getMiddleware(url, middleware) {
	var app = createApp(middleware);
	return request(app).get(url);
}

function getStore(url, fetch, store) {
	return getMiddleware(url, stores(store || TestStore, undefined !== fetch ? fetch : fetchTest));
}

var rmdir = curry(function(dir, done) {
	var list = fs.readdirSync(dir);
	for (var i = 0; i < list.length; i++) {
		var filename = path.join(dir, list[i]);
		var stat = fs.statSync(filename);

		if (stat.isDirectory())
			// rmdir recursively
			rmdir(filename, null);
		else
			// rm filename
			fs.unlinkSync(filename);
	}

	if (done) return done();
	fs.rmdirSync(dir);
});

/**
 * Test suite.
 */

describe('file store', function() {

	afterEach(rmdir(cachePath));

	it('should create a cache file', function(done) {
		var store = new FileStore({ root: cachePath, depth: 1 });
		getMiddleware('/prose.html', store)
			.expect(proseText, function(err, res) {
				var list, filename, stat, content;
				if (err) return done(err);
				list = fs.readdirSync(cachePath);
				list.should.have.lengthOf(1);
				filename = path.join(cachePath, list[0]);
				stat = fs.statSync(filename);
				stat.isDirectory().should.be.true;
				list = fs.readdirSync(filename);
				list.should.have.lengthOf(1);
				filename = path.join(filename, list[0]);
				stat = fs.statSync(filename);
				stat.isFile().should.be.true;
				// ensures cache file has been written/closed
				// before trying to remove it with afterEach hook
				setTimeout(function() {
					content = fs.readFileSync(filename, 'utf8');
					content.should.equal(proseText);
					done();
				}, 100);
			});
	});

});