import * as THREE from 'three';
import {
  BALL_RADIUS, CONTROL_RADIUS, CURL_STRENGTH, DRIBBLE_SPEED, GAME_SECONDS_PER_HALF, GOAL_DEPTH, GOAL_HEIGHT,
  GOAL_WIDTH, HALF_LENGTH, HALF_REAL_SECONDS, HALF_WIDTH, JOG_SPEED, KICK_DURATION, KICK_RELEASE,
  PENALTY_DEPTH, PENALTY_WIDTH, RUN_SPEED, SPRINT_SPEED, ACCELERATION,
} from '../constants';
import { groundPassSpeed, integrateBall, lobVelocity, predictCrossing, shotVelocity } from './physics';
import { AWAY_ROSTER, HOME_ROSTER } from './rosters';
import type {
  Ball, InputState, MatchEvent, Phase, Player, RestartKind, Team, TeamStats,
} from './types';

const tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Direction along z that a team attacks: home attacks -z, away attacks +z */
export const attackDir = (team: Team): number => (team === 'home' ? -1 : 1);
/** z of the goal a team defends */
export const ownGoalZ = (team: Team): number => -attackDir(team) * HALF_LENGTH;
export const other = (team: Team): Team => (team === 'home' ? 'away' : 'home');

const facingVec = (p: Player, out = new THREE.Vector3()) => out.set(Math.sin(p.facing), 0, Math.cos(p.facing));
const flatDist = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface ShotPlan {
  keeper: Player;
  shooter: Player;
  save: boolean;
  catch: boolean;
  cross: THREE.Vector3;
  timeLeft: number;
  diveStarted: boolean;
}

interface Restart {
  kind: RestartKind | 'kickoff';
  team: Team;
  spot: THREE.Vector3;
  taker: Player;
}

const emptyStats = (): TeamStats => ({
  shots: 0, onTarget: 0, passes: 0, passesCompleted: 0, tackles: 0, possessionTime: 0,
});

export class Match {
  players: Player[] = [];
  ball: Ball;
  phase: Phase = 'kickoff';
  phaseTimer = 0;
  half: 1 | 2 = 1;
  /** Elapsed game seconds (0 – 5400) */
  clock = 0;
  score: Record<Team, number> = { home: 0, away: 0 };
  stats: Record<Team, TeamStats> = { home: emptyStats(), away: emptyStats() };
  events: MatchEvent[] = [];

  /** Id of the Blue Lion the user controls */
  controlledId = 0;
  /** Intended receiver of the user's last pass (they run onto it automatically) */
  receiverId: number | null = null;
  receiveAssist = 0;
  switchCooldown = 0;
  lastScorer: Player | null = null;
  firstHalfKickoff: Team = 'home';

  private restart: Restart | null = null;
  /** The restart taker must pass before anything else */
  private holdingRestart: Player | null = null;
  private shotPlan: ShotPlan | null = null;
  private pendingPass: { from: Player; to: Player | null; team: Team } | null = null;
  private keeperHold = 0;
  /** Seconds the user has stood on a set piece or keeper's ball without acting */
  private userHold = 0;

  constructor() {
    let id = 0;
    for (const [team, roster] of [['home', HOME_ROSTER], ['away', AWAY_ROSTER]] as const) {
      for (const r of roster) {
        const base = new THREE.Vector3(r.x, 0, r.z);
        this.players.push({
          id: id++, team, num: r.num, name: r.name, role: r.role, isGK: r.role === 'GK',
          base, pos: base.clone(), vel: new THREE.Vector3(), desired: new THREE.Vector3(),
          facing: team === 'home' ? Math.PI : 0, action: null, stunned: 0, kickGrace: 0,
          tackleCooldown: 0, thinkTimer: 0,
        });
      }
    }
    this.ball = {
      pos: new THREE.Vector3(0, BALL_RADIUS, 0), vel: new THREE.Vector3(), spin: 0,
      owner: null, lastTouch: null, inNet: null,
    };
    this.setupKickoff('home');
  }

  // ---------------------------------------------------------------- queries

  get controlled(): Player {
    return this.players[this.controlledId];
  }

  teamPlayers(team: Team): Player[] {
    return this.players.filter((p) => p.team === team);
  }

  keeper(team: Team): Player {
    return this.players.find((p) => p.team === team && p.isGK)!;
  }

  /** Team considered to have the ball: the owner's, or the last to touch a loose ball */
  possessionTeam(): Team | null {
    if (this.ball.owner) return this.ball.owner.team;
    if (this.pendingPass) return this.pendingPass.team;
    return this.ball.lastTouch ? this.ball.lastTouch.team : null;
  }

  /** Whether the user's controls are in attacking mode (DLS-style contextual buttons) */
  isUserAttacking(): boolean {
    return this.possessionTeam() === 'home';
  }

