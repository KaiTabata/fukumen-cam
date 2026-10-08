// 設定画面のロジック。
// - 値の定義は settings-schema.js、画面の構成（どの項目をどのカテゴリに出すか）はこのファイルの CATEGORIES
// - 変更は下書き（/settings/draft）に保存し、「Zoomに反映」で本番（/settings）へまとめて反映する
// - モニターなど Zoom に影響しない項目（グループに instant: true）は即座に本番へ書く
import './autoreload.js';
import { SCHEMA, defaults } from './settings-schema.js';
import { basePrompts, SPEC, IMPORT_STEPS, expressionPrompts, SHEETS, sheetLayout, sheetPrompt } from './prompts.js';
import { sliceSheet } from './sheet.js';
import { mountVoiceTest } from './voicetest.js';
import { EXPRESSIONS, MOUTH_STATES, CHAR_SLOTS, detectExpression, imageKey, guessSlot } from './expressions.js';
import { VOICE_PROFILES, profileForLook, voiceCfg } from './voiceprofile.js';

const $ = id => document.getElementById(id);
const DEF = defaults();
const ITEM = {};       // key → { it, group }
for (const g of SCHEMA) for (const it of g.items) ITEM[`${g.id}.${it.key}`] = { it, group: g };

// 項目ごとの補足説明（DADS のサポートテキスト）
const HINTS = {
  'v.pitch': 'マイナスで低い声、プラスで高い声になります。低い声は -5 前後、少年っぽい声は +4 前後が目安です。',
  'v.robot': '0 で通常の声。上げるほど無線機を通したような機械的な声になります。',
  'v.lowpass': '値を下げると、こもった声になります。',
  'v.highpass': '値を上げると、低音が削れて軽い声になります。',
  'voice.gate': 'オンにすると、話していない間は Zoom に音を送りません（キーボード音や環境音のカット）。',
  'common.gateMargin': '大きくすると、はっきりした声だけを「話している」と判定します。環境音で反応してしまうときに上げてください。',
  'common.gateMin': 'これより小さい音は、常に「話していない」として扱います。',
  'voice.noise': 'Chrome 内蔵のノイズ除去です。マイクを開き直すため、反映時に一瞬音が途切れます。',
  'voice.mic': '変更すると、反映時にマイクを開き直します。',
  'monitor.enabled': 'スピーカーで聞くとハウリングします。必ずイヤホンかヘッドホンを選んでください。',
  'common.label': '空欄にすると表示しません。',
  'beppan.follow': '0 にすると、顔を動かしても人型は動きません。',
  'beppan.idleGreen': 'オフのときは、話している間だけ頭が緑になります。',
  'c.voice': 'このキャラを Zoom に出しているときに使う声です。声の中身は「声」で調整します。',
  'c.keyOut': '画像の四隅と同じ色を透明にします。背景を真緑にした画像に向いています。',
  'c.keyTol': '緑のフチが残るときは上げ、キャラの一部が消えるときは下げてください。',
  'field.front': '人物より手前を流れる、ぼけた粒の量です。',
  'prompt.ref': '入れると「このキャラにそっくりに」という指示がプロンプトに入ります。空欄なら、オリジナルの青いちびキャラのプロンプトになります。',
  'expr.revert': '例えば 5 にすると、「驚き」などを押してから 5 秒後に通常の顔へ戻ります。',
  'expr.sensitivity': '「自分の表情に連動」のときに使います。上げると小さな表情の変化でも切り替わり、下げるとはっきりした表情のときだけ切り替わります。',
};

// 見た目の一覧（登録キャラは、通常・口を閉じた画像があるものだけ選べる）
const normLook = l => (l === 'hayato:chara' ? 'hayato:chara:builtin' : l);
const charReady = id => !!values[imageKey(id, 'normal', 'closed')];
function availableLooks() {
  const list = [
    { look: 'beppan:figure', name: 'タイル人型', short: 'タイル人型', desc: 'ひし形タイルの人型。話すと頭が緑に光ります。' },
    { look: 'beppan:silhouette', name: 'タイル人型（本人シルエット）', short: 'シルエット', desc: 'カメラに映る自分の形をタイルで表示します。' },
    { look: 'hayato:chara:builtin', name: 'AIモリモリ（標準キャラ）', short: 'AIモリモリ', desc: 'アプリに入っている標準のキャラ。8 種類の表情が使えます。' },
  ];
  for (const id of CHAR_SLOTS) if (charReady(id)) {
    const n = values[`${id}.name`];
    list.push({ look: `hayato:chara:${id}`, name: n, short: n, desc: `登録キャラ（画像）。${EXPRESSIONS.filter(e => values[imageKey(id, e.id, 'closed')]).length} / ${EXPRESSIONS.length} 表情の画像あり。` });
  }
  return list;
}
const lookName = look => availableLooks().find(l => l.look === normLook(look))?.name ?? look;
const profileLabel = id => VOICE_PROFILES.find(p => p.id === id)?.label ?? id;

const keysOf = id => SCHEMA.find(g => g.id === id).items.map(it => `${id}.${it.key}`);
const CATEGORIES = [
  { id: 'setup', title: 'はじめに', lead: 'ふくめんカメラを Zoom などで使うための準備です。上から順に確認してください。', custom: 'setup' },
  { group: '本番' },
  { id: 'output', title: '出力する見た目', lead: 'Zoom に映す見た目を選びます。選んだあと「Zoomに反映」で切り替わります。', custom: 'output' },
  { id: 'voice', title: '声', lead: '見た目ごとに声を使い分けます。Zoom に出している見た目に合わせて、声も自動で切り替わります。', custom: 'voice',
    allKeys: [...['voice', 'voice_h', 'voice_x'].flatMap(p => ['enabled', 'pitch', 'robot', 'robotHz', 'lowpass', 'highpass', 'volume'].map(k => `${p}.${k}`))],
    sections: [
      { title: '話している判定と環境音（すべての声で共通）', keys: ['voice.gate', 'common.gateMargin', 'common.gateMin', 'voice.noise'] },
      { title: 'マイク（すべての声で共通）', keys: ['voice.mic'] },
    ] },
  { id: 'expr', title: 'キャラの表情', lead: '表情は反映ボタンを待たずに、すぐ Zoom に出ます。キーボードの 1〜8 でも切り替えられます（入力欄にカーソルがないとき）。',
    preview: 'hayato:chara', custom: 'expr', sections: [{ title: '細かい設定', keys: ['expr.revert', 'expr.sensitivity'] }] },
  { id: 'monitor', title: 'モニター', lead: 'Zoom に出ている声を、手元のイヤホンで聞きます。この設定は Zoom に影響しないため、すぐに切り替わります。', keys: keysOf('monitor') },
  { id: 'text', title: '画面の文字', lead: '画面に重ねて表示する文字です（例: 接触コード：32118）。', keys: ['common.label', 'common.sub', 'common.captionY', 'common.captionSize'] },
  { group: '見た目' },
  { id: 'beppan', title: 'タイル人型', lead: 'ひし形タイルの人型の大きさ・色・動きです。', preview: 'beppan', keys: keysOf('beppan') },
  { id: 'hayato', title: 'キャラの表示', lead: 'キャラ（AIモリモリ・登録キャラ）の大きさ・位置・動きです。', preview: 'hayato:chara',
    keys: ['hayato.scale', 'hayato.footY', 'hayato.follow', 'hayato.mouth', 'hayato.bounce', 'hayato.blink'] },
  { id: 'chars', title: 'キャラの登録', lead: '画像生成 AI で作ったキャラを 4 人まで登録できます。登録したキャラは「出力する見た目」で選べます。', custom: 'chars',
    allKeys: CHAR_SLOTS.flatMap(keysOf) },
  { id: 'field', title: '背景', lead: 'どの見た目にも共通の背景（横線と漂う粒）です。', keys: keysOf('field') },
  { group: 'その他' },
  { id: 'uninstall', title: 'アンインストール', lead: 'ふくめんカメラをこのパソコンから削除します。OBS に加えた設定も元に戻します。', custom: 'uninstall' },
];
const CATS = CATEGORIES.filter(c => c.id);
const catKeys = c => [...(c.keys ?? []), ...(c.allKeys ?? []), ...(c.sections ?? []).flatMap(s => s.keys), ...(c.id === 'output' ? ['output.look'] : [])];
// 変更一覧に出す名前（キャラや声の項目は、どのキャラ・どの声のものか分かるように）
function keyLabel(k) {
  const m = ITEM[k];
  if (!m) return k;
  if (k === 'output.look') return '出力する見た目';
  if (m.group.char) return `${values[`${m.group.id}.name`]}：${m.it.label}`;
  if (m.group.id.startsWith('voice') && !['gate', 'noise', 'mic'].includes(m.it.key)) return `${m.group.title}：${m.it.label}`;
  return m.it.label;
}

