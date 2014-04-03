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
	Bucket = stores.Bucket,
	Readable = require('stream').Readable,
	Writable = require('stream').Writable,
	SlowStream = require('slow-stream'),
	ServerResponse = require('http').ServerResponse,
	request = require('supertest'),
	express = require('express'),
	curry = require('curry'),
	util = require('util'),
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

/**
 * Basic implementation of a file system store for tests.
 * It can be overridden almost everywhere. That allow tweaking some spots for testing purpose.
 *
 * @param {object} [options] Options.
 * @constructor
 */
function TestStore(options) {
	options = options || {};

	Store.call(this, options);

	this._get = options.get || function(bucket, callback) {
		bucket.filename = path.join(cachePath, bucket.id + '.html');
		fs.exists(bucket.filename, function(exists) {
				var slot;
				if (exists)
					slot = fs.createReadStream(bucket.filename);
				callback(null, slot);
			});
	};

	this._lock = options.lock || function(bucket, callback) {
		setImmediate(function() {
			if (options.lockDelay)
				return setTimeout(lock, 100);
			lock();
		});

		function lock() {
			var slot = fs.createWriteStream(bucket.filename);
			callback(null, slot);
		}
	};

	// event emitter throw errors by default, silence him!
	this.on('error', function() {});
}

util.inherits(TestStore, Store);

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

function getMiddleware(url, middleware) {
	var app = createApp(middleware);
	return request(app).get(url);
}

function getStore(url, fetch, store) {
	return getMiddleware(url, stores(store || TestStore, undefined !== fetch ? fetch : fetchTest));
}

function fetchTest(req, slot) {
	fs.createReadStream(fixturesPath + req.url).pipe(slot);
}

var fire = curry(function(app, url, text, count, cache, done) {
	cache = cache.split(', ');

	for (var i = 0; i < count; i++) {
		var test = request(app).get(url).expect('X-Cache', cache[0]);
		if (cache[1])
			test = test.expect('X-Cache-Hit', cache[1]);
		test.expect(text, done);
	}
});

var sync = curry(function(calls, done, err) {
	if (err) return done(err);
	sync.calls = sync.calls || 0;
	sync.calls++;
	if (calls == sync.calls) {
		sync.calls = 0;
		done();
	}
});

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

