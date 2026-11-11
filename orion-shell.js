(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var appShell = document.getElementById('app-shell');
    var commandPanel = document.getElementById('commandPanel');
    var telemetryPanel = document.getElementById('telemetryPanel');
    var timeline = document.getElementById('timelineHud');
    var brandHud = document.querySelector('.brand-hud');
    var workspaceTabs = document.querySelector('.workspace-tabs');
    var layerFilter = document.querySelector('.layer-search');
    if (!appShell || !commandPanel || !telemetryPanel || !timeline || !brandHud || !workspaceTabs) return;

    document.body.classList.add('orion-gv-shell');
    var shellVersion = '4';
    try {
      commandPanel.classList.add('collapsed');
      telemetryPanel.classList.add('collapsed');
      timeline.classList.add('collapsed');
      window.localStorage.setItem('orion:panelCollapsed', JSON.stringify({ commandPanel: true, telemetryPanel: true }));
      window.localStorage.setItem('orion:timelineCollapsed', '1');
      window.localStorage.setItem('orion:shellVersion', shellVersion);
    } catch (error) {
      // Storage may be blocked; the in-memory shell state still works.
    }

    function icon(name, fallback) {
      var glyph = document.createElement('span');
      glyph.className = 'orion-icon';
      glyph.setAttribute('aria-hidden', 'true');
      var vector = document.createElement('i');
      vector.setAttribute('data-lucide', name);
      var backup = document.createElement('span');
      backup.className = 'orion-icon-fallback';
      backup.textContent = fallback || '';
      glyph.append(vector, backup);
      return glyph;
    }

    function button(options) {
      var control = document.createElement('button');
      control.type = 'button';
      if (options.id) control.id = options.id;
      if (options.className) control.className = options.className;
      if (options.label) {
        control.setAttribute('aria-label', options.label);
        control.title = options.label;
      }
      if (options.icon) control.appendChild(icon(options.icon, options.fallback));
      if (options.text) {
        var label = document.createElement('span');
        label.className = 'orion-button-label';
        label.textContent = options.text;
        control.appendChild(label);
      }
      if (options.action) control.addEventListener('click', options.action);
      return control;
    }

    function clickToggle(id) {
      var toggle = document.getElementById(id);
      if (toggle) toggle.click();
    }

    function ensureOpen(panel, toggleId) {
      if (panel.classList.contains('collapsed')) clickToggle(toggleId);
    }

    function ensureCollapsed(panel, toggleId) {
      if (!panel.classList.contains('collapsed')) clickToggle(toggleId);
    }

    var activeSurface = 'map';
    var commandDock;
    function setDockActive(route) {
      if (!commandDock) return;
      commandDock.querySelectorAll('[data-route]').forEach(function (control) {
        control.classList.toggle('is-active', control.dataset.route === route);
      });
    }

    function openSurface(surface) {
      activeSurface = surface;
      if (surface !== 'command') ensureCollapsed(commandPanel, 'commandPanelToggle');
      if (surface !== 'intel') ensureCollapsed(telemetryPanel, 'telemetryPanelToggle');
      if (surface !== 'timeline') ensureCollapsed(timeline, 'timelineHudToggle');
      if (surface === 'command') ensureOpen(commandPanel, 'commandPanelToggle');
      if (surface === 'intel') ensureOpen(telemetryPanel, 'telemetryPanelToggle');
      if (surface === 'timeline') ensureOpen(timeline, 'timelineHudToggle');
      if (surface === 'map' || surface === 'intel' || surface === 'timeline') setDockActive(surface);
    }

    function filterLayers(terms, visibleValue) {
      if (!layerFilter) return;
      var list = Array.isArray(terms)
        ? terms
        : String(terms || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      layerFilter.value = visibleValue == null ? String(terms || '') : visibleValue;
      document.querySelectorAll('#workspace-layers [data-layer-id]').forEach(function (row) {
        var content = row.textContent.toLowerCase();
        row.hidden = list.length > 0 && !list.some(function (term) { return content.includes(term); });
      });
      document.querySelectorAll('#workspace-layers .platform-category').forEach(function (group) {
        group.hidden = !Array.from(group.querySelectorAll('[data-layer-id]')).some(function (row) { return !row.hidden; });
      });
    }

    if (layerFilter) {
      layerFilter.addEventListener('input', function () {
        filterLayers(layerFilter.value.replace(/\+/g, ' '));
      });
    }

    function activateWorkspace(name, options) {
      options = options || {};
      openSurface('command');
      var tab = document.getElementById('workspace-tab-' + name);
      if (tab) tab.click();
      if (name === 'layers') filterLayers(options.terms || options.query || '', options.value == null ? options.query : options.value);
      if (commandKicker) commandKicker.textContent = options.title || (name === 'layers' ? 'Layer library' : name === 'controls' ? 'System controls' : 'Explore');
      setDockActive(options.route || name);
      if (options.target) {
        window.requestAnimationFrame(function () {
          var target = document.querySelector(options.target);
          if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      }
    }

    var brandLockup = brandHud.querySelector('.brand-lockup');
    if (brandLockup) {
      brandLockup.classList.add('topbar-brand');
    }

    var commandKicker = commandPanel.querySelector('.panel-kicker');
    if (commandKicker) commandKicker.textContent = 'Operational workspace';
    var telemetryKicker = telemetryPanel.querySelector('.panel-kicker');
    if (telemetryKicker) telemetryKicker.textContent = 'Situation intelligence';

    var viewSwitcher = document.createElement('div');
    viewSwitcher.className = 'orion-view-switcher';
    viewSwitcher.setAttribute('role', 'group');
    viewSwitcher.setAttribute('aria-label', 'Map view');
    var globeView = button({ className: 'is-active', text: 'Globe', icon: 'globe-2', fallback: 'O', label: 'Globe view', action: function () { openSurface('map'); } });
    var layersView = button({ text: 'Layers', icon: 'layers-3', fallback: 'L', label: 'Open layers', action: function () { activateWorkspace('layers'); } });
    var dataView = button({ text: 'Data', icon: 'panel-right-open', fallback: 'D', label: 'Open intelligence data', action: function () { openSurface('intel'); } });
    viewSwitcher.append(globeView, layersView, dataView);
    function selectHeaderView(selected) {
      viewSwitcher.querySelectorAll('button').forEach(function (candidate) {
        candidate.classList.toggle('is-active', candidate === selected);
      });
    }
    globeView.addEventListener('click', function () { selectHeaderView(globeView); });
    layersView.addEventListener('click', function () { selectHeaderView(layersView); });
    dataView.addEventListener('click', function () { selectHeaderView(dataView); });
    document.getElementById('workspace-tab-explore').addEventListener('click', function () { selectHeaderView(globeView); });
    document.getElementById('workspace-tab-layers').addEventListener('click', function () { selectHeaderView(layersView); });
    document.getElementById('workspace-tab-controls').addEventListener('click', function () { selectHeaderView(globeView); });
    if (brandLockup) brandLockup.after(viewSwitcher);
    else brandHud.prepend(viewSwitcher);

    var mobileBrand = document.createElement('div');
    mobileBrand.className = 'orion-mobile-brand';
    mobileBrand.append(icon('orbit', 'O'));
    var mobileBrandText = document.createElement('strong');
    mobileBrandText.textContent = 'ORION';
    mobileBrand.appendChild(mobileBrandText);
    brandHud.prepend(mobileBrand);

    var searchForm = document.getElementById('searchForm');
    if (searchForm) {
      searchForm.classList.add('global-search');
      brandHud.insertBefore(searchForm, brandHud.querySelector('.mission-status'));
      searchForm.addEventListener('submit', function () { document.body.classList.remove('orion-search-open'); });
    }

    var searchButton = button({
      className: 'orion-mobile-search',
      icon: 'search',
      fallback: '?',
      label: 'Search locations',
      action: function () {
        var opening = !document.body.classList.contains('orion-search-open');
        document.body.classList.toggle('orion-search-open', opening);
        if (opening) window.setTimeout(function () { document.getElementById('searchInput').focus(); }, 0);
      }
    });
    brandHud.insertBefore(searchButton, brandHud.querySelector('.mission-status'));

    var utcClock = document.createElement('time');
    utcClock.id = 'orionUtcClock';
    utcClock.className = 'orion-utc-clock';
    utcClock.setAttribute('aria-label', 'Current UTC time');
    function updateClock() {
      var now = new Date();
      utcClock.dateTime = now.toISOString();
      utcClock.textContent = now.toISOString().slice(11, 19) + ' UTC';
    }
    updateClock();
    window.setInterval(updateClock, 1000);
    var missionStatus = brandHud.querySelector('.mission-status');
    missionStatus.prepend(utcClock);
    var missionText = missionStatus.querySelectorAll('span')[1];
    if (missionText) missionText.textContent = 'Live public data';

    commandDock = document.createElement('nav');
    commandDock.className = 'orion-command-dock';
    commandDock.setAttribute('aria-label', 'Orion commands');
    function addDockControl(route, label, iconName, fallback, action, group) {
      var control = button({ className: 'orion-dock-button', icon: iconName, fallback: fallback, label: label, action: action });
      control.dataset.route = route;
      control.dataset.surface = route === 'map' || route === 'intel' || route === 'timeline' ? route : 'command';
      if (group) control.classList.add('starts-group');
      commandDock.appendChild(control);
      return control;
    }
    addDockControl('map', 'Map', 'orbit', 'O', function () { openSurface('map'); });
    addDockControl('search', 'Search', 'search', '?', function () {
      openSurface('map');
      document.body.classList.add('orion-search-open');
      document.getElementById('searchInput').focus();
      setDockActive('search');
    }, true);
    addDockControl('explore', 'Explore', 'compass', 'E', function () { activateWorkspace('explore', { route: 'explore', title: 'Explore' }); });
    var dockLayers = addDockControl('layers', 'Layer library', 'layers-3', 'L', function () { activateWorkspace('layers', { route: 'layers', title: 'Layer library' }); });
    addDockControl('cameras', 'CameraNet', 'video', 'C', function () { activateWorkspace('layers', { query: 'camera', route: 'cameras', title: 'CameraNet' }); });
    addDockControl('weather', 'Weather', 'cloud-sun', 'W', function () { activateWorkspace('explore', { route: 'weather', title: 'Weather', target: '#workspace-explore .weather-map-block' }); });
    addDockControl('infrastructure', 'Infrastructure', 'utility-pole', 'I', function () { activateWorkspace('layers', { terms: ['power', 'cable'], value: 'power + cable', route: 'infrastructure', title: 'Infrastructure' }); });
    addDockControl('intel', 'Intelligence', 'radar', 'D', function () { openSurface('intel'); }, true);
    addDockControl('timeline', 'Timeline', 'clock-3', 'T', function () { openSurface('timeline'); });
    addDockControl('controls', 'Controls', 'sliders-horizontal', 'S', function () { activateWorkspace('controls', { route: 'controls', title: 'System controls' }); });
    appShell.appendChild(commandDock);
    setDockActive('map');

    function createCountBadge(control) {
      var badge = document.createElement('span');
      badge.className = 'orion-count-badge';
      badge.textContent = '0';
      badge.setAttribute('aria-hidden', 'true');
      control.appendChild(badge);
      return badge;
    }

    var headerLayerBadge = createCountBadge(layersView);
    var dockLayerBadge = createCountBadge(dockLayers);
    function activeLayerCount() {
      var ids = new Set();
      document.querySelectorAll('.platform-block input[type="checkbox"]:checked, #trackAircraft:checked, #trackSatellites:checked').forEach(function (input) {
        ids.add(input.id);
      });
      return ids.size;
    }
    function updateLayerCounts() {
      var count = activeLayerCount();
      headerLayerBadge.textContent = String(count);
      dockLayerBadge.textContent = String(count);
      layersView.setAttribute('aria-label', 'Open layers, ' + count + ' active');
      dockLayers.setAttribute('aria-label', 'Layer library, ' + count + ' active');
    }
    document.addEventListener('change', function (event) {
      if (event.target && event.target.matches('input[type="checkbox"]')) updateLayerCounts();
    });
    updateLayerCounts();

    var loadStrip = document.createElement('div');
    loadStrip.className = 'orion-load-strip';
    loadStrip.setAttribute('aria-hidden', 'true');
    loadStrip.appendChild(document.createElement('span'));
    appShell.appendChild(loadStrip);

    var dataStatusButton = button({ className: 'orion-data-status', icon: 'activity', fallback: '!', text: 'Starting', label: 'Live data status' });
    dataStatusButton.setAttribute('aria-expanded', 'false');
    var feedPopover = document.createElement('section');
    feedPopover.className = 'orion-feed-popover';
    feedPopover.hidden = true;
    feedPopover.setAttribute('aria-label', 'Live data status');
    appShell.appendChild(feedPopover);
    missionStatus.insertBefore(dataStatusButton, document.getElementById('hudHideToggle'));

    function feedStatusClass(status) {
      var value = String(status || 'standby').toLowerCase();
      if (value === 'online' || value === 'propagated') return 'online';
      if (value.indexOf('loading') !== -1 || value === 'unknown') return 'loading';
      if (value === 'fallback' || value === 'degraded' || value === 'delayed' || value === 'stale' || value === 'latest snapshot') return 'warning';
      if (value === 'empty' || value === 'standby') return 'standby';
      return 'error';
    }

    function observedAgeMinutes(feed) {
      var payload = feed && feed.payload;
      if (!payload || payload.mode !== 'observed') return null;
      var selectedDate = window.appState && window.appState.date;
      var timestamp = selectedDate instanceof Date && Number.isFinite(+selectedDate)
        ? selectedDate.toISOString()
        : payload.selected_time || (payload.latest && payload.latest.time) || payload.time;
      var value = Date.parse(timestamp || '');
      return Number.isFinite(value) ? Math.max(0, Math.round((Date.now() - value) / 60000)) : null;
    }

    function layerDisplayName(row, layerId) {
      var control = row && row.querySelector('input');
      var textNode = control && Array.from(row.querySelectorAll('span')).find(function (span) {
        return !span.classList.contains('switch') && !span.classList.contains('layer-status-dot') && !span.classList.contains('layer-count-badge') && !span.classList.contains('layer-source-line');
      });
      return textNode ? textNode.textContent.trim() : layerId;
    }

    function collectFeedRecords() {
      var records = [];
      var weatherFeed = window.platformFeeds && window.platformFeeds.weatherRadar;
      if (weatherFeed) {
        var weatherAge = observedAgeMinutes(weatherFeed);
        var weatherStatus = weatherFeed.status || 'loading';
        if (feedStatusClass(weatherStatus) === 'online' && weatherAge !== null && weatherAge > 90) weatherStatus = 'delayed';
        records.push({
          id: 'weatherRadar',
          name: document.getElementById('weatherMapModeSelect').selectedOptions[0].textContent,
          status: weatherStatus,
          ageMinutes: weatherAge,
          count: Array.isArray(weatherFeed.items) ? weatherFeed.items.length : Number(weatherFeed.payload && weatherFeed.payload.frames && weatherFeed.payload.frames.length) || 0
        });
      }
      document.querySelectorAll('#workspace-layers [data-layer-id]').forEach(function (row) {
        var input = row.querySelector('input[type="checkbox"]');
        if (!input || !input.checked) return;
        var layerId = row.dataset.layerId;
        var feed = (window.platformFeeds && window.platformFeeds[layerId]) || {};
        records.push({
          id: layerId,
          name: layerDisplayName(row, layerId),
          status: feed.renderError ? 'renderer unavailable' : feed.status || 'loading',
          count: Array.isArray(feed.items) ? feed.items.length : 0
        });
      });
      return records;
    }

    function renderFeedPopover(records) {
      if (feedPopover.hidden) return;
      var header = document.createElement('header');
      var title = document.createElement('strong');
      title.textContent = 'Live picture';
      var summary = document.createElement('span');
      summary.textContent = records.length + ' active source' + (records.length === 1 ? '' : 's');
      header.append(title, summary);
      var list = document.createElement('div');
      list.className = 'orion-feed-list';
      records.forEach(function (record) {
        var row = document.createElement('div');
        row.className = 'orion-feed-row';
        row.dataset.state = feedStatusClass(record.status);
        var dot = document.createElement('span');
        dot.className = 'orion-feed-dot';
        dot.setAttribute('aria-hidden', 'true');
        var name = document.createElement('strong');
        name.textContent = record.name;
        var meta = document.createElement('span');
        meta.textContent = record.status + (record.ageMinutes !== null && record.ageMinutes !== undefined ? ' / ' + record.ageMinutes + 'm' : record.count ? ' / ' + record.count.toLocaleString() : '');
        row.append(dot, name, meta);
        list.appendChild(row);
      });
      if (!records.length) {
        var empty = document.createElement('div');
        empty.className = 'orion-feed-empty';
        empty.textContent = 'No active sources';
        list.appendChild(empty);
      }
      feedPopover.replaceChildren(header, list);
    }

    function updateFeedStatus() {
      var records = collectFeedRecords();
      var online = records.filter(function (record) { return feedStatusClass(record.status) === 'online'; }).length;
      var loading = records.filter(function (record) { return feedStatusClass(record.status) === 'loading'; }).length;
      var warning = records.filter(function (record) { return feedStatusClass(record.status) === 'warning'; }).length;
      var failed = records.filter(function (record) { return feedStatusClass(record.status) === 'error'; }).length;
      var label = dataStatusButton.querySelector('.orion-button-label');
      label.textContent = loading ? loading + ' loading' : failed ? failed + ' issue' + (failed === 1 ? '' : 's') : warning ? warning + ' delayed' : online + ' live';
      dataStatusButton.dataset.state = loading ? 'loading' : failed ? 'error' : warning ? 'warning' : 'online';
      loadStrip.classList.toggle('is-busy', loading > 0);
      renderFeedPopover(records);
    }

    dataStatusButton.addEventListener('click', function (event) {
      event.stopPropagation();
      feedPopover.hidden = !feedPopover.hidden;
      dataStatusButton.setAttribute('aria-expanded', String(!feedPopover.hidden));
      updateFeedStatus();
    });
    feedPopover.addEventListener('click', function (event) { event.stopPropagation(); });
    document.addEventListener('click', function () {
      if (feedPopover.hidden) return;
      feedPopover.hidden = true;
      dataStatusButton.setAttribute('aria-expanded', 'false');
    });
    updateFeedStatus();
    window.setInterval(updateFeedStatus, 1000);

    function withViewer(action) {
      if (!window.viewer) return;
      action(window.viewer);
      window.viewer.scene.requestRender();
    }

    function announce(message) {
      if (typeof window.showToast === 'function') {
        window.showToast(message);
        return;
      }
      var toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('visible');
      window.setTimeout(function () { toast.classList.remove('visible'); }, 2400);
    }

    function buildShareUrl() {
      if (!window.viewer || !window.Cesium) return window.location.href;
      var viewer = window.viewer;
      var center = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2),
        viewer.scene.globe.ellipsoid
      );
      var position = center ? Cesium.Cartographic.fromCartesian(center) : viewer.camera.positionCartographic;
      var activeLayers = Array.from(document.querySelectorAll('.platform-block input[type="checkbox"]:checked')).map(function (input) { return input.id; });
      var params = new URLSearchParams({
        lat: Cesium.Math.toDegrees(position.latitude).toFixed(5),
        lon: Cesium.Math.toDegrees(position.longitude).toFixed(5),
        h: Math.round(viewer.camera.positionCartographic.height),
        layers: activeLayers.join(','),
        labels: document.getElementById('layerLabels').checked ? '1' : '0',
        mode: document.getElementById('weatherMapModeSelect').value,
        t: document.getElementById('timelineRange').value
      });
      return window.location.origin + window.location.pathname + window.location.search + '#orion&' + params.toString();
    }

    function copyViewLink() {
      var url = buildShareUrl();
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        announce('Clipboard access is unavailable');
        return;
      }
      navigator.clipboard.writeText(url)
        .then(function () { announce('View link copied'); })
        .catch(function () { announce('Unable to copy the view link'); });
    }

    var mapTools = document.createElement('div');
    mapTools.className = 'orion-map-tools';
    mapTools.setAttribute('role', 'toolbar');
    mapTools.setAttribute('aria-label', 'Map tools');
    mapTools.append(
      button({ icon: 'plus', fallback: '+', label: 'Zoom in', action: function () { withViewer(function (viewer) { viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.34); }); } }),
      button({ icon: 'minus', fallback: '-', label: 'Zoom out', action: function () { withViewer(function (viewer) { viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.34); }); } }),
      button({ icon: 'house', fallback: 'H', label: 'Reset globe view', action: function () { document.getElementById('homeButton').click(); } }),
      button({ icon: 'locate-fixed', fallback: '@', label: 'Use live location', action: function () { document.getElementById('liveLocationToggle').click(); } }),
      button({ icon: 'layers-3', fallback: 'L', label: 'Open map layers', action: function () { activateWorkspace('layers'); } }),
      button({ icon: 'link', fallback: '#', label: 'Copy shareable view link', action: copyViewLink })
    );
    appShell.appendChild(mapTools);

    function restoreSharedView() {
      if (!window.location.hash.startsWith('#orion&') || !window.viewer || !window.Cesium) return;
      var params = new URLSearchParams(window.location.hash.slice(7));
      var latitude = Number(params.get('lat'));
      var longitude = Number(params.get('lon'));
      var height = Number(params.get('h'));
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(height)) {
        window.viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, Math.max(1000, height)) });
      }
      (params.get('layers') || '').split(',').filter(Boolean).forEach(function (id) {
        var input = document.getElementById(id);
        if (input && !input.checked) {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      if (params.has('labels')) {
        var labels = document.getElementById('layerLabels');
        var enabled = params.get('labels') === '1';
        if (labels.checked !== enabled) {
          labels.checked = enabled;
          labels.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (params.has('mode')) {
        var weatherMode = document.getElementById('weatherMapModeSelect');
        if (Array.from(weatherMode.options).some(function (option) { return option.value === params.get('mode'); })) {
          weatherMode.value = params.get('mode');
          weatherMode.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (params.has('t')) {
        var range = document.getElementById('timelineRange');
        var value = Math.min(Number(range.max), Math.max(Number(range.min), Number(params.get('t'))));
        if (Number.isFinite(value)) {
          range.value = String(value);
          range.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }

    var sharedStateReady = false;
    var shareSyncTimer = null;
    function scheduleSharedStateSync() {
      if (!sharedStateReady) return;
      window.clearTimeout(shareSyncTimer);
      shareSyncTimer = window.setTimeout(function () {
        window.history.replaceState(null, '', buildShareUrl());
      }, 240);
    }

    var viewerPoll = window.setInterval(function () {
      if (!window.viewer) return;
      window.clearInterval(viewerPoll);
      restoreSharedView();
      sharedStateReady = true;
      window.viewer.camera.moveEnd.addEventListener(scheduleSharedStateSync);
      scheduleSharedStateSync();
    }, 100);
    document.querySelectorAll('.platform-block input[type="checkbox"], #layerLabels, #weatherMapModeSelect, #timelineRange').forEach(function (control) {
      control.addEventListener(control.id === 'timelineRange' ? 'input' : 'change', scheduleSharedStateSync);
    });

    var mobileNav = document.createElement('nav');
    mobileNav.className = 'orion-mobile-nav';
    mobileNav.setAttribute('aria-label', 'Mobile navigation');

    function openMobileSurface(surface) {
      openSurface(surface);
    }

    [
      ['Map', 'globe-2', 'O', function () { openMobileSurface('map'); }],
      ['Layers', 'layers-3', 'L', function () { openMobileSurface('command'); activateWorkspace('layers'); }],
      ['Intel', 'radar', 'I', function () { openMobileSurface('intel'); }],
      ['Time', 'clock-3', 'T', function () { openMobileSurface('timeline'); }],
      ['More', 'menu', 'M', function () { openMobileSurface('command'); activateWorkspace('controls'); }]
    ].forEach(function (item) {
      var navItem = button({ className: 'orion-mobile-nav-item', text: item[0], icon: item[1], fallback: item[2], label: item[0], action: item[3] });
      navItem.addEventListener('click', function () {
        mobileNav.querySelectorAll('button').forEach(function (candidate) { candidate.classList.remove('is-active'); });
        navItem.classList.add('is-active');
      });
      mobileNav.appendChild(navItem);
    });
    mobileNav.firstElementChild.classList.add('is-active');
    appShell.appendChild(mobileNav);

    var compactViewport = window.matchMedia('(max-width: 760px)');
    function normalizeCompactShell() {
      if (!compactViewport.matches) return;
      ensureCollapsed(telemetryPanel, 'telemetryPanelToggle');
      ensureCollapsed(timeline, 'timelineHudToggle');
    }
    compactViewport.addEventListener('change', normalizeCompactShell);
    window.setTimeout(normalizeCompactShell, 0);

    var detailCard = document.getElementById('intelDetailCard');
    if (detailCard) {
      new MutationObserver(function () {
        if (!detailCard.classList.contains('hidden') && detailCard.textContent.trim()) openSurface('intel');
      }).observe(detailCard, { attributes: true, childList: true, subtree: true });
    }

    document.addEventListener('keydown', function (event) {
      var editable = event.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName);
      if (event.key === 'Escape') {
        document.body.classList.remove('orion-search-open');
        feedPopover.hidden = true;
        dataStatusButton.setAttribute('aria-expanded', 'false');
        openSurface('map');
        return;
      }
      if (editable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault();
        document.body.classList.add('orion-search-open');
        document.getElementById('searchInput').focus();
        setDockActive('search');
      } else if (event.key.toLowerCase() === 'l') {
        activateWorkspace('layers', { route: 'layers', title: 'Layer library' });
      } else if (event.key.toLowerCase() === 'd') {
        openSurface('intel');
      } else if (event.key.toLowerCase() === 't') {
        openSurface('timeline');
      }
    });

    function renderIcons() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
    }
    function decorateSurfaceButtons() {
      [
        ['commandPanelToggle', 'Close workspace'],
        ['telemetryPanelToggle', 'Close intelligence'],
        ['timelineHudToggle', 'Close timeline']
      ].forEach(function (entry) {
        var control = document.getElementById(entry[0]);
        if (!control) return;
        control.replaceChildren(icon('x', 'X'));
        control.setAttribute('aria-label', entry[1]);
        control.title = entry[1];
      });
      renderIcons();
    }
    renderIcons();
    window.addEventListener('load', function () {
      decorateSurfaceButtons();
      ['commandPanelToggle', 'telemetryPanelToggle', 'timelineHudToggle'].forEach(function (id) {
        var control = document.getElementById(id);
        if (control) control.addEventListener('click', function () { window.requestAnimationFrame(decorateSurfaceButtons); });
      });
    }, { once: true });
  });
}());
