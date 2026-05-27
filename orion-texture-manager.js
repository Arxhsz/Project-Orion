(function(window) {
  'use strict';
  
  var Orion = window.Orion;
  var textureCache = {};
  var pendingLoads = {};
  var MAX_DIMENSION = 2048;
  var MIN_DIMENSION = 1;  function validateImage(img) {
    if (!img) return false;
    if (img.tagName === 'CANVAS') {
      return img.width >= MIN_DIMENSION && img.height >= MIN_DIMENSION && 
             img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION;
    }
    return img.complete && (img.naturalWidth || img.width) >= MIN_DIMENSION;
  }  function canvasToDataURL(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return null;
    if (canvas.width > MAX_DIMENSION || canvas.height > MAX_DIMENSION) return null;
    
    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      console.error("[OrionTexture] Failed to convert canvas:", e);
      return null;
    }
  }  function preloadImage(src, key) {
    return new Promise(function(resolve, reject) {
      var cacheKey = key || src;
      if (textureCache[cacheKey]) {
        resolve(textureCache[cacheKey]);
        return;
      }
      
      if (pendingLoads[cacheKey]) {
        pendingLoads[cacheKey].push({ resolve: resolve, reject: reject });
        return;
      }
      
      pendingLoads[cacheKey] = [{ resolve: resolve, reject: reject }];
      
      var img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = function() {
        if (!validateImage(img)) {
          console.warn("[OrionTexture] Invalid image state:", src);
          var callbacks = pendingLoads[cacheKey];
          delete pendingLoads[cacheKey];
          callbacks.forEach(function(cb) { cb.reject(new Error("Invalid image")); });
          return;
        }
        
        textureCache[cacheKey] = img;
        var callbacks = pendingLoads[cacheKey];
        delete pendingLoads[cacheKey];
        callbacks.forEach(function(cb) { cb.resolve(img); });

        if (Orion && Orion.Diagnostics && Orion.Diagnostics.Performance) {
           Orion.Diagnostics.Performance.update({ textures: Object.keys(textureCache).length });
        }
      };
      
      img.onerror = function() {
        var callbacks = pendingLoads[cacheKey];
        delete pendingLoads[cacheKey];
        callbacks.forEach(function(cb) { cb.reject(new Error("Load failed")); });
      };
      
      img.src = src;
    });
  }

  function initIcons() {
    var svgIcons = {
      'camera-online': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72'><circle cx='36' cy='36' r='26' fill='rgba(5,7,12,.78)' stroke='rgba(255,255,255,.46)' stroke-width='2.5'/><path d='M22 31h28v17H22z' fill='rgba(255,255,255,.9)'/><path d='M50 35 61 30v19l-11-5z' fill='rgba(255,255,255,.72)'/><circle cx='35' cy='39' r='5.5' fill='rgba(5,7,12,.9)'/><path d='M25 31 30 24h17l5 7' fill='none' stroke='rgba(255,255,255,.82)' stroke-width='3' stroke-linecap='round'/></svg>",
      'camera-selected': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 72'><circle cx='36' cy='36' r='26' fill='rgba(5,7,12,.78)' stroke='rgba(255,255,255,.92)' stroke-width='2.5'/><path d='M22 31h28v17H22z' fill='rgba(255,255,255,.9)'/><path d='M50 35 61 30v19l-11-5z' fill='rgba(255,255,255,.72)'/><circle cx='35' cy='39' r='5.5' fill='rgba(5,7,12,.9)'/><path d='M25 31 30 24h17l5 7' fill='none' stroke='rgba(255,255,255,.82)' stroke-width='3' stroke-linecap='round'/><circle cx='36' cy='36' r='32' fill='none' stroke='white' stroke-opacity='.28' stroke-width='2'/></svg>",
      'fallback': "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='8' fill='white'/></svg>",
      'cluster-small': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 92 92'><circle cx='46' cy='46' r='24' fill='rgba(5,7,12,.86)' stroke='rgba(255,255,255,.82)' stroke-width='2'/></svg>",
      'cluster-medium': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 92 92'><circle cx='46' cy='46' r='30' fill='rgba(5,7,12,.86)' stroke='rgba(255,255,255,.82)' stroke-width='2'/></svg>",
      'cluster-large': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 92 92'><circle cx='46' cy='46' r='36' fill='rgba(5,7,12,.86)' stroke='rgba(255,255,255,.82)' stroke-width='2.5'/></svg>",
      'cluster-xlarge': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 92 92'><circle cx='46' cy='46' r='42' fill='rgba(5,7,12,.86)' stroke='rgba(255,255,255,.82)' stroke-width='3'/></svg>",
      'soft-dot': "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='28' fill='rgba(255,255,255,0.12)'/><circle cx='32' cy='32' r='10' fill='white' stroke='rgba(5,7,12,0.8)' stroke-width='3'/><circle cx='32' cy='32' r='14' fill='none' stroke='white' stroke-opacity='0.4' stroke-width='2'/></svg>",
      'bloom-soft': "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><radialGradient id='bgrad' cx='50%' cy='50%' r='50%' fx='50%' fy='50%'><stop offset='0%' stop-color='white' stop-opacity='0.4'/><stop offset='20%' stop-color='white' stop-opacity='0.15'/><stop offset='100%' stop-color='white' stop-opacity='0'/></radialGradient><circle cx='64' cy='64' r='60' fill='url(#bgrad)'/></svg>",
      'packet-pulse': "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><circle cx='16' cy='16' r='14' fill='rgba(255,255,255,0.1)'/><circle cx='16' cy='16' r='6' fill='white'/></svg>",
      'smoke-sheet': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><radialGradient id='grad' cx='50%' cy='50%' r='50%' fx='50%' fy='50%'><stop offset='0%' stop-color='white' stop-opacity='0.25'/><stop offset='40%' stop-color='white' stop-opacity='0.1'/><stop offset='100%' stop-color='white' stop-opacity='0'/></radialGradient><circle cx='64' cy='64' r='60' fill='url(#grad)'/><ellipse cx='64' cy='64' rx='50' ry='30' fill='url(#grad)' transform='rotate(45 64 64)' opacity='0.5'/><ellipse cx='64' cy='64' rx='30' ry='50' fill='url(#grad)' transform='rotate(-30 64 64)' opacity='0.5'/></svg>",
      'earthquake-wave': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><circle cx='48' cy='48' r='40' fill='none' stroke='white' stroke-width='4' stroke-opacity='0.6'><animate attributeName='r' from='2' to='40' dur='1.5s' repeatCount='indefinite' /><animate attributeName='stroke-opacity' from='1' to='0' dur='1.5s' repeatCount='indefinite' /></circle><circle cx='48' cy='48' r='20' fill='none' stroke='white' stroke-width='3' stroke-opacity='0.4'><animate attributeName='r' from='2' to='30' dur='1.5s' begin='0.5s' repeatCount='indefinite' /><animate attributeName='stroke-opacity' from='0.8' to='0' dur='1.5s' begin='0.5s' repeatCount='indefinite' /></circle><circle cx='48' cy='48' r='8' fill='white' stroke='#000' stroke-width='2'/></svg>",
      'pulse': "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='31' fill='rgba(255,255,255,0.16)'/><circle cx='32' cy='32' r='12' fill='white' stroke='rgba(5,7,12,0.8)' stroke-width='3'/><circle cx='32' cy='32' r='18' fill='none' stroke='white' stroke-opacity='0.5' stroke-width='2'/></svg>",

      'target': "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='8' fill='none' stroke='white' stroke-width='2'/><path d='M32 18 V26 M32 38 V46 M18 32 H26 M38 32 H46' stroke='white' stroke-width='2' stroke-linecap='round'/></svg>"
    };

    Object.keys(svgIcons).forEach(function(key) {
      var dataUri = "data:image/svg+xml;base64," + window.btoa(unescape(encodeURIComponent(svgIcons[key])));
      preloadImage(dataUri, key);
    });
  }

  var STATIC_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";  function getIcon(key) {
    return textureCache[key] || textureCache['fallback'] || STATIC_PIXEL;
  }  function assignBillboardImage(target, imageSource) {
    if (!target) return false;
    
    var billboard = target.billboard || target;
    if (!billboard || typeof billboard.image === 'undefined') {
      return false;
    }
    
    if (typeof imageSource === 'string') {
      if (textureCache[imageSource]) {
        billboard.image = textureCache[imageSource];
        return true;
      }
      
      if (imageSource.startsWith('data:')) {
        preloadImage(imageSource).then(function(img) {
          billboard.image = img;
        });
        return true;
      }

      preloadImage(imageSource).then(function(img) {
        billboard.image = img;
      });
      return false;
    }
    
    if (validateImage(imageSource)) {
      billboard.image = imageSource;
      return true;
    }
    
    billboard.image = getIcon('fallback');
    return false;
  }  function createSafeCanvas(width, height) {
    if (width <= 0 || height <= 0) return null;
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
    if (!ctx) return null;
    ctx.clearRect(0, 0, width, height);
    return { canvas: canvas, ctx: ctx };
  }

  initIcons();

  if (Orion) {
    console.log("[OrionTexture] Attaching to Orion.Renderer");
    Orion.Renderer.TextureManager = {
      getIcon: getIcon,
      preloadImage: preloadImage,
      assignBillboardImage: assignBillboardImage,
      safeSetBillboardImage: assignBillboardImage, // Alias
      createSafeCanvas: createSafeCanvas,
      canvasToDataURL: canvasToDataURL,
      validateImage: validateImage,
      getCacheStats: function() {
        return { cached: Object.keys(textureCache).length, pending: Object.keys(pendingLoads).length };
      }
    };
    console.log("[OrionTexture] Attached. Renderer keys:", Object.keys(Orion.Renderer));
  }

  window.OrionTextureManager = Orion ? Orion.Renderer.TextureManager : {
    getIcon: getIcon,
    preloadImage: preloadImage,
    assignBillboardImage: assignBillboardImage,
    safeSetBillboardImage: assignBillboardImage,
    createSafeCanvas: createSafeCanvas,
    canvasToDataURL: canvasToDataURL,
    validateImage: validateImage,
    getCacheStats: function() {
      return { cached: Object.keys(textureCache).length, pending: Object.keys(pendingLoads).length };
    }
  };
  
  console.log("[OrionTexture] V2.0.2 Integrated into Orion.Renderer");
})(window);

