import * as THREE from 'three';
import {
  AIR_DRAG, BALL_RADIUS, BOUNCE, CURL_STRENGTH, GRAVITY, GROUND_DRAG, SPIN_DECAY,
} from '../constants';

export interface BallBody {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
}

/** Advance a free (unowned) ball. Returns true if it bounced hard this step. */
export function integrateBall(b: BallBody, dt: number): boolean {
  const airborne = b.pos.y > BALL_RADIUS + 0.01 || b.vel.y > 0.01;
  if (airborne) {
    b.vel.y += GRAVITY * dt;
    const drag = Math.exp(-AIR_DRAG * dt);
    b.vel.x *= drag;
    b.vel.z *= drag;
    // Side spin bends the flight path without changing its speed
    if (Math.abs(b.spin) > 0.001) {
      const angle = b.spin * CURL_STRENGTH * dt;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const vx = b.vel.x * c - b.vel.z * s;
      const vz = b.vel.x * s + b.vel.z * c;
      b.vel.x = vx;
      b.vel.z = vz;
    }
  } else {
    const roll = Math.exp(-GROUND_DRAG * dt);
    b.vel.x *= roll;
    b.vel.z *= roll;
    if (Math.hypot(b.vel.x, b.vel.z) < 0.15) {
      b.vel.x = 0;
      b.vel.z = 0;
    }
  }
  b.spin *= Math.exp(-SPIN_DECAY * dt);
  b.pos.addScaledVector(b.vel, dt);

  let hardBounce = false;
  if (b.pos.y < BALL_RADIUS) {
    b.pos.y = BALL_RADIUS;
    if (b.vel.y < -1.5) {
      hardBounce = b.vel.y < -4;
      b.vel.y = -b.vel.y * BOUNCE;
      b.vel.x *= 0.88;
      b.vel.z *= 0.88;
      b.spin *= 0.5;
    } else {
      b.vel.y = 0;
    }
  }
  return hardBounce;
}

/**
 * Simulate a ball forward until it crosses the plane z = lineZ.
 * Returns where and when it crosses, or null if it stops or turns back first.
 */
export function predictCrossing(
  pos: THREE.Vector3, vel: THREE.Vector3, spin: number, lineZ: number, maxTime = 4,
): { point: THREE.Vector3; time: number } | null {
  const sim: BallBody = { pos: pos.clone(), vel: vel.clone(), spin };
  const dt = 1 / 120;
  const dir = Math.sign(lineZ - pos.z);
  for (let t = 0; t < maxTime; t += dt) {
    const prevZ = sim.pos.z;
    integrateBall(sim, dt);
    if ((sim.pos.z - lineZ) * dir >= 0) {
      const frac = (lineZ - prevZ) / (sim.pos.z - prevZ || 1);
      const point = sim.pos.clone().addScaledVector(sim.vel, -dt * (1 - frac));
      return { point, time: t + dt * frac };
    }
    if (sim.vel.z * dir <= 0.2 && sim.pos.y <= BALL_RADIUS + 0.01) return null;
  }
  return null;
}

/** Ground pass that reaches `dist` metres away still rolling at about `arrive` m/s */
export function groundPassSpeed(dist: number, arrive = 4): number {
  return dist * GROUND_DRAG + arrive;
}

/**
 * Lofted ball from `from` landing at `to` after `flightTime` seconds,
 * accounting for air drag on the horizontal speed.
 */
export function lobVelocity(from: THREE.Vector3, to: THREE.Vector3, flightTime: number): THREE.Vector3 {
  const flat = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  const dist = flat.length();
  flat.normalize();
  const k = AIR_DRAG;
  const horiz = (dist * k) / (1 - Math.exp(-k * flightTime));
  const vy = (to.y - from.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;
  return new THREE.Vector3(flat.x * horiz, vy, flat.z * horiz);
}

/**
 * Driven shot from `from` at `speed` m/s that reaches `target` (height included).
 * Flight time is estimated from distance and drag, then solved for the lift needed.
 */
export function shotVelocity(from: THREE.Vector3, target: THREE.Vector3, speed: number): THREE.Vector3 {
  const dist = Math.hypot(target.x - from.x, target.z - from.z);
  const k = AIR_DRAG;
  // Solve dist = v(1 - e^{-kT})/k for T
  const ratio = Math.min(0.95, (dist * k) / speed);
  const flightTime = -Math.log(1 - ratio) / k;
  return lobVelocity(from, target, flightTime);
}
