import * as THREE from 'three';
import {
  CENTRE_CIRCLE_RADIUS, FIELD_LENGTH, FIELD_WIDTH, GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH,
  HALF_LENGTH, HALF_WIDTH, PENALTY_DEPTH, PENALTY_WIDTH, SIX_YARD_DEPTH, SIX_YARD_WIDTH,
} from '../constants';

const LINE = 0.12;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildPitch(scene: THREE.Scene) {
  const margin = 9;
  const w = FIELD_WIDTH + margin * 2;
  const l = FIELD_LENGTH + margin * 2;
  // Mowing stripes across the pitch, with a little noise so it doesn't look flat
  const stripes = 18;
  const tex = canvasTexture(256, 1024, (ctx) => {
    const band = 1024 * (FIELD_LENGTH / stripes) / l;
    const start = 1024 * margin / l;
    ctx.fillStyle = '#2b7a32';
    ctx.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#2f8a37' : '#277130';
      ctx.fillRect(0, start + i * band, 256, band + 1);
    }
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)';
      ctx.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2);
    }
  });
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  // Surround (track) beyond the grass
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 60, l + 60),
    new THREE.MeshStandardMaterial({ color: 0x1d4f25, roughness: 1 }),
  );
  track.rotation.x = -Math.PI / 2;
  track.position.y = -0.02;
  scene.add(track);

  const lines = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
  const rect = (wx: number, lz: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wx, lz), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    lines.add(m);
  };
  const arc = (r: number, x: number, z: number, start = 0, len = Math.PI * 2) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - LINE / 2, r + LINE / 2, 64, 1, start, len), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    lines.add(m);
  };
  const disc = (r: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    lines.add(m);
  };

  rect(FIELD_WIDTH, LINE, 0, -HALF_LENGTH);
  rect(FIELD_WIDTH, LINE, 0, HALF_LENGTH);
  rect(LINE, FIELD_LENGTH, -HALF_WIDTH, 0);
  rect(LINE, FIELD_LENGTH, HALF_WIDTH, 0);
  rect(FIELD_WIDTH, LINE, 0, 0);
  arc(CENTRE_CIRCLE_RADIUS, 0, 0);
  disc(0.2, 0, 0);
  for (const side of [-1, 1]) {
    const line = side * HALF_LENGTH;
    rect(PENALTY_WIDTH, LINE, 0, line - side * PENALTY_DEPTH);
    rect(LINE, PENALTY_DEPTH, -PENALTY_WIDTH / 2, line - side * PENALTY_DEPTH / 2);
    rect(LINE, PENALTY_DEPTH, PENALTY_WIDTH / 2, line - side * PENALTY_DEPTH / 2);
    rect(SIX_YARD_WIDTH, LINE, 0, line - side * SIX_YARD_DEPTH);
    rect(LINE, SIX_YARD_DEPTH, -SIX_YARD_WIDTH / 2, line - side * SIX_YARD_DEPTH / 2);
    rect(LINE, SIX_YARD_DEPTH, SIX_YARD_WIDTH / 2, line - side * SIX_YARD_DEPTH / 2);
    const spotZ = line - side * 11;
    disc(0.15, 0, spotZ);
    // The "D": the part of the 9.15 m circle outside the box (ring angles are in the
    // plane's own frame, which is rotated so local +y points at world -z)
    const half = Math.acos((PENALTY_DEPTH - 11) / CENTRE_CIRCLE_RADIUS);
    const centre = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    arc(CENTRE_CIRCLE_RADIUS, 0, spotZ, centre - half, half * 2);
  }
  // Corner quarter circles, opening into the pitch
  for (const side of [-1, 1]) {
    for (const cx of [-1, 1]) {
      const start = side > 0 ? (cx > 0 ? Math.PI / 2 : 0) : (cx > 0 ? Math.PI : Math.PI * 1.5);
      arc(1, cx * HALF_WIDTH, side * HALF_LENGTH, start, Math.PI / 2);
    }
  }
  scene.add(lines);
}

const SPONSORS = ['RAM UP', 'BLUE LIONS', 'PLAY ON', 'RED EAGLES', 'GOAL TV', 'SUPER LEAGUE'];