  /** Normalised game minute for the HUD */
  displayClock(): string {
    const total = Math.floor(this.clock);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private nearestTo(point: THREE.Vector3, team: Team, filter: (p: Player) => boolean = () => true): Player | null {
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.team !== team || !filter(p)) continue;
      const d = flatDist(p.pos, point);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  private laneBlocked(from: THREE.Vector3, to: THREE.Vector3, team: Team, width: number): boolean {
    const ab = tmp.set(to.x - from.x, 0, to.z - from.z);
    const len2 = ab.lengthSq() || 1;
    return this.players.some((p) => {
      if (p.team === team) return false;
      const t = THREE.MathUtils.clamp(((p.pos.x - from.x) * ab.x + (p.pos.z - from.z) * ab.z) / len2, 0, 1);
      const cx = from.x + ab.x * t;
      const cz = from.z + ab.z * t;
      return Math.hypot(p.pos.x - cx, p.pos.z - cz) < width;
    });
  }

  // ---------------------------------------------------------------- set pieces

  private setupKickoff(team: Team) {
    for (const p of this.players) {
      p.pos.copy(p.base);
      p.vel.set(0, 0, 0);
      p.action = null;
      p.stunned = 0;
      p.facing = p.team === 'home' ? Math.PI : 0;
    }
    const taker = this.teamPlayers(team)[0];
    taker.pos.set(0, 0, -attackDir(team) * 0.7);
    // Strike partner waits for the first pass
    const partner = this.teamPlayers(team).find((p) => p.role === 'CM')!;
    partner.pos.set(team === 'home' ? -2 : 2, 0, -attackDir(team) * 7);

    this.ball.pos.set(0, BALL_RADIUS, 0);
    this.ball.vel.set(0, 0, 0);
    this.ball.spin = 0;
    this.ball.owner = null;
    this.ball.inNet = null;
    this.shotPlan = null;
    this.pendingPass = null;
    this.restart = { kind: 'kickoff', team, spot: new THREE.Vector3(0, BALL_RADIUS, 0), taker };
    this.phase = 'kickoff';
    this.phaseTimer = 1.4;
    this.controlledId = team === 'home' ? taker.id : this.teamPlayers('home')[0].id;
  }

  private beginRestart(kind: RestartKind, team: Team, spot: THREE.Vector3) {
    const taker = kind === 'goalkick'
      ? this.keeper(team)
      : this.nearestTo(spot, team, (p) => !p.isGK)!;
    this.ball.owner = null;
    this.ball.vel.set(0, 0, 0);
    this.ball.spin = 0;
    this.ball.pos.copy(spot).setY(BALL_RADIUS);
    this.shotPlan = null;
    this.pendingPass = null;
    this.restart = { kind, team, spot: spot.clone(), taker };
    this.phase = 'restart';
    this.phaseTimer = 1.2;
    this.events.push({ type: 'whistle', reason: 'out' });
    this.events.push({ type: 'restart', kind, team });
    if (team === 'home') this.controlledId = taker.id;
  }

  private placeRestartTaker() {
    const r = this.restart!;
    // Taker stands just behind the ball, facing into the pitch
    const into = new THREE.Vector3(-r.spot.x, 0, -r.spot.z).normalize();
    if (r.kind === 'kickoff') into.set(0, 0, attackDir(r.team));
    r.taker.pos.copy(r.spot).addScaledVector(into, -0.6).setY(0);
    r.taker.vel.set(0, 0, 0);
    r.taker.facing = Math.atan2(into.x, into.z);
    // Opponents keep their distance
    for (const p of this.players) {
      if (p.team === r.team) continue;
      const d = flatDist(p.pos, r.spot);
      const minD = r.kind === 'kickoff' ? 9.15 : 6;
      if (d < minD) {
        const away = new THREE.Vector3(p.pos.x - r.spot.x, 0, p.pos.z - r.spot.z).normalize();
        if (away.lengthSq() === 0) away.set(0, 0, -attackDir(r.team));
        p.pos.copy(r.spot).addScaledVector(away, minD).setY(0);
      }
    }
  }

  private finishRestart() {
    const r = this.restart!;
    this.ball.owner = r.taker;
    this.ball.lastTouch = r.taker;
    this.holdingRestart = r.taker;
    r.taker.thinkTimer = r.kind === 'goalkick' ? 0.8 : 0.5;
    if (r.kind === 'kickoff') this.events.push({ type: 'whistle', reason: 'kickoff' });
    this.restart = null;
    this.phase = 'play';
    this.events.push({ type: 'possession', team: r.team });
  }

  // ---------------------------------------------------------------- kicking

  /** Wind up a kick; the ball leaves the foot KICK_RELEASE seconds later */
  private kick(
    p: Player, vel: THREE.Vector3, spin: number,
    kind: 'pass' | 'through' | 'shot' | 'clear' | 'throw', receiver: Player | null = null,
  ) {
    if (p.action) return;
    const isThrow = kind === 'throw';
    p.facing = Math.atan2(vel.x, vel.z);
    p.action = {
      kind: isThrow ? 'throw' : 'kick', t: 0, duration: KICK_DURATION, releaseAt: KICK_RELEASE,
      onRelease: () => {
        // Lost the ball during the wind-up: the kick swings at air
        if (this.ball.owner !== p && flatDist(this.ball.pos, p.pos) > 1.6) return;
        this.ball.owner = null;
        this.ball.pos.copy(p.pos).addScaledVector(facingVec(p, tmp), 0.55).setY(isThrow ? 1.9 : BALL_RADIUS);
        this.ball.vel.copy(vel);
        this.ball.spin = spin;
        this.ball.lastTouch = p;
        this.ball.inNet = null;
        p.kickGrace = 0.35;
        if (this.holdingRestart === p) this.holdingRestart = null;
        const power = vel.length();
        this.events.push({ type: 'kick', player: p, kind: kind === 'clear' ? 'clear' : kind, power });
        if (kind === 'pass' || kind === 'through' || kind === 'throw') {
          this.stats[p.team].passes++;
          this.pendingPass = { from: p, to: receiver, team: p.team };
          if (p.team === 'home' && receiver) {
            this.receiverId = receiver.id;
            this.controlledId = receiver.id;
            this.receiveAssist = 2.0;
            this.switchCooldown = 0.8;
          }
        }
        if (kind === 'shot') {
          this.stats[p.team].shots++;
          this.planSave(p);
        }
      },
    };
  }

  /** Best teammate to pass to, favouring `prefer` (unit vector) and open lanes */
  private choosePassTarget(p: Player, prefer: THREE.Vector3, through: boolean): Player | null {
    let best: Player | null = null;
    let bestScore = Infinity;
    const dir = attackDir(p.team);
    for (const mate of this.players) {
      if (mate.team !== p.team || mate === p || mate.isGK) continue;
      const to = tmp.set(mate.pos.x - p.pos.x, 0, mate.pos.z - p.pos.z);
      const d = to.length();
      if (d < 5 || d > 50) continue;
      to.normalize();
      const align = to.dot(prefer);
      let score = d * 0.4 - align * 24;
      if (through) score -= (mate.pos.z - p.pos.z) * dir * 0.6; // reward runners ahead
      if (d > 32) score += (d - 32) * 1.2;
      if (!through && this.laneBlocked(p.pos, mate.pos, p.team, 1.8)) score += 28;
      const marker = this.nearestTo(mate.pos, other(p.team));
      if (marker && flatDist(marker.pos, mate.pos) < 2.5) score += 12;
      if (score < bestScore) { bestScore = score; best = mate; }
    }
    return best;
  }

  passBall(p: Player, prefer: THREE.Vector3 | null) {
    const pref = prefer && prefer.lengthSq() > 0.01
      ? prefer.clone().normalize()
      : facingVec(p);
    const mate = this.choosePassTarget(p, pref, false);
    if (!mate) {
      this.kick(p, pref.multiplyScalar(14), 0, 'pass');
      return;
    }
    // Lead the receiver slightly in the direction they're running
    const target = mate.pos.clone().addScaledVector(mate.vel, 0.35);
    const d = flatDist(p.pos, target);
    if (d > 30 || this.laneBlocked(p.pos, target, p.team, 1.4)) {
      // Clipped pass over the top
      this.kick(p, lobVelocity(p.pos.clone().setY(BALL_RADIUS), target.setY(0.8), 0.9 + d / 30), 0, 'pass', mate);
    } else {
      const v = new THREE.Vector3(target.x - p.pos.x, 0, target.z - p.pos.z).normalize()
        .multiplyScalar(groundPassSpeed(d, 5));
      this.kick(p, v, 0, 'pass', mate);
    }
  }

  /** Through ball into space ahead of a runner, or a cross into the box from wide */
  throughBall(p: Player, prefer: THREE.Vector3 | null) {
    const dir = attackDir(p.team);
    const goalZ = -ownGoalZ(p.team);
    const inCrossZone = Math.abs(p.pos.x) > 17 && Math.abs(goalZ - p.pos.z) < 32;
    if (inCrossZone) {
      // Cross: aim for the best-placed attacker around the penalty spot
      const target = this.players
        .filter((m) => m.team === p.team && m !== p && !m.isGK)
        .sort((a, b) => flatDist(a.pos, new THREE.Vector3(0, 0, goalZ - dir * 10)) -
          flatDist(b.pos, new THREE.Vector3(0, 0, goalZ - dir * 10)))[0];
      const spot = new THREE.Vector3(rand(-3, 3), 1.7, goalZ - dir * rand(7, 11));
      if (target) {
        spot.x = target.pos.x * 0.5;
        spot.z = THREE.MathUtils.clamp(target.pos.z, goalZ - dir * 14, goalZ - dir * 5);
      }
      const d = flatDist(p.pos, spot);
      const spin = -Math.sign(p.pos.x) * dir * 0.6; // in-swinging
      this.kick(p, lobVelocity(p.pos.clone().setY(BALL_RADIUS), spot, 0.9 + d / 28), spin, 'through', target ?? null);
      return;
    }
    const pref = prefer && prefer.lengthSq() > 0.01 ? prefer.clone().normalize() : new THREE.Vector3(0, 0, dir);
    const mate = this.choosePassTarget(p, pref, true);
    if (!mate) {
      this.passBall(p, prefer);
      return;
    }
    const lead = new THREE.Vector3(0, 0, dir * 8).addScaledVector(mate.vel, 0.4);
    const target = mate.pos.clone().add(lead);
    target.x = THREE.MathUtils.clamp(target.x, -HALF_WIDTH + 2, HALF_WIDTH - 2);
    target.z = THREE.MathUtils.clamp(target.z, -HALF_LENGTH + 3, HALF_LENGTH - 3);
    const d = flatDist(p.pos, target);
    if (this.laneBlocked(p.pos, target, p.team, 1.6) || d > 28) {
      this.kick(p, lobVelocity(p.pos.clone().setY(BALL_RADIUS), target.setY(0.3), 1.0 + d / 28), 0, 'through', mate);
    } else {
      const v = new THREE.Vector3(target.x - p.pos.x, 0, target.z - p.pos.z).normalize()
        .multiplyScalar(groundPassSpeed(d, 6));
      this.kick(p, v, 0, 'through', mate);
    }
  }

  shoot(p: Player) {
    const goalZ = -ownGoalZ(p.team);
    const keeper = this.keeper(other(p.team));
    const distToGoal = Math.hypot(p.pos.x, goalZ - p.pos.z);
    // Aim for the corner the keeper is furthest from
    const side = Math.abs(keeper.pos.x) > 0.3 ? -Math.sign(keeper.pos.x) : (p.pos.x > 0 ? -1 : 1);
    const pressure = this.nearestTo(p.pos, other(p.team));
    const pressed = pressure && flatDist(pressure.pos, p.pos) < 2.2 ? 1 : 0;
    const error = THREE.MathUtils.clamp(distToGoal / 18, 0.3, 2) + pressed * 0.6;
    const target = new THREE.Vector3(
      side * (GOAL_WIDTH / 2 - 0.6) + rand(-error, error) * 1.5,
      THREE.MathUtils.clamp(rand(0.35, 1.9) + rand(-0.3, 0.6) * error, 0.25, 3.1),
      goalZ,
    );
    const speed = THREE.MathUtils.clamp(19 + distToGoal * 0.35, 21, 31);
    // A little curl towards the far post; aim slightly outside to compensate
    const spin = side * attackDir(p.team) * rand(0.1, 0.35);
    // Aim outside the target by the expected bend so the curl brings it back
    const flight = distToGoal / speed;
    target.x += side * 0.5 * Math.abs(spin) * CURL_STRENGTH * flight * distToGoal;
    const v = shotVelocity(p.pos.clone().setY(BALL_RADIUS), target, speed);
    this.kick(p, v, spin, 'shot');
  }

  private header(p: Player, atGoal: boolean) {
    const goalZ = -ownGoalZ(p.team);
    let target: THREE.Vector3;
    if (atGoal) {
      target = new THREE.Vector3(rand(-1, 1) * (GOAL_WIDTH / 2 - 0.4), rand(0.3, 1.6), goalZ);
    } else {
      const mate = this.choosePassTarget(p, new THREE.Vector3(0, 0, attackDir(p.team)), false);
      target = mate ? mate.pos.clone().setY(0.5) : new THREE.Vector3(p.pos.x, 0.5, p.pos.z + attackDir(p.team) * 20);
    }
    const speed = atGoal ? 15 : 12;
    const v = new THREE.Vector3().subVectors(target, this.ball.pos).normalize().multiplyScalar(speed);
    v.y = atGoal ? Math.min(v.y, 1) : 4;
    this.ball.owner = null;
    this.ball.vel.copy(v);
    this.ball.spin = 0;
    this.ball.lastTouch = p;
    p.kickGrace = 0.4;
    p.action = { kind: 'header', t: 0, duration: 0.5 };
    this.events.push({ type: 'kick', player: p, kind: 'header', power: speed });
    if (atGoal) {
      this.stats[p.team].shots++;
      this.planSave(p);
    }
  }

  /** Decide, when a shot is struck, whether the keeper will reach it */
  private planSave(shooter: Player) {
    const defending = other(shooter.team);
    const keeper = this.keeper(defending);
    const lineZ = ownGoalZ(defending);
    const crossing = predictCrossing(this.ball.pos, this.ball.vel, this.ball.spin, lineZ);
    this.shotPlan = null;
    if (!crossing) return;
    const { point, time } = crossing;
    const onTarget = Math.abs(point.x) < GOAL_WIDTH / 2 - BALL_RADIUS && point.y < GOAL_HEIGHT - BALL_RADIUS;
    if (!onTarget) return;
    this.stats[shooter.team].onTarget++;
    const lateral = Math.abs(point.x - keeper.pos.x);
    const reach = 1.9 + 3.0 * Math.min(time, 0.9);
    const speed = this.ball.vel.length();
    let chance = lateral <= reach ? 0.95 - (lateral / reach) * 0.45 : 0.15;
    if (point.y > 1.8) chance -= 0.12;
    if (lateral > 2.6) chance -= 0.1;
    if (speed > 27) chance -= 0.1;
    const save = Math.random() < THREE.MathUtils.clamp(chance, 0.03, 0.95);
    this.shotPlan = {
      keeper, shooter, save, catch: save && speed < 23 && point.y < 1.9 && lateral < 1.6,
      cross: point, timeLeft: time, diveStarted: false,
    };
  }

  // ---------------------------------------------------------------- user input

  private handleInput(input: InputState, dt: number) {
    const me = this.controlled;
    const ball = this.ball;
    const attacking = this.isUserAttacking();
    const hasBall = ball.owner === me;

    // Movement
    let move = input.move.clone();
    if (this.holdingRestart === me) move.set(0, 0, 0);
    if (move.lengthSq() < 0.0001 && this.receiveAssist > 0 && !hasBall && this.receiverId === me.id) {
      move.set(ball.pos.x - me.pos.x, 0, ball.pos.z - me.pos.z);
      if (move.lengthSq() > 1) move.normalize();
      else move.multiplyScalar(0.6);
    }
    // Pressure: chase the carrier (or the ball) while held
    if (!attacking && input.holdB && move.lengthSq() < 0.0001) {
      const targetPos = ball.owner ? ball.owner.pos : ball.pos;
      move.set(targetPos.x - me.pos.x, 0, targetPos.z - me.pos.z);
      if (move.lengthSq() > 0.0001) move.normalize();
    }
    const speed = hasBall ? DRIBBLE_SPEED : (!attacking && input.holdB ? SPRINT_SPEED : RUN_SPEED);
    if (me.stunned <= 0 && !(me.action && me.action.kind !== 'header')) {
      me.desired.copy(move).multiplyScalar(speed);
    } else {
      me.desired.set(0, 0, 0);
    }

    if (me.stunned > 0 || (me.action && me.action.kind !== 'header')) return;

    const ballHeight = ball.pos.y;
    const nearBall = flatDist(me.pos, ball.pos);

    if (hasBall) {
      // Keeper's ball or restart left untouched: play it automatically, as DLS does
      if (me.isGK || this.holdingRestart === me) {
        this.userHold += dt;
        if (this.userHold > 4 && !input.pressA && !input.pressB && !input.pressC) {
          this.userHold = 0;
          if (me.isGK) this.distribute(me);
          else this.passBall(me, new THREE.Vector3(0, 0, attackDir(me.team)));
          return;
        }
      } else {
        this.userHold = 0;
      }
      if (me.isGK && input.pressB) {
        this.distribute(me, true);
        return;
      }
      if (input.pressA) this.passBall(me, move);
      else if (input.pressC) this.throughBall(me, move);
      else if (input.pressB && this.holdingRestart !== me) this.shoot(me);
      return;
    }

    // First-time finishes and headers on a ball arriving in the air
    if (!ball.owner && nearBall < 1.6 && me.kickGrace <= 0) {
      if ((input.pressB || input.pressA) && ballHeight > 1.1 && ballHeight < 2.8) {
        this.header(me, input.pressB);
        return;
      }
      if (input.pressB && ballHeight <= 1.1) {
        this.ball.owner = me; // volley: take it on instantly
        this.shoot(me);
        return;
      }
    }

    if (!attacking) {
      if (input.pressA) this.userTackle(me);
      if (input.pressC) this.switchPlayer(true);
    }
  }

  private userTackle(me: Player) {
    const carrier = this.ball.owner;
    const target = carrier ? carrier.pos : this.ball.pos;
    const d = flatDist(me.pos, target);
    const dir = new THREE.Vector3(target.x - me.pos.x, 0, target.z - me.pos.z).normalize();
    me.facing = Math.atan2(dir.x, dir.z);
    if (d < 2.0 && carrier) {
      // Standing tackle
      me.action = { kind: 'tackle', t: 0, duration: 0.4 };
      this.stats.home.tackles++;
      const won = Math.random() < (carrier.isGK ? 0.1 : 0.58);
      this.events.push({ type: 'tackle', player: me, won, slide: false });
      if (won) this.takePossession(me);
      else me.stunned = 0.35;
    } else if (d < 6) {
      // Slide tackle: lunge along the ground, winning the ball if it passes the feet
      me.action = { kind: 'slide', t: 0, duration: 0.65, dir };
      me.vel.copy(dir).multiplyScalar(10);
      this.stats.home.tackles++;
    }
  }

  switchPlayer(manual: boolean) {
    const target = this.ball.owner ? this.ball.owner.pos : this.ball.pos;
    const next = this.nearestTo(target, 'home', (p) => !p.isGK && p.id !== this.controlledId);
    if (next) {
      this.controlledId = next.id;
      this.switchCooldown = manual ? 1.2 : 0.6;
      this.receiveAssist = 0;
    }
  }

  // ---------------------------------------------------------------- AI

  private shapeTarget(p: Player): THREE.Vector3 {
    const dir = attackDir(p.team);
    const inPossession = this.possessionTeam() === p.team;
    // The block slides with the ball along the pitch and across it
    const ballZ = this.ball.pos.z;
    const ownHalfCentre = -dir * 26; // average depth of the kick-off shape
    const push = inPossession ? dir * 12 : -dir * 4;
    const shift = ballZ * 0.55 + push - ownHalfCentre * 0.55;
    const target = new THREE.Vector3(
      p.base.x * (inPossession ? 1.05 : 0.8) + this.ball.pos.x * 0.25,
      0,
      ownHalfCentre + (p.base.z - ownHalfCentre) * 0.8 + shift,
    );
    if (inPossession && (p.role === 'ST' || p.role === 'LW' || p.role === 'RW')) target.z += dir * 7;
    // Never drop behind the own goal area, never run past the opponents' last line by much
    const ownLine = ownGoalZ(p.team) + dir * 6;
    const lastLine = -ownGoalZ(p.team) - dir * 8;
    target.z = dir < 0 ? THREE.MathUtils.clamp(target.z, lastLine, ownLine) : THREE.MathUtils.clamp(target.z, ownLine, lastLine);
    target.x = THREE.MathUtils.clamp(target.x, -HALF_WIDTH + 2, HALF_WIDTH - 2);
    return target;
  }

  private moveTowards(p: Player, target: THREE.Vector3, maxSpeed: number, arriveDist = 2) {
    const d = flatDist(p.pos, target);
    if (d < 0.3) {
      p.desired.set(0, 0, 0);
      return;
    }
    const speed = d < arriveDist ? maxSpeed * (d / arriveDist) : maxSpeed;
    p.desired.set(target.x - p.pos.x, 0, target.z - p.pos.z).normalize().multiplyScalar(speed);
  }

  private keeperAI(k: Player, dt: number) {
    const dir = attackDir(k.team);
    const lineZ = ownGoalZ(k.team);
    const plan = this.shotPlan && this.shotPlan.keeper === k ? this.shotPlan : null;

    if (this.ball.owner === k) {
      k.desired.set(0, 0, 0);
      this.keeperHold -= dt;
      if (this.keeperHold <= 0 && !k.action) this.distribute(k);
      return;
    }
    if (plan) {
      if (!plan.diveStarted && plan.timeLeft < 0.45) {
        plan.diveStarted = true;
        const target = plan.save ? plan.cross : plan.cross.clone().setX(k.pos.x + (plan.cross.x - k.pos.x) * 0.6);
        const lateral = target.x - k.pos.x;
        const diveDir = new THREE.Vector3(lateral, 0, 0).normalize();
        k.action = { kind: 'dive', t: 0, duration: 0.9, dir: diveDir, side: Math.sign(lateral) || 1 };
        k.vel.set(lateral / Math.max(plan.timeLeft, 0.2), 0, 0);
      }
      if (!plan.diveStarted) {
        this.moveTowards(k, new THREE.Vector3(plan.cross.x * 0.4, 0, lineZ + dir * 1.2), SPRINT_SPEED, 1);
      }
      return;
    }
    if (k.action) return;

    // Rush out to claim a loose ball in the box
    const b = this.ball.pos;
    const inBox = Math.abs(b.x) < PENALTY_WIDTH / 2 && Math.abs(b.z - lineZ) < PENALTY_DEPTH;
    const opponentNear = this.nearestTo(b, other(k.team));
    const opponentDist = opponentNear ? flatDist(opponentNear.pos, b) : 99;
    if (inBox && !this.ball.owner && flatDist(k.pos, b) < opponentDist - 1) {
      this.moveTowards(k, b, SPRINT_SPEED, 0.5);
      return;
    }
    // Otherwise narrow the angle: stand on the line between ball and goal centre
    const toBall = new THREE.Vector3(b.x, 0, b.z - lineZ);
    const dist = toBall.length();
    toBall.normalize();
    const out = THREE.MathUtils.clamp(dist * 0.08, 1.0, 4.5);
    const target = new THREE.Vector3(toBall.x * out, 0, lineZ + toBall.z * out);
    target.x = THREE.MathUtils.clamp(target.x, -GOAL_WIDTH / 2 + 0.5, GOAL_WIDTH / 2 - 0.5);
    this.moveTowards(k, target, JOG_SPEED, 1.5);
    k.facing = Math.atan2(b.x - k.pos.x, b.z - k.pos.z);
  }

  private distribute(k: Player, long = false) {
    const dir = attackDir(k.team);
    // Short to an open defender, or long to the forwards
    const open = this.players
      .filter((m) => m.team === k.team && !m.isGK && !this.laneBlocked(k.pos, m.pos, k.team, 3))
      .sort((a, b) => flatDist(a.pos, k.pos) - flatDist(b.pos, k.pos));
    const short = open.find((m) => flatDist(m.pos, k.pos) > 10 && flatDist(m.pos, k.pos) < 30);
    if (short && !long && Math.random() < 0.65) {
      const d = flatDist(k.pos, short.pos);
      const v = new THREE.Vector3(short.pos.x - k.pos.x, 0, short.pos.z - k.pos.z).normalize()
        .multiplyScalar(groundPassSpeed(d, 5));
      this.kick(k, v, 0, 'pass', short);
    } else {
      const forward = this.players
        .filter((m) => m.team === k.team && !m.isGK)
        .sort((a, b) => (b.pos.z - a.pos.z) * dir - (a.pos.z - b.pos.z) * dir * 0)[0];
      const target = forward ? forward.pos.clone() : new THREE.Vector3(0, 0, 0);
      target.z = THREE.MathUtils.clamp(target.z, -35, 35);
      this.kick(k, lobVelocity(k.pos.clone().setY(BALL_RADIUS), target.setY(0.5), 2.4), 0, 'pass', forward ?? null);
    }
  }

  private carrierAI(p: Player, dt: number) {
    if (p.isGK) return this.keeperAI(p, dt);
    const dir = attackDir(p.team);
    const goalZ = -ownGoalZ(p.team);
    const goal = new THREE.Vector3(0, 0, goalZ);
    const distGoal = flatDist(p.pos, goal);
    const opp = this.nearestTo(p.pos, other(p.team), (o) => !o.isGK);
    const oppDist = opp ? flatDist(opp.pos, p.pos) : 99;

    if (this.holdingRestart === p) {
      p.desired.set(0, 0, 0);
      p.thinkTimer -= dt;
      if (p.thinkTimer <= 0 && !p.action) {
        const r = this.restart;
        void r;
        this.passBall(p, new THREE.Vector3(0, 0, dir));
      }
      return;
    }

    // Dribble towards goal, sliding away from the nearest defender
    const heading = new THREE.Vector3(goal.x - p.pos.x, 0, goal.z - p.pos.z).normalize();
    if (opp && oppDist < 7) {
      const away = new THREE.Vector3(p.pos.x - opp.pos.x, 0, p.pos.z - opp.pos.z).normalize();
      heading.addScaledVector(away, 0.7 * (1 - oppDist / 7)).normalize();
    }
    if (Math.abs(p.pos.x) > HALF_WIDTH - 4) heading.x -= Math.sign(p.pos.x) * 0.5;
    p.desired.copy(heading).multiplyScalar(DRIBBLE_SPEED * 0.92);

    p.thinkTimer -= dt;
    if (p.thinkTimer > 0 || p.action) return;
    p.thinkTimer = rand(0.25, 0.45);

    const central = Math.abs(p.pos.x) < 20;
    if ((distGoal < 13 && Math.random() < 0.6) || (distGoal < 24 && central && Math.random() < 0.3)) {
      this.shoot(p);
    } else if (Math.abs(p.pos.x) > 17 && Math.abs(goalZ - p.pos.z) < 26 && Math.random() < 0.5) {
      this.throughBall(p, null); // cross from wide
    } else if (oppDist < 3.2 && Math.random() < 0.8) {
      this.passBall(p, heading);
    } else if (Math.random() < 0.1) {
      Math.random() < 0.35 ? this.throughBall(p, heading) : this.passBall(p, heading);
    }
  }

  private teamAI(team: Team, dt: number) {
    const owner = this.ball.owner;
    const possession = this.possessionTeam();
    const ballPos = owner ? owner.pos : this.ball.pos;
    const outfield = this.players.filter((p) => p.team === team && !p.isGK);
    const userId = team === 'home' ? this.controlledId : -1;

    // Who chases: the nearest presses, the second covers
    const byDist = outfield
      .filter((p) => p.id !== userId)
      .sort((a, b) => flatDist(a.pos, ballPos) - flatDist(b.pos, ballPos));
    const userDist = team === 'home' ? flatDist(this.controlled.pos, ballPos) : Infinity;
    const chaser = byDist[0] && flatDist(byDist[0].pos, ballPos) < userDist - 1 ? byDist[0] : null;
    const cover = byDist.find((p) => p !== chaser) ?? null;

    for (const p of this.players) {
      if (p.team !== team || p.id === userId) continue;
      if (p.stunned > 0 || (p.action && p.action.kind !== 'header')) {
        if (p.action?.kind !== 'slide' && p.action?.kind !== 'dive') p.desired.set(0, 0, 0);
        continue;
      }
      if (owner === p) { this.carrierAI(p, dt); continue; }
      if (p.isGK) { this.keeperAI(p, dt); continue; }

      // Intended receiver runs onto the pass
      if (this.pendingPass && this.pendingPass.to === p && !owner) {
        const intercept = this.ball.pos.clone().addScaledVector(this.ball.vel, 0.25);
        this.moveTowards(p, intercept, SPRINT_SPEED, 0.5);
        continue;
      }

      const defending = possession !== team || !owner;
      if (defending && p === chaser && owner?.isGK) {
        // Can't challenge a keeper holding the ball: hover at a distance
        const away = new THREE.Vector3(p.pos.x - owner.pos.x, 0, p.pos.z - owner.pos.z).setLength(8);
        this.moveTowards(p, owner.pos.clone().add(away), JOG_SPEED, 2);
        continue;
      }
      if (defending && p === chaser) {
        // Press the ball / carrier
        this.moveTowards(p, ballPos, owner ? RUN_SPEED * 1.08 : SPRINT_SPEED, 0.2);
        if (owner && owner.team !== team) this.tryTackle(p, owner);
        continue;
      }
      if (defending && owner && owner.team !== team && p === cover) {
        // Cover: sit between the carrier and our goal
        const goal = new THREE.Vector3(0, 0, ownGoalZ(team));
        const spot = owner.pos.clone().lerp(goal, 0.18);
        this.moveTowards(p, spot, RUN_SPEED, 2);
        continue;
      }
      const target = this.shapeTarget(p);
      const d = flatDist(p.pos, target);
      this.moveTowards(p, target, d > 10 ? RUN_SPEED : JOG_SPEED, 3);
    }
  }

  private tryTackle(p: Player, carrier: Player) {
    if (p.tackleCooldown > 0 || carrier.isGK) return;
    if (flatDist(p.pos, carrier.pos) > 1.4) return;
    p.tackleCooldown = rand(1.8, 2.8);
    const userCarrier = carrier.team === 'home' && carrier.id === this.controlledId;
    const won = Math.random() < (userCarrier ? 0.3 : 0.38);
    p.action = { kind: 'tackle', t: 0, duration: 0.4 };
    this.stats[p.team].tackles++;
    this.events.push({ type: 'tackle', player: p, won, slide: false });
    if (won) {
      if (Math.random() < 0.6) this.takePossession(p);
      else this.pokeLoose(p, carrier);
    }
  }

  private pokeLoose(p: Player, from: Player) {
    this.ball.owner = null;
    const dir = new THREE.Vector3(from.pos.x - p.pos.x, 0, from.pos.z - p.pos.z).normalize();
    dir.applyAxisAngle(UP, rand(-0.8, 0.8));
    this.ball.vel.copy(dir).multiplyScalar(rand(5, 9)).setY(1);
    this.ball.lastTouch = p;
    p.kickGrace = 0.25;
    from.kickGrace = 0.5;
  }

  private takePossession(p: Player) {
    const prev = this.ball.owner;
    this.ball.owner = p;
    this.ball.lastTouch = p;
    this.ball.inNet = null;
    if (prev && prev !== p) prev.kickGrace = 0.6;
    if (this.pendingPass) {
      if (this.pendingPass.team === p.team) this.stats[p.team].passesCompleted++;
      this.pendingPass = null;
    }
    this.shotPlan = null;
    if (p.team === 'home') {
      this.controlledId = p.isGK ? this.controlledId : p.id;
      this.receiveAssist = 0;
      this.receiverId = null;
    }
    if (p.isGK) this.keeperHold = 1.1;
    p.thinkTimer = rand(0.2, 0.4);
    if (!prev || prev.team !== p.team) this.events.push({ type: 'possession', team: p.team });
  }

  // ---------------------------------------------------------------- simulation step

  step(dt: number, input: InputState) {
    this.events.length = 0;

    if (this.phase === 'fulltime') return;
    if (this.phase === 'halftime') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) this.startSecondHalf();
      return;
    }

