import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// --- ECONOMY & STORAGE ---
let savedData = JSON.parse(localStorage.getItem('deadShotsData')) || {
    coins: 0, money: 0, diamonds: 0,
    skins: { gold_ar: false, neon_gloo: false, ruby_sniper: false }
};
function saveData() { localStorage.setItem('deadShotsData', JSON.stringify(savedData)); updateEconomyUI(); }

// --- GAME STATE ---
let GAME_STATE = 'MENU'; let currentMode = ''; let blueScore = 0, redScore = 0, matchTimer = 180; let timerInterval;
const objects = []; const enemies = []; const lootDrops = []; const activeGrenades = [];

// --- TEXTURES ---
const texLoader = new THREE.TextureLoader();
const grassTex = texLoader.load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/textures/terrain/grasslight-big.jpg');
grassTex.wrapS = THREE.RepeatWrapping; grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(20, 20);
const brickTex = texLoader.load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/textures/brick_diffuse.jpg');
brickTex.wrapS = THREE.RepeatWrapping; brickTex.wrapT = THREE.RepeatWrapping; brickTex.repeat.set(2, 2);
const woodTex = texLoader.load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/textures/hardwood2_diffuse.jpg');
const floorTex = texLoader.load('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg');
floorTex.wrapS = THREE.RepeatWrapping; floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(10, 10);

// --- MULTIPLAYER & ADAM MODEL ---
const playerId = Math.random().toString(36).substr(2, 9);
const networkPlayers = {}; 

let adamModel = null;
const loader = new GLTFLoader();
loader.load('Soldier.glb', function (gltf) {
    adamModel = gltf.scene; adamModel.scale.set(1.5, 1.5, 1.5);
    adamModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
        }
    });
});

async function networkLoop() {
    if (GAME_STATE !== 'PLAYING') return;
    try {
        const pos = controls.getObject().position;
        const res = await fetch('https://deadshots-4.onrender.com/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id: playerId, x: pos.x, y: pos.y, z: pos.z }) });
        const data = await res.json();
        for (const id in data) {
            if (id === playerId) continue;
            if (!networkPlayers[id]) { 
                const mesh = adamModel ? SkeletonUtils.clone(adamModel) : new THREE.Mesh(new THREE.BoxGeometry(1,2,1), new THREE.MeshBasicMaterial({color:0x555555, transparent:true, opacity:0.5})); 
                mesh.userData = { isNetworkPlayer: true, id: id };
                scene.add(mesh); networkPlayers[id] = mesh; 
                objects.push(mesh);
            }
            networkPlayers[id].position.set(data[id].x, data[id].y - 1.6, data[id].z);
        }
        for (const id in networkPlayers) { if (!data[id] || id === playerId) { scene.remove(networkPlayers[id]); delete networkPlayers[id]; } }
    } catch(e) {}
}
setInterval(networkLoop, 100);

// --- AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOsc;
function playBGM() {
    if(bgmOsc) return; if (audioCtx.state === 'suspended') audioCtx.resume();
    bgmOsc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); bgmOsc.type = 'triangle'; bgmOsc.frequency.setValueAtTime(100, audioCtx.currentTime); gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    bgmOsc.connect(gain); gain.connect(audioCtx.destination); bgmOsc.start();
}
function stopBGM() { if(bgmOsc) { bgmOsc.stop(); bgmOsc = null; } }

function playGunshot(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const noiseOsc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    noiseOsc.type = 'sawtooth'; noiseOsc.frequency.setValueAtTime(type === 'SNIPER' ? 400 : 800, audioCtx.currentTime); noiseOsc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(type === 'SNIPER' ? 1.5 : 1.0, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.connect(gain); noiseOsc.connect(gain); gain.connect(audioCtx.destination); osc.start(); noiseOsc.start(); osc.stop(audioCtx.currentTime + 0.2); noiseOsc.stop(audioCtx.currentTime + 0.2);
}

function playEndSound(won) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.type = 'square';
    if(won) {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime); osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.2); osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5); osc.start(); osc.stop(audioCtx.currentTime + 1.5);
    } else {
        osc.frequency.setValueAtTime(300, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 1.0); gain.gain.setValueAtTime(0.3, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0); osc.start(); osc.stop(audioCtx.currentTime + 1.0);
    }
    osc.connect(gain); gain.connect(audioCtx.destination);
}
function playVoice(text) { window.speechSynthesis.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.rate = 1.1; utter.pitch = 0.9; window.speechSynthesis.speak(utter); }

