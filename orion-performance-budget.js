(function(window) {
  'use strict';

  var Orion = window.Orion || {};

  Orion.Runtime.PerformanceBudget = {
    budgets: {
      maxBillboards: 15000,
      maxPoints: 10000,
      maxPolylines: 5000,
      maxEntities: 3000
    },
    
    getCurrentMetrics: function() {
      var metrics = {
        billboards: 0,
        points: 0,
        polylines: 0,
        entities: (window.viewer && window.viewer.entities) ? window.viewer.entities.values.length : 0
      };
      
      if (window.viewer && window.viewer.scene) {
        var primitives = window.viewer.scene.primitives;
        for (var i = 0; i < primitives.length; i++) {
          var p = primitives.get(i);
          if (p instanceof Cesium.BillboardCollection) metrics.billboards += p.length;
          else if (p instanceof Cesium.PointPrimitiveCollection) metrics.points += p.length;
          else if (p instanceof Cesium.PolylineCollection) metrics.polylines += p.length;
        }
      }
      return metrics;
    },
    
    enforce: function() {
      var metrics = this.getCurrentMetrics();
      var pressure = 0;
      if (metrics.billboards > this.budgets.maxBillboards) pressure = Math.max(pressure, metrics.billboards / this.budgets.maxBillboards);
      if (metrics.points > this.budgets.maxPoints) pressure = Math.max(pressure, metrics.points / this.budgets.maxPoints);
      if (metrics.entities > this.budgets.maxEntities) pressure = Math.max(pressure, metrics.entities / this.budgets.maxEntities);
      
      if (pressure > 1.5) Orion.Runtime.EventBus.emit('render:pressure', { pressure: pressure, action: 'DEGRADE' });
      
      return pressure;
    }
  };

  Orion.Runtime.PerformanceBudget.getCurrentMetrics =
    Orion.Runtime.PerformanceBudget.getCurrentMetrics ||
    function () {
        return {
            fps: 0,
            gpuPressure: 0,
            billboards: 0,
            points: 0,
            entities: 0,
            primitives: 0,
            memoryMB: 0
        };
    };

  window.Orion = Orion;

})(window);