function buildBoards(scene: THREE.Scene) {
  const tex = canvasTexture(2048, 64, (ctx) => {
    const seg = 2048 / SPONSORS.length;
    SPONSORS.forEach((name, i) => {
      const hue = (i * 57 + 200) % 360;
      ctx.fillStyle = `hsl(${hue} 70% 22%)`;
      ctx.fillRect(i * seg, 0, seg, 64);
      ctx.fillStyle = `hsl(${hue} 90% 72%)`;
      ctx.font = 'bold 40px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, i * seg + seg / 2, 34);
    });
  });
  tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const h = 0.9;
  const along = (len: number, x: number, z: number, rotY: number) => {
    const t = tex.clone();
    t.repeat.set(len / 40, 1);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat.clone());
    (m.material as THREE.MeshBasicMaterial).map = t;
    m.position.set(x, h / 2, z);
    m.rotation.y = rotY;
    scene.add(m);
  };
  // Touchline boards face into the pitch
  along(FIELD_LENGTH + 6, -HALF_WIDTH - 4, 0, Math.PI / 2);
  along(FIELD_LENGTH + 6, HALF_WIDTH + 4, 0, -Math.PI / 2);
  for (const side of [-1, 1]) {
    for (const half of [-1, 1]) {
      along(24, half * (GOAL_WIDTH / 2 + 15), side * (HALF_LENGTH + 4), side > 0 ? Math.PI : 0);
    }
  }
}

function crowdTexture() {
  const tex = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#1b2230';
    ctx.fillRect(0, 0, 512, 256);
    const colours = ['#1d4ed8', '#2563eb', '#f8fafc', '#dc2626', '#f59e0b', '#94a3b8', '#0f172a', '#e2e8f0', '#b91c1c', '#3b82f6'];
    for (let row = 0; row < 32; row++) {
      for (let col = 0; col < 96; col++) {
        if (Math.random() < 0.1) continue;
        ctx.fillStyle = colours[(Math.random() * colours.length) | 0];
        const x = col * 5.33 + Math.random() * 1.5;
        const y = row * 8 + Math.random() * 1.5;
        ctx.fillRect(x, y, 3.6, 3);
        ctx.fillStyle = 'rgba(230,190,160,0.9)';
        ctx.fillRect(x + 0.8, y - 2.2, 2, 2);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildStands(scene: THREE.Scene) {
  const crowd = crowdTexture();
  const structure = new THREE.MeshStandardMaterial({ color: 0x232b38, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.6, side: THREE.DoubleSide });

  // A raked tier of seats: a tilted plane with the crowd texture, plus a back wall and roof
  const tier = (len: number, depth: number, rise: number, place: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    const slope = Math.hypot(depth, rise);
    const t = crowd.clone();
    t.repeat.set(len / 30, slope / 8);
    t.needsUpdate = true;
    const seats = new THREE.Mesh(
      new THREE.PlaneGeometry(len, slope),
      new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }),
    );
    // Plane faces +z by default; tilt it back so it rises away from the pitch
    seats.rotation.x = -Math.atan2(depth, rise);
    seats.position.set(0, 1.5 + rise / 2, -depth / 2);
    g.add(seats);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, rise + 6, 1), structure);
    wall.position.set(0, (rise + 6) / 2, -depth - 0.5);
    g.add(wall);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(len, depth * 0.8), roofMat);
    roof.rotation.x = Math.PI / 2 - 0.12;
    roof.position.set(0, rise + 7, -depth * 0.55);
    g.add(roof);
    const front = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 0.6), structure);
    front.position.set(0, 0.75, 0);
    g.add(front);
    place(g);
    scene.add(g);
  };
  // Long sides (the far one at -x is what the broadcast camera looks at)
  // (each tier is built rising towards its local -z, so rotate that to face away from the pitch)
  tier(FIELD_LENGTH + 30, 22, 16, (g) => { g.position.set(-HALF_WIDTH - 8, 0, 0); g.rotation.y = Math.PI / 2; });
  tier(FIELD_LENGTH + 30, 22, 16, (g) => { g.position.set(HALF_WIDTH + 8, 0, 0); g.rotation.y = -Math.PI / 2; });
  // Ends behind the goals
  tier(FIELD_WIDTH + 30, 18, 13, (g) => { g.position.set(0, 0, -HALF_LENGTH - 9); g.rotation.y = 0; });
  tier(FIELD_WIDTH + 30, 18, 13, (g) => { g.position.set(0, 0, HALF_LENGTH + 9); g.rotation.y = Math.PI; });

  // Floodlight pylons
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HALF_WIDTH + 26);
      const z = sz * (HALF_LENGTH + 20);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 44, 8), towerMat);
      mast.position.set(x, 22, z);
      scene.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 1), lampMat);
      head.position.set(x, 44, z);
      head.lookAt(0, 0, 0);
      scene.add(head);
    }
  }
}

