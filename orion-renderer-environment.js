(function(window) {
  'use strict';

  var Orion = window.Orion || {};
  Orion.Renderer = Orion.Renderer || {};
  Orion.Renderer.Environment = Orion.Renderer.Environment || {
    init: function(viewer) {
      this.SmokeSystem.init(viewer);
      this.LightningSystem.init(viewer);
    }
  };

  Orion.Renderer.Environment.SmokeSystem = {
    billboards: null,
    smokeOpacity: 0.18,
    smokeTextures: {},
    
    init: function(viewer) {
      this.viewer = viewer;
      this.billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
      this.billboards._orionManaged = true;
      console.log('[Orion.Renderer.Environment.SmokeSystem] Initialized');
    },

    smokeTexture: function(mode) {
      var key = mode || "wildfire";
      if (this.smokeTextures[key]) {
        return this.smokeTextures[key];
      }

      var canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 256, 256);

      var centerGradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 126);
      if (key === "storm") {
        centerGradient.addColorStop(0.0, "rgba(236,242,246,0.50)");
        centerGradient.addColorStop(0.42, "rgba(186,196,204,0.24)");
        centerGradient.addColorStop(1.0, "rgba(95,104,113,0)");
      } else {
        centerGradient.addColorStop(0.0, "rgba(136,128,116,0.42)");
        centerGradient.addColorStop(0.42, "rgba(82,78,74,0.28)");
        centerGradient.addColorStop(1.0, "rgba(36,35,35,0)");
      }
      ctx.fillStyle = centerGradient;
      ctx.fillRect(0, 0, 256, 256);

      function seededRandom(seed) {
        var x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      }

      ctx.globalCompositeOperation = "source-over";
      var baseSeed = key === "storm" ? 911 : 421;
      for (var i = 0; i < 210; i++) {
        var a = seededRandom(baseSeed + i * 5.17) * Math.PI * 2;
        var r = Math.pow(seededRandom(baseSeed + i * 11.73), 0.62) * 116;
        var x = 128 + Math.cos(a) * r;
        var y = 128 + Math.sin(a) * r * (key === "storm" ? 0.72 : 0.92);
        var size = 16 + seededRandom(baseSeed + i * 19.41) * (key === "storm" ? 64 : 46);
        var alpha = (key === "storm" ? 0.030 : 0.038) * (1.0 - r / 142);
        var blob = ctx.createRadialGradient(x, y, 1, x, y, size);
        blob.addColorStop(0, key === "storm" ? "rgba(245,248,250," + alpha.toFixed(4) + ")" : "rgba(118,111,103," + alpha.toFixed(4) + ")");
        blob.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      this.smokeTextures[key] = canvas.toDataURL("image/png");
      return this.smokeTextures[key];
    },
    
    createSmokePlume: function(id, position, intensity, options) {
      options = options || {};
      var self = this;
      var height = this.viewer.camera.positionCartographic.height;
      var mode = options.mode || "wildfire";
      
      var smokeSheetCount = mode === "storm" ? 5 : 3;
      if (height < 2000000) smokeSheetCount = mode === "storm" ? 10 : 7;
      if (height < 500000) smokeSheetCount = mode === "storm" ? 16 : 14;
      
      var profile = Orion.Runtime.DeploymentProfiles.get();
      smokeSheetCount = Math.min(smokeSheetCount, profile.volumetricSheets || 12);
      
      return this.createEntitySmoke(id, position, intensity, smokeSheetCount, options);
    },

    createEntitySmoke: function(id, sample, intensity, smokeSheetCount, options) {
      options = options || {};
      var effects = [];
      var mode = options.mode || "wildfire";
      var layerId = options.layerId || (mode === "storm" ? "volumetricWeather" : "wildfires");
      var smokeOpacity = options.opacity || (mode === "storm" ? 0.15 : this.smokeOpacity);
      var viewer = this.viewer;
      var baseRadius = Number(options.radius) || (mode === "storm" ? 120000 : 64000);
      var verticalSpan = Number(options.height) || (mode === "storm" ? 54000 : 18000);
      var baseAltitude = Number(options.baseAltitude) || (mode === "storm" ? 16000 : 700);
      var riseSpeed = mode === "storm" ? 0.012 : 0.018;
      var driftScale = mode === "storm" ? 0.62 : 0.92;
      var widthScale = mode === "storm" ? 1.18 : 0.92;
      var heightScale = mode === "storm" ? 0.72 : 0.54;
      
      var smokeTexture = this.smokeTexture(mode);
      
      for (var idx = 0; idx < smokeSheetCount; idx++) {
        (function(i) {
          var phase = i / smokeSheetCount;
          var layerSeed = ((String(id).length + 1) * 997 + i * 619) % 10000;
          var windAngle = (layerSeed * 0.0007 + i * 0.61) % (Math.PI * 2);
          var windLon = Math.cos(windAngle);
          var windLat = Math.sin(windAngle);
          var crossLon = -windLat;
          var crossLat = windLon;
          
          var entity = viewer.entities.add({
            name: "Orion.Smoke." + id + "." + i,
            position: new Cesium.CallbackPositionProperty(function(time, result) {
              if (Orion.Runtime.StateManager && !Orion.Runtime.StateManager.isLayerEnabled(layerId)) return undefined;
              
              var seconds = time.secondsOfDay + layerSeed;
              var age = (seconds * riseSpeed + phase) % 1.0;
              
              var heightOffset = baseAltitude + age * (verticalSpan + intensity * verticalSpan * 0.22) + Math.sin(seconds * 0.17 + i) * (mode === "storm" ? 1800 : 620);
              
              var drift = age * baseRadius * driftScale * (0.74 + intensity * 0.28);
              var curl = Math.sin(age * 8.0 + seconds * 0.12 + i) * baseRadius * (mode === "storm" ? 0.11 : 0.16);
              var pulse = Math.cos(age * 6.0 + seconds * 0.09 + layerSeed) * baseRadius * (mode === "storm" ? 0.05 : 0.07);
              var windX = windLon * drift + crossLon * curl + windLon * pulse;
              var windY = windLat * drift + crossLat * curl + windLat * pulse;
              
              return Cesium.Cartesian3.fromDegrees(
                sample.lon + (windX / 111000) * age, 
                sample.lat + (windY / 111000) * age, 
                heightOffset, 
                Cesium.Ellipsoid.WGS84, 
                result
              );
            }, false),
            billboard: {
              image: smokeTexture,
              sizeInMeters: true,
              width: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + layerSeed;
                var age = (seconds * riseSpeed + phase) % 1.0;
                var swell = 0.9 + Math.sin(age * Math.PI) * 0.24;
                return (baseRadius * (0.42 + age * widthScale)) * (0.82 + intensity * 0.18) * swell;
              }, false),
              height: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + layerSeed;
                var age = (seconds * riseSpeed + phase) % 1.0;
                return (baseRadius * (0.30 + age * heightScale)) * (0.74 + intensity * 0.18);
              }, false),
              scale: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + layerSeed;
                var age = (seconds * riseSpeed + phase) % 1.0;
                return 0.7 + Math.sin(age * Math.PI) * 0.22;
              }, false),
              color: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + layerSeed;
                var age = (seconds * riseSpeed + phase) % 1.0;
                
                var height = viewer.camera.positionCartographic.height;
                var lodFade = Cesium.Math.clamp((10000000 - height) / 9000000, 0, 1);
                
                var distanceFade = Cesium.Math.clamp((height - 20000) / 700000, 0.42, 1.0);
                var turbulence = 0.72 + Math.sin(seconds * 0.24 + i * 1.7) * 0.16 + Math.cos(age * 10.0 + layerSeed) * 0.08;
                
                var alpha = Cesium.Math.clamp(Math.sin(age * Math.PI) * smokeOpacity * lodFade * distanceFade * turbulence, 0, smokeOpacity);
                if (mode === "storm") {
                  var stormGray = 156 + Math.floor(age * 52);
                  var cool = Math.floor(10 + intensity * 18);
                  return Cesium.Color.fromBytes(stormGray + cool, stormGray + cool, stormGray + 14 + cool, Math.floor(alpha * 255));
                }
                var gray = 64 + Math.floor(age * 72);
                var warmth = Math.floor(20 * intensity * (1.0 - age));
                return Cesium.Color.fromBytes(gray + warmth, gray + Math.floor(warmth * 0.62), gray, Math.floor(alpha * 255));
              }, false),
              rotation: new Cesium.CallbackProperty(function(time) {
                var seconds = time.secondsOfDay + layerSeed;
                return windAngle + Math.sin(seconds * 0.035 + i) * 0.32;
              }, false),
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10000000),
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          });
          effects.push(entity);
        })(idx);
      }
      return effects;
    }
  };

  Orion.Renderer.Environment.LightningSystem = {
    init: function(viewer) {
      this.viewer = viewer;
      console.log('[Orion.Renderer.Environment.LightningSystem] Initialized');
    },
    
    createLightningBolt: function(id, sample, visualRadius, intensity) {
      var viewer = this.viewer;
      var lightningSeed = Math.random() * 1000;
      var effects = [];

      var bolt = viewer.entities.add({
        name: "Orion.Lightning." + id,
        position: Cesium.Cartesian3.fromDegrees(sample.lon, sample.lat, 0),
        polyline: {
          positions: new Cesium.CallbackProperty(function(time) {
            var seconds = time.secondsOfDay + lightningSeed;
            var segmentsCount = Orion.Runtime.DeploymentProfiles.profiles[Orion.Runtime.DeploymentProfiles.active].lightningSegments || 18;
            
            var timingPhase = Math.floor(seconds / 5.0);
            var randomSeed = lightningSeed + timingPhase * 100;
            var seededRandom = function(seed) {
              var x = Math.sin(seed) * 10000;
              return x - Math.floor(x);
            };
            
            var flashInterval = 4.0 + seededRandom(randomSeed) * 6.0;
            var cycle = (seconds % flashInterval);
            var isVisible = cycle < 0.12; 
            
            if (!isVisible) return [];
            
            var radiusDegrees = visualRadius / 111000;
            var offLon = (seededRandom(randomSeed + 1) - 0.5) * radiusDegrees * 1.5;
            var offLat = (seededRandom(randomSeed + 2) - 0.5) * radiusDegrees * 1.5;
            
            var startHeight = 35000 + seededRandom(randomSeed + 3) * 15000;
            var curLon = sample.lon + offLon;
            var curLat = sample.lat + offLat;
            var pts = [Cesium.Cartesian3.fromDegrees(curLon, curLat, startHeight)];
            
            var segments = segmentsCount + Math.floor(seededRandom(randomSeed + 4) * 10);
            var curAlt = startHeight;
            
            for (var s = 0; s < segments; s++) {
              var stepSize = 0.0025 + seededRandom(randomSeed + s) * 0.002;
              curLon += (seededRandom(randomSeed + s + 10) - 0.5) * stepSize;
              curLat += (seededRandom(randomSeed + s + 20) - 0.5) * stepSize;
              curAlt -= (startHeight / segments);
              
              pts.push(Cesium.Cartesian3.fromDegrees(curLon, curLat, Math.max(0, curAlt)));
              
              if (s % 5 === 0 && seededRandom(randomSeed + s + 30) < 0.35 && curAlt > 5000) {
                var bLon = curLon + (seededRandom(randomSeed + s + 40) - 0.5) * 0.015;
                var bLat = curLat + (seededRandom(randomSeed + s + 50) - 0.5) * 0.015;
                pts.push(Cesium.Cartesian3.fromDegrees(bLon, bLat, curAlt * 0.6));
                pts.push(Cesium.Cartesian3.fromDegrees(curLon, curLat, curAlt));
              }
            }
            return pts;
          }, false),
          width: 2.5 + intensity * 1.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: Cesium.Color.WHITE
          }),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000000)
        }
      });
      effects.push(bolt);

      var bloom = viewer.entities.add({
        name: "Orion.LightningBloom." + id,
        position: new Cesium.CallbackPositionProperty(function(time, result) {
            var seconds = time.secondsOfDay + lightningSeed;
            var timingPhase = Math.floor(seconds / 5.0);
            var randomSeed = lightningSeed + timingPhase * 100;
            var seededRandom = function(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); };
            var radiusDegrees = visualRadius / 111000;
            var offLon = (seededRandom(randomSeed + 1) - 0.5) * radiusDegrees * 1.5;
            var offLat = (seededRandom(randomSeed + 2) - 0.5) * radiusDegrees * 1.5;
            return Cesium.Cartesian3.fromDegrees(sample.lon + offLon, sample.lat + offLat, 0, Cesium.Ellipsoid.WGS84, result);
        }, false),
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(function(time) {
            var seconds = time.secondsOfDay + lightningSeed;
            var timingPhase = Math.floor(seconds / 5.0);
            var randomSeed = lightningSeed + timingPhase * 100;
            var seededRandom = function(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); };
            var flashInterval = 4.0 + seededRandom(randomSeed) * 6.0;
            var cycle = (seconds % flashInterval);
            if (cycle < 0.12) return visualRadius * (1.4 + seededRandom(randomSeed + 6) * 1.2);
            return 0;
          }, false),
          semiMinorAxis: new Cesium.CallbackProperty(function(time) {
            var seconds = time.secondsOfDay + lightningSeed;
            var timingPhase = Math.floor(seconds / 5.0);
            var randomSeed = lightningSeed + timingPhase * 100;
            var seededRandom = function(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); };
            var flashInterval = 4.0 + seededRandom(randomSeed) * 6.0;
            var cycle = (seconds % flashInterval);
            if (cycle < 0.12) return visualRadius * (1.4 + seededRandom(randomSeed + 6) * 1.2);
            return 0;
          }, false),
          material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(function(time) {
            var seconds = time.secondsOfDay + lightningSeed;
            var timingPhase = Math.floor(seconds / 5.0);
            var randomSeed = lightningSeed + timingPhase * 100;
            var seededRandom = function(seed) { var x = Math.sin(seed) * 10000; return x - Math.floor(x); };
            var flashInterval = 4.0 + seededRandom(randomSeed) * 6.0;
            var cycle = (seconds % flashInterval);
            var alpha = cycle < 0.12 ? (1.0 - (cycle / 0.12)) * 0.22 : 0;
            return Cesium.Color.WHITE.withAlpha(alpha);
          }, false)),
          height: 0,
          outline: false,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10000000)
        }
      });
      effects.push(bloom);

      return effects;
    }
  };

  window.Orion = Orion;

})(window);