    if (this.phase === 'kickoff' || this.phase === 'restart') {
      this.placeRestartTaker();
      this.phaseTimer -= dt;
      this.updateBallVisualOnly();
      if (this.phaseTimer <= 0) this.finishRestart();
      // Others drift back into shape during the pause
      for (const team of ['home', 'away'] as Team[]) this.teamAI(team, dt);
      for (const p of this.players) if (p !== this.restart?.taker) this.integratePlayer(p, dt);
      return;
    }

    if (this.phase === 'goal') {
      this.phaseTimer -= dt;
      for (const p of this.players) { p.desired.set(0, 0, 0); this.integratePlayer(p, dt); }
      this.stepFreeBall(dt);
      if (this.phaseTimer <= 0) {
        if (this.checkHalfEnd()) return;
        this.setupKickoff(this.ball.inNet === 'home' ? 'away' : 'home');
      }
      return;
    }

    // ---- open play
    this.clock += dt * (GAME_SECONDS_PER_HALF / HALF_REAL_SECONDS);
    if (this.checkHalfEnd()) return;

    this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    this.receiveAssist = Math.max(0, this.receiveAssist - dt);
    this.autoSwitch();

    this.handleInput(input, dt);
    this.teamAI('home', dt);
    this.teamAI('away', dt);