let values = { ...DEF }, liveValues = { ...DEF };
let current = null;                 // 表示中のカテゴリ
let previewLook = 'beppan:figure';  // プレビューに出している見た目
const fields = {};                  // key → { render() } 表示中の項目だけ

// ---------- 保存 ----------
const diffOf = v => Object.fromEntries(Object.entries(v).filter(([k, x]) => DEF[k] !== x));
let saveTimer = null;
function save() {
  refreshDirty();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fetch('/settings/draft', { method: 'POST', body: JSON.stringify(diffOf(values)) }).catch(() => {}), 150);
}
const instantTimers = {};
function saveInstant(key) {
  liveValues[key] = values[key];
  clearTimeout(instantTimers[key]);
  instantTimers[key] = setTimeout(() => {
    fetch('/settings/instant', { method: 'POST', body: JSON.stringify({ [key]: values[key] === DEF[key] ? null : values[key] }) });
  }, 100);
}
function setValue(key, v) {
  values[key] = v;
  if (key === 'prompt.ref') dispatchEvent(new Event('prompt-ref'));
  if (ITEM[key]?.group.instant) saveInstant(key);
  save();
}

const changedKeys = () => Object.keys(DEF).filter(k => values[k] !== liveValues[k]);

function refreshDirty() {
  const changed = changedKeys();
  const n = changed.length;
  $('apply').disabled = $('discard').disabled = n === 0;
  $('applyCount').hidden = n === 0;
  $('applyCount').textContent = n;
  const banner = $('banner');
  if (n) {
    banner.hidden = false;
    banner.classList.remove('success');
    $('bannerTitle').textContent = `反映していない変更が ${n} 件あります`;
    const names = changed.map(keyLabel);
    $('bannerText').textContent = `${names.slice(0, 4).join('、')}${names.length > 4 ? ' ほか' : ''}。プレビューにだけ表示されています。`;
  } else if (!banner.classList.contains('success')) {
    banner.hidden = true;
  }
  // メニューの件数と、各項目の「未反映」
  for (const c of CATS) {
    const dot = document.querySelector(`[data-cat="${c.id}"] .pending-dot`);
    const cn = catKeys(c).filter(k => changed.includes(k)).length;
    if (dot) { dot.hidden = cn === 0; dot.textContent = cn; }
  }
  for (const [key, f] of Object.entries(fields)) f.pending.hidden = !changed.includes(key);
  renderTabs();
}

function showSuccess(title, text) {
  const banner = $('banner');
  banner.hidden = false;
  banner.classList.add('success');
  $('bannerTitle').textContent = title;
  $('bannerText').textContent = text;
  setTimeout(() => { banner.classList.remove('success'); refreshDirty(); }, 3000);
}

$('apply').onclick = async () => {
  clearTimeout(saveTimer);
  await fetch('/settings/draft', { method: 'POST', body: JSON.stringify(diffOf(values)) });
  await fetch('/settings/apply', { method: 'POST' });
  liveValues = { ...values };
  showSuccess('Zoomに反映しました', 'いまの設定が Zoom に出ています。');
  refreshDirty();
};
$('discard').onclick = async () => {
  clearTimeout(saveTimer);
  await fetch('/settings/discard', { method: 'POST' });
  values = { ...liveValues };
  renderCategory(current);
  showSuccess('変更を取り消しました', 'Zoom に出ている設定に戻しました。');
  refreshDirty();
};
addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !$('apply').disabled) $('apply').click();
});

