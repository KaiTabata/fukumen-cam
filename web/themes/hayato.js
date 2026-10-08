// 画像キャラ（標準キャラ「AIモリモリ」と、登録キャラ c1〜c4）。
//   表情ごとに「口を閉じた / 開けた」画像を持ち、声に合わせて切り替えて口パクさせる（ない表情は通常の画像で代用）
//   char = builtin（同梱の標準キャラ）または c1〜c4（設定画面で登録したキャラ）
import { videoToCanvas } from './util.js';
import { makeField, drawFieldBack, drawFieldFront } from './field.js';
import { EXPRESSIONS, detectExpression, makeExpressionFilter, imageKey } from '../expressions.js';

// 同梱の標準キャラ
let builtin = null;
fetch('assets/default-char/manifest.json').then(r => r.json()).then(m => { builtin = m; }).catch(() => {});

export default {
  name: 'キャラ',
  init(W, H, params, scale = 1, cfg = {}) {
    this.W = W; this.H = H;
    this.char = params.get('char') || 'builtin';
    this.field = makeField(W, H, { seed: 5, density: cfg['field.density'] ?? 1, front: cfg['field.front'] ?? 1 });
    this.bounce = 0; this.blinkAt = 3; this.cx = W / 2;
    this.faceFilter = makeExpressionFilter();
    this.expr = 'normal'; this.exprAt = -1; this.autoNext = 6; this.autoUntil = 0;
  },

  // いまの表情を決める（手動 / 自分の表情に連動 / おまかせ）
  pickExpression(s) {
    const c = s.cfg, mode = c['expr.mode'];
    let next = 'normal';
    if (mode === 'manual') next = c['expr.current'];
    else if (mode === 'face') next = this.faceFilter(detectExpression(s.face?.shapes, c['expr.sensitivity']), s.t);
    else if (mode === 'auto') {
      // 数秒おきに、短い間だけ表情を変える。長く話していると笑顔・ドヤ顔が出やすい
      if (s.t > this.autoNext) {
        const pool = s.level > 0.3 ? ['smile', 'doya', 'smile', 'wink'] : ['smile', 'doya', 'think', 'wink', 'surprise', 'trouble'];
        this.autoExpr = pool[Math.floor(Math.random() * pool.length)];
        this.autoUntil = s.t + 2 + Math.random() * 2;
        this.autoNext = this.autoUntil + 5 + Math.random() * 8;
      }
      next = s.t < this.autoUntil ? this.autoExpr : 'normal';
    }
    if (!EXPRESSIONS.some(e => e.id === next)) next = 'normal';
    if (next !== this.expr) { this.expr = next; this.exprAt = s.t; }
    return this.expr;
  },

  // 表情・口の状態ごとの画像（読み込み中・未設定は null）
  frame(c, expr, state) {
    if (this.char === 'builtin') {
      const p = builtin?.images[`${expr}_${state}`];
      return p ? getFrame(p, builtin.keyOut, builtin.keyTol) : null;
    }
    const k = imageKey(this.char, expr, state);
    return k && c[k] ? getFrame(c[k], c[`${this.char}.keyOut`], c[`${this.char}.keyTol`]) : null;
  },

  draw(ctx, s) {
    const { W, H } = this;
    drawFieldBack(ctx, this.field, s, { energy: s.level * 0.4 });

    let tx = W / 2;
    if (s.face) tx += Math.max(-W * 0.4, Math.min(W * 0.4, (videoToCanvas(s.face.x, s.face.y, W, H)[0] - W / 2) * s.cfg['hayato.follow']));
    this.cx += (tx - this.cx) * 0.08;
    this.drawChara(ctx, s);

    drawFieldFront(ctx, this.field, s, { energy: s.level * 0.4 });
  },

  drawChara(ctx, s) {
    const { H } = this, c = s.cfg;
    // 話している間は小さく弾む。表情が変わった瞬間にも小さく弾ませる
    this.bounce += ((s.level > 0.15 ? 1 : 0) - this.bounce) * 0.1;
    const hop = Math.abs(Math.sin(s.t * 7)) * c['hayato.bounce'] * this.bounce;
    const expr = this.pickExpression(s);
    const since = s.t - this.exprAt;
    const pop = since < 0.25 ? 1 + 0.05 * Math.sin((since / 0.25) * Math.PI) : 1;
    const roll = s.face ? s.face.roll * 1.4 * c['hayato.follow'] : Math.sin(s.t * 0.7) * 0.02;

    this.blinkAt -= s.dt;
    const blinking = c['hayato.blink'] && this.blinkAt < 0.12;
    if (this.blinkAt < 0) this.blinkAt = 2.5 + Math.random() * 3;
    const talk = Math.min(1, s.level * c['hayato.mouth']) * (0.65 + 0.35 * Math.sin(s.t * 18));

    // 全表情の画像を先に読み込んでおく（切り替えた瞬間に読み込み待ちにならないように）
    for (const e of EXPRESSIONS) for (const st of ['closed', 'open', 'half', 'blink']) this.frame(c, e.id, st);
    const set = expr !== 'normal' && this.frame(c, expr, 'closed') ? expr : 'normal';
    const closed = this.frame(c, set, 'closed'), open = this.frame(c, set, 'open');
    const half = set === 'normal' ? this.frame(c, 'normal', 'half') : null;
    const blink = set === 'normal' ? this.frame(c, 'normal', 'blink') : null;
    let img = closed;
    if (blinking && blink && talk < 0.2) img = blink;
    else if (open && talk > (half ? 0.55 : 0.3)) img = open;
    else if (half && talk > 0.2) img = half;
    if (!img) return;

    const h = H * c['hayato.scale'] * pop, w = (img.width / img.height) * h;
    ctx.save();
    ctx.translate(this.cx, H * c['hayato.footY'] / 100 - hop);
    ctx.rotate(roll);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
  },
};

// 画像の読み込みと背景透過（四隅の平均色に近い色を消す）。結果はキャッシュする
const frames = new Map();
function getFrame(path, keyOut, tol) {
  const id = `${path}|${keyOut}|${tol}`;
  if (frames.has(id)) return frames.get(id);
  frames.set(id, null);
  const im = new Image();
  im.onload = () => {
    const cv = new OffscreenCanvas(im.naturalWidth, im.naturalHeight);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    if (keyOut) {
      const { width: w, height: h } = cv;
      const d = g.getImageData(0, 0, w, h);
      const px = d.data;
      let r = 0, gr = 0, b = 0, n = 0;
      for (const [x0, y0] of [[0, 0], [w - 4, 0], [0, h - 4], [w - 4, h - 4]]) {
        for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) {
          const i = (y * w + x) * 4;
          r += px[i]; gr += px[i + 1]; b += px[i + 2]; n++;
        }
      }
      r /= n; gr /= n; b /= n;
      const greenBg = gr > r + 40 && gr > b + 40;
      for (let i = 0; i < px.length; i += 4) {
        const dist = Math.hypot(px[i] - r, px[i + 1] - gr, px[i + 2] - b);
        if (dist < tol) px[i + 3] = 0;
        else if (dist < tol * 1.5) {
          px[i + 3] = Math.round(px[i + 3] * (dist - tol) / (tol * 0.5));
          // 緑背景のにじみを抑える
          if (greenBg) px[i + 1] = Math.min(px[i + 1], Math.max(px[i], px[i + 2]));
        }
      }
      g.putImageData(d, 0, 0);
    }
    frames.set(id, cv);
  };
  im.src = '/' + path;
  return null;
}
