(function(window) {
  'use strict';

  var Orion = window.Orion || {};

  Orion.Diagnostics.SystemMonitor = {
    active: false,
    container: null,
    fps: 0,
    frameCount: 0,
    lastFpsUpdate: performance.now(),
    
    init: function() {
      var self = this;
      window.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
          self.toggle();
        }
      });
      console.log('[Orion.Diagnostics] Initialized. CTRL+SHIFT+D to toggle.');
      console.log('[Orion.Verification] Run Orion.Runtime.VerificationSuite.runAll() to certify build.');
    },
    
    toggle: function() {
      this.active = !this.active;
      if (this.active) this.show();
      else this.hide();
    },
    
    show: function() {
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'orion-diagnostics';
        this.container.style.cssText = 'position:fixed; top:10px; right:10px; background:rgba(0,10,20,0.85); color:#00f0ff; font-family:monospace; font-size:11px; padding:12px; border:1px solid #004050; border-radius:4px; z-index:9999; pointer-events:none; box-shadow:0 0 20px rgba(0,0,0,0.5); width:240px;';
        document.body.appendChild(this.container);
      }
      this.container.style.display = 'block';
      this.updateLoop();
    },
    
    hide: function() {
      if (this.container) this.container.style.display = 'none';
    },
    
    updateFPS: function() {
      var now = performance.now();
      this.frameCount++;
      if (now - this.lastFpsUpdate > 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }
    },
    
    updateLoop: function() {
      if (!this.active) return;
      
      var metrics = Orion.Runtime.PerformanceBudget.getCurrentMetrics();
      var pressure = Orion.Runtime.PerformanceBudget.enforce();
      var memory = (window.performance && window.performance.memory) ? 
                   Math.round(window.performance.memory.usedJSHeapSize / 1048576) + 'MB' : 'N/A';
      
      var providerHealthTracker = Orion.Telemetry.ProviderHealth;
      var staleProviders = providerHealthTracker.getAllStats().filter(function(s) { return s.health !== 'online'; }).length;
      
      var html = '<div style="font-weight:bold; border-bottom:1px solid #004050; margin-bottom:8px; padding-bottom:4px; color:#fff;">ORION DIAGNOSTICS</div>';
      
      var tension = (Orion.Intelligence && Orion.Intelligence.CognitiveOperations) ? Orion.Intelligence.CognitiveOperations.tension : 0;
      var cognitiveLoad = (Orion.Intelligence && Orion.Intelligence.CognitiveGovernance) ? Orion.Intelligence.CognitiveGovernance.cognitiveLoad.score : 0;
      var stateLabel = tension > 0.7 ? '<span style="color:#ff3b30;">CRITICAL</span>' : 
                       tension > 0.3 ? '<span style="color:#ffcc00;">TENSE</span>' : 
                       '<span style="color:#00ff00;">CALM</span>';
      html += 'PLANETARY STATE: ' + stateLabel + '<br>';
      html += 'COGNITIVE LOAD: ' + (cognitiveLoad * 100).toFixed(1) + '%<br>';

      if (Orion.Intelligence && Orion.Intelligence.OperationalNarrative && Orion.Intelligence.OperationalNarrative.narratives.length > 0) {
        html += '<div style="background:rgba(0,40,60,0.6); padding:6px; margin-bottom:8px; border-left:2px solid #00f0ff;">';
        Orion.Intelligence.OperationalNarrative.narratives.forEach(function(n) {
          html += '<span style="color:#00f0ff;">⚡ ' + n.text + '</span><br>';
        });
        html += '</div>';
      }

      if (Orion.Intelligence && Orion.Intelligence.CognitiveOperations && Orion.Intelligence.CognitiveOperations.suggestions.length > 0) {
        html += '<div style="background:rgba(60,40,0,0.6); padding:6px; margin-bottom:8px; border-left:2px solid #ffcc00;">';
        Orion.Intelligence.CognitiveOperations.suggestions.forEach(function(s) {
          html += '<span style="color:#ffcc00;">💡 ' + s.text + '</span><br>';
        });
        html += '</div>';
      }

      html += 'FPS: <span style="color:' + (this.fps > 45 ? '#00ff00' : this.fps > 25 ? '#ffff00' : '#ff0000') + '">' + this.fps + '</span><br>';
      html += 'MEMORY: ' + memory + '<br>';
      html += 'PRESSURE: ' + (pressure * 100).toFixed(1) + '%<br>';
      html += '<div style="margin-top:8px; color:#aaa;">RENDER METRICS</div>';
      html += 'BILLBOARDS: ' + metrics.billboards + '<br>';
      html += 'POINTS: ' + metrics.points + '<br>';
      html += 'POLYLINES: ' + metrics.polylines + '<br>';
      html += 'ENTITIES: ' + metrics.entities + '<br>';
      html += '<div style="margin-top:8px; color:#aaa;">SYSTEM STATE</div>';
      html += 'LOD LEVEL: ' + Orion.Runtime.StateManager.lodLevel + '<br>';
      html += 'STALE PROVIDERS: ' + staleProviders + '<br>';
      var viewer = window.viewer;
      html += 'VIEW HEIGHT: ' + (viewer ? (viewer.camera.positionCartographic.height / 1000).toFixed(0) : 0) + 'km<br>';
      
      this.container.innerHTML = html;
      requestAnimationFrame(this.updateLoop.bind(this));
    }
  };

  Orion.Diagnostics.Hardening = {
    testInterval: null,
    simulationActive: false,
    
    init: function() {
      console.log('[Orion.Diagnostics.Hardening] Ready.');
    },
    
    runStressTest: function() {
      var self = this;
      if (this.testInterval) return;
      if (typeof window.showToast === 'function') window.showToast("STRESS TEST INITIATED");
      
      var targets = ['starlink', 'realtimeSatellites', 'debris', 'liveShips', 'liveAircraft', 'cyberNetwork', 'lightning', 'wildfires'];
      var stateManager = Orion.Runtime.StateManager;
      
      targets.forEach(function(l) {
        if (Orion.Config.PlatformLayerDefinitions[l]) {
            if (typeof window.setPlatformLayer === 'function') window.setPlatformLayer(l, true);
        }
      });
      
      var startTime = Date.now();
      var viewer = window.viewer;
      this.testInterval = setInterval(function() {
        if (Date.now() - startTime > 60000) {
          self.stopTest();
          return;
        }
        if (viewer) {
          var lat = 37.7749 + (Math.random() - 0.5) * 40;
          var lon = -122.4194 + (Math.random() - 0.5) * 80;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500000 + Math.random() * 5000000),
            duration: 0.4
          });
        }
        if (Math.random() > 0.7 && typeof window.setPlatformLayer === 'function') {
          var randomLayer = targets[Math.floor(Math.random() * targets.length)];
          window.setPlatformLayer(randomLayer, true); 
        }
      }, 800);
    },
    
    stopTest: function() {
      if (this.testInterval) {
        clearInterval(this.testInterval);
        this.testInterval = null;
        if (typeof window.showToast === 'function') window.showToast("STRESS TEST COMPLETE");
      }
    },
    
    simulateNetworkChaos: function() {
      this.simulationActive = !this.simulationActive;
      if (typeof window.showToast === 'function') window.showToast("NETWORK CHAOS: " + (this.simulationActive ? "ON" : "OFF"));
    }
  };

  Orion.Diagnostics.Stability = {
    history: [],
    startTime: Date.now(),
    lastLongHaulLog: 0,
    monitorInterval: null,
    lastMemoryWarning: 0,
    lastPrimitiveWarning: 0,
    warningCooldownMs: 5 * 60 * 1000,
    leakThresholds: {
      memory: 250 * 1048576,
      primitives: 100,
      billboards: 500
    },

    init: function() {
      if (this.monitorInterval) {
        return;
      }

      console.log('[Orion.Diagnostics.Stability] Long-haul monitor active.');
      this.history = [this.sample()];
      this.lastLongHaulLog = Date.now();
      
      var self = this;
      this.monitorInterval = setInterval(function() {
        self.update();
      }, 60000);
    },

    sample: function() {
      var viewer = window.viewer;
      var metrics = Orion.Runtime.PerformanceBudget ? Orion.Runtime.PerformanceBudget.getCurrentMetrics() : {};
      return {
        t: Date.now() - this.startTime,
        mem: (window.performance && window.performance.memory) ? window.performance.memory.usedJSHeapSize : 0,
        primitives: viewer ? viewer.scene.primitives.length : 0,
        billboards: metrics.billboards || 0,
        points: metrics.points || 0,
        entities: metrics.entities || 0,
        ts: Date.now()
      };
    },

    update: function() {
      var now = Date.now();
      var current = this.sample();
      this.history.push(current);
      
      if (this.history.length > 1440) this.history.shift();

      if (now - this.lastLongHaulLog > 300000) {
        this.logLongHaul(current);
        this.lastLongHaulLog = now;
      }

      this.checkLeaks(current);
    },

    logLongHaul: function(current) {
      var elapsedH = (Date.now() - this.startTime) / 3600000;
      var sysMon = Orion.Diagnostics.SystemMonitor;
      var stateManager = Orion.Runtime.StateManager;
      
      console.log('--- LONG-HAUL STABILITY REPORT (' + elapsedH.toFixed(2) + 'h) ---');
      console.log('FPS Avg:', sysMon ? sysMon.fps : 'N/A');
      console.log('Heap Size:', (current.mem / 1048576).toFixed(1), 'MB');
      console.log('Primitives:', current.primitives, '(Points:', current.points, 'Billboards:', current.billboards, ')');
      console.log('Active Layers:', stateManager ? stateManager.getEnabledLayers().join(', ') : 'N/A');
      
      if (Orion.Telemetry.ProviderHealth) {
          var health = Orion.Telemetry.ProviderHealth.getAllStats();
          var stale = health.filter(h => h.health !== 'online').length;
          console.log('Stale Providers:', stale, '/', health.length);
      }
      
      if (Orion.Renderer.Environment.SmokeSystem) {
          console.log('Smoke Sheets: Managed via Environment.SmokeSystem');
      }
      console.log('--------------------------------------------');
    },

    checkLeaks: function(current) {
      if (this.history.length < 10) return;
      
      var initial = this.history[0];
      var memGrowth = current.mem - initial.mem;
      var primGrowth = current.primitives - initial.primitives;
      
      if (memGrowth > this.leakThresholds.memory && current.ts - this.lastMemoryWarning > this.warningCooldownMs) {
        this.lastMemoryWarning = current.ts;
        console.warn('[Stability] High memory growth detected:', Math.round(memGrowth / 1048576), 'MB');
      }
      
      if (primGrowth > this.leakThresholds.primitives && current.ts - this.lastPrimitiveWarning > this.warningCooldownMs) {
        this.lastPrimitiveWarning = current.ts;
        console.warn('[Stability] Potential primitive leak detected:', primGrowth, 'orphans');
        this.detectOrphanPrimitives();
      }
    },

    detectOrphanPrimitives: function() {
      var viewer = window.viewer;
      if (!viewer) return;
      
      var orphans = 0;
      var primitives = viewer.scene.primitives;
      for (var i = 0; i < primitives.length; i++) {
        var p = primitives.get(i);
        if (!p._orionManaged && !p.id && !p.orionKey) {
          orphans++;
        }
      }
      if (orphans > 0) console.log('[Stability] Detected', orphans, 'unlabeled/potential orphan primitives');
    },

    getSummary: function() {
      var current = this.sample();
      var initial = this.history[0];
      var elapsedH = (Date.now() - this.startTime) / 3600000;
      
      return {
        runtimeH: elapsedH.toFixed(2),
        samples: this.history.length,
        memGrowthMB: ((current.mem - initial.mem) / 1048576).toFixed(1),
        primGrowth: current.primitives - initial.primitives,
        health: (current.mem - initial.mem) < this.leakThresholds.memory ? 'STABLE' : 'DEGRADED'
      };
    }
  };

  window.Orion = Orion;

})(window);