// System
let camera, scene, renderer, controls, raycaster;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
let prevTime = performance.now(); const velocity = new THREE.Vector3(); const direction = new THREE.Vector3();

// Weapons
const weapons = [
    { name: 'AR', maxAmmo: 30, damage: 25, fireRate: 100, recoil: 0.05, baseColor: 0x222222, label: '5.56mm' },
    { name: 'SHOTGUN', maxAmmo: 8, damage: 100, fireRate: 800, recoil: 0.15, baseColor: 0x551111, label: '12 Gauge' },
    { name: 'SNIPER', maxAmmo: 5, damage: 150, fireRate: 1500, recoil: 0.25, baseColor: 0x113311, label: '.50 BMG' },
    { name: 'SMG', maxAmmo: 50, damage: 15, fireRate: 60, recoil: 0.03, baseColor: 0x334455, label: '9mm' }
];
let currentWeaponIdx = 0, ammo = weapons[0].maxAmmo, lastFireTime = 0, glooWalls = 3, inhalers = 3, grenades = 2;
let gunGroup, barrel, muzzleFlash; let dirLight, ambientLight, timeOfDay = 0;

// UI
const lobbyUI = document.getElementById('lobby'); const shopModal = document.getElementById('shop-modal'); const blocker = document.getElementById('blocker');
const hud = document.getElementById('hud'); const endScreen = document.getElementById('end-screen'); const endTitle = document.getElementById('end-title');
const endRewards = document.getElementById('end-rewards'); const damageOverlay = document.getElementById('damage-overlay');
let playerHealth = 100; const botNames = ['NoobSlayer99', 'ShadowNinja', 'Ghost', 'TTV_TryHard', 'SniperGod'];

const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

// Mobile setup
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let joyX = 0, joyY = 0, lastTouchX = 0, lastTouchY = 0;
const mobileControls = document.getElementById('mobile-controls'); const joystickBase = document.getElementById('joystick-base'); const joystickStick = document.getElementById('joystick-stick');

init(); animate();

function init() {
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.y = 1.6;
    ambientLight = new THREE.AmbientLight(0xffffff, 0.5); scene.add(ambientLight);
    dirLight = new THREE.DirectionalLight(0xffffff, 1.5); dirLight.position.set(-50, 50, -50); dirLight.castShadow = !isMobile; scene.add(dirLight);

    controls = new PointerLockControls(camera, document.body);
    document.getElementById('instructions').addEventListener('click', () => { if(GAME_STATE === 'PLAYING') controls.lock(); });
    controls.addEventListener('lock', () => { if(GAME_STATE === 'PLAYING') { blocker.style.display = 'none'; hud.style.display = 'block'; } });
    controls.addEventListener('unlock', () => { if(GAME_STATE === 'PLAYING') { blocker.style.display = 'flex'; hud.style.display = 'none'; } });
    scene.add(controls.getObject());

    document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp); document.addEventListener('mousedown', onMouseDown); window.addEventListener('resize', onWindowResize);

    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
    renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.2) : window.devicePixelRatio); 
    renderer.setSize(window.innerWidth, window.innerHeight); 
    renderer.shadowMap.enabled = !isMobile;
    document.getElementById('game-container').appendChild(renderer.domElement); raycaster = new THREE.Raycaster();

    setupUI(); updateEconomyUI();
}

function updateEconomyUI() {
    document.getElementById('ui-coins').innerText = savedData.coins; document.getElementById('ui-money').innerText = savedData.money; document.getElementById('ui-diamonds').innerText = savedData.diamonds;
    document.querySelectorAll('.buy-btn').forEach(btn => { const item = btn.getAttribute('data-item'); if(savedData.skins[item]) { btn.innerText = "OWNED"; btn.disabled = true; } });
}

