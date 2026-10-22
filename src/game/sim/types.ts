import * as THREE from 'three';

export type Team = 'home' | 'away';
export type Role = 'GK' | 'LB' | 'CB' | 'RB' | 'LM' | 'CM' | 'RM' | 'LW' | 'RW' | 'ST';

export type ActionKind = 'kick' | 'tackle' | 'slide' | 'dive' | 'header' | 'throw';

export interface PlayerAction {
  kind: ActionKind;
  t: number;
  duration: number;
  // Kicks and throws: what happens at foot contact
  releaseAt?: number;
  released?: boolean;
  onRelease?: () => void;
  // Slides and dives: direction of travel
  dir?: THREE.Vector3;
  side?: number; // dives: -1 left, +1 right (in the keeper's own frame)
}

export interface Player {
  id: number;
  team: Team;
  num: string;
  name: string;
  role: Role;
  isGK: boolean;
  /** Formation spot when defending at kick-off, in world coordinates */
  base: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Velocity the player is trying to reach this tick (set by input or AI) */
  desired: THREE.Vector3;
  /** Facing angle: direction (sin, 0, cos) */
  facing: number;
  action: PlayerAction | null;
  /** Seconds the player can't act (after a missed slide, a fall, etc.) */
  stunned: number;
  /** Seconds before this player may touch the ball again after kicking it */
  kickGrace: number;
  tackleCooldown: number;
  /** AI: seconds until the next on-ball decision */
  thinkTimer: number;
}

export interface Ball {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Side spin; positive curls the ball to its left */
  spin: number;
  owner: Player | null;
  lastTouch: Player | null;
  inNet: Team | null;
}

export type Phase = 'kickoff' | 'play' | 'goal' | 'restart' | 'halftime' | 'fulltime';

export type RestartKind = 'throwin' | 'corner' | 'goalkick';

export type MatchEvent =
  | { type: 'kick'; player: Player; kind: 'pass' | 'through' | 'shot' | 'clear' | 'header' | 'throw'; power: number }
  | { type: 'goal'; team: Team; scorer: Player | null }
  | { type: 'save'; keeper: Player; caught: boolean }
  | { type: 'post' }
  | { type: 'tackle'; player: Player; won: boolean; slide: boolean }
  | { type: 'whistle'; reason: 'kickoff' | 'halftime' | 'fulltime' | 'out' }
  | { type: 'restart'; kind: RestartKind; team: Team }
  | { type: 'possession'; team: Team | null };

export interface InputState {
  /** World-space movement, length 0..1 */
  move: THREE.Vector3;
  /** Edge-triggered this tick */
  pressA: boolean; // attack: pass,   defend: tackle
  pressB: boolean; // attack: shoot,  defend: (pressure is held)
  pressC: boolean; // attack: through ball / cross, defend: switch player
  /** Held */
  holdB: boolean;
}

export interface TeamStats {
  shots: number;
  onTarget: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  possessionTime: number;
}
