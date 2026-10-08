// タイル人型: ひし形タイルの人型。話すと頭のタイルが緑になって大小に脈打つ
// 大きさ・色などは設定画面の "beppan.*" で変えられる
import { videoToCanvas, canvasToVideo, mulberry32, mixColor } from './util.js';
import { makeField, drawFieldBack, drawFieldFront } from './field.js';
import { hexToRgb } from '../settings-schema.js';

export default {
  name: 'タイル人型',
  init(W, H, params, scale = 1, cfg = {}) {
    this.scale = scale;
    this.W = W; this.H = H;
    this.mode = params.get('mode') === 'silhouette' ? 'silhouette' : 'figure';
    const rand = mulberry32(7);
    this.field = makeField(W, H, { seed: 3, density: cfg['field.density'] ?? 1, front: cfg['field.front'] ?? 1 });
    this.tileRand = Array.from({ length: 4096 }, () => [rand() * 6.28, 6 + rand() * 7]);
    this.layer = new OffscreenCanvas(W * scale, H * scale);
    this.lctx = this.layer.getContext('2d');
  },
  wantsMask() { return this.mode === 'silhouette'; },
  toggleMode() { this.mode = this.mode === 'figure' ? 'silhouette' : 'figure'; },
  modeLabel() { return this.mode === 'figure' ? '人型（ドラマ再現）' : '本人シルエット'; },

  draw(ctx, s) {
    const { W, H } = this;
    const c = s.cfg;
    this.white = c['beppan.white'];
    this.whiteRgb = hexToRgb(c['beppan.white']);
    this.greenRgb = hexToRgb(c['beppan.green']);
    drawFieldBack(ctx, this.field, s, { energy: s.level * 0.3, lineRgb: '130,195,235' });

    // タイル（光のにじみ用に別レイヤーへ描いてから合成）
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, this.layer.width, this.layer.height);
    l.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.mode === 'figure') this.drawFigure(l, s);
    else this.drawSilhouette(l, s);
    if (c['beppan.glow'] > 0) {
      ctx.save();
      ctx.filter = 'blur(7px)'; ctx.globalAlpha = Math.min(1, c['beppan.glow']); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.layer, 0, 0, W, H);
      if (c['beppan.glow'] > 1) { ctx.globalAlpha = c['beppan.glow'] - 1; ctx.drawImage(this.layer, 0, 0, W, H); }
      ctx.restore();
    }
    ctx.drawImage(this.layer, 0, 0, W, H);

    drawFieldFront(ctx, this.field, s, { energy: s.level * 0.3 });
  },

  // 1枚のひし形タイル
  tile(l, x, y, h, color) {
    l.fillStyle = color;
    l.beginPath();
    l.moveTo(x, y - h); l.lineTo(x + h, y); l.lineTo(x, y + h); l.lineTo(x - h, y);
    l.closePath(); l.fill();
  },

  headStyle(s, idx, h) {
    const speak = Math.min(1, s.level * 2.2);
    const green = s.cfg['beppan.idleGreen'] ? Math.max(0.85, speak) : speak;
    const [ph, fr] = this.tileRand[idx % this.tileRand.length];
    const pulse = 1 + s.level * s.cfg['beppan.pulse'] * Math.sin(s.t * fr + ph);
    return [h * Math.max(0.3, pulse), mixColor(this.whiteRgb, this.greenRgb, green)];
  },

  drawFigure(l, s) {
    const { W, H } = this;
    const c = s.cfg;
    const a = c['beppan.size'], h = a * c['beppan.tile'];
    const follow = c['beppan.follow'];
    let dx = 0, dy = 0, roll = 0;
    if (s.face) {
      const [fx, fy] = videoToCanvas(s.face.x, s.face.y, W, H);
      dx = Math.max(-W * 0.4, Math.min(W * 0.4, (fx - W / 2) * follow));
      dy = Math.max(-H * 0.2, Math.min(H * 0.3, (fy - H * 0.45) * follow * 0.7));
      roll = s.face.roll * 1.4 * follow;
    } else {
      dx = Math.sin(s.t * 0.5) * 6; dy = Math.sin(s.t * 0.8) * 3;
    }
    const hx = W / 2 + dx, hy = H * c['beppan.headY'] / 100 + dy;

    // 頭: 4x4 のひし形の集まり
    l.save();
    l.translate(hx, hy); l.rotate(roll);
    let idx = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const [hh, col] = this.headStyle(s, idx++, h);
      this.tile(l, (i - j) * a, (i + j - 3) * a, hh, col);
    }
    l.restore();

    // 胴体: 首から肩へ広がり、画面下まで続く
    const body = c['beppan.body'];
    const bx = W / 2 + dx * 0.6, by = hy + 5 * a;
    for (let n = 0; by + n * a < H + a; n++) {
      const half = Math.min(body, 1.2 + n * 1.45);
      for (let m = -Math.floor(half); m <= half; m++) {
        if ((m + n) % 2) continue;
        this.tile(l, bx + m * a, by + n * a, h, this.white);
      }
    }
  },

  drawSilhouette(l, s) {
    const { W, H } = this;
    const mask = s.mask;
    if (!mask) { this.drawFigure(l, s); return; }
    const a = s.cfg['beppan.silSize'], h = a * Math.min(1, s.cfg['beppan.tile'] + 0.08);
    const oval = s.face ? s.face.oval.map(p => videoToCanvas(p.x, p.y, W, H)) : null;
    let idx = 0;
    for (let n = 0; n * a < H + a; n++) {
      for (let m = n % 2; m * a < W + a; m += 2) {
        const x = m * a, y = n * a;
        const [u, v] = canvasToVideo(x, y, W, H);
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const conf = mask.data[Math.floor(v * mask.h) * mask.w + Math.floor(u * mask.w)];
        if (conf < 128) continue;
        if (oval && inPolygon(oval, x, y)) {
          const [hh, col] = this.headStyle(s, idx++, h);
          this.tile(l, x, y, hh, col);
        } else {
          this.tile(l, x, y, h, this.white);
        }
      }
    }
  },
};

function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