function setupUI() {
    document.getElementById('btn-lone-wolf').onclick = () => startGame('LONE_WOLF');
    document.getElementById('btn-cs-ranked').onclick = () => startGame('CS_RANKED');
    document.getElementById('btn-br-ranked').onclick = () => startGame('BR_RANKED');
    document.getElementById('btn-multiplayer').onclick = () => startGame('MULTIPLAYER');
    document.getElementById('btn-open-shop').onclick = () => shopModal.style.display = 'flex';
    document.getElementById('btn-close-shop').onclick = () => shopModal.style.display = 'none';
    
    document.getElementById('btn-home').onclick = () => { GAME_STATE = 'MENU'; endScreen.style.display = 'none'; lobbyUI.style.display = 'flex'; hud.style.display = 'none'; minimapCanvas.style.display = 'none'; stopBGM(); };

    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.onclick = (e) => {
            const item = e.target.getAttribute('data-item'); const curr = e.target.getAttribute('data-curr'); const cost = parseInt(e.target.getAttribute('data-cost'));
            if(savedData[curr] >= cost && !savedData.skins[item]) { savedData[curr] -= cost; savedData.skins[item] = true; saveData(); } else { playVoice("Not enough currency."); }
        };
    });

    if (isMobile) {
        const ins = document.getElementById('instructions'); if(ins) ins.innerHTML = '<p style="font-size:36px">DEAD SHOTS</p><p>Tap to Play</p>';
        if(ins) ins.addEventListener('click', async () => { 
            if(GAME_STATE === 'PLAYING') { 
                try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); } catch(e){}
                try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch(e){}
                blocker.style.display = 'none'; hud.style.display = 'block'; 
            } 
        });

        const joyZone = document.getElementById('joystick-zone'); let joyTouchId = null;
        joyZone.addEventListener('touchstart', (e) => {
            e.preventDefault(); if (joyTouchId !== null) return;
            const t = e.changedTouches[0]; joyTouchId = t.identifier;
            joystickBase.style.display = 'block'; joystickBase.style.left = (t.clientX - 60) + 'px'; joystickBase.style.top = (t.clientY - 60) + 'px';
            joyX = 0; joyY = 0;
        }, {passive: false});
        joyZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if(t.identifier === joyTouchId) {
                    const rect = joystickBase.getBoundingClientRect(); const centerX = rect.left + 60, centerY = rect.top + 60;
                    let dx = t.clientX - centerX, dy = t.clientY - centerY; const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 60) { dx = (dx/dist)*60; dy = (dy/dist)*60; }
                    joystickStick.style.left = (dx + 35) + 'px'; joystickStick.style.top = (dy + 35) + 'px';
                    joyX = dx / 60; joyY = dy / 60;
                }
            }
        }, {passive: false});
        const resetJoy = (e) => { for(let i=0; i<e.changedTouches.length; i++) if(e.changedTouches[i].identifier === joyTouchId) { joyTouchId = null; joystickBase.style.display = 'none'; joyX = 0; joyY = 0; } };
        joyZone.addEventListener('touchend', resetJoy); joyZone.addEventListener('touchcancel', resetJoy);
        
        const aimZone = document.getElementById('aim-zone'); let aimTouchId = null;
        aimZone.addEventListener('touchstart', (e) => {
            e.preventDefault(); if(aimTouchId !== null) return;
            const t = e.changedTouches[0]; aimTouchId = t.identifier; lastTouchX = t.clientX; lastTouchY = t.clientY;
        }, {passive: false});
        aimZone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for(let i=0; i<e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if(t.identifier === aimTouchId) {
                    const dx = t.clientX - lastTouchX, dy = t.clientY - lastTouchY; lastTouchX = t.clientX; lastTouchY = t.clientY;
                    const euler = new THREE.Euler(0, 0, 0, 'YXZ'); euler.setFromQuaternion(camera.quaternion);
                    euler.y -= dx * 0.005; euler.x -= dy * 0.005; euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x)); camera.quaternion.setFromEuler(euler);
                }
            }
        }, {passive: false});
        const resetAim = (e) => { for(let i=0; i<e.changedTouches.length; i++) if(e.changedTouches[i].identifier === aimTouchId) aimTouchId = null; };
        aimZone.addEventListener('touchend', resetAim); aimZone.addEventListener('touchcancel', resetAim);

        document.getElementById('btn-shoot').addEventListener('touchstart', (e) => { e.preventDefault(); shoot(); });
        document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if(canJump) { velocity.y += 10; canJump = false; } });
        document.getElementById('btn-reload').addEventListener('touchstart', (e) => { e.preventDefault(); ammo = weapons[currentWeaponIdx].maxAmmo; createWeapon(); playVoice("Reloading"); });
        document.getElementById('btn-gloo').addEventListener('touchstart', (e) => { e.preventDefault(); spawnGlooWall(); });
        document.getElementById('btn-inhaler').addEventListener('touchstart', (e) => { e.preventDefault(); useInhaler(); });
        const bgren = document.getElementById('btn-grenade'); if(bgren) bgren.addEventListener('touchstart', (e) => { e.preventDefault(); throwGrenade(); });
    }
}

