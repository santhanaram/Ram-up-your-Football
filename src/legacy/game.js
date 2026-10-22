// Ported verbatim from prototype/3d_football_pro.html (Stage 0).
// This file is replaced module by module from Stage 1 onwards.
// @ts-nocheck
import * as THREE from 'three';
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
  }
  
  init() {
    if (!this.initialized) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initialized = true;
      }
    }
  }

  playKick(pitch = 140, duration = 0.14) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + duration);
      gain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }

  playPass() {
    this.playKick(180, 0.12);
  }

  playCross() {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(90, this.ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch(e) {}
  }

  playHeader() {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(110, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.18);
    } catch(e) {}
  }

  playGoalCheer() {
    if (!this.ctx) return;
    try {
      // Crowd cheer synth noise burst
      const bufferSize = this.ctx.sampleRate * 1.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(700, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.2, this.ctx.currentTime);
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.7, this.ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.5);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
    } catch(e) {}
  }

  playWhistle() {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2600, this.ctx.currentTime);
      osc.frequency.setValueAtTime(2800, this.ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(2600, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch(e) {}
  }
}

const sounds = new SoundEngine();
window.addEventListener('click', () => sounds.init(), { once: true });
window.addEventListener('keydown', () => sounds.init(), { once: true });
window.addEventListener('touchstart', () => sounds.init(), { once: true });

const FIELD_LENGTH = 110;
const FIELD_WIDTH = 70;
const GOAL_WIDTH = 12;
const GOAL_HEIGHT = 4.2;
const BALL_RADIUS = 0.45;
const GRAVITY = -22.0;

// Game State Object
const gameState = {
  scoreHome: 0,
  scoreAway: 0,
  matchSeconds: 0,
  isPaused: false,
  controlledPlayerIndex: 0,
  dribbleLock: 0, // seconds before the ball may stick to a player's foot again
  receiveAssist: 0, // seconds the pass receiver auto-runs to the ball
  tackleCooldown: 0, // seconds before the Red Eagles may tackle again
  switchCooldown: 0, // seconds before auto-switch may change player again
  lastMoveDir: new THREE.Vector3(0, 0, 0), // world-space direction of the last stick/key input
  lastShooter: null,
  isHeaderActive: false
};

const canvas = document.getElementById('game-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x76a9e8); // Sky blue
scene.fog = new THREE.FogExp2(0x76a9e8, 0.007);

const CAMERA_DISTANCE = 50;
const CAMERA_HEIGHT = 34;
const CAMERA_PAN_MARGIN = 12;
// Keep the same width of pitch in view on any screen shape (phone, tablet, desktop)
const CAMERA_HORIZONTAL_FOV = 42;
function verticalFovFor(aspect) {
  const halfH = THREE.MathUtils.degToRad(CAMERA_HORIZONTAL_FOV / 2);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfH) / aspect));
}
const camera = new THREE.PerspectiveCamera(verticalFovFor(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(CAMERA_DISTANCE, CAMERA_HEIGHT, 0);
const cameraLookAt = new THREE.Vector3(0, 0, 0);
camera.lookAt(cameraLookAt);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting setup: Bright stadium floodlight style
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65 * Math.PI);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff7e6, 0.85 * Math.PI);
sunLight.position.set(40, 60, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 160;
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 70;
sunLight.shadow.camera.bottom = -70;
scene.add(sunLight);

// Secondary soft fill
const hemiLight = new THREE.HemisphereLight(0x9bd8ff, 0x1f5c22, 0.35 * Math.PI);
scene.add(hemiLight);

function buildStadium() {
  // Pitch Grass Base
  const pitchGeo = new THREE.PlaneGeometry(FIELD_WIDTH + 14, FIELD_LENGTH + 18);
  
  // Striped grass procedural pattern canvas
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gCtx = grassCanvas.getContext('2d');
  const stripeH = 512 / 12;
  for (let i = 0; i < 12; i++) {
    gCtx.fillStyle = (i % 2 === 0) ? '#28752d' : '#2f8835';
    gCtx.fillRect(0, i * stripeH, 512, stripeH);
  }
  const grassTexture = new THREE.CanvasTexture(grassCanvas);
  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(1, 1);

  const pitchMat = new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 0.9,
    metalness: 0.05
  });
  const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.receiveShadow = true;
  scene.add(pitchMesh);

  // Field Lines Group
  const linesGroup = new THREE.Group();
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  function addWhiteLine(w, h, x, z) {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    linesGroup.add(m);
  }

  const lw = 0.25;
  // Outer boundary
  addWhiteLine(FIELD_WIDTH, lw, 0, -FIELD_LENGTH / 2); // North line
  addWhiteLine(FIELD_WIDTH, lw, 0, FIELD_LENGTH / 2);  // South line
  addWhiteLine(lw, FIELD_LENGTH, -FIELD_WIDTH / 2, 0); // West line
  addWhiteLine(lw, FIELD_LENGTH, FIELD_WIDTH / 2, 0);  // East line
  // Halfway line
  addWhiteLine(FIELD_WIDTH, lw, 0, 0);

  // Center Circle
  const circleGeo = new THREE.RingGeometry(8.9, 9.15, 48);
  const circleMesh = new THREE.Mesh(circleGeo, lineMat);
  circleMesh.rotation.x = -Math.PI / 2;
  circleMesh.position.set(0, 0.02, 0);
  linesGroup.add(circleMesh);

  // Penalty Boxes (North & South)
  [-1, 1].forEach(side => {
    const boxZ = side * (FIELD_LENGTH / 2 - 16 / 2);
    const boxW = 34;
    const boxD = 16;
    // Box borders
    addWhiteLine(boxW, lw, 0, side * (FIELD_LENGTH / 2 - boxD));
    addWhiteLine(lw, boxD, -boxW / 2, side * (FIELD_LENGTH / 2 - boxD / 2));
    addWhiteLine(lw, boxD, boxW / 2, side * (FIELD_LENGTH / 2 - boxD / 2));
    
    // 6-yard box
    const smallW = 18;
    const smallD = 6;
    addWhiteLine(smallW, lw, 0, side * (FIELD_LENGTH / 2 - smallD));
    addWhiteLine(lw, smallD, -smallW / 2, side * (FIELD_LENGTH / 2 - smallD / 2));
    addWhiteLine(lw, smallD, smallW / 2, side * (FIELD_LENGTH / 2 - smallD / 2));

    // Penalty spot
    const spotGeo = new THREE.CircleGeometry(0.4, 16);
    const spot = new THREE.Mesh(spotGeo, lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.02, side * (FIELD_LENGTH / 2 - 11));
    linesGroup.add(spot);
  });
  scene.add(linesGroup);

  // Grandstands around field
  buildGrandstands();
}

