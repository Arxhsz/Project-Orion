(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Session = {
    STORAGE_KEY: 'orion:session:continuity',
    
    init: function() {
      console.log('[Orion.Session] Initialized');
    },
    
    save: function() {
      var viewer = window.viewer;
      var state = {
        timestamp: Date.now(),
        camera: viewer ? {
          position: viewer.camera.position,
          direction: viewer.camera.direction,
          up: viewer.camera.up
        } : null,
        layers: Orion.Runtime.StateManager.getEnabledLayers(),
        preferences: {
          lod: Orion.Runtime.StateManager.lodLevel,
          profile: Orion.Runtime.DeploymentProfiles.active
        }
      };
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
      console.log('[Orion.Session] Context persisted');
    },
    
    restore: function() {
      var data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return null;
      
      try {
        var session = JSON.parse(data);
        if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
          console.log('[Orion.Session] Stale session ignored');
          return null;
        }
        
        console.log('[Orion.Session] Restoring operational context...');
        
        if (session.layers) {
          session.layers.forEach(function(layerId) {
            Orion.Runtime.StateManager.setLayerEnabled(layerId, true);
          });
        }
        
        if (session.preferences) {
          if (session.preferences.profile) {
            Orion.Runtime.DeploymentProfiles.apply(session.preferences.profile);
          }
        }
        
        return session;
      } catch (e) {
        console.error('[Orion.Session] Restore failed:', e);
        return null;
      }
    },
    
    clear: function() {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  };

  window.Orion = Orion;

})(window);