function clearMap() {
    objects.forEach(o => scene.remove(o)); objects.length = 0;
    enemies.forEach(e => scene.remove(e)); enemies.length = 0;
    lootDrops.forEach(l => scene.remove(l)); lootDrops.length = 0;
}

function createLoneWolfMap() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor); objects.push(floor);
    const wallMat = new THREE.MeshStandardMaterial({ map: brickTex });
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 2), wallMat); w1.position.set(0, 5, -20); scene.add(w1); objects.push(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(40, 10, 2), wallMat); w2.position.set(0, 5, 20); scene.add(w2); objects.push(w2);
    const w3 = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 40), wallMat); w3.position.set(-20, 5, 0); scene.add(w3); objects.push(w3);
    const w4 = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 40), wallMat); w4.position.set(20, 5, 0); scene.add(w4); objects.push(w4);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial({map: woodTex})); c1.position.set(0, 1.5, 0); scene.add(c1); objects.push(c1);
}

function createCSMap() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: grassTex }));
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor); objects.push(floor);
    const boxMat = new THREE.MeshStandardMaterial({ map: woodTex });
    for(let i=0; i<20; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), boxMat); box.position.set(Math.random()*80-40, 1.5, Math.random()*80-40);
        if(Math.abs(box.position.x)<10 && Math.abs(box.position.z)<10) continue;
        scene.add(box); objects.push(box);
    }
}

function createBRMap() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 50, 50), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor); objects.push(floor);
    const houseMat = new THREE.MeshStandardMaterial({ map: brickTex }); const roofMat = new THREE.MeshStandardMaterial({ color: 0xaa3333 });
    for(let i=0; i<15; i++) {
        const hx = Math.random()*200-100, hz = Math.random()*200-100;
        if(Math.abs(hx)<20 && Math.abs(hz)<20) continue;
        const house = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), houseMat); house.position.set(hx, 3, hz); scene.add(house); objects.push(house);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 4, 4), roofMat); roof.position.set(hx, 8, hz); roof.rotation.y = Math.PI/4; scene.add(roof); objects.push(roof);
        if(Math.random() > 0.5) dropLoot(new THREE.Vector3(hx+6, 0, hz));
    }
}

function startGame(mode) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    GAME_STATE = 'PLAYING'; currentMode = mode; lobbyUI.style.display = 'none'; hud.style.display = 'block'; minimapCanvas.style.display = 'block';
    blueScore = 0; redScore = 0; playerHealth = 100; ammo = weapons[0].maxAmmo; glooWalls = 3; inhalers = 3; grenades = 2; camera.position.set(0, 1.6, 0); camera.rotation.z = 0;
    document.getElementById('health-text').innerText = playerHealth; document.getElementById('health-bar').style.width = '100%'; 
    document.getElementById('gloo-count').innerText = `Gloo Walls: ${glooWalls} [E]`;
    document.getElementById('inhaler-count').innerText = `Inhalers: ${inhalers} [Q]`;
    const gc = document.getElementById('grenade-count'); if(gc) gc.innerText = `Grenades: ${grenades} [G]`;
    
    document.querySelectorAll('.weapon-slot').forEach(e => e.classList.remove('active'));
    document.getElementById('slot-1').classList.add('active'); currentWeaponIdx = 0;

    clearMap(); clearInterval(timerInterval); playBGM();

    // Spawn random crate obstacles for cover
    createObstacles();

    if(mode === 'LONE_WOLF') { playVoice("Lone Wolf Mode."); createLoneWolfMap(); createEnemies(10); } 
    else if(mode === 'CS_RANKED') { playVoice("CS Ranked."); createCSMap(); createEnemies(20); } 
    else if(mode === 'BR_RANKED') {
        playVoice("Battle Royale Ranked."); createBRMap(); createEnemies(40); matchTimer = 180;
        timerInterval = setInterval(() => {
            matchTimer--; let m = Math.floor(matchTimer / 60), s = matchTimer % 60;
            document.getElementById('match-timer').innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
            if(matchTimer <= 0) handleWin();
        }, 1000);
    } else if (mode === 'MULTIPLAYER') {
        playVoice("Multiplayer Connected."); createCSMap(); matchTimer = 600;
        // No AI Bots spawned! Only Network players.
        timerInterval = setInterval(() => {
            matchTimer--; let m = Math.floor(matchTimer / 60), s = matchTimer % 60;
            document.getElementById('match-timer').innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
        }, 1000);
    }
    createWeapon(); 
    if (isMobile) { mobileControls.style.display = 'block'; blocker.style.display = 'none'; } else { controls.lock(); }
}