function buildGrandstands() {
  const standMat = new THREE.MeshStandardMaterial({ color: 0x222a36, roughness: 0.8 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1f66bb, roughness: 0.5 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x181e26, roughness: 0.4 });

  // Lateral East and West Stands
  [-1, 1].forEach(dir => {
    const standGeo = new THREE.BoxGeometry(18, 14, FIELD_LENGTH + 24);
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.set(dir * (FIELD_WIDTH / 2 + 13), 6, 0);
    stand.castShadow = true;
    stand.receiveShadow = true;
    scene.add(stand);

    // Colored seat steps
    for (let s = 0; s < 5; s++) {
      const stepGeo = new THREE.BoxGeometry(2.5, 1.2, FIELD_LENGTH + 20);
      const step = new THREE.Mesh(stepGeo, seatMat);
      step.position.set(dir * (FIELD_WIDTH / 2 + 6 + s * 2.8), 2 + s * 2, 0);
      scene.add(step);
    }
  });

  // Goal Ends (North and South Behind Goal Stands)
  [-1, 1].forEach(dir => {
    const standGeo = new THREE.BoxGeometry(FIELD_WIDTH + 44, 16, 20);
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.set(0, 7, dir * (FIELD_LENGTH / 2 + 15));
    stand.castShadow = true;
    stand.receiveShadow = true;
    scene.add(stand);
  });

  // Stadium Floodlight Towers
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 });
  const lightOffsets = [
    [-FIELD_WIDTH/2 - 8, -FIELD_LENGTH/2 - 6],
    [FIELD_WIDTH/2 + 8, -FIELD_LENGTH/2 - 6],
    [-FIELD_WIDTH/2 - 8, FIELD_LENGTH/2 + 6],
    [FIELD_WIDTH/2 + 8, FIELD_LENGTH/2 + 6]
  ];
  lightOffsets.forEach(pt => {
    const mastGeo = new THREE.CylinderGeometry(0.5, 0.9, 28, 8);
    const mast = new THREE.Mesh(mastGeo, towerMat);
    mast.position.set(pt[0], 14, pt[1]);
    scene.add(mast);

    const headGeo = new THREE.BoxGeometry(3, 2, 3);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(pt[0], 28, pt[1]);
    scene.add(head);
  });
}

let goalTargets = [];

function buildGoals() {
  const postMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2, metalness: 0.3 });
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xcccccc,
    wireframe: true,
    transparent: true,
    opacity: 0.45
  });

  [-1, 1].forEach(side => {
    const goalZ = side * (FIELD_LENGTH / 2);
    const goalGroup = new THREE.Group();

    // Crossbar
    const crossbarGeo = new THREE.CylinderGeometry(0.14, 0.14, GOAL_WIDTH, 12);
    const crossbar = new THREE.Mesh(crossbarGeo, postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, GOAL_HEIGHT, goalZ);
    crossbar.castShadow = true;
    goalGroup.add(crossbar);

    // Left and Right Posts
    [-1, 1].forEach(postDir => {
      const postGeo = new THREE.CylinderGeometry(0.14, 0.14, GOAL_HEIGHT, 12);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(postDir * (GOAL_WIDTH / 2), GOAL_HEIGHT / 2, goalZ);
      post.castShadow = true;
      goalGroup.add(post);
    });

    // Net Box
    const netDepth = 3.5;
    const netGeo = new THREE.BoxGeometry(GOAL_WIDTH, GOAL_HEIGHT, netDepth);
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, GOAL_HEIGHT / 2, goalZ + side * (netDepth / 2));
    goalGroup.add(netMesh);

    scene.add(goalGroup);

    goalTargets.push({
      side: side, // -1 is Opponent Goal (Attack target for Blue Lions), 1 is Player Goal
      center: new THREE.Vector3(0, GOAL_HEIGHT / 2, goalZ),
      z: goalZ
    });
  });
}

buildStadium();
buildGoals();

function createFootballTexture() {
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 512;
  bCanvas.height = 256;
  const ctx = bCanvas.getContext('2d');
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(0, 0, 512, 256);

  // Draw black pentagons pattern
  ctx.fillStyle = '#1c1c1e';
  const pentagons = [
    [100, 70, 24], [256, 60, 26], [412, 70, 24],
    [60, 180, 22], [180, 190, 26], [330, 190, 26], [450, 180, 22]
  ];
  pentagons.forEach(([x, y, r]) => {
    ctx.beginPath();
    for (let a = 0; a < 5; a++) {
      const angle = (a * 2 * Math.PI) / 5 - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(bCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ballTexture = createFootballTexture();
const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 24, 24);
const ballMat = new THREE.MeshStandardMaterial({
  map: ballTexture,
  roughness: 0.35,
  metalness: 0.1
});
const ballMesh = new THREE.Mesh(ballGeo, ballMat);
ballMesh.castShadow = true;
scene.add(ballMesh);

// Realistic Ball Shadow Decal on the pitch ground
const ballShadowGeo = new THREE.CircleGeometry(BALL_RADIUS, 16);
const ballShadowMat = new THREE.MeshBasicMaterial({
  color: 0x051a08,
  transparent: true,
  opacity: 0.5
});
const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
ballShadow.rotation.x = -Math.PI / 2;
ballShadow.position.y = 0.025;
scene.add(ballShadow);

// Ball Physical State
const ballPhysics = {
  pos: new THREE.Vector3(0, BALL_RADIUS, 8),
  vel: new THREE.Vector3(0, 0, 0),
  rot: new THREE.Vector3(0, 0, 0),
  isAirborne: false,
  carrier: null
};
ballMesh.position.copy(ballPhysics.pos);

function createPlayerModel(colorHex, numberStr, isGK = false) {
  const playerGroup = new THREE.Group();

  // Materials
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xdfa07a });
  const jerseyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: isGK ? 0x222222 : (colorHex === 0x1d4ed8 ? 0xffffff : 0x111111) });
  const sockMat = new THREE.MeshStandardMaterial({ color: colorHex });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.8 });

  // Pelvis / Hips
  const hips = new THREE.Group();
  hips.position.y = 1.05;
  playerGroup.add(hips);

  // Torso / Chest
  const torsoGeo = new THREE.BoxGeometry(0.75, 0.9, 0.45);
  const torso = new THREE.Mesh(torsoGeo, jerseyMat);
  torso.position.y = 0.45;
  torso.castShadow = true;
  hips.add(torso);

  // Jersey Number Decal Canvas (Back)
  const numCanvas = document.createElement('canvas');
  numCanvas.width = 128;
  numCanvas.height = 128;
  const numCtx = numCanvas.getContext('2d');
  numCtx.fillStyle = '#ffffff';
  numCtx.font = 'bold 88px Teko, sans-serif';
  numCtx.textAlign = 'center';
  numCtx.textBaseline = 'middle';
  numCtx.fillText(numberStr, 64, 64);
  const numTex = new THREE.CanvasTexture(numCanvas);
  numTex.colorSpace = THREE.SRGBColorSpace;
  const numBadgeGeo = new THREE.PlaneGeometry(0.38, 0.38);
  const numBadgeMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true });
  const numBadge = new THREE.Mesh(numBadgeGeo, numBadgeMat);
  numBadge.position.set(0, 0.5, 0.23); // Back
  hips.add(numBadge);

  // Head & Neck
  const neckGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.2);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.95;
  hips.add(neck);

  const headGeo = new THREE.SphereGeometry(0.24, 16, 16);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.22;
  head.castShadow = true;
  hips.add(head);

  // Hair
  const hairGeo = new THREE.SphereGeometry(0.25, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x241711 });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.25;
  hips.add(hair);

  // Limbs: Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.22, 0, 0);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.22, 0, 0);
  hips.add(leftLeg);
  hips.add(rightLeg);

  function createLegAssembly() {
    const legG = new THREE.Group();
    // Shorts part
    const thighGeo = new THREE.CylinderGeometry(0.16, 0.13, 0.45, 8);
    const thigh = new THREE.Mesh(thighGeo, shortsMat);
    thigh.position.y = -0.2;
    legG.add(thigh);
    // Shin & sock
    const shinGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.45, 8);
    const shin = new THREE.Mesh(shinGeo, sockMat);
    shin.position.y = -0.65;
    legG.add(shin);
    // Boot
    const bootGeo = new THREE.BoxGeometry(0.22, 0.14, 0.4);
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.92, -0.06);
    boot.castShadow = true;
    legG.add(boot);
    return legG;
  }
  leftLeg.add(createLegAssembly());
  rightLeg.add(createLegAssembly());

  // Limbs: Arms
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.48, 0.78, 0);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.48, 0.78, 0);
  hips.add(leftArm);
  hips.add(rightArm);

  function createArmAssembly() {
    const armG = new THREE.Group();
    const upperGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.4, 8);
    const upper = new THREE.Mesh(upperGeo, jerseyMat);
    upper.position.y = -0.18;
    armG.add(upper);
    const lowerGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.4, 8);
    const lower = new THREE.Mesh(lowerGeo, skinMat);
    lower.position.y = -0.55;
    armG.add(lower);
    return armG;
  }
  leftArm.add(createArmAssembly());
  rightArm.add(createArmAssembly());

  // Selection Marker Halo (for active user-controlled player)
  const ringGeo = new THREE.RingGeometry(0.7, 0.88, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0 });
  const selectRing = new THREE.Mesh(ringGeo, ringMat);
  selectRing.rotation.x = -Math.PI / 2;
  selectRing.position.y = 0.03;
  playerGroup.add(selectRing);

  // Shadow circle
  const pShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
  pShadow.rotation.x = -Math.PI / 2;
  pShadow.position.y = 0.02;
  playerGroup.add(pShadow);

  scene.add(playerGroup);

  return {
    mesh: playerGroup,
    hips,
    head,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    selectRing,
    animTime: Math.random() * 10
  };
}

