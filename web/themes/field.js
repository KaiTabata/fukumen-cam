// LED スクリーン風の背景: 黒地に横線と同心円、ガラスの泡・白い宝石片・青いキューブが奥行きをもって漂う
import { mulberry32 } from './util.js';

const SPRITE = 96;

function sprite(draw, blur = 0) {
  const c = new OffscreenCanvas(SPRITE, SPRITE);
  const g = c.getContext('2d');
  if (blur) g.filter = `blur(${blur}px)`;
  g.translate(SPRITE / 2, SPRITE / 2);
  draw(g, SPRITE * 0.32);
  return c;
}

function gem(rand) {
  // 不規則な多角形をファセット（明暗の三角形）で塗る
  const n = 5 + Math.floor(rand() * 3);
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + rand() * 0.5;
    const r = 0.65 + rand() * 0.35;
    return [Math.cos(a) * r, Math.sin(a) * r * (0.7 + rand() * 0.3)];
  });
  return (g, R) => {
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      const l = 225 + Math.floor(rand() * 30);
      g.fillStyle = `rgb(${l},${l - 4},${l - 18})`;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(x1 * R, y1 * R); g.lineTo(x2 * R, y2 * R); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * R, y * R) : g.moveTo(x * R, y * R))); g.closePath(); g.stroke();
  };
}

function bubble(g, R) {
  g.fillStyle = 'rgba(40,80,160,0.22)';
  g.beginPath(); g.arc(0, 0, R, 0, 6.28); g.fill();
  const rim = g.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
  rim.addColorStop(0, 'rgba(120,170,255,0)'); rim.addColorStop(1, 'rgba(170,210,255,0.85)');
  g.fillStyle = rim; g.beginPath(); g.arc(0, 0, R, 0, 6.28); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.ellipse(-R * 0.38, -R * 0.42, R * 0.22, R * 0.13, -0.6, 0, 6.28); g.fill();
  g.fillStyle = 'rgba(200,230,255,0.5)';
  g.beginPath(); g.ellipse(R * 0.4, R * 0.45, R * 0.15, R * 0.07, -0.6, 0, 6.28); g.fill();
}

function cube(g, R) {
  const s = R * 0.8;
  g.fillStyle = '#1a3a9c'; g.fillRect(-s, -s * 0.6, s * 1.6, s * 1.6);
  g.fillStyle = '#4d7fe6';
  g.beginPath(); g.moveTo(-s, -s * 0.6); g.lineTo(-s * 0.6, -s); g.lineTo(s, -s); g.lineTo(s * 0.6, -s * 0.6); g.fill();
  g.fillStyle = '#10287a';
  g.beginPath(); g.moveTo(s * 0.6, -s * 0.6); g.lineTo(s, -s); g.lineTo(s, s * 0.6); g.lineTo(s * 0.6, s); g.fill();
}

function shard(g, R) {
  g.fillStyle = 'rgba(220,240,255,0.95)';
  g.beginPath(); g.moveTo(-R, -R * 0.15); g.lineTo(R * 0.9, -R * 0.35); g.lineTo(R, R * 0.1); g.lineTo(-R * 0.8, R * 0.25); g.fill();
}

