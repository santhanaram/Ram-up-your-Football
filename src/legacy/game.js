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
  lastShooter: null,
  isHeaderActive: false
};

const canvas = document.getElementById('game-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x76a9e8); // Sky blue
scene.fog = new THREE.FogExp2(0x76a9e8, 0.007);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 18, 28);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting setup: Bright stadium floodlight style
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff7e6, 0.85);
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
const hemiLight = new THREE.HemisphereLight(0x9bd8ff, 0x1f5c22, 0.35);
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

  return new THREE.CanvasTexture(bCanvas);
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

// Blue Team (Attacking towards negative Z: Opponent's goal at z = -55)
const homeRoster = [
  { id: 0, num: '10', name: 'Striker', role: 'ST', x: 0, z: 12, isUser: true },
  { id: 1, num: '7',  name: 'Left Winger', role: 'LW', x: -18, z: 2, isUser: false },
  { id: 2, num: '11', name: 'Right Winger', role: 'RW', x: 18, z: 2, isUser: false },
  { id: 3, num: '8',  name: 'Playmaker', role: 'CM', x: -2, z: 24, isUser: false }
];

// Red Team (Defenders & Goalkeeper protecting z = -55)
const awayRoster = [
  { id: 10, num: '1',  name: 'Keeper', role: 'GK', x: 0, z: -52, isGK: true },
  { id: 11, num: '4',  name: 'Centerback', role: 'CB', x: -7, z: -38 },
  { id: 12, num: '5',  name: 'Centerback', role: 'CB', x: 7, z: -38 },
  { id: 13, num: '2',  name: 'Right Back', role: 'RB', x: 19, z: -32 },
  { id: 14, num: '3',  name: 'Left Back', role: 'LB', x: -19, z: -32 }
];