// ---------- 項目の部品 ----------
let uid = 0;
function field(key) {
  const { it, group } = ITEM[key];
  const id = `f${++uid}`;
  const el = document.createElement('div');
  el.className = 'field';
  const generic = key.replace(/^voice(_[hx])?\./, 'v.').replace(/^c\d\./, 'c.');
  const hint = HINTS[key] ?? HINTS[generic] ?? (it.type === 'text' ? '' : it.hint ?? '');
  const head = `<div class="field-head"><label class="label" for="${id}">${it.label}</label><span class="pending" hidden>未反映</span></div>`;
  const support = hint ? `<p class="support">${hint}</p>` : '';
  const foot = it.type !== 'check' && it.type !== 'image' ? '<div class="field-foot"><button class="btn btn-tertiary btn-xs reset" hidden></button></div>' : '';
  let render;

  if (it.type === 'range') {
    el.innerHTML = `${head}${support}<div class="range-row"><input type="range" id="${id}" min="${it.min}" max="${it.max}" step="${it.step}">
      <input class="input num" type="number" min="${it.min}" max="${it.max}" step="${it.step}" aria-label="${it.label}の値"></div>${foot}`;
    const [range, num] = el.querySelectorAll('input');
    range.oninput = () => { num.value = range.value; setValue(key, Number(range.value)); renderFoot(); };
    num.onchange = () => {
      const v = Math.min(it.max, Math.max(it.min, Number(num.value)));
      if (!Number.isNaN(v)) { range.value = v; num.value = v; setValue(key, v); renderFoot(); }
    };
    render = () => { range.value = values[key]; num.value = values[key]; };
  } else if (it.type === 'check') {
    el.innerHTML = `<label class="switch" for="${id}"><span><span class="label">${it.label}</span>
      <span class="pending" hidden>未反映</span>${hint ? `<span class="support" style="display:block">${hint}</span>` : ''}</span>
      <input type="checkbox" role="switch" id="${id}"><span class="track" aria-hidden="true"><span class="thumb"></span></span></label>`;
    const cb = el.querySelector('input');
    cb.onchange = () => setValue(key, cb.checked);
    render = () => { cb.checked = !!values[key]; };
  } else if (it.type === 'text') {
    el.innerHTML = `${head}${support}<input class="input" type="text" id="${id}" placeholder="${it.hint ?? ''}">${foot}`;
    const inp = el.querySelector('input');
    inp.oninput = () => { setValue(key, inp.value); renderFoot(); };
    render = () => { inp.value = values[key]; };
  } else if (it.type === 'color') {
    el.innerHTML = `${head}${support}<div class="color-row"><input type="color" id="${id}"><code></code></div>${foot}`;
    const inp = el.querySelector('input'), code = el.querySelector('code');
    inp.oninput = () => { code.textContent = inp.value; setValue(key, inp.value); renderFoot(); };
    render = () => { inp.value = values[key]; code.textContent = values[key]; };
  } else if (it.type === 'select' || it.type === 'device' || it.type === 'outdevice') {
    el.innerHTML = `${head}${support}<select class="select" id="${id}"></select>${foot}`;
    const sel = el.querySelector('select');
    sel.onchange = () => { setValue(key, sel.value); renderFoot(); };
    render = () => {
      const opts = it.type === 'select' ? it.options
        : [['', it.type === 'device' ? '既定のマイク（macOS の設定）' : '既定の出力（macOS の設定）'],
          ...(it.type === 'device' ? devices.inputs : devices.outputs).map(l => [l, l])];
      if (values[key] && !opts.some(([v]) => v === values[key])) opts.push([values[key], `${values[key]}（未接続）`]);
      sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
      sel.value = values[key];
    };
  } else if (it.type === 'image') {
    const slot = { required: key === 'hayato.imgClosed' || key === 'hayato.imgOpen' };
    el.innerHTML = `${head}${support}<div class="image-row"><span class="thumb-box"></span>
      <div class="image-actions"><button class="btn btn-secondary btn-sm pick">画像を選択</button>
      <button class="btn btn-tertiary btn-xs remove">画像を外す</button>
      <span class="support" style="margin:0">${slot?.required ? '必須' : '任意'}</span></div>
      <input type="file" id="${id}" accept="image/png,image/jpeg,image/webp" hidden></div>`;
    const file = el.querySelector('input'), box = el.querySelector('.thumb-box'), remove = el.querySelector('.remove');
    el.querySelector('.pick').onclick = () => file.click();
    file.onchange = async () => { if (file.files[0]) await uploadImage(key, it.name, file.files[0]); file.value = ''; };
    remove.onclick = () => { setValue(key, ''); render(); };
    render = () => {
      box.innerHTML = values[key] ? `<img class="thumb" alt="" src="/${values[key]}">` : '<span class="thumb empty">未設定</span>';
      remove.hidden = !values[key];
    };
  }

  const resetBtn = el.querySelector('.reset');
  function renderFoot() {
    if (!resetBtn) return;
    const isDef = values[key] === DEF[key];
    resetBtn.hidden = isDef;
    const shown = it.type === 'select' ? (it.options.find(o => o[0] === DEF[key])?.[1] ?? DEF[key]) : (DEF[key] === '' ? '空欄' : DEF[key]);
    resetBtn.textContent = `初期値（${shown}）に戻す`;
  }
  resetBtn?.addEventListener('click', () => { setValue(key, DEF[key]); render(); renderFoot(); });
  const pending = el.querySelector('.pending');
  fields[key] = { render: () => { render(); renderFoot(); }, pending };
  render(); renderFoot();
  return el;
}

// ---------- カテゴリの表示 ----------
function buildNav() {
  const ul = $('nav');
  for (const c of CATEGORIES) {
    const li = document.createElement('li');
    if (c.group) { li.className = 'group-label'; li.textContent = c.group; ul.appendChild(li); continue; }
    li.innerHTML = `<a href="#${c.id}" data-cat="${c.id}"><span>${c.title}</span><span class="pending-dot" hidden></span></a>`;
    ul.appendChild(li);
  }
}

function renderCategory(id) {
  const c = CATS.find(x => x.id === id) ?? CATS[0];
  current = c.id;
  for (const k of Object.keys(fields)) delete fields[k];
  document.querySelectorAll('.nav a').forEach(a => { if (a.dataset.cat !== c.id) a.removeAttribute('aria-current'); else a.setAttribute('aria-current', 'page'); });

  const panel = $('panel');
  panel.innerHTML = `<h2>${c.title}</h2><p class="lead">${c.lead}</p>`;
  if (c.custom === 'output') panel.appendChild(outputChooser());
  if (c.custom === 'expr') panel.appendChild(exprPanel());
  if (c.custom === 'voice') panel.appendChild(voicePanel());
  if (c.custom === 'setup') panel.appendChild(setupPanel());
  if (c.custom === 'uninstall') panel.appendChild(uninstallPanel());
  let kitParts = null;
  if (c.custom === 'chars') {
    panel.appendChild(charPicker());
    kitParts = kit(editChar);
    const head = document.createElement('section');
    head.className = 'section';
    head.innerHTML = `<h3>${esc(values[`${editChar}.name`])} の設定</h3>`;
    for (const k of ['name', 'voice', 'keyOut', 'keyTol']) head.appendChild(field(`${editChar}.${k}`));
    panel.appendChild(head);
    setPreview(charReady(editChar) ? `hayato:chara:${editChar}` : 'hayato:chara:builtin');
  }
  if (kitParts) panel.appendChild(kitParts.top);
  const sections = c.sections ?? (c.keys ? [{ keys: c.keys }] : []);
  for (const s of sections) {
    const sec = document.createElement('section');
    sec.className = 'section';
    if (s.title) sec.innerHTML = `<h3>${s.title}</h3>`;
    for (const key of s.keys) sec.appendChild(field(key));
    panel.appendChild(sec);
  }
  if (kitParts) panel.appendChild(kitParts.bottom);
  panel.scrollTop = 0;
  if (c.preview === 'hayato:chara') {
    const out = normLook(values['output.look']);
    setPreview(out.startsWith('hayato') ? out : (previewLook.startsWith('hayato') ? previewLook : 'hayato:chara:builtin'));
  } else if (c.preview) setPreview(previewLook.startsWith(c.preview) ? previewLook : `${c.preview}:figure`);
  refreshDirty();
}

function outputChooser() {
  const box = document.createElement('div');
  box.className = 'choices';
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', '出力する見た目');
  const draw = () => {
    const cur = normLook(values['output.look']), live = normLook(liveValues['output.look']);
    box.innerHTML = availableLooks().map(({ look, name, desc }) => `
      <label class="choice ${cur === look ? 'checked' : ''}">
        <input type="radio" name="look" value="${look}" ${cur === look ? 'checked' : ''}>
        <span><span class="name">${esc(name)}</span><br><span class="desc">${esc(desc)} 声：${profileLabel(profileForLook(values, look))}</span></span>
        <span>${live === look ? '<span class="badge ng">Zoomに出力中</span>' : ''}</span>
      </label>`).join('') + `<p class="support">キャラを増やすときは「キャラの登録」で画像を取り込んでください。</p>`;
    box.querySelectorAll('input').forEach(r => r.onchange = () => { setValue('output.look', r.value); setPreview(r.value); draw(); });
  };
  draw();
  fields['output.look'] = { render: draw, pending: { set hidden(v) {} } };
  const wrap = document.createElement('div');
  wrap.appendChild(box);
  return wrap;
}