const BLUE_COLOR = 0x1d4ed8; // Striking Blue
const RED_COLOR = 0xdc2626;  // Opponent Red

const players = [];

// Blue Lions, 4-3-3, attacking towards negative Z (opponent's goal at z = -55).
// Home ids must equal their index in `players` (getControlledPlayer indexes by id).
const homeRoster = [
  { id: 0,  num: '10', name: 'Striker', role: 'ST', x: 0, z: 12, isUser: true },
  { id: 1,  num: '7',  name: 'Left Winger', role: 'LW', x: -18, z: 2 },
  { id: 2,  num: '11', name: 'Right Winger', role: 'RW', x: 18, z: 2 },
  { id: 3,  num: '8',  name: 'Playmaker', role: 'CM', x: 0, z: 20 },
  { id: 4,  num: '6',  name: 'Left Midfielder', role: 'LM', x: -13, z: 22 },
  { id: 5,  num: '14', name: 'Right Midfielder', role: 'RM', x: 13, z: 22 },
  { id: 6,  num: '3',  name: 'Left Back', role: 'LB', x: -22, z: 34 },
  { id: 7,  num: '4',  name: 'Centre Back', role: 'CB', x: -7, z: 37 },
  { id: 8,  num: '5',  name: 'Centre Back', role: 'CB', x: 7, z: 37 },
  { id: 9,  num: '2',  name: 'Right Back', role: 'RB', x: 22, z: 34 },
  { id: 10, num: '1',  name: 'Keeper', role: 'GK', x: 0, z: 52.2, isGK: true }
];

// Red Eagles, 4-4-2, defending the goal at z = -55
const awayRoster = [
  { id: 20, num: '1',  name: 'Keeper', role: 'GK', x: 0, z: -52.2, isGK: true },
  { id: 21, num: '4',  name: 'Centre Back', role: 'CB', x: -7, z: -38 },
  { id: 22, num: '5',  name: 'Centre Back', role: 'CB', x: 7, z: -38 },
  { id: 23, num: '2',  name: 'Right Back', role: 'RB', x: 21, z: -34 },
  { id: 24, num: '3',  name: 'Left Back', role: 'LB', x: -21, z: -34 },
  { id: 25, num: '6',  name: 'Midfielder', role: 'CM', x: -7, z: -24 },
  { id: 26, num: '8',  name: 'Midfielder', role: 'CM', x: 7, z: -24 },
  { id: 27, num: '7',  name: 'Right Midfielder', role: 'RM', x: 20, z: -22 },
  { id: 28, num: '11', name: 'Left Midfielder', role: 'LM', x: -20, z: -22 },
  { id: 29, num: '9',  name: 'Forward', role: 'ST', x: -6, z: -10 },
  { id: 30, num: '10', name: 'Forward', role: 'ST', x: 6, z: -10 }
];

homeRoster.forEach((data, idx) => {
  const model = createPlayerModel(BLUE_COLOR, data.num, !!data.isGK);
  players.push({
    ...data,
    team: 'home',
    model: model,
    pos: new THREE.Vector3(data.x, 0, data.z),
    vel: new THREE.Vector3(0, 0, 0),
    speed: data.isGK ? 9.0 : 13.5,
    isJumping: false,
    jumpY: 0,
    jumpVel: 0,
    targetPos: new THREE.Vector3(data.x, 0, data.z),
    animSpeed: 0
  });
});

awayRoster.forEach((data) => {
  const model = createPlayerModel(RED_COLOR, data.num, !!data.isGK);
  players.push({
    ...data,
    team: 'away',
    model: model,
    pos: new THREE.Vector3(data.x, 0, data.z),
    vel: new THREE.Vector3(0, 0, 0),
    speed: data.isGK ? 9.0 : 8.5,
    isJumping: false,
    jumpY: 0,
    jumpVel: 0,
    targetPos: new THREE.Vector3(data.x, 0, data.z),
    animSpeed: 0
  });
});

// Update controlled player reference
function getControlledPlayer() {
  return players[gameState.controlledPlayerIndex];
}

const feedEl = document.getElementById('action-feed');

function showFeed(text, color = 'text-yellow-300') {
  feedEl.innerText = text;
  feedEl.className = `text-xs sm:text-sm tracking-widest font-bold uppercase bg-neutral-900/90 border border-white/20 px-4 py-1 rounded-full opacity-100 transition-opacity duration-300 ${color}`;
  clearTimeout(feedEl.timer);
  feedEl.timer = setTimeout(() => {
    feedEl.classList.remove('opacity-100');
    feedEl.classList.add('opacity-0');
  }, 1400);
}

// 1. GROUND PASS LOGIC (J)
const TACKLE_COOLDOWN = 1.2;
// Per-frame (at 60 fps) speed retained by the ball on the ground and in the air
const GROUND_FRICTION = 0.982;
const AIR_DRAG = 0.994;
// Ground speed needed for a pass to roll `dist` metres and still arrive with pace
function passSpeedFor(dist) {
  return dist * (1 - GROUND_FRICTION) * 60 + 5;
}
const KEEPER_LATERAL_SPEED = 3.6; // m/s across the goal mouth
const KEEPER_REACH = 1.7; // metres either side on a dive
// After a kick the ball can't stick to a foot straight away, or it would be re-trapped next frame
const KICK_GRACE = 0.3;
// After a pass the receiver runs onto the ball by himself unless you steer him
const RECEIVE_ASSIST_TIME = 1.6;

