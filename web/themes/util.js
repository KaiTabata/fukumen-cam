// テーマ共通の小道具

// 4:3 のカメラ映像を 16:9 キャンバスへ cover で貼ったときの座標変換
export function videoToCanvas(nx, ny, W, H, vw = 640, vh = 480) {
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale, dh = vh * scale;
  return [nx * dw - (dw - W) / 2, ny * dh - (dh - H) / 2];
}

export function canvasToVideo(x, y, W, H, vw = 640, vh = 480) {
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale, dh = vh * scale;
  return [(x + (dw - W) / 2) / dw, (y + (dh - H) / 2) / dh];
}

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mixColor(a, b, k) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}

// 青白い破片・泡が漂う背景用パーティクル
export function makeParticles(n, W, H, rand) {
  const colors = ['#ffffff', '#ffffff', '#cfeaff', '#7cc4ff', '#3d8bff', '#1c56c8'];
  return Array.from({ length: n }, () => ({
    x: rand() * W, y: rand() * H, z: 0.25 + rand() * 0.75,
    kind: Math.floor(rand() * 4), size: 1.5 + rand() * 6,
    rot: rand() * 6.28, vr: (rand() - 0.5) * 1.2,
    vx: -8 - rand() * 14, vy: (rand() - 0.5) * 6,
    color: colors[Math.floor(rand() * colors.length)], ph: rand() * 6.28,
  }));
}

export function drawParticles(ctx, ps, s, W, H, energy = 0) {
  for (const p of ps) {
    const sp = (1 + energy * 2) * s.dt * p.z;
    p.x += p.vx * sp; p.y += p.vy * sp; p.rot += p.vr * s.dt;
    if (p.x < -10) p.x += W + 20;
    if (p.y < -10) p.y += H + 20; else if (p.y > H + 10) p.y -= H + 20;
    const sz = p.size * p.z;
    ctx.globalAlpha = (0.25 + 0.65 * p.z) * (0.6 + 0.4 * Math.sin(s.t * 2 + p.ph));
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = ctx.strokeStyle = p.color;
    if (p.kind === 0) ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    else if (p.kind === 1) { ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz, sz * 0.7); ctx.lineTo(-sz * 0.8, sz * 0.5); ctx.fill(); }
    else if (p.kind === 2) { ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, sz * 0.8, 0, 6.28); ctx.stroke(); }
    else ctx.fillRect(-sz * 1.4, -0.6, sz * 2.8, 1.2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// 曲面スクリーン風の横線
export function drawCurvedLines(ctx, W, H, { count = 16, bow = 0.14, color = 'rgba(130,195,235,0.18)' } = {}) {
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let k = 0; k < count; k++) {
    const y = H * (k + 0.5) / count;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 32) {
      const u = (x - W / 2) / (W / 2);
      const yy = y + (y - H / 2) * bow * u * u;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

export function drawCaption(ctx, W, H, label, sub, y, size = 44) {
  if (!label && !sub) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(160,220,255,0.8)'; ctx.shadowBlur = size * 0.27;
  ctx.fillStyle = '#eaf6ff';
  if (label) { ctx.font = `600 ${size}px "Hiragino Sans", sans-serif`; ctx.fillText(label, W / 2, y); }
  if (sub) { ctx.font = `400 ${size * 0.41}px "Helvetica Neue", sans-serif`; ctx.fillText(sub, W / 2, y + (label ? size * 0.7 : 0)); }
  ctx.restore();
}