// ---------- はじめに（セットアップの確認）----------
let lastSensor = null;
function setupPanel() {
  const wrap = document.createElement('div');
  const win = navigator.userAgent.includes('Windows');
  const audio = win
    ? { name: 'VB-CABLE', url: 'https://vb-audio.com/Cable/', zoomMic: 'CABLE Output (VB-Audio Virtual Cable)' }
    : { name: 'BlackHole 2ch', url: 'https://existential.audio/blackhole/', zoomMic: 'BlackHole 2ch' };
  const step = (ok, title, body) => `<li class="step ${ok === true ? 'ok' : ok === false ? 'ng' : ''}">
    <span class="mark" aria-hidden="true">${ok === true ? '✓' : ok === false ? '!' : '・'}</span>
    <div><b>${title}</b>${ok === true ? ' <span class="chip-ok">OK</span>' : ''}<div class="support">${body}</div></div></li>`;
  let busy = false;
  async function draw() {
    let st = null;
    try { st = await (await fetch('/system/status', { cache: 'no-store' })).json(); } catch {}
    if (!wrap.isConnected && wrap.dataset.drawn) return;
    wrap.dataset.drawn = '1';
    const v = lastSensor?.voice ?? {};
    const audioOk = lastSensor ? !v.error && !!v.out : null;
    const camOk = lastSensor ? lastSensor.camStatus === 'OK' : null;
    const micOk = lastSensor ? !!v.in && !v.error : null;
    const o = st?.obs;
    wrap.innerHTML = !st?.obs ? '<div class="card"><b>この画面はアプリ版で使えます。</b></div>' : `
      <ol class="steps-check">
        ${step(audioOk, `仮想オーディオ（${audio.name}）`, audioOk
          ? `加工した声を「${esc(v.out)}」へ送っています。`
          : `声を Zoom に渡すための無料のソフトです。<a href="${audio.url}" target="_blank" rel="noopener">${audio.name} のダウンロードページ</a>からインストールし、このアプリを再起動してください。${v.error ? `<br>（${esc(v.error)}）` : ''}`)}
        ${step(o.installed ? (o.initialized ? true : false) : false, 'OBS Studio', !o.installed
          ? '仮想カメラのために使う無料のソフトです。<a href="https://obsproject.com/ja/download" target="_blank" rel="noopener">OBS のダウンロードページ</a>からインストールしてください。'
          : !o.initialized ? 'OBS を一度起動して、最初の「自動構成ウィザード」を終えてから閉じてください。' : 'インストール済みです。')}
        ${step(o.configured, 'OBS の自動設定', o.configured
          ? 'ふくめんカメラ用の設定が済んでいます。OBS の画面を操作する必要はありません。'
          : `ボタンを押すと、OBS にふくめんカメラ用のシーンを追加し、仮想カメラを開始します（OBS が起動中の場合は一度閉じます）。<br><button class="btn btn-primary btn-sm" data-act="obs-setup" ${o.installed && o.initialized ? '' : 'disabled'}>OBS を自動設定する</button>`)}
        ${step(o.configured ? o.virtualCam : null, '仮想カメラ', o.virtualCam
          ? '映像を送っています。'
          : `開始していません。<button class="btn btn-secondary btn-sm" data-act="obs-start" ${o.configured ? '' : 'disabled'}>仮想カメラを開始</button>`)}
        ${step(camOk && micOk ? true : lastSensor ? false : null, 'カメラとマイク', camOk && micOk
          ? `マイク：${esc(v.in)}`
          : win ? 'Windows の「設定 → プライバシーとセキュリティ → カメラ / マイク」で、デスクトップアプリのアクセスを許可してください。'
            : 'macOS の「システム設定 → プライバシーとセキュリティ → カメラ / マイク」で、ふくめんカメラを許可してください。')}
        ${step(null, 'Zoom の設定', `ビデオのカメラを <b>OBS Virtual Camera</b>、オーディオのマイクを <b>${audio.zoomMic}</b> にしてください。Google Meet や Teams でも同じです。`)}
      </ol>
      <p class="support" id="setupMsg"></p>`;
    wrap.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = async () => {
        if (busy) return;
        busy = true; b.disabled = true;
        const msg = wrap.querySelector('#setupMsg');
        msg.textContent = b.dataset.act === 'obs-setup' ? 'OBS を設定しています…（30 秒ほどかかることがあります）' : '仮想カメラを開始しています…';
        const r = await (await fetch(`/system/${b.dataset.act}`, { method: 'POST', body: '{}' })).json().catch(() => ({ ok: false, error: '通信に失敗しました' }));
        busy = false;
        await draw();
        const m2 = wrap.querySelector('#setupMsg');
        if (m2) m2.textContent = r.ok ? '完了しました。' : `うまくいきませんでした：${r.error ?? r.comment ?? '不明なエラー'}`;
      };
    });
  }
  draw();
  const timer = setInterval(() => { if (!wrap.isConnected) clearInterval(timer); else if (!busy) draw(); }, 3000);
  return wrap;
}

