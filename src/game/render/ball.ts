import * as THREE from 'three';
import { BALL_RADIUS } from '../constants';
import type { Ball } from '../sim/types';

// Drawn a little larger than life so it reads on a phone screen
const VISUAL_RADIUS = BALL_RADIUS * 1.5;
const TRAIL_POINTS = 22;

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#16161a';
  const spots: [number, number, number][] = [
    [64, 64, 26], [192, 64, 26], [320, 64, 26], [448, 64, 26],
    [0, 180, 24], [128, 180, 26], [256, 180, 26], [384, 180, 26], [512, 180, 24],
  ];
  for (const [x, y, r] of spots) {
    ctx.beginPath();
    for (let a = 0; a < 5; a++) {
      const ang = (a * 2 * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class BallView {
  readonly mesh: THREE.Mesh;
  private shadow: THREE.Mesh;
  private trail: THREE.Mesh;
  private trailPts: { p: THREE.Vector3; a: number }[] = [];
  private trailPos: Float32Array;
  private trailCol: Float32Array;
  private prev = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(VISUAL_RADIUS, 24, 18),
      new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35, metalness: 0.05 }),
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(VISUAL_RADIUS * 1.1, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.025;
    scene.add(this.shadow);

    // Ribbon trail that appears behind fast balls: two vertices per sample
    const geo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(TRAIL_POINTS * 2 * 3);
    this.trailCol = new Float32Array(TRAIL_POINTS * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
  }

  update(b: Ball, dt: number, camera: THREE.Camera, showTrail: boolean) {
    const y = b.pos.y - BALL_RADIUS + VISUAL_RADIUS;
    this.mesh.position.set(b.pos.x, y, b.pos.z);

    // Roll with the ground speed; add a little sidespin rotation in the air
    const moved = new THREE.Vector3().subVectors(this.mesh.position, this.prev);
    const dist = Math.hypot(moved.x, moved.z);
    if (dist > 1e-4 && dist < 5) {
      const axis = new THREE.Vector3(moved.z, 0, -moved.x).normalize();
      this.mesh.rotateOnWorldAxis(axis, dist / VISUAL_RADIUS);
    }
    if (Math.abs(b.spin) > 0.02) this.mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), b.spin * 12 * dt);
    this.prev.copy(this.mesh.position);

    const h = Math.max(0, b.pos.y - BALL_RADIUS);
    this.shadow.position.set(b.pos.x + h * 0.25, 0.025, b.pos.z - h * 0.15);
    this.shadow.scale.setScalar(1 + h * 0.12);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.45 / (1 + h * 0.4);

    // Trail samples, each remembering how fast the ball was going when it was taken
    const speed = b.owner ? 0 : b.vel.length();
    const strength = showTrail ? THREE.MathUtils.clamp((speed - 11) / 14, 0, 1) : 0;
    const lastSample = this.trailPts[0];
    if (lastSample && lastSample.p.distanceTo(this.mesh.position) > 3) this.trailPts.length = 0; // teleported
    if (dt > 0 || !lastSample) {
      this.trailPts.unshift({ p: this.mesh.position.clone(), a: strength });
      if (this.trailPts.length > TRAIL_POINTS) this.trailPts.pop();
    }
    const camPos = camera.position;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const sample = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      const p = sample.p;
      const q = this.trailPts[Math.min(i + 1, this.trailPts.length - 1)].p;
      const dir = new THREE.Vector3().subVectors(p, q);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      const toCam = new THREE.Vector3().subVectors(camPos, p);
      const side = new THREE.Vector3().crossVectors(dir, toCam).normalize();
      const fade = 1 - i / (TRAIL_POINTS - 1);
      const w = VISUAL_RADIUS * 0.7 * fade;
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3;
        const sign = s === 0 ? 1 : -1;
        this.trailPos[k] = p.x + side.x * w * sign;
        this.trailPos[k + 1] = p.y + side.y * w * sign;
        this.trailPos[k + 2] = p.z + side.z * w * sign;
        const c = (i * 2 + s) * 4;
        this.trailCol[c] = 1;
        this.trailCol[c + 1] = 0.95;
        this.trailCol[c + 2] = 0.75;
        this.trailCol[c + 3] = sample.a * fade * 0.5;
      }
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
  }
}
