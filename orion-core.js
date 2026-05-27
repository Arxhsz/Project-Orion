(function(window) {
  'use strict';

  console.log('[Orion.Core] Loading...');

  var Orion = window.Orion || {
    Runtime: {},
    Renderer: {},
    Telemetry: {},
    Intelligence: {},
    Interaction: {},
    Environment: {},
    Infrastructure: {},
    Diagnostics: {},
    Replay: {},
    Session: {}
  };

  Orion.Runtime.EventBus = {
    listeners: {},
    
    on: function(event, callback) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    
    emit: function(event, data) {
      if (!this.listeners[event]) return;
      this.listeners[event].forEach(function(callback) {
        try { callback(data); } catch (e) { console.error('[EventBus] Callback error:', e); }
      });
    }
  };

  Orion.Runtime.RenderScheduler = {
    frameActive: false,
    tasks: [],
    
    init: function() {
      console.log('[Orion.Runtime.RenderScheduler] Active');
    },
    
    schedule: function(task) {
      this.tasks.push(task);
    },
    
    execute: function() {
      this.tasks.forEach(function(t) { try { t(); } catch (e) {} });
      this.tasks = [];
    }
  };

  Orion.Runtime.Utils = {
    getCompassDirection: function(degrees) {
      var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      return directions[Math.round(degrees / 45) % 8];
    },
    
    formatAltitude: function(meters) {
      if (!Number.isFinite(meters)) return "--";
      if (meters >= 1000000) return (meters / 1000000).toFixed(2) + " Mm";
      if (meters >= 1000) return Math.round(meters / 1000).toLocaleString() + " km";
      return Math.round(meters).toLocaleString() + " m";
    }
  };

  Orion.Runtime.DeploymentProfiles = {
    active: 'balanced',
    profiles: {
      cinematic: { 
        volumetricSheets: 18, lightningSegments: 30, refreshFactor: 1.0, 
        renderDistance: 1.0, animationIntensity: 1.0, textureQuality: 'high' 
      },
      balanced: { 
        volumetricSheets: 12, lightningSegments: 18, refreshFactor: 1.0, 
        renderDistance: 0.8, animationIntensity: 0.8, textureQuality: 'medium' 
      },
      operational: { 
        volumetricSheets: 8, lightningSegments: 12, refreshFactor: 1.5, 
        renderDistance: 0.6, animationIntensity: 0.6, textureQuality: 'medium' 
      },
      laptop: { 
        volumetricSheets: 4, lightningSegments: 8, refreshFactor: 2.0, 
        renderDistance: 0.4, animationIntensity: 0.4, textureQuality: 'low' 
      },
      lowbandwidth: { 
        volumetricSheets: 2, lightningSegments: 4, refreshFactor: 4.0, 
        renderDistance: 0.2, animationIntensity: 0.2, textureQuality: 'low' 
      }
    },
    
    apply: function(id) {
      if (!this.profiles[id]) return;
      this.active = id;
      console.log('[Orion.Runtime.DeploymentProfiles] Profile active:', id);
      Orion.Runtime.EventBus.emit('profile:changed', { profile: id });
    },
    
    get: function() { return this.profiles[this.active]; }
  };

  Orion.Runtime.validateBoot = function() {
    console.log('[Orion.Runtime] Initiating boot integrity check...');
    var required = [
      { path: 'Runtime.EventBus', type: 'object' },
      { path: 'Runtime.RenderScheduler', type: 'object' },
      { path: 'Runtime.StateManager', type: 'object' },
      { path: 'Runtime.PerformanceBudget', type: 'object' },
      { path: 'Telemetry.ProviderHealth', type: 'object' },
      { path: 'Diagnostics.SystemMonitor', type: 'object' },
      { path: 'Intelligence.VisualCohesion', type: 'object' },
      { path: 'Renderer.TextureManager', type: 'object' },
      { path: 'Telemetry.CameraNet', type: 'object' }
    ];

    var failures = [];
    required.forEach(function(m) {
      var parts = m.path.split('.');
      var current = Orion;
      for (var i = 0; i < parts.length; i++) {
        if (!current[parts[i]]) {
          failures.push(m.path + ' (missing at ' + parts[i] + ')');
          console.warn('[Orion.Runtime.validateBoot] Failed to find ' + m.path + '. Current keys at ' + (i>0?parts[i-1]:'root') + ':', Object.keys(current));
          return;
        }
        current = current[parts[i]];
      }
      if (m.type && typeof current !== m.type) {
        failures.push(m.path + ' (wrong type: expected ' + m.type + ')');
      }
    });

    if (failures.length > 0) {
      console.error('[Orion.Runtime] BOOT INTEGRITY FAILED:', failures);
      console.warn('[Orion.Runtime] System operating in DEGRADED mode.');
      window.OrionBootStatus = 'DEGRADED';
    } else {
      console.log('[Orion.Runtime] Boot integrity verified. All core modules online.');
      window.OrionBootStatus = 'OK';
    }

    var rendererSubmodules = ['Orbital', 'Infrastructure', 'Environment', 'RFHeatmap', 'Maritime', 'Aviation', 'Cameras', 'Atmosphere', 'Effects'];
    rendererSubmodules.forEach(function(sub) {
      if (!Orion.Renderer[sub]) {
        Orion.Renderer[sub] = { 
          init: function() { console.warn('[Orion.Renderer.' + sub + '] Placeholder init called (module not yet modularized)'); },
          update: function() {}
        };
      }
    });

    if (!Orion.Replay.init) {
      Orion.Replay.init = function() { console.warn('[Orion.Replay] Placeholder init called'); };
    }
    if (!Orion.Session.restore) {
      Orion.Session.restore = function() { console.warn('[Orion.Session] Placeholder restore called'); };
    }

    return window.OrionBootStatus === 'OK';
  };

  window.Orion = Orion;

})(window);