// ---------- アンインストール ----------
function uninstallPanel() {
  const win = navigator.userAgent.includes('Windows');
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <section class="section"><h3>削除されるもの</h3>
      <ul class="spec">
        <li>ふくめんカメラのアプリ本体（${win ? 'アンインストーラーが実行されます' : 'ゴミ箱に移動します'}）</li>
        <li>OBS に追加した「FukumenCam」のシーン。OBS は自動設定の前に使っていたシーンに戻り、リモート操作（WebSocket）の設定も元に戻ります</li>
        <li>下のチェックを入れた場合：設定と、取り込んだキャラの画像</li>
      </ul>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="unDel"> 設定と取り込んだキャラの画像も削除する</label>
      <p class="support">チェックを外したままにすると残ります。もう一度インストールしたときに、そのまま使えます。</p>
      <button class="btn btn-danger" id="unBtn" style="margin-top:16px">アンインストールする</button>
    </section>
    <section class="section"><h3>別に入れたソフトの削除（必要な場合）</h3>
      <p class="section-desc">次のソフトはふくめんカメラとは別のものなので、自動では削除しません。ほかで使っていなければ、それぞれ削除できます。</p>
      <ul class="spec">
        <li><b>OBS Studio</b>：${win ? '「設定 → アプリ → インストールされているアプリ」から OBS Studio をアンインストール' : 'アプリケーションフォルダの OBS をゴミ箱へ移動'}</li>
        <li><b>${win ? 'VB-CABLE' : 'BlackHole 2ch'}</b>：${win
          ? 'VB-CABLE のインストーラー（VBCABLE_Setup_x64.exe）を管理者として実行し、「Remove Driver」を押す'
          : 'ターミナルで <code>brew uninstall --cask blackhole-2ch</code>（Homebrew で入れた場合）、または <a href="https://existential.audio/blackhole/support/" target="_blank" rel="noopener">BlackHole の説明</a>にある手順で削除'}</li>
      </ul>
    </section>`;
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `<h2>アンインストールしますか？</h2>
    <p>ふくめんカメラを終了して削除します。Zoom で使用中の場合は、映像と声が止まります。</p>
    <p class="un-data"></p>
    <div class="dialog-actions"><button class="btn btn-secondary" data-x="cancel">キャンセル</button><button class="btn btn-danger-solid" data-x="ok">アンインストールする</button></div>`;
  wrap.appendChild(dialog);
  wrap.querySelector('#unBtn').onclick = () => {
    dialog.querySelector('.un-data').textContent = wrap.querySelector('#unDel').checked
      ? '設定と取り込んだキャラの画像も削除します（元に戻せません）。' : '設定と取り込んだキャラの画像は残します。';
    dialog.showModal();
  };
  dialog.querySelector('[data-x=cancel]').onclick = () => dialog.close();
  dialog.querySelector('[data-x=ok]').onclick = async () => {
    dialog.close();
    const r = await (await fetch('/system/uninstall', { method: 'POST', body: JSON.stringify({ deleteData: wrap.querySelector('#unDel').checked }) })).json().catch(() => ({}));
    const o = document.createElement('div');
    o.className = 'stopped';
    o.innerHTML = r.ok
      ? `<div class="box"><h2>アンインストールしました</h2><p>OBS の設定を元に戻しました。${r.packaged ? '' : '（開発版のため、アプリ本体のフォルダは残しています）'}</p><p>Zoom のカメラとマイクは元の機器に戻してください。このウィンドウは閉じてかまいません。</p></div>`
      : '<div class="box"><h2>アンインストールできませんでした</h2><p>アプリ版で実行してください。</p></div>';
    document.body.appendChild(o);
  };
  return wrap;
}

// ---------- 声（プロファイルごと） ----------
let voiceTab = null;
function voicePanel() {
  const wrap = document.createElement('div');
  const using = profileForLook(liveValues);
  voiceTab ??= profileForLook(values);
  wrap.innerHTML = `
    <div class="card"><b>いま Zoom で使っている声：${profileLabel(using)}</b>
      <p class="support">「${esc(lookName(liveValues['output.look']))}」を出力中のためです。見た目と声の組み合わせは、タイル人型 → タイル人型の声、AIモリモリ → キャラの声、登録キャラ → キャラごとに選んだ声 です。</p></div>
    <div class="tabs voice-tabs" role="tablist" aria-label="調整する声">
      ${VOICE_PROFILES.map(p => `<button class="tab" role="tab" data-prof="${p.id}" aria-selected="${p.id === voiceTab}">${p.label}${p.id === using ? '<span class="onair" style="display:inline-block">使用中</span>' : ''}</button>`).join('')}
    </div>
    <div class="card vt"></div>
    <section class="section prof"></section>`;
  const prof = wrap.querySelector('.prof');
  const draw = () => {
    wrap.querySelectorAll('.voice-tabs .tab').forEach(t => t.setAttribute('aria-selected', t.dataset.prof === voiceTab));
    prof.innerHTML = `<h3>${profileLabel(voiceTab)}の加工</h3>`;
    for (const k of ['enabled', 'pitch', 'robot', 'robotHz', 'lowpass', 'highpass', 'volume']) prof.appendChild(field(`${voiceTab}.${k}`));
    refreshDirty();
  };
  wrap.querySelectorAll('.voice-tabs .tab').forEach(t => { t.onclick = () => { voiceTab = t.dataset.prof; draw(); }; });
  // 録音して試聴は、選んでいる声の設定で加工する
  mountVoiceTest(wrap.querySelector('.vt'), () => voiceCfg(values, voiceTab));
  draw();
  return wrap;
}

// ---------- キャラの登録 ----------
let editChar = (() => { try { return localStorage.getItem('avatar-edit-char') || 'c1'; } catch { return 'c1'; } })();
function charPicker() {
  const box = document.createElement('div');
  box.className = 'choices char-list';
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', '編集するキャラ');
  box.innerHTML = CHAR_SLOTS.map(id => {
    const n = EXPRESSIONS.filter(e => values[imageKey(id, e.id, 'closed')]).length;
    const live = normLook(liveValues['output.look']) === `hayato:chara:${id}`;
    return `<label class="choice ${editChar === id ? 'checked' : ''}">
      <input type="radio" name="editChar" value="${id}" ${editChar === id ? 'checked' : ''}>
      <span><span class="name">${esc(values[`${id}.name`])}</span><br>
        <span class="desc">${charReady(id) ? `${n} / ${EXPRESSIONS.length} 表情の画像あり。声：${profileLabel(values[`${id}.voice`])}` : '未登録（「通常・口を閉じた」の画像を入れると登録されます）'}</span></span>
      <span>${live ? '<span class="badge ng">Zoomに出力中</span>' : ''}</span></label>`;
  }).join('');
  box.querySelectorAll('input').forEach(r => r.onchange = () => {
    editChar = r.value;
    try { localStorage.setItem('avatar-edit-char', editChar); } catch {}
    renderCategory('chars');
  });
  const wrap = document.createElement('div');
  wrap.appendChild(box);
  return wrap;
}

// ---------- 表情 ----------
let revertTimer = null, detected = 'normal';
function setExpression(id) {
  if (values['expr.mode'] !== 'manual') setValue('expr.mode', 'manual');
  setValue('expr.current', id);
  fields['expr.panel']?.render();
  clearTimeout(revertTimer);
  const sec = values['expr.revert'];
  if (sec > 0 && id !== 'normal') revertTimer = setTimeout(() => setExpression('normal'), sec * 1000);
}
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const n = Number(e.key);
  if (n >= 1 && n <= EXPRESSIONS.length) { setExpression(EXPRESSIONS[n - 1].id); e.preventDefault(); }
});

function exprPanel() {
  const wrap = document.createElement('div');
  const draw = () => {
    const mode = values['expr.mode'], cur = values['expr.current'];
    const lookNow = normLook(liveValues['output.look']);
    const ch = lookNow.split(':')[2];
    const imageMode = ch && ch !== 'builtin';
    wrap.innerHTML = `
      ${!lookNow.startsWith('hayato') ? `<div class="card"><b>いま Zoom に出ているのは「${esc(lookName(lookNow))}」です。</b>
        <p class="support">表情は AIモリモリや登録キャラを出しているときに使えます。「出力する見た目」で選んで反映してください。</p></div>` : ''}
      ${imageMode ? `<div class="card"><b>「${esc(values[`${ch}.name`])}」を表示中です（${EXPRESSIONS.filter(e => values[imageKey(ch, e.id, 'closed')]).length} / ${EXPRESSIONS.length} 表情の画像あり）。</b>
        <p class="support">画像を用意していない表情は、通常の画像で表示されます。表情の画像は「キャラの登録」で追加できます。</p></div>` : ''}
      <section class="section"><h3>表情</h3>
        <div class="expr-grid" role="group" aria-label="表情">
          ${EXPRESSIONS.map((x, i) => `<button class="btn ${mode === 'manual' && cur === x.id ? 'btn-primary' : 'btn-secondary'} expr-btn" data-expr="${x.id}" aria-pressed="${mode === 'manual' && cur === x.id}">
            <span class="key">${i + 1}</span><span class="name">${x.label}</span><span class="desc">${x.desc}</span></button>`).join('')}
        </div>
        <p class="support">ボタンを押すと「手動」に切り替わり、その表情が Zoom に出ます。</p>
      </section>
      <section class="section"><h3>切り替え方</h3>
        <div class="choices" role="radiogroup" aria-label="表情の切り替え方">
          ${[['manual', '手動', 'ボタンやキーで切り替えます。'],
             ['face', '自分の表情に連動', 'カメラで読み取った自分の表情（笑う・眉を上げる・眉をひそめる・片目をつぶる など）に合わせて変わります。'],
             ['auto', 'おまかせ', '数秒おきに、短い間だけ自動で表情が変わります。']].map(([v, n, d]) => `
            <label class="choice ${mode === v ? 'checked' : ''}"><input type="radio" name="exprMode" value="${v}" ${mode === v ? 'checked' : ''}>
              <span><span class="name">${n}</span><br><span class="desc">${d}</span></span><span></span></label>`).join('')}
        </div>
        <p class="support" id="exprDetected">${mode === 'face' ? `カメラで検出中の表情: <b>${EXPRESSIONS.find(x => x.id === detected)?.label}</b>` : ''}</p>
      </section>`;
    wrap.querySelectorAll('.expr-btn').forEach(b => { b.onclick = () => setExpression(b.dataset.expr); });
    wrap.querySelectorAll('input[name=exprMode]').forEach(r => { r.onchange = () => { setValue('expr.mode', r.value); draw(); }; });
  };
  draw();
  fields['expr.panel'] = { render: draw, pending: { set hidden(v) {} } };
  return wrap;
}

function kit(char) {
  let lang = 'ja', promptTab = 'base';
  const top = document.createElement('div');
  const bottom = document.createElement('div');

  // ---- 取り込み状況の表（表情 × 口の状態）----
  const ready = () => EXPRESSIONS.filter(e => values[imageKey(char, e.id, 'closed')]).length;
  top.innerHTML = `
    <section class="section"><h3>取り込んだ画像</h3>
      <p class="section-desc"><span class="ready"></span> 用意していない表情は、通常の画像で表示されます。マスをクリックして選ぶか、画像をマスにドロップしてください。</p>
      <div class="img-table-wrap"><table class="img-table">
        <thead><tr><th scope="col">表情</th>${MOUTH_STATES.map(m => `<th scope="col">${m.label}</th>`).join('')}</tr></thead>
        <tbody></tbody></table></div>
    </section>
    <section class="section sheet-sec"><h3>表情シートでまとめて作る（おすすめ）</h3>
      <p class="section-desc">全部の表情を 1 回で描いてもらい、取り込むとコマを自動で切り分けて上の表に入れます。</p>
      <div class="sheet-opts">
        <div><label class="label" for="sheetKind">キャラの元</label>
          <select class="select" id="sheetKind"><option value="original">オリジナルのキャラ</option><option value="person">写真の人物をデフォルメ</option></select></div>
        <div><label class="label" for="sheetShape">シートの形</label>
          <select class="select" id="sheetShape"><option value="two">2枚に分ける（高画質）</option><option value="one">1枚にまとめる（手軽）</option></select></div>
      </div>
      <div class="ref-slot"></div>
      <div class="lang sheet-lang" role="group" aria-label="プロンプトの言語"><button data-lang="ja">日本語</button><button data-lang="en">English</button></div>
      <div class="sheet-prompts"></div>
      <p class="support sheet-result" role="status"></p>
    </section>
    <section class="section"><h3>1枚ずつの画像をまとめて取り込む</h3>
      <div class="drop" tabindex="0" role="button"><b>画像をまとめてここにドロップ</b><br>またはクリックして選択（複数可）</div>
      <p class="support drop-result"></p>
      <input type="file" multiple accept="image/png,image/jpeg,image/webp" hidden>
      <details class="howto"><summary>ファイル名の付け方</summary><ul class="spec">${IMPORT_STEPS.map(t => `<li>${t}</li>`).join('')}</ul></details>
    </section>`;
  const tbody = top.querySelector('tbody');
  const drawTable = () => {
    top.querySelector('.ready').textContent = `${EXPRESSIONS.length} 表情のうち ${ready()} 表情がそろっています。`;
    tbody.innerHTML = EXPRESSIONS.map(e => `<tr><th scope="row">${e.label}</th>${MOUTH_STATES.map(m => {
      const key = imageKey(char, e.id, m.id);
      if (!key) return '<td class="na">―</td>';
      const v = values[key];
      const need = (e.id === 'normal' && (m.id === 'closed' || m.id === 'open')) ? '<span class="need">必須</span>' : '';
      return `<td><div class="cell" data-key="${key}" data-name="${ITEM[key].it.name}" tabindex="0" role="button" aria-label="${e.label}・${m.label}の画像を選ぶ">
        ${v ? `<img alt="" src="/${v}">` : `<span class="empty">未設定${need}</span>`}</div>
        ${v ? `<button class="btn btn-tertiary btn-xs remove" data-key="${key}">外す</button>` : ''}</td>`;
    }).join('')}</tr>`).join('');
    tbody.querySelectorAll('.cell').forEach(cell => {
      const pick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
        inp.onchange = async () => { if (inp.files[0]) { await uploadImage(cell.dataset.key, cell.dataset.name, inp.files[0]); drawTable(); drawPrompts(); } };
        inp.click();
      };
      cell.onclick = pick;
      cell.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
      cell.ondragover = e => { e.preventDefault(); cell.classList.add('over'); };
      cell.ondragleave = () => cell.classList.remove('over');
      cell.ondrop = async e => {
        e.preventDefault(); cell.classList.remove('over');
        const f = e.dataTransfer.files[0];
        if (f) { await uploadImage(cell.dataset.key, cell.dataset.name, f); drawTable(); drawPrompts(); }
      };
    });
    tbody.querySelectorAll('.remove').forEach(b => { b.onclick = () => { setValue(b.dataset.key, ''); drawTable(); drawPrompts(); }; });
  };

  // まとめて取り込み: ファイル名から表情と口の状態を推測。分からないものは「通常」の空いている枠へ
  const drop = top.querySelector('.drop'), picker = top.querySelector('input[type=file]'), result = top.querySelector('.drop-result');
  async function importFiles(files) {
    const used = new Set(), lines = [], rest = [];
    for (const f of files) {
      const g = guessSlot(f.name);
      const gk = g && imageKey(char, g.expr, g.state);
      if (gk && !used.has(gk)) { used.add(gk); lines.push([f, gk]); } else rest.push(f);
    }
    for (const f of rest) {
      const key = ['closed', 'open', 'half', 'blink'].map(st => imageKey(char, 'normal', st)).find(k => !used.has(k) && !values[k]);
      if (key) { used.add(key); lines.push([f, key]); } else lines.push([f, null]);
    }
    const out = [];
    for (const [f, key] of lines) {
      if (!key) { out.push(`${f.name} → 振り分け先なし`); continue; }
      const ok = await uploadImage(key, ITEM[key].it.name, f);
      out.push(`${f.name} → ${ITEM[key].it.label}${ok ? '' : '（失敗）'}`);
    }
    result.textContent = out.join('、');
    drawTable(); drawPrompts();
  }
  drop.onclick = () => picker.click();
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } };
  picker.onchange = () => { importFiles([...picker.files]); picker.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); };

  // ---- 表情シート ----
  let sheetKind = 'original', sheetShape = 'two', sheetLang = 'ja';
  const sheetBox = top.querySelector('.sheet-prompts'), sheetResult = top.querySelector('.sheet-result');
  async function importSheet(id, file) {
    const sh = SHEETS[id];
    sheetResult.textContent = `${sh.label} を切り分けています…`;
    try {
      const { blobs } = await sliceSheet(file, sh.cols, sh.rows, { tol: values[`${char}.keyTol`] });
      const layout = sheetLayout(id);
      let ok = 0, empty = 0;
      for (let i = 0; i < layout.length; i++) {
        const [ex, st] = layout[i];
        const key = imageKey(char, ex, st);
        if (!blobs[i]) { empty++; continue; }
        const f = new File([blobs[i]], `${ex}_${st}.png`, { type: 'image/png' });
        if (await uploadImage(key, ITEM[key].it.name, f)) ok++;
      }
      sheetResult.textContent = `${sh.label}：${ok} コマを取り込みました。${empty ? `${empty} コマは空だったため飛ばしました。` : ''}上の表とプレビューで、ずれや切れがないか確認してください。`;
    } catch (e) {
      sheetResult.textContent = `取り込めませんでした：${e.message}`;
    }
    drawTable(); drawPrompts();
  }
  function drawSheet() {
    top.querySelectorAll('.sheet-lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === sheetLang));
    const ids = sheetShape === 'two' ? ['A', 'B'] : ['all'];
    sheetBox.innerHTML = '';
    for (const id of ids) {
      const p = sheetPrompt(sheetKind, id, values['prompt.ref']);
      const el = document.createElement('div');
      el.className = 'prompt';
      el.innerHTML = `<div class="prompt-head"><b>${p.title}</b><button class="btn btn-secondary btn-sm copy">コピー</button></div>
        <p class="support">${p.note}</p><pre></pre>
        <div class="drop sheet-drop" tabindex="0" role="button"><b>できた${id === 'all' ? '16コマの' : id === 'A' ? 'シートA の' : 'シートB の'}画像をここにドロップ</b><br>またはクリックして選択</div>`;
      el.querySelector('pre').textContent = p[sheetLang];
      const copy = el.querySelector('.copy');
      copy.onclick = async () => {
        await navigator.clipboard.writeText(p[sheetLang]);
        copy.textContent = 'コピーしました';
        setTimeout(() => { copy.textContent = 'コピー'; }, 1500);
      };
      const d = el.querySelector('.sheet-drop');
      const pick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
        inp.onchange = () => { if (inp.files[0]) importSheet(id, inp.files[0]); };
        inp.click();
      };
      d.onclick = pick;
      d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
      d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
      d.ondragleave = () => d.classList.remove('over');
      d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); if (e.dataTransfer.files[0]) importSheet(id, e.dataTransfer.files[0]); };
      sheetBox.appendChild(el);
    }
  }
  top.querySelector('.ref-slot').appendChild(field('prompt.ref'));
  addEventListener('prompt-ref', () => { drawSheet(); drawPrompts(); });
  top.querySelector('#sheetKind').onchange = e => { sheetKind = e.target.value; drawSheet(); };
  top.querySelector('#sheetShape').onchange = e => { sheetShape = e.target.value; drawSheet(); };
  top.querySelectorAll('.sheet-lang button').forEach(b => { b.onclick = () => { sheetLang = b.dataset.lang; drawSheet(); }; });
  drawSheet();

  // ---- 画像の作り方（プロンプト）----
  bottom.innerHTML = `
    <section class="section"><h3>1枚ずつ作る場合のプロンプト</h3>
      <ol class="steps">
        <li>「最初の4枚」の①をコピーして、画像生成 AI（ChatGPT・Gemini など）に貼り付けます。参考にするキャラの画像があれば添付すると似やすくなります。友達などをキャラにするときは「写真の人物をデフォルメ」を選び、その人の写真も添付します。</li>
        <li>できた①の画像を添付して、②（口を開けた顔）を作ってもらいます。③④は任意です。</li>
        <li>表情を増やすときは「表情」を選び、①の画像を添付して「口を閉じた」版 → その画像を添付して「口を開けた」版の順に作ります。</li>
      </ol>
      <div class="prompt-tools">
        <label class="label" for="promptExpr">プロンプトの種類</label>
        <select class="select" id="promptExpr">
          <option value="base">最初の4枚：オリジナルのキャラ</option>
          <option value="person">最初の4枚：写真の人物をデフォルメ</option>
          ${EXPRESSIONS.filter(e => e.id !== 'normal').map(e => `<option value="${e.id}">表情：${e.label}</option>`).join('')}
        </select>
        <div class="lang" role="group" aria-label="プロンプトの言語"><button data-lang="ja">日本語</button><button data-lang="en">English</button></div>
      </div>
      <div class="prompts"></div>
    </section>
    <section class="section"><h3>画像の条件</h3><ul class="spec">${SPEC.map(t => `<li>${t}</li>`).join('')}</ul></section>`;
  const promptsBox = bottom.querySelector('.prompts');
  function drawPrompts() {
    bottom.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lang));
    const list = promptTab === 'base' || promptTab === 'person'
      ? basePrompts(promptTab === 'base' ? 'original' : 'person', values['prompt.ref']).map(p => ({ ...p, key: imageKey(char, 'normal', p.state) }))
      : expressionPrompts(promptTab)
        .map((p, i) => ({ ...p, key: imageKey(char, promptTab, i ? 'open' : 'closed') }));
    promptsBox.innerHTML = '';
    for (const p of list) {
      const el = document.createElement('div');
      el.className = 'prompt' + (values[p.key] ? ' done' : '');
      el.innerHTML = `<div class="prompt-head"><span><b>${p.title}</b> <span class="chip-ok done-chip">取り込み済み</span></span>
        <button class="btn btn-secondary btn-sm">コピー</button></div><p class="support">${p.note}</p><pre></pre>`;
      el.querySelector('pre').textContent = p[lang];
      const btn = el.querySelector('button');
      btn.onclick = async () => {
        await navigator.clipboard.writeText(p[lang]);
        btn.textContent = 'コピーしました';
        setTimeout(() => { btn.textContent = 'コピー'; }, 1500);
      };
      promptsBox.appendChild(el);
    }
  }
  bottom.querySelector('#promptExpr').onchange = e => { promptTab = e.target.value; drawPrompts(); };
  bottom.querySelectorAll('.lang button').forEach(b => { b.onclick = () => { lang = b.dataset.lang; drawPrompts(); }; });

  drawTable(); drawPrompts();
  return { top, bottom };
}

async function uploadImage(key, name, file) {
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error();
    const r = await fetch(`/upload?name=${name}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    if (!r.ok) throw new Error();
    setValue(key, (await r.json()).path);
    fields[key]?.render();
    renderTabs();
    if (!previewLook.endsWith(editChar) && charReady(editChar) && current === 'chars') setPreview(`hayato:chara:${editChar}`);
    return true;
  } catch {
    return false;
  }
}