// Possession radius for one-tap pass and shoot
const ON_BALL_RADIUS = 3.0;

function hasBall(player) {
  return player.pos.distanceTo(ballPhysics.pos) <= ON_BALL_RADIUS && ballPhysics.pos.y < 1.8;
}

// Nearest outfield Blue Lion to the ball; keepers are never auto-selected
function nearestHomeToBall() {
  let best = null;
  let bestDist = Infinity;
  players.forEach(p => {
    if (p.team !== 'home' || p.isGK) return;
    const d = p.pos.distanceTo(ballPhysics.pos);
    if (d < bestDist) { bestDist = d; best = p; }
  });
  return best;
}

// Without the ball, PASS and SHOOT switch to the teammate closest to it instead
function switchToNearest() {
  const nearest = nearestHomeToBall();
  if (nearest && nearest.id !== gameState.controlledPlayerIndex) {
    gameState.controlledPlayerIndex = nearest.id;
    gameState.switchCooldown = 0.4;
    showFeed(`SWITCHED TO ${nearest.name}`, "text-emerald-300");
  } else {
    showFeed("GET TO THE BALL", "text-neutral-400");
  }
}

// True when an opponent stands within `width` metres of the straight path from a to b
function laneBlocked(a, b, width) {
  const ab = new THREE.Vector3().subVectors(b, a); ab.y = 0;
  const len2 = ab.lengthSq();
  return players.some(p => {
    if (p.team !== 'away') return false;
    const ap = new THREE.Vector3().subVectors(p.pos, a); ap.y = 0;
    const t = THREE.MathUtils.clamp(ap.dot(ab) / len2, 0, 1);
    const closest = a.clone().addScaledVector(ab, t);
    closest.y = 0;
    return Math.hypot(p.pos.x - closest.x, p.pos.z - closest.z) < width;
  });
}

// 1. ONE-TAP SMART PASS (J): picks the best open teammate, favouring the direction you're pushing
function triggerPass() {
  const player = getControlledPlayer();
  if (!hasBall(player)) {
    switchToNearest();
    return;
  }

  // Preferred direction: current stick/keys, otherwise towards the opponent's goal
  const preferDir = gameState.lastMoveDir.lengthSq() > 0.01
    ? gameState.lastMoveDir.clone().normalize()
    : new THREE.Vector3(0, 0, -1);

  let bestMate = null;
  let bestScore = Infinity;
  players.forEach((other) => {
    if (other.team !== 'home' || other.id === player.id || other.isGK) return;
    const toMate = new THREE.Vector3().subVectors(other.pos, ballPhysics.pos);
    toMate.y = 0;
    const d = toMate.length();
    if (d < 4) return;
    const alignment = toMate.clone().normalize().dot(preferDir); // -1..1
    let score = d * 0.45 - alignment * 22;
    if (d > 40) score += (d - 40) * 1.5; // long balls are less reliable
    if (laneBlocked(ballPhysics.pos, other.pos, 2.0)) score += 30;
    if (score < bestScore) { bestScore = score; bestMate = other; }
  });

  sounds.playPass();
  ballPhysics.carrier = null;
  gameState.dribbleLock = KICK_GRACE;
  gameState.lastShooter = player;

  if (bestMate) {
    // Lead the receiver slightly towards goal so they collect it in stride
    const target = bestMate.pos.clone().add(new THREE.Vector3(0, 0, -1.5));
    const passDir = new THREE.Vector3().subVectors(target, ballPhysics.pos);
    passDir.y = 0;
    const dist = passDir.length();
    passDir.normalize();

    // Ground pass with enough pace to arrive despite rolling friction
    const speed = THREE.MathUtils.clamp(passSpeedFor(dist), 12, 36);
    ballPhysics.vel.copy(passDir.multiplyScalar(speed));
    ballPhysics.vel.y = 0.5; // Stays close to turf

    // Control follows the ball to the receiver
    gameState.controlledPlayerIndex = bestMate.id;
    gameState.receiveAssist = RECEIVE_ASSIST_TIME;
    gameState.switchCooldown = 0.8;
    showFeed(`PASS TO ${bestMate.name}`);
  } else {
    ballPhysics.vel.copy(preferDir.multiplyScalar(20));
    ballPhysics.vel.y = 0.4;
    showFeed("PASS INTO SPACE");
  }
}

// 2. HIGH CROSS LOGIC (K)
function triggerCross() {
  const player = getControlledPlayer();
  const distToBall = player.pos.distanceTo(ballPhysics.pos);
  if (distToBall > 3.4) {
    showFeed("APPROACH BALL FIRST", "text-neutral-400");
    return;
  }

  sounds.playCross();

  // Target the penalty box near opponent's 6-yard mark
  let boxTarget = new THREE.Vector3(0, 0, -42);
  const matesInBox = players.filter(p => p.team === 'home' && p.id !== player.id && p.pos.z < -25);
  
  if (matesInBox.length > 0) {
    boxTarget.copy(matesInBox[0].pos).add(new THREE.Vector3(0, 0, -4));
  } else {
    boxTarget.set((Math.random() - 0.5) * 8, 0, -43);
  }

  const crossVector = new THREE.Vector3().subVectors(boxTarget, ballPhysics.pos);
  const distance = crossVector.length();
  crossVector.normalize();

  // Lofted arc calculation
  ballPhysics.vel.x = crossVector.x * 19;
  ballPhysics.vel.z = crossVector.z * 19;
  ballPhysics.vel.y = Math.min(13.5, 9.5 + distance * 0.16);
  ballPhysics.carrier = null;
  gameState.dribbleLock = KICK_GRACE;
  gameState.lastShooter = player;

  ballPhysics.rot.set(0.6, 0.2, 0);

  setTimeout(() => {
    findBestAerialContender();
  }, 350);

  showFeed("DANGEROUS CROSS INTO BOX!", "text-amber-300");
}

function findBestAerialContender() {
  let closest = null;
  let minDist = Infinity;
  players.forEach(p => {
    if (p.team === 'home') {
      const d = p.pos.distanceTo(new THREE.Vector3(0, 0, -42));
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }
  });
  if (closest) {
    gameState.controlledPlayerIndex = closest.id;
  }
}

// 3. JUMPING HEADER LOGIC (SPACE / HEAD BUTTON)
function triggerHeader() {
  const player = getControlledPlayer();
  
  if (!player.isJumping) {
    player.isJumping = true;
    player.jumpVel = 9.8;
  }

  const headPos = player.pos.clone().add(new THREE.Vector3(0, 1.8 + player.jumpY, 0));
  const distToHead = headPos.distanceTo(ballPhysics.pos);

  if (distToHead < 3.2 && ballPhysics.pos.y > 1.2) {
    sounds.playHeader();

    const targetGoal = new THREE.Vector3((Math.random() > 0.5 ? 4.5 : -4.5), 2.2, -55);
    const headerDir = new THREE.Vector3().subVectors(targetGoal, ballPhysics.pos).normalize();

    ballPhysics.vel.copy(headerDir.multiplyScalar(26));
    ballPhysics.vel.y = -2.0;
    ballPhysics.carrier = null;
    gameState.dribbleLock = KICK_GRACE;
    gameState.lastShooter = player;

    showFeed("POWERFUL DIVING HEADER!", "text-purple-300");
  } else {
    showFeed("AERIAL JUMP");
  }
}

