(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Renderer = Orion.Renderer || {};

  Orion.Renderer.Imagery = {
    activeBaseLayer: null,
    activeOverlays: {},
    transitionToken: 0,
    
    Categories: {
      BASE: ['trueColor', 'cleanEarth', 'sentinel', 'night', 'thermal', 'terrain', 'street'],
      OVERLAY: ['radar', 'clouds', 'wind', 'pressure', 'labels', 'boundaries', 'roads']
    },
    
    init: function(viewer) {
      this.viewer = viewer;
      console.log('[Orion.Renderer.Imagery] Initialized');
    },
    setBaseLayer: function(layerId, date) {
      if (!this.Categories.BASE.includes(layerId)) {
        console.warn('[Orion.Renderer.Imagery] Invalid base layer:', layerId);
        return;
      }
      
      var self = this;
      var viewer = this.viewer;
      var definition = Orion.Config.LayerDefinitions[layerId];
      if (!definition) return;
      
      this.transitionToken++;
      var currentToken = this.transitionToken;
      
      var newLayer = this.createLayer(layerId, date);
      newLayer.alpha = 0;
      
      var oldLayer = this.activeBaseLayer;
      this.activeBaseLayer = newLayer;
      
      var startTime = performance.now();
      var duration = 250;
      
      function animateFade(time) {
        if (currentToken !== self.transitionToken) return;
        
        var elapsed = time - startTime;
        var progress = Math.min(elapsed / duration, 1.0);
        
        var ease = progress < 0.5 ? 16 * progress * progress * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 5) / 2;
        
        newLayer.alpha = ease * (definition.alpha || 1.0);
        if (oldLayer) {
          var oldDef = Orion.Config.LayerDefinitions[oldLayer.orionKey];
          oldLayer.alpha = (1.0 - ease) * (oldDef ? oldDef.alpha : 1.0);
        }
        
        if (progress < 1.0) {
          requestAnimationFrame(animateFade);
        } else {
          if (oldLayer) viewer.imageryLayers.remove(oldLayer);
          newLayer.alpha = definition.alpha || 1.0;
        }
      }
      
      requestAnimationFrame(animateFade);
    },
    setOverlayEnabled: function(layerId, enabled, date) {
      if (!this.Categories.OVERLAY.includes(layerId)) {
        console.warn('[Orion.Renderer.Imagery] Invalid overlay layer:', layerId);
        return;
      }
      
      var viewer = this.viewer;
      if (enabled) {
        if (this.activeOverlays[layerId]) return;
        
        var layer = this.createLayer(layerId, date);
        var def = Orion.Config.LayerDefinitions[layerId];
        layer.alpha = 0;
        this.activeOverlays[layerId] = layer;
        
        this.fadeLayer(layer, def.alpha || 1.0, 250);
      } else {
        var layer = this.activeOverlays[layerId];
        if (!layer) return;
        
        this.fadeLayer(layer, 0, 250, function() {
          viewer.imageryLayers.remove(layer);
        });
        delete this.activeOverlays[layerId];
      }
    },
    
    createLayer: function(key, date) {
      var definition = Orion.Config.LayerDefinitions[key];
      if (!definition) return null;
      
      var layer = this.viewer.imageryLayers.addImageryProvider(this.createProvider(definition, date));
      layer.orionKey = key;
      layer.brightness = definition.brightness || 1.0;
      layer.contrast = definition.contrast || 1.0;
      layer.saturation = definition.saturation || 1.0;
      return layer;
    },
    
    createProvider: function(definition, date) {
      var tileDate = definition.timed ? this.effectiveGibsDate(date) : date;
      var timeSegment = definition.timed ? this.formatDate(tileDate) : "default";
      var url = [
        Orion.Config.Constants.GIBS_ROOT,
        definition.layer,
        "default",
        timeSegment,
        definition.matrixSet,
        "{z}",
        "{y}",
        "{x}." + definition.extension
      ].join("/");

      return new Cesium.UrlTemplateImageryProvider({
        url: url,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: definition.maximumLevel,
        credit: "NASA GIBS"
      });
    },
    
    fadeLayer: function(layer, targetAlpha, duration, onComplete) {
      var startAlpha = layer.alpha;
      var startTime = performance.now();
      
      function animate() {
        var elapsed = performance.now() - startTime;
        var progress = Math.min(elapsed / duration, 1.0);
        layer.alpha = startAlpha + (targetAlpha - startAlpha) * progress;
        
        if (progress < 1.0) {
          requestAnimationFrame(animate);
        } else if (onComplete) {
          onComplete();
        }
      }
      requestAnimationFrame(animate);
    },
    
    formatDate: function(date) {
      return date.toISOString().split("T")[0];
    },
    
    effectiveGibsDate: function(date) {
      var d = new Date(date);
      d.setUTCDate(d.getUTCDate() - Orion.Config.Constants.GIBS_IMAGERY_LAG_DAYS);
      return d;
    },
    updatePredictiveStreaming: function() {
    }
  };

  window.Orion = Orion;

})(window);
