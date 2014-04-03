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
	chai = require('chai'),
	sinon = require('sinon'),
	should = chai.should();

chai.use(require('sinon-chai'));

describe('stores middleware', function() {

	it('should accept a Store type', function() {
		var Store = sinon.spy();
		stores(Store);
		Store.should.have.been.calledWithNew;
	});

	it('should accept a Store instance', function() {
		var store = new stores.Store();
		stores(store);
	});

	it('should accept the name of a Store type', function() {
		stores.WootStore = sinon.spy();
		stores('woot');
		stores.WootStore.should.have.been.called;
		delete stores.WootStore;
	});

	it('should accept an optional fetch function', function() {
		var Store = sinon.spy();
		Store.prototype.fetch = sinon.spy();
		var fetch = function() {};
		stores(Store, fetch);
		Store.should.have.been.calledWithNew;
		Store.prototype.fetch.should.have.been.calledWith(fetch);
	});

	it('should accept options', function() {
		var Store = sinon.spy(), options = { woot: 'store' };
		stores(Store, options);
		Store.should.have.been.calledWith(options);
	});

	it('should accept all arguments', function() {
		var Store = sinon.spy();
		Store.prototype.fetch = sinon.spy();
		var fetch = function() {};
		var options = { woot: 'store' };
		stores(Store, options, fetch);
		Store.should.have.been.calledWithNew;
		Store.should.have.been.calledWith(options);
		Store.prototype.fetch.should.have.been.calledWith(fetch);
	});

});