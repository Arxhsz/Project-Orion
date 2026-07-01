(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Renderer = Orion.Renderer || {};

  Orion.Renderer.PowerGrid = Orion.Renderer.PowerGrid || {
    init: function(viewer) {
      var infrastructure = Orion.Renderer.Infrastructure;
      if (infrastructure && infrastructure.PowerGrid && !infrastructure.PowerGrid.collection) {
        infrastructure.PowerGrid.init(viewer);
      }
    },

    render: function(items) {
      var infrastructure = Orion.Renderer.Infrastructure;
      if (infrastructure && infrastructure.PowerGrid) {
        infrastructure.PowerGrid.render(items || []);
      }
    },

    clear: function() {
      var infrastructure = Orion.Renderer.Infrastructure;
      if (infrastructure && infrastructure.PowerGrid && infrastructure.PowerGrid.collection) {
        infrastructure.PowerGrid.collection.removeAll();
      }
    }
  };

  window.Orion = Orion;
})(window);