// ---------- プレビュー ----------
function setPreview(look) {
  look = normLook(look);
  previewLook = look;
  const [theme, mode, char] = look.split(':');
  const q = new URLSearchParams({ source: 'relay', cfg: 'draft', theme, mode, hud: $('hud').checked ? '1' : '0' });
  if (char) q.set('char', char);
  if ($('demo').checked) q.set('demo', '1');
  const src = '/?' + q;
  if ($('preview').getAttribute('src') !== src) $('preview').src = src;
  markTabs();
  try { localStorage.setItem('avatar-preview', JSON.stringify({ demo: $('demo').checked, hud: $('hud').checked })); } catch {}
}
// プレビューのタブ（タイル人型 2 種・標準キャラ・登録キャラ）
let tabsKey = '';
function renderTabs() {
  const looks = availableLooks();
  const key = looks.map(l => l.look + l.short).join('|');
  if (key === tabsKey) return markTabs();
  tabsKey = key;
  $('tabs').innerHTML = looks.map(l => `<button class="tab" role="tab" data-look="${l.look}">${esc(l.short)}<span class="onair">出力中</span></button>`).join('');
  $('tabs').querySelectorAll('.tab').forEach(t => { t.onclick = () => setPreview(t.dataset.look); });
  markTabs();
}
function markTabs() {
  document.querySelectorAll('#tabs .tab').forEach(t => {
    t.setAttribute('aria-selected', t.dataset.look === previewLook);
    t.classList.toggle('live', t.dataset.look === normLook(liveValues['output.look']));
  });
}
// 狭い画面で右下に浮かせたプレビューの「たたむ / 広げる」
function setPip(collapsed) {
  $('previewBox').classList.toggle('collapsed', collapsed);
  $('pipToggle').textContent = collapsed ? '広げる' : 'たたむ';
  $('pipToggle').setAttribute('aria-expanded', String(!collapsed));
  try { localStorage.setItem('avatar-pip-collapsed', collapsed ? '1' : ''); } catch {}
}
$('pipToggle').onclick = () => setPip(!$('previewBox').classList.contains('collapsed'));
try { setPip(localStorage.getItem('avatar-pip-collapsed') === '1'); } catch {}
$('demo').onchange = () => setPreview(previewLook);
$('hud').onchange = () => setPreview(previewLook);

