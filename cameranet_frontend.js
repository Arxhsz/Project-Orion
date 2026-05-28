
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
    snapshotRefreshTimer: null,
    removeMoveEndListener: null,
    currentHls: null,
    providerStatus: "standby",
    providerCount: 0,
    lastError: "",
    startupTimer: null,
    bboxCache: [],
    cacheLimit: 40,
    activeFetchKey: "",
    activeFetchPromise: null,
    renderSignature: "",
    usPrefetchStarted: false,
    cameraChangedTimer: null,
    removeCameraChangedListener: null
  };

  var CAMERA_CONFIG = {
    provider: "all",
    fetchDebounceMs: 200,
    minFetchInterval: 220,
    maxCamerasToRender: 3000,
    maxMetadata: 32000,
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

  function disposePlayback() {
    if (cameraNetState.currentHls) {
      try {
        cameraNetState.currentHls.destroy();
      } catch (error) {
      }
      cameraNetState.currentHls = null;
    }

    if (cameraNetState.snapshotRefreshTimer) {
      window.clearInterval(cameraNetState.snapshotRefreshTimer);
      cameraNetState.snapshotRefreshTimer = null;
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

  function getVisibleBbox(viewer) {
    if (!viewer || !viewer.camera || !viewer.scene) {
      return USA_BBOX;
    }

    var rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    var bbox = normalizeBbox(bboxFromRectangle(rectangle));

    if (bbox) {
      return bbox;
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

    return normalizeBbox({
      west: Math.min.apply(null, lons),
      south: Math.min.apply(null, lats),
      east: Math.max.apply(null, lons),
      north: Math.max.apply(null, lats)
    }) || USA_BBOX;
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
      return 18000;
    }
    return 4200;
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

    cameraNetState.providerStatus = "loading";
    cameraNetState.lastError = "";

    cameraNetState.activeFetchKey = key || "";
    cameraNetState.activeFetchPromise = fetch(url, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("CameraNet HTTP " + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        var cameras = Array.isArray(data.cameras) ? data.cameras : [];
        cameraNetState.providerStatus = cameras.length ? "active" : (data.error ? "error" : "empty");
        cameraNetState.providerCount = data.total || data.count || cameras.length;
        cameraNetState.lastError = data.error || "";
        rememberCameraCache(key || bboxStr, bbox, cameras, cameraNetState.providerCount);
        refreshIntelList();
        return cameras;
      })
      .catch(function (error) {
        cameraNetState.providerStatus = "error";
        cameraNetState.lastError = error.message || String(error);
        refreshIntelList();
        return [];
      })
      .finally(function () {
        if (!key || cameraNetState.activeFetchKey === key) {
          cameraNetState.activeFetchKey = "";
          cameraNetState.activeFetchPromise = null;
        }
      });

    return cameraNetState.activeFetchPromise;
  }

  function prefetchContinentalUS(viewer) {
    if (cameraNetState.usPrefetchStarted || !viewer || !cameraNetState.enabled) {
      return;
    }
    cameraNetState.usPrefetchStarted = true;
    var bbox = normalizeBbox(USA_BBOX);
    var height = viewer.camera.positionCartographic.height;
    var key = "us-continental-" + fetchBboxKey(bbox, height);
    fetchCamerasForBbox(viewer, bbox, key).then(function () {
      if (cameraNetState.enabled) {
        cameraNetState.renderSignature = "";
        requestVisibleCameras(viewer, true);
      }
    });
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
      if (!cameraNetState.enabled) {
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

  function clusterStep(height) {
    if (height > CAMERA_CONFIG.farHeight) {
      return 2.1;
    }
    if (height > CAMERA_CONFIG.midHeight) {
      return 0.62;
    }
    if (height > CAMERA_CONFIG.closeHeight) {
      return 0.22;
    }
    if (height > 340000) {
      return 0.065;
    }
    return 0;
  }

  function clusterCameras(cameras, cameraHeight) {
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
          cameras: [],
          latSum: 0,
          lonSum: 0,
          lat: lat,
          lon: lon,
          count: 0
        };
      }

      grid[key].cameras.push(camera);
      grid[key].latSum += lat;
      grid[key].lonSum += lon;
      grid[key].count += 1;
      grid[key].lat = grid[key].latSum / grid[key].count;
      grid[key].lon = grid[key].lonSum / grid[key].count;
    });

    return Object.keys(grid).map(function (key) {
      var item = grid[key];
      if (item.count === 1) {
        return { type: "camera", camera: item.cameras[0], lat: item.lat, lon: item.lon, count: 1 };
      }
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
        width: clamp(42 + Math.log(cluster.count) * 5, 46, 74),
        height: clamp(42 + Math.log(cluster.count) * 5, 46, 74),
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 24000000),
        verticalOrigin: Cesium.VerticalOrigin.CENTER
      },
      label: {
        text: labelText,
        font: "900 18px Inter, Arial, sans-serif",
        fillColor: Cesium.Color.WHITE,
        style: Cesium.LabelStyle.FILL,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
        existing.billboard.width = selected ? 40 : 34;
        existing.billboard.height = selected ? 40 : 34;
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
        width: selected ? 40 : 34,
        height: selected ? 40 : 34,
        heightReference: Cesium.HeightReference.NONE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000000),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scaleByDistance: new Cesium.NearFarScalar(420, 1.85, 4.2e6, 0.82)
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
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 920000),
        show: selected
      },
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
    var prioritized = prioritizeCamerasForView(viewer, cameraNetState.cameras, CAMERA_CONFIG.maxCamerasToRender);
    var clustered = clusterCameras(prioritized, cameraHeight);
    var signature = [
      cameraNetState.cameras.length,
      prioritized.length,
      Math.round(cameraHeight / 45000),
      viewSignature(viewer),
      cameraNetState.selectedCamera ? cameraNetState.selectedCamera.id : "",
      clustered.length
    ].join(":");

    if (signature === cameraNetState.renderSignature) {
      viewer.scene.requestRender();
      return;
    }

    cameraNetState.renderSignature = signature;
    cameraNetState.clusters = clustered;

    var renderItems = clustered.slice(0, CAMERA_CONFIG.maxCamerasToRender);
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

      var camera = item.camera || (item.cameras && item.cameras[0]);
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

  function renderSnapshot(camera, label) {
    var frame = document.getElementById("cameraFrame");
    if (!frame) {
      return;
    }

    var snapshotUrl = camera.snapshot_url || (!isStaticHostMode() && camera.id ? "/camera/snapshot?id=" + encodeURIComponent(camera.id) : "");
    if (!snapshotUrl) {
      frame.innerHTML = "<div class='camera-feed-message'>Snapshot unavailable</div>";
      return;
    }

    function cacheBust(url) {
      return url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now();
    }

    frame.innerHTML = [
      "<div class='camera-live-shell generated'>",
      "<img id='cameraNetSnapshot' alt='", escapeHtml(camera.name || "CameraNet camera"), "' src='", escapeHtml(cacheBust(snapshotUrl)), "'>",
      "<span class='camera-live-badge'>LIVE</span>",
      "<span class='camera-live-clock'>", escapeHtml(label || "SNAPSHOT"), "</span>",
      "</div>"
    ].join("");

    cameraNetState.snapshotRefreshTimer = window.setInterval(function () {
      var image = document.getElementById("cameraNetSnapshot");
      if (!image) {
        disposePlayback();
        return;
      }
      image.src = cacheBust(snapshotUrl);
    }, 60000);
  }

  function playHls(camera, streamData) {
    var frame = document.getElementById("cameraFrame");
    if (!frame || !streamData || !streamData.stream_url) {
      renderSnapshot(camera, "SNAPSHOT FALLBACK");
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
      renderSnapshot(camera, "SNAPSHOT FALLBACK");
      return;
    }

    var fallback = function () {
      disposePlayback();
      renderSnapshot(camera, "LIVE SNAPSHOT");
    };
    var started = false;
    cameraNetState.startupTimer = window.setTimeout(function () {
      if (!started && video.readyState < 2) {
        fallback();
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
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          fallback();
        }
      });
      return;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamData.stream_url;
      video.addEventListener("error", fallback, { once: true });
      video.addEventListener("loadedmetadata", function () {
        video.play().catch(function () {});
      }, { once: true });
      return;
    }

    fallback();
  }

  function openCameraDetailPanel(camera) {
    var panel = document.getElementById("cameraWindow");
    var title = document.getElementById("cameraTitle");
    var meta = document.getElementById("cameraMeta");
    var frame = document.getElementById("cameraFrame");

    if (!panel || !frame) {
      return;
    }

    disposePlayback();
    cameraNetState.selectedCamera = camera;
    refreshIntelList();

    if (title) {
      title.textContent = camera.name || "CameraNet camera";
    }

    if (meta) {
      meta.textContent = [
        camera.provider || "CameraNet",
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

    if (camera.stream_type && String(camera.stream_type).toLowerCase() === "hls" && camera.stream_url) {
      fetch(camera.stream_url, { headers: { Accept: "application/json" } })
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
          if (!streamData.ok || streamData.error || !streamData.stream_url) {
            renderSnapshot(Object.assign({}, camera, { snapshot_url: streamData.snapshot_url || camera.snapshot_url }), "SNAPSHOT FALLBACK");
            return;
          }
          playHls(camera, streamData);
        })
        .catch(function () {
          renderSnapshot(camera, "SNAPSHOT FALLBACK");
        });
      return;
    }

    renderSnapshot(camera, "LIVE SNAPSHOT");
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

    if (!cameraNetState.removeCameraChangedListener) {
      cameraNetState.removeCameraChangedListener = viewer.camera.changed.addEventListener(function () {
        if (!cameraNetState.enabled) {
          return;
        }
        window.clearTimeout(cameraNetState.cameraChangedTimer);
        cameraNetState.cameraChangedTimer = window.setTimeout(function () {
          queueVisibleCameraRequest(viewer, false);
        }, 100);
      });
    }

    queueVisibleCameraRequest(viewer, true);
    window.setTimeout(function () {
      prefetchContinentalUS(viewer);
    }, 1400);
  }

  function disableCameraNet(viewer) {
    cameraNetState.enabled = false;
    disposePlayback();

    window.clearTimeout(cameraNetState.cameraChangedTimer);
    cameraNetState.cameraChangedTimer = null;

    if (cameraNetState.removeMoveEndListener) {
      cameraNetState.removeMoveEndListener();
      cameraNetState.removeMoveEndListener = null;
    }

    if (cameraNetState.removeCameraChangedListener) {
      cameraNetState.removeCameraChangedListener();
      cameraNetState.removeCameraChangedListener = null;
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