// 4. ONE-TAP AUTO-AIMED SHOT / VOLLEY (L): aims for the corner away from the keeper
function triggerShoot() {
  const player = getControlledPlayer();
  const distToBall = player.pos.distanceTo(ballPhysics.pos);
  if (distToBall > 3.4) {
    switchToNearest();
    return;
  }

  sounds.playKick(160, 0.25);

  const goalZ = -FIELD_LENGTH / 2;
  const keeper = players.find(p => p.team === 'away' && p.isGK);
  // Far post from the keeper; if he's central, the side away from the shooter
  const keeperX = keeper ? keeper.pos.x : 0;
  const side = Math.abs(keeperX) > 0.6 ? -Math.sign(keeperX) : (player.pos.x > 0 ? -1 : 1);
  const distToGoal = Math.hypot(ballPhysics.pos.x, ballPhysics.pos.z - goalZ);
  const spread = THREE.MathUtils.clamp(distToGoal / 30, 0.2, 1.6); // accuracy drops with range
  const shotTarget = new THREE.Vector3(
    side * (GOAL_WIDTH / 2 - 0.7) + (Math.random() - 0.5) * spread,
    1.0 + Math.random() * 1.6,
    goalZ
  );
  const flat = new THREE.Vector3(shotTarget.x - ballPhysics.pos.x, 0, shotTarget.z - ballPhysics.pos.z);
  const flatDist = flat.length();
  flat.normalize();

  const isVolley = ballPhysics.pos.y > 0.8;
  const shotSpeed = THREE.MathUtils.clamp(24 + distToGoal * 0.35, 26, isVolley ? 38 : 35);

  // Ballistic lift so the ball arrives at the target height (allowing ~15% for air drag)
  const flightTime = (flatDist / shotSpeed) * 1.15;
  ballPhysics.vel.set(flat.x * shotSpeed, 0, flat.z * shotSpeed);
  ballPhysics.vel.y = (shotTarget.y - ballPhysics.pos.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;
  ballPhysics.carrier = null;
  gameState.dribbleLock = KICK_GRACE;
  gameState.lastShooter = player;
  gameState.switchCooldown = 0.6;

  if (isVolley) {
    showFeed("ROCKET THUNDER VOLLEY!", "text-rose-400");
  } else if (distToGoal > 25) {
    showFeed("FEROCIOUS LONG-RANGE SHOT!", "text-rose-400");
  } else {
    showFeed("CLINICAL FINISH!", "text-rose-400");
  }
}

const input = {
  moveX: 0,
  moveZ: 0,
  keys: {}
};

// Keyboard Listeners
window.addEventListener('keydown', (e) => {
  input.keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }

  // Tactical key triggers
  if (e.key.toLowerCase() === 'j') triggerPass();
  if (e.key.toLowerCase() === 'k') triggerCross();
  if (e.key.toLowerCase() === 'l') triggerShoot();
  if (e.code === 'Space') triggerHeader();
});

window.addEventListener('keyup', (e) => {
  input.keys[e.key.toLowerCase()] = false;
});

// Touch / Virtual Joystick handling
const joystickZone = document.getElementById('joystick-zone');
const joystickThumb = document.getElementById('joystick-thumb');
let joyTouchId = null;
let joyCenter = { x: 0, y: 0 };
const MAX_JOY_RADIUS = 42;

joystickZone.addEventListener('touchstart', (e) => {
  const touch = e.changedTouches[0];
  joyTouchId = touch.identifier;
  const rect = joystickZone.getBoundingClientRect();
  joyCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
  handleJoyMove(touch.clientX, touch.clientY);
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  if (joyTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joyTouchId) {
      handleJoyMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
      break;
    }
  }
}, { passive: false });

const resetJoystick = () => {
  joyTouchId = null;
  input.moveX = 0;
  input.moveZ = 0;
  joystickThumb.style.transform = `translate(-50%, -50%)`;
};

window.addEventListener('touchend', (e) => {
  if (joyTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joyTouchId) {
      resetJoystick();
      break;
    }
  }
});
window.addEventListener('touchcancel', resetJoystick);

function handleJoyMove(clientX, clientY) {
  let dx = clientX - joyCenter.x;
  let dy = clientY - joyCenter.y;
  const dist = Math.hypot(dx, dy);

  if (dist > MAX_JOY_RADIUS) {
    dx = (dx / dist) * MAX_JOY_RADIUS;
    dy = (dy / dist) * MAX_JOY_RADIUS;
  }

  joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  input.moveX = dx / MAX_JOY_RADIUS;
  input.moveZ = dy / MAX_JOY_RADIUS;
}

// UI Buttons Event Listeners
document.getElementById('btn-pass').addEventListener('click', triggerPass);
document.getElementById('btn-cross').addEventListener('click', triggerCross);
document.getElementById('btn-header').addEventListener('click', triggerHeader);
document.getElementById('btn-shoot').addEventListener('click', triggerShoot);

// Goal Modal Actions
document.getElementById('btn-resume-match').addEventListener('click', () => {
  hideGoalModal();
  resetBallAndTeamPosition(false);
});
document.getElementById('btn-restart-match').addEventListener('click', () => {
  gameState.scoreHome = 0;
  gameState.scoreAway = 0;
  updateScoreUI();
  hideGoalModal();
  resetBallAndTeamPosition(true);
});

function updateBall(delta) {
  // Apply Gravity if in the air
  if (ballPhysics.pos.y > BALL_RADIUS) {
    ballPhysics.vel.y += GRAVITY * delta;
  }

  // Update position
  ballPhysics.pos.addScaledVector(ballPhysics.vel, delta);

  // Ground bounce & roll friction
  if (ballPhysics.pos.y <= BALL_RADIUS) {
    ballPhysics.pos.y = BALL_RADIUS;
    if (Math.abs(ballPhysics.vel.y) > 2.0) {
      ballPhysics.vel.y = -ballPhysics.vel.y * 0.52; // Elastic restitution
      sounds.playKick(90, 0.08);
    } else {
      ballPhysics.vel.y = 0;
    }

    // Ground rolling resistance (frame-rate independent)
    const roll = Math.pow(GROUND_FRICTION, delta * 60);
    ballPhysics.vel.x *= roll;
    ballPhysics.vel.z *= roll;
  } else {
    // Air resistance
    const drag = Math.pow(AIR_DRAG, delta * 60);
    ballPhysics.vel.x *= drag;
    ballPhysics.vel.z *= drag;
  }

  // Pitch boundary walls bounce
  const maxZ = FIELD_LENGTH / 2;
  const maxX = FIELD_WIDTH / 2;

  // GOAL DETECTION (North Goal: z = -55)
  if (ballPhysics.pos.z < -FIELD_LENGTH / 2 + 0.5) {
    if (Math.abs(ballPhysics.pos.x) < GOAL_WIDTH / 2 && ballPhysics.pos.y < GOAL_HEIGHT) {
      // GOAL SCORED FOR HOME TEAM!
      onGoalScored('home');
      return;
    } else {
      // Rebound off end billboard
      ballPhysics.pos.z = -FIELD_LENGTH / 2 + 0.5;
      ballPhysics.vel.z = -ballPhysics.vel.z * 0.4;
    }
  }

  // South Goal (Defending)
  if (ballPhysics.pos.z > FIELD_LENGTH / 2 - 0.5) {
    if (Math.abs(ballPhysics.pos.x) < GOAL_WIDTH / 2 && ballPhysics.pos.y < GOAL_HEIGHT) {
      onGoalScored('away');
      return;
    } else {
      ballPhysics.pos.z = FIELD_LENGTH / 2 - 0.5;
      ballPhysics.vel.z = -ballPhysics.vel.z * 0.4;
    }
  }

  // Sideline bounce
  if (Math.abs(ballPhysics.pos.x) > maxX) {
    ballPhysics.pos.x = Math.sign(ballPhysics.pos.x) * maxX;
    ballPhysics.vel.x = -ballPhysics.vel.x * 0.5;
  }

  // Match Mesh & Visual Shadow
  ballMesh.position.copy(ballPhysics.pos);
  ballShadow.position.x = ballPhysics.pos.x;
  ballShadow.position.z = ballPhysics.pos.z;
  
  // Scale shadow down when ball is high in the sky
  const shadowScale = Math.max(0.2, 1.0 - (ballPhysics.pos.y / 14));
  ballShadow.scale.set(shadowScale, shadowScale, 1);
  ballShadowMat.opacity = Math.max(0.12, 0.5 - (ballPhysics.pos.y / 18));

  // Ball rolling visual spin
  const speed = Math.hypot(ballPhysics.vel.x, ballPhysics.vel.z);
  if (speed > 0.1) {
    ballMesh.rotation.x += ballPhysics.vel.z * delta * 2.5;
    ballMesh.rotation.z -= ballPhysics.vel.x * delta * 2.5;
  }
}

