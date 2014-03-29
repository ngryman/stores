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
var stores = require('..'),
	Store = stores.Store,
	Readable = require('stream').Readable,
	Writable = require('stream').Writable,
	SlowStream = require('slow-stream'),
	ServerResponse = require('http').ServerResponse,
	request = require('supertest'),
	Test = request.Test,
	express = require('express'),
	curry = require('curry'),
	util = require('util'),
	fs = require('fs'),
	path = require('path'),
	chai = require('chai'),
	sinon = require('sinon'),
	should = chai.should();

chai.use(require('sinon-chai'));

var fixturesPath = path.join(__dirname, 'fixtures'),
	cachePath = path.join(fixturesPath, 'cache');

var proseText = fs.readFileSync(path.join(fixturesPath, 'prose.html'), 'utf8');

function EmptyStore(options) {
	Store.call(this);

	this.options = options || {};

	this._get = function(bucket, callback) {
		setImmediate(function() {
			bucket.filename = path.join(cachePath, bucket.id + '.html');
			fs.exists(bucket.filename, function(exists) {
				if (exists)
					bucket.slot = fs.createReadStream(bucket.filename);
				callback(null, bucket);
			});
		});
	};

	this._lock = function(bucket, callback) {
		setImmediate(function() {
			bucket.slot = fs.createWriteStream(bucket.filename);
			callback(null, bucket);
		});
	};

	// event emitter throw errors by default, silence him!
	this.on('error', function() {});
}

EmptyStore.fetch = function(req, slot, next) {
	fs.createReadStream(fixturesPath + req.url).pipe(slot);
};

util.inherits(EmptyStore, Store);

function createApp(middleware) {
	var app = express();

	// useful to track request
	var id = 0;
	app.use(function(req, res, next) {
		req.id = id++;
		next();
	});

	// stores middleware
	app.use(middleware);

	// avoids logging error
	app.use(function(err, req, res, next) {
		res.send(err.status);
	});

	return app;
}

function getMiddleware(url, middleware) {
	var app = createApp(middleware);
	return request(app).get(url);
}

function get(url, fetch) {
	return getMiddleware(url, stores(EmptyStore, fetch));
}

var rmdir = curry(function(dir, done) {
	var list = fs.readdirSync(dir);
	for (var i = 0; i < list.length; i++) {
		var filename = path.join(dir, list[i]);
		var stat = fs.statSync(filename);

		if (stat.isDirectory()) {
			// rmdir recursively
			rmdir(filename);
		}
		else {
			// rm filename
			fs.unlinkSync(filename);
		}
	}
	done();
});

describe('store', function() {

	before(rmdir(cachePath));
	afterEach(rmdir(cachePath));

	it('should call fetch when cache miss', function(done) {
		var called = false;
		get('/prose.html', function(req, slot, next) {
			req.should.have.property('url', '/prose.html');
			slot.should.be.instanceOf(Readable);
			next.should.be.a('function');
			EmptyStore.fetch(req, slot, next);
			called = true;
		}).end(function(err, res) {
			if (err) return done(err);
			res.text.should.equal(proseText);
			called.should.be.true;
			done(err);
		});
	});

	it('should send a 404 when no fetch is specified', function(done) {
		get('/prose.html', null)
			.expect(404)
			.end(function(err, res) {
				if (err) return done(err);
				fs.readdirSync(cachePath).should.have.lengthOf(0);
				done();
			});
	});

	it('should call bucket#fetch when available instead of global fetch', function(done) {
		var called = false, spy = sinon.spy(), store = new EmptyStore();
		getMiddleware('/prose.html', function(req, res, next) {
			req.should.have.property('url', '/prose.html');
			res.should.be.instanceOf(ServerResponse);
			next.should.be.a('function');
			store.fetch(spy);
			store.get(req, res, next).fetch(function(req, slot, next) {
				req.should.have.property('url', '/prose.html');
				slot.should.be.instanceOf(Readable);
				next.should.be.a('function');
				EmptyStore.fetch(req, slot, next);
				called = true;
			});
		}).end(function(err, res) {
			if (err) return done(err);
			res.text.should.equal(proseText);
			called.should.be.true;
			spy.should.not.have.been.called;
			done();
		});
	});

	it('should cache hit a second request', function(done) {
		get('/prose.html', EmptyStore.fetch)
			.expect('X-Cache', 'MISS')
			.end(function(err, res) {
				if (err) return done(err);
				res.text.should.equal(proseText);
				get('/prose.html', null)
					.expect('X-Cache', 'HIT')
					.end(function(err, res) {
						if (err) return done(err);
						res.text.should.equal(proseText);
						done();
					});
			});
	});

	it('should lock a resource that is being fetched', function(done) {
		var store = new EmptyStore();
		var app = createApp(function(req, res, next) {
			store.get(req, res, next).fetch(function() {
				EmptyStore.fetch.apply(this, arguments);
			});
		});

		function sync(err, res) {
			if (err) return done(err);
			res.text.should.equal(proseText);
			sync.calls = sync.calls || 0;
			sync.calls++;
			if (11 == sync.calls) {
				done();
			}
		}

		request(app).get('/prose.html')
			.expect('X-Cache', 'MISS')
			.end(sync);

		// 5 requests will be piped from memory
		for (var i = 0; i < 5; i++) {
			request(app).get('/prose.html')
				.expect('X-Cache', 'HIT')
				.end(sync);
		}

		// 5 requests will retry hit
		setTimeout(function() {
			for (var i = 0; i < 5; i++) {
				request(app).get('/prose.html')
					.expect('X-Cache', 'HIT')
					.end(sync);
			}
		}, 90);
	});

	xit('should send fetched data to all pending request', function() {});
	xit('should send cached data to pending requests arrived between fetch end and cache end', function() {});
	xit('should ', function() {});

});