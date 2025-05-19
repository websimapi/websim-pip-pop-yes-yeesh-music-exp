import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Main application class
class MusicExperience {
    constructor() {
        this.clock = new THREE.Clock();
        this.audioInitialized = false;
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingProgress = document.querySelector('.loading-progress');
        this.loadingMessage = document.querySelector('.loading-message');
        
        // Audio raytracing properties
        this.audioSources = [];
        this.audioEmitters = [];
        this.reflectiveSurfaces = [];
        this.roomAcoustics = {
            outside: {
                reflectionLevel: 0.1,
                reverbTime: 0.1,
                damping: 0.7,
                diffusion: 0.3
            },
            clubInterior: {
                reflectionLevel: 0.8,
                reverbTime: 1.8,
                damping: 0.2,
                diffusion: 0.8
            },
            hallway: {
                reflectionLevel: 0.4,
                reverbTime: 0.6,
                damping: 0.5,
                diffusion: 0.5
            }
        };
        
        // Setup event for starting the experience
        this.setupStartButton();
    }

    setupStartButton() {
        // Add start button to loading screen
        const startButton = document.createElement('button');
        startButton.id = 'start-experience';
        startButton.innerHTML = '<i class="fas fa-play"></i> Start Experience';
        startButton.style.display = 'none'; // Initially hidden
        
        const loadingContent = document.querySelector('.loading-content');
        loadingContent.appendChild(startButton);
        
        // Show start button after initial loading
        setTimeout(() => {
            this.loadingProgress.style.width = '100%';
            this.loadingMessage.textContent = 'Ready! Click Start to begin';
            startButton.style.display = 'inline-block';
        }, 2000);
        
        // Initialize experience after user interaction
        startButton.addEventListener('click', () => {
            this.init();
            startButton.style.display = 'none';
            this.loadingMessage.textContent = 'Loading audio and visuals...';
            this.loadingProgress.style.width = '0%';
            this.progress = 0;
            
            // Restart loading animation
            this.loadingInterval = setInterval(() => {
                this.progress += 2;
                if (this.progress > 95) clearInterval(this.loadingInterval);
                this.loadingProgress.style.width = `${this.progress}%`;
            }, 100);
        });
    }

    async init() {
        try {
            // Start with Three.js setup so we have a scene to position audio in
            this.setupThreeJS();
            this.setupLights();
            this.setupPostProcessing();
            this.createClubScene();
            
            // Then set up audio with spatial positioning
            await this.setupRaytracedAudio();
            
            this.setupEventListeners();
            this.animate();
            this.finishLoading();
        } catch (error) {
            console.error("Error during initialization:", error);
            this.showErrorMessage("There was a problem loading the experience. Please try refreshing or use a different browser.");
        }
    }

    showErrorMessage(message) {
        clearInterval(this.loadingInterval);
        this.loadingProgress.style.backgroundColor = 'red';
        this.loadingProgress.style.width = '100%';
        this.loadingMessage.textContent = message;
        this.loadingMessage.style.color = 'red';
    }

    setupLoading() {
        this.progress = 0;

        // Simulate loading progress
        this.loadingInterval = setInterval(() => {
            this.progress += 2;
            if (this.progress > 95) clearInterval(this.loadingInterval);
            this.loadingProgress.style.width = `${this.progress}%`;
        }, 100);
    }

    finishLoading() {
        clearInterval(this.loadingInterval);
        this.loadingProgress.style.width = '100%';

        setTimeout(() => {
            this.loadingScreen.style.opacity = 0;
            setTimeout(() => {
                this.loadingScreen.style.display = 'none';
            }, 1000);
        }, 500);
    }

    async setupRaytracedAudio() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume audio context if suspended (browsers require user interaction)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Create audio listener (attached to camera)
            this.audioListener = this.audioContext.listener;
            
            // Position the listener based on camera position
            this.updateAudioListenerPosition();
            
            // Create analyzer for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Set up room acoustics and reverb
            await this.setupRoomAcoustics();
            
            // Load main music with spatial positioning and fallback
            await this.loadMainAudio();
            
            // Load sound effects with spatial positioning
            await this.loadSpatialSoundEffects();
            
            // Play outdoor ambient sounds
            this.playOutdoorAmbience();
            