// ---------- 接続状態（センサーから） ----------
const devices = { inputs: [], outputs: [] };
let lastAt = 0, devKey = '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const es = new EventSource('/events');
es.onmessage = e => {
  const d = JSON.parse(e.data);
  if (!d.ts) return;
  lastAt = Date.now();
  lastSensor = d;
  const v = d.voice ?? {};
  const pct = db => Math.max(0, Math.min(100, (db + 90) / 90 * 100));
  const speaker = /スピーカー|speaker/i.test(v.monitor || '');
  $('status').innerHTML = `
    <dt>センサー</dt><dd>稼働中</dd>
    <dt>マイク</dt><dd>${v.error ? `<span class="ng">${esc(v.error)}</span>` : esc(v.in || '-')}</dd>
    <dt>Zoomへの声</dt><dd>${esc(v.out || '-')}</dd>
    <dt>カメラ</dt><dd>${esc(d.camStatus)}（顔: ${d.face ? '検出中' : 'なし'}）</dd>
    <dt>モニター</dt><dd>${esc(v.monitor || 'オフ')}${speaker ? '<br><span class="ng">スピーカーだとハウリングします</span>' : ''}</dd>
    <dt>声の判定</dt><dd>${v.open ? '話している' : '話していない'}
      <div class="meter ${v.open ? 'open' : ''}" title="黒い線より大きい音を声とみなします"><i style="width:${pct(v.preDb)}%"></i><u style="left:${pct(v.thr)}%"></u></div></dd>`;
  setBadge(true);
  const det = detectExpression(d.face?.shapes, values['expr.sensitivity']);
  if (det !== detected) {
    detected = det;
    const el = document.getElementById('exprDetected');
    if (el && values['expr.mode'] === 'face') el.innerHTML = `カメラで検出中の表情: <b>${EXPRESSIONS.find(x => x.id === det)?.label}</b>`;
  }
  const k = JSON.stringify([d.inputDevices, d.outputDevices]);
  if (k !== devKey) {
    devKey = k;
    devices.inputs = d.inputDevices ?? [];
    devices.outputs = d.outputDevices ?? [];
    fields['voice.mic']?.render();
    fields['monitor.device']?.render();
  }
};
function setBadge(ok) {
  const b = $('sysBadge');
  b.className = 'badge ' + (ok ? 'ok' : 'ng');
  b.lastElementChild.textContent = ok ? '稼働中' : '停止中';
}
setInterval(() => {
  if (Date.now() - lastAt > 2500) {
    setBadge(false);
    $('status').innerHTML = '<dt>センサー</dt><dd><span class="ng">動いていません</span>。アプリ「ふくめんカメラ」を開いてください。</dd>';
  }
}, 1000);

