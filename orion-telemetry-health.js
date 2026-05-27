(function(window) {
  'use strict';

  var Orion = window.Orion || {};

  Orion.Telemetry.ProviderHealth = {
    providers: {},
    healthHistory: [],
    maxHistorySize: 100,
    
    HEALTH_STATES: {
      ONLINE: 'online',
      DEGRADED: 'degraded',
      OFFLINE: 'offline',
      UNKNOWN: 'unknown'
    },
    
    init: function() {
      var self = this;
      var platformLayerDefinitions = Orion.Config.PlatformLayerDefinitions;

      Object.keys(platformLayerDefinitions).forEach(function(layerId) {
        self.providers[layerId] = {
          layerId: layerId,
          health: self.HEALTH_STATES.UNKNOWN,
          consecutiveFailures: 0,
          consecutiveSuccesses: 0,
          totalAttempts: 0,
          totalSuccesses: 0,
          totalFailures: 0,
          lastSuccess: null,
          lastFailure: null,
          lastPayload: null,
          lastValidPayload: null,
          lastError: null,
          retryCount: 0,
          nextRetryAt: null,
          backoffMs: 5000
        };
      });
      console.log('[Orion.Telemetry.ProviderHealth] Initialized');
    },
    
    recordSuccess: function(layerId, payload) {
      if (!this.providers[layerId]) return;
      var now = Date.now();
      var provider = this.providers[layerId];
      provider.consecutiveFailures = 0;
      provider.consecutiveSuccesses += 1;
      provider.totalAttempts += 1;
      provider.totalSuccesses += 1;
      provider.lastSuccess = now;
      provider.lastPayload = payload;
      provider.retryCount = 0;
      provider.nextRetryAt = null;
      provider.backoffMs = 5000;
      
      if (payload && !payload.error && !payload.fallback) {
        var hasData = (payload.features && payload.features.length > 0) ||
                      (payload.items && payload.items.length > 0) ||
                      (payload.cameras && payload.cameras.length > 0) ||
                      (payload.tle && payload.tle.length > 0);
        if (hasData) {
          provider.lastValidPayload = payload;
          provider.lastValidPayloadTime = now;
        }
      }
      
      var previousHealth = provider.health;
      provider.health = (provider.consecutiveSuccesses >= 2) ? this.HEALTH_STATES.ONLINE : this.HEALTH_STATES.ONLINE;
      if (previousHealth !== provider.health) {
        this.addToHistory(layerId, provider.health, 'success', null);
      }

      if (Orion.Diagnostics && Orion.Diagnostics.Performance) {
        Orion.Diagnostics.Performance.update({ providerHealth: this.getGlobalHealthScore() });
      }
    },
    
    recordFailure: function(layerId, error) {
      if (!this.providers[layerId]) return;
      var now = Date.now();
      var provider = this.providers[layerId];
      provider.consecutiveSuccesses = 0;
      provider.consecutiveFailures += 1;
      provider.totalAttempts += 1;
      provider.totalFailures += 1;
      provider.lastFailure = now;
      provider.lastError = error && error.message ? error.message : String(error);
      provider.retryCount += 1;
      provider.backoffMs = Math.min(60000, 5000 * Math.pow(2, provider.retryCount - 1));
      provider.nextRetryAt = now + provider.backoffMs;
      
      var previousHealth = provider.health;
      if (provider.consecutiveFailures >= 3) provider.health = this.HEALTH_STATES.OFFLINE;
      else provider.health = this.HEALTH_STATES.DEGRADED;
      
      if (previousHealth !== provider.health) {
        this.addToHistory(layerId, provider.health, 'failure', provider.lastError);
        Orion.Runtime.EventBus.emit('provider:offline', { layerId: layerId, error: provider.lastError });
      }
    },
    
    getHealth: function(layerId) {
      return this.providers[layerId] ? this.providers[layerId].health : this.HEALTH_STATES.UNKNOWN;
    },
    
    getProviderInfo: function(layerId) {
      return this.providers[layerId] || null;
    },
    
    shouldUseCachedData: function(layerId) {
      if (!this.providers[layerId]) return false;
      var provider = this.providers[layerId];
      if ((provider.health === this.HEALTH_STATES.DEGRADED || provider.health === this.HEALTH_STATES.OFFLINE) &&
          provider.lastValidPayload && provider.lastValidPayloadTime) {
        var cacheAge = Date.now() - provider.lastValidPayloadTime;
        return cacheAge < 30 * 60 * 1000;
      }
      return false;
    },
    
    getCachedPayload: function(layerId) {
      return this.providers[layerId] ? this.providers[layerId].lastValidPayload : null;
    },
    
    shouldRetryNow: function(layerId) {
      if (!this.providers[layerId]) return true;
      return !this.providers[layerId].nextRetryAt || Date.now() >= this.providers[layerId].nextRetryAt;
    },
    
    resetProvider: function(layerId) {
      if (!this.providers[layerId]) return;
      var p = this.providers[layerId];
      p.consecutiveFailures = 0;
      p.retryCount = 0;
      p.nextRetryAt = null;
      p.health = this.HEALTH_STATES.UNKNOWN;
    },
    
    addToHistory: function(layerId, health, event, error) {
      this.healthHistory.push({ layerId: layerId, health: health, event: event, error: error, timestamp: Date.now() });
      if (this.healthHistory.length > this.maxHistorySize) this.healthHistory.shift();
    },
    
    getHistory: function(layerId, limit) {
      limit = limit || 10;
      if (layerId) return this.healthHistory.filter(function(e) { return e.layerId === layerId; }).slice(-limit);
      return this.healthHistory.slice(-limit);
    },
    
    getAllStats: function() {
      var self = this;
      return Object.keys(this.providers).map(function(layerId) {
        var p = self.providers[layerId];
        return {
          layerId: layerId,
          health: p.health,
          successRate: p.totalAttempts > 0 ? (p.totalSuccesses / p.totalAttempts * 100).toFixed(1) + '%' : 'N/A'
        };
      });
    },

    getGlobalHealthScore: function() {
      var keys = Object.keys(this.providers);
      if (keys.length === 0) return 1.0;
      var score = 0;
      var self = this;
      keys.forEach(function(k) {
        var h = self.providers[k].health;
        if (h === self.HEALTH_STATES.ONLINE) score += 1.0;
        else if (h === self.HEALTH_STATES.DEGRADED) score += 0.5;
      });
      return score / keys.length;
    }
  };

  window.Orion = Orion;

})(window);
