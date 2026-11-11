/* Orion status orb: maps real app signals onto a visual state on the
   brand orb. States: idle, loading, processing, thinking, success, error.
   Public API:
     window.setOrbState('thinking')              pin a state until cleared
     window.setOrbState('success', 1500)          show a state for 1.5s
     window.setOrbState(null) / ('auto')          return to live signals
     window.OrionOrb.getState()
     window.dispatchEvent(new CustomEvent('orion:orb', { detail: { state: 'error', duration: 3000 } }))
   Every change fires window 'orion:orb-state' ({ state, source }) and sets
   <html data-orb-state="...">.
   Preview: ?orbState=thinking pins a state; ?orbDebug=1 (or
   localStorage.orionDebug=1) shows a small state picker. */
(function () {
  'use strict';

  var STATES = ['idle', 'loading', 'processing', 'thinking', 'success', 'error'];
  var LABELS = {
    idle: 'Standing by',
    loading: 'Loading data',
    processing: 'Processing frames',
    thinking: 'Resolving request',
    success: 'Complete',
    error: 'Attention needed'
  };

  var params = new URLSearchParams(window.location.search);
  var pinned = null;          // explicit setOrbState() / ?orbState
  var pinnedUntil = 0;
  var transient = null;       // short-lived success / error flashes
  var transientUntil = 0;
  var thinkingUntil = 0;
  var awaitingFlight = false;
  var tilesBusySince = 0;
  var wasBusy = false;
  var current = null;
  var orbs = [];

  function valid(state) { return STATES.indexOf(state) !== -1; }

  function flash(state, ms) {
    transient = state;
    transientUntil = Date.now() + (ms || 1600);
    evaluate('signal');
  }

  function feedState() {
    var status = document.querySelector('.orion-data-status');
    return status ? status.dataset.state : '';
  }

  function bufferState() {
    var el = document.getElementById('frameBufferStatus');
    var text = el ? el.textContent.trim() : '';
    if (!text) return '';
    if (/unavailable|could not|delayed/i.test(text)) return 'error';
    var match = text.match(/Buffered\s+(\d+)\s*\/\s*(\d+)/i);
    if (match) return Number(match[1]) < Number(match[2]) ? 'processing' : '';
    if (/^Preparing/i.test(text)) return 'processing';
    return '';
  }

  function tilesBusy() {
    return tilesBusySince > 0 && Date.now() - tilesBusySince > 350;
  }

  function liveState() {
    var now = Date.now();
    if (transient && now < transientUntil && transient === 'error') return 'error';
    if (document.getElementById('orionLoadingScreen')) return 'loading';
    if (now < thinkingUntil) return 'thinking';
    if (bufferState() === 'processing') return 'processing';
    var feeds = feedState();
    var busy = feeds === 'loading' || tilesBusy();
    if (busy) { wasBusy = true; return 'loading'; }
    if (wasBusy) {
      wasBusy = false;
      if (feeds !== 'error') { transient = 'success'; transientUntil = now + 1400; }
    }
    if (transient && now < transientUntil) return transient;
    if (feeds === 'error') return 'error';
    return 'idle';
  }

  function evaluate(source) {
    var now = Date.now();
    if (pinned && pinnedUntil && now >= pinnedUntil) { pinned = null; pinnedUntil = 0; }
    var next = pinned || liveState();
    if (next === current) return;
    current = next;
    document.documentElement.dataset.orbState = next;
    orbs.forEach(function (orb) {
      orb.dataset.orbState = next;
      orb.title = 'Orion status: ' + LABELS[next];
    });
    var live = document.getElementById('orionOrbStatus');
    if (live) live.textContent = 'Orion status: ' + LABELS[next];
    var picker = document.querySelector('.orion-orb-debug');
    if (picker) picker.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.state === (pinned || 'auto')));
    });
    window.dispatchEvent(new CustomEvent('orion:orb-state', { detail: { state: next, source: pinned ? 'manual' : source || 'signal' } }));
  }

  function setOrbState(state, duration) {
    if (state == null || state === 'auto' || state === '') {
      pinned = null; pinnedUntil = 0;
    } else if (valid(state)) {
      pinned = state;
      pinnedUntil = duration ? Date.now() + Number(duration) : 0;
    } else {
      return current;
    }
    evaluate('manual');
    return current;
  }

  window.setOrbState = setOrbState;
  window.OrionOrb = {
    states: STATES.slice(),
    set: setOrbState,
    clear: function () { return setOrbState(null); },
    flash: function (state, ms) { if (valid(state)) flash(state, ms); },
    getState: function () { return current; }
  };
  window.addEventListener('orion:orb', function (event) {
    var detail = event.detail || {};
    setOrbState(detail.state, detail.duration);
  });

  function decorate() {
    orbs = Array.from(document.querySelectorAll('.brand-hud .brand-mark, .orion-mobile-brand .orion-orb'));
    var mobileBrand = document.querySelector('.orion-mobile-brand');
    if (mobileBrand && !mobileBrand.querySelector('.orion-orb')) {
      var mini = document.createElement('span');
      mini.className = 'brand-mark orion-orb orion-orb-mini';
      mini.setAttribute('aria-hidden', 'true');
      mobileBrand.prepend(mini);
      orbs.push(mini);
    }
    orbs.forEach(function (orb) { orb.classList.add('orion-orb'); });
    if (!document.getElementById('orionOrbStatus')) {
      var live = document.createElement('span');
      live.id = 'orionOrbStatus';
      live.className = 'sr-only';
      live.setAttribute('role', 'status');
      document.body.appendChild(live);
    }
  }

  function watchSignals() {
    var toast = document.getElementById('toast');
    if (toast) {
      new MutationObserver(function () {
        var text = toast.textContent || '';
        if (/resolving/i.test(text)) {
          thinkingUntil = Date.now() + 8000;
          awaitingFlight = true;
          evaluate('search');
        } else if (/no location match|unavailable|failed|could not|unable/i.test(text)) {
          thinkingUntil = 0; awaitingFlight = false;
          flash('error', 3200);
        } else if (/copied|saved/i.test(text)) {
          flash('success', 1500);
        }
      }).observe(toast, { childList: true, characterData: true, subtree: true });
    }

    var buffer = document.getElementById('frameBufferStatus');
    if (buffer) {
      new MutationObserver(function () {
        if (bufferState() === 'error') flash('error', 3200);
        else evaluate('buffer');
      }).observe(buffer, { childList: true, characterData: true, subtree: true });
    }

    function hookViewer() {
      var viewer = window.viewer;
      if (!viewer || !viewer.scene || hookViewer.done) return !!hookViewer.done;
      hookViewer.done = true;
      var globe = viewer.scene.globe;
      if (globe && globe.tileLoadProgressEvent) {
        globe.tileLoadProgressEvent.addEventListener(function (queued) {
          if (queued > 0) { if (!tilesBusySince) tilesBusySince = Date.now(); }
          else tilesBusySince = 0;
        });
      }
      if (viewer.camera && viewer.camera.moveEnd) {
        viewer.camera.moveEnd.addEventListener(function () {
          if (!awaitingFlight) return;
          awaitingFlight = false;
          thinkingUntil = 0;
          flash('success', 1600);
        });
      }
      return true;
    }

    window.addEventListener('unhandledrejection', function () { flash('error', 2400); });
    window.addEventListener('error', function (event) {
      if (event && event.target && event.target !== window) return; // ignore failed media/tile elements
      flash('error', 2400);
    });

    window.setInterval(function () {
      hookViewer();
      if (thinkingUntil && Date.now() >= thinkingUntil) { thinkingUntil = 0; awaitingFlight = false; }
      evaluate('poll');
    }, 400);
  }

  function debugPicker() {
    var debug = params.get('orbDebug') === '1';
    try { debug = debug || window.localStorage.getItem('orionDebug') === '1'; } catch (error) { /* storage blocked */ }
    if (!debug) return;
    var picker = document.createElement('div');
    picker.className = 'orion-orb-debug';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Orb state preview');
    ['auto'].concat(STATES).forEach(function (state) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.state = state;
      b.textContent = state;
      b.addEventListener('click', function () { setOrbState(state === 'auto' ? null : state); });
      picker.appendChild(b);
    });
    document.body.appendChild(picker);
  }

  document.addEventListener('DOMContentLoaded', function () {
    decorate();
    var requested = params.get('orbState');
    if (requested && valid(requested)) pinned = requested;
    debugPicker();
    watchSignals();
    evaluate('init');
  });
}());
