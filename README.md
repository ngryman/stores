# stores

[![Greenkeeper badge](https://badges.greenkeeper.io/ngryman/stores.svg)](https://greenkeeper.io/)

[![Build Status][travis-image]][travis-url]

<br>

<p>
  <img width="690" height="224" src="https://github.com/ngryman/stores/raw/master/stores.jpg" alt="stores">
  <br>
  <sup>Made with <a href="https://github.com/nosir/obelisk.js">obelisk.js</a>.</sup>
</p>

<br>

**stores** is a fast, reliable, smart caching system heavily based on streams.

**stores** deals transparently with [cache stampede] or *cache miss storm* for you.
Basically, it ensures that only **one request fetches the resource to be cached**.
Other ones are put in a queue and served ASAP, when the resource has been fetched or cached.

**stores** aims to be a solid caching facility that allows you to easily implement your custom backing store.
That said, it comes with a balanced `filesystem` store and an [express] middleware.

[cache stampede]: http://en.wikipedia.org/wiki/Cache_stampede
[express]: http://expressjs.com

## Installation

```bash
npm install stores --save --production
```

## Usage

You're in a hurry, I can understand that.<br>
Here is an example on how you can cache processed images easily:

```javascript
app.get(/\.(?:jpg|png|gif)$/, stores('file', function(req, slot, next) {
	processImage(req).stream().pipe(slot);
});
```

This code ensures that you only process a given image **once**, and serve the cached version to all others.<br>
It implicitly uses the `FileStore` to cache the image to the filesystem.<br>
A `slot` represents a stream pointing to a cache *bucket* that the `FileStore` has automatically created.

### `stores(store, [options], [fetch])`

This provided middleware allows you to configure a store globally.

#### `store`

This mandatory argument can be:
 - a `string` that defines which type of store you want to use (for now only `file`).
 - an existing `Store` instance.
 - a `constructor` that inherits from `Store`.

```javascript
stores('file');
stores(new FileStore());
stores(FileStore);
```

Note that you can register [custom stores] and then use the `string` flavor:
```javascript
stores.MyPreciousStore = MyPreciousStore;
stores('myPrecious');
```

#### `options`

Optional, `options` will configure the store. All stores accept those values:
 - `maxPending`: *(default: 100)*, defines how many requests can be enqueued while a resource is being cached (see [hit hot]).
 - `writesRetries`: *(default: 3)*, defines how many times the store will try to write to a cache bucket that fails (see [sealed buckets].

```javascript
stores('file', { maxPending: Infinity, writesRetries: 0 });
```

Note that each implementation can add additional values for their specific needs (i.e. [file store options]).

#### `fetch(req, slot, next)`

Optional, this callback allows the store to fetch missing data and store it. It is called on a cache miss, with the following arguments:
 - `req`: the network request.
 - `slot`: a `Writable` stream that will persist data to cache. It is allocated by the store. You must `pipe` to it.
 - `next`: next middleware in the stack. It's useful if something went wrong and you want to abort the request asap.

```javascript
stores('file', function(req, slot, next) {
	var stream = createSomeStream(req);
	stream.pipe(slot);
});
```

Note that if you don't specify a `fetch` callback here, then you must specify it via `Store#fetch` or `Store#get`.

### `Store` object

As seen previously, you can instanciate a store by yourself for some additional flexibility. As a user, you only are interested in the public `api`.

#### `Store([options])`

Creates a store with the given options.
```javascript
var store = new FileStore({ writesRetries: 0 });
```

#### `Store#fetch(fetch)`

This tells the store how to fetch a missing resource from the cache. If you haven't specified it via the `stores` middleware, you still can do it here globally.

```javascript
var store = new FileStore();
store.fetch(function(req, slot, next) {
	var stream = createSomeStream(req);
	stream.pipe(slot);
});
```

The main advantage of doing it this way, is that you can change the `fetch` method whenever you want during the lifecycle of your application.

#### `Store#get(req, res, next, [fetch])`

This is the most important method. It will try to fetch a resource from the cache or call `fetch` callback.<br>
It can be useful if for some reason, you prefer using `stores` in one of your existing route of middleware, or when you want to add additional logic before using it.

```javascript
var store = new FileStore();

app.get(/\.(?:jpg|png|gif)$/, function(req, res, next) {
	// don't process/cache tuhmbnails
	if (~req.url.indexOf('thumb')) {
		fs.createReadStream(path.join(root, req.url)).pipe(res);
		return;
	}

	// process others
	store.get(req, res, next, function(req, slot, next) {
		processImage(req).stream().pipe(slot);
	});
});
```

Note that if you already have specified a fetch method globally, you can then omit the `fetch` argument:
```javascript
app.get(/\.(?:jpg|png|gif)$/, function(req, res, next) {
	store.get(req, res, next);
});
```

[custom stores]: #custom-stores

## Available stores

### `FileStore`

As you may already guess, it uses the filesystem as storage medium. It creates a [balanced directory structure] which ensures performance is always the best, even if your cache is growing fast.

Basically each cache entry is associated with a strong hash (`sha256`). This hash is used to create the path to the cache file. This path is composed of multiple subdirectories in order to ensure there is not more that 256 entries in each directory.

#### `FileStore([options])`

Creates a filesystem store with the given options. Available options are [common ones] plus the following ones:
 - `root`: *(default: current directory)*, root directory of the cache structure.
 - `depth`: *(default: 4)*, number of subdirectories less 1.

```javascript
var store = new FileStore({ root: '/var/cache/www', depth: 2});
```

[common ones]: #options

[balanced directory structure]: http://michaelandrews.typepad.com/the_technical_times/2009/10/creating-a-hashed-directory-structure.html

## Custom stores

To implement a custom store, you have to inherit from the `Store` object.

This object provides two methods, `_get` and `_lock` that are respectively needed to fetch the original resource and to lock a new cache *bucket*. A cache bucket can be seen as the physical location where your cached resource will be
stored. It can be a file, a memory chunk, a REDIS key, a S3 bucket, or whatever you want.

### `Store` object

## Graceful filesystem streams

You also need be aware that `stores` uses [graceful-fs-stream] (`gfs`) as dependency. `gfs` slightly changes the behavior of `fs.createReadStream` and `fs.createWriteStream` by opening / creating the underlying file on **first read or write**. The main advantage is that instead of throwing an error, those function will emit an `error` event instead.

If you do still want to use standard versions in your project, use `fs._createReadStream` or `fs._createWriteStream`.

## Author

| [![twitter/ngryman](http://gravatar.com/avatar/2e1c2b5e153872e9fb021a6e4e376ead?size=70)](http://twitter.com/ngryman "Follow @ngryman on Twitter") |
|---|
| [Nicolas Gryman](http://ngryman.sh) |

[travis-image]: http://img.shields.io/travis/ngryman/stores.svg
[travis-url]: https://travis-ci.org/ngryman/stores
