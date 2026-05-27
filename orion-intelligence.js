(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Intelligence = Orion.Intelligence || {};

  Orion.Intelligence.VisualCohesion = {
    config: {
      minOpacity: 0.15,
      maxOpacity: 0.95,
      orbitalAltitude: 2000000,
      closeAltitude: 50000
    },

    getAdaptiveAlpha: function(baseAlpha, layerId) {
      var viewer = window.viewer;
      if (!viewer) return baseAlpha;
      var height = viewer.camera.positionCartographic.height;

      var altitudeFactor = Math.max(0.4, Math.min(1.0, 1.0 - (height / 20000000)));

      var priority = this.getLayerPriority(layerId);
      var priorityFactor = (priority === 'high') ? 1.0 : (priority === 'medium') ? 0.8 : 0.6;

      var dimmingFactor = Orion.Intelligence.AdaptiveIntelligence.getGlobalDimming();
      var isEscalated = false;
      Object.keys(Orion.Intelligence.AdaptiveIntelligence.escalations).forEach(function(k) {
        if (Orion.Intelligence.AdaptiveIntelligence.escalations[k].source === layerId) isEscalated = true;
      });

      var finalDimming = isEscalated ? 1.0 : dimmingFactor;

      var modeFactor = Orion.Intelligence.AdaptiveIntelligence.getModeIntensity();
      
      var tension = Orion.Intelligence.CognitiveOperations.tension;
      
      var silenceFactor = (tension < 0.1) ? 0.85 : 1.0;
      
      var rhythmFactor = 1.0 + (Orion.Intelligence.OperationalNarrative.planetaryRhythm - 0.5) * (0.08 + tension * 0.12);

      return baseAlpha * altitudeFactor * priorityFactor * finalDimming * modeFactor * rhythmFactor * silenceFactor;
    },
    
    getLayerPriority: function(layerId) {
      var high = ['wildfires', 'earthquakes', 'lightning', 'emergencyIncidents'];
      var medium = ['realtimeSatellites', 'liveShips', 'liveAircraft', 'cameras'];
      if (high.indexOf(layerId) !== -1) return 'high';
      if (medium.indexOf(layerId) !== -1) return 'medium';
      return 'low';
    },

    getInterpolationFactor: function() {
      var viewer = window.viewer;
      if (!viewer) return 0.18;
      var height = viewer.camera.positionCartographic.height;
      var factor = 0.05 + (1.0 - Math.max(0, Math.min(1, height / 2000000))) * 0.2;
      return Math.max(0.05, Math.min(0.25, factor));
    },

    applyCinematicFocus: function(record, selected) {
      if (!record.entity) return;
      if (selected) {
        var time = performance.now() * 0.002;
        var pulse = 1.0 + Math.sin(time * 4) * 0.15;
        if (record.entity.billboard) record.entity.billboard.scale = (record.entity.orionBillboardBaseScale || 0.34) * 1.4 * pulse;
        if (record.entity.point) record.entity.point.pixelSize = (record.entity.orionPointBaseSize || 8) * 1.5 * pulse;
      }
      
      var weighting = this.getEventWeighting(record);
      if (weighting > 0.8 && !selected) {
        var time = performance.now() * 0.001;
        var glow = 0.8 + Math.sin(time * 2) * 0.2;
        if (record.entity.billboard) record.entity.billboard.color = record.entity.billboard.color.getValue().withAlpha(glow);
      }
    },

    getEventWeighting: function(record) {
      var item = record.item || {};
      var sample = record.sample || {};
      var baseWeight = 0;
      if (record.layerId === 'earthquakes') baseWeight = Math.max(0, Math.min(1, (sample.magnitude - 2.5) / 5.0));
      else if (record.layerId === 'wildfires') baseWeight = Math.max(0, Math.min(1, item.intensity || 0));
      else if (record.layerId === 'emergencyIncidents') {
        var sev = String(item.severity || "").toLowerCase();
        baseWeight = (sev === 'extreme') ? 1.0 : (sev === 'severe') ? 0.8 : 0.5;
      }
      if (Orion.Intelligence.OperationalNarrative.attentionMemory.indexOf(record.id) !== -1) baseWeight *= 0.5;
      return baseWeight;
    },

    getConfidenceScore: function(layerId) {
      var stats = Orion.Telemetry.ProviderHealth.getProviderInfo(layerId);
      if (!stats) return 1.0;
      var confidence = 1.0;
      if (stats.health === 'degraded') confidence -= 0.3;
      if (stats.health === 'offline') confidence -= 0.7;
      if (stats.lastSuccess) {
        var ageMin = (Date.now() - stats.lastSuccess) / 60000;
        if (ageMin > 10) confidence -= Math.min(0.5, (ageMin - 10) / 60);
      }
      return Math.max(0.1, Math.min(1.0, confidence));
    },

    getPredictiveFactor: function(layerId) {
      if (layerId === 'liveAircraft') return 15.0;
      if (layerId === 'liveShips') return 60.0;
      return 0;
    }
  };

  Orion.Intelligence.AdaptiveIntelligence = {
    escalations: {},
    activeContexts: [],
    
    init: function() {
      console.log('[Orion.Intelligence.AdaptiveIntelligence] Online.');
    },
    
    update: function() {
      this.evaluateContexts();
      this.evaluateEscalations();
    },
    
    evaluateContexts: function() {
      var contexts = [];
      var platformFeeds = window.platformFeeds || {};
      if (Orion.Runtime.StateManager.isLayerEnabled('volumetricWeather')) {
        var stormCount = (platformFeeds.volumetricWeather && platformFeeds.volumetricWeather.items) ? 
                         platformFeeds.volumetricWeather.items.length : 0;
        if (stormCount > 5) contexts.push('HEAVY_WEATHER');
      }
      if (Orion.Runtime.StateManager.isLayerEnabled('cyberNetwork')) {
        var arcCount = (platformFeeds.cyberNetwork && platformFeeds.cyberNetwork.items) ? 
                       platformFeeds.cyberNetwork.items.length : 0;
        if (arcCount > 50) contexts.push('CYBER_SURGE');
      }
      this.activeContexts = contexts;
    },
    
    evaluateEscalations: function() {
      var self = this;
      var newEscalations = {};
      var platformFeeds = window.platformFeeds || {};
      if (Orion.Runtime.StateManager.isLayerEnabled('earthquakes')) {
        var items = (platformFeeds.earthquakes && platformFeeds.earthquakes.items) || [];
        items.forEach(function(q) {
          if (q.magnitude >= 6.5) {
            newEscalations['QUAKE_' + q.id] = { type: 'MAJOR_EVENT', source: 'earthquakes', priority: 1.0, duration: 60000 };
          }
        });
      }
      
      if (Object.keys(newEscalations).length !== Object.keys(this.escalations).length) {
        Orion.Runtime.EventBus.emit('tension:changed', { tension: this.getGlobalDimming() });
      }
      
      this.escalations = newEscalations;
    },
    
    getGlobalDimming: function() {
      return Object.keys(this.escalations).length > 0 ? 0.4 : 1.0;
    },
    
    getModeIntensity: function() {
      var modes = { tactical: 1.0, environmental: 0.8, orbital: 0.7, infrastructure: 0.9, emergency: 1.2 };
      var scanMode = window.appState ? window.appState.scanMode : 'standard';
      return modes[scanMode] || 1.0;
    },
    
    isContextActive: function(contextId) {
      return this.activeContexts.indexOf(contextId) !== -1;
    }
  };

  Orion.Intelligence.OperationalNarrative = {
    narratives: [],
    missionContext: 'standard',
    attentionMemory: [],
    trends: {},
    planetaryRhythm: 0,
    
    init: function() {
      console.log('[Orion.Intelligence.OperationalNarrative] Online.');
    },
    
    update: function() {
      this.updatePlanetaryRhythm();
      this.evaluateTrends();
      this.generateNarratives();
    },
    
    updatePlanetaryRhythm: function() {
      this.planetaryRhythm = Math.sin(performance.now() * 0.0006) * 0.5 + 0.5;
    },
    
    evaluateTrends: function() {},
    
    generateNarratives: function() {
      var newNarratives = [];
      if (this.isContextActive('HEAVY_WEATHER') && Orion.Runtime.StateManager.isLayerEnabled('liveAircraft')) {
        var priority = 0.8;
        if (Orion.Intelligence.CognitiveGovernance.isSignificant(priority)) {
          newNarratives.push({ 
            text: "Elevated storm activity impacting regional flight corridors", 
            priority: priority,
            reason: Orion.Intelligence.CognitiveGovernance.getTrustReasoning('volumetricWeather')
          });
        }
      }
      if (this.isContextActive('CYBER_SURGE')) {
        var priority = 0.7;
        if (Orion.Intelligence.CognitiveGovernance.isSignificant(priority)) {
          newNarratives.push({ 
            text: "Anomalous cyber traffic detected near landing stations", 
            priority: priority,
            reason: Orion.Intelligence.CognitiveGovernance.getTrustReasoning('cyberNetwork')
          });
        }
      }
      this.narratives = newNarratives;
    },
    
    isContextActive: function(id) {
       return Orion.Intelligence.AdaptiveIntelligence.isContextActive(id);
    },

    setMissionContext: function(context) {
      this.missionContext = context;
      if (typeof window.showToast === 'function') window.showToast("MISSION CONTEXT: " + context.toUpperCase());
      Orion.Runtime.EventBus.emit('mission:changed', { context: context });
    },
    
    recordAttention: function(id) {
      if (this.attentionMemory.indexOf(id) === -1) {
        this.attentionMemory.unshift(id);
        if (this.attentionMemory.length > 5) this.attentionMemory.pop();
      }
    }
  };

  Orion.Intelligence.CognitiveOperations = {
    memory: { focusPatterns: {}, anomalyZones: {}, lastSession: null },
    tension: 0,
    suggestions: [],
    lastAlerts: {},
    
    init: function() {
      this.loadMemory();
      console.log('[Orion.Intelligence.CognitiveOperations] Online.');
    },
    
    update: function() {
      this.evaluateGlobalTension();
      this.generateAdaptiveGuidance();
      this.processAttentionDecay();
    },
    
    loadMemory: function() {
      try {
        var stored = localStorage.getItem('orion_cognitive_memory');
        if (stored) this.memory = JSON.parse(stored);
      } catch (e) {}
    },
    
    saveMemory: function() {
      try {
        localStorage.setItem('orion_cognitive_memory', JSON.stringify(this.memory));
      } catch (e) {}
    },
    
    evaluateGlobalTension: function() {
      var baseTension = Object.keys(Orion.Intelligence.AdaptiveIntelligence.escalations).length * 0.25;
      if (Orion.Intelligence.AdaptiveIntelligence.isContextActive('HEAVY_WEATHER')) baseTension += 0.2;
      if (Orion.Intelligence.AdaptiveIntelligence.isContextActive('CYBER_SURGE')) baseTension += 0.2;
      this.tension = Math.max(0, Math.min(1, baseTension));
    },
    
    generateAdaptiveGuidance: function() {
      var newSuggestions = [];
      if (Orion.Intelligence.AdaptiveIntelligence.isContextActive('CYBER_SURGE') && !Orion.Runtime.StateManager.isLayerEnabled('underseaCables')) {
        newSuggestions.push({ text: "Recommend: Undersea Cables (Related anomaly detect)", layerId: 'underseaCables' });
      }
      if (Orion.Intelligence.AdaptiveIntelligence.isContextActive('HEAVY_WEATHER') && !Orion.Runtime.StateManager.isLayerEnabled('liveAircraft')) {
        newSuggestions.push({ text: "Recommend: ADSB Aircraft (Correlated disruption risk)", layerId: 'liveAircraft' });
      }
      this.suggestions = newSuggestions;
    },
    
    processAttentionDecay: function() {
      if (Math.random() > 0.99 && this.memory.attentionMemory && this.memory.attentionMemory.length > 0) {
        this.memory.attentionMemory.pop();
      }
    }
  };

  Orion.Intelligence.CognitiveGovernance = {
    settings: {
      significanceThreshold: 0.4,
      escalationGracePeriod: 5000,
      trustTransparency: true,
      humanPrimacy: true,
      memoryHygieneDays: 30
    },
    cognitiveLoad: { score: 0, lastSwitch: 0, switchBurst: 0 },
    
    init: function() {
      console.log('[Orion.Intelligence.CognitiveGovernance] Online.');
    },
    
    update: function() {
      this.evaluateCognitiveLoad();
      this.performMemoryHygiene();
    },
    
    evaluateCognitiveLoad: function() {
      this.cognitiveLoad.score = Math.max(0, Math.min(1, this.cognitiveLoad.score - 0.0005));
      if (this.cognitiveLoad.score > 0.8) {
        Orion.Intelligence.AdaptiveIntelligence.escalations = {};
      }
    },
    
    recordInteraction: function() {
      var now = Date.now();
      if (now - this.cognitiveLoad.lastSwitch < 2000) {
        this.cognitiveLoad.switchBurst++;
        if (this.cognitiveLoad.switchBurst > 3) this.cognitiveLoad.score = Math.max(0, Math.min(1, this.cognitiveLoad.score + 0.15));
      } else this.cognitiveLoad.switchBurst = 0;
      this.cognitiveLoad.lastSwitch = now;
    },
    
    isSignificant: function(priority) {
      return priority >= this.settings.significanceThreshold;
    },
    
    getTrustReasoning: function(layerId) {
      var stats = Orion.Telemetry.ProviderHealth.getProviderInfo(layerId);
      if (!stats) return "Baseline confidence";
      if (stats.consecutiveFailures > 0) return "Degraded due to provider instability";
      if (stats.lastSuccess && (Date.now() - stats.lastSuccess > 300000)) return "Caution: Stale telemetry data";
      return "Validated via multi-source correlation";
    },
    
    performMemoryHygiene: function() {
      var memory = Orion.Intelligence.CognitiveOperations.memory;
      var now = Date.now();
      var expireMs = this.settings.memoryHygieneDays * 24 * 60 * 60 * 1000;
      if (memory.anomalyZones) {
        Object.keys(memory.anomalyZones).forEach(function(zoneId) {
          if (now - memory.anomalyZones[zoneId].lastSeen > expireMs) delete memory.anomalyZones[zoneId];
        });
      }
    }
  };

  window.Orion = Orion;

})(window);