function onGoalScored(scorerTeam) {
  if (gameState.isPaused) return;
  gameState.isPaused = true;

  sounds.playGoalCheer();
  sounds.playWhistle();

  if (scorerTeam === 'home') {
    gameState.scoreHome++;
    document.getElementById('goal-detail').innerText = `${gameState.lastShooter ? gameState.lastShooter.name : 'Striker'} scores a brilliant masterpiece into the top corner!`;
  } else {
    gameState.scoreAway++;
    document.getElementById('goal-detail').innerText = `Enemy counter-attack breached the backline!`;
  }
  updateScoreUI();
  showGoalModal();
}

function updateScoreUI() {
  document.getElementById('score-home').innerText = gameState.scoreHome;
  document.getElementById('score-away').innerText = gameState.scoreAway;
}

function showGoalModal() {
  const modal = document.getElementById('goal-modal');
  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
}

function hideGoalModal() {
  const modal = document.getElementById('goal-modal');
  modal.classList.add('opacity-0', 'pointer-events-none');
  modal.classList.remove('opacity-100', 'pointer-events-auto');
  gameState.isPaused = false;
}

function resetBallAndTeamPosition(hardReset = false) {
  ballPhysics.pos.set(0, BALL_RADIUS, 6);
  ballPhysics.vel.set(0, 0, 0);
  ballPhysics.carrier = null;

  // Reposition Players to tactical starting shape
  players.forEach(p => {
    if (p.team === 'home') {
      const orig = homeRoster.find(r => r.id === p.id);
      if (orig) p.pos.set(orig.x, 0, orig.z);
    } else {
      const orig = awayRoster.find(r => r.id === p.id);
      if (orig) p.pos.set(orig.x, 0, orig.z);
    }
    p.jumpY = 0;
    p.isJumping = false;
  });

  gameState.controlledPlayerIndex = 0; // Back to central striker
  showFeed("KICK-OFF READY");
}