export function makeField(W, H, { seed = 3, density = 1, front = 1 } = {}) {
  const rand = mulberry32(seed);
  const kinds = {
    gem: [0, 1, 2, 3].map(() => gem(rand)),
    bubble: [bubble], cube: [cube], shard: [shard],
  };
  const sharp = {}, soft = {};
  for (const [k, fns] of Object.entries(kinds)) {
    sharp[k] = fns.map(f => sprite(f));
    soft[k] = fns.map(f => sprite(f, 4));
  }
  // 塊になって漂う場所（画面右上と左下に多め）
  const clusters = [[0.78, 0.25, 0.18], [0.25, 0.7, 0.2], [0.55, 0.5, 0.3]];
  const place = () => {
    if (rand() < 0.45) return [rand() * W, rand() * H];
    const [cx, cy, sd] = clusters[Math.floor(rand() * clusters.length)];
    const g = () => (rand() + rand() + rand() - 1.5) * sd * 1.6;
    return [(cx + g()) * W, (cy + g()) * H];
  };
  const pick = arr => arr[Math.floor(rand() * arr.length)];

  const dots = Array.from({ length: Math.round(900 * density) }, () => {
    const [x, y] = place();
    return { x, y, r: 0.6 + rand() * 1.8, c: pick(['#1f45b8', '#2e5fd6', '#5d8ff0', '#9cc2ff', '#ffffff']), ph: rand() * 6.28, z: 0.2 + rand() * 0.3 };
  });
  const mk = (n, sizeMin, sizeMax, z0, z1, weights, blurred) => Array.from({ length: Math.round(n) }, () => {
    const [x, y] = place();
    const r = rand();
    const kind = r < weights[0] ? 'gem' : r < weights[1] ? 'bubble' : r < weights[2] ? 'cube' : 'shard';
    return {
      x, y, kind, img: pick((blurred ? soft : sharp)[kind]),
      size: sizeMin + rand() * (sizeMax - sizeMin), z: z0 + rand() * (z1 - z0),
      rot: rand() * 6.28, vr: (rand() - 0.5) * 0.6, ph: rand() * 6.28,
      vx: (rand() - 0.6) * 10, vy: (rand() - 0.5) * 6,
    };
  });
  return {
    W, H, dots,
    mid: mk(320 * density, 2.5, 10, 0.5, 0.8, [0.3, 0.5, 0.88], false),
    near: mk(14 * front, 14, 30, 0.9, 1.3, [0.5, 0.85, 0.95], true),
  };
}

function drawSprites(ctx, list, s, W, H, energy) {
  for (const p of list) {
    const sp = s.dt * p.z * (1 + energy * 2) * (s.cfg?.['field.speed'] ?? 1);
    p.x += p.vx * sp; p.y += p.vy * sp; p.rot += p.vr * s.dt;
    const m = p.size;
    if (p.x < -m) p.x += W + 2 * m; else if (p.x > W + m) p.x -= W + 2 * m;
    if (p.y < -m) p.y += H + 2 * m; else if (p.y > H + m) p.y -= H + 2 * m;
    const scale = (p.size * 3.1) / SPRITE;
    ctx.globalAlpha = Math.min(1, 0.55 + 0.45 * Math.sin(s.t * 0.8 + p.ph));
    ctx.setTransform(ctx.baseScale * scale * Math.cos(p.rot), ctx.baseScale * scale * Math.sin(p.rot),
      -ctx.baseScale * scale * Math.sin(p.rot), ctx.baseScale * scale * Math.cos(p.rot),
      ctx.baseScale * p.x, ctx.baseScale * p.y);
    ctx.drawImage(p.img, -SPRITE / 2, -SPRITE / 2);
  }
  ctx.setTransform(ctx.baseScale, 0, 0, ctx.baseScale, 0, 0);
  ctx.globalAlpha = 1;
}

// 奥（点・横線・中景の粒）を描く。手前のボケた粒は drawFieldFront で人物の上に重ねる
// lineRgb: 横線の色。濃さと背景色は設定画面の値を使う
export function drawFieldBack(ctx, f, s, { energy = 0, lineRgb = '165,185,220' } = {}) {
  const cfg = s.cfg ?? {};
  const { W, H } = f;
  ctx.fillStyle = cfg['field.bg'] ?? '#02040c'; ctx.fillRect(0, 0, W, H);

  for (const d of f.dots) {
    ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(s.t * 1.5 + d.ph));
    ctx.fillStyle = d.c;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.28); ctx.fill();
    d.x -= 3 * s.dt * d.z * (cfg['field.speed'] ?? 1); if (d.x < -2) d.x += W + 4;
  }
  ctx.globalAlpha = 1;

  // 横線（わずかに湾曲）と、中央の淡い同心円
  ctx.strokeStyle = `rgba(${lineRgb},${cfg['field.lines'] ?? 0.3})`; ctx.lineWidth = 1;
  for (let k = 0; k < 30; k++) {
    const y = H * (k + 0.5) / 30;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 32) {
      const u = (x - W / 2) / (W / 2);
      const yy = y + (y - H / 2) * 0.07 * u * u;
      x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(160,190,230,${cfg['field.circles'] ?? 0.09})`;
  for (const r of [260, 340, 430, 540]) { ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 6.28); ctx.stroke(); }

  drawSprites(ctx, f.mid, s, W, H, energy);
}

export function drawFieldFront(ctx, f, s, { energy = 0 } = {}) {
  drawSprites(ctx, f.near, s, f.W, f.H, energy);
}