describe('store', function() {

	before(rmdir(cachePath));

	afterEach(rmdir(cachePath));

	it('should call fetch when cache miss', function(done) {
		var called = false;

		getStore('/prose.html', function(req, slot, next) {
			req.should.have.property('url', '/prose.html');
			slot.should.be.instanceOf(Readable);
			next.should.be.a('function');
			fetchTest(req, slot, next);
			called = true;
		}).expect(proseText, function(err, res) {
			if (err) return done(err);
			called.should.be.true;
			done(err);
		});
	});

	it('should call inline fetch when available instead of global fetch', function(done) {
		var store = new TestStore(),
			spy = sinon.spy();

		store.fetch(spy);

		getMiddleware('/prose.html', function(req, res, next) {
			store.get(req, res, next, fetchTest);
		}).expect(proseText, function(err, res) {
			if (err) return done(err);
			spy.should.not.have.been.called;
			done();
		});
	});

	it('should cache hit a second request', function(done) {
		getStore('/prose.html')
			.expect('X-Cache', 'miss')
			.expect(proseText, function(err, res) {
				if (err) return done(err);
				getStore('/prose.html')
					.expect('X-Cache', 'hit')
					.expect(proseText, done);
			});
	});

	it('should lock a resource that is being fetched', function(done) {
		var store = new TestStore(),
			fetchCalls = 0;

		store.fetch(function() {
			fetchCalls++;
			fetchTest.apply(null, arguments);
		});

		var app = createApp(store);
		var test = fire(app, '/prose.html', proseText);
		var sync6 = sync(6, function(err) {
			if (err) return done(err);
			fetchCalls.should.equal(1);
			done();
		});

		test(1, 'miss', sync6);
		setImmediate(test.bind(null, 5, 'hit', sync6));
	});

	it('should send hot fetched data to all pending request when cache is ready', function(done) {
		var store = new TestStore({ lockDelay: true });

		var app = createApp(store);
		var test = fire(app, '/prose.html', proseText);
		var sync6 = sync(6, done);

		test(1, 'miss', sync6);
		setTimeout(test.bind(null, 5, 'hit, hot', sync6), 0);
	});

	it('should send cached data to all remaining pending requests when cache was ready', function(done) {
		var store = new TestStore();

		store.fetch(function(req, slot, next) {
			fs.createReadStream(fixturesPath + req.url)
				.pipe(new SlowStream({ maxWriteInterval: 100 }))
				.pipe(slot);
		});

		var app = createApp(store);
		var test = fire(app, '/prose.html', proseText);
		var sync6 = sync(6, done);

		test(1, 'miss', sync6);
		setTimeout(test.bind(null, 5, 'hit, deferred', sync6), 100);
	});

	describe('errors', function() {

		it('should send a 404 when cache is not accessible', function(done) {
			var store = new TestStore({ get: function(bucket, callback) {
				callback(new Error('enter the void'));
			}});

			getMiddleware('/prose.html', store)
				.expect(404)
				.expect('Not Found', done);
		});

		it('should send a 500 when reading cache fail', function(done) {
			var store = new TestStore({ get: function(bucket, callback) {
				var slot = fs.createReadStream('void');
				callback(null, slot);
			}});

			getMiddleware('/prose.html', store)
				.expect(500)
				.expect('Internal Server Error', done);
		});

		it('should send a 404 when no fetch is specified', function(done) {
			getStore('/prose.html', null)
				.expect(404)
				.end(function(err, res) {
					if (err) return done(err);
					fs.readdirSync(cachePath).should.have.lengthOf(0);
					done();
				});
		});

		it('should send a 500 when locking a cache bucket fail', function(done) {
			var store = new TestStore({ lock: function(bucket, callback) {
				callback(new Error('enter the void'));
			}});

			getMiddleware('/prose.html', store)
				.expect(500)
				.expect('Internal Server Error', done);
		});

		it('should send a 404 when cache write fails writeRetries times', function(done) {
			var store = new TestStore({ writeRetries: 1, lock: function(bucket, callback) {
				var slot = fs.createWriteStream('/i/do/not/exist');
				callback(null, slot);
			}});

			var app = createApp(store);
			var test = fire(app, '/prose.html');

			test(proseText, 1, 'miss', function(err) {
				if (err) return done(err);
				test(proseText, 1, 'miss', function(err) {
					if (err) return done(err);
					test('Not Found', 1, 'miss', function(err, res) {
						if (err) return done(err);
						res.status.should.equal(404);
						done();
					});
				});
			});
		});

	});

	describe('events', function() {

		it('should emit a miss/cache event', function(done) {
			var store = new TestStore(),
				miss = false,
				cache = false;

			store.on('miss', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				miss = true;
			}).on('cache', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				cache = true;
			});

			getMiddleware('/prose.html', store).expect(proseText, function(err, res) {
				// ensures every event is fired
				setTimeout(function() {
					if (err) return done(err);
					miss.should.be.true;
					cache.should.be.true;
					done();
				}, 100);
			});
		});

		it('should emit a hit event', function(done) {
			var store = new TestStore({ lockDelay: true }),
				classic = 0,
				hot = 0,
				deferred = 0;

			store.fetch(function(req, slot, next) {
				fs.createReadStream(fixturesPath + req.url)
					.pipe(new SlowStream({ maxWriteInterval: 100 }))
					.pipe(slot);
			});

			store.on('hit', function(req, bucket, type) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);

				switch (type) {
					case 'hot': hot++; break;
					case 'deferred': deferred++; break;
					default: classic++; break;
				}
			});

			var app = createApp(store);
			var test = fire(app, '/prose.html', proseText);
			var sync4 = sync(4, function(err) {
				if (err) return done(err);
				classic.should.equal(1);
				hot.should.equal(1);
				deferred.should.equal(1);
				done();
			});

			test(1, 'miss', sync4);
			setTimeout(test.bind(null, 1, 'hit, hot', sync4), 0);
			setTimeout(test.bind(null, 1, 'hit, deferred', sync4), 150);
			setTimeout(test.bind(null, 1, 'hit', sync4), 400);
		});

		it('should emit bucket\'s locked/pending/lock/unlock events', function(done) {
			var store = new TestStore(),
				locked = 0,
				pending = 0,
				lock = 0,
				unlock = 0;

			store.on('bucket:locked', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				locked++;
			}).on('bucket:pending', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				pending++;
			}).on('bucket:lock', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				lock++;
			}).on('bucket:unlock', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				unlock++;
			});

			var app = createApp(store);
			var test = fire(app, '/prose.html', proseText);
			var sync3 = sync(3, function(err) {
				// ensures every event is fired
				setTimeout(function() {
					if (err) return done(err);
					locked.should.equal(2);
					pending.should.equal(2);
					lock.should.equal(1);
					unlock.should.equal(1);
					done();
				}, 100);
			});

			test(1, 'miss', sync3);
			test(2, 'hit', sync3);
		});

		it('should emit bucket\'s seal/sealed events', function(done) {
			var store = new TestStore({ writeRetries: 1, lock: function(bucket, callback) {
				var slot = fs.createWriteStream('/i/do/not/exist');
				callback(null, slot);
			}}),
				seal = 0,
				sealed = 0;

			store.on('bucket:seal', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				seal++;
			}).on('bucket:sealed', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				sealed++;
			});

			var app = createApp(store);
			var test = fire(app, '/prose.html');

			test(proseText, 1, 'miss', function(err) {
				if (err) return done(err);
				test(proseText, 1, 'miss', function(err) {
					if (err) return done(err);
					test('Not Found', 1, 'miss', function(err) {
						if (err) return done(err);
						seal.should.equal(1);
						sealed.should.equal(1);
						done();
					});
				});
			});
		});

		it('should emit bucket\'s new/get/release/destroy events', function(done) {
			var store = new TestStore({ lockDelay: true }),
				newB = 0,
				getB = 0,
				release = 0,
				destroy = 0;

			store.on('bucket:new', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				newB++;
			}).on('bucket:get', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				getB++;
			}).on('bucket:release', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				release++;
			}).on('bucket:destroy', function(req, bucket) {
				req.should.exist;
				bucket.should.be.instanceOf(Bucket);
				destroy++;
			});

			var app = createApp(store);
			var test = fire(app, '/prose.html', proseText);
			var sync3 = sync(3, function(err) {
				// ensures every event is fired
				setTimeout(function() {
					if (err) return done(err);
					newB.should.equal(1);
					getB.should.equal(2);
					release.should.equal(3);
					destroy.should.equal(1);
					done();
				}, 100);
			});

			test(1, 'miss', sync3);
			test(2, 'hit', sync3);
		});

	});

});