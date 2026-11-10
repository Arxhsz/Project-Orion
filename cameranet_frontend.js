
(function (window) {
  "use strict";

  var Orion = window.Orion;
  var USA_BBOX = { west: -125.2, south: 24.1, east: -66.7, north: 49.6 };

  var cameraNetState = {
    enabled: false,
    cameras: [],
    clusters: [],
    visibleCameraEntities: [],
    clusterEntities: [],
    selectedCamera: null,
    lastBboxKey: "",
    lastFetchTime: 0,
    fetchDebounceTimer: null,
    removeMoveEndListener: null,
    currentHls: null,
    currentResolverController: null,
    providerStatus: "standby",
    providerCount: 0,
    lastError: "",
    startupTimer: null,
    bboxCache: [],
    cacheLimit: 40,
    activeFetchKey: "",
    activeFetchPromise: null,
    activeFetchController: null,
    requestVersion: 0,
    renderSignature: ""
  };

  var CAMERA_CONFIG = {
    provider: "all",
    fetchDebounceMs: 200,
    minFetchInterval: 220,
    maxCamerasToRender: 1600,
    maxMetadata: 12000,
    closeHeight: 900000,
    midHeight: 2600000,
    farHeight: 8200000,
    billboardElevM: 24
  };

  var clusterIconCache = {};
  var cameraIconCache = {};

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCoord(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(5) : "--";
  }

  function isStaticHostMode() {
    return !!(Orion && Orion.Config && Orion.Config.Constants && Orion.Config.Constants.STATIC_HOST);
  }

  function cameraHasLiveVideo(camera) {
    if (!camera) {
      return false;
    }

    var streamType = String(camera.stream_type || "").toLowerCase();
    if (streamType === "embed") {
      return /^https:\/\//i.test(camera.embed_url || "");
    }
    if (streamType !== "hls" && streamType !== "mjpeg") {
      return false;
    }

    var directUrl = camera.upstream_stream_url ||
      (/^https?:\/\//i.test(camera.stream_url || "") ? camera.stream_url : "");
    var verifiedResolver = camera.stream_available === true && /^\/camera\/resolve/i.test(camera.stream_url || "");
    return Boolean(directUrl || (!isStaticHostMode() && verifiedResolver));
  }

  function disposePlayback() {
    if (cameraNetState.currentResolverController) {
      cameraNetState.currentResolverController.abort();
      cameraNetState.currentResolverController = null;
    }

    if (cameraNetState.currentHls) {
      try {
        cameraNetState.currentHls.destroy();
      } catch (error) {
      }
      cameraNetState.currentHls = null;
    }

    if (cameraNetState.startupTimer) {
      window.clearTimeout(cameraNetState.startupTimer);
      cameraNetState.startupTimer = null;
    }
  }

  function bboxFromRectangle(rectangle) {
    if (!rectangle) {
      return null;
    }

    return {
      west: Cesium.Math.toDegrees(rectangle.west),
      south: Cesium.Math.toDegrees(rectangle.south),
      east: Cesium.Math.toDegrees(rectangle.east),
      north: Cesium.Math.toDegrees(rectangle.north)
    };
  }

  function normalizeBbox(bbox) {
    if (!bbox) {
      return null;
    }

    var west = clamp(Math.min(bbox.west, bbox.east), -180, 180);
    var east = clamp(Math.max(bbox.west, bbox.east), -180, 180);
    var south = clamp(Math.min(bbox.south, bbox.north), -85, 85);
    var north = clamp(Math.max(bbox.south, bbox.north), -85, 85);
    var padLon = Math.max(0.18, (east - west) * 0.08);
    var padLat = Math.max(0.18, (north - south) * 0.08);

    return {
      west: clamp(west - padLon, -180, 180),
      south: clamp(south - padLat, -85, 85),
      east: clamp(east + padLon, -180, 180),
      north: clamp(north + padLat, -85, 85)
    };
  }

  function includeTargetInBbox(bbox) {
    var target = window.appState && window.appState.target;
    if (!bbox || !target || !Number.isFinite(target.lat) || !Number.isFinite(target.lon)) {
      return bbox;
    }

    var lonSpan = Math.max(0.1, bbox.east - bbox.west);
    var latSpan = Math.max(0.1, bbox.north - bbox.south);
    var nearView = target.lon >= bbox.west - Math.max(2, lonSpan * 0.5) &&
      target.lon <= bbox.east + Math.max(2, lonSpan * 0.5) &&
      target.lat >= bbox.south - Math.max(2, latSpan * 0.5) &&
      target.lat <= bbox.north + Math.max(2, latSpan * 0.5);

    if (!nearView) {
      return bbox;
    }

    return {
      west: clamp(Math.min(bbox.west, target.lon - 0.3), -180, 180),
      south: clamp(Math.min(bbox.south, target.lat - 0.3), -85, 85),
      east: clamp(Math.max(bbox.east, target.lon + 0.3), -180, 180),
      north: clamp(Math.max(bbox.north, target.lat + 0.3), -85, 85)
    };
  }

  function getVisibleBbox(viewer) {
    if (!viewer || !viewer.camera || !viewer.scene) {
      return USA_BBOX;
    }

    var rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    var bbox = normalizeBbox(bboxFromRectangle(rectangle));

    if (bbox) {
      return includeTargetInBbox(bbox);
    }

    var canvas = viewer.scene.canvas;
    var ellipsoid = viewer.scene.globe.ellipsoid;
    var points = [
      viewer.camera.pickEllipsoid(new Cesium.Cartesian2(0, 0), ellipsoid),
      viewer.camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth, 0), ellipsoid),
      viewer.camera.pickEllipsoid(new Cesium.Cartesian2(0, canvas.clientHeight), ellipsoid),
      viewer.camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth, canvas.clientHeight), ellipsoid)
    ].filter(Boolean);

    if (!points.length) {
      return USA_BBOX;
    }

    var cartos = points.map(function (cartesian) {
      return ellipsoid.cartesianToCartographic(cartesian);
    });
    var lons = cartos.map(function (carto) { return Cesium.Math.toDegrees(carto.longitude); });
    var lats = cartos.map(function (carto) { return Cesium.Math.toDegrees(carto.latitude); });

    return includeTargetInBbox(normalizeBbox({
      west: Math.min.apply(null, lons),
      south: Math.min.apply(null, lats),
      east: Math.max.apply(null, lons),
      north: Math.max.apply(null, lats)
    })) || USA_BBOX;
  }

  function bboxKey(bbox, height) {
    var precision = height > CAMERA_CONFIG.farHeight ? 1.0 : height > CAMERA_CONFIG.midHeight ? 0.35 : 0.12;
    return [
      Math.round(bbox.west / precision),
      Math.round(bbox.south / precision),
      Math.round(bbox.east / precision),
      Math.round(bbox.north / precision),
      Math.round(height / 250000)
    ].join(":");
  }

  function fetchBboxKey(bbox, height) {
    var precision = height > CAMERA_CONFIG.farHeight ? 2.0 : height > CAMERA_CONFIG.midHeight ? 0.8 : 0.28;
    return [
      Math.round(bbox.west / precision),
      Math.round(bbox.south / precision),
      Math.round(bbox.east / precision),
      Math.round(bbox.north / precision),
      metadataLimit(height)
    ].join(":");
  }

  function bboxContains(outer, inner) {
    if (!outer || !inner) {
      return false;
    }

    var toleranceLon = Math.max(0.02, (inner.east - inner.west) * 0.08);
    var toleranceLat = Math.max(0.02, (inner.north - inner.south) * 0.08);
    return outer.west <= inner.west + toleranceLon &&
      outer.east >= inner.east - toleranceLon &&
      outer.south <= inner.south + toleranceLat &&
      outer.north >= inner.north - toleranceLat;
  }

  function rememberCameraCache(key, bbox, cameras, providerCount) {
    var entry = {
      key: key,
      bbox: bbox,
      cameras: cameras,
      providerCount: providerCount || cameras.length,
      timestamp: Date.now()
    };

    cameraNetState.bboxCache = cameraNetState.bboxCache.filter(function (candidate) {
      return candidate.key !== key;
    });
    cameraNetState.bboxCache.unshift(entry);

    if (cameraNetState.bboxCache.length > cameraNetState.cacheLimit) {
      cameraNetState.bboxCache.length = cameraNetState.cacheLimit;
    }
  }

  function cachedCamerasForBbox(bbox) {
    var now = Date.now();
    var maxAge = 10 * 60 * 1000;

    for (var index = 0; index < cameraNetState.bboxCache.length; index++) {
      var entry = cameraNetState.bboxCache[index];
      if (now - entry.timestamp > maxAge) {
        continue;
      }
      if (bboxContains(entry.bbox, bbox)) {
        cameraNetState.bboxCache.splice(index, 1);
        cameraNetState.bboxCache.unshift(entry);
        return entry;
      }
    }

    return null;
  }

  function metadataLimit(height) {
    if (height > CAMERA_CONFIG.farHeight) {
      return CAMERA_CONFIG.maxMetadata;
    }
    if (height > CAMERA_CONFIG.midHeight) {
      return 6000;
    }
    return 3000;
  }

  function fetchCamerasForBbox(viewer, bbox, key) {
    if (!bbox) {
      return Promise.resolve([]);
    }

    var height = viewer.camera.positionCartographic.height;
    var bboxStr = [bbox.west, bbox.south, bbox.east, bbox.north].map(function (value) {
      return value.toFixed(5);
    }).join(",");
    var url = isStaticHostMode()
      ? "pages-data/live/cameras.json"
      : "/live/cameras?provider=" + encodeURIComponent(CAMERA_CONFIG.provider) +
        "&bbox=" + encodeURIComponent(bboxStr) +
        "&limit=" + metadataLimit(height);

    if (key && cameraNetState.activeFetchKey === key && cameraNetState.activeFetchPromise) {
      return cameraNetState.activeFetchPromise;
    }

    if (cameraNetState.activeFetchController) {
      cameraNetState.activeFetchController.abort();
    }

    var requestVersion = ++cameraNetState.requestVersion;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;

    cameraNetState.providerStatus = "loading";
    cameraNetState.lastError = "";

    cameraNetState.activeFetchKey = key || "";
    cameraNetState.activeFetchController = controller;
    cameraNetState.activeFetchPromise = fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("CameraNet HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (requestVersion !== cameraNetState.requestVersion) {
          return null;
        }
        var cameras = Array.isArray(data.cameras) ? data.cameras.filter(cameraHasLiveVideo) : [];
        if (isStaticHostMode()) {
          cameras = cameras.filter(function (camera) {
            var lat = Number(camera.lat);
            var lon = Number(camera.lon);
            return Number.isFinite(lat) && Number.isFinite(lon) &&
              lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north;
          }).slice(0, metadataLimit(height));
        }
        cameraNetState.providerStatus = cameras.length ? "active" : (data.error ? "error" : "empty");
        cameraNetState.providerCount = data.total || data.count || cameras.length;
        cameraNetState.lastError = data.error || "";
        rememberCameraCache(key || bboxStr, bbox, cameras, cameraNetState.providerCount);
        syncPlatformFeedState(cameras.length ? "online" : (data.error ? "offline" : "empty"), cameras, data.error);
        refreshIntelList();
        return cameras;
      })
      .catch(function (error) {
        if (requestVersion !== cameraNetState.requestVersion || (error && error.name === "AbortError")) {
          return null;
        }
        cameraNetState.providerStatus = "error";
        cameraNetState.lastError = error.message || String(error);
        syncPlatformFeedState("offline", null, cameraNetState.lastError);
        refreshIntelList();
        return [];
      })
      .finally(function () {
        if (requestVersion === cameraNetState.requestVersion) {
          cameraNetState.activeFetchKey = "";
          cameraNetState.activeFetchPromise = null;
          cameraNetState.activeFetchController = null;
        }
      });

    return cameraNetState.activeFetchPromise;
  }

  function primeClusterViewport(viewer, cluster) {
    if (!viewer || !cluster || !Number.isFinite(cluster.lon) || !Number.isFinite(cluster.lat)) {
      return;
    }
    var pad = 0.58;
    var bbox = normalizeBbox({
      west: cluster.lon - pad,
      south: cluster.lat - pad,
      east: cluster.lon + pad,
      north: cluster.lat + pad
    });
    var height = viewer.camera.positionCartographic.height;
    var key = "cluster-prime-" + fetchBboxKey(bbox, height);
    fetchCamerasForBbox(viewer, bbox, key).then(function (cameras) {
      if (!cameraNetState.enabled || !Array.isArray(cameras)) {
        return;
      }
      cameraNetState.cameras = cameras;
      cameraNetState.renderSignature = "";
      updateCameraNet(viewer);
    });
  }

  function refreshIntelList() {
    if (typeof window.refreshOrionIntelList === "function") {
      window.refreshOrionIntelList();
    }
  }

  function syncPlatformFeedState(status, cameras, error) {
    if (!window.platformFeeds) {
      return;
    }
    var current = window.platformFeeds.cameras || {};
    window.platformFeeds.cameras = Object.assign({}, current, {
      status: status,
      items: Array.isArray(cameras) ? cameras : (current.items || []),
      error: error || "",
      loadedAt: Date.now()
    });
  }

  function clusterStep(height) {
    if (height > 5200000) {
      return 6.5;
    }
    if (height > CAMERA_CONFIG.farHeight) {
      return 5.0;
    }
    if (height > CAMERA_CONFIG.midHeight) {
      return 2.8;
    }
    if (height > CAMERA_CONFIG.closeHeight) {
      return 0.62;
    }
    if (height > 340000) {
      return 0.16;
    }
    if (height > 120000) {
      return 0.05;
    }
    return 0;
  }

  function screenClusterCameras(viewer, cameras, cameraHeight) {
    var cellSize = cameraHeight > 5200000 ? 84 : 66;
    var canvas = viewer.scene.canvas;
    var ellipsoid = viewer.scene.globe.ellipsoid;
    var occluder = new Cesium.EllipsoidalOccluder(ellipsoid, viewer.camera.positionWC);
    var grid = {};

    cameras.forEach(function (camera) {
      var lat = Number(camera.lat);
      var lon = Number(camera.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      var position = Cesium.Cartesian3.fromDegrees(lon, lat, CAMERA_CONFIG.billboardElevM);
      if (!occluder.isPointVisible(position)) {
        return;
      }

      var screen = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
      if (!screen || screen.x < -cellSize || screen.y < -cellSize ||
          screen.x > canvas.clientWidth + cellSize || screen.y > canvas.clientHeight + cellSize) {
        return;
      }

      var key = Math.round(screen.x / cellSize) + "," + Math.round(screen.y / cellSize);
      var item = grid[key] || {
        type: "cluster",
        camera: camera,
        latSum: 0,
        lonSum: 0,
        lat: lat,
        lon: lon,
        count: 0
      };
      item.latSum += lat;
      item.lonSum += lon;
      item.count += 1;
      item.lat = item.latSum / item.count;
      item.lon = item.lonSum / item.count;
      grid[key] = item;
    });

    return Object.keys(grid).map(function (key) {
      var item = grid[key];
      if (item.count === 1) {
        return { type: "camera", camera: item.camera, lat: item.lat, lon: item.lon, count: 1 };
      }
      item.camera = null;
      return item;
    });
  }

  function clusterCameras(cameras, cameraHeight, viewer) {
    if (viewer && cameraHeight > CAMERA_CONFIG.closeHeight) {
      return screenClusterCameras(viewer, cameras, cameraHeight);
    }

    var step = clusterStep(cameraHeight);
    if (!step) {
      return cameras.map(function (camera) {
        return { type: "camera", camera: camera, lat: camera.lat, lon: camera.lon, count: 1 };
      });
    }

    var grid = {};
    cameras.forEach(function (camera) {
      var lat = Number(camera.lat);
      var lon = Number(camera.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      var key = Math.floor(lat / step) + "," + Math.floor(lon / step);
      if (!grid[key]) {
        grid[key] = {
          type: "cluster",
          camera: camera,
          latSum: 0,
          lonSum: 0,
          lat: lat,
          lon: lon,
          count: 0
        };
      }

      grid[key].latSum += lat;
      grid[key].lonSum += lon;
      grid[key].count += 1;
      grid[key].lat = grid[key].latSum / grid[key].count;
      grid[key].lon = grid[key].lonSum / grid[key].count;
    });

    return Object.keys(grid).map(function (key) {
      var item = grid[key];
      if (item.count === 1) {
        return { type: "camera", camera: item.camera, lat: item.lat, lon: item.lon, count: 1 };
      }
      item.camera = null;
      return item;
    });
  }
  function prioritizeCamerasForView(viewer, cameras, maxCount) {
    if (!viewer || !cameras || !cameras.length) {
      return cameras || [];
    }
    maxCount = Math.max(100, maxCount || CAMERA_CONFIG.maxCamerasToRender);
    var bbox = getVisibleBbox(viewer);
    var centerLon = (bbox.west + bbox.east) * 0.5;
    var centerLat = (bbox.south + bbox.north) * 0.5;

    try {
      var canvas = viewer.scene.canvas;
      var c2 = new Cesium.Cartesian2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5);
      var picked = viewer.camera.pickEllipsoid(c2, viewer.scene.globe.ellipsoid);
      if (picked) {
        var cg = Cesium.Cartographic.fromCartesian(picked);
        centerLon = Cesium.Math.toDegrees(cg.longitude);
        centerLat = Cesium.Math.toDegrees(cg.latitude);
      }
    } catch (err) {
    }

    var lonSpan = Math.max(0.06, bbox.east - bbox.west);
    var latSpan = Math.max(0.06, bbox.north - bbox.south);
    var padLon = lonSpan * 0.42 + 0.05;
    var padLat = latSpan * 0.42 + 0.05;
    var winW = bbox.west - padLon;
    var winS = bbox.south - padLat;
    var winE = bbox.east + padLon;
    var winN = bbox.north + padLat;

    var scored = [];
    for (var i = 0; i < cameras.length; i++) {
      var cam = cameras[i];
      var lat = Number(cam.lat);
      var lon = Number(cam.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      var dLat = lat - centerLat;
      var dLon = lon - centerLon;
      var dist2 = dLat * dLat + dLon * dLon;
      var inWin = lon >= winW && lon <= winE && lat >= winS && lat <= winN ? 0 : 1;
      scored.push({ cam: cam, dist2: dist2, inWin: inWin });
    }

    if (!scored.length) {
      return cameras.slice(0, maxCount);
    }

    scored.sort(function (a, b) {
      if (a.inWin !== b.inWin) {
        return a.inWin - b.inWin;
      }
      return a.dist2 - b.dist2;
    });

    var out = [];
    for (var j = 0; j < scored.length && out.length < maxCount; j++) {
      out.push(scored[j].cam);
    }
    return out;
  }

  function viewSignature(viewer) {
    if (!viewer || !viewer.camera) {
      return "0,0";
    }
    var bbox = getVisibleBbox(viewer);
    var cx = ((bbox.west + bbox.east) * 0.5).toFixed(3);
    var cy = ((bbox.south + bbox.north) * 0.5).toFixed(3);
    var span = Math.max(bbox.east - bbox.west, bbox.north - bbox.south).toFixed(3);
    return cx + "," + cy + "," + span;
  }

  function clusterIconKey(count) {
    if (count < 25) return 'cluster-small';
    if (count < 100) return 'cluster-medium';
    if (count < 500) return 'cluster-large';
    return 'cluster-xlarge';
  }

  function cameraIconKey(selected) {
    return selected ? 'camera-selected' : 'camera-online';
  }

  function clusterEntityId(cluster) {
    return "cn-c-" + Math.round(cluster.lat * 500) + "-" + Math.round(cluster.lon * 500) + "-" + cluster.count;
  }

  function cameraEntityId(camera) {
    var raw = String(camera.id || camera.name || camera.lat + "," + camera.lon);
    return "cn-m-" + raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  }

  function safeGetIcon(key) {
    if (window.OrionTextureManager && typeof window.OrionTextureManager.getIcon === 'function') {
      return window.OrionTextureManager.getIcon(key);
    }
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='8' fill='white'/></svg>");
  }

  function createClusterEntity(viewer, cluster) {
    var z = CAMERA_CONFIG.billboardElevM;
    var entityId = clusterEntityId(cluster);
    var existing = viewer.entities.getById(entityId);
    
    var iconKey = clusterIconKey(cluster.count);
    var labelText = cluster.count > 999 ? (Math.round(cluster.count / 100) / 10) + "K" : String(cluster.count);

    if (existing) {
      existing.position = Cesium.Cartesian3.fromDegrees(cluster.lon, cluster.lat, z);
      if (existing.billboard) {
        existing.billboard.image = safeGetIcon(iconKey);
      }
      if (existing.label) {
        existing.label.text = labelText;
      }
      return existing;
    }

    return viewer.entities.add({
      id: entityId,
      position: Cesium.Cartesian3.fromDegrees(cluster.lon, cluster.lat, z),
      billboard: {
        image: safeGetIcon(iconKey),
        width: clamp(30 + Math.log(cluster.count) * 3.2, 34, 54),
        height: clamp(30 + Math.log(cluster.count) * 3.2, 34, 54),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 24000000),
        verticalOrigin: Cesium.VerticalOrigin.CENTER
      },
      label: {
        text: labelText,
        font: "900 14px Inter, Arial, sans-serif",
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 24000000)
      },
      properties: {
        type: "cameraCluster",
        cluster: cluster
      }
    });
  }

  function createCameraEntity(viewer, camera) {
    var selected = cameraNetState.selectedCamera && cameraNetState.selectedCamera.id === camera.id;
    var z = CAMERA_CONFIG.billboardElevM;
    var entityId = cameraEntityId(camera);
    var existing = viewer.entities.getById(entityId);
    var iconKey = cameraIconKey(selected);

    if (existing) {
      if (existing.billboard) {
        existing.billboard.image = safeGetIcon(iconKey);
        existing.billboard.width = selected ? 36 : 28;
        existing.billboard.height = selected ? 36 : 28;
      }
      if (existing.label) {
        existing.label.show = selected;
      }
      return existing;
    }

    return viewer.entities.add({
      id: entityId,
      name: camera.name,
      position: Cesium.Cartesian3.fromDegrees(Number(camera.lon), Number(camera.lat), z),
      billboard: {
        image: safeGetIcon(iconKey),
        width: selected ? 36 : 28,
        height: selected ? 36 : 28,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000000),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(420, 1.12, 2.4e6, 0.74)
      },
      label: {
        text: camera.name || "CameraNet camera",
        font: "11px Inter, Arial, sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 4),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 920000),
        show: selected
      },
      polyline: camera.heading != null ? {
        positions: (function () {
          var bearing = Cesium.Math.toRadians(camera.heading), lat = Number(camera.lat), lon = Number(camera.lon);
          return Cesium.Cartesian3.fromDegreesArrayHeights([lon, lat, z, lon + Math.sin(bearing) * .001 / Math.max(.1,Math.cos(Cesium.Math.toRadians(lat))), lat + Math.cos(bearing) * .001, z]);
        })(), width: 3, material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.WHITE),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 100000)
      } : undefined,
      properties: {
        type: "camera",
        camera: camera
      }
    });
  }

  function clearEntities(viewer) {
    cameraNetState.clusterEntities.forEach(function (entity) {
      viewer.entities.remove(entity);
    });
    cameraNetState.visibleCameraEntities.forEach(function (entity) {
      viewer.entities.remove(entity);
    });
    cameraNetState.clusterEntities = [];
    cameraNetState.visibleCameraEntities = [];
  }

  function updateCameraNet(viewer) {
    if (!cameraNetState.enabled || !viewer) {
      return;
    }

    if (!cameraNetState.cameras.length) {
      clearEntities(viewer);
      cameraNetState.renderSignature = "";
      return;
    }

    var cameraHeight = viewer.camera.positionCartographic.height;
    var clustered = clusterCameras(cameraNetState.cameras, cameraHeight, viewer);
    var prioritized = prioritizeCamerasForView(viewer, clustered, CAMERA_CONFIG.maxCamerasToRender);
    var signature = [
      cameraNetState.cameras.length,
      prioritized.length,
      Math.round(cameraHeight / 45000),
      viewSignature(viewer),
      cameraNetState.selectedCamera ? cameraNetState.selectedCamera.id : "",
      prioritized.length
    ].join(":");

    if (signature === cameraNetState.renderSignature) {
      viewer.scene.requestRender();
      return;
    }

    cameraNetState.renderSignature = signature;
    cameraNetState.clusters = prioritized;

    var renderItems = prioritized;
    if (cameraHeight > CAMERA_CONFIG.farHeight) {
      renderItems = renderItems.filter(function (item) {
        return item.type === "cluster" && item.count > 1;
      });
    }

    var nextClusterIds = {};
    var nextCameraIds = {};
    var nextClusters = [];
    var nextCameras = [];

    renderItems.forEach(function (item) {
      if (item.type === "cluster" && item.count > 1) {
        var clusterEnt = createClusterEntity(viewer, item);
        nextClusterIds[clusterEnt.id] = true;
        nextClusters.push(clusterEnt);
        return;
      }

      var camera = item.camera;
      if (camera) {
        var cameraEnt = createCameraEntity(viewer, camera);
        nextCameraIds[cameraEnt.id] = true;
        nextCameras.push(cameraEnt);
      }
    });

    cameraNetState.clusterEntities.forEach(function (entity) {
      if (!nextClusterIds[entity.id]) {
        viewer.entities.remove(entity);
      }
    });

    cameraNetState.visibleCameraEntities.forEach(function (entity) {
      if (!nextCameraIds[entity.id]) {
        viewer.entities.remove(entity);
      }
    });

    cameraNetState.clusterEntities = nextClusters;
    cameraNetState.visibleCameraEntities = nextCameras;

    viewer.scene.requestRender();
    refreshIntelList();
  }

  function getDebugStats() {
    return {
      cameras: cameraNetState.visibleCameraEntities.length,
      clusters: cameraNetState.clusterEntities.length,
      metadata: cameraNetState.cameras.length
    };
  }

  function requestVisibleCameras(viewer, force) {
    if (!cameraNetState.enabled || !viewer) {
      return;
    }

    var now = Date.now();
    var height = viewer.camera.positionCartographic.height;
    var bbox = getVisibleBbox(viewer);
    var key = bboxKey(bbox, height);
    var requestKey = fetchBboxKey(bbox, height);
    var cached = cachedCamerasForBbox(bbox);

    if (cached) {
      cameraNetState.cameras = cached.cameras;
      cameraNetState.providerCount = cached.providerCount || cached.cameras.length;
      cameraNetState.providerStatus = cached.cameras.length ? "active" : "empty";
      updateCameraNet(viewer);

      if (!force && now - cached.timestamp < 5 * 60 * 1000) {
        cameraNetState.lastBboxKey = key;
        return;
      }
    }

    if (!force && key === cameraNetState.lastBboxKey && now - cameraNetState.lastFetchTime < 9000) {
      updateCameraNet(viewer);
      return;
    }

    if (!force && now - cameraNetState.lastFetchTime < CAMERA_CONFIG.minFetchInterval) {
      updateCameraNet(viewer);
      return;
    }

    cameraNetState.lastBboxKey = key;
    cameraNetState.lastFetchTime = now;

    fetchCamerasForBbox(viewer, bbox, requestKey).then(function (cameras) {
      if (!Array.isArray(cameras) || !cameraNetState.enabled) {
        return;
      }
      cameraNetState.cameras = cameras;
      cameraNetState.renderSignature = "";
      updateCameraNet(viewer);
    });
  }

  function queueVisibleCameraRequest(viewer, force) {
    window.clearTimeout(cameraNetState.fetchDebounceTimer);
    cameraNetState.fetchDebounceTimer = window.setTimeout(function () {
      requestVisibleCameras(viewer, force);
    }, force ? 0 : CAMERA_CONFIG.fetchDebounceMs);
  }

  function renderEmbeddedFeed(camera) {
    var frame = document.getElementById("cameraFrame");
    if (!frame || !camera.embed_url) {
      return false;
    }

    frame.innerHTML = [
      "<div class='camera-live-shell camera-embed-shell'>",
      "<iframe title='", escapeHtml(camera.name || "Public live camera"), "' src='", escapeHtml(camera.embed_url), "' allow='autoplay; fullscreen; picture-in-picture' allowfullscreen loading='eager' referrerpolicy='no-referrer-when-downgrade'></iframe>",
      "<span class='camera-live-badge'>LIVE</span>",
      "<span class='camera-live-clock'>PUBLIC EMBED</span>",
      "</div>"
    ].join("");
    return true;
  }

  function renderLiveUnavailable(message) {
    var frame = document.getElementById("cameraFrame");
    if (!frame) {
      return;
    }

    frame.innerHTML = [
      "<div class='camera-feed-message'>",
      "<strong>Live feed unavailable</strong>",
      "<span>", escapeHtml(message || "The provider stream could not be played."), "</span>",
      "</div>"
    ].join("");
  }

  function renderMjpeg(camera, streamUrl) {
    var frame = document.getElementById("cameraFrame");
    if (!frame || !streamUrl) {
      renderLiveUnavailable("The provider did not supply a playable MJPEG stream.");
      return;
    }

    frame.innerHTML = [
      "<div class='camera-live-shell'>",
      "<img id='cameraNetMjpeg' alt='", escapeHtml(camera.name || "CameraNet live camera"), "' src='", escapeHtml(streamUrl), "'>",
      "<span class='camera-live-badge'>LIVE</span>",
      "<span class='camera-live-clock'>LIVE MJPEG</span>",
      "</div>"
    ].join("");

    var image = document.getElementById("cameraNetMjpeg");
    if (image) {
      image.addEventListener("error", function () {
        renderLiveUnavailable("The provider MJPEG stream stopped responding.");
      }, { once: true });
    }
  }

  function playHls(camera, streamData) {
    var frame = document.getElementById("cameraFrame");
    if (!frame || !streamData || !streamData.stream_url) {
      renderLiveUnavailable("The provider did not supply a playable HLS stream.");
      return;
    }

    frame.innerHTML = [
      "<div class='camera-live-shell'>",
      "<video id='cameraNetVideo' controls autoplay muted playsinline></video>",
      "<span class='camera-live-badge'>LIVE</span>",
      "<span class='camera-live-clock'>LIVE HLS</span>",
      "</div>"
    ].join("");

    var video = document.getElementById("cameraNetVideo");
    if (!video) {
      renderLiveUnavailable("The live video player could not be created.");
      return;
    }

    var failureShown = false;
    var showFailure = function () {
      if (failureShown) {
        return;
      }
      failureShown = true;
      disposePlayback();
      renderLiveUnavailable("The provider HLS stream did not start or stopped responding.");
    };
    var started = false;
    cameraNetState.startupTimer = window.setTimeout(function () {
      if (!started && video.readyState < 2) {
        showFailure();
      }
    }, 6500);
    video.addEventListener("playing", function () {
      started = true;
      window.clearTimeout(cameraNetState.startupTimer);
      cameraNetState.startupTimer = null;
    }, { once: true });
    video.addEventListener("loadeddata", function () {
      started = true;
      window.clearTimeout(cameraNetState.startupTimer);
      cameraNetState.startupTimer = null;
    }, { once: true });

    if (window.Hls && Hls.isSupported()) {
      var networkRecoveries = 0;
      var mediaRecoveries = 0;
      var hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
        backBufferLength: 30,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 8,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 700,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 700,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 8000
      });
      cameraNetState.currentHls = hls;
      video.preload = "auto";
      hls.loadSource(streamData.stream_url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        video.play().catch(function () {});
      });
      hls.on(Hls.Events.MEDIA_ATTACHED, function () {
        video.play().catch(function () {});
      });
      hls.on(Hls.Events.ERROR, function (_event, data) {
        if (data && data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            networkRecoveries += 1;
            if (networkRecoveries <= 2) {
              hls.startLoad();
              return;
            }
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaRecoveries += 1;
            if (mediaRecoveries <= 1) {
              hls.recoverMediaError();
              return;
            }
          }
          showFailure();
        }
      });
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamData.stream_url;
      video.addEventListener("error", showFailure, { once: true });
      video.addEventListener("loadedmetadata", function () {
        video.play().catch(function () {});
      }, { once: true });
      return;
    }

    showFailure();
  }

  async function openCameraDetailPanel(camera) {
    var panel = document.getElementById("cameraWindow");
    var title = document.getElementById("cameraTitle");
    var meta = document.getElementById("cameraMeta");
    var frame = document.getElementById("cameraFrame");

    if (!panel || !frame) {
      return;
    }

    disposePlayback();
    document.getElementById("cameraAvailability")?.remove();
    cameraNetState.selectedCamera = camera;
    refreshIntelList();

    if (title) {
      title.textContent = camera.name || "CameraNet camera";
    }

    if (meta) {
      meta.textContent = [
        camera.provider || "CameraNet",
        camera.status || "UNKNOWN",
        camera.city,
        camera.heading != null ? "Facing " + camera.heading + "°" : "Facing direction unavailable",
        camera.road || camera.state || "traffic camera",
        camera.county || camera.district || "statewide",
        camera.stream_type || "HLS",
        formatCoord(camera.lat) + ", " + formatCoord(camera.lon)
      ].filter(Boolean).join(" / ");
    }

    frame.innerHTML = [
      "<div class='camera-feed-message'>",
      "<strong>Resolving live stream</strong>",
      "<span>Camera feed loads on demand</span>",
      "</div>"
    ].join("");
    panel.classList.remove("hidden");
    document.getElementById('cameraDetailActions')?.remove();
    var actions = document.createElement('div'); actions.id='cameraDetailActions'; actions.className='camera-detail-actions';
    function action(text, handler) { var b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',handler);actions.appendChild(b);return b; }
    action('Copy coordinates', async function() { try { await navigator.clipboard.writeText(formatCoord(camera.lat)+', '+formatCoord(camera.lon));this.textContent='Copied'; } catch(error) { this.textContent='Copy unavailable'; } });
    action('Center', function() { window.Orion.CameraFlight.focus(window.viewer, {lon:Number(camera.lon),lat:Number(camera.lat)}, {range:4200}); });
    var favorites=[];try {favorites=JSON.parse(localStorage.getItem('orion_camera_favorites')||'[]');if(!Array.isArray(favorites))favorites=[];}catch(error){favorites=[];}
    var favorite=action(favorites.includes(camera.id)?'★ Saved':'☆ Favorite',function(){
      favorites=favorites.includes(camera.id)?favorites.filter(function(id){return id!==camera.id;}):favorites.concat(camera.id);
      try {localStorage.setItem('orion_camera_favorites',JSON.stringify(favorites));this.textContent=favorites.includes(camera.id)?'★ Saved':'☆ Favorite';}catch(error){this.textContent='Storage unavailable';}
    });
    if(/^https?:\/\//.test(camera.source_url||'')) {var source=document.createElement('a');source.href=camera.source_url;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Open publisher';actions.appendChild(source);}
    action('Nearby cameras',function(){
      var old=document.getElementById('cameraNearby');if(old){old.remove();return;}
      var list=document.createElement('div');list.id='cameraNearby';
      var nearest=cameraNetState.cameras.filter(function(c){return c.id!==camera.id;}).map(function(c){return {camera:c,d:Math.hypot((c.lon-camera.lon)*Math.cos(camera.lat*Math.PI/180),c.lat-camera.lat)};}).filter(function(c){return c.d<.5;}).sort(function(a,b){return a.d-b.d;}).slice(0,5);
      if(!nearest.length)list.textContent='No nearby cameras in the loaded area';
      nearest.forEach(function(item){var b=document.createElement('button');b.type='button';b.textContent=item.camera.name;b.addEventListener('click',function(){list.remove();openCameraDetailPanel(item.camera);});list.appendChild(b);});actions.appendChild(list);
    });
    meta.after(actions);

    if (!isStaticHostMode()) {
      try {
        var healthResponse = await fetch('/camera/health?id=' + encodeURIComponent(camera.id), {signal:AbortSignal.timeout(10000)});
        var health = await healthResponse.json();
        if (cameraNetState.selectedCamera !== camera) return;
        camera.status = health.status;
        var status = document.createElement('p'); status.id='cameraAvailability'; meta.after(status);
        status.textContent = health.status + ' · ' + (health.message || 'Feed checked') + (health.last_checked ? ' · checked ' + new Date(health.last_checked*1000).toLocaleTimeString() : '');
        if (health.status === 'OFFLINE') { renderLiveUnavailable(health.message); return; }
      } catch(error) {
        if (cameraNetState.selectedCamera !== camera) return;
        var status = document.createElement('p'); status.id='cameraAvailability';meta.after(status);
        status.textContent='UNKNOWN · Independent availability check did not respond';
      }
    }
    var streamType = String(camera.stream_type || "").toLowerCase();
    if (streamType === "embed" && camera.embed_url) {
      renderEmbeddedFeed(camera);
      return;
    }

    var directStaticStream = camera.upstream_stream_url ||
      (/^https?:\/\//i.test(camera.stream_url || "") ? camera.stream_url : "");
    if (streamType === "mjpeg" && directStaticStream) {
      renderMjpeg(camera, directStaticStream);
      return;
    }
    if (streamType === "hls" && directStaticStream &&
        (isStaticHostMode() || !camera.stream_url || /^https?:\/\//i.test(camera.stream_url))) {
      playHls(camera, { stream_url: directStaticStream });
      return;
    }

    if (streamType === "hls" && camera.stream_url) {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      cameraNetState.currentResolverController = controller;
      fetch(camera.stream_url, {
        headers: { Accept: "application/json" },
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          return response.json().then(function (data) {
            data.httpStatus = response.status;
            data.httpOk = response.ok;
            if (typeof data.ok === "undefined") {
              data.ok = response.ok;
            }
            return data;
          });
        })
        .then(function (streamData) {
          cameraNetState.currentResolverController = null;
          if (!streamData.ok || streamData.error || !streamData.stream_url) {
            renderLiveUnavailable(streamData.message || "The provider could not resolve this live stream.");
            return;
          }
          playHls(camera, streamData);
        })
        .catch(function (error) {
          cameraNetState.currentResolverController = null;
          if (error && error.name === "AbortError") {
            return;
          }
          renderLiveUnavailable("The live stream resolver did not respond.");
        });
      return;
    }

    renderLiveUnavailable("This camera does not expose browser-playable live video.");
  }

  function onCameraNetClick(viewer, pickedObject) {
    if (!cameraNetState.enabled || !pickedObject || !pickedObject.id || !pickedObject.id.properties) {
      return false;
    }

    var props = pickedObject.id.properties;
    var type = props.type && props.type.getValue();

    if (type === "cameraCluster") {
      var cluster = props.cluster.getValue();
      primeClusterViewport(viewer, cluster);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(cluster.lon, cluster.lat, Math.max(90000, viewer.camera.positionCartographic.height * 0.34)),
        duration: 0.85,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
      });
      return true;
    }

    if (type === "camera") {
      var camera = props.camera.getValue();
      openCameraDetailPanel(camera);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(Number(camera.lon), Number(camera.lat), 4200),
        duration: 1.0,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
      });
      updateCameraNet(viewer);
      return true;
    }

    return false;
  }

  function selectCameraById(viewer, id) {
    if (!viewer || !id) {
      return false;
    }

    var camera = cameraNetState.cameras.find(function (candidate) {
      return String(candidate.id) === String(id);
    });

    if (!camera) {
      return false;
    }

    openCameraDetailPanel(camera);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(Number(camera.lon), Number(camera.lat), 4200),
      duration: 0.9,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
    });
    updateCameraNet(viewer);
    return true;
  }

  function getSelectableCameras() {
    if (!cameraNetState.enabled) {
      return [];
    }

    return cameraNetState.cameras.slice(0, 300).map(function (camera) {
      return Object.assign({}, camera, {
        selected: cameraNetState.selectedCamera && cameraNetState.selectedCamera.id === camera.id
      });
    });
  }

  function enableCameraNet(viewer) {
    if (!viewer) {
      return;
    }

    cameraNetState.enabled = true;

    if (!cameraNetState.removeMoveEndListener) {
      cameraNetState.removeMoveEndListener = viewer.camera.moveEnd.addEventListener(function () {
        queueVisibleCameraRequest(viewer, false);
      });
    }

    queueVisibleCameraRequest(viewer, true);
  }

  function disableCameraNet(viewer) {
    cameraNetState.enabled = false;
    cameraNetState.requestVersion += 1;
    if (cameraNetState.activeFetchController) {
      cameraNetState.activeFetchController.abort();
      cameraNetState.activeFetchController = null;
    }
    cameraNetState.activeFetchKey = "";
    cameraNetState.activeFetchPromise = null;
    disposePlayback();

    if (cameraNetState.removeMoveEndListener) {
      cameraNetState.removeMoveEndListener();
      cameraNetState.removeMoveEndListener = null;
    }

    if (viewer) {
      clearEntities(viewer);
      viewer.scene.requestRender();
    }

    cameraNetState.cameras = [];
    cameraNetState.clusters = [];
    cameraNetState.selectedCamera = null;
    cameraNetState.providerStatus = "standby";
    cameraNetState.renderSignature = "";
    syncPlatformFeedState("standby", [], "");
  }

  if (Orion) {
    Orion.Telemetry.CameraNet = {
      enable: enableCameraNet,
      disable: disableCameraNet,
      onClick: onCameraNetClick,
      selectCameraById: selectCameraById,
      getSelectableCameras: getSelectableCameras,
      update: updateCameraNet,
      getDebugStats: getDebugStats,
      state: cameraNetState
    };
  }

  window.CameraNet = Orion ? Orion.Telemetry.CameraNet : {
    enable: enableCameraNet,
    disable: disableCameraNet,
    onClick: onCameraNetClick,
    selectCameraById: selectCameraById,
    getSelectableCameras: getSelectableCameras,
    update: updateCameraNet,
    getDebugStats: getDebugStats,
    state: cameraNetState
  };

  console.log("[OrionCameraNet] Integrated into Orion.Telemetry");
})(window);