function handleWin() {
    let c = 0, m = 0, d = 0;
    if(currentMode === 'LONE_WOLF') { c=1000; m=1000; d=1000; } else if(currentMode === 'CS_RANKED') { c=2000; m=2000; d=2000; } else if(currentMode === 'BR_RANKED') { c=3000; m=3000; d=3000; }
    savedData.coins += c; savedData.money += m; savedData.diamonds += d; saveData();
    endRewards.innerText = `+${c} Coins, +${m} Money, +${d} Diamonds!`; endGame("BOOYAH!", true);
}

function handleLoss() { 
    endRewards.innerText = `Match Ended.`; GAME_STATE = 'GAMEOVER'; 
    let fallInterval = setInterval(() => {
        if(camera.position.y > 0.2) { camera.position.y -= 0.1; camera.rotation.z -= 0.1; } else { clearInterval(fallInterval); endGame("ELIMINATED", false); }
    }, 50);
}

function endGame(titleText, won) {
    GAME_STATE = 'GAMEOVER'; controls.unlock(); if(isMobile) mobileControls.style.display = 'none';
    hud.style.display = 'none'; blocker.style.display = 'none'; endScreen.style.display = 'flex'; endTitle.innerText = titleText; minimapCanvas.style.display = 'none';
    playEndSound(won); if(won) playVoice("Congratulations to the player! Booyah!"); else playVoice("Eliminated. Better luck next time.");
    clearInterval(timerInterval); stopBGM();
}

function createEnemies(count) {
    for (let i = 0; i < count; i++) {
        let enemyMesh;
        if(adamModel) {
            enemyMesh = SkeletonUtils.clone(adamModel);
            enemyMesh.traverse(child => { if(child.isMesh && child.material.name === "vanguard_Mesh") { child.material = child.material.clone(); if(Math.random() > 0.5) child.material.color.setHex(Math.random() * 0xffffff); } });
        } else {
            enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 }));
        }
        
        enemyMesh.position.set(Math.random()*40-20, 0, Math.random()*40-20);
        enemyMesh.userData = { hp: 100, isEnemy: true, lastFire: 0, name: botNames[Math.floor(Math.random() * botNames.length)], velocity: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize().multiplyScalar(4) };
        scene.add(enemyMesh); objects.push(enemyMesh); enemies.push(enemyMesh);
    }
}

function createObstacles() {
    for (let i = 0; i < 40; i++) {
        let x = Math.random() * 80 - 40;
        let z = Math.random() * 80 - 40;
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue; // Keep spawn clear
        let crate = new THREE.Mesh(
            new THREE.BoxGeometry(2, 2, 2),
            new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8, metalness: 0.2 })
        );
        crate.position.set(x, 1, z);
        scene.add(crate);
        objects.push(crate);
    }
}

