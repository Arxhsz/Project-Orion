(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Renderer = Orion.Renderer || {};

  function normalizedPath(item) {
    var source = item && (item.positions || item.points || item.route || item.path);
    if (!Array.isArray(source)) {
      return [];
    }

    return source.map(function(point) {
      if (!Array.isArray(point) || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))) {
        return null;
      }
      return [Number(point[0]), Number(point[1]), Number(point[2]) || 0];
    }).filter(Boolean);
  }

  function pathToCartesian(path, fallbackHeight) {
    return (path || []).map(function(point) {
      return Cesium.Cartesian3.fromDegrees(point[0], point[1], Number(point[2]) || fallbackHeight || 0);
    });
  }

  function platformEntityKey(layerId, id) {
    return layerId + "::" + String(id || "").replace(/[^a-zA-Z0-9:_-]/g, "-");
  }

  function primitivePickId(layerId, item, index) {
    var rawId = item && (item.id || item.name || index);
    var id = platformEntityKey(layerId, rawId);
    return {
      orionPlatformEntityId: id,
      orionPrimitivePlatformEntityId: id,
      orionLayerId: layerId,
      orionItemId: rawId
    };
  }

  Orion.Renderer.Infrastructure = Orion.Renderer.Infrastructure || {
    init: function(viewer) {
      this.viewer = viewer;
      this.CyberNetwork.init(viewer);
      this.UnderseaCables.init(viewer);
      this.PowerGrid.init(viewer);
    },
    
    render: function(layerId, items) {
      if (!Orion.Runtime.StateManager.isLayerEnabled(layerId)) {
        this.clear(layerId);
        return;
      }

      var tension = (Orion.Intelligence && Orion.Intelligence.CognitiveOperations) ? Orion.Intelligence.CognitiveOperations.tension : 0.5;
      
      if (layerId === 'cyberNetwork') this.CyberNetwork.render(items, tension);
      else if (layerId === 'underseaCables') this.UnderseaCables.render(items);
      else if (layerId === 'powerGrid') this.PowerGrid.render(items);
    },
    
    clear: function(layerId) {
      if (layerId === 'cyberNetwork') {
        this.CyberNetwork.collections.arcs && this.CyberNetwork.collections.arcs.removeAll();
        this.CyberNetwork.collections.packets && this.CyberNetwork.collections.packets.removeAll();
      } else if (layerId === 'underseaCables') {
        this.UnderseaCables.collection && this.UnderseaCables.collection.removeAll();
      } else if (layerId === 'powerGrid') {
        this.PowerGrid.collection && this.PowerGrid.collection.removeAll();
        this.PowerGrid.points && this.PowerGrid.points.removeAll();
      }
    }
  };

  Orion.Renderer.Infrastructure.CyberNetwork = {
    collections: {
      arcs: null,
      packets: null
    },
    
    init: function(viewer) {
      this.viewer = viewer;
      this.collections.arcs = viewer.scene.primitives.add(new Cesium.PolylineCollection());
      this.collections.packets = viewer.scene.primitives.add(new Cesium.BillboardCollection());
      console.log('[Orion.Renderer.Infrastructure.CyberNetwork] Initialized');
    },
    
    render: function(items, intensity) {
      var providerCount = items.length;
      var arcs = this.collections.arcs;
      var packets = this.collections.packets;
      if (!arcs || !packets) return;
      
      arcs.removeAll();
      packets.removeAll();
      
      var def = Orion.Config.PlatformLayerDefinitions.cyberNetwork;
      var color = Cesium.Color.fromCssColorString(def.color || "#d8dcff");
      var baseSpeed = 0.16 + intensity * 0.18;
      
      var lodVisible = 0;
      items.forEach(function(item, idx) {
        var path = normalizedPath(item);
        var startLat = item.lat, startLon = item.lon;
        var endLat = item.targetLat, endLon = item.targetLon;

        if (path.length >= 2) {
          startLon = path[0][0];
          startLat = path[0][1];
          endLon = path[path.length - 1][0];
          endLat = path[path.length - 1][1];
        }
        
        if (startLat === undefined || endLat === undefined) return;
        lodVisible++;
        
        var positions = path.length >= 2 ? pathToCartesian(path, 90000) : [];
        var start = Cesium.Cartographic.fromDegrees(startLon, startLat);
        var end = Cesium.Cartographic.fromDegrees(endLon, endLat);
        
        if (positions.length < 2) {
          var distance = Cesium.Cartesian3.distance(
            Cesium.Cartesian3.fromDegrees(startLon, startLat),
            Cesium.Cartesian3.fromDegrees(endLon, endLat)
          );
          var arcHeight = Math.min(distance * 0.15, 600000);
          
          var segments = 24;
          for (var i = 0; i <= segments; i++) {
            var p = i / segments;
            positions.push(Cesium.Cartesian3.fromRadians(
              Cesium.Math.lerp(start.longitude, end.longitude, p),
              Cesium.Math.lerp(start.latitude, end.latitude, p),
              Math.sin(p * Math.PI) * arcHeight
            ));
          }
        }
        
        if (positions.length < 2) return;
        
        arcs.add({
          positions: positions,
          width: 1.2 + (item.weight || 0) * 0.8,
          material: Cesium.Material.fromType('Color', {
            color: color.withAlpha(0.35 + (item.congestion || 0) * 0.25)
          })
        });
        
        var packetCount = 1 + Math.floor((item.weight || 0) * 2);
        for (var pk = 0; pk < packetCount; pk++) {
          (function(pIdx) {
            var seed = idx * 500 + pIdx * 1000;
            packets.add({
              position: new Cesium.CallbackProperty(function(time, res) {
                var speed = baseSpeed * (0.8 + Math.sin(idx) * 0.2);
                var progress = ((time.secondsOfDay + seed) * speed) % 1.0;
                var posIdx = progress * (positions.length - 1);
                var i0 = Math.floor(posIdx);
                var i1 = Math.min(i0 + 1, positions.length - 1);
                return Cesium.Cartesian3.lerp(positions[i0], positions[i1], posIdx - i0, res);
              }, false),
              image: window.markerIcon ? window.markerIcon("packet-pulse") : 'loading_images/earth1.jpg',
              scale: 0.12 * (0.8 + (item.weight || 0) * 0.5),
              color: color.withAlpha(0.95),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            });
          })(pk);
        }
      });
      console.log('[CyberNetwork] Provider:', providerCount, 'LOD Visible:', lodVisible, 'Arcs:', arcs.length, 'Packets:', packets.length);
    }
  };

  Orion.Renderer.Infrastructure.UnderseaCables = {
    collection: null,
    init: function(viewer) {
      this.collection = viewer.scene.primitives.add(new Cesium.PolylineCollection());
      this.collection._orionManaged = true;
    },
    render: function(items) {
      if (!this.collection) return;
      var providerCount = items.length;
      this.collection.removeAll();
      var color = Cesium.Color.fromCssColorString(Orion.Config.PlatformLayerDefinitions.underseaCables.color);
      
      var lodVisible = 0;
      items.forEach(function(item, index) {
        var path = normalizedPath(item);
        if (!path.length) return;
        lodVisible++;
        var pts = pathToCartesian(path, 0);
        this.collection.add({
          id: primitivePickId("underseaCables", item, index),
          positions: pts,
          width: 1.8,
          material: Cesium.Material.fromType('Color', { color: color.withAlpha(0.6) })
        });
      }, this);
      console.log('[UnderseaCables] Provider:', providerCount, 'LOD Visible:', lodVisible, 'Allocated:', this.collection.length);
    }
  };

  Orion.Renderer.Infrastructure.PowerGrid = {
    collection: null,
    points: null,
    init: function(viewer) {
      this.viewer = viewer;
      this.collection = viewer.scene.primitives.add(new Cesium.PolylineCollection());
      this.collection._orionManaged = true;
      this.points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
      this.points._orionManaged = true;
    },
    render: function(items) {
      if (!this.collection || !this.points) return;
      var providerCount = items.length;
      this.collection.removeAll();
      this.points.removeAll();
      
      var self = this;
      var height = this.viewer.camera.positionCartographic.height;
      var linePalette = {
        ultra: "#f26b5e",
        extra: "#ffad66",
        high: "#ffe066",
        medium: "#55c9d8",
        low: "#9fd38a",
        cable: "#aa96ff",
        busbar: "#e8f59b"
      };
      var facilityPalette = {
        plant: "#ff6b63",
        generator: "#8bd17c",
        substation: "#65d8e6",
        transformer: "#ffd166",
        converter: "#c4a7ff",
        switch: "#f4f7fb",
        compensator: "#f0a6ca",
        tower: "#aab4c2",
        pole: "#8e99a8",
        portal: "#b8c2cf"
      };

      function lineColor(item) {
        var category = String(item.category || "line").toLowerCase();
        var voltage = Number(item.voltage) || 0;
        if (category === "cable") return linePalette.cable;
        if (category === "busbar") return linePalette.busbar;
        if (voltage >= 500000) return linePalette.ultra;
        if (voltage >= 330000) return linePalette.extra;
        if (voltage >= 220000) return linePalette.high;
        if (voltage >= 110000) return linePalette.medium;
        return linePalette.low;
      }

      function facilitySize(category) {
        if (category === "plant") return 9;
        if (category === "substation") return 8;
        if (category === "generator") return 7;
        if (category === "transformer" || category === "converter") return 6;
        return 4.5;
      }
      
      var lodVisible = 0;
      items.forEach(function(item, index) {
        var path = normalizedPath(item);
        var category = String(item.category || "line").toLowerCase();

        if (path.length < 2 && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon))) {
          var smallFacility = category === "tower" || category === "pole" || category === "portal" || category === "switch";
          if (height > (smallFacility ? 650000 : 3500000)) return;
          lodVisible++;
          self.points.add({
            id: primitivePickId("powerGrid", item, index),
            position: Cesium.Cartesian3.fromDegrees(Number(item.lon), Number(item.lat), Number(item.height) || 72),
            pixelSize: facilitySize(category),
            color: Cesium.Color.fromCssColorString(facilityPalette[category] || "#d9e2ec").withAlpha(0.92),
            outlineColor: Cesium.Color.fromCssColorString("#071019").withAlpha(0.96),
            outlineWidth: 1.5,
            disableDepthTestDistance: 2500000
          });
          return;
        }

        if (path.length < 2) return;
        
        if (height > 5000000 && item.voltage < 220000) return;
        if (height > 1000000 && item.voltage < 110000) return;
        
        lodVisible++;
        var pts = pathToCartesian(path, 48);
        
        if (pts.length < 2) return;
        
        self.collection.add({ 
          id: primitivePickId("powerGrid", item, index),
          positions: pts, 
          width: height > 5000000 ? 1.0 : height > 1000000 ? 1.35 : 2.0,
          material: Cesium.Material.fromType('Color', { 
            color: Cesium.Color.fromCssColorString(lineColor(item)).withAlpha(height > 5000000 ? 0.48 : height > 2000000 ? 0.62 : 0.82)
          }) 
        });
      });
      console.log('[PowerGrid] Provider:', providerCount, 'LOD Visible:', lodVisible, 'Lines:', this.collection.length, 'Facilities:', this.points.length);
    }
  };

  window.Orion = Orion;

})(window);