    for (const p of this.players) this.integratePlayer(p, dt);

    const owner = this.ball.owner;
    if (owner) {
      this.stats[owner.team].possessionTime += dt;
      this.dribbleBall(owner, dt);
    } else {
      this.stepFreeBall(dt);
      if (this.phase === 'play') this.checkPossession();
    }
  }

  startSecondHalf() {
    if (this.phase !== 'halftime') return;
    this.half = 2;
    this.clock = GAME_SECONDS_PER_HALF;
    this.setupKickoff(other(this.firstHalfKickoff));
  }

  private checkHalfEnd(): boolean {
    const end = this.half === 1 ? GAME_SECONDS_PER_HALF : GAME_SECONDS_PER_HALF * 2;
    if (this.clock < end) return false;
    this.clock = end;
    this.events.push({ type: 'whistle', reason: this.half === 1 ? 'halftime' : 'fulltime' });
    this.ball.owner = null;
    this.shotPlan = null;
    if (this.half === 1) {
      this.phase = 'halftime';
      this.phaseTimer = 3.5;
    } else {
      this.phase = 'fulltime';
    }
    return true;
  }

  private autoSwitch() {
    if (this.switchCooldown > 0) return;
    const owner = this.ball.owner;
    if (owner && owner.team === 'home') return;
    if (this.receiveAssist > 0) return;
    const target = owner ? owner.pos : this.ball.pos;
    const me = this.controlled;
    const nearest = this.nearestTo(target, 'home', (p) => !p.isGK);
    if (nearest && nearest !== me && flatDist(nearest.pos, target) + 3 < flatDist(me.pos, target)) {
      this.controlledId = nearest.id;
      this.switchCooldown = 0.6;
    }
  }

  private integratePlayer(p: Player, dt: number) {
    p.kickGrace = Math.max(0, p.kickGrace - dt);
    p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
    p.stunned = Math.max(0, p.stunned - dt);

    const a = p.action;
    if (a) {
      a.t += dt;
      if (a.releaseAt !== undefined && !a.released && a.t >= a.releaseAt) {
        a.released = true;
        a.onRelease?.();
      }
      if (a.kind === 'slide') {
        p.vel.multiplyScalar(Math.exp(-2.2 * dt));
        // Ball near the sliding boot is knocked away
        if (a.t < 0.45 && flatDist(p.pos, this.ball.pos) < 1.2 && this.ball.pos.y < 0.8 && p.kickGrace <= 0) {
          const prev = this.ball.owner;
          if (!prev || prev.team !== p.team) {
            const won = Math.random() < 0.75;
            this.events.push({ type: 'tackle', player: p, won, slide: true });
            if (won) {
              if (prev) this.pokeLoose(p, prev);
              else { this.ball.vel.addScaledVector(a.dir!, 5); this.ball.lastTouch = p; }
              this.ball.owner = null;
              p.kickGrace = 0.3;
            }
            a.t = Math.max(a.t, 0.45);
          }
        }
        if (a.t >= a.duration) p.stunned = 0.35;
      } else if (a.kind === 'dive') {
        p.vel.multiplyScalar(Math.exp(-1.5 * dt));
      }
      if (a.t >= a.duration) p.action = null;
    }

    if (!a || (a.kind !== 'slide' && a.kind !== 'dive')) {
      const blend = 1 - Math.exp(-ACCELERATION * dt);
      p.vel.lerp(p.desired, blend);
    }
    p.pos.addScaledVector(p.vel, dt);
    p.pos.x = THREE.MathUtils.clamp(p.pos.x, -HALF_WIDTH - 3, HALF_WIDTH + 3);
    p.pos.z = THREE.MathUtils.clamp(p.pos.z, -HALF_LENGTH - 3, HALF_LENGTH + 3);

    // Face the way we move, or the ball when standing
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (a && (a.kind === 'kick' || a.kind === 'throw' || a.kind === 'dive' || a.kind === 'slide' || a.kind === 'tackle')) {
      // keep facing set by the action
    } else if (speed > 0.6) {
      p.facing = turnTowards(p.facing, Math.atan2(p.vel.x, p.vel.z), 10 * dt);
    } else {
      p.facing = turnTowards(p.facing, Math.atan2(this.ball.pos.x - p.pos.x, this.ball.pos.z - p.pos.z), 4 * dt);
    }
  }

  private dribbleBall(owner: Player, dt: number) {
    const b = this.ball;
    if (owner.isGK) {
      // Held in the hands
      b.pos.copy(owner.pos).addScaledVector(facingVec(owner, tmp), 0.35).setY(1.0);
      b.vel.set(0, 0, 0);
      return;
    }
    const f = facingVec(owner, tmp);
    const speed = Math.hypot(owner.vel.x, owner.vel.z);
    // Touches: the ball runs slightly ahead and comes back as the player catches up
    const reach = 0.45 + Math.min(speed, 7) * 0.06 + Math.abs(Math.sin(this.clock * 0.9)) * 0.12;
    const target = owner.pos.clone().addScaledVector(f, reach);
    b.pos.x += (target.x - b.pos.x) * Math.min(1, 14 * dt);
    b.pos.z += (target.z - b.pos.z) * Math.min(1, 14 * dt);
    b.pos.y = BALL_RADIUS;
    b.vel.set(owner.vel.x, 0, owner.vel.z);
    b.spin = 0;

    // Dribbled over a line
    if (Math.abs(b.pos.x) > HALF_WIDTH || Math.abs(b.pos.z) > HALF_LENGTH) {
      b.owner = null;
      this.checkOut(b.pos.z);
    }
  }

  private updateBallVisualOnly() {
    this.ball.vel.set(0, 0, 0);
  }

  private stepFreeBall(dt: number) {
    const b = this.ball;
    const prevZ = b.pos.z;
    integrateBall(b, dt);

    if (this.shotPlan) this.resolveShotPlan(dt);

    if (b.inNet) {
      // Inside the net: soak up the ball's energy
      const side = Math.sign(b.pos.z);
      const back = side * (HALF_LENGTH + GOAL_DEPTH - BALL_RADIUS);
      if (Math.abs(b.pos.z) > Math.abs(back)) { b.pos.z = back; b.vel.z *= -0.08; b.vel.x *= 0.5; }
      // Never roll back out through the mouth
      const front = side * (HALF_LENGTH + BALL_RADIUS + 0.1);
      if (Math.abs(b.pos.z) < Math.abs(front)) { b.pos.z = front; b.vel.z = 0; }
      b.vel.x *= Math.exp(-1.5 * dt);
      b.vel.z *= Math.exp(-1.5 * dt);
      if (Math.abs(b.pos.x) > GOAL_WIDTH / 2 - BALL_RADIUS) { b.pos.x = Math.sign(b.pos.x) * (GOAL_WIDTH / 2 - BALL_RADIUS); b.vel.x *= -0.2; }
      if (b.pos.y > GOAL_HEIGHT - BALL_RADIUS) { b.pos.y = GOAL_HEIGHT - BALL_RADIUS; b.vel.y = -Math.abs(b.vel.y) * 0.2; }
      return;
    }
    if (this.phase !== 'play') return;

    // Goal line
    if (Math.abs(b.pos.z) >= HALF_LENGTH && Math.abs(prevZ) < HALF_LENGTH) {
      const side = Math.sign(b.pos.z);
      const ax = Math.abs(b.pos.x);
      const postX = GOAL_WIDTH / 2;
      const hitsPost = Math.abs(ax - postX) < BALL_RADIUS + 0.06 && b.pos.y < GOAL_HEIGHT + 0.06;
      const hitsBar = ax < postX && Math.abs(b.pos.y - GOAL_HEIGHT) < BALL_RADIUS + 0.06;
      if (hitsPost || hitsBar) {
        b.pos.z = side * (HALF_LENGTH - BALL_RADIUS);
        b.vel.z *= -0.55;
        if (hitsBar) b.vel.y = -Math.abs(b.vel.y) * 0.6 - 1;
        else b.vel.x += Math.sign(b.pos.x - Math.sign(b.pos.x) * postX) * 3;
        this.shotPlan = null;
        this.events.push({ type: 'post' });
        return;
      }
      if (ax < postX - BALL_RADIUS && b.pos.y < GOAL_HEIGHT - BALL_RADIUS) {
        // +z goal is the home goal, so the away side scores there
        const scorers: Team = side > 0 ? 'away' : 'home';
        this.score[scorers]++;
        this.lastScorer = b.lastTouch && b.lastTouch.team === scorers ? b.lastTouch : null;
        b.inNet = other(scorers);
        this.phase = 'goal';
        this.phaseTimer = 3.6;
        this.shotPlan = null;
        this.pendingPass = null;
        this.events.push({ type: 'goal', team: scorers, scorer: this.lastScorer });
        return;
      }
      this.checkOut(b.pos.z);
      return;
    }
    if (Math.abs(b.pos.x) > HALF_WIDTH + BALL_RADIUS) this.checkOut(b.pos.z);
  }

  private checkOut(z: number) {
    const b = this.ball;
    const last = b.lastTouch ? b.lastTouch.team : 'away';
    const awarded = other(last);
    if (Math.abs(b.pos.z) >= HALF_LENGTH) {
      const side = Math.sign(z);
      const defending: Team = side > 0 ? 'home' : 'away';
      if (last === defending) {
        const spot = new THREE.Vector3(Math.sign(b.pos.x || 1) * (HALF_WIDTH - 0.5), BALL_RADIUS, side * (HALF_LENGTH - 0.5));
        this.beginRestart('corner', other(defending), spot);
      } else {
        const spot = new THREE.Vector3(Math.sign(b.pos.x || 1) * 4, BALL_RADIUS, side * (HALF_LENGTH - 5.5));
        this.beginRestart('goalkick', defending, spot);
      }
      return;
    }
    const spot = new THREE.Vector3(Math.sign(b.pos.x) * (HALF_WIDTH - 0.3), BALL_RADIUS,
      THREE.MathUtils.clamp(b.pos.z, -HALF_LENGTH + 1, HALF_LENGTH - 1));
    this.beginRestart('throwin', awarded, spot);
  }

  private resolveShotPlan(dt: number) {
    const plan = this.shotPlan!;
    plan.timeLeft -= dt;
    const k = plan.keeper;
    const lineZ = ownGoalZ(k.team);
    const b = this.ball;
    // Ball reaches the keeper's plane
    if (Math.abs(b.pos.z - k.pos.z) < 0.5 || (b.pos.z - lineZ) * Math.sign(lineZ) > -0.3) {
      if (plan.save) {
        if (plan.catch) {
          this.takePossession(k);
          this.events.push({ type: 'save', keeper: k, caught: true });
        } else {
          // Parry wide of the goal
          const out = Math.sign(b.pos.x - k.pos.x) || 1;
          b.vel.set(out * rand(4, 9), rand(2, 5), -Math.sign(lineZ) * rand(3, 7));
          b.lastTouch = k;
          k.kickGrace = 0.6;
          this.events.push({ type: 'save', keeper: k, caught: false });
        }
      }
      this.shotPlan = null;
    }
  }

  private checkPossession() {
    const b = this.ball;
    const speed = b.vel.length();
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.kickGrace > 0 || p.stunned > 0) continue;
      if (p.action && (p.action.kind === 'dive' || p.action.kind === 'slide')) continue;
      const d = flatDist(p.pos, b.pos);
      const isReceiver = this.pendingPass?.to === p;
      // Keepers can claim high balls in their own box with their hands
      const lineZ = ownGoalZ(p.team);
      const keeperClaim = p.isGK && Math.abs(b.pos.z - lineZ) < PENALTY_DEPTH && Math.abs(b.pos.x) < PENALTY_WIDTH / 2;
      const maxH = keeperClaim ? 2.5 : 1.0;
      const radius = CONTROL_RADIUS + (isReceiver ? 0.35 : 0) + (keeperClaim ? 0.5 : 0);
      if (d > radius || b.pos.y > maxH) {
        // Headers for anyone under a dropping ball at head height
        if (!p.isGK && d < 1.0 && b.pos.y > 1.3 && b.pos.y < 2.6 && !(p.team === 'home' && p.id === this.controlledId)) {
          const goalZ = -ownGoalZ(p.team);
          const atGoal = Math.abs(goalZ - p.pos.z) < 16 && Math.abs(p.pos.x) < 12;
          this.header(p, atGoal);
          return;
        }
        continue;
      }
      // Hard-hit balls are harder to trap
      if (speed > 24 && !isReceiver && !keeperClaim && Math.random() < 0.5) {
        b.vel.multiplyScalar(0.5).applyAxisAngle(UP, rand(-0.6, 0.6));
        b.lastTouch = p;
        p.kickGrace = 0.3;
        return;
      }
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) this.takePossession(best);
  }
}

function turnTowards(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
}