function createWeapon() {
    if(gunGroup) camera.remove(gunGroup); gunGroup = new THREE.Group(); const wp = weapons[currentWeaponIdx];
    let color = wp.baseColor; if(wp.name === 'AR' && savedData.skins.gold_ar) color = 0xffd700; if(wp.name === 'AR' && savedData.skins.red_katana) color = 0xff0000; if(wp.name === 'SNIPER' && savedData.skins.ruby_sniper) color = 0xff0000;
    const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: color, metalness: 0.8 })); gunMesh.position.set(0.3, -0.2, -0.5);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, wp.name==='SNIPER'?0.8:0.4), new THREE.MeshStandardMaterial({ color: 0x111 })); barrel.rotation.x = Math.PI/2; barrel.position.set(0.3, -0.15, wp.name==='SNIPER'?-1.0:-0.9);
    muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); muzzleFlash.position.set(0.3, -0.15, wp.name==='SNIPER'?-1.45:-1.15); muzzleFlash.visible = false;
    gunGroup.add(gunMesh); gunGroup.add(barrel); gunGroup.add(muzzleFlash); camera.add(gunGroup);
    document.getElementById('ammo-text').innerText = ammo; document.getElementById('ammo-label').innerText = wp.label;
    
    document.querySelectorAll('.weapon-slot').forEach(e => e.classList.remove('active'));
    const slt = document.getElementById('slot-'+(currentWeaponIdx+1)); if(slt) slt.classList.add('active');
}

function spawnGlooWall() {
    if (glooWalls <= 0 || GAME_STATE !== 'PLAYING') return;
    const spawnPos = new THREE.Vector3(); camera.getWorldDirection(spawnPos); spawnPos.multiplyScalar(3).add(camera.position); spawnPos.y = 1;
    const wallColor = savedData.skins.neon_gloo ? 0x00ff00 : 0x00aaff;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2.5, 16, 1, false, -Math.PI/2, Math.PI), new THREE.MeshStandardMaterial({ color: wallColor, emissive: wallColor, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    wall.position.copy(spawnPos); wall.lookAt(new THREE.Vector3(camera.position.x, 1, camera.position.z)); scene.add(wall); objects.push(wall);
    glooWalls--; document.getElementById('gloo-count').innerText = `Gloo Walls: ${glooWalls} [E]`;
}

function useInhaler() {
    if (inhalers <= 0 || GAME_STATE !== 'PLAYING' || playerHealth >= 100) return;
    inhalers--; playerHealth = Math.min(100, playerHealth + 50); document.getElementById('inhaler-count').innerText = `Inhalers: ${inhalers} [Q]`;
    document.getElementById('health-text').innerText = playerHealth; document.getElementById('health-bar').style.width = playerHealth + '%'; playVoice("Healing");
}

function throwGrenade() {
    if (grenades <= 0 || GAME_STATE !== 'PLAYING') return;
    grenades--; const gc = document.getElementById('grenade-count'); if(gc) gc.innerText = `Grenades: ${grenades} [G]`;
    playVoice("Grenade out");
    const grenade = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({color: 0x113311}));
    const spawnPos = new THREE.Vector3(); camera.getWorldDirection(spawnPos); grenade.position.copy(camera.position).add(spawnPos);
    const vel = spawnPos.clone().multiplyScalar(15); vel.y += 5;
    scene.add(grenade); activeGrenades.push({ mesh: grenade, vel: vel, timer: 3.0 });
}

function createExplosion(pos) {
    playGunshot('SHOTGUN'); const blast = new THREE.Mesh(new THREE.SphereGeometry(8), new THREE.MeshBasicMaterial({color: 0xffaa00, transparent: true, opacity: 0.8}));
    blast.position.copy(pos); scene.add(blast);
    enemies.forEach(enemy => {
        if(enemy.position.distanceTo(pos) < 10) {
            enemy.userData.hp -= 200;
            if(enemy.userData.hp <= 0 && enemy.parent === scene) {
                scene.remove(enemy); objects.splice(objects.indexOf(enemy), 1); enemies.splice(enemies.indexOf(enemy), 1);
                dropLoot(enemy.position); blueScore++;
                if(currentMode === 'LONE_WOLF' && blueScore >= 3) handleWin(); else if(currentMode === 'CS_RANKED' && blueScore >= 4) handleWin();
            }
        }
    });
    if(controls.getObject().position.distanceTo(pos) < 10) takeDamage(80);
    let fade = 1.0; const fadeInt = setInterval(() => { fade -= 0.1; blast.material.opacity = fade; if(fade <= 0) { clearInterval(fadeInt); scene.remove(blast); } }, 30);
}

function dropLoot(pos) {
    const lootGroup = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x004422 }));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 20), new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.5 }));
    beam.position.y = 10; lootGroup.add(box); lootGroup.add(beam); lootGroup.position.copy(pos); lootGroup.position.y = 0.3; scene.add(lootGroup); lootDrops.push(lootGroup);
}

