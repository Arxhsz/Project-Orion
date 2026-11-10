(function (window) {
  'use strict';
  var Orion = window.Orion = window.Orion || {};
  // Cache decoded frames, not just URLs. A frame is usable only after decoding.
  Orion.FrameBuffer = function (limit, byteLimit) {
    var entries = new Map(), sizes = new Map(), pinned = new Set(), generation = 0, bytes = 0;
    byteLimit = byteLimit || 384 * 1024 * 1024;
    function evict() {
      while (entries.size > (limit || 256) || bytes > byteLimit) {
        var key = Array.from(entries.keys()).find(function (candidate) { return !pinned.has(candidate); });
        // Pins are preferences, never permission to exceed the memory budget.
        if (key === undefined) key = entries.keys().next().value;
        bytes -= sizes.get(key) || 0;
        sizes.delete(key); entries.delete(key);
      }
    }
    this.get = function (key, factory) {
      if (entries.has(key)) {
        var cached = entries.get(key);
        entries.delete(key); entries.set(key, cached);
        return cached;
      }
      var current = generation;
      var promise = Promise.resolve().then(factory).then(function (frame) {
        if (current === generation && entries.get(key) === promise) {
          var image = frame && (frame.image || frame);
          var size = image ? (image.width || 0) * (image.height || 0) * 4 : 0;
          sizes.set(key, size); bytes += size; evict();
        }
        return frame;
      }).catch(function (error) {
        if (current === generation && entries.get(key) === promise) entries.delete(key);
        throw error;
      });
      entries.set(key, promise);
      evict();
      return promise;
    };
    this.stats = function () { return { entries: entries.size, bytes: bytes, byteLimit: byteLimit }; };
    this.pin = function (keys) { pinned = new Set(keys); evict(); };
    this.clear = function () { generation++; entries.clear(); sizes.clear(); pinned.clear(); bytes = 0; };
    this.prime = async function (keys, factory, progress, cancelled) {
      var cursor = 0, done = 0;
      var self = this;
      async function worker() {
        while (cursor < keys.length && !cancelled()) {
          var key = keys[cursor++];
          await self.get(key, function () { return factory(key); });
          if (cancelled()) return;
          progress(++done, keys.length);
        }
      }
      await Promise.all([worker(), worker(), worker()]);
    };
  };
  Orion.FrameBuffer.decode = async function (url, signal) {
    var boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    var response = await fetch(url, { signal: boundedSignal });
    if (!response.ok) throw new Error('Frame returned HTTP ' + response.status);
    var blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Provider did not return an image');
    var image = new Image(), objectUrl = URL.createObjectURL(blob);
    try {
      image.src = objectUrl;
      await image.decode();
      return image;
    } finally { URL.revokeObjectURL(objectUrl); }
  };
  // Standard Cesium imagery provider interface; image is already decoded before use.
  // Cesium 1.141 has no public per-layer texture-ready event. Isolate its pinned
  // imagery-cache readiness check here; browser tests verify the upload contract.
  Orion.FrameBuffer.uploaded = function (layer) {
    var tiles = Object.values(layer._imageryCache || {});
    return tiles.length > 0 && tiles.every(function (tile) { return tile.state === 4 && !!(tile.texture || tile.textureWebMercator); });
  };
  // A GPU texture can be ready before Cesium has attached it to the terrain
  // selected for this view. Check both before retiring the preceding frame.
  Orion.FrameBuffer.visibleReady = function (layer, globe) {
    if (!Orion.FrameBuffer.uploaded(layer)) return false;
    var tiles = globe._surface && globe._surface._tilesToRender;
    if (!tiles || !tiles.length) return false;
    var rectangle = layer.imageryProvider.rectangle;
    return tiles.every(function (tile) {
      if (!window.Cesium.Rectangle.intersection(tile.rectangle, rectangle)) return true;
      var imagery = tile.data && tile.data.imagery || [];
      var matches = imagery.filter(function (item) {
        return (item.readyImagery && item.readyImagery.imageryLayer === layer) ||
          (item.loadingImagery && item.loadingImagery.imageryLayer === layer);
      });
      return matches.length > 0 && matches.every(function (item) {
        return item.readyImagery && item.readyImagery.imageryLayer === layer &&
          !!(item.readyImagery.texture || item.readyImagery.textureWebMercator);
      });
    });
  };
  Orion.FrameBuffer.provider = function (image, rectangle, credit) {
    var C = window.Cesium;
    return {
      orionBufferedImage: true,
      tileWidth: image.width || 2048, tileHeight: image.height || 1024, minimumLevel: 0, maximumLevel: 0,
      rectangle: rectangle, tilingScheme: new C.GeographicTilingScheme({ rectangle: rectangle, numberOfLevelZeroTilesX: 1, numberOfLevelZeroTilesY: 1 }),
      errorEvent: new C.Event(), credit: new C.Credit(credit), hasAlphaChannel: true,
      requestImage: function () { return Promise.resolve(image); }, getTileCredits: function () { return undefined; }, pickFeatures: function () { return undefined; }
    };
  };
})(window);