function updatePlayers(delta) {
  // Auto-switch: when the ball is loose, hand control to the Blue Lion closest to it
  gameState.switchCooldown = Math.max(0, gameState.switchCooldown - delta);
  if (gameState.switchCooldown === 0) {
    const current = getControlledPlayer();
    const nearest = nearestHomeToBall();
    if (nearest && nearest.id !== current.id && !hasBall(current) &&
        nearest.pos.distanceTo(ballPhysics.pos) + 3 < current.pos.distanceTo(ballPhysics.pos)) {
      gameState.controlledPlayerIndex = nearest.id;
      gameState.switchCooldown = 0.5;
    }
  }

  const controlled = getControlledPlayer();

  // 1. Process User Movement on Active Striker
  let moveDir = new THREE.Vector3(0, 0, 0);

  // Combine Keyboard WASD / Arrows
  // Input is in screen space (right / down). The side-on camera looks along -x,
  // so screen right is world -z (towards the goal Blue attacks) and screen down is world +x.
  let screenX = 0;
  let screenY = 0;
  if (input.keys['w'] || input.keys['arrowup']) screenY -= 1;
  if (input.keys['s'] || input.keys['arrowdown']) screenY += 1;
  if (input.keys['a'] || input.keys['arrowleft']) screenX -= 1;
  if (input.keys['d'] || input.keys['arrowright']) screenX += 1;

  // Add touch virtual joystick contribution
  if (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05) {
    screenX = input.moveX;
    screenY = input.moveZ;
  }
  moveDir.x = screenY;
  moveDir.z = -screenX;
  gameState.lastMoveDir.copy(moveDir);

  gameState.dribbleLock = Math.max(0, gameState.dribbleLock - delta);
  gameState.receiveAssist = Math.max(0, gameState.receiveAssist - delta);
  // Receiving a pass with no input: run onto the ball automatically
  if (moveDir.lengthSq() < 0.0001 && gameState.receiveAssist > 0 && !hasBall(controlled)) {
    moveDir.subVectors(ballPhysics.pos, controlled.pos);
    moveDir.y = 0;
  }
  if (hasBall(controlled)) gameState.receiveAssist = 0;

  if (moveDir.length() > 0.01) {
    moveDir.normalize();
    controlled.pos.x += moveDir.x * controlled.speed * delta;
    controlled.pos.z += moveDir.z * controlled.speed * delta;
    
    // Rotate player to face movement direction smoothly
    const targetAngle = Math.atan2(moveDir.x, moveDir.z);
    controlled.model.mesh.rotation.y = targetAngle;
    controlled.animSpeed = 1.0;
  } else {
    controlled.animSpeed = 0.0;
  }

  // 2. Dribble Attachment: Keep ball with controlled player when close
  const distToBall = controlled.pos.distanceTo(ballPhysics.pos);
  if (distToBall < 1.7 && ballPhysics.pos.y < 1.2 && !controlled.isJumping && gameState.dribbleLock === 0) {
    // Player controls the dribble
    const forwardVec = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), controlled.model.mesh.rotation.y);
    const dribblePos = controlled.pos.clone().add(forwardVec.multiplyScalar(1.2));
    
    // Smoothly drag ball
    ballPhysics.pos.x += (dribblePos.x - ballPhysics.pos.x) * 0.25;
    ballPhysics.pos.z += (dribblePos.z - ballPhysics.pos.z) * 0.25;
    ballPhysics.vel.set(0, 0, 0);
  }

  // Team shape shifts with the ball: up/down the pitch and across it
  const shiftZ = ballPhysics.pos.z * 0.45;
  const shiftX = ballPhysics.pos.x * 0.25;
  const maxX = FIELD_WIDTH / 2 - 2;
  const maxZ = FIELD_LENGTH / 2 - 3;

  const moveTowards = (p, tx, tz, rate) => {
    tx = THREE.MathUtils.clamp(tx, -maxX, maxX);
    tz = THREE.MathUtils.clamp(tz, -maxZ, maxZ);
    const stepX = THREE.MathUtils.clamp((tx - p.pos.x) * rate * delta, -p.speed * delta, p.speed * delta);
    const stepZ = THREE.MathUtils.clamp((tz - p.pos.z) * rate * delta, -p.speed * delta, p.speed * delta);
    p.pos.x += stepX;
    p.pos.z += stepZ;
    return Math.hypot(stepX, stepZ);
  };

  // Keepers: track the ball across the goal mouth and parry anything close
  const updateKeeper = (p, lineZ, clearDir) => {
    // Read a shot: if the ball is flying at goal, move towards where it will cross the line
    let targetGKX = THREE.MathUtils.clamp(ballPhysics.pos.x * 0.65, -GOAL_WIDTH / 2.3, GOAL_WIDTH / 2.3);
    const towardsGoal = -clearDir * ballPhysics.vel.z;
    if (towardsGoal > 15) {
      const timeToLine = Math.abs(lineZ - ballPhysics.pos.z) / towardsGoal;
      targetGKX = THREE.MathUtils.clamp(ballPhysics.pos.x + ballPhysics.vel.x * timeToLine, -GOAL_WIDTH / 2, GOAL_WIDTH / 2);
    }
    const maxStep = KEEPER_LATERAL_SPEED * delta;
    p.pos.x += THREE.MathUtils.clamp((targetGKX - p.pos.x) * 4.5 * delta, -maxStep, maxStep);
    p.pos.z = lineZ;

    // Slow balls near the keeper are gathered; fast shots are saved only within his diving reach
    const inBox = clearDir > 0 ? ballPhysics.pos.z < lineZ + 6 : ballPhysics.pos.z > lineZ - 6;
    const ballSpeed = Math.hypot(ballPhysics.vel.x, ballPhysics.vel.z);
    const gathers = ballSpeed < 12 && inBox && p.pos.distanceTo(ballPhysics.pos) < 2.5;
    const dives = ballSpeed >= 12 && Math.abs(ballPhysics.pos.z - lineZ) < 1.2 &&
      Math.abs(ballPhysics.pos.x - p.pos.x) < KEEPER_REACH && ballPhysics.pos.y < 2.7;
    if (gathers || dives) {
      ballPhysics.vel.x = (Math.random() - 0.5) * 18;
      ballPhysics.vel.z = 22 * clearDir; // Punch clear upfield
      ballPhysics.vel.y = 7;
      sounds.playKick(190, 0.2);
      showFeed(p.team === 'away' ? "KEEPER MAKES A SAVING DIVE!" : "GREAT SAVE BY OUR KEEPER!", p.team === 'away' ? "text-red-400" : "text-emerald-300");
    }
    p.model.mesh.rotation.y = clearDir > 0 ? 0 : Math.PI; // Face the pitch
    p.animSpeed = Math.abs(targetGKX - p.pos.x) > 0.1 ? 0.8 : 0;
  };

  // 3. AI Teammates (Blue): forwards make runs, the rest keep a shifting 4-3 shape
  players.forEach(p => {
    if (p.team !== 'home' || p.id === controlled.id) return;
    if (p.isGK) {
      updateKeeper(p, FIELD_LENGTH / 2 - 2.8, -1);
      return;
    }

    let targetX = p.x + shiftX;
    let targetZ = p.z + shiftZ;
    if (p.role === 'LW') {
      targetX = -18 + (controlled.pos.z < 0 ? 6 : 0);
      targetZ = Math.min(controlled.pos.z - 8, -26);
    } else if (p.role === 'RW') {
      targetX = 18 - (controlled.pos.z < 0 ? 6 : 0);
      targetZ = Math.min(controlled.pos.z - 8, -26);
    } else if (p.role === 'ST') {
      targetX = controlled.pos.x * 0.3;
      targetZ = Math.min(controlled.pos.z - 10, -30);
    } else if (p.role === 'CM') {
      targetX = controlled.pos.x * 0.5;
      targetZ = controlled.pos.z + 10; // Supports from behind
    }

    const moved = moveTowards(p, targetX, targetZ, 2.2);
    p.model.mesh.lookAt(ballPhysics.pos.x, p.pos.y, ballPhysics.pos.z);
    p.animSpeed = moved > 0.01 ? 0.7 : 0;
  });

  gameState.tackleCooldown = Math.max(0, gameState.tackleCooldown - delta);

  // 4. AI Red Eagles: the two closest outfielders press, the rest hold a shifting 4-4-2
  const pressers = players
    .filter(p => p.team === 'away' && !p.isGK)
    .sort((a, b) => a.pos.distanceTo(ballPhysics.pos) - b.pos.distanceTo(ballPhysics.pos))
    .slice(0, 2);

  players.forEach(p => {
    if (p.team !== 'away') return;
    if (p.isGK) {
      updateKeeper(p, -FIELD_LENGTH / 2 + 2.8, 1);
      return;
    }

    const distDefToBall = p.pos.distanceTo(ballPhysics.pos);
    if (pressers.includes(p) && distDefToBall < 25) {
      // Press the ball
      const pressDir = new THREE.Vector3().subVectors(ballPhysics.pos, p.pos);
      pressDir.y = 0;
      pressDir.normalize();
      p.pos.x += pressDir.x * p.speed * delta;
      p.pos.z += pressDir.z * p.speed * delta;
      p.model.mesh.rotation.y = Math.atan2(pressDir.x, pressDir.z);
      p.animSpeed = 0.9;

      // Tackle if close; a short team-wide cooldown gives the dribbler a chance to escape
      if (distDefToBall < 1.4 && ballPhysics.pos.y < 1.5 && gameState.tackleCooldown === 0) {
        gameState.tackleCooldown = TACKLE_COOLDOWN;
        // Poke the ball away
        ballPhysics.vel.set((Math.random() - 0.5) * 14, 2, 16);
        sounds.playKick(120, 0.1);
        showFeed("TACKLED BY DEFENDER!", "text-red-400");
      }
    } else {
      // Hold defensive shape, sliding with the ball (never past the halfway line by much)
      const moved = moveTowards(p, p.x + shiftX, Math.min(p.z + shiftZ * 0.6, 8), 1.6);
      p.model.mesh.rotation.y = Math.atan2(ballPhysics.pos.x - p.pos.x, ballPhysics.pos.z - p.pos.z);
      p.animSpeed = moved > 0.01 ? 0.6 : 0;
    }
  });

  // 5. Update Jump Physics and Model Animations for all players
  players.forEach(p => {
    if (p.isJumping) {
      p.jumpY += p.jumpVel * delta;
      p.jumpVel += GRAVITY * delta;
      if (p.jumpY <= 0) {
        p.jumpY = 0;
        p.isJumping = false;
        p.jumpVel = 0;
      }
    }

    // Set model World coordinates
    p.model.mesh.position.set(p.pos.x, p.jumpY, p.pos.z);

    // Active Selection Halo indicator
    const isControlled = (p.team === 'home' && p.id === controlled.id);
    p.model.selectRing.material.opacity = isControlled ? 0.85 : 0.0;
    if (isControlled) {
      p.model.selectRing.rotation.z += 0.04;
    }

    // Animate Limbs (Running Cycle)
    if (p.animSpeed > 0.1) {
      p.model.animTime += delta * 12 * p.animSpeed;
      const legSwing = Math.sin(p.model.animTime) * 0.65;
      const armSwing = Math.cos(p.model.animTime) * 0.55;

      p.model.leftLeg.rotation.x = legSwing;
      p.model.rightLeg.rotation.x = -legSwing;
      p.model.leftArm.rotation.x = -armSwing;
      p.model.rightArm.rotation.x = armSwing;
    } else {
      // Idle pose reset
      p.model.leftLeg.rotation.x *= 0.8;
      p.model.rightLeg.rotation.x *= 0.8;
      p.model.leftArm.rotation.x *= 0.8;
      p.model.rightArm.rotation.x *= 0.8;
    }

    // Jumping pose adjustment
    if (p.isJumping) {
      p.model.leftLeg.rotation.x = -0.4;
      p.model.rightLeg.rotation.x = 0.3;
      p.model.leftArm.rotation.x = 1.2;
      p.model.rightArm.rotation.x = 1.2;
      p.model.head.rotation.x = -0.2; // Tilt head for impact
    } else {
      p.model.head.rotation.x = 0;
    }
  });
}

