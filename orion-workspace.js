(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var body = document.querySelector('#commandPanel .panel-body');
    if (!body) return;
    var blocks = Array.from(body.children);
    var nav = document.createElement('div'); nav.className = 'workspace-tabs'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Command workspace');
    var panels = {};
    var controlReaders = [];
    ['Explore', 'Layers', 'Controls'].forEach(function (name, i) {
      var key = name.toLowerCase();
      var button = document.createElement('button'); button.type = 'button'; button.id = 'workspace-tab-' + key;
      button.textContent = name; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'workspace-' + key);
      var panel = document.createElement('div'); panel.id = 'workspace-' + key; panel.className = 'workspace-page';
      panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panels[key] = panel;
      function activate() {
        body.closest('.hud-panel').scrollTop = 0;
        body.scrollTop = 0;
        Array.from(nav.children).forEach(function (tab) { var selected = tab === button; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
        Object.keys(panels).forEach(function (id) { panels[id].hidden = id !== key; });
        if (key === 'controls' && window.viewer) controlReaders.forEach(function (read) { read(); });
      }
      button.addEventListener('click', activate);
      button.addEventListener('keydown', function (event) {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault(); var buttons = Array.from(nav.children);
        var next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].click(); buttons[next].focus();
      });
      nav.appendChild(button); body.appendChild(panel);
    });
    blocks.forEach(function (block) {
      var target = block.matches('.platform-block,.tracking-block') ? 'layers' : block.matches('.systems-block,.opacity-block') ? 'controls' : 'explore';
      panels[target].appendChild(block);
    });
    // Place the primary weather map selector directly below search.
    var weather = panels.explore.querySelector('.weather-map-block');
    if (weather) panels.explore.insertBefore(weather, panels.explore.children[1] || null);
    var filter = document.createElement('input'); filter.type = 'search'; filter.className = 'layer-search'; filter.placeholder = 'Find an intel layer…'; filter.setAttribute('aria-label','Filter intel layers');
    panels.layers.prepend(filter);
    filter.addEventListener('input', function () {
      var query = filter.value.trim().toLowerCase();
      panels.layers.querySelectorAll('[data-layer-id]').forEach(function (row) { row.hidden = !row.textContent.toLowerCase().includes(query); });
      panels.layers.querySelectorAll('.platform-category').forEach(function (group) { group.hidden = !Array.from(group.querySelectorAll('[data-layer-id]')).some(function (row) { return !row.hidden; }); });
    });
    var directory = document.createElement('details'); directory.className='camera-source-directory';
    var directoryTitle=document.createElement('summary');directoryTitle.textContent='Camera provider directory · 50 states';directory.appendChild(directoryTitle);
    var directoryStatus=document.createElement('p');directoryStatus.textContent='Official agency links. Directory entries do not imply integrated camera coverage.';directory.appendChild(directoryStatus);
    directory.addEventListener('toggle', function() {
      if(!directory.open || directory.dataset.loaded) return;
      directory.dataset.loaded='loading';
      fetch('camera-providers/discovery.json').then(function(r){if(!r.ok)throw new Error('Directory unavailable');return r.json();}).then(function(data){
        var select=document.createElement('select');select.setAttribute('aria-label','Camera source state');
        data.states.forEach(function(state,index){var o=document.createElement('option');o.value=index;o.textContent=state.name;select.appendChild(o);});
        var links=document.createElement('div');
        function update(){links.replaceChildren();data.states[Number(select.value)].agency_links.forEach(function(link){var a=document.createElement('a');a.textContent=link.name;a.href=link.url.startsWith('/exit.cfm?link=')?decodeURIComponent(link.url.split('link=')[1]):link.url;a.target='_blank';a.rel='noopener noreferrer';links.appendChild(a);});}
        select.addEventListener('change',update);directory.append(select,links);update();directory.dataset.loaded='true';
      }).catch(function(){directoryStatus.textContent='Directory unavailable. Close and reopen to retry.';delete directory.dataset.loaded;});
    });panels.layers.appendChild(directory);
    var note = document.createElement('p'); note.className = 'layer-note'; note.textContent = 'Live feeds, model forecasts, and event reports retain their own timestamps. 3D hazard effects are illustrative.'; panels.layers.appendChild(note);
    function group(title) {
      var section = document.createElement('fieldset'); section.className = 'orion-control-group';
      var legend = document.createElement('legend'); legend.textContent = title; section.appendChild(legend);
      panels.controls.appendChild(section); return section;
    }
    function command(section, text, action, id) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'ghost-command';
      button.textContent = text; if (id) button.id = id; button.addEventListener('click', action); section.appendChild(button);
    }
    function toggle(section, text, initial, action, read) {
      var label = document.createElement('label'); label.className = 'orion-control-row';
      var input = document.createElement('input'); input.type = 'checkbox'; input.checked = initial;
      input.addEventListener('change', function () { action(input.checked); window.viewer.scene.requestRender(); });
      if (read) controlReaders.push(function () { input.checked = !!read(); });
      label.append(input, document.createTextNode(text)); section.appendChild(label);
    }
    var globe = group('Globe');
    command(globe, 'Reset globe view', function () { document.getElementById('homeButton').click(); });
    command(globe, 'North up', function () { var v = window.viewer; v.camera.setView({orientation:{heading:0,pitch:v.camera.pitch,roll:0}}); });
    toggle(globe, 'Allow globe rotation', true, function (on) { window.viewer.scene.screenSpaceCameraController.enableRotate = on; }, function () { return window.viewer.scene.screenSpaceCameraController.enableRotate; });
    toggle(globe, 'Allow zoom', true, function (on) { window.viewer.scene.screenSpaceCameraController.enableZoom = on; }, function () { return window.viewer.scene.screenSpaceCameraController.enableZoom; });
    var time = group('Timeline');
    [['Previous frame','prevDay'],['Play / Pause','playPause'],['Next frame','nextDay'],['Jump to latest','weatherLatest']].forEach(function (item) {
      command(time, item[0], function () { document.getElementById(item[1]).click(); });
    });
    var display = group('Visualization');
    toggle(display, 'Atmosphere', true, function (on) { window.viewer.scene.skyAtmosphere.show = on; window.viewer.scene.globe.showGroundAtmosphere = on; }, function () { return window.viewer.scene.skyAtmosphere.show; });
    toggle(display, 'Sun lighting', true, function (on) { window.viewer.scene.globe.enableLighting = on; }, function () { return window.viewer.scene.globe.enableLighting; });
    toggle(display, 'Place labels', document.getElementById('layerLabels').checked, function (on) { var labels = document.getElementById('layerLabels'); labels.checked = on; labels.dispatchEvent(new Event('change')); }, function () { return document.getElementById('layerLabels').checked; });
    var perf = group('Performance');
    var qualityLabel = document.createElement('label'); qualityLabel.className = 'orion-control-row'; qualityLabel.textContent = 'Render quality';
    var quality = document.createElement('select'); quality.id = 'orionQuality';
    [['auto','Automatic'],['detail','Maximum detail'],['saving','Power saving']].forEach(function (item) { var o = document.createElement('option'); o.value=item[0];o.textContent=item[1];quality.appendChild(o); });
    qualityLabel.appendChild(quality); perf.appendChild(qualityLabel);
    quality.addEventListener('change', function () {
      window.appState.qualityMode = quality.value;
      window.viewer.resolutionScale = quality.value === 'saving' ? 0.75 : 1;
      window.viewer.scene.globe.maximumScreenSpaceError = quality.value === 'saving' ? 3 : quality.value === 'detail' ? 0.7 : 1.15;
      window.dispatchEvent(new Event('orion-quality-change'));
      window.viewer.scene.requestRender();
    });
    var guide = group('Help');
    command(guide, 'Restart tutorial', function () { window.OrionOnboarding.startOnboarding(window.viewer); }, 'restartTutorial');
    var systems = panels.controls.querySelector('.systems-block');
    if (systems) { systems.querySelector('.section-label').textContent = 'Event feeds & export'; panels.controls.appendChild(systems); }
    body.before(nav); nav.firstElementChild.click();
    var timeline = document.getElementById('timelineHud');
    function fitWorkspace() {
      document.documentElement.style.setProperty('--orion-timeline-height', timeline.getBoundingClientRect().height + 'px');
    }
    new ResizeObserver(fitWorkspace).observe(timeline);
    fitWorkspace();
    document.getElementById('forecastModelControl').hidden = !window.Orion.Weather.fields[window.appState && window.appState.weatherMapMode];
    var compactViewport = window.matchMedia('(max-width: 760px)');
    function fitCompactPanels() {
      if (!compactViewport.matches) return;
      var telemetry = document.getElementById('telemetryPanel');
      if (!telemetry.classList.contains('collapsed')) document.getElementById('telemetryPanelToggle').click();
    }
    compactViewport.addEventListener('change', fitCompactPanels);
    fitCompactPanels();
    document.querySelector('#commandPanel .panel-kicker').textContent = 'Mission workspace';
    document.querySelector('#telemetryPanel .panel-kicker').textContent = 'Situation / Intelligence';
    document.querySelector('.mission-status > span:nth-child(2)').textContent = 'Public-source Earth observation';
  });
})();