// ---------- 終了 ----------
$('quit').onclick = () => $('quitDialog').showModal();
$('quitCancel').onclick = () => $('quitDialog').close();
$('quitOk').onclick = async () => {
  $('quitDialog').close();
  try { await fetch('/shutdown', { method: 'POST' }); } catch {}
  const o = document.createElement('div');
  o.className = 'stopped';
  o.innerHTML = `<div class="box"><h2>停止しました</h2>
    <p>仮想カメラ・声の加工・OBS を停止しました。Zoom のカメラとマイクは元の機器に戻してください。</p>
    <p>また使うときは、アプリ「ふくめんカメラ」を開いてください。</p></div>`;
  document.body.appendChild(o);
};

// ---------- 起動 ----------
try {
  liveValues = { ...DEF, ...(await (await fetch('/settings', { cache: 'no-store' })).json()) };
  values = { ...DEF, ...(await (await fetch('/settings/draft', { cache: 'no-store' })).json()) };
} catch { /* サーバー停止中は既定値で表示 */ }
try {
  const p = JSON.parse(localStorage.getItem('avatar-preview') ?? 'null');
  $('demo').checked = p ? p.demo : true;
  $('hud').checked = p ? p.hud : false;
} catch { $('demo').checked = true; }
buildNav();
const route = () => renderCategory(location.hash.slice(1) || 'setup');
addEventListener('hashchange', route);
setPreview(liveValues['output.look']);
route();
