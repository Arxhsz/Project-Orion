(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Runtime = Orion.Runtime || {};
  var debugEnabled = false;

  try {
    debugEnabled = new URLSearchParams(window.location.search).get('orionDebug') === '1' ||
      window.localStorage.getItem('orionDebug') === '1';
  } catch (error) {
    debugEnabled = false;
  }

  Orion.Runtime.StateManager = {
    layerStates: {},
    stateHistory: [],
    maxHistorySize: 50,
    lodLevel: 'close',
    
    init: function() {
      var self = this;
      var platformLayerDefinitions = Orion.Config.PlatformLayerDefinitions;
      
      Object.keys(platformLayerDefinitions).forEach(function(layerId) {
        self.layerStates[layerId] = {
          enabled: false,
          lastChanged: Date.now(),
          changeCount: 0,
          lockedUntil: 0
        };
      });
      if (debugEnabled) console.log('[Orion.Runtime.StateManager] Initialized');
    },
    
    setLayerEnabled: function(layerId, enabled) {
      if (!this.layerStates[layerId]) {
        console.warn('[Orion.Runtime.StateManager] Unknown layer:', layerId);
        return false;
      }
      
      var now = Date.now();
      var currentState = this.layerStates[layerId];
      if (currentState.lockedUntil > now) {
        return false;
      }
      
      if (currentState.enabled !== enabled) {
        var previousState = {
          layerId: layerId,
          enabled: currentState.enabled,
          timestamp: currentState.lastChanged
        };
        
        this.layerStates[layerId] = {
          enabled: enabled,
          lastChanged: now,
          changeCount: currentState.changeCount + 1,
          lockedUntil: 0
        };
        
        this.stateHistory.push({
          layerId: layerId,
          enabled: enabled,
          timestamp: now,
          previousState: previousState
        });
        
        if (this.stateHistory.length > this.maxHistorySize) {
          this.stateHistory.shift();
        }
        
        if (debugEnabled) console.log('[Orion.Runtime.StateManager]', layerId, enabled ? 'ENABLED' : 'DISABLED');
        
        Orion.Runtime.EventBus.emit('layer:changed', { layerId: layerId, enabled: enabled });
        
        return true;
      }
      return false;
    },
    
    isLayerEnabled: function(layerId) {
      return this.layerStates[layerId] ? this.layerStates[layerId].enabled : false;
    },

    lockLayer: function(layerId, durationMs) {
      if (!this.layerStates[layerId]) return;
      this.layerStates[layerId].lockedUntil = Date.now() + durationMs;
    },

    getEnabledLayers: function() {
      var self = this;
      return Object.keys(this.layerStates).filter(function(layerId) {
        return self.layerStates[layerId].enabled;
      });
    },

    getLayerInfo: function(layerId) {
      return this.layerStates[layerId] || null;
    },

    getHistory: function(limit) {
      limit = limit || 10;
      return this.stateHistory.slice(-limit);
    }
  };

  window.Orion = Orion;

})(window);