function takeDamage(amt) {
    if (GAME_STATE !== 'PLAYING' || playerHealth <= 0) return;
    playerHealth = Math.max(0, playerHealth - amt); document.getElementById('health-text').innerText = playerHealth; document.getElementById('health-bar').style.width = playerHealth + '%';
    damageOverlay.classList.add('active'); setTimeout(() => damageOverlay.classList.remove('active'), 200);
    playGunshot('AR'); if(playerHealth <= 0) handleLoss();
}

function onKeyDown(event) {
    if(GAME_STATE !== 'PLAYING') return;
    switch (event.code) {
        case 'KeyW': moveForward = true; break; case 'KeyA': moveLeft = true; break; case 'KeyS': moveBackward = true; break; case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 10; canJump = false; break;
        case 'KeyR': ammo = weapons[currentWeaponIdx].maxAmmo; createWeapon(); playVoice("Reloading"); break;
        case 'KeyE': spawnGlooWall(); break; case 'KeyQ': useInhaler(); break; case 'KeyG': throwGrenade(); break;
        case 'Digit1': currentWeaponIdx=0; createWeapon(); break; case 'Digit2': currentWeaponIdx=1; createWeapon(); break; case 'Digit3': currentWeaponIdx=2; createWeapon(); break; case 'Digit4': currentWeaponIdx=3; createWeapon(); break;
    }
}
function onKeyUp(event) { switch (event.code) { case 'KeyW': moveForward=false; break; case 'KeyA': moveLeft=false; break; case 'KeyS': moveBackward=false; break; case 'KeyD': moveRight=false; break; } }
function onMouseDown(event) { if (!controls.isLocked || GAME_STATE !== 'PLAYING') return; if (event.button === 0) shoot(); }