const radarCanvas = document.getElementById('radar-canvas');
const rCtx = radarCanvas.getContext('2d');

function updateCamera(delta) {
  const controlled = getControlledPlayer();

  // Side-on broadcast camera: sits beyond the +x touchline and pans along the pitch,
  // so the goals are at the left and right of a landscape screen.
  const focusPoint = new THREE.Vector3()
    .copy(controlled.pos)
    .add(ballPhysics.pos)
    .multiplyScalar(0.5);

  const maxPan = FIELD_LENGTH / 2 - CAMERA_PAN_MARGIN;
  const focusZ = THREE.MathUtils.clamp(focusPoint.z, -maxPan, maxPan);
  const focusX = THREE.MathUtils.clamp(focusPoint.x, -FIELD_WIDTH / 2, FIELD_WIDTH / 2);

  const targetCamPos = new THREE.Vector3(
    CAMERA_DISTANCE + focusX * 0.3,
    CAMERA_HEIGHT + ballPhysics.pos.y * 0.3,
    focusZ
  );

  camera.position.lerp(targetCamPos, 0.08);
  cameraLookAt.lerp(new THREE.Vector3(focusX * 0.6, 0, focusZ), 0.08);
  camera.lookAt(cameraLookAt);
}

function updateRadar() {
  const w = radarCanvas.width = radarCanvas.clientWidth * 2;
  const h = radarCanvas.height = radarCanvas.clientHeight * 2;
  const pad = 6;
  // Radar matches the side-on view: world -z is right, world +x is down
  const toX = (z) => ((FIELD_LENGTH / 2 - z) / FIELD_LENGTH) * (w - pad * 2) + pad;
  const toY = (x) => ((x + FIELD_WIDTH / 2) / FIELD_WIDTH) * (h - pad * 2) + pad;
  const sx = (w - pad * 2) / FIELD_LENGTH; // pixels per metre along the pitch
  const sy = (h - pad * 2) / FIELD_WIDTH;

  rCtx.fillStyle = 'rgba(12, 48, 28, 0.85)';
  rCtx.fillRect(0, 0, w, h);

  // Pitch markings
  rCtx.strokeStyle = 'rgba(255,255,255,0.35)';
  rCtx.lineWidth = 1.5;
  rCtx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  rCtx.beginPath();
  rCtx.moveTo(w / 2, pad);
  rCtx.lineTo(w / 2, h - pad);
  rCtx.stroke();
  rCtx.beginPath();
  rCtx.ellipse(w / 2, h / 2, 9.15 * sx, 9.15 * sy, 0, 0, Math.PI * 2);
  rCtx.stroke();
  [1, -1].forEach(end => {
    const lineZ = end * FIELD_LENGTH / 2;
    const boxDepth = 16.5 * sx;
    const boxX = end > 0 ? toX(lineZ) : toX(lineZ) - boxDepth;
    rCtx.strokeRect(boxX, toY(-20.15), boxDepth, 40.3 * sy);
    // Goal mouth
    rCtx.fillStyle = 'rgba(255,255,255,0.8)';
    rCtx.fillRect(toX(lineZ) - (end > 0 ? 3 : 0), toY(-GOAL_WIDTH / 2), 3, GOAL_WIDTH * sy);
  });

  // Players
  const dot = Math.max(3.5, w / 70);
  players.forEach(p => {
    const rx = toX(p.pos.z);
    const ry = toY(p.pos.x);
    const isControlled = p.team === 'home' && p.id === gameState.controlledPlayerIndex;
    rCtx.beginPath();
    rCtx.arc(rx, ry, isControlled ? dot * 1.35 : dot, 0, Math.PI * 2);
    if (p.isGK) {
      rCtx.fillStyle = '#facc15';
    } else if (p.team === 'home') {
      rCtx.fillStyle = isControlled ? '#00ff66' : '#38bdf8';
    } else {
      rCtx.fillStyle = '#ef4444';
    }
    rCtx.fill();
    if (p.isGK || isControlled) {
      rCtx.lineWidth = 2;
      rCtx.strokeStyle = isControlled ? '#ffffff' : (p.team === 'home' ? '#38bdf8' : '#ef4444');
      rCtx.stroke();
    }
  });

  // Ball
  rCtx.beginPath();
  rCtx.arc(toX(ballPhysics.pos.z), toY(ballPhysics.pos.x), dot * 0.75, 0, Math.PI * 2);
  rCtx.fillStyle = '#ffffff';
  rCtx.fill();
  rCtx.lineWidth = 1.5;
  rCtx.strokeStyle = '#000000';
  rCtx.stroke();
}

let lastTimestamp = performance.now();
const portraitTouchQuery = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
let secondCounter = 0;

function updateMatchClock(delta) {
  if (gameState.isPaused) return;

  secondCounter += delta * 1.5; // Slightly accelerated match minutes
  if (secondCounter >= 1.0) {
    secondCounter = 0;
    gameState.matchSeconds++;

    const mins = Math.floor(gameState.matchSeconds / 60);
    const secs = gameState.matchSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    document.getElementById('match-timer').innerText = formatted;

    if (mins >= 45 && mins < 90) {
      document.getElementById('match-half').innerText = '2ND HALF';
    }
  }
}

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const delta = Math.min((now - lastTimestamp) / 1000, 0.1);
  lastTimestamp = now;

  // Phones held in portrait see the rotate overlay, so freeze play until they turn back
  if (!gameState.isPaused && !portraitTouchQuery.matches) {
    updatePlayers(delta);
    updateBall(delta);
    updateMatchClock(delta);
  }

  updateCamera(delta);
  updateRadar();

  renderer.render(scene, camera);
}

// Window Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = verticalFovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Start Animation loop on window load
window.onload = function() {
  lastTimestamp = performance.now();
  requestAnimationFrame(gameLoop);
  showFeed("MATCH STARTED: PASS, CROSS & SCORE!");
};

// Test hook: open with ?debug to drive the game from browser automation
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__game = { gameState, players, ballPhysics, triggerPass, triggerShoot, updatePlayers, updateBall };
}
