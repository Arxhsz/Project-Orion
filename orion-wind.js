(function (window) {
  'use strict';
  var Orion = window.Orion = window.Orion || {};
  // Animated traces use model vectors at geographic positions. Advection is accelerated
  // for visibility; these are not aircraft tracks or a dispersion forecast.
  Orion.WindField = function (viewer) {
    var C = window.Cesium, grid = null, last = 0;
    var lines = viewer.scene.primitives.add(new C.PolylineCollection());
    var particles = [];
    function seed(i) {
      var cell = i % 162;
      return { lon: -170 + (cell % 18) * 20, lat: -80 + Math.floor(cell / 18) * 20, age: 0, line: lines.add({ positions: [], width: 1.4, material: C.Material.fromType('Color', { color: C.Color.fromCssColorString('#ddfff6').withAlpha(.65) }) }) };
    }
    for (var i = 0; i < 162; i++) particles.push(seed(i));
    var remove = viewer.scene.preUpdate.addEventListener(function () {
      var now = performance.now(), dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
      if (!grid || document.hidden) return;
      particles.forEach(function (p, i) {
        var x = Math.max(0, Math.min(17, Math.round((p.lon + 170) / 20)));
        var y = Math.max(0, Math.min(8, Math.round((p.lat + 80) / 20)));
        var k = y * 18 + x, speed = grid.speed[k], direction = grid.direction[k];
        if (!Number.isFinite(speed) || !Number.isFinite(direction)) { p.line.show = false; return; }
        p.line.show = true;
        var a = direction * Math.PI / 180;
        var north = -Math.cos(a) * speed * .44704, east = -Math.sin(a) * speed * .44704;
        var lat = p.lat + north * dt * 1800 / 111000;
        var lon = p.lon + east * dt * 1800 / (111000 * Math.max(.17, Math.cos(p.lat * Math.PI / 180)));
        p.line.positions = [C.Cartesian3.fromDegrees(p.lon, p.lat, 10000), C.Cartesian3.fromDegrees(lon + east * 60 / 111000, lat + north * 60 / 111000, 10000)];
        p.lon = lon; p.lat = lat; p.age += dt;
        if (p.age > 12 || Math.abs(p.lat) > 83 || Math.abs(p.lon) > 179) { p.lon = -170 + (i % 18) * 20; p.lat = -80 + Math.floor(i / 18) * 20; p.age = 0; }
      });
      viewer.scene.requestRender();
    });
    this.setFrame = function (winds) { grid = winds; };
    this.destroy = function () { remove(); viewer.scene.primitives.remove(lines); };
  };
})(window);
