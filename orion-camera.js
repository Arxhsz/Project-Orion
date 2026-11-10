(function (window) {
  'use strict';
  var Orion = window.Orion = window.Orion || {};
  Orion.CameraFlight = {
    focus: function (viewer, location, options) {
      options = options || {};
      if (!viewer || !Number.isFinite(location.lat) || !Number.isFinite(location.lon) || Math.abs(location.lat) > 90 || Math.abs(location.lon) > 180) return false;
      var C = window.Cesium;
      viewer.camera.cancelFlight();
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      // Coarse ellipsoid mesh heights can be below sea level until close-up tiles load.
      // The ellipsoid itself is exactly height zero; do not focus its coarse mesh.
      var ground = C.EllipsoidTerrainProvider && viewer.terrainProvider instanceof C.EllipsoidTerrainProvider
        ? 0 : viewer.scene.globe.getHeight(C.Cartographic.fromDegrees(location.lon, location.lat));
      if (Number.isFinite(location.altitude)) ground = Math.max(0, Math.min(12000, location.altitude));
      var target = C.Cartesian3.fromDegrees(location.lon, location.lat, Number.isFinite(ground) ? ground : 0);
      var offset = new C.HeadingPitchRange(0, C.Math.toRadians(options.pitch || -62), Math.max(500, options.range || 5000));
      viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, 1), {
        duration: options.duration || 1.6,
        offset: offset,
        easingFunction: C.EasingFunction.CUBIC_IN_OUT,
        complete: function () {
          // Re-anchor the final view after Cesium's cartographic flight interpolation.
          viewer.camera.lookAt(target, offset);
          viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
          if (options.complete) options.complete();
        }
      });
      return true;
    }
  };
})(window);
