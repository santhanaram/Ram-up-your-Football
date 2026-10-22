import * as THREE from 'three';
import { GOAL_DEPTH, HALF_LENGTH } from './constants';
import { MatchAudio } from './audio';
import { Hud, renderStats } from './hud';
import { Controls } from './input';
import { BallView } from './render/ball';
import { BroadcastCamera } from './render/camera';
import { createPlayerView, updatePlayerView, type PlayerView } from './render/players';
import { buildStadium, type GoalView } from './render/stadium';
import { Match } from './sim/match';
import type { InputState, MatchEvent } from './sim/types';

const STEP = 1 / 60;
const $ = (id: string) => document.getElementById(id)!;

const RESTART_NAMES = { throwin: 'THROW-IN', corner: 'CORNER', goalkick: 'GOAL KICK' } as const;

export function startGame() {
  const canvas = $('game-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1d4a22, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 150;
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const goals: GoalView[] = buildStadium(scene);
  const ballView = new BallView(scene);
  const cam = new BroadcastCamera(window.innerWidth / window.innerHeight);

  let match = new Match();
  const views: PlayerView[] = match.players.map((p) => {
    const v = createPlayerView(p);
    scene.add(v.root);
    return v;
  });

  const audio = new MatchAudio();
  const hud = new Hud();
  const controls = new Controls($('joystick-zone'), $('joystick-thumb'), {
    A: $('btn-a'), B: $('btn-b'), C: $('btn-c'),
  });
  controls.onFirstGesture = () => audio.init();

  let started = false;
  let paused = false;
  let onBreak = false;
  let slowMo = 0;
  let netHit = false;
  let lastShotAt = -99;
  let elapsed = 0;
  let accumulator = 0;
  /** Test hook: input to feed instead of the real controls */
  let scriptedInput: Partial<InputState> | null = null;

  const startScreen = $('start-screen');
  const pauseMenu = $('pause-menu');
  const breakScreen = $('break-screen');
  const show = (el: HTMLElement, on: boolean) => el.classList.toggle('hidden-overlay', !on);

  $('btn-kickoff').addEventListener('click', () => {
    audio.init();
    show(startScreen, false);
    started = true;
    audio.whistle();
  });
  $('btn-pause').addEventListener('click', () => {
    if (!started || onBreak) return;
    paused = true;
    show(pauseMenu, true);
  });
  $('btn-resume').addEventListener('click', () => {
    paused = false;
    controls.clear();
    show(pauseMenu, false);
  });
  $('btn-sound').addEventListener('click', () => {
    audio.init();
    audio.setMuted(!audio.muted);
    $('btn-sound').querySelector('span')!.textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON';
    const icon = $('btn-sound').querySelector('i')!;
    icon.className = `fa-solid ${audio.muted ? 'fa-volume-xmark' : 'fa-volume-high'} mr-2`;
  });
  const restart = () => {
    match = new Match();
    paused = false;
    onBreak = false;
    show(pauseMenu, false);
    show(breakScreen, false);
    audio.whistle();
  };
  $('btn-restart').addEventListener('click', restart);
  $('btn-break').addEventListener('click', () => {
    if (match.phase === 'fulltime') {
      restart();
      return;
    }
    onBreak = false;
    show(breakScreen, false);
    match.startSecondHalf();
    audio.whistle();
  });

  const showBreak = (full: boolean) => {
    onBreak = true;
    $('break-title').textContent = full ? 'FULL TIME' : 'HALF TIME';
    $('break-score').textContent = `${match.score.home} - ${match.score.away}`;
    $('break-stats').innerHTML = renderStats(match);
    $('btn-break').textContent = full ? 'PLAY AGAIN' : 'SECOND HALF';
    show(breakScreen, true);
  };

  const handleEvent = (e: MatchEvent) => {
    switch (e.type) {
      case 'kick':
        if (e.kind === 'header') audio.header();
        else audio.kick(e.power);
        if (e.kind === 'shot' || (e.kind === 'header' && e.power > 14)) lastShotAt = elapsed;
        break;
      case 'goal': {
        audio.net();
        audio.cheer();
        netHit = false;
        slowMo = 1.1;
        const minute = Math.min(90, Math.floor(match.clock / 60) + 1);
        const who = e.scorer ? `${e.scorer.num} ${e.scorer.name.toUpperCase()}` : (e.team === 'home' ? 'BLUE LIONS' : 'RED EAGLES');
        hud.goal(e.team, `${who}  ${minute}'`);
        break;
      }
      case 'save':
        audio.ooh();
        hud.toast(e.caught ? 'CAUGHT!' : 'GREAT SAVE!', '#facc15');
        break;
      case 'post':
        audio.post();
        hud.toast('OFF THE POST!', '#f8fafc');
        break;
      case 'tackle':
        audio.tackle();
        if (e.won && e.player.team === 'home') hud.toast(e.slide ? 'SLIDE TACKLE!' : 'TACKLE WON', '#4ade80', 1);
        break;
      case 'whistle':
        if (e.reason === 'halftime') { audio.whistle(2); showBreak(false); }
        else if (e.reason === 'fulltime') { audio.whistle(3); showBreak(true); }
        else audio.whistle();
        break;
      case 'restart':
        hud.toast(RESTART_NAMES[e.kind], '#e2e8f0', 1.2);
        if (elapsed - lastShotAt < 3 && e.kind !== 'throwin') audio.ooh();
        break;
      default:
        break;
    }
  };

  const resize = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.resize(window.innerWidth / window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  let last = performance.now();

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += realDt;

    const running = started && !paused && !onBreak && !portrait.matches;
    let simDt = 0;
    if (running) {
      const scale = slowMo > 0 ? 0.35 : 1;
      slowMo = Math.max(0, slowMo - realDt);
      accumulator += realDt * scale;
      let first = true;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        simDt += STEP;
        const input = scriptedInput
          ? { move: new THREE.Vector3(), pressA: false, pressB: false, pressC: false, holdB: false, ...scriptedInput }
          : controls.read();
        if (!first) { input.pressA = input.pressB = input.pressC = false; }
        first = false;
        match.step(STEP, input);
        for (const e of match.events) handleEvent(e);
        if (onBreak) { accumulator = 0; break; }
      }
    } else {
      controls.clear();
    }

    // Net ripple when the ball reaches the back of the net
    const b = match.ball;
    if (b.inNet && !netHit && Math.abs(b.pos.z) > HALF_LENGTH + GOAL_DEPTH - 0.6) {
      netHit = true;
      const g = goals.find((gv) => gv.side === Math.sign(b.pos.z));
      g?.hit(b.pos.x, b.pos.y, 22);
    }
    for (const g of goals) g.update(realDt, elapsed);

    const celebrating = match.phase === 'goal' && b.inNet ? (b.inNet === 'home' ? 'away' : 'home') : null;
    const receiver = match.receiveAssist > 0 ? match.receiverId : null;
    match.players.forEach((p, i) => {
      updatePlayerView(views[i], p, simDt, {
        controlled: p.team === 'home' && p.id === match.controlledId,
        receiver: p.id === receiver && b.owner !== p,
        celebrate: celebrating ? (p.team === celebrating ? 'win' : 'lose') : null,
        time: elapsed,
      });
    });
    ballView.update(b, simDt, cam.camera, true);
    cam.update(match, realDt * (slowMo > 0 ? 0.6 : 1));

    // The crowd gets louder as the ball nears either goal
    const nearGoal = 1 - Math.min(1, (HALF_LENGTH - Math.abs(b.pos.z)) / 30);
    audio.setExcitement(match.phase === 'goal' ? 1 : nearGoal);

    hud.update(match, realDt);
    renderer.render(scene, cam.camera);
  };
  requestAnimationFrame(frame);

  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).__game = {
      get match() { return match; },
      start: () => { show(startScreen, false); started = true; },
      setInput: (i: Partial<InputState> | null) => { scriptedInput = i; },
      press: (k: 'A' | 'B' | 'C') => {
        const key = `press${k}` as 'pressA';
        scriptedInput = { ...(scriptedInput ?? {}), [key]: true };
        setTimeout(() => { if (scriptedInput) scriptedInput = { ...scriptedInput, [key]: false }; }, 20);
      },
    };
  }
}