function shoot() {
    const wp = weapons[currentWeaponIdx]; const now = performance.now();
    if (now - lastFireTime < wp.fireRate || ammo <= 0) return;
    lastFireTime = now; ammo--; createWeapon(); playGunshot(wp.name);
    muzzleFlash.visible = true; muzzleFlash.rotation.z = Math.random() * Math.PI; gunGroup.position.z += wp.recoil; gunGroup.rotation.x += wp.recoil/2;
    setTimeout(() => { muzzleFlash.visible = false; gunGroup.position.z -= wp.recoil; gunGroup.rotation.x -= wp.recoil/2; }, 50);

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); const intersects = raycaster.intersectObjects(objects, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object; while(obj.parent && obj.parent.type !== "Scene" && !obj.userData.isEnemy) obj = obj.parent;
        if (obj.userData && obj.userData.isEnemy) {
            obj.userData.hp -= wp.damage; document.getElementById('hit-marker').classList.add('active'); setTimeout(() => document.getElementById('hit-marker').classList.remove('active'), 100);
            if (obj.userData.hp <= 0) {
                if(wp.name === 'SNIPER') playVoice("Headshot!");
                scene.remove(obj); objects.splice(objects.indexOf(obj), 1); enemies.splice(enemies.indexOf(obj), 1);
                dropLoot(obj.position); blueScore++;
                if(currentMode === 'LONE_WOLF' && blueScore >= 3) handleWin(); else if(currentMode === 'CS_RANKED' && blueScore >= 4) handleWin();
            }
        }
    }
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now(); const delta = (time - prevTime) / 1000; prevTime = time;

    // Alok's Aura Passive Healing
    if (GAME_STATE === 'PLAYING' && savedData.skins && savedData.skins.alok_aura) {
        if (playerHealth < 100) {
            playerHealth = Math.min(100, playerHealth + (1 * delta));
            document.getElementById('health-text').innerText = Math.floor(playerHealth); 
            document.getElementById('health-bar').style.width = playerHealth + '%';
        }
    }

    if (GAME_STATE === 'PLAYING') {
        timeOfDay += delta * 0.05; if (timeOfDay > Math.PI*2) timeOfDay = 0; dirLight.position.set(Math.cos(timeOfDay)*50, Math.sin(timeOfDay)*50, 0);

        const playerPos = controls.getObject().position;

        // Grenades
        for(let i = activeGrenades.length-1; i >= 0; i--) {
            const g = activeGrenades[i]; g.timer -= delta;
            if (g.timer <= 0) { createExplosion(g.mesh.position); scene.remove(g.mesh); activeGrenades.splice(i, 1); } 
            else {
                g.mesh.position.addScaledVector(g.vel, delta); g.vel.y -= 9.8 * delta;
                if (g.mesh.position.y < 0.3) { g.mesh.position.y = 0.3; g.vel.x *= 0.5; g.vel.z *= 0.5; g.vel.y *= -0.5; }
            }
        }

        // Radar Rendering
        if(minimapCtx) {
            minimapCtx.clearRect(0, 0, 150, 150); minimapCtx.fillStyle = '#0f0'; minimapCtx.beginPath(); minimapCtx.arc(75, 75, 4, 0, Math.PI*2); minimapCtx.fill();
            const camRot = camera.rotation.y;
            enemies.forEach(e => {
                const dx = e.position.x - playerPos.x; const dz = e.position.z - playerPos.z; const dist = Math.sqrt(dx*dx + dz*dz);
                if (dist < 60) {
                    const rx = dx * Math.cos(camRot) - dz * Math.sin(camRot); const rz = dx * Math.sin(camRot) + dz * Math.cos(camRot);
                    const mx = 75 + rx * 1.5; const my = 75 + rz * 1.5;
                    if(mx>0 && mx<150 && my>0 && my<150) { minimapCtx.fillStyle = '#f00'; minimapCtx.beginPath(); minimapCtx.arc(mx, my, 3, 0, Math.PI*2); minimapCtx.fill(); }
                }
            });
        }

        lootDrops.forEach(l => l.rotation.y += delta);

        enemies.forEach(enemy => {
            const dist = enemy.position.distanceTo(playerPos);
            if(dist < 30) {
                // Look at player and walk towards them
                enemy.lookAt(playerPos);
                if (dist > 5) {
                    const dir = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
                    enemy.position.addScaledVector(dir, delta * 3); // Move speed
                }
                
                if(time - enemy.userData.lastFire > 2000) { 
                    const dir = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize(); raycaster.set(enemy.position, dir); const intersects = raycaster.intersectObjects(objects, true);
                    let hasLOS = true; if (intersects.length > 0 && intersects[0].distance < dist) hasLOS = false;
                    if(hasLOS) { enemy.userData.lastFire = time; takeDamage(1); } // Reduced damage to 1
                }
            } else {
                enemy.position.addScaledVector(enemy.userData.velocity, delta);
                if (Math.abs(enemy.position.x) > 40) enemy.userData.velocity.x *= -1; if (Math.abs(enemy.position.z) > 40) enemy.userData.velocity.z *= -1;
                const target = enemy.position.clone().add(enemy.userData.velocity); enemy.lookAt(target);
            }
        });

        for (let i = lootDrops.length - 1; i >= 0; i--) {
            if (playerPos.distanceTo(lootDrops[i].position) < 2) {
                scene.remove(lootDrops[i]); lootDrops.splice(i, 1);
                ammo = weapons[currentWeaponIdx].maxAmmo; glooWalls++; inhalers++; grenades++; playerHealth = 100; createWeapon(); 
                document.getElementById('gloo-count').innerText = `Gloo Walls: ${glooWalls} [E]`; document.getElementById('inhaler-count').innerText = `Inhalers: ${inhalers} [Q]`;
                const gc = document.getElementById('grenade-count'); if(gc) gc.innerText = `Grenades: ${grenades} [G]`;
                document.getElementById('health-text').innerText = playerHealth; document.getElementById('health-bar').style.width = '100%'; playVoice("Loot secured");
            }
        }

        if (controls.isLocked || isMobile) {
            velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.y -= 9.8 * 3.0 * delta;
            if (isMobile) { direction.z = joyY; direction.x = joyX; } else { direction.z = Number(moveForward) - Number(moveBackward); direction.x = Number(moveRight) - Number(moveLeft); } direction.normalize();
            if (isMobile) { velocity.z -= direction.z * 40.0 * delta * Math.abs(joyY); velocity.x -= direction.x * 40.0 * delta * Math.abs(joyX); } else { if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta; if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta; }
            controls.moveRight(-velocity.x * delta); controls.moveForward(-velocity.z * delta); controls.getObject().position.y += (velocity.y * delta);
            if (controls.getObject().position.y < 1.6) { velocity.y = 0; controls.getObject().position.y = 1.6; canJump = true; }
        }
    }
    renderer.render(scene, camera);
}