homeRoster.forEach((data, idx) => {
  const model = createPlayerModel(BLUE_COLOR, data.num);
  players.push({
    ...data,
    team: 'home',
    model: model,
    pos: new THREE.Vector3(data.x, 0, data.z),
    vel: new THREE.Vector3(0, 0, 0),
    speed: 13.5,
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
function triggerPass() {
  const player = getControlledPlayer();
  const distToBall = player.pos.distanceTo(ballPhysics.pos);
  if (distToBall > 3.0 && ballPhysics.pos.y > 1.8) {
    showFeed("TOO FAR FROM BALL", "text-neutral-400");
    return;
  }

  sounds.playPass();

  // Find best open teammate ahead
  let bestMate = null;
  let minScore = Infinity;

  players.forEach((other) => {
    if (other.team === 'home' && other.id !== player.id) {
      // Score based on distance & forward attacking position
      const d = player.pos.distanceTo(other.pos);
      const forwardBonus = (other.pos.z < player.pos.z) ? -15 : 10;
      const passScore = d + forwardBonus;
      if (passScore < minScore) {
        minScore = passScore;
        bestMate = other;
      }
    }
  });

  if (bestMate) {
    const passDir = new THREE.Vector3().subVectors(bestMate.pos, ballPhysics.pos);
    passDir.y = 0;
    const dist = passDir.length();
    passDir.normalize();

    // Give the pass realistic speed to meet the teammate
    const speed = Math.min(Math.max(dist * 1.6, 18), 28);
    ballPhysics.vel.copy(passDir.multiplyScalar(speed));
    ballPhysics.vel.y = 0.5; // Stays close to turf
    ballPhysics.carrier = null;
    gameState.lastShooter = player;

    // Switch player control to the receiver
    gameState.controlledPlayerIndex = bestMate.id;
    showFeed(`ACCURATE PASS TO ${bestMate.name}`);
  } else {
    // Default pass forward
    ballPhysics.vel.set(0, 0.4, -22);
    showFeed("FORWARD PASS");
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
    gameState.lastShooter = player;

    showFeed("POWERFUL DIVING HEADER!", "text-purple-300");
  } else {
    showFeed("AERIAL JUMP");
  }
}

// 4. POWER DRIVEN SHOT / VOLLEY LOGIC (L)
function triggerShoot() {
  const player = getControlledPlayer();
  const distToBall = player.pos.distanceTo(ballPhysics.pos);
  if (distToBall > 3.4) {
    showFeed("GET CLOSER TO STRIKE", "text-neutral-400");
    return;
  }

  sounds.playKick(160, 0.25);

  const aimCornerX = player.pos.x > 0 ? -4.2 : 4.2;
  const shotTarget = new THREE.Vector3(aimCornerX + (Math.random() - 0.5) * 1.5, 1.8 + Math.random() * 1.6, -55);
  const shotDir = new THREE.Vector3().subVectors(shotTarget, ballPhysics.pos).normalize();
  
  const isVolley = ballPhysics.pos.y > 0.8;
  const shotSpeed = isVolley ? 36.0 : 33.0;

  ballPhysics.vel.copy(shotDir.multiplyScalar(shotSpeed));
  ballPhysics.vel.y = Math.max(shotDir.y * shotSpeed, 3.2);
  ballPhysics.carrier = null;
  gameState.lastShooter = player;

  if (isVolley) {
    showFeed("ROCKET THUNDER VOLLEY!", "text-rose-400");
  } else {
    showFeed("FEROCIOUS LONG-RANGE SHOT!", "text-rose-400");
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

    // Ground rolling resistance
    ballPhysics.vel.x *= 0.965;
    ballPhysics.vel.z *= 0.965;
  } else {
    // Air resistance
    ballPhysics.vel.x *= 0.994;
    ballPhysics.vel.z *= 0.994;
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
  const controlled = getControlledPlayer();

  // 1. Process User Movement on Active Striker
  let moveDir = new THREE.Vector3(0, 0, 0);

  // Combine Keyboard WASD / Arrows
  if (input.keys['w'] || input.keys['arrowup']) moveDir.z -= 1;
  if (input.keys['s'] || input.keys['arrowdown']) moveDir.z += 1;
  if (input.keys['a'] || input.keys['arrowleft']) moveDir.x -= 1;
  if (input.keys['d'] || input.keys['arrowright']) moveDir.x += 1;

  // Add touch virtual joystick contribution
  if (Math.abs(input.moveX) > 0.05 || Math.abs(input.moveZ) > 0.05) {
    moveDir.x = input.moveX;
    moveDir.z = input.moveZ;
  }

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
  if (distToBall < 1.7 && ballPhysics.pos.y < 1.2 && !controlled.isJumping) {
    // Player controls the dribble
    const forwardVec = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), controlled.model.mesh.rotation.y);
    const dribblePos = controlled.pos.clone().add(forwardVec.multiplyScalar(1.2));
    
    // Smoothly drag ball
    ballPhysics.pos.x += (dribblePos.x - ballPhysics.pos.x) * 0.25;
    ballPhysics.pos.z += (dribblePos.z - ballPhysics.pos.z) * 0.25;
    ballPhysics.vel.set(0, 0, 0);
  }

  // 3. Process AI Teammates (Blue)
  players.forEach(p => {
    if (p.team === 'home' && p.id !== controlled.id) {
      // Dynamic Attacking Runs towards opposing penalty box
      let targetZ = -30;
      let targetX = p.x;

      // Wingers spread wide and make diagonal inward runs
      if (p.role === 'LW') {
        targetX = -18 + (controlled.pos.z < 0 ? 6 : 0);
        targetZ = Math.min(controlled.pos.z - 8, -26);
      } else if (p.role === 'RW') {
        targetX = 18 - (controlled.pos.z < 0 ? 6 : 0);
        targetZ = Math.min(controlled.pos.z - 8, -26);
      } else if (p.role === 'CM') {
        targetX = controlled.pos.x * 0.5;
        targetZ = controlled.pos.z + 10; // Supports from behind
      }

      // Move smoothly toward tactical attacking target
      const stepX = (targetX - p.pos.x) * 2.2 * delta;
      const stepZ = (targetZ - p.pos.z) * 2.2 * delta;
      p.pos.x += stepX;
      p.pos.z += stepZ;

      // Face ball
      p.model.mesh.lookAt(ballPhysics.pos.x, p.pos.y, ballPhysics.pos.z);
      p.animSpeed = Math.hypot(stepX, stepZ) > 0.01 ? 0.7 : 0;
    }
  });

  // 4. Process AI Defenders & Goalkeeper (Red)
  players.forEach(p => {
    if (p.team === 'away') {
      if (p.isGK) {
        // GOALKEEPER AI: Tracks the ball laterally across the 6-yard box
        const targetGKX = Math.max(-GOAL_WIDTH / 2.3, Math.min(GOAL_WIDTH / 2.3, ballPhysics.pos.x * 0.65));
        p.pos.x += (targetGKX - p.pos.x) * 4.5 * delta;
        p.pos.z = -52.2; // Stay on the line

        // Goalkeeper dive / catch if ball comes near
        const dGK = p.pos.distanceTo(ballPhysics.pos);
        if (dGK < 2.5 && ballPhysics.pos.z < -46) {
          // Block or parry the ball away!
          ballPhysics.vel.x = (Math.random() - 0.5) * 18;
          ballPhysics.vel.z = 22; // Kick clear upfield
          ballPhysics.vel.y = 7;
          sounds.playKick(190, 0.2);
          showFeed("KEEPER MAKES A SAVING DIVE!", "text-red-400");
        }
        p.model.mesh.rotation.y = 0; // Face forward
        p.animSpeed = Math.abs(targetGKX - p.pos.x) > 0.1 ? 0.8 : 0;
      } else {
        // DEFENDERS AI: Pressure the ball carrier or track back
        const distDefToBall = p.pos.distanceTo(ballPhysics.pos);
        
        if (distDefToBall < 18) {
          // Press the ball
          const pressDir = new THREE.Vector3().subVectors(ballPhysics.pos, p.pos).normalize();
          p.pos.x += pressDir.x * p.speed * delta;
          p.pos.z += pressDir.z * p.speed * delta;
          p.model.mesh.rotation.y = Math.atan2(pressDir.x, pressDir.z);
          p.animSpeed = 0.9;

          // Tackle if close
          if (distDefToBall < 1.4 && ballPhysics.carrier !== p) {
            // Poke the ball away
            ballPhysics.vel.set((Math.random() - 0.5) * 14, 2, 16);
            sounds.playKick(120, 0.1);
            showFeed("TACKLED BY DEFENDER!", "text-red-400");
          }
        } else {
          // Hold defensive shape
          const homeZ = p.z;
          p.pos.z += (homeZ - p.pos.z) * 1.5 * delta;
          p.model.mesh.rotation.y = Math.PI; // Face field
          p.animSpeed = 0;
        }
      }
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

  // Dynamic broadcast perspective: Tracks player and ball midpoint
  const focusPoint = new THREE.Vector3()
    .copy(controlled.pos)
    .add(ballPhysics.pos)
    .multiplyScalar(0.5);

  const targetCamPos = new THREE.Vector3(
    focusPoint.x * 0.35,
    Math.max(16, 17 + ballPhysics.pos.y * 0.5),
    focusPoint.z + 24
  );

  camera.position.lerp(targetCamPos, 0.08);
  
  const camLookAt = new THREE.Vector3(focusPoint.x * 0.5, 2.0, focusPoint.z - 8);
  camera.lookAt(camLookAt);
}

function updateRadar() {
  const w = radarCanvas.width = radarCanvas.clientWidth * 2;
  const h = radarCanvas.height = radarCanvas.clientHeight * 2;

  // Clear radar
  rCtx.fillStyle = '#0f2b1d';
  rCtx.fillRect(0, 0, w, h);

  // Pitch lines on radar
  rCtx.strokeStyle = 'rgba(255,255,255,0.2)';
  rCtx.lineWidth = 2;
  rCtx.strokeRect(4, 4, w - 8, h - 8);
  // Center line
  rCtx.beginPath();
  rCtx.moveTo(4, h / 2);
  rCtx.lineTo(w - 4, h / 2);
  rCtx.stroke();

  // Draw Players
  players.forEach(p => {
    // Map pitch coords [-FIELD_WIDTH/2, FIELD_WIDTH/2] and [-FIELD_LENGTH/2, FIELD_LENGTH/2] to radar
    const rx = ((p.pos.x + FIELD_WIDTH / 2) / FIELD_WIDTH) * (w - 16) + 8;
    const ry = ((p.pos.z + FIELD_LENGTH / 2) / FIELD_LENGTH) * (h - 16) + 8;

    rCtx.beginPath();
    rCtx.arc(rx, ry, p.team === 'home' ? 5 : 4, 0, Math.PI * 2);
    if (p.team === 'home') {
      rCtx.fillStyle = (p.id === gameState.controlledPlayerIndex) ? '#00ff66' : '#38bdf8';
    } else {
      rCtx.fillStyle = p.isGK ? '#facc15' : '#ef4444';
    }
    rCtx.fill();
  });

  // Draw Ball on Radar
  const bx = ((ballPhysics.pos.x + FIELD_WIDTH / 2) / FIELD_WIDTH) * (w - 16) + 8;
  const by = ((ballPhysics.pos.z + FIELD_LENGTH / 2) / FIELD_LENGTH) * (h - 16) + 8;
  rCtx.beginPath();
  rCtx.arc(bx, by, 3.5, 0, Math.PI * 2);
  rCtx.fillStyle = '#ffffff';
  rCtx.fill();
}

let lastTimestamp = performance.now();
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

  if (!gameState.isPaused) {
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