            // Initial state - outside the club
            this.isPlaying = true;
            this.isInside = false;
            this.audioInitialized = true;
            
        } catch (error) {
            console.error("Audio setup error:", error);
            // Fall back to basic audio if spatial audio fails
            await this.setupFallbackAudio();
        }
    }
    
    async setupFallbackAudio() {
        this.loadingMessage.textContent = "Using simplified audio (spatial audio not supported)";
        
        // Basic audio setup without spatial features
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        // Load fallback audio
        const response = await fetch('/audio-fallback.mp3');
        const buffer = await response.arrayBuffer();
        const audioBuffer = await this.decodeAudioData(buffer);
        
        // Create simple sources
        this.insideSource = this.audioContext.createBufferSource();
        this.insideSource.buffer = audioBuffer;
        this.insideSource.loop = true;
        
        this.outsideSource = this.audioContext.createBufferSource();
        this.outsideSource.buffer = audioBuffer;
        this.outsideSource.loop = true;
        
        // Simple gain and filter
        this.insideGain = this.audioContext.createGain();
        this.outsideGain = this.audioContext.createGain();
        this.outsideLowpass = this.audioContext.createBiquadFilter();
        this.outsideLowpass.type = 'lowpass';
        this.outsideLowpass.frequency.value = 300;
        
        // Connect nodes
        this.insideSource.connect(this.insideGain);
        this.insideGain.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        this.outsideSource.connect(this.outsideLowpass);
        this.outsideLowpass.connect(this.outsideGain);
        this.outsideGain.connect(this.audioContext.destination);
        
        // Set initial volumes
        this.insideGain.gain.value = 0;
        this.outsideGain.gain.value = 0.3;
        
        // Start audio
        this.insideSource.start(0);
        this.outsideSource.start(0);
        
        // Load basic sound effects
        this.soundEffects = {};
        await Promise.all([
            this.loadSoundEffect('doorOpen', './door-open.wav'),
            this.loadSoundEffect('crowdChatter', './crowd-chatter.wav'),
            this.loadSoundEffect('bassDrop', './bass-drop.wav')
        ]);
        
        // Play crowd sound
        this.crowdSound = this.playSoundEffect('crowdChatter', true, 0.4);
        
        this.audioInitialized = true;
    }
    
    async setupRoomAcoustics() {
        // Create convolution reverbs for different spaces
        this.reverbs = {};
        
        // Create convolution nodes for each space type
        for (const [roomType, settings] of Object.entries(this.roomAcoustics)) {
            const convolver = this.audioContext.createConvolver();
            // Generate impulse response for this room type
            convolver.buffer = await this.generateRoomImpulse(settings);
            this.reverbs[roomType] = convolver;
        }
        
        // Create dry/wet mix for adjustable reverb amount
        this.reverbMix = this.audioContext.createGain();
        this.directMix = this.audioContext.createGain();
    }
    
    async generateRoomImpulse({ reflectionLevel, reverbTime, damping, diffusion }) {
        // Create an impulse response that simulates a specific room
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * reverbTime;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);
        
        // Generate early reflections and late reverb
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Early reflections (more distinct)
            if (t < 0.1) {
                if (i % Math.floor(0.01 * sampleRate) === 0) {
                    const reflection = reflectionLevel * Math.exp(-t * 5) * (0.95 - Math.random() * 0.1);
                    impulseL[i] = reflection * (Math.random() * 2 - 1);
                    impulseR[i] = reflection * (Math.random() * 2 - 1);
                }
            } 
            // Late reverb (more diffuse)
            else {
                // Exponential decay
                const decay = Math.exp(-t * damping);
                // Increasing diffusion over time
                const diffuseness = Math.min(1, t * diffusion * 10);
                impulseL[i] = (Math.random() * 2 - 1) * decay * diffuseness * reflectionLevel;
                impulseR[i] = (Math.random() * 2 - 1) * decay * diffuseness * reflectionLevel;
            }
        }
        
        return impulse;
    }
    
    async loadMainAudio() {
        try {
            // First try to load OGG format
            const audioPath = '/api - Pip Pop Yes Yeesh Extended 2 - Sonauto.ogg';
            this.loadingMessage.textContent = "Loading spatial audio track...";
            
            const response = await fetch(audioPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const buffer = await response.arrayBuffer();
            const audioBuffer = await this.decodeAudioData(buffer);
            
            // Create and set up spatially positioned audio sources
            this.setupSpatialAudioSources(audioBuffer);
            
        } catch (error) {
            console.error("Error loading main audio:", error);
            this.loadingMessage.textContent = "Audio load error. Trying fallback...";
            
            try {
                // Try fallback MP3
                const fallbackResponse = await fetch('/audio-fallback.mp3');
                const fallbackBuffer = await fallbackResponse.arrayBuffer();
                const fallbackAudio = await this.decodeAudioData(fallbackBuffer);
                this.setupSpatialAudioSources(fallbackAudio);
            } catch (fallbackError) {
                console.error("Fallback audio also failed:", fallbackError);
                // Create silent audio as last resort fallback
                const silentBuffer = this.createSilentAudioBuffer(30); // 30 seconds
                this.setupSpatialAudioSources(silentBuffer);
                throw new Error("Failed to load audio");
            }
        }
    }
    
    // Wrapper for decodeAudioData with proper promise handling
    decodeAudioData(buffer) {
        return new Promise((resolve, reject) => {
            this.audioContext.decodeAudioData(
                buffer,
                (decodedData) => resolve(decodedData),
                (err) => reject(new Error(`Audio decoding error: ${err}`))
            );
        });
    }
    
    // Create a silent audio buffer as fallback
    createSilentAudioBuffer(durationSec) {
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(
            2, // stereo
            durationSec * sampleRate,
            sampleRate
        );
        return buffer;
    }
    
    setupSpatialAudioSources(audioBuffer) {
        // Create multiple audio emitters in the club for a more realistic sound field
        
        // Main DJ booth speakers (stereo pair)
        this.djLeftSpeaker = this.createSpatialSource(audioBuffer, new THREE.Vector3(-3, 3, -14));
        this.djRightSpeaker = this.createSpatialSource(audioBuffer, new THREE.Vector3(3, 3, -14));
        
        // Corner/wall speakers for surround effect
        this.surroundSpeakers = [
            this.createSpatialSource(audioBuffer, new THREE.Vector3(-8, 6, -5)),
            this.createSpatialSource(audioBuffer, new THREE.Vector3(8, 6, -5)),
            this.createSpatialSource(audioBuffer, new THREE.Vector3(-8, 6, -15)),
            this.createSpatialSource(audioBuffer, new THREE.Vector3(8, 6, -15))
        ];
        
        // Outside muffled audio (positioned behind the door for directional effect)
        this.outsideSource = this.createSpatialSource(audioBuffer, new THREE.Vector3(0, 2, -2));
        
        // Connect outside source through heavy filtering for the muffled effect
        this.outsideSource.source.disconnect();
        this.outsideLowpass = this.audioContext.createBiquadFilter();
        this.outsideLowpass.type = 'lowpass';
        this.outsideLowpass.frequency.value = 300;
        
        this.outsideHighCut = this.audioContext.createBiquadFilter();
        this.outsideHighCut.type = 'lowshelf';
        this.outsideHighCut.frequency.value = 400;
        this.outsideHighCut.gain.value = -20;
        
        // Add slight reverb for outdoor acoustics
        this.outsideReverb = this.reverbs.outside;
        
        // Outside gain control
        this.outsideGain = this.audioContext.createGain();
        this.outsideGain.gain.value = 0.5;
        
        // Connect the chain for outside audio
        this.outsideSource.source.connect(this.outsideLowpass);
        this.outsideLowpass.connect(this.outsideHighCut);
        this.outsideHighCut.connect(this.outsideReverb);
        this.outsideReverb.connect(this.outsideGain);
        this.outsideGain.connect(this.audioContext.destination);
        
        // Connect club speakers to analyser for visualization
        const clubAnalyserGain = this.audioContext.createGain();
        this.djLeftSpeaker.gainNode.connect(clubAnalyserGain);
        this.djRightSpeaker.gainNode.connect(clubAnalyserGain);
        clubAnalyserGain.connect(this.analyser);
        
        // Start all audio sources
        this.djLeftSpeaker.source.start(0);
        this.djRightSpeaker.source.start(0);
        this.outsideSource.source.start(0);
        this.surroundSpeakers.forEach(speaker => speaker.source.start(0));
        
        // Initially inside club audio is silent (we're outside)
        this.djLeftSpeaker.gainNode.gain.value = 0;
        this.djRightSpeaker.gainNode.gain.value = 0;
        this.surroundSpeakers.forEach(speaker => speaker.gainNode.gain.value = 0);
        
        // Save the emitters for distance-based volume calculation
        this.audioEmitters = [
            {position: new THREE.Vector3(-3, 3, -14), source: this.djLeftSpeaker},
            {position: new THREE.Vector3(3, 3, -14), source: this.djRightSpeaker},
            ...this.surroundSpeakers.map((speaker, i) => {
                const positions = [
                    new THREE.Vector3(-8, 6, -5),
                    new THREE.Vector3(8, 6, -5),
                    new THREE.Vector3(-8, 6, -15),
                    new THREE.Vector3(8, 6, -15)
                ];
                return {position: positions[i], source: speaker};
            })
        ];
    }
    
    createSpatialSource(buffer, position) {
        // Create audio source
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        
        // Create panner for spatial positioning
        const panner = this.audioContext.createPanner();
        panner.panningModel = 'HRTF'; // Use Head Related Transfer Function for binaural audio
        panner.distanceModel = 'inverse'; // Realistic distance attenuation
        panner.refDistance = 1;
        panner.maxDistance = 30;
        panner.rolloffFactor = 1.5;
        panner.coneInnerAngle = 360; // Non-directional by default
        panner.coneOuterAngle = 360;
        panner.coneOuterGain = 0;
        
        // Set initial position
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;
        
        // Create gain node for volume control
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 1.0;
        
        // Connect the audio nodes
        source.connect(panner);
        panner.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Return all nodes for later control
        return {
            source,
            panner,
            gainNode,
            position // Store original position
        };
    }
    
    async loadSpatialSoundEffects() {
        // Load sound effects with spatial positioning capabilities
        this.soundEffects = {};
        
        try {
            // Load all sound effect files
            const effectFiles = [
                {name: 'doorOpen', url: './door-open.wav', position: new THREE.Vector3(0, 2, 1)},
                {name: 'crowdChatter', url: './crowd-chatter.wav', position: new THREE.Vector3(-3, 1, 5)},
                {name: 'bassDrop', url: './bass-drop.wav', position: new THREE.Vector3(0, 2, -5)}
            ];
            
            // Load each effect
            await Promise.all(effectFiles.map(async (effect) => {
                const response = await fetch(effect.url);
                if (!response.ok) throw new Error(`Failed to load ${effect.url}`);
                
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.decodeAudioData(arrayBuffer);
                
                // Store both buffer and position for spatial playback
                this.soundEffects[effect.name] = {
                    buffer: audioBuffer,
                    position: effect.position
                };
            }));
            
        } catch (error) {
            console.warn("Error loading spatial sound effects:", error);
            // Create silent fallbacks
            this.soundEffects = {
                doorOpen: {
                    buffer: this.createSilentAudioBuffer(2),
                    position: new THREE.Vector3(0, 2, 1)
                },
                crowdChatter: {
                    buffer: this.createSilentAudioBuffer(5),
                    position: new THREE.Vector3(-3, 1, 5)
                },
                bassDrop: {
                    buffer: this.createSilentAudioBuffer(3),
                    position: new THREE.Vector3(0, 2, -5)
                }
            };
        }
    }
    
    playSpatialSoundEffect(name, loop = false, volume = 1.0) {
        if (!this.audioContext || !this.soundEffects[name]) {
            console.warn(`Sound effect "${name}" not available.`);
            return null;
        }

        try {
            const effect = this.soundEffects[name];
            const source = this.audioContext.createBufferSource();
            source.buffer = effect.buffer;
            source.loop = loop;

            // Create spatial panner
            const panner = this.audioContext.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 1;
            panner.maxDistance = 30;
            panner.rolloffFactor = 1.5;
            
            // Set position
            panner.positionX.value = effect.position.x;
            panner.positionY.value = effect.position.y;
            panner.positionZ.value = effect.position.z;

            // Create gain for volume control
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume;

            // Connect nodes
            source.connect(panner);
            panner.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // Start playback
            source.start(0);

            return { source, panner, gainNode };
            
        } catch (error) {
            console.error(`Error playing spatial sound effect "${name}":`, error);
            return null;
        }
    }
    
    async loadSoundEffect(name, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error fetching sound effect ${url}: status ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.decodeAudioData(arrayBuffer);
            this.soundEffects[name] = audioBuffer;
            return audioBuffer;
        } catch (error) {
            console.error(`Error loading sound effect ${url}:`, error);
            // Create a silent buffer as fallback
            this.soundEffects[name] = this.createSilentAudioBuffer(2);
            return null;
        }
    }

    playSoundEffect(name, loop = false, volume = 1.0) {
        if (!this.audioContext || !this.soundEffects[name]) {
            console.warn(`Sound effect "${name}" not available.`);
            return null;
        }

        try {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.soundEffects[name];
            source.loop = loop;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume;

            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start(0);

            return { source, gainNode };
        } catch (error) {
            console.error(`Error playing sound effect "${name}":`, error);
            return null;
        }
    }
    
    playOutdoorAmbience() {
        // Play ambient crowd sound outside the club
        if (this.audioInitialized) {
            // Check if we're using spatial audio
            if (this.playSpatialSoundEffect) {
                this.crowdSound = this.playSpatialSoundEffect('crowdChatter', true, 0.6);
            } else {
                this.crowdSound = this.playSoundEffect('crowdChatter', true, 0.4);
            }
        }
    }
    
    updateAudioListenerPosition() {
        if (!this.audioContext || !this.camera) return;
        
        // Get camera position and orientation
        const cameraPosition = this.camera.position;
        const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        
        // Update audio listener position (follows camera)
        if (this.audioListener) {
            // Web Audio API listener position
            this.audioListener.positionX.value = cameraPosition.x;
            this.audioListener.positionY.value = cameraPosition.y;
            this.audioListener.positionZ.value = cameraPosition.z;
            
            // Web Audio API listener orientation
            this.audioListener.forwardX.value = cameraDirection.x;
            this.audioListener.forwardY.value = cameraDirection.y;
            this.audioListener.forwardZ.value = cameraDirection.z;
            this.audioListener.upX.value = cameraUp.x;
            this.audioListener.upY.value = cameraUp.y;
            this.audioListener.upZ.value = cameraUp.z;
        }
    }
    
    updateAudioOcclusion() {
        if (!this.isInside || !this.audioInitialized || !this.audioEmitters) return;
        
        // Cast rays from each audio source to the listener to check for occlusion
        const listenerPosition = new THREE.Vector3(
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z
        );
        
        // Raycaster for checking occlusion
        const raycaster = new THREE.Raycaster();
        
        // Check each audio emitter
        this.audioEmitters.forEach(emitter => {
            // Direction from source to listener
            const direction = new THREE.Vector3().subVectors(listenerPosition, emitter.position).normalize();
            
            // Set up raycaster
            raycaster.set(emitter.position, direction);
            
            // Get distance
            const distance = emitter.position.distanceTo(listenerPosition);
            
            // Check for intersections with objects in the scene
            const intersects = raycaster.intersectObjects(this.reflectiveSurfaces, true);
            
            // Calculate occlusion factor based on objects between source and listener
            let occlusionFactor = 1.0; // 1.0 = no occlusion
            
            if (intersects.length > 0) {
                // Some object is between source and listener
                // Reduce volume more for each object in the path
                occlusionFactor = Math.max(0.3, 1.0 - (intersects.length * 0.2));
                
                // Apply low-pass filter for occlusion effect if we have a filter
                if (emitter.source.filter) {
                    // Reduce high frequencies when occluded
                    emitter.source.filter.frequency.value = 500 + (10000 * occlusionFactor);
                }
            } else if (emitter.source.filter) {
                // No occlusion, full frequency range
                emitter.source.filter.frequency.value = 20000;
            }
            
            // Distance-based attenuation (in addition to the Web Audio API's built-in models)
            const distanceFactor = 1.0 / (1.0 + distance * 0.1);
            
            // Apply combined factors to volume
            const targetVolume = distanceFactor * occlusionFactor * (this.isInside ? 1.0 : 0.0);
            
            // Smoothly adjust volume to target (to avoid clicks/pops)
            if (emitter.source.gainNode) {
                const currentVolume = emitter.source.gainNode.gain.value;
                const newVolume = currentVolume + (targetVolume - currentVolume) * 0.1;
                emitter.source.gainNode.gain.value = newVolume;
            }
        });
    }

    setupThreeJS() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x000000, 0.01);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 2, 10); // Outside position

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.5;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('scene-container').appendChild(this.renderer.domElement);

        // Add controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 20;
        this.controls.enabled = false; // Disable controls initially

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x222222);
        this.scene.add(ambientLight);

        // Outside lighting
        this.outsideLights = new THREE.Group();

        // Street lamp
        const streetLight = new THREE.PointLight(0xffaa00, 2, 20, 1.5);
        streetLight.position.set(5, 5, 8);
        streetLight.castShadow = true;
        this.outsideLights.add(streetLight);

        // Club sign light
        this.signLight = new THREE.SpotLight(0xff00cc, 3, 30, Math.PI / 6, 0.5, 1);
        this.signLight.position.set(0, 6, 5);
        this.signLight.target.position.set(0, 0, 0);
        this.signLight.castShadow = true;
        this.outsideLights.add(this.signLight);
        this.outsideLights.add(this.signLight.target);

        this.scene.add(this.outsideLights);

        // Inside club lights
        this.clubLights = new THREE.Group();

        // DJ booth spotlight
        this.djSpotlight = new THREE.SpotLight(0x00ffff, 5, 15, Math.PI / 4, 0.5, 1);
        this.djSpotlight.position.set(0, 10, -5);
        this.djSpotlight.target.position.set(0, 0, -10);
        this.djSpotlight.castShadow = true;
        this.clubLights.add(this.djSpotlight);
        this.clubLights.add(this.djSpotlight.target);

        // Create several dance floor lights
        this.danceFloorLights = [];
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0xffff00, 0x00ffff];

        for (let i = 0; i < 6; i++) {
            const light = new THREE.PointLight(colors[i], 3, 10);
            const angle = (i / 6) * Math.PI * 2;
            const radius = 8;
            light.position.set(
                Math.cos(angle) * radius,
                5,
                Math.sin(angle) * radius - 5
            );
            this.danceFloorLights.push(light);
            this.clubLights.add(light);
        }

        // Create moving spotlights
        this.movingLights = [];
        for (let i = 0; i < 4; i++) {
            const light = new THREE.SpotLight(colors[i], 5, 20, Math.PI / 6, 0.5, 1);
            light.position.set(
                (i % 2 === 0 ? -7 : 7),
                8,
                (i < 2 ? -2 : -8)
            );
            const targetObj = new THREE.Object3D();
            targetObj.position.set(0, 0, -5);
            light.target = targetObj;
            this.clubLights.add(light);
            this.clubLights.add(light.target);
            this.movingLights.push({ light, target: targetObj, phase: i * Math.PI / 2 });
        }

        // Initially hide club lights
        this.clubLights.visible = false;
        this.scene.add(this.clubLights);
    }

    setupPostProcessing() {
        // Create composer for post-processing effects
        this.composer = new EffectComposer(this.renderer);

        // Add render pass
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Add bloom pass for glow effect
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.composer.addPass(this.bloomPass);
    }

    createClubScene() {
        // Create ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Create club building exterior
        this.exteriorGroup = new THREE.Group();

        // Main building
        const buildingGeometry = new THREE.BoxGeometry(20, 10, 20);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.7,
            metalness: 0.3
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.y = 5;
        building.position.z = -10;
        building.castShadow = true;
        building.receiveShadow = true;
        this.exteriorGroup.add(building);

        // Club entrance
        const entranceGeometry = new THREE.BoxGeometry(5, 6, 2);
        const entranceMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.1
        });
        const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
        entrance.position.y = 3;
        entrance.position.z = 0;
        entrance.castShadow = true;
        entrance.receiveShadow = true;
        this.exteriorGroup.add(entrance);

        // Club door
        const doorGeometry = new THREE.PlaneGeometry(3, 5);
        const doorMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.8,
            metalness: 0.5,
            emissive: 0x330000,
            emissiveIntensity: 0.5
        });
        this.door = new THREE.Mesh(doorGeometry, doorMaterial);
        this.door.position.y = 2.5;
        this.door.position.z = 1.01;
        this.exteriorGroup.add(this.door);

        // Club sign
        const logoTexture = new THREE.TextureLoader().load('club-logo.png');
        const signGeometry = new THREE.PlaneGeometry(8, 2);
        const signMaterial = new THREE.MeshBasicMaterial({
            map: logoTexture,
            transparent: true,
            emissive: 0xff00cc,
            emissiveIntensity: 0.5
        });
        const sign = new THREE.Mesh(signGeometry, signMaterial);
        sign.position.y = 7;
        sign.position.z = 1;
        this.exteriorGroup.add(sign);

        // People in line
        this.createPeopleInLine();

        // Security guard
        this.createSecurityGuard();

        this.scene.add(this.exteriorGroup);

        // Create interior of the club
        this.interiorGroup = new THREE.Group();

        // Dance floor with texture
        const floorTexture = new THREE.TextureLoader().load('dancefloor-texture.png');
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(4, 4);

        const floorGeometry = new THREE.PlaneGeometry(16, 16, 32, 32);
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: floorTexture,
            roughness: 0.3,
            metalness: 0.7,
            emissive: 0xffffff,
            emissiveMap: floorTexture,
            emissiveIntensity: 0.2
        });
        this.danceFloor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.danceFloor.rotation.x = -Math.PI / 2;
        this.danceFloor.position.y = 0;
        this.danceFloor.position.z = -5;
        this.interiorGroup.add(this.danceFloor);

        // Create dance floor grid
        const gridSize = 8;
        const gridGeometry = new THREE.PlaneGeometry(2, 2);
        this.floorTiles = [];

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                if ((i + j) % 2 === 0) continue; // Checkerboard pattern

                const tileMaterial = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    roughness: 0.2,
                    metalness: 0.8,
                    emissive: 0xffffff,
                    emissiveIntensity: 0.5
                });

                const tile = new THREE.Mesh(gridGeometry, tileMaterial);
                tile.rotation.x = -Math.PI / 2;
                tile.position.x = (i - gridSize/2 + 0.5) * 2;
                tile.position.z = (j - gridSize/2 + 0.5) * 2 - 5;
                tile.position.y = 0.01; // Slightly above the main floor
                this.floorTiles.push({
                    mesh: tile,
                    originalColor: new THREE.Color(0xffffff),
                    baseIntensity: 0.5
                });
                this.interiorGroup.add(tile);
            }
        }

        // DJ booth
        const djBoothGeometry = new THREE.BoxGeometry(6, 2, 3);
        const djBoothMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.3,
            metalness: 0.7,
            emissive: 0x0088ff,
            emissiveIntensity: 0.3
        });
        const djBooth = new THREE.Mesh(djBoothGeometry, djBoothMaterial);
        djBooth.position.y = 1;
        djBooth.position.z = -14;
        this.interiorGroup.add(djBooth);

        // DJ equipment
        const equipmentGeometry = new THREE.BoxGeometry(5, 0.5, 2);
        const equipmentMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            roughness: 0.4,
            metalness: 0.8,
            emissive: 0xff0000,
            emissiveIntensity: 0.5
        });
        const equipment = new THREE.Mesh(equipmentGeometry, equipmentMaterial);
        equipment.position.y = 2.25;
        equipment.position.z = -14;
        this.interiorGroup.add(equipment);

        // Create DJ
        const djGeometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        const djMaterial = new THREE.MeshStandardMaterial({
            color: 0x996633,
            roughness: 0.8,
            metalness: 0.2
        });
        this.dj = new THREE.Mesh(djGeometry, djMaterial);
        this.dj.position.y = 3.25;
        this.dj.position.z = -14;
        this.interiorGroup.add(this.dj);

        // DJ head
        const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffcc99,
            roughness: 0.8,
            metalness: 0.2
        });
        const djHead = new THREE.Mesh(headGeometry, headMaterial);
        djHead.position.y = 4;
        djHead.position.z = -14;
        this.interiorGroup.add(djHead);

        // Wall with projected visuals
        const wallGeometry = new THREE.PlaneGeometry(20, 10);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.1
        });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.y = 5;
        wall.position.z = -20;
        this.interiorGroup.add(wall);

        // Create visual projection screen with the backdrop image
        const visualTexture = new THREE.TextureLoader().load('visual-backdrop.png');
        const screenGeometry = new THREE.PlaneGeometry(16, 8);
        const screenMaterial = new THREE.MeshBasicMaterial({
            map: visualTexture,
            transparent: true,
            opacity: 0.9
        });
        this.visualScreen = new THREE.Mesh(screenGeometry, screenMaterial);
        this.visualScreen.position.y = 6;
        this.visualScreen.position.z = -19.9;
        this.interiorGroup.add(this.visualScreen);

        // Create gobo patterns for light projections
        this.gobos = [];
        const goboPatterns = [
            new THREE.RingGeometry(1, 2, 32),
            new THREE.CircleGeometry(1.5, 32),
            new THREE.PlaneGeometry(3, 3)
        ];

        for (let i = 0; i < 10; i++) {
            const goboGeometry = goboPatterns[i % goboPatterns.length];
            const goboMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide
            });
            const gobo = new THREE.Mesh(goboGeometry, goboMaterial);
            gobo.position.y = 3 + Math.random() * 5;
            gobo.position.x = -6 + Math.random() * 12;
            gobo.position.z = -19.8;
            gobo.scale.set(0.5 + Math.random(), 0.5 + Math.random(), 1);
            gobo.rotation.z = Math.random() * Math.PI * 2;
            this.gobos.push({
                mesh: gobo,
                rotateSpeed: 0.2 + Math.random() * 0.5,
                pulseSpeed: 0.5 + Math.random() * 1.5
            });
            this.interiorGroup.add(gobo);
        }

        // Hide interior initially
        this.interiorGroup.visible = false;
        this.scene.add(this.interiorGroup);
        
        // After creating scene objects, collect reflective surfaces for audio raytracing
        this.collectReflectiveSurfaces();
    }
    
    collectReflectiveSurfaces() {
        // Collect all surfaces that should reflect sound
        this.reflectiveSurfaces = [];
        
        // Add walls, floors, ceilings, etc. to the reflective surfaces list
        this.scene.traverse(object => {
            if (object.isMesh) {
                // Add all substantial meshes as potential sound reflectors
                // In a more advanced implementation, you would tag meshes with 
                // specific acoustic properties
                this.reflectiveSurfaces.push(object);
            }
        });
    }

    createPeopleInLine() {
        // Create people waiting in line
        this.peopleInLine = new THREE.Group();

        const personGeometry = new THREE.CapsuleGeometry(0.3, 1.4, 4, 8);
        const skinColors = [
            0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642,
            0x8d5524, 0x5d4037, 0xd2b48c, 0xffe0bd
        ];

        const clothingColors = [
            0x000000, 0x333333, 0x666666, 0x0000ff,
            0xff0000, 0xff00ff, 0x00ffff, 0x00ff00
        ];

        for (let i = 0; i < 6; i++) {
            // Body
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: clothingColors[Math.floor(Math.random() * clothingColors.length)],
                roughness: 0.8,
                metalness: 0.2
            });
            const person = new THREE.Mesh(personGeometry, bodyMaterial);
            person.position.y = 1.7;
            person.position.x = -5 + i * 0.7;
            person.position.z = 3 + Math.random() * 0.5;

            // Head
            const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
            const headMaterial = new THREE.MeshStandardMaterial({
                color: skinColors[Math.floor(Math.random() * skinColors.length)],
                roughness: 0.8,
                metalness: 0.1
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 2.7;
            head.position.x = person.position.x;
            head.position.z = person.position.z;

            this.peopleInLine.add(person);
            this.peopleInLine.add(head);
        }

        this.exteriorGroup.add(this.peopleInLine);
    }

    createSecurityGuard() {
        // Create security guard at the door
        const guardGeometry = new THREE.CapsuleGeometry(0.4, 1.6, 4, 8);
        const guardMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.8,
            metalness: 0.2
        });
        this.securityGuard = new THREE.Mesh(guardGeometry, guardMaterial);
        this.securityGuard.position.y = 1.8;
        this.securityGuard.position.x = 2;
        this.securityGuard.position.z = 1.5;

        // Guard head
        const headGeometry = new THREE.SphereGeometry(0.35, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x8d5524,
            roughness: 0.8,
            metalness: 0.1
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 3;
        head.position.x = this.securityGuard.position.x;
        head.position.z = this.securityGuard.position.z;

        this.exteriorGroup.add(this.securityGuard);
        this.exteriorGroup.add(head);
    }

    setupEventListeners() {
        // Enter club button
        document.getElementById('enter-club').addEventListener('click', () => {
            this.enterClub();
        });

        // Exit club button
        document.getElementById('exit-club').addEventListener('click', () => {
            this.exitClub();
        });

        // Toggle dance button
        document.getElementById('toggle-dance').addEventListener('click', () => {
            document.body.classList.toggle('dancing');
            // Play bass drop when starting to dance
            if (document.body.classList.contains('dancing')) {
                if (this.playSpatialSoundEffect) {
                    this.playSpatialSoundEffect('bassDrop');
                } else {
                    this.playSoundEffect('bassDrop');
                }
            }
        });

        // Hide instructions
        document.getElementById('hide-instructions').addEventListener('click', () => {
            document.getElementById('instructions').classList.add('hidden');
            // Store in local storage so it doesn't show again
            localStorage.setItem('instructionsShown', 'true');
        });

        // Check if instructions should be shown
        if (localStorage.getItem('instructionsShown')) {
            document.getElementById('instructions').classList.add('hidden');
        }

        // Handle touch events for mobile
        this.setupTouchControls();
    }

    setupTouchControls() {
        // For mobile devices, add touch control support
        if ('ontouchstart' in window) {
            let touchStartX = 0;
            let touchStartY = 0;

            this.renderer.domElement.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    touchStartX = e.touches[0].pageX;
                    touchStartY = e.touches[0].pageY;
                }
            });

            this.renderer.domElement.addEventListener('touchmove', (e) => {
                if (!this.isInside || !this.controls.enabled) return;

                if (e.touches.length === 1) {
                    const touchEndX = e.touches[0].pageX;
                    const touchEndY = e.touches[0].pageY;

                    const moveX = touchEndX - touchStartX;
                    const moveY = touchEndY - touchStartY;

                    this.controls.rotateLeft(moveX * 0.01);
                    this.controls.rotateUp(moveY * 0.01);

                    touchStartX = touchEndX;
                    touchStartY = touchEndY;
                }

                e.preventDefault();
            });
        }
    }

    enterClub() {
        // Ensure audio context is running (for browsers that require user interaction)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => console.error("Error resuming audio context:", err));
        }

        // Switch scenes
        document.getElementById('outside-club').classList.remove('active');
        document.getElementById('inside-club').classList.add('active');

        // Show interior, hide exterior
        this.exteriorGroup.visible = false;
        this.interiorGroup.visible = true;
        this.outsideLights.visible = false;
        this.clubLights.visible = true;

        // Move camera inside
        this.isInside = true;

        // Enable orbit controls for interior
        this.controls.enabled = true;
        this.controls.target.set(0, 2, -5);

        // Reset camera position for inside view
        this.camera.position.set(0, 3, 5);
        this.updateAudioListenerPosition();

        // Play door open sound (spatial if available)
        if (this.playSpatialSoundEffect) {
            this.playSpatialSoundEffect('doorOpen');
        } else {
            this.playSoundEffect('doorOpen');
        }

        // Apply entrance acoustic transition
        this.transitionRoomAcoustics('outside', 'clubInterior', 1.5);

        // For spatial audio
        if (this.djLeftSpeaker && this.djRightSpeaker) {
            // Fade in the club speakers
            this.fadeAudioNode(this.djLeftSpeaker.gainNode.gain, 1.0, 1.0);
            this.fadeAudioNode(this.djRightSpeaker.gainNode.gain, 1.0, 1.0);
            
            // Fade in surround speakers
            this.surroundSpeakers.forEach(speaker => {
                this.fadeAudioNode(speaker.gainNode.gain, 0.6, 1.5);
            });
            
            // Fade out the outside source
            this.fadeAudioNode(this.outsideGain.gain, 0, 1.0);
        } 
        // For fallback audio
        else if (this.insideGain && this.outsideGain) {
            this.fadeAudio(this.outsideGain, 0, 1);
            this.fadeAudio(this.insideGain, 1, 1);
        }

        // Stop crowd chatter
        if (this.crowdSound && this.crowdSound.gainNode) {
            // Add a fade out before stopping for smoother transition
            if (this.crowdSound.gainNode) {
                this.fadeAudioNode(this.crowdSound.gainNode.gain, 0, 0.5);
            } else if (this.crowdSound.source) {
                this.fadeAudio(this.crowdSound.gainNode, 0, 0.5);
            }
            
            setTimeout(() => {
                if (this.crowdSound && this.crowdSound.source) {
                    try {
                        this.crowdSound.source.stop();
                    } catch (e) {
                        console.warn("Error stopping crowd sound:", e);
                    }
                    this.crowdSound = null; // Clear reference
                }
            }, 500);
        }

        // After door open sound, play bass drop
        setTimeout(() => {
            if (this.playSpatialSoundEffect) {
                this.playSpatialSoundEffect('bassDrop');
            } else {
                this.playSoundEffect('bassDrop');
            }
        }, 1000);

        // Show instructions if first time
        if (!localStorage.getItem('instructionsShown')) {
            document.getElementById('instructions').classList.remove('hidden');
        }
    }

    exitClub() {
        // Ensure audio context is running
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => console.error("Error resuming audio context:", err));
        }

        // Switch scenes
        document.getElementById('inside-club').classList.remove('active');
        document.getElementById('outside-club').classList.add('active');

        // Show exterior, hide interior
        this.exteriorGroup.visible = true;
        this.interiorGroup.visible = false;
        this.outsideLights.visible = true;
        this.clubLights.visible = false;

        // Move camera outside
        this.isInside = false;

        // Disable orbit controls for exterior
        this.controls.enabled = false;

        // Reset camera position for outside view
        this.camera.position.set(0, 2, 10);
        this.updateAudioListenerPosition();

        // Play door sound (spatial if available)
        if (this.playSpatialSoundEffect) {
            this.playSpatialSoundEffect('doorOpen');
        } else {
            this.playSoundEffect('doorOpen');
        }

        // Apply exit acoustic transition
        this.transitionRoomAcoustics('clubInterior', 'outside', 1.5);

        // Restart crowd chatter if audio is initialized
        if (this.audioInitialized) {
            if (this.playSpatialSoundEffect) {
                this.crowdSound = this.playSpatialSoundEffect('crowdChatter', true, 0.6);
            } else {
                this.crowdSound = this.playSoundEffect('crowdChatter', true, 0.4);
            }
        }

        // For spatial audio
        if (this.djLeftSpeaker && this.djRightSpeaker) {
            // Fade out the club speakers
            this.fadeAudioNode(this.djLeftSpeaker.gainNode.gain, 0, 1.0);
            this.fadeAudioNode(this.djRightSpeaker.gainNode.gain, 0, 1.0);
            
            // Fade out surround speakers
            this.surroundSpeakers.forEach(speaker => {
                this.fadeAudioNode(speaker.gainNode.gain, 0, 1.0);
            });
            
            // Fade in the outside source
            this.fadeAudioNode(this.outsideGain.gain, 0.5, 1.5);
        } 
        // For fallback audio
        else if (this.insideGain && this.outsideGain) {
            this.fadeAudio(this.insideGain, 0, 1);
            this.fadeAudio(this.outsideGain, 0.3, 1);
        }

        // Remove dancing class if active
        document.body.classList.remove('dancing');
    }
    
    transitionRoomAcoustics(fromRoom, toRoom, duration) {
        if (!this.reverbs || !this.reverbs[fromRoom] || !this.reverbs[toRoom]) return;
        
        // Create temporary crossfade nodes if needed
        if (!this.reverbMixA) {
            this.reverbMixA = this.audioContext.createGain();
            this.reverbMixA.gain.value = 1.0;
        }
        
        if (!this.reverbMixB) {
            this.reverbMixB = this.audioContext.createGain();
            this.reverbMixB.gain.value = 0.0;
        }
        
        // Connect current and target reverb nodes
        this.reverbs[fromRoom].connect(this.reverbMixA);
        this.reverbs[toRoom].connect(this.reverbMixB);
        
        // Connect both to the output
        this.reverbMixA.connect(this.audioContext.destination);
        this.reverbMixB.connect(this.audioContext.destination);
        
        // Fade between them
        const currentTime = this.audioContext.currentTime;
        this.reverbMixA.gain.linearRampToValueAtTime(0, currentTime + duration);
        this.reverbMixB.gain.linearRampToValueAtTime(1, currentTime + duration);
        
        // Cleanup after transition
        setTimeout(() => {
            this.reverbs[fromRoom].disconnect(this.reverbMixA);
            this.reverbMixA.disconnect();
        }, duration * 1000);
    }

    fadeAudioNode(audioParam, targetValue, duration) {
        if (!audioParam || !this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        try {
            audioParam.cancelScheduledValues(currentTime);
            audioParam.setValueAtTime(audioParam.value, currentTime);
            audioParam.linearRampToValueAtTime(targetValue, currentTime + duration);
        } catch (e) {
            console.warn("Error fading audio parameter:", e);
            audioParam.value = targetValue; // Fallback
        }
    }

    fadeAudio(gainNode, targetValue, duration) {
        if (!gainNode || !this.audioContext) return;
        
        const currentTime = this.audioContext.currentTime;
        try {
            gainNode.gain.cancelScheduledValues(currentTime);
            gainNode.gain.setValueAtTime(gainNode.gain.value, currentTime);
            gainNode.gain.linearRampToValueAtTime(targetValue, currentTime + duration);
        } catch (e) {
            console.warn("Error fading audio:", e);
            // Fallback to direct value setting
            gainNode.gain.value = targetValue;
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        const delta = this.clock.getDelta();
        
        // Update controls
        if (this.controls.enabled) {
            this.controls.update();
        }
        
        // Update audio listener position (follows camera)
        this.updateAudioListenerPosition();
        
        // Update audio occlusion
        this.updateAudioOcclusion();
        
        // Skip updates if audio isn't playing
        if (!this.isPlaying) {
            this.composer.render();
            return;
        }
        
        // Get audio analysis
        const { bassScale, lowMidScale, highMidScale, trebleScale } = this.updateAudioAnalysis();
        
        // Update scene based on audio
        if (this.isInside) {
            this.updateClubLights(bassScale, lowMidScale, highMidScale, trebleScale, delta);
            this.updateDanceFloor(bassScale, lowMidScale, highMidScale, delta);
            this.updateVisuals(bassScale, lowMidScale, highMidScale, trebleScale, delta);
            this.updateDJ(bassScale, delta);
        } else {
            this.updateExteriorLights(delta);
        }
        
        // Render scene
        this.composer.render();
    }

    updateAudioAnalysis() {
        // Skip if audio not initialized
        if (!this.audioInitialized) {
            return {
                bassScale: 0.3 + Math.sin(this.clock.elapsedTime * 2) * 0.3,
                lowMidScale: 0.3 + Math.sin(this.clock.elapsedTime * 3) * 0.3,
                highMidScale: 0.3 + Math.sin(this.clock.elapsedTime * 5) * 0.3,
                trebleScale: 0.3 + Math.sin(this.clock.elapsedTime * 7) * 0.3
            };
        }
        
        // Get frequency data
        try {
            this.analyser.getByteFrequencyData(this.dataArray);
            
            // Calculate average values for different frequency ranges
            const bass = this.getAverageRange(0, 3);
            const lowMid = this.getAverageRange(4, 10);
            const highMid = this.getAverageRange(11, 20);
            const treble = this.getAverageRange(21, 30);
            
            // Scale values
            const bassScale = bass / 255;
            const lowMidScale = lowMid / 255;
            const highMidScale = highMid / 255;
            const trebleScale = treble / 255;
            
            return { bassScale, lowMidScale, highMidScale, trebleScale };
        } catch (e) {
            console.warn("Error in audio analysis:", e);
            // Fallback to simulated values
            return {
                bassScale: 0.3 + Math.sin(this.clock.elapsedTime * 2) * 0.3,
                lowMidScale: 0.3 + Math.sin(this.clock.elapsedTime * 3) * 0.3,
                highMidScale: 0.3 + Math.sin(this.clock.elapsedTime * 5) * 0.3,
                trebleScale: 0.3 + Math.sin(this.clock.elapsedTime * 7) * 0.3
            };
        }
    }

    getAverageRange(start, end) {
        let sum = 0;
        for (let i = start; i <= end; i++) {
            sum += this.dataArray[i];
        }
        return sum / (end - start + 1);
    }

    updateClubLights(bassScale, lowMidScale, highMidScale, trebleScale, delta) {
        // Update dance floor lights
        this.danceFloorLights.forEach((light, i) => {
            // Pulse intensity based on different frequency ranges
            const frequencyScale = i % 3 === 0 ? bassScale : (i % 3 === 1 ? lowMidScale : highMidScale);
            light.intensity = 1 + frequencyScale * 5;
            
            // Change color
            const hue = (this.clock.elapsedTime * 0.1 + i * 0.2) % 1;
            light.color.setHSL(hue, 1, 0.5);
        });
        
        // Update moving spotlights
        this.movingLights.forEach((obj, i) => {
            // Move targets in circular patterns
            const { light, target, phase } = obj;
            const speed = 0.5 + trebleScale * 2;
            const time = this.clock.elapsedTime * speed + phase;
            
            // Update target position for moving patterns
            target.position.x = Math.sin(time) * 8;
            target.position.z = Math.cos(time) * 8 - 5;
            
            // Pulse intensity with bass
            light.intensity = 2 + bassScale * 8;
            
            // Change colors
            const hue = (this.clock.elapsedTime * 0.2 + i * 0.25) % 1;
            light.color.setHSL(hue, 1, 0.5);
        });
        
        // Update DJ spotlight
        this.djSpotlight.intensity = 3 + bassScale * 7;
        this.djSpotlight.angle = Math.PI / 6 + lowMidScale * Math.PI / 12;
    }

    updateDanceFloor(bassScale, lowMidScale, highMidScale, delta) {
        // Update floor tiles
        this.floorTiles.forEach((tile, i) => {
            const mesh = tile.mesh;
            const material = mesh.material;
            
            // Use different frequency ranges for different tiles
            let intensityScale;
            if (i % 3 === 0) {
                intensityScale = bassScale * 2.5;
            } else if (i % 3 === 1) {
                intensityScale = lowMidScale * 2;
            } else {
                intensityScale = highMidScale * 1.5;
            }
            
            // Update emissive color
            const hue = (this.clock.elapsedTime * 0.1 + i * 0.02) % 1;
            const color = new THREE.Color().setHSL(hue, 1, 0.5);
            material.emissive.copy(color);
            material.emissiveIntensity = tile.baseIntensity + intensityScale;
            
            // Add subtle height animation for bass hits
            if (i % 4 === 0) {
                mesh.position.y = 0.01 + bassScale * 0.2;
            }
        });
    }

    updateVisuals(bassScale, lowMidScale, highMidScale, trebleScale, delta) {
        // Update gobo patterns
        this.gobos.forEach((gobo, i) => {
            const mesh = gobo.mesh;
            const material = mesh.material;
            
            // Rotate gobos
            mesh.rotation.z += delta * gobo.rotateSpeed * (1 + lowMidScale);
            
            // Pulse size with bass
            const pulseScale = 1 + bassScale * 0.5;
            mesh.scale.set(pulseScale, pulseScale, 1);
            
            // Pulse opacity with high frequencies
            material.opacity = 0.3 + trebleScale * 0.7;
            
            // Change color
            const hue = (this.clock.elapsedTime * 0.1 + i * 0.1) % 1;
            material.color.setHSL(hue, 1, 0.5 + highMidScale * 0.5);
        });
        
        // Update DJ movements
        this.updateDJ(bassScale, delta);
    }

    updateDJ(bassScale, delta) {
        // Make DJ bob to the beat
        this.dj.position.y = 3.25 + Math.sin(this.clock.elapsedTime * 4) * 0.1 * (1 + bassScale);
        
        // DJ arm movements
        // We'd add arm meshes and animate them here in a more complex implementation
    }

    updateExteriorLights(delta) {
        // Pulse the club sign
        const signIntensity = 0.5 + Math.sin(this.clock.elapsedTime * 2) * 0.3;
        this.signLight.intensity = 2 + signIntensity * 2;
        
        // Subtle color shifting for the sign
        const hue = (this.clock.elapsedTime * 0.05) % 1;
        this.signLight.color.setHSL(hue, 1, 0.5);
    }
}

// Create the app when the page is loaded
window.addEventListener('load', () => {
    const app = new MusicExperience();
});