const OrionOnboarding = (function() {
    'use strict';

    const STORAGE_KEYS = {
        ONBOARDING_COMPLETE: 'orion_onboarding_complete',
        CHANGELOG_VERSION: 'orion_changelog_dismissed',
        CURRENT_VERSION: '1.1.2-infrastructure'
    };

    const TUTORIAL_STEPS = [
        {
            id: 'search',
            title: 'Search Navigation',
            description: 'Search for any city, landmark, coordinates, or region to instantly navigate the globe. Try searching for "New York" or "35.6762, 139.6503" to jump to specific locations.',
            target: '#searchForm',
            position: 'right',
            cameraFly: null,
            scrollCommandPanelTop: true
        },
        {
            id: 'saved-locations',
            title: 'Saved Locations',
            description: 'Save your favorite views and locations for quick access. Click "SAVE VIEW" to bookmark your current camera position and return to it anytime.',
            target: '#savedLocations',
            position: 'right',
            cameraFly: null,
            scrollCommandPanelTop: true
        },
        {
            id: 'imagery',
            title: 'Imagery Layers',
            description: 'Switch between multiple imagery modes including thermal, true color, radar, cloud coverage, and night vision. Toggle layers on and off to customize your view.',
            target: '.layer-block',
            position: 'right',
            cameraFly: null,
            scrollCommandPanelTop: true
        },
        {
            id: 'split-orbit-controls',
            title: 'Split Compare & Orbit Reset',
            description: 'Split Compare lets you view two different dates side-by-side to analyze changes over time. Orbit Reset returns the camera to the default home view of Earth.',
            target: '.action-row',
            position: 'right',
            cameraFly: null,
            scrollTarget: '.action-row',
            scrollIntoView: true
        },
        {
            id: 'live-tracking-filters',
            title: 'Live Tracking Filters',
            description: 'Filter tracked objects by type: All, Aircraft, Satellites, or Vessels. Use these buttons to quickly focus on specific object categories.',
            target: '.track-filter-group',
            position: 'right',
            cameraFly: null,
            scrollTarget: '.track-filter-group',
            scrollIntoView: true
        },
        {
            id: 'live-tracking-toggles',
            title: 'Live Tracking Toggles',
            description: 'Enable or disable tracking for Aircraft, Satellites, and Vessels. These toggles control which synthetic mission objects appear on the globe with trails.',
            target: '.tracking-toggle-grid',
            position: 'right',
            cameraFly: null,
            scrollTarget: '.tracking-toggle-grid',
            scrollIntoView: true
        },
        {
            id: 'mission-systems',
            title: 'Mission Systems',
            description: 'Configure scan modes, earthquake feeds, radar settings, and generate historical timelapses. These advanced controls let you customize how Orion processes and displays data.',
            target: '.systems-block',
            position: 'right',
            cameraFly: null,
            scrollTarget: '.systems-block',
            scrollIntoView: true,
            scrollAlign: 'start'
        },
        {
            id: 'live-mode',
            title: 'Live Mode',
            description: 'Toggle Live Mode to switch between historical imagery and real-time data. When enabled, all feeds update continuously with the latest information.',
            target: '#liveModeToggle',
            position: 'right',
            cameraFly: null,
            scrollTarget: '#liveModeToggle',
            scrollIntoView: true
        },
        {
            id: 'intel-layers',
            title: 'Intel Layers',
            description: 'Enable real-time intelligence overlays including satellites, earthquakes, cameras, weather radar, ships, wildfires, storm volume, lightning, and 3D cities. Retired experimental layers are kept out of the production controls.',
            target: '.platform-block .section-label',
            position: 'right',
            cameraFly: null,
            scrollTarget: '.platform-block .section-label',
            scrollIntoView: true,
            scrollAlign: 'start',
            spotlightScope: 'platform-categories'
        },
        {
            id: 'cameranet',
            title: 'CameraNet',
            description: 'Access over 2,200 live traffic cameras and infrastructure feeds from Seattle, NYC, and Florida. Enable this layer to see camera markers on the globe.',
            target: 'label:has(#platformCameras)',
            position: 'right',
            cameraFly: { lat: 28.5, lon: -81.5, height: 500000 },
            scrollTarget: 'label:has(#platformCameras)',
            scrollIntoView: true,
            scrollAlign: 'start'
        },
        {
            id: 'camera-stream',
            title: 'Camera Stream Window',
            description: 'When you click a camera marker on the globe, this window opens showing the live feed or snapshot. Use the controls to minimize, fullscreen, pop out, or close the stream.',
            target: '#cameraWindow',
            position: 'left',
            cameraFly: null,
            scrollTarget: null,
            showCameraWindow: true
        },
        {
            id: 'tracking',
            title: 'Orbital Tracking',
            description: 'Track real-time satellites including the ISS, Starlink constellation, and orbital debris. Enable these layers to watch satellites orbit Earth with visible trails.',
            target: 'label:has(#platformSatellites)',
            position: 'right',
            cameraFly: { lat: 0, lon: 0, height: 15000000 },
            scrollTarget: 'label:has(#platformSatellites)',
            scrollIntoView: true,
            scrollAlign: 'start',
            highlightMultiple: ['label:has(#platformSatellites)', 'label:has(#platformStarlink)', 'label:has(#platformDebris)'],
            cardOffsetRight: 120
        },
        {
            id: 'telemetry-data',
            title: 'Live Telemetry',
            description: 'Monitor real-time data including target information, coordinates, altitude, camera height, tracking mode, and system status. This panel updates dynamically as you navigate.',
            target: '#telemetryPanel',
            position: 'left',
            cameraFly: null,
            scrollTarget: '#telemetryStack',
            scrollIntoView: true,
            showTelemetryStack: true
        },
        {
            id: 'intel-list',
            title: 'Selectable Intelligence',
            description: 'Every trackable object appears here — aircraft, satellites, vessels, cameras, and intel layers. Click a row or pick something on the globe to inspect live data.',
            target: '#intelListPanel',
            position: 'left',
            cameraFly: null,
            scrollTarget: '#intelListPanel',
            scrollIntoView: true,
            showIntelList: true,
            enableAisVesselsDemo: true
        },
        {
            id: 'timeline-modes',
            title: 'Timeline Modes',
            description: 'Switch between Hourly mode and Updates mode. Updates mode now follows the active map cadence, including 20-minute satellite steps and faster radar refreshes.',
            target: '.timeline-mode-row',
            position: 'top',
            cameraFly: null,
            scrollTarget: null
        },
        {
            id: 'timeline-slider',
            title: 'Timeline Slider',
            description: 'Drag the slider to travel through time. The timeline shows the date range and current position. Move it to view historical imagery from different dates.',
            target: '#timelineRange',
            position: 'top',
            cameraFly: null,
            scrollTarget: null
        },
        {
            id: 'timeline-hourly-controls',
            title: 'Hourly Playback Controls',
            description: 'In Hourly mode: Jump back 1 hour, play/pause animation, or jump forward 1 hour. Use these for precise temporal navigation.',
            target: '.transport-controls',
            position: 'top',
            cameraFly: null,
            scrollTarget: null
        },
        {
            id: 'timeline-speed',
            title: 'Playback Speed',
            description: 'Control how fast time moves during playback. Choose from 0.1 h/s (slow) to 10 h/s (fast) to match your analysis speed.',
            target: '#speedSelect',
            position: 'top',
            cameraFly: null,
            scrollTarget: null
        },
        {
            id: 'camera-controls',
            title: 'Camera Controls',
            description: 'Lock onto objects, follow moving targets, and navigate smoothly through the globe. Use the unlock button to release camera tracking and regain manual control.',
            target: '#unlockCamera',
            position: 'right',
            cameraFly: null,
            scrollTarget: '#unlockCamera',
            scrollIntoView: true
        },
        {
            id: 'hide-command-panel',
            title: 'Hide Command Panel',
            description: 'Click this button to collapse the Command panel. This gives you more screen space while keeping the panel accessible.',
            target: '#commandPanelToggle',
            position: 'right',
            cameraFly: null,
            scrollTarget: '#commandPanelToggle',
            scrollIntoView: true,
            spotlightOnly: true
        },
        {
            id: 'hide-telemetry-panel',
            title: 'Hide Telemetry Panel',
            description: 'Click this button to collapse the Telemetry panel. You can expand it again anytime by clicking the same button.',
            target: '#telemetryPanelToggle',
            position: 'left',
            cameraFly: null,
            scrollTarget: '#telemetryPanelToggle',
            scrollIntoView: true,
            spotlightOnly: true
        },
        {
            id: 'hide-timeline',
            title: 'Hide Timeline',
            description: 'Click this button to collapse the Timeline. This is useful when you want to focus on the current view without temporal controls.',
            target: '#timelineHudToggle',
            position: 'top',
            cameraFly: null,
            scrollTarget: '#timelineHudToggle',
            scrollIntoView: true,
            spotlightOnly: true
        },
        {
            id: 'hide-all-panels',
            title: 'Hide All Panels (H Key)',
            description: 'Click this button or press "H" on your keyboard to hide all panels and UI elements for an unobstructed view of the globe. Press "H" again to show them.',
            target: '#hudHideToggle',
            position: 'bottom',
            cameraFly: null,
            scrollTarget: '#hudHideToggle',
            scrollIntoView: true,
            spotlightOnly: true
        }
    ];

    const CHANGELOG = {
        version: '1.1.2',
        date: 'July 2026',
        sections: [
            {
                title: 'Provider Hardening',
                items: [
                    'Replaced direct RainViewer radar tile use with documented NOAA/NWS radar metadata and map-service support',
                    'Disabled undocumented weather tile providers until an approved raster renderer is available',
                    'Added provider health metadata with retry timing, static/live support, and attribution'
                ]
            },
            {
                title: 'Safer Defaults',
                items: [
                    'Moved first-run layer defaults into one authoritative configuration',
                    'Kept heavy live, radar, weather, camera, aircraft, vessel, satellite, and debris layers off by default',
                    'Persisted explicit user choices without re-enabling heavy layers for first-time visitors'
                ]
            },
            {
                title: 'Static And Local Modes',
                items: [
                    'Added request cancellation and provider gating for unsupported static-mode layers',
                    'Updated GitHub Pages snapshot generation for NOAA/NWS radar and metadata-only weather fields',
                    'Removed dead RainViewer and undocumented weather proxy routes from the Python backend'
                ]
            },
            {
                title: 'Documentation',
                items: [
                    'Added audit, architecture, issue inventory, data source, and implementation-plan documents',
                    'Added a visible Data Sources and Attribution panel in the command HUD',
                    'Updated README setup, provider, static deployment, validation, and troubleshooting notes'
                ]
            }
        ]
    };

    let currentStep = 0;
    let isActive = false;
    let viewer = null;
    let layoutRefreshTimer = null;
    let trackingDemoRestore = null;
    let liveTrackingTutorialRestore = null;

    function getCommandPanelScroller() {
        return document.getElementById('commandPanel');
    }

    function ensureCommandPanelExpanded() {
        var panel = getCommandPanelScroller();
        var toggle = document.getElementById('commandPanelToggle');

        if (panel && panel.classList.contains('collapsed') && toggle) {
            toggle.click();
        }
    }

    function findPanelScrollContainer(element) {
        if (!element) {
            return null;
        }

        var node = element;

        while (node && node !== document.body) {
            if (node.classList && node.classList.contains('hud-panel')) {
                return node;
            }
            node = node.parentElement;
        }

        return null;
    }

    function scrollCommandPanelToTop() {
        return new Promise(function (resolve) {
            ensureCommandPanelExpanded();
            var scroller = getCommandPanelScroller();

            if (scroller) {
                scroller.scrollTo({ top: 0, behavior: 'smooth' });
            }

            window.setTimeout(resolve, 480);
        });
    }

    function isVisibleInScroller(scroller, target, pad) {
        var targetRect = target.getBoundingClientRect();
        var scrollerRect = scroller.getBoundingClientRect();
        var inset = pad || 48;

        return targetRect.top >= scrollerRect.top + inset &&
            targetRect.bottom <= scrollerRect.bottom - inset;
    }

    function scrollTutorialTarget(selector, align) {
        return new Promise(function (resolve) {
            if (!selector) {
                resolve();
                return;
            }

            ensureCommandPanelExpanded();

            var target = document.querySelector(selector);

            if (!target) {
                resolve();
                return;
            }

            var scroller = findPanelScrollContainer(target);
            var edgePad = align === 'start' ? 72 : 40;

            function applyScroll() {
                if (scroller && scroller.contains(target)) {
                    var targetRect = target.getBoundingClientRect();
                    var scrollerRect = scroller.getBoundingClientRect();
                    var delta;

                    if (align === 'start') {
                        delta = targetRect.top - scrollerRect.top - edgePad;
                    } else if (align === 'end') {
                        delta = targetRect.bottom - scrollerRect.bottom + edgePad;
                    } else {
                        delta = targetRect.top - scrollerRect.top - (scroller.clientHeight * 0.26) + (targetRect.height * 0.5);
                    }

                    scroller.scrollBy({
                        top: delta,
                        behavior: 'smooth'
                    });
                } else {
                    target.scrollIntoView({
                        block: align === 'start' ? 'start' : (align === 'end' ? 'end' : 'center'),
                        inline: 'nearest',
                        behavior: 'smooth'
                    });
                }
            }

            applyScroll();

            window.setTimeout(function () {
                if (scroller && !isVisibleInScroller(scroller, target, edgePad - 12)) {
                    applyScroll();
                }
                window.setTimeout(resolve, 380);
            }, 520);
        });
    }

    function runTutorialScroll(step) {
        if (step.scrollCommandPanelTop) {
            return scrollCommandPanelToTop();
        }

        if (step.scrollIntoView && step.scrollTarget) {
            return scrollTutorialTarget(step.scrollTarget, step.scrollAlign || 'center');
        }

        return Promise.resolve();
    }

    function disableLiveTrackingForTutorial() {
        var air = document.getElementById('trackAircraft');
        var sat = document.getElementById('trackSatellites');
        var sea = document.getElementById('trackVessels');

        liveTrackingTutorialRestore = {
            air: air ? air.checked : true,
            sat: sat ? sat.checked : true,
            sea: sea ? sea.checked : true
        };

        [air, sat, sea].forEach(function (input) {
            if (!input) {
                return;
            }

            if (input.checked) {
                input.checked = false;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            input.disabled = true;
            input.setAttribute('aria-disabled', 'true');
        });
    }

    function restoreLiveTrackingAfterTutorial() {
        if (!liveTrackingTutorialRestore) {
            return;
        }

        var map = [
            ['air', 'trackAircraft'],
            ['sat', 'trackSatellites'],
            ['sea', 'trackVessels']
        ];

        map.forEach(function (pair) {
            var input = document.getElementById(pair[1]);

            if (!input) {
                return;
            }

            input.disabled = false;
            input.removeAttribute('aria-disabled');

            if (input.checked !== liveTrackingTutorialRestore[pair[0]]) {
                input.checked = liveTrackingTutorialRestore[pair[0]];
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        liveTrackingTutorialRestore = null;
    }

    function scrollerClipRect(scroller) {
        var screenPadding = 20;

        if (!scroller) {
            return {
                top: screenPadding,
                bottom: window.innerHeight - screenPadding,
                left: screenPadding,
                right: window.innerWidth - screenPadding
            };
        }

        var rect = scroller.getBoundingClientRect();

        return {
            top: rect.top + 8,
            bottom: rect.bottom - 8,
            left: rect.left + 8,
            right: rect.right - 8
        };
    }

    function unionElementRects(elements, scroller) {
        var padding = 12;
        var clip = scrollerClipRect(scroller);
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        var found = false;

        elements.forEach(function (el) {
            if (!el) {
                return;
            }

            var rect = el.getBoundingClientRect();

            if (!rect.width || !rect.height) {
                return;
            }

            if (rect.bottom < clip.top || rect.top > clip.bottom) {
                return;
            }

            found = true;
            minX = Math.min(minX, rect.left);
            minY = Math.min(minY, rect.top);
            maxX = Math.max(maxX, rect.right);
            maxY = Math.max(maxY, rect.bottom);
        });

        if (!found) {
            return null;
        }

        var left = Math.max(clip.left, minX - padding);
        var top = Math.max(clip.top, minY - padding);
        var right = Math.min(clip.right, maxX + padding);
        var bottom = Math.min(clip.bottom, maxY + padding);
        var height = bottom - top;

        if (height < 8) {
            return null;
        }

        return { left: left, top: top, width: right - left, height: height };
    }

    function rectsForPlatformCategories() {
        var block = document.querySelector('.platform-block');

        if (!block) {
            return null;
        }

        var scroller = findPanelScrollContainer(block);
        var parts = block.querySelectorAll('.platform-category');

        if (!parts.length) {
            parts = block.querySelectorAll('label.toggle-row');
        }

        return unionElementRects(Array.prototype.slice.call(parts), scroller);
    }

    function rectsForSelectors(selectors, step) {
        if (step && step.spotlightScope === 'platform-categories') {
            return rectsForPlatformCategories();
        }

        var padding = 12;
        var clip = scrollerClipRect(null);
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        var found = false;

        selectors.forEach(function (selector) {
            var el = document.querySelector(selector);

            if (!el) {
                return;
            }

            var scroller = findPanelScrollContainer(el);
            if (scroller) {
                clip = scrollerClipRect(scroller);
            }

            var rect = el.getBoundingClientRect();

            if (!rect.width && !rect.height) {
                return;
            }

            found = true;
            minX = Math.min(minX, rect.left);
            minY = Math.min(minY, rect.top);
            maxX = Math.max(maxX, rect.right);
            maxY = Math.max(maxY, rect.bottom);
        });

        if (!found) {
            return null;
        }

        var left = Math.max(clip.left, minX - padding);
        var top = Math.max(clip.top, minY - padding);
        var right = Math.min(clip.right, maxX + padding);
        var bottom = Math.min(clip.bottom, maxY + padding);
        var height = bottom - top;

        if (height < 8) {
            return null;
        }

        return { left: left, top: top, width: right - left, height: height };
    }

    function applySpotlightRect(rect) {
        var spotlight = document.querySelector('.onboarding-spotlight');

        if (!spotlight) {
            return;
        }

        if (!rect || rect.width < 8 || rect.height < 8) {
            spotlight.style.opacity = '0';
            return;
        }

        spotlight.style.left = rect.left + 'px';
        spotlight.style.top = rect.top + 'px';
        spotlight.style.width = rect.width + 'px';
        spotlight.style.height = rect.height + 'px';
        spotlight.style.opacity = '1';
    }

    function clearTutorialHighlights() {
        document.querySelectorAll('.onboarding-highlight').forEach(function (el) {
            el.classList.remove('onboarding-highlight');
        });
    }

    function enableAisVesselsDemo() {
        var liveShips = document.getElementById('platformLiveShips');

        trackingDemoRestore = {
            liveShips: liveShips ? liveShips.checked : false
        };

        if (liveShips && !liveShips.checked) {
            liveShips.checked = true;
            liveShips.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function restoreTrackingDemo() {
        if (!trackingDemoRestore) {
            return;
        }

        var liveShips = document.getElementById('platformLiveShips');

        if (liveShips && liveShips.checked !== trackingDemoRestore.liveShips) {
            liveShips.checked = trackingDemoRestore.liveShips;
            liveShips.dispatchEvent(new Event('change', { bubbles: true }));
        }

        trackingDemoRestore = null;
    }

    function prepareIntelListDemo() {
        window._onboardingForceIntelList = true;

        var intelPanel = document.getElementById('intelListPanel');
        var telemetryStack = document.getElementById('telemetryStack');

        if (intelPanel) {
            intelPanel.classList.remove('hidden');
        }

        if (telemetryStack) {
            telemetryStack.classList.add('hidden');
        }

        window.setTimeout(function () {
            if (typeof window.refreshOrionIntelList === 'function') {
                window.refreshOrionIntelList();
            }
        }, 160);

        window._onboardingShowedIntelList = true;
    }

    function restoreTelemetryStackView() {
        window._onboardingForceIntelList = false;

        var intelPanel = document.getElementById('intelListPanel');
        var telemetryStack = document.getElementById('telemetryStack');

        if (intelPanel) {
            intelPanel.classList.add('hidden');
        }

        if (telemetryStack) {
            telemetryStack.classList.remove('hidden');
        }

        if (typeof window.refreshOrionIntelList === 'function') {
            window.refreshOrionIntelList();
        }

        window._onboardingShowedIntelList = false;
    }

    function prepareTelemetryStackView() {
        window._onboardingForceIntelList = false;
        restoreTrackingDemo();

        var intelPanel = document.getElementById('intelListPanel');
        var telemetryStack = document.getElementById('telemetryStack');

        if (intelPanel) {
            intelPanel.classList.add('hidden');
        }

        if (telemetryStack) {
            telemetryStack.classList.remove('hidden');
        }
    }

    function cleanupStepEffects(step) {
        if (!step) {
            return;
        }

        if (step.showIntelList) {
            restoreTelemetryStackView();
            restoreTrackingDemo();
        }

        if (step.enableAisVesselsDemo || step.enableTrackingDemo) {
            restoreTrackingDemo();
        }

        if (step.showCameraWindow && window._onboardingShowedCameraWindow) {
            var cameraWindow = document.getElementById('cameraWindow');

            if (cameraWindow && !cameraWindow.classList.contains('hidden')) {
                cameraWindow.classList.add('hidden');
                cameraWindow.style.right = '';
                cameraWindow.style.bottom = '';
                cameraWindow.style.left = '';
                cameraWindow.style.top = '';
                cameraWindow.style.transform = '';
            }

            window._onboardingShowedCameraWindow = false;
        }
    }

    function hasCompletedOnboarding() {
        return localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) === 'true';
    }

    function hasSeenChangelog() {
        return localStorage.getItem(STORAGE_KEYS.CHANGELOG_VERSION) === STORAGE_KEYS.CURRENT_VERSION;
    }

    function markOnboardingComplete() {
        localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true');
    }

    function markChangelogSeen() {
        localStorage.setItem(STORAGE_KEYS.CHANGELOG_VERSION, STORAGE_KEYS.CURRENT_VERSION);
    }

    function createChangelogModal() {
        const modal = document.createElement('div');
        modal.id = 'orionChangelog';
        modal.className = 'orion-modal';
        
        let sectionsHTML = '';
        CHANGELOG.sections.forEach(section => {
            const itemsHTML = section.items.map(item => 
                `<li class="changelog-item">${item}</li>`
            ).join('');
            
            sectionsHTML += `
                <div class="changelog-section">
                    <h3 class="changelog-section-title">${section.title}</h3>
                    <ul class="changelog-list">${itemsHTML}</ul>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="orion-modal-backdrop"></div>
            <div class="orion-modal-content changelog-modal">
                <div class="modal-header">
                    <div class="modal-eyebrow">What's New</div>
                    <h2 class="modal-title">Project Orion ${CHANGELOG.version}</h2>
                    <div class="modal-subtitle">${CHANGELOG.date}</div>
                </div>
                <div class="modal-body">
                    ${sectionsHTML}
                </div>
                <div class="modal-footer">
                    <button class="orion-btn orion-btn-close" id="changelogContinue">
                        <span class="close-icon">×</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        setTimeout(() => {
            modal.classList.add('active');
            
            const modalBody = modal.querySelector('.modal-body');
            if (modalBody && modalBody.scrollHeight > modalBody.clientHeight) {
                setTimeout(() => {
                    modalBody.scrollTo({ top: 100, behavior: 'smooth' });
                    setTimeout(() => {
                        modalBody.scrollTo({ top: 0, behavior: 'smooth' });
                    }, 1000);
                }, 500);
            }
        }, 50);

        document.getElementById('changelogContinue').addEventListener('click', () => {
            closeChangelog();
        });

        modal.querySelector('.orion-modal-backdrop').addEventListener('click', () => {
            closeChangelog();
        });
    }

    function closeChangelog() {
        const modal = document.getElementById('orionChangelog');
        if (!modal) return;

        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
            markChangelogSeen();
            
            if (!hasCompletedOnboarding()) {
                setTimeout(() => startOnboarding(), 800);
            }
        }, 600);
    }

    function createOnboardingOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'orionOnboarding';
        overlay.className = 'orion-onboarding';
        
        overlay.innerHTML = `
            <div class="onboarding-backdrop"></div>
            <div class="onboarding-spotlight"></div>
            <div class="onboarding-card">
                <div class="onboarding-progress">
                    <span class="progress-current">1</span>
                    <span class="progress-separator">/</span>
                    <span class="progress-total">${TUTORIAL_STEPS.length}</span>
                </div>
                <h3 class="onboarding-title"></h3>
                <p class="onboarding-description"></p>
                <div class="onboarding-controls">
                    <button class="orion-btn orion-btn-ghost" id="onboardingSkip">Skip Tutorial</button>
                    <div class="onboarding-nav">
                        <button class="orion-btn orion-btn-ghost" id="onboardingBack" disabled>Back</button>
                        <button class="orion-btn orion-btn-primary" id="onboardingNext">Next</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('onboardingNext').addEventListener('click', nextStep);
        document.getElementById('onboardingBack').addEventListener('click', prevStep);
        document.getElementById('onboardingSkip').addEventListener('click', skipOnboarding);

        setTimeout(() => overlay.classList.add('active'), 50);
    }

    function refreshTutorialLayout(step) {
        if (!step || step.skipHighlight) {
            return;
        }

        var selectors = [];

        if (step.highlightMultiple && Array.isArray(step.highlightMultiple)) {
            selectors = step.highlightMultiple.slice();
        } else if (step.target) {
            selectors = [step.target];
        }

        if (!selectors.length) {
            return;
        }

        if (!step.spotlightOnly) {
            clearTutorialHighlights();
            selectors.forEach(function (selector) {
                var el = document.querySelector(selector);

                if (el) {
                    el.classList.add('onboarding-highlight');
                }
            });
        } else {
            clearTutorialHighlights();
        }

        applySpotlightRect(rectsForSelectors(selectors, step));

        var posTarget = step.highlightMultiple ? step.highlightMultiple[0] : step.target;
        positionCard(posTarget, step.position, step.cardOffsetRight);

        if (viewer && typeof viewer.resize === 'function') {
            viewer.resize();
        }
    }

    function scheduleTutorialLayoutRefresh(step) {
        window.clearTimeout(layoutRefreshTimer);
        layoutRefreshTimer = window.setTimeout(function () {
            refreshTutorialLayout(step);
            window.setTimeout(function () {
                refreshTutorialLayout(step);
            }, 220);
            window.setTimeout(function () {
                refreshTutorialLayout(step);
            }, 560);
            window.setTimeout(function () {
                refreshTutorialLayout(step);
            }, 920);
        }, 80);
    }

    function updateStep() {
        const step = TUTORIAL_STEPS[currentStep];
        const overlay = document.getElementById('orionOnboarding');
        if (!overlay) return;

        overlay.querySelector('.progress-current').textContent = currentStep + 1;
        overlay.querySelector('.onboarding-title').textContent = step.title;
        overlay.querySelector('.onboarding-description').textContent = step.description;

        const backBtn = document.getElementById('onboardingBack');
        const nextBtn = document.getElementById('onboardingNext');

        backBtn.disabled = currentStep === 0;
        nextBtn.textContent = currentStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';

        if (!step.enableAisVesselsDemo) {
            restoreTrackingDemo();
        }

        if (!step.showIntelList) {
            if (window._onboardingShowedIntelList || window._onboardingForceIntelList) {
                restoreTelemetryStackView();
            }
        }

        if (step.showTelemetryStack) {
            prepareTelemetryStackView();
        }

        if (step.enableAisVesselsDemo) {
            enableAisVesselsDemo();
        }

        if (step.showIntelList) {
            prepareIntelListDemo();
        }

        if (step.showCameraWindow) {
            const cameraWindow = document.getElementById('cameraWindow');
            if (cameraWindow && cameraWindow.classList.contains('hidden')) {
                cameraWindow.classList.remove('hidden');
                cameraWindow.style.right = 'auto';
                cameraWindow.style.bottom = 'auto';
                cameraWindow.style.left = '50%';
                cameraWindow.style.top = '50%';
                cameraWindow.style.transform = 'translate(-50%, -50%)';
                window._onboardingShowedCameraWindow = true;
            }
        }

        const runLayout = function () {
            if (!step.skipHighlight) {
                refreshTutorialLayout(step);
                scheduleTutorialLayoutRefresh(step);
            } else {
                const card = document.querySelector('.onboarding-card');
                if (card) {
                    card.style.left = (window.innerWidth / 2 - card.offsetWidth / 2) + 'px';
                    card.style.top = (window.innerHeight / 2 - card.offsetHeight / 2) + 'px';
                }
            }
        };

        runTutorialScroll(step).then(runLayout);

        if (step.cameraFly && viewer) {
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                    step.cameraFly.lon,
                    step.cameraFly.lat,
                    step.cameraFly.height
                ),
                duration: 2.0,
                easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
            });
        }
    }

    function highlightElement(selector, highlightMultiple) {
        var step = TUTORIAL_STEPS[currentStep] || {};
        step.target = selector;
        step.highlightMultiple = highlightMultiple;
        refreshTutorialLayout(step);
    }

    function positionCard(selector, position, extraOffsetRight) {
        const target = document.querySelector(selector);
        const card = document.querySelector('.onboarding-card');
        if (!target || !card) return;

        const rect = target.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const padding = 24;
        const screenPadding = 24;

        let left, top;

        switch (position) {
            case 'right':
                left = rect.right + padding;
                top = rect.top + (rect.height / 2) - (cardRect.height / 2);
                
                if (extraOffsetRight) {
                    left += extraOffsetRight;
                }
                
                if (left + cardRect.width > window.innerWidth - screenPadding) {
                    left = rect.left - cardRect.width - padding;
                }
                break;
            case 'left':
                left = rect.left - cardRect.width - padding;
                top = rect.top + (rect.height / 2) - (cardRect.height / 2);
                
                if (left < screenPadding) {
                    left = rect.right + padding;
                }
                break;
            case 'top':
                left = rect.left + (rect.width / 2) - (cardRect.width / 2);
                top = rect.top - cardRect.height - padding;
                
                if (top < screenPadding) {
                    top = rect.bottom + padding;
                }
                break;
            case 'bottom':
                left = rect.left + (rect.width / 2) - (cardRect.width / 2);
                top = rect.bottom + padding;
                
                if (top + cardRect.height > window.innerHeight - screenPadding) {
                    top = rect.top - cardRect.height - padding;
                }
                break;
            default:
                left = window.innerWidth / 2 - cardRect.width / 2;
                top = window.innerHeight / 2 - cardRect.height / 2;
        }

        const maxLeft = window.innerWidth - cardRect.width - screenPadding;
        const maxTop = window.innerHeight - cardRect.height - screenPadding;
        
        left = Math.max(screenPadding, Math.min(left, maxLeft));
        top = Math.max(screenPadding, Math.min(top, maxTop));

        card.style.left = left + 'px';
        card.style.top = top + 'px';
    }

    function nextStep() {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            cleanupStepEffects(TUTORIAL_STEPS[currentStep]);
            currentStep++;
            updateStep();
        } else {
            finishOnboarding();
        }
    }

    function prevStep() {
        if (currentStep > 0) {
            cleanupStepEffects(TUTORIAL_STEPS[currentStep]);
            currentStep--;
            updateStep();
        }
    }

    function skipOnboarding() {
        showSkipConfirmation();
    }

    function showSkipConfirmation() {
        const modal = document.createElement('div');
        modal.id = 'skipConfirmModal';
        modal.className = 'orion-modal active';
        
        modal.innerHTML = `
            <div class="orion-modal-backdrop"></div>
            <div class="orion-modal-content" style="width: min(420px, calc(100vw - 40px));">
                <div class="modal-header" style="padding: 24px 24px 16px;">
                    <h2 class="modal-title" style="font-size: 22px; margin: 0;">Skip Tutorial?</h2>
                </div>
                <div class="modal-body" style="padding: 16px 24px;">
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.72); font-size: 14px; line-height: 1.6;">
                        You can replay the tutorial later from settings if needed.
                    </p>
                </div>
                <div class="modal-footer" style="padding: 16px 24px 24px;">
                    <button class="orion-btn orion-btn-ghost" id="skipCancel">Cancel</button>
                    <button class="orion-btn orion-btn-primary" id="skipConfirm">Skip Tutorial</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('skipCancel').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 600);
        });

        document.getElementById('skipConfirm').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
                finishOnboarding();
            }, 600);
        });

        modal.querySelector('.orion-modal-backdrop').addEventListener('click', () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 600);
        });
    }

    function finishOnboarding() {
        const overlay = document.getElementById('orionOnboarding');
        if (!overlay) return;

        cleanupStepEffects(TUTORIAL_STEPS[currentStep]);
        restoreTelemetryStackView();
        restoreTrackingDemo();
        restoreLiveTrackingAfterTutorial();
        window._onboardingForceIntelList = false;

        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
            markOnboardingComplete();
            isActive = false;
            clearTutorialHighlights();

            if (viewer) {
                viewer.camera.flyHome(2.0);
            }
        }, 600);
    }

    function bindTutorialResize() {
        window.addEventListener('resize', function () {
            if (!isActive) {
                return;
            }

            scheduleTutorialLayoutRefresh(TUTORIAL_STEPS[currentStep]);
        });
    }

    function startOnboarding(cesiumViewer) {
        if (isActive) return;
        
        viewer = cesiumViewer || window.viewer;
        isActive = true;
        currentStep = 0;

        createOnboardingOverlay();
        bindTutorialResize();
        updateStep();
    }

    function showChangelog() {
        createChangelogModal();
    }

    function init(cesiumViewer) {
        viewer = cesiumViewer || window.viewer;

        setTimeout(() => {
            if (!hasSeenChangelog()) {
                showChangelog();
            }
            else if (!hasCompletedOnboarding()) {
                startOnboarding();
            }
        }, 1500);
    }

    return {
        init,
        startOnboarding,
        showChangelog,
        hasCompletedOnboarding,
        reset: () => {
            localStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETE);
            localStorage.removeItem(STORAGE_KEYS.CHANGELOG_VERSION);
        }
    };
})();

if (typeof window !== 'undefined') {
    window.OrionOnboarding = OrionOnboarding;
}
