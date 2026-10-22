import {
  CENTRE_CIRCLE_RADIUS, FIELD_LENGTH, FIELD_WIDTH, GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH,
  PENALTY_DEPTH, PENALTY_WIDTH,
} from './constants';
import type { Match } from './sim/match';
import type { Team } from './sim/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private scoreHome = $('score-home');
  private scoreAway = $('score-away');
  private timer = $('match-timer');
  private half = $('match-half');
  private toastEl = $('toast');
  private goalBanner = $('goal-banner');
  private goalDetail = $('goal-detail');
  private playerName = $('player-name');
  private phaseTag = $('phase-tag');
  private cluster = document.querySelector('.action-cluster') as HTMLElement;
  private labels = {
    A: $('btn-a').querySelector('.lbl') as HTMLElement,
    B: $('btn-b').querySelector('.lbl') as HTMLElement,
    C: $('btn-c').querySelector('.lbl') as HTMLElement,
  };
  private hints = { A: $('hint-a'), B: $('hint-b'), C: $('hint-c') };
  private radar = $<HTMLCanvasElement>('radar-canvas');
  private rctx = this.radar.getContext('2d')!;
  private toastTimer = 0;
  private goalTimer = 0;
  private last = { label: '', tag: '', name: '', clock: '', half: '', score: '' };

  toast(text: string, colour = '#fde047', seconds = 1.4) {
    this.toastEl.textContent = text;
    this.toastEl.style.color = colour;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  goal(team: Team, detail: string) {
    this.goalDetail.textContent = detail;
    this.goalBanner.querySelector('.goal-strip')!.classList.toggle('away', team === 'away');
    this.goalBanner.classList.add('show');
    this.goalTimer = 3;
  }

  update(m: Match, dt: number) {
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    this.goalTimer -= dt;
    if (this.goalTimer <= 0) this.goalBanner.classList.remove('show');

    const score = `${m.score.home}-${m.score.away}`;
    if (score !== this.last.score) {
      this.last.score = score;
      this.scoreHome.textContent = String(m.score.home);
      this.scoreAway.textContent = String(m.score.away);
    }
    const clock = m.displayClock();
    if (clock !== this.last.clock) {
      this.last.clock = clock;
      this.timer.textContent = clock;
    }
    const half = m.phase === 'fulltime' ? 'FULL TIME' : m.phase === 'halftime' ? 'HALF TIME' : m.half === 1 ? '1ST HALF' : '2ND HALF';
    if (half !== this.last.half) {
      this.last.half = half;
      this.half.textContent = half;
    }

    const me = m.controlled;
    const name = `${me.num} · ${me.name.toUpperCase()}`;
    if (name !== this.last.name) {
      this.last.name = name;
      this.playerName.textContent = name;
    }

    const possession = m.possessionTeam();
    const inPlay = m.phase === 'play';
    const tag = !inPlay || !possession ? 'neutral' : possession === 'home' ? 'attacking' : 'defending';
    if (tag !== this.last.tag) {
      this.last.tag = tag;
      this.phaseTag.className = `phase-tag ${tag} text-[11px] font-extrabold tracking-[0.25em] px-4 py-1 rounded-md`;
      this.phaseTag.textContent = tag === 'attacking' ? 'ATTACKING' : tag === 'defending' ? 'DEFENDING' : m.phase === 'goal' ? 'GOAL' : 'SET PIECE';
    }

    // Contextual buttons
    let a = 'PASS';
    let b = 'SHOOT';
    let c = 'THROUGH';
    const attacking = m.isUserAttacking();
    if (attacking) {
      if (m.ball.owner === me) {
        const goalZ = -HALF_LENGTH;
        if (Math.abs(me.pos.x) > 17 && Math.abs(goalZ - me.pos.z) < 32) c = 'CROSS';
        if (me.isGK) b = 'CLEAR';
      } else if (m.ball.pos.y > 1.1) {
        b = 'HEADER';
      }
    } else {
      const carrier = m.ball.owner;
      const d = carrier ? Math.hypot(carrier.pos.x - me.pos.x, carrier.pos.z - me.pos.z) : 99;
      a = d > 2.0 ? 'SLIDE' : 'TACKLE';
      b = 'PRESS';
      c = 'SWITCH';
    }
    const label = `${a}|${b}|${c}|${attacking}`;
    if (label !== this.last.label) {
      this.last.label = label;
      this.labels.A.textContent = a;
      this.labels.B.textContent = b;
      this.labels.C.textContent = c;
      this.hints.A.textContent = a[0] + a.slice(1).toLowerCase();
      this.hints.B.textContent = b[0] + b.slice(1).toLowerCase();
      this.hints.C.textContent = c[0] + c.slice(1).toLowerCase();
      this.cluster.classList.toggle('defending', !attacking);
    }

    this.drawRadar(m);
  }

  private drawRadar(m: Match) {
    const cw = this.radar.clientWidth;
    const ch = this.radar.clientHeight;
    if (!cw || !ch) return;
    const w = cw * 2;
    const h = ch * 2;
    if (this.radar.width !== w) this.radar.width = w;
    if (this.radar.height !== h) this.radar.height = h;
    const ctx = this.rctx;
    const pad = 6;
    // Same orientation as the camera: world -z is right, world +x is down
    const toX = (z: number) => ((HALF_LENGTH - z) / FIELD_LENGTH) * (w - pad * 2) + pad;
    const toY = (x: number) => ((x + HALF_WIDTH) / FIELD_WIDTH) * (h - pad * 2) + pad;
    const sx = (w - pad * 2) / FIELD_LENGTH;
    const sy = (h - pad * 2) / FIELD_WIDTH;

    ctx.fillStyle = 'rgba(12, 48, 28, 0.85)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.beginPath();
    ctx.moveTo(w / 2, pad);
    ctx.lineTo(w / 2, h - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, CENTRE_CIRCLE_RADIUS * sx, CENTRE_CIRCLE_RADIUS * sy, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (const end of [1, -1]) {
      const lineZ = end * HALF_LENGTH;
      const depth = PENALTY_DEPTH * sx;
      const bx = end > 0 ? toX(lineZ) : toX(lineZ) - depth;
      ctx.strokeRect(bx, toY(-PENALTY_WIDTH / 2), depth, PENALTY_WIDTH * sy);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(toX(lineZ) - (end > 0 ? 3 : 0), toY(-GOAL_WIDTH / 2), 3, GOAL_WIDTH * sy);
    }

    const dot = Math.max(3.5, w / 70);
    for (const p of m.players) {
      const controlled = p.team === 'home' && p.id === m.controlledId;
      ctx.beginPath();
      ctx.arc(toX(p.pos.z), toY(p.pos.x), controlled ? dot * 1.4 : dot, 0, Math.PI * 2);
      ctx.fillStyle = p.isGK ? (p.team === 'home' ? '#22c55e' : '#facc15')
        : p.team === 'home' ? (controlled ? '#00ff88' : '#3b82f6') : '#ef4444';
      ctx.fill();
      if (controlled) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(toX(m.ball.pos.z), toY(m.ball.pos.x), dot * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  }
}

export function renderStats(m: Match): string {
  const h = m.stats.home;
  const a = m.stats.away;
  const total = h.possessionTime + a.possessionTime || 1;
  const pct = (x: number) => `${Math.round((x / total) * 100)}%`;
  const acc = (s: typeof h) => (s.passes ? `${Math.round((s.passesCompleted / s.passes) * 100)}%` : '-');
  const rows: [string, string, string][] = [
    [pct(h.possessionTime), 'POSSESSION', pct(a.possessionTime)],
    [String(h.shots), 'SHOTS', String(a.shots)],
    [String(h.onTarget), 'ON TARGET', String(a.onTarget)],
    [String(h.passes), 'PASSES', String(a.passes)],
    [acc(h), 'PASS ACCURACY', acc(a)],
    [String(h.tackles), 'TACKLES', String(a.tackles)],
  ];
  return rows.map(([l, label, r]) => `<tr><td>${l}</td><td>${label}</td><td>${r}</td></tr>`).join('');
}
