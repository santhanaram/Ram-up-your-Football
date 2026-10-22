import * as THREE from 'three';
import type { InputState } from './sim/types';

const JOY_RADIUS = 46;

/**
 * Joystick, three action buttons and keyboard, turned into world-space input.
 * The broadcast camera looks from +x, so screen right is world -z and screen down is world +x.
 */
export class Controls {
  private keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  private joyPointer: number | null = null;
  private joyCentre = { x: 0, y: 0 };
  private pressed = { A: false, B: false, C: false };
  private held = { A: false, B: false, C: false };
  onFirstGesture: (() => void) | null = null;

  constructor(
    private zone: HTMLElement,
    private thumb: HTMLElement,
    buttons: Record<'A' | 'B' | 'C', HTMLElement>,
  ) {
    window.addEventListener('keydown', (e) => {
      this.gesture();
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'j') this.press('A');
      if (k === 'l' || k === ' ') this.press('B');
      if (k === 'k') this.press('C');
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'j') this.held.A = false;
      if (k === 'l' || k === ' ') this.held.B = false;
      if (k === 'k') this.held.C = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held = { A: false, B: false, C: false };
      this.resetJoy();
    });

    for (const id of ['A', 'B', 'C'] as const) {
      const el = buttons[id];
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.gesture();
        el.setPointerCapture(e.pointerId);
        this.press(id);
      });
      const release = () => { this.held[id] = false; };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.gesture();
      this.joyPointer = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      this.joyCentre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveJoy(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyPointer) this.moveJoy(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joyPointer) this.resetJoy();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private gesture() {
    if (this.onFirstGesture) this.onFirstGesture();
  }

  private press(id: 'A' | 'B' | 'C') {
    this.pressed[id] = true;
    this.held[id] = true;
  }

  private moveJoy(cx: number, cy: number) {
    let dx = cx - this.joyCentre.x;
    let dy = cy - this.joyCentre.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      dx = (dx / d) * JOY_RADIUS;
      dy = (dy / d) * JOY_RADIUS;
    }
    this.thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Small dead zone, then full speed quickly so the player responds like DLS
    const mag = Math.hypot(dx, dy) / JOY_RADIUS;
    const scaled = mag < 0.12 ? 0 : Math.min(1, (mag - 0.12) / 0.6);
    this.joy.x = mag > 0 ? (dx / (mag * JOY_RADIUS)) * scaled : 0;
    this.joy.y = mag > 0 ? (dy / (mag * JOY_RADIUS)) * scaled : 0;
  }

  private resetJoy() {
    this.joyPointer = null;
    this.joy = { x: 0, y: 0 };
    this.thumb.style.transform = 'translate(-50%, -50%)';
  }

  /** Read the input for this frame; button presses are reported once */
  read(): InputState {
    let sx = this.joy.x;
    let sy = this.joy.y;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) sx -= 1;
    if (k.has('arrowright') || k.has('d')) sx += 1;
    if (k.has('arrowup') || k.has('w')) sy -= 1;
    if (k.has('arrowdown') || k.has('s')) sy += 1;
    const move = new THREE.Vector3(sy, 0, -sx);
    if (move.lengthSq() > 1) move.normalize();
    const state: InputState = {
      move,
      pressA: this.pressed.A,
      pressB: this.pressed.B,
      pressC: this.pressed.C,
      holdB: this.held.B,
    };
    this.pressed = { A: false, B: false, C: false };
    return state;
  }

  clear() {
    this.pressed = { A: false, B: false, C: false };
  }
}
