// 描画ページ: 入力（自前のカメラ・マイク or 中継サーバー）を受けて、選択中のテーマに描かせる
//   ブラウザで直接開く:   http://127.0.0.1:8732/?theme=beppan
//   OBS のブラウザソース: http://127.0.0.1:8732/?source=relay&hud=0
//     （theme を付けなければ、設定画面の「Zoomに出す見た目」に従う）
import './autoreload.js';
import { startInputs } from './inputs.js';
import { SCHEMA, defaults } from './settings-schema.js';
import { drawCaption } from './themes/util.js';
import beppan from './themes/beppan.js';
import hayato from './themes/hayato.js';

const THEMES = { beppan, hayato };
const params = new URLSearchParams(location.search);

// 論理座標は 1280x720 固定。実際の解像度は SCALE 倍（既定 1.5 = 1920x1080）
const W = 1280, H = 720;
const SCALE = Number(params.get('scale') ?? 1.5);
const canvas = document.getElementById('c');
canvas.width = W * SCALE; canvas.height = H * SCALE;
const ctx = canvas.getContext('2d');
ctx.baseScale = SCALE; // 背景のスプライト描画が setTransform で使う
const hud = document.getElementById('hud');
const hudText = document.getElementById('hudText');
const meter = document.querySelector('#meter i');
const startBtn = document.getElementById('start');

// 設定: settings-schema.js の既定値 ← 保存された値（定期的に読み直す）
//   本番（OBS）は /settings、設定画面のプレビュー（?cfg=draft）は反映前の下書き /settings/draft を使う
const SETTINGS_URL = params.get('cfg') === 'draft' ? '/settings/draft' : '/settings';
const cfg = defaults();
const REBUILD = SCHEMA.flatMap(g => g.items.filter(it => it.rebuild).map(it => `${g.id}.${it.key}`));
let cfgText = '';
async function loadSettings() {
  try {
    const text = await (await fetch(SETTINGS_URL, { cache: 'no-store' })).text();
    if (text === cfgText) return;
    cfgText = text;
    const next = { ...defaults(), ...JSON.parse(text) };
    const rebuild = REBUILD.some(k => next[k] !== cfg[k]) || next['output.look'] !== cfg['output.look'];
    Object.assign(cfg, next);
    if (rebuild) applyLook();
  } catch { /* サーバーなしで開いたときは既定値のまま */ }
}

// URL に theme があればそれを、無ければ設定の「Zoomに出す見た目」(theme:mode) を使う
let theme = beppan;
function applyLook() {
  const p = new URLSearchParams(params);
  let key = params.get('theme');
  if (!key) {
    const [t, m, ch] = cfg['output.look'].split(':');
    key = t; p.set('mode', m);
    if (ch) p.set('char', ch);
  }
  theme = THEMES[key] ?? beppan;
  theme.init(W, H, p, SCALE, cfg);
}
applyLook();
await loadSettings();
setInterval(loadSettings, 400);
let showText = true;

// 反応しきい値 = max(最小音量, 周囲の雑音レベル + 厳しさ)。雑音レベルは自動で追う
let floorDb = null;
const demo = params.get('demo') === '1';
const relay = params.get('source') === 'relay';
const state = { t: 0, dt: 0, level: 0, W, H, cfg };
const input = { db: -100, face: null, mask: null, camStatus: 'なし', micStatus: 'なし' };
let relayAt = 0;

if (relay) {
  const es = new EventSource('/events');
  es.onmessage = e => {
    const d = JSON.parse(e.data);
    if (!d.ts) return;
    relayAt = performance.now();
    input.db = d.db; input.face = d.face;
    input.camStatus = d.camStatus; input.micStatus = d.micStatus;
    if (d.mask) {
      const bin = atob(d.mask.b64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      input.mask = { w: d.mask.w, h: d.mask.h, data };
    } else input.mask = null;
  };
} else if (!demo || params.get('camera') !== 'off') {
  startInputs(input, {
    camera: params.get('camera') !== 'off',
    wantsMask: () => theme.wantsMask?.() ?? false,
  }).then(() => {
    if (input.audioCtx?.state === 'suspended') {
      startBtn.hidden = false;
      startBtn.onclick = () => { input.audioCtx.resume(); startBtn.hidden = true; };
    }
  });
}

function updateLevel() {
  state.face = input.face;
  state.mask = input.mask;
  if (demo) {
    state.level = Math.max(0, Math.sin(state.t * 1.7)) * (0.6 + 0.4 * Math.sin(state.t * 13));
    return;
  }
  // 中継が 1 秒途切れたら無音扱い
  const db = relay && performance.now() - relayAt > 1000 ? -100 : input.db;
  if (db > -99) floorDb = floorDb === null ? db : floorDb + (db - floorDb) * (db < floorDb ? 0.05 : 0.002);
  const gate = Math.max(cfg['common.gateMin'], (floorDb ?? -100) + cfg['common.gateMargin']);
  const target = Math.min(1, Math.max(0, (db - gate) / 20));
  state.level += (target - state.level) * (target > state.level ? 0.5 : 0.12);
}

// ---------- HUD・キー操作 ----------
let hudTimer = null;
function showHud(ms = 6000) {
  if (params.get('hud') === '0') return;
  hud.classList.remove('hidden');
  clearTimeout(hudTimer);
  if (params.get('hud') !== '1') hudTimer = setTimeout(() => hud.classList.add('hidden'), ms);
}
function renderHud() {
  if (hud.classList.contains('hidden')) return;
  const src = relay ? `中継（${performance.now() - relayAt < 1000 ? '受信中' : 'センサー未接続'}）` : demo ? 'デモ' : 'このページ';
  hudText.textContent =
    `テーマ: ${theme.name}${theme.modeLabel ? ' / ' + theme.modeLabel() : ''}\n入力: ${src}\n` +
    `カメラ: ${input.camStatus}${input.face ? '（顔検出中）' : ''}\nマイク: ${input.micStatus}\n` +
    `音量: ${input.db.toFixed(0)} dB / 雑音: ${(floorDb ?? -100).toFixed(0)} dB / 下限: ${cfg['common.gateMin']} dB\n` +
    `[1][2] テーマ  [M] モード  [T] 文字  [H] この表示  ／ 細かい設定は /settings.html`;
  meter.style.width = (state.level * 100).toFixed(0) + '%';
}

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'h') { hud.classList.contains('hidden') ? showHud(1e9) : hud.classList.add('hidden'); return; }
  if (k === '1' || k === '2') {
    theme = Object.values(THEMES)[Number(k) - 1];
    theme.init(W, H, params, SCALE, cfg);
  }
  if (k === 'm') theme.toggleMode?.();
  if (k === 't') showText = !showText;
  showHud();
});

// ---------- ループ ----------
let last = performance.now();
function frame(now) {
  state.dt = Math.min(0.05, (now - last) / 1000);
  state.t += state.dt;
  last = now;
  updateLevel();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  theme.draw(ctx, state);
  if (showText) {
    drawCaption(ctx, W, H, params.get('label') ?? cfg['common.label'], params.get('sub') ?? cfg['common.sub'],
      H * cfg['common.captionY'] / 100, cfg['common.captionSize']);
  }
  renderHud();
  requestAnimationFrame(frame);
}

if (params.get('hud') === '0') hud.classList.add('hidden');
showHud();
requestAnimationFrame(frame);
