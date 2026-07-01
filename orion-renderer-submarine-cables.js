(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Renderer = Orion.Renderer || {};

  Orion.Renderer.SubmarineCables = Orion.Renderer.SubmarineCables || {
    init: function(viewer) {
      var infrastructure = Orion.Renderer.Infrastructure;
      if (infrastructure && infrastructure.UnderseaCables && !infrastructure.UnderseaCables.collection) {
        infrastructure.UnderseaCables.init(viewer);
      }
    },

    render: function(items) {
      var infrastructure = Orion.Renderer.Infrastructure;
      if (infrastructure && infrastructure.UnderseaCables) {
        infrastructure.UnderseaCables.render(items || []);
      }
    },

    clear: function() {
      var infrastructure = Orion.Renderer.Infrastructure;
      if (infrastructure && infrastructure.UnderseaCables && infrastructure.UnderseaCables.collection) {
        infrastructure.UnderseaCables.collection.removeAll();
      }
    }
  };

  window.Orion = Orion;
})(window);
