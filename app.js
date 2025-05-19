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
        
        // Setup event for starting the experience
        this.setupStartButton();
    }

    setupStartButton() {
        // Add start button to loading screen
        const startButton = document.createElement('button');
        startButton.id = 'start-experience';
        startButton.innerHTML = '<i class="fas fa-play"></i> Start Experience';
        startButton.style.padding = '15px 30px';
        startButton.style.fontSize = '18px';
        startButton.style.background = 'linear-gradient(45deg, #ff00cc, #3333ff)';
        startButton.style.border = 'none';
        startButton.style.color = 'white';
        startButton.style.borderRadius = '30px';
        startButton.style.cursor = 'pointer';
        startButton.style.textTransform = 'uppercase';
        startButton.style.fontWeight = 'bold';
        startButton.style.boxShadow = '0 0 20px rgba(255, 0, 204, 0.7)';
        startButton.style.transition = 'all 0.3s ease';
        startButton.style.marginTop = '20px';
        startButton.style.display = 'none'; // Initially hidden
        
        startButton.onmouseover = () => {
            startButton.style.transform = 'scale(1.05)';
            startButton.style.boxShadow = '0 0 30px rgba(255, 0, 204, 0.9)';
        };
        
        startButton.onmouseout = () => {
            startButton.style.transform = 'scale(1)';
            startButton.style.boxShadow = '0 0 20px rgba(255, 0, 204, 0.7)';
        };
        
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
            await this.setupAudio();
            this.setupThreeJS();
            this.setupLights();
            this.setupPostProcessing();
            this.createClubScene();
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

    async setupAudio() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.listener = this.audioContext.listener;
            
            // Resume audio context if suspended (browsers require user interaction)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Set up audio analyzer
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Try to load main music file
            await this.loadMainAudio();
            
            // Load sound effects
            this.soundEffects = {};
            await Promise.all([
                this.loadSoundEffect('doorOpen', './door-open.wav'),
                this.loadSoundEffect('crowdChatter', './crowd-chatter.wav'),
                this.loadSoundEffect('bassDrop', './bass-drop.wav')
            ]);

            // Play crowd chatter
            this.crowdSound = this.playSoundEffect('crowdChatter', true, 0.4);

            // Initial state - outside the club
            this.isPlaying = true;
            this.isInside = false;
            this.audioInitialized = true;
            
        } catch (error) {
            console.error("Audio setup error:", error);
            throw new Error("Unable to setup audio: " + error.message);
        }
    }
    
    async loadMainAudio() {
        try {
            // First try to load OGG format
            const audioPath = '/api - Pip Pop Yes Yeesh Extended 2 - Sonauto.ogg';
            this.loadingMessage.textContent = "Loading audio track...";
            
            const response = await fetch(audioPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const buffer = await response.arrayBuffer();
            const audioFile = await this.decodeAudioData(buffer);
            
            // Create and set up audio sources
            this.setupAudioSources(audioFile);
            
        } catch (error) {
            console.error("Error loading main audio:", error);
            this.loadingMessage.textContent = "Audio load error. Trying alternative format...";
            
            // Create silent audio as fallback so the rest of the experience works
            const silentBuffer = this.createSilentAudioBuffer(30); // 30 seconds
            this.setupAudioSources(silentBuffer);
            
            // Still throw error for higher level handling
            throw new Error("Failed to load audio: " + error.message);
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
    
    setupAudioSources(audioBuffer) {
        // Create audio source for inside club (loud)
        this.insideSource = this.audioContext.createBufferSource();
        this.insideSource.buffer = audioBuffer;
        this.insideSource.loop = true;

        // Volume control for inside
        this.insideGain = this.audioContext.createGain();
        this.insideGain.gain.value = 0;

        // Connect inside audio chain
        this.insideSource.connect(this.insideGain);
        this.insideGain.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        // Create audio source for outside club (muffled)
        this.outsideSource = this.audioContext.createBufferSource();
        this.outsideSource.buffer = audioBuffer;
        this.outsideSource.loop = true;

        // Effects for outside sound (muffled)
        this.outsideLowpass = this.audioContext.createBiquadFilter();
        this.outsideLowpass.type = 'lowpass';
        this.outsideLowpass.frequency.value = 300;

        // Volume control for outside
        this.outsideGain = this.audioContext.createGain();
        this.outsideGain.gain.value = 0.3;

        // Connect outside audio chain
        this.outsideSource.connect(this.outsideLowpass);
        this.outsideLowpass.connect(this.outsideGain);
        this.outsideGain.connect(this.audioContext.destination);

        // Start audio sources
        this.insideSource.start(0);
        this.outsideSource.start(0);
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
                this.playSoundEffect('bassDrop');
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

        // Play door open sound
        this.playSoundEffect('doorOpen');

        // Fade audio
        if (this.audioInitialized) {
            this.fadeAudio(this.outsideGain, 0, 1);
            this.fadeAudio(this.insideGain, 1, 1);
        }

        // Stop crowd chatter
        if (this.crowdSound && this.crowdSound.source) {
            // Add a fade out before stopping for smoother transition
            this.fadeAudio(this.crowdSound.gainNode, 0, 0.5);
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
            this.playSoundEffect('bassDrop');
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

        // Play door sound
        this.playSoundEffect('doorOpen');

        // Restart crowd chatter if audio is initialized
        if (this.audioInitialized) {
            this.crowdSound = this.playSoundEffect('crowdChatter', true, 0.4);
        }

        // Fade audio
        if (this.audioInitialized) {
            this.fadeAudio(this.insideGain, 0, 1);
            this.fadeAudio(this.outsideGain, 0.3, 1);
        }

        // Remove dancing class if active
        document.body.classList.remove('dancing');
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