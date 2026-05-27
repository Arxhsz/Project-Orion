const progress = document.getElementById("progress");
const percent = document.getElementById("percent");
const operation = document.getElementById("operation");
const fact = document.getElementById("fact");
const operations = [
    "Initializing Cesium renderer...",
    "Loading orbital imagery...",
    "Synchronizing telemetry...",
    "Loading tactical overlays...",
    "Building CameraNet cache...",
    "Initializing weather systems...",
    "Preparing thermal layers...",
    "Finalizing Orion systems..."
];
const facts = [
    "Low Earth Orbit satellites travel over 17,000 mph.",
    "The ISS circles Earth every 90 minutes.",
    "Thermal imagery can reveal storm intensity.",
    "AIS systems track thousands of vessels globally.",
    "Some orbital imagery updates every few minutes.",
    "Cesium streams terrain dynamically in real time."
];
const globeImages = [
    "./loading_images/earth1.jpg",
    "./loading_images/earth2.jpg",
    "./loading_images/earth3.jpg",
    "./loading_images/earth4.jpg"
];

const visual = document.querySelector(".visual");

const panAnimations = [
    'panUpRight',
    'panUpLeft', 
    'panDownRight',
    'panDownLeft',
    'panRight',
    'panLeft',
    'panUp',
    'panDown'
];

function applyRandomPan() {
    const randomAnim = panAnimations[Math.floor(Math.random() * panAnimations.length)];
    const duration = 25 + Math.random() * 10;
    visual.style.animation = `${randomAnim} ${duration}s linear infinite alternate`;
}

let imageIndex = Math.floor(Math.random() * globeImages.length);
visual.style.backgroundImage = `url('${globeImages[imageIndex]}')`;
applyRandomPan();
const imageRotationInterval = setInterval(() => {
    imageIndex++;
    if(imageIndex >= globeImages.length){
        imageIndex = 0;
    }
    visual.style.opacity = 0;
    setTimeout(() => {
        visual.style.backgroundImage = `url('${globeImages[imageIndex]}')`;
        visual.style.opacity = .40;
        applyRandomPan();
    }, 1200);
}, 10000);

let factIndex = Math.floor(Math.random() * facts.length);
fact.innerText = facts[factIndex];

const factRotationInterval = setInterval(() => {
    fact.style.opacity = 0;
    setTimeout(() => {
        factIndex++;
        if(factIndex >= facts.length){
            factIndex = 0;
        }
        fact.innerText = facts[factIndex];
        fact.style.opacity = 1;
    }, 1500);
}, 7000);
let value = 0;
let loadingComplete = false;
const loadingInterval = setInterval(() => {
    if (loadingComplete) {
        return;
    }
    
    value += Math.random() * 2.5;
    
    if(value >= 95 && !loadingComplete){
        value = 95;
    }
    
    if(value >= 100){
        value = 100;
        clearInterval(loadingInterval);
    }
    
    const rounded = Math.floor(value);
    progress.style.width = rounded + "%";
    percent.innerText = rounded + "%";
    
    if (rounded < 95) {
        operation.innerText = operations[Math.floor(Math.random() * operations.length)];
    }
}, 800);
window.OrionLoadingManager = {
    cesiumReady: false,
    imageryReady: false,
    entitiesReady: false,
    
    markCesiumReady: function() {
        this.cesiumReady = true;
        this.checkComplete();
    },
    
    markImageryReady: function() {
        this.imageryReady = true;
        this.checkComplete();
    },
    
    markEntitiesReady: function() {
        this.entitiesReady = true;
        this.checkComplete();
    },
    
    checkComplete: function() {
        if (this.cesiumReady && this.imageryReady && !loadingComplete) {
            this.complete();
        }
    },
    
    complete: function() {
        if (loadingComplete) return;
        loadingComplete = true;
        
        value = 100;
        progress.style.width = "100%";
        percent.innerText = "100%";
        operation.innerText = "Launch ready.";
        
        clearInterval(loadingInterval);
        clearInterval(imageRotationInterval);
        clearInterval(factRotationInterval);
        
        setTimeout(() => {
            this.fadeOut();
        }, 800);
    },
    
    fadeOut: function() {
        const loadingScreen = document.getElementById("orionLoadingScreen");
        const cesiumContainer = document.getElementById("cesiumContainer");
        
        if (!loadingScreen) {
            console.warn("Loading screen element not found");
            return;
        }
        
        loadingScreen.classList.add("fade-out");
        
        if (cesiumContainer) {
            cesiumContainer.classList.add("orion-ready");
        }
        
        setTimeout(() => {
            if (loadingScreen && loadingScreen.parentNode) {
                loadingScreen.remove();
            }
            
            const checkViewer = setInterval(() => {
                if (window.OrionOnboarding && window.viewer) {
                    clearInterval(checkViewer);
                    OrionOnboarding.init(window.viewer);
                }
            }, 100);
            
            setTimeout(() => clearInterval(checkViewer), 10000);
        }, 1200);
    },
    
    startFallbackTimer: function() {
        setTimeout(() => {
            if (!loadingComplete) {
                console.warn("Loading timeout reached, forcing completion");
                this.complete();
            }
        }, 15000);
    }
};

window.OrionLoadingManager.startFallbackTimer();
window.orionLoadingComplete = function() {
    window.OrionLoadingManager.complete();
};