/** A goal with a net whose back panel bulges when the ball hits it */
export class GoalView {
  readonly side: number;
  private back: THREE.Mesh;
  private rest: Float32Array;
  private bulge = 0;
  private bulgeX = 0;
  private bulgeY = 0;

  constructor(scene: THREE.Scene, side: number) {
    this.side = side;
    const line = side * HALF_LENGTH;
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.2 });
    const r = 0.06;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_WIDTH + r * 2, 12), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_HEIGHT, line);
    bar.castShadow = true;
    g.add(bar);
    for (const px of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_HEIGHT, 12), postMat);
      post.position.set(px * GOAL_WIDTH / 2, GOAL_HEIGHT / 2, line);
      post.castShadow = true;
      g.add(post);
      // Rear stanchions
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, GOAL_HEIGHT, 6), postMat);
      back.position.set(px * GOAL_WIDTH / 2, GOAL_HEIGHT / 2, line + side * GOAL_DEPTH);
      g.add(back);
    }

    const netMat = new THREE.MeshBasicMaterial({
      color: 0xf4f4f4, wireframe: true, transparent: true, opacity: 0.55,
    });
    const backGeo = new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_HEIGHT, 30, 12);
    this.back = new THREE.Mesh(backGeo, netMat);
    this.back.position.set(0, GOAL_HEIGHT / 2, line + side * GOAL_DEPTH);
    g.add(this.back);
    this.rest = (backGeo.attributes.position.array as Float32Array).slice();

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_WIDTH, GOAL_DEPTH, 30, 8), netMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, GOAL_HEIGHT, line + side * GOAL_DEPTH / 2);
    g.add(roof);
    for (const px of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HEIGHT, 8, 12), netMat);
      wall.rotation.y = Math.PI / 2;
      wall.position.set(px * GOAL_WIDTH / 2, GOAL_HEIGHT / 2, line + side * GOAL_DEPTH / 2);
      g.add(wall);
    }
    scene.add(g);
  }

  /** Push the net out where the ball hit it */
  hit(x: number, y: number, strength: number) {
    this.bulgeX = x;
    this.bulgeY = y - GOAL_HEIGHT / 2;
    this.bulge = Math.max(this.bulge, Math.min(1.4, strength * 0.06));
  }

  update(dt: number, time: number) {
    if (this.bulge <= 0.001 && this.bulge !== 0) {
      this.bulge = 0;
    }
    const pos = this.back.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const wobble = Math.cos(time * 18) * 0.25 + 0.75;
    for (let i = 0; i < arr.length; i += 3) {
      const dx = this.rest[i] - this.bulgeX;
      const dy = this.rest[i + 1] - this.bulgeY;
      const fall = Math.exp(-(dx * dx + dy * dy) / 1.6);
      // PlaneGeometry's local z is world z here, so push away from the pitch
      arr[i + 2] = this.rest[i + 2] + this.side * this.bulge * fall * wobble;
    }
    pos.needsUpdate = true;
    this.bulge *= Math.exp(-2.5 * dt);
  }
}

export function buildStadium(scene: THREE.Scene): GoalView[] {
  scene.background = new THREE.Color(0x0d1626);
  scene.fog = new THREE.Fog(0x0d1626, 140, 260);
  buildPitch(scene);
  buildBoards(scene);
  buildStands(scene);
  return [new GoalView(scene, -1), new GoalView(scene, 1)];
}
