
  (function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Renderer = Orion.Renderer || {};

  function platformEntityKey(layerId, id) {
    return layerId + "::" + String(id || "").replace(/[^a-zA-Z0-9:_-]/g, "-");
  }

  function primitivePickId(layerId, item, index) {
    var rawId = item && (item.id || item.name || item.callsign || item.icao24);
    var id = platformEntityKey(layerId, rawId || index);
    return {
      orionPlatformEntityId: id,
      orionPrimitivePlatformEntityId: id,
      orionLayerId: layerId,
      orionItemId: rawId || index
    };
  }

  Orion.Renderer.Maritime = {
    collection: null,
    maxPoints: 10000,
    
    init: function(viewer) {
      this.viewer = viewer;
      this.collection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
      this.collection._orionManaged = true;
      console.log('[Orion.Renderer.Maritime] Unified domain initialized');
    },
    
    render: function(items, time) {
      var providerCount = items.length;
      if (!this.collection || !Orion.Runtime.StateManager.isLayerEnabled('liveShips')) {
        this.collection && this.collection.removeAll();
        return;
      }
      
      this.collection.removeAll();
      var self = this;
      var height = this.viewer.camera.positionCartographic.height;
      
      var lodVisible = 0;
      items.slice(0, this.maxPoints).forEach(function(item, index) {
        if (height > 12000000) return;
        
        var sample = (item.positions) ? Orion.Telemetry.Samplers.intel(item, time) : item;
        if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) return;
        
        lodVisible++;
        self.collection.add({
          id: primitivePickId('liveShips', item, index),
          position: Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, 0),
          image: window.trackIcon ? window.trackIcon("sea", "#a6b7ff") : (window.markerIcon ? window.markerIcon("soft-dot") : 'loading_images/earth1.jpg'),
          scale: 0.22 * (height > 1000000 ? 1.18 : 1.0),
          color: Cesium.Color.WHITE.withAlpha(0.92),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        });
      });
      
      if (Orion.Diagnostics && Orion.Diagnostics.SystemMonitor.active) {
        console.log('[Maritime] Provider:', providerCount, 'LOD Visible:', lodVisible, 'Allocated:', this.collection.length);
      }
    }
  };

  Orion.Renderer.Aviation = {
    collection: null,
    maxPoints: 10000,
    aircraftById: {},
    billboardsById: {},
    interpolationMs: 25000,
    staleMs: 120000,
    removeMs: 600000,
    
    init: function(viewer) {
      this.viewer = viewer;
      this.collection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
      this.collection._orionManaged = true;
      console.log('[Orion.Renderer.Aviation] Unified domain initialized');
    },

    timestampMs: function(item) {
      var raw = item && (item.timestamp || item.lastContact || item.last_contact || item.time);
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw < 10000000000 ? raw * 1000 : raw;
      }
      if (raw) {
        var parsed = new Date(raw).getTime();
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return Date.now();
    },

    itemId: function(item, index) {
      return String(item && (item.id || item.icao24 || item.callsign || item.registration) || ("aircraft-" + index))
        .toLowerCase()
        .replace(/[^a-z0-9:_-]/g, "-");
    },

    itemKey: function(item, sample) {
      return [
        item && (item.timestamp || item.lastContact || item.last_contact || ""),
        sample.lon.toFixed(5),
        sample.lat.toFixed(5),
        Math.round(sample.height || 0),
        Math.round(sample.heading || item.heading || 0)
      ].join("|");
    },

    ingestAircraft: function(item, index, time) {
      var sample = Orion.Telemetry.Samplers.intel(item, time);
      if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) {
        return null;
      }

      var id = this.itemId(item, index);
      var now = Date.now();
      var key = this.itemKey(item, sample);
      var record = this.aircraftById[id];

      if (!record) {
        record = {
          id: id,
          item: item,
          previous: sample,
          current: sample,
          key: key,
          updatedAt: now,
          receivedAt: now,
          sourceTimestamp: this.timestampMs(item)
        };
        this.aircraftById[id] = record;
        return record;
      }

      if (record.key !== key) {
        record.previous = record.current || sample;
        record.current = sample;
        record.key = key;
        record.updatedAt = now;
        record.sourceTimestamp = this.timestampMs(item);
      }

      record.item = item;
      record.receivedAt = now;
      return record;
    },

    interpolateRecord: function(record) {
      var start = record.previous || record.current;
      var end = record.current || record.previous;
      if (!start || !end) {
        return null;
      }

      var amount = Math.min(Math.max((Date.now() - record.updatedAt) / this.interpolationMs, 0), 1);
      return {
        lon: start.lon + (end.lon - start.lon) * amount,
        lat: start.lat + (end.lat - start.lat) * amount,
        height: (Number(start.height) || 0) + ((Number(end.height) || 0) - (Number(start.height) || 0)) * amount,
        heading: Number(end.heading || record.item.heading || 0)
      };
    },
    
    render: function(items, time) {
      var providerCount = items.length;
      if (!this.collection || !Orion.Runtime.StateManager.isLayerEnabled('liveAircraft')) {
        this.collection && this.collection.removeAll();
        this.aircraftById = {};
        this.billboardsById = {};
        return;
      }
      
      var self = this;
      var height = this.viewer.camera.positionCartographic.height;
      var active = {};
      var now = Date.now();
      var simulationMode = (Orion.SimulationClock && Orion.SimulationClock.mode) || "live";
      var liveMode = simulationMode === "live";

      if (height > 12000000) {
        this.collection.removeAll();
        this.billboardsById = {};
        return;
      }
      
      var lodVisible = 0;
      items.slice(0, this.maxPoints).forEach(function(item, index) {
        var record = self.ingestAircraft(item, index, time);
        if (!record) return;
        active[record.id] = true;

        var sample = liveMode ? self.interpolateRecord(record) : Orion.Telemetry.Samplers.intel(item, time);
        if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) return;

        var isStale = now - record.sourceTimestamp > self.staleMs;
        var billboard = self.billboardsById[record.id];
        var pickId = primitivePickId('liveAircraft', item, index);
        var position = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height || 10000);

        lodVisible++;
        if (!billboard) {
          billboard = self.collection.add({
            id: pickId,
            position: position,
            image: window.trackIcon ? window.trackIcon("air", "#dfe6ff") : (window.markerIcon ? window.markerIcon("soft-dot") : 'loading_images/earth1.jpg'),
            scale: height > 1500000 ? 0.2 : 0.26,
            rotation: Cesium.Math.toRadians(sample.heading || item.heading || 0),
            color: Cesium.Color.WHITE.withAlpha(isStale ? 0.42 : 0.95),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          });
          self.billboardsById[record.id] = billboard;
        } else {
          billboard.id = pickId;
          billboard.position = position;
          billboard.scale = height > 1500000 ? 0.2 : 0.26;
          billboard.rotation = Cesium.Math.toRadians(sample.heading || item.heading || 0);
          billboard.color = Cesium.Color.WHITE.withAlpha(isStale ? 0.42 : 0.95);
        }
      });

      Object.keys(this.aircraftById).forEach(function(id) {
        if (active[id]) {
          return;
        }
        var billboard = self.billboardsById[id];
        if (billboard) {
          self.collection.remove(billboard);
        }
        delete self.aircraftById[id];
        delete self.billboardsById[id];
      });

      if (Orion.Diagnostics && Orion.Diagnostics.SystemMonitor.active) {
        console.log('[Aviation] Provider:', providerCount, 'LOD Visible:', lodVisible, 'Allocated:', this.collection.length);
      }
    }
  };

  Orion.Renderer.Orbital = {
    collection: null,
    trajectories: null,
    maxPoints: 45000,
    
    init: function(viewer) {
      this.viewer = viewer;
      this.collection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
      this.collection._orionManaged = true;
      this.trajectories = viewer.scene.primitives.add(new Cesium.PolylineCollection());
      this.trajectories._orionManaged = true;
      console.log('[Orion.Renderer.Orbital] Unified domain initialized');
    },
    
    render: function(items, filter, time) {
      var providerCount = items.length;
      var layerDefinitions = (Orion.Config && Orion.Config.PlatformLayerDefinitions) || {};
      var orbitalLayerIds = Object.keys(layerDefinitions).filter(function(layerId) {
        return layerDefinitions[layerId] && layerDefinitions[layerId].type === "satellite";
      });
      var orbitalEnabled = orbitalLayerIds.some(function(layerId) {
        return Orion.Runtime.StateManager.isLayerEnabled(layerId);
      });
                           
      if (!this.collection || !orbitalEnabled) {
        this.collection && this.collection.removeAll();
        this.trajectories && this.trajectories.removeAll();
        return;
      }
      
      this.itemsBySource = this.itemsBySource || {};
      if (filter) this.itemsBySource[filter] = items;
      else this.itemsBySource['default'] = items;
      
      this.collection.removeAll();
      this.trajectories.removeAll();
      
      var self = this;
      var height = this.viewer.camera.positionCartographic.height;
      var selectedId = window.selectedPlatformEntityId;
      
      var lodVisible = 0;
      Object.keys(this.itemsBySource).forEach(function(src) {
        if (!Orion.Runtime.StateManager.isLayerEnabled(src) && src !== 'default') return;
        
        self.itemsBySource[src].forEach(function(item, index) {
          if (lodVisible >= self.maxPoints) return;
          var sample = Orion.Telemetry.Samplers.satellite(item, time);
          if (!sample || !Number.isFinite(sample.lon) || !Number.isFinite(sample.lat)) return;

          lodVisible++;
          var pos = Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height || 450000);
          var pixelSize = height > 10000000 ? 1.7 : (height > 2000000 ? 2.5 : 3.8);
          
          self.collection.add({
            id: primitivePickId(src, item, index),
            position: pos,
            pixelSize: pixelSize,
            color: Cesium.Color.fromCssColorString(item.color || "#ffffff").withAlpha(0.7),
            outlineColor: Cesium.Color.TRANSPARENT,
            outlineWidth: 0,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          });

          if (selectedId && selectedId === platformEntityKey(src, item.id || item.name || index)) {
            self.renderTrajectory(item);
          }
        });
      });

      if (Orion.Diagnostics && Orion.Diagnostics.SystemMonitor.active) {
        console.log('[Orbital] Provider (Source):', providerCount, 'LOD Visible (Total):', lodVisible, 'Allocated:', this.collection.length);
      }
    },

    renderTrajectory: function(item) {
      if (!this.trajectories || !item || !window.satellite || !item.satrec) {
        return;
      }

      var positions = [];
      var now = new Date();
      var stepMinutes = 4;
      var totalMinutes = 108;

      for (var offset = -totalMinutes; offset <= totalMinutes; offset += stepMinutes) {
        var sample = Orion.Telemetry.Samplers.satellite(item, new Date(now.getTime() + offset * 60000));
        if (sample && Number.isFinite(sample.lon) && Number.isFinite(sample.lat)) {
          positions.push(Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, sample.height || 450000));
        }
      }

      if (positions.length < 2) {
        return;
      }

      var color = Cesium.Color.fromCssColorString(item.color || "#ffffff").withAlpha(0.66);
      var options = {
        positions: positions,
        width: 1.65,
        color: color
      };

      try {
        if (Cesium.Material && Cesium.Material.fromType) {
          options.material = Cesium.Material.fromType("PolylineGlow", {
            color: color,
            glowPower: 0.18,
            taperPower: 0.85
          });
        }
      } catch (error) {
      }

      this.trajectories.add(options);
    }
  };

  window.Orion = Orion;

})(window);
