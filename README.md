# stores

[![NPM](http://img.shields.io/npm/v/stores.svg)](https://www.npmjs.org/package/stores) [![Build Status](http://img.shields.io/travis/ngryman/stores.svg)](https://travis-ci.org/ngryman/stores) [![Dependency Status](http://img.shields.io/gemnasium/ngryman/stores.png)](https://gemnasium.com/ngryman/stores) [![Gittip](http://img.shields.io/gittip/ngryman.svg)](https://www.gittip.com/ngryman/)

<br>

<p>
  <img width="690" height="224" src="https://github.com/ngryman/stores/raw/master/stores.jpg" alt="stores">
  <br>
  <sup>Made with <a href="https://github.com/nosir/obelisk.js">obelisk.js</a>.</sup>
</p>

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

You're in hurry, I can understand that.<br>
Here is an example on how you can cache processed images easily:

```javascript
app.get(/\.(?:jpg|png|gif)$/, stores('file', function(req, slot, next) {
	processImage(req).stream().pipe(slot);
});
```

This ensures that you only process a given image **once**, and serve the cached version to all others.<br>
It implicitly use the `FileStore` to cache the image to the filesystem.<br>
`slot` is a stream pointing to a cache *bucket* that the `FileStore` has automatically created.

***(Rest of the doc incoming!)***

### `stores` middleware

## Custom stores

To implement a custom store, you have to inherit from the `Store` object.

This object provides two methods, `_get` and `_lock` that are respectively needed to fetch the resource from the cache
or to lock a new cache *bucket*. A cache bucket can be seen as the physical place where your cached resource will be
stored. It can be a file, a memory chunk, a REDIS key, a S3 bucket, or whatever you want.

## Author

| [![twitter/ngryman](http://gravatar.com/avatar/2e1c2b5e153872e9fb021a6e4e376ead?size=70)](http://twitter.com/ngryman "Follow @ngryman on Twitter") |
|---|
| [Nicolas Gryman](http://ngryman.sh) |
