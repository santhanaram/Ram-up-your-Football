import * as THREE from 'three';
import { PLAYER_SCALE } from '../constants';
import type { Player } from '../sim/types';

export const KIT = {
  home: { shirt: 0x1d4ed8, shorts: 0xffffff, socks: 0x1d4ed8, gk: 0x16a34a },
  away: { shirt: 0xdc2626, shorts: 0x111111, socks: 0xdc2626, gk: 0xeab308 },
};

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIR = [0x241711, 0x3b2a1e, 0x0f0f0f, 0x6b4423, 0xd6b370];

const shadowGeo = new THREE.CircleGeometry(0.55, 16);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
const markerGeo = new THREE.ConeGeometry(0.32, 0.55, 4);
const markerMat = new THREE.MeshBasicMaterial({ color: 0x22ff88 });

export interface PlayerView {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  ring: THREE.Mesh;
  marker: THREE.Mesh;
  runPhase: number;
  idlePhase: number;
}

function numberTexture(num: string, colour: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = colour;
  ctx.font = 'bold 92px Teko, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPlayerView(p: Player): PlayerView {
  const kit = KIT[p.team];
  const shirtColour = p.isGK ? kit.gk : kit.shirt;
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[p.id % SKIN.length] });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColour, roughness: 0.6 });
  const shorts = new THREE.MeshStandardMaterial({ color: p.isGK ? 0x1f2937 : kit.shorts, roughness: 0.7 });
  const socks = new THREE.MeshStandardMaterial({ color: p.isGK ? shirtColour : kit.socks, roughness: 0.7 });
  const boots = new THREE.MeshStandardMaterial({ color: p.id % 3 === 0 ? 0xf97316 : 0x111111, roughness: 0.5 });
  const gloves = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 1.05;
  body.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.88, 0.42), shirt);
  torso.position.y = 0.45;
  torso.castShadow = true;
  hips.add(torso);
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.44), shirt);
  shoulders.position.y = 0.82;
  hips.add(shoulders);

  // Number on the back (the model faces local -z, so the back is +z)
  const light = p.team === 'home' || p.isGK ? '#ffffff' : '#ffffff';
  const num = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshBasicMaterial({ map: numberTexture(p.num, light), transparent: true }),
  );
  num.position.set(0, 0.48, 0.215);
  hips.add(num);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18), skin);
  neck.position.y = 0.97;
  hips.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 12), skin);
  head.position.y = 1.24;
  head.castShadow = true;
  hips.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1),
    new THREE.MeshLambertMaterial({ color: HAIR[(p.id * 7) % HAIR.length] }),
  );
  hair.position.y = 1.27;
  hips.add(hair);

  const leg = () => {
    const g = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.46, 8), shorts);
    thigh.position.y = -0.2;
    g.add(thigh);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.46, 8), socks);
    shin.position.y = -0.66;
    shin.castShadow = true;
    g.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.38), boots);
    boot.position.set(0, -0.93, -0.07);
    g.add(boot);
    return g;
  };
  const leftLeg = leg();
  leftLeg.position.set(-0.2, 0, 0);
  const rightLeg = leg();
  rightLeg.position.set(0.2, 0, 0);
  hips.add(leftLeg, rightLeg);

  const arm = () => {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.4, 8), shirt);
    upper.position.y = -0.18;
    g.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.38, 8), p.isGK ? shirt : skin);
    lower.position.y = -0.55;
    g.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(p.isGK ? 0.1 : 0.07, 8, 6), p.isGK ? gloves : skin);
    hand.position.y = -0.77;
    g.add(hand);
    return g;
  };
  const leftArm = arm();
  leftArm.position.set(-0.47, 0.78, 0);
  const rightArm = arm();
  rightArm.position.set(0.47, 0.78, 0);
  hips.add(leftArm, rightArm);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.95, 32),
    new THREE.MeshBasicMaterial({ color: 0x22ff88, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);

  // DLS-style arrow over the head of the player you control
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.rotation.x = Math.PI;
  marker.visible = false;
  root.add(marker);

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  root.add(shadow);

  root.scale.setScalar(PLAYER_SCALE);
  return {
    root, body, hips, leftLeg, rightLeg, leftArm, rightArm, ring, marker,
    runPhase: Math.random() * 10, idlePhase: Math.random() * 10,
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);

export interface PoseContext {
  controlled: boolean;
  receiver: boolean;
  celebrate: 'win' | 'lose' | null;
  time: number;
}

/** Sync a view with its simulated player and animate the pose */
export function updatePlayerView(v: PlayerView, p: Player, dt: number, ctx: PoseContext) {
  v.root.position.set(p.pos.x, 0, p.pos.z);
  v.root.rotation.y = p.facing + Math.PI;

  // Reset the pose each frame, then layer the current movement on top
  v.body.position.set(0, 0, 0);
  v.body.rotation.set(0, 0, 0);
  v.hips.position.y = 1.05;
  v.hips.rotation.set(0, 0, 0);
  v.leftLeg.rotation.set(0, 0, 0);
  v.rightLeg.rotation.set(0, 0, 0);
  v.leftArm.rotation.set(0, 0, 0.08);
  v.rightArm.rotation.set(0, 0, -0.08);

  const speed = Math.hypot(p.vel.x, p.vel.z);
  const a = p.action;

  if (ctx.celebrate && !a) {
    v.idlePhase += dt;
    if (ctx.celebrate === 'win') {
      const jump = Math.max(0, Math.sin(v.idlePhase * 9));
      v.body.position.y = jump * 0.35;
      v.leftArm.rotation.set(Math.PI * 0.95, 0, -0.35);
      v.rightArm.rotation.set(Math.PI * 0.95, 0, 0.35);
      v.leftLeg.rotation.x = jump * 0.4;
      v.rightLeg.rotation.x = -jump * 0.3;
    } else {
      // Hands on head
      v.leftArm.rotation.set(Math.PI * 0.85, 0, 0.9);
      v.rightArm.rotation.set(Math.PI * 0.85, 0, -0.9);
      v.hips.rotation.x = -0.15;
    }
  } else if (a && (a.kind === 'kick' || a.kind === 'throw')) {
    const rel = a.releaseAt ?? 0.14;
    if (a.kind === 'throw') {
      const back = a.t < rel ? ease(a.t / rel) : 1 - ease(Math.min(1, (a.t - rel) / 0.15));
      const angle = Math.PI + 0.7 * back - (a.t >= rel ? 0.9 * (1 - back) : 0);
      v.leftArm.rotation.set(angle, 0, 0.2);
      v.rightArm.rotation.set(angle, 0, -0.2);
      v.hips.rotation.x = 0.2 * back;
    } else {
      // Back-lift, strike, follow-through on the right foot
      let swing: number;
      if (a.t < rel) swing = -1.2 * ease(a.t / rel);
      else {
        const f = Math.min(1, (a.t - rel) / 0.12);
        swing = -1.2 + 2.7 * ease(f) - Math.max(0, (a.t - rel - 0.12) / (a.duration - rel)) * 1.2;
      }
      v.rightLeg.rotation.x = swing;
      v.leftLeg.rotation.x = -0.15;
      v.leftArm.rotation.set(0.5, 0, 0.6);
      v.rightArm.rotation.set(-0.4, 0, -0.5);
      v.hips.rotation.x = a.t < rel ? 0.12 : -0.1;
      v.hips.position.y = 1.0;
    }
  } else if (a && a.kind === 'slide') {
    const e = ease(Math.min(1, a.t / 0.15));
    v.hips.position.y = 1.05 - 0.75 * e;
    v.hips.rotation.x = 1.1 * e; // lean back
    v.rightLeg.rotation.x = 1.6 * e;
    v.leftLeg.rotation.x = 0.7 * e;
    v.leftArm.rotation.set(-0.6 * e, 0, 0.9 * e);
    v.rightArm.rotation.set(-0.3 * e, 0, -0.6 * e);
  } else if (a && a.kind === 'dive') {
    // Full-length dive towards the side of the shot
    const localX = Math.cos(v.root.rotation.y) * (a.dir?.x ?? 0) - Math.sin(v.root.rotation.y) * (a.dir?.z ?? 0);
    const sgn = Math.sign(localX) || a.side || 1;
    const e = ease(Math.min(1, a.t / 0.3));
    const landing = a.t > 0.55 ? ease(Math.min(1, (a.t - 0.55) / 0.3)) : 0;
    v.body.rotation.z = -sgn * 1.35 * e;
    v.body.position.y = Math.sin(Math.min(1, a.t / 0.55) * Math.PI) * 0.7 + 0.25 * e * (1 - landing);
    v.leftArm.rotation.set(Math.PI, 0, 0.2);
    v.rightArm.rotation.set(Math.PI, 0, -0.2);
    v.leftLeg.rotation.z = -0.2 * sgn;
  } else if (a && a.kind === 'tackle') {
    const e = Math.sin(Math.min(1, a.t / a.duration) * Math.PI);
    v.rightLeg.rotation.x = 1.3 * e;
    v.hips.position.y = 1.05 - 0.25 * e;
    v.hips.rotation.x = 0.3 * e;
    v.leftArm.rotation.set(-0.5 * e, 0, 0.7 * e);
  } else if (a && a.kind === 'header') {
    const f = Math.min(1, a.t / a.duration);
    v.body.position.y = Math.sin(f * Math.PI) * 0.75;
    v.hips.rotation.x = f < 0.4 ? 0.35 * (f / 0.4) : -0.45 * Math.sin(((f - 0.4) / 0.6) * Math.PI);
    v.leftArm.rotation.set(0.6, 0, 0.8);
    v.rightArm.rotation.set(0.6, 0, -0.8);
    v.leftLeg.rotation.x = -0.4;
    v.rightLeg.rotation.x = 0.3;
  } else if (speed > 0.4) {
    // Run cycle: stride length and arm swing grow with speed
    const k = Math.min(speed / 7.5, 1.2);
    v.runPhase += dt * (4 + speed * 1.15);
    const s = Math.sin(v.runPhase);
    v.leftLeg.rotation.x = s * 0.95 * k;
    v.rightLeg.rotation.x = -s * 0.95 * k;
    v.leftArm.rotation.x = -s * 0.8 * k;
    v.rightArm.rotation.x = s * 0.8 * k;
    v.body.position.y = Math.abs(Math.cos(v.runPhase)) * 0.12 * k;
    v.hips.rotation.x = -0.18 * k; // lean into the run
  } else {
    // Idle: slight breathing sway, keepers crouch ready
    v.idlePhase += dt;
    v.hips.position.y = 1.05 + Math.sin(v.idlePhase * 2.2) * 0.015;
    if (p.isGK) {
      v.hips.position.y = 0.92;
      v.hips.rotation.x = -0.25;
      v.leftLeg.rotation.set(0.25, 0, 0.18);
      v.rightLeg.rotation.set(0.25, 0, -0.18);
      v.leftArm.rotation.set(-0.7, 0, 0.5);
      v.rightArm.rotation.set(-0.7, 0, -0.5);
    }
  }
  if (p.stunned > 0 && !a) v.hips.rotation.x -= 0.2;

  const ringMat = v.ring.material as THREE.MeshBasicMaterial;
  v.marker.visible = ctx.controlled;
  if (ctx.controlled) {
    v.marker.position.y = 3.25 + Math.sin(ctx.time * 6) * 0.12 + v.body.position.y;
    v.marker.rotation.y = ctx.time * 2;
    ringMat.color.setHex(0x22ff88);
    ringMat.opacity = 0.85;
  } else if (ctx.receiver) {
    ringMat.color.setHex(0x38bdf8);
    ringMat.opacity = 0.6 + Math.sin(ctx.time * 10) * 0.2;
  } else {
    ringMat.opacity = 0;
  }
}
