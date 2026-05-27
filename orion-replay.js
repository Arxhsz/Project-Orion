(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Replay = {
    active: false,
    timeline: [],
    cursor: 0,
    speed: 1.0,
    playbackTimer: null,
    
    init: function() {
      console.log('[Orion.Replay] Initialized');
    },
    
    start: function(data) {
      this.active = true;
      this.timeline = data || [];
      this.cursor = 0;
      Orion.Runtime.EventBus.emit('replay:started');
    },
    
    stop: function() {
      this.active = false;
      window.clearTimeout(this.playbackTimer);
      Orion.Runtime.EventBus.emit('replay:stopped');
    },
    
    seek: function(index) {
      this.cursor = Math.max(0, Math.min(index, this.timeline.length - 1));
      this.applyFrame(this.timeline[this.cursor]);
    },
    
    applyFrame: function(frame) {
      if (!frame) return;
      
      if (frame.telemetry) {
        Orion.Runtime.EventBus.emit('telemetry:frozen', frame.telemetry);
      }
      
      if (frame.camera && window.viewer) {
        window.viewer.camera.setView({
          destination: frame.camera.position,
          orientation: frame.camera.orientation
        });
      }
    },
    
    recordFrame: function() {
      if (!window.viewer) return;
      
      var frame = {
        timestamp: Date.now(),
        camera: {
          position: window.viewer.camera.position.clone(),
          orientation: {
            heading: window.viewer.camera.heading,
            pitch: window.viewer.camera.pitch,
            roll: window.viewer.camera.roll
          }
        },
        layers: JSON.parse(JSON.stringify(Orion.Runtime.StateManager.layerStates))
      };
      
      this.timeline.push(frame);
    }
  };

  window.Orion = Orion;

})(window);
