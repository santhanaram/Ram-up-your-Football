import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '../constants';
import type { Match } from '../sim/match';

const HORIZONTAL_FOV = 50;

function verticalFov(aspect: number) {
  const h = THREE.MathUtils.degToRad(HORIZONTAL_FOV);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}

/**
 * Elevated touchline camera that follows the ball like a TV broadcast: it leads the
 * play in the direction the ball is travelling and moves in close for goals.
 */
export class BroadcastCamera {
  readonly camera: THREE.PerspectiveCamera;
  private focus = new THREE.Vector3();
  private zoom = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(verticalFov(aspect), aspect, 0.5, 600);
    this.camera.position.set(34, 22, 0);
    this.camera.lookAt(0, 0, 0);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    // Narrow screens (portrait previews, tablets) keep the same width of pitch in view
    this.camera.fov = Math.min(75, verticalFov(aspect));
    this.camera.updateProjectionMatrix();
  }

  update(m: Match, dt: number) {
    const b = m.ball;
    const target = new THREE.Vector3();
    if (b.owner) {
      const f = new THREE.Vector3(Math.sin(b.owner.facing), 0, Math.cos(b.owner.facing));
      target.copy(b.owner.pos).addScaledVector(f, 4);
    } else {
      target.set(b.pos.x, 0, b.pos.z).addScaledVector(new THREE.Vector3(b.vel.x, 0, b.vel.z), 0.3);
    }
    target.x = THREE.MathUtils.clamp(target.x, -HALF_WIDTH + 8, HALF_WIDTH - 4);
    target.z = THREE.MathUtils.clamp(target.z, -HALF_LENGTH + 13, HALF_LENGTH - 13);

    const goalMoment = m.phase === 'goal' ? 1 : 0;
    this.zoom += (goalMoment - this.zoom) * (1 - Math.exp(-1.5 * dt));
    this.focus.lerp(target, 1 - Math.exp(-(2.6 + this.zoom * 2) * dt));

    const dist = 33 - this.zoom * 11;
    const height = 21 - this.zoom * 7;
    const desired = new THREE.Vector3(this.focus.x * 0.45 + dist, height, this.focus.z);
    this.camera.position.lerp(desired, 1 - Math.exp(-4 * dt));
    this.camera.lookAt(this.focus.x - 2, 0, this.focus.z);
  }
}
