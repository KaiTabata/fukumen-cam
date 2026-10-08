// OBS の検出・自動設定・起動・仮想カメラの開始（Mac / Windows）。
// OBS は「仮想カメラのドライバ」としてだけ使う。シーンは描画ページを表示するブラウザソース 1 つ。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';

export const COLLECTION = 'FukumenCam';
export const SCENE = 'FukumenCam';
const IS_MAC = process.platform === 'darwin', IS_WIN = process.platform === 'win32';

const configDir = () => IS_MAC ? path.join(os.homedir(), 'Library/Application Support/obs-studio')
  : IS_WIN ? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData/Roaming'), 'obs-studio')
  : path.join(os.homedir(), '.config/obs-studio');

function findObs() {
  if (IS_MAC) return fs.existsSync('/Applications/OBS.app') ? '/Applications/OBS.app' : null;
  if (IS_WIN) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']) {
      if (!base) continue;
      const exe = path.join(base, 'obs-studio', 'bin', '64bit', 'obs64.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return null;
}

const run = (cmd, args) => new Promise(r => execFile(cmd, args, { windowsHide: true }, (err, out) => r(err ? '' : String(out))));
export async function isRunning() {
  if (IS_MAC) return (await run('pgrep', ['-x', 'OBS'])).trim() !== '';
  if (IS_WIN) return /obs64\.exe/i.test(await run('tasklist', ['/FI', 'IMAGENAME eq obs64.exe']));
  return false;
}

// ---- ini（OBS の user.ini / global.ini）の最小限の読み書き ----
function iniSet(file, section, entries) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') : '';
  const lines = text.split(/\r?\n/);
  let start = lines.findIndex(l => l.trim() === `[${section}]`);
  if (start < 0) { lines.push(`[${section}]`); start = lines.length - 1; }
  let end = lines.findIndex((l, i) => i > start && /^\[.*\]$/.test(l.trim()));
  if (end < 0) end = lines.length;
  for (const [k, v] of Object.entries(entries)) {
    const i = lines.slice(start + 1, end).findIndex(l => l.startsWith(`${k}=`));
    if (i >= 0) lines[start + 1 + i] = `${k}=${v}`;
    else { lines.splice(end, 0, `${k}=${v}`); end++; }
  }
  fs.writeFileSync(file, lines.join('\n'));
}
function iniGet(file, section, key) {
  if (!fs.existsSync(file)) return null;
  let inSec = false;
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\[.*\]$/.test(l.trim())) inSec = l.trim() === `[${section}]`;
    else if (inSec && l.startsWith(`${key}=`)) return l.slice(key.length + 1);
  }
  return null;
}

const wsConfFile = () => path.join(configDir(), 'plugin_config/obs-websocket/config.json');
function wsConf() { try { return JSON.parse(fs.readFileSync(wsConfFile(), 'utf8')); } catch { return null; } }

// ---- 状態 ----
export async function status() {
  const dir = configDir();
  const conf = wsConf();
  const running = await isRunning();
  const userIni = fs.existsSync(path.join(dir, 'user.ini')) ? path.join(dir, 'user.ini') : path.join(dir, 'global.ini');
  return {
    installed: !!findObs(),
    initialized: fs.existsSync(dir) && fs.existsSync(path.join(dir, 'basic')),
    configured: fs.existsSync(path.join(dir, 'basic/scenes', `${COLLECTION}.json`)) && !!conf?.server_enabled
      && iniGet(userIni, 'Basic', 'SceneCollection') === COLLECTION,
    running,
    virtualCam: running && conf?.server_enabled
      ? await callObs('GetVirtualCamStatus', undefined, 0).then(r => !!r?.responseData?.outputActive).catch(() => false) : false,
  };
}

// ---- 自動設定（OBS を閉じた状態で行う）----
// 自動設定の前の OBS の状態を保存しておき、アンインストール時に戻す（backupFile は アプリのデータフォルダ内）
function saveBackup(backupFile) {
  if (fs.existsSync(backupFile)) return;   // 最初の 1 回の状態を残す
  const dir = configDir(), conf = wsConf();
  const ini = f => ({ collection: iniGet(path.join(dir, f), 'Basic', 'SceneCollection'), file: iniGet(path.join(dir, f), 'Basic', 'SceneCollectionFile') });
  fs.writeFileSync(backupFile, JSON.stringify({
    user: ini('user.ini'), global: ini('global.ini'),
    ws: conf ? { server_enabled: !!conf.server_enabled, auth_required: conf.auth_required, server_password: conf.server_password ?? '' } : null,
  }, null, 2));
}

export async function restore(backupFile) {
  if (await isRunning()) await quit();
  const dir = configDir();
  let b = null;
  try { b = JSON.parse(fs.readFileSync(backupFile, 'utf8')); } catch { /* 自動設定していない */ }
  // シーンコレクションを元に戻す（元が自分用だった・不明なときは、残っている別のコレクションへ）
  const others = fs.existsSync(path.join(dir, 'basic/scenes'))
    ? fs.readdirSync(path.join(dir, 'basic/scenes')).filter(f => f.endsWith('.json') && f !== `${COLLECTION}.json`) : [];
  for (const [f, prev] of [['user.ini', b?.user], ['global.ini', b?.global]]) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file) || iniGet(file, 'Basic', 'SceneCollection') !== COLLECTION) continue;
    const name = prev?.collection && prev.collection !== COLLECTION ? prev.collection : others[0]?.replace(/\.json$/, '');
    if (name) iniSet(file, 'Basic', { SceneCollection: name, SceneCollectionFile: prev?.file && prev.collection !== COLLECTION ? prev.file : `${name}.json` });
  }
  fs.rmSync(path.join(dir, 'basic/scenes', `${COLLECTION}.json`), { force: true });
  fs.rmSync(path.join(dir, 'basic/scenes', `${COLLECTION}.json.bak`), { force: true });
  // WebSocket サーバーの設定を元に戻す（自動設定で有効にしただけなら無効に）
  const conf = wsConf();
  if (conf && b) {
    const ws = b.ws ?? { server_enabled: false };
    fs.writeFileSync(wsConfFile(), JSON.stringify({ ...conf, ...ws }, null, 2));
  }
  clearCrashMark();
  fs.rmSync(backupFile, { force: true });
  return { ok: true };
}

export async function setup({ pageUrl, backupFile }) {
  if (!findObs()) throw new Error('OBS が見つかりません。先に OBS をインストールしてください。');
  const dir = configDir();
  if (!fs.existsSync(path.join(dir, 'basic'))) throw new Error('OBS を一度起動して、最初の設定（自動構成ウィザード）を終えてから、もう一度お試しください。');
  if (await isRunning()) { await quit(); }
  if (backupFile) saveBackup(backupFile);

  const uid = () => crypto.randomUUID();
  const browser = {
    name: 'アバター画面', uuid: uid(), id: 'browser_source', versioned_id: 'browser_source',
    settings: { url: pageUrl, width: 1920, height: 1080, fps_custom: false, reroute_audio: false, shutdown: false, restart_when_active: false },
    enabled: true, mixers: 0,
  };
  const scene = {
    name: SCENE, uuid: uid(), id: 'scene', versioned_id: 'scene',
    settings: { id_counter: 1, custom_size: false, items: [{ name: browser.name, source_uuid: browser.uuid, visible: true, locked: true, id: 1, pos: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, align: 5, bounds_type: 0, rot: 0 }] },
    enabled: true, mixers: 0,
  };
  fs.mkdirSync(path.join(dir, 'basic/scenes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'basic/scenes', `${COLLECTION}.json`), JSON.stringify({
    name: COLLECTION, current_scene: SCENE, current_program_scene: SCENE, scene_order: [{ name: SCENE }],
    sources: [scene, browser], groups: [], current_transition: 'Cut', transition_duration: 300, transitions: [],
    quick_transitions: [], saved_projectors: [], preview_locked: false, scaling_enabled: false, version: 2,
  }, null, 2));

  // 起動時に使うシーンコレクション（OBS 31 以降は user.ini、それ以前は global.ini）
  for (const f of ['user.ini', 'global.ini']) {
    const file = path.join(dir, f);
    if (fs.existsSync(file) || f === 'user.ini') iniSet(file, 'Basic', { SceneCollection: COLLECTION, SceneCollectionFile: `${COLLECTION}.json` });
  }

  // 仮想カメラを外から開始するため、WebSocket サーバーを有効にする（127.0.0.1 のみ・パスワード必須）
  const conf = wsConf() ?? {};
  fs.mkdirSync(path.dirname(wsConfFile()), { recursive: true });
  fs.writeFileSync(wsConfFile(), JSON.stringify({
    alerts_enabled: false, first_load: false, server_port: 4455, ...conf,
    server_enabled: true, auth_required: true, server_password: conf.server_password || crypto.randomBytes(12).toString('base64url'),
  }, null, 2));
  return { ok: true };
}

// ---- 起動・終了 ----
// OBS は終了の仕方によって「正常にシャットダウンされませんでした（セーフモードで起動しますか）」の確認を次回の起動時に出す。
// その判定に使う印（.sentinel/run_*）を、OBS が動いていないときに消す
function clearCrashMark() {
  const sentinel = path.join(configDir(), '.sentinel');
  try { for (const f of fs.readdirSync(sentinel)) if (f.startsWith('run_')) fs.rmSync(path.join(sentinel, f), { force: true }); } catch { /* なければよい */ }
}

export async function launch() {
  if (await isRunning()) return;
  clearCrashMark();
  const args = ['--collection', COLLECTION, '--scene', SCENE, '--minimize-to-tray', '--disable-missing-files-check'];
  if (IS_MAC) {
    spawn('open', ['-g', '-a', 'OBS', '--args', ...args], { detached: true, stdio: 'ignore' }).unref();
  } else if (IS_WIN) {
    const exe = findObs();
    spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
}

export async function quit() {
  if (!(await isRunning())) return;
  if (IS_MAC) await run('pkill', ['-TERM', '-x', 'OBS']);
  else if (IS_WIN) await run('taskkill', ['/IM', 'obs64.exe']);
  for (let i = 0; i < 30 && await isRunning(); i++) await new Promise(r => setTimeout(r, 500));
  if (!(await isRunning())) clearCrashMark();
}

// 使用中のシーンコレクションが自分用のときだけ OBS を閉じる（ほかの用途で使っている OBS は止めない）
export async function quitIfOurs() {
  if (!(await isRunning())) return;
  const r = await callObs('GetSceneCollectionList', undefined, 2).catch(() => null);
  if (r?.responseData?.currentSceneCollectionName !== COLLECTION) return;
  await callObs('StopVirtualCam', undefined, 2).catch(() => {});
  await quit();
}

// Mac は仮想カメラの準備（Camera Extension の有効化）が終わる前に開始すると映像が出ないので、ログで待つ
async function waitCameraExtension(since) {
  if (!IS_MAC) return;
  const logs = path.join(configDir(), 'logs');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const newest = fs.readdirSync(logs).map(f => path.join(logs, f)).filter(f => fs.statSync(f).mtimeMs >= since).sort().pop();
      if (newest && fs.readFileSync(newest, 'utf8').includes('Camera Extension activated')) break;
    } catch { /* ログがまだない */ }
  }
  await new Promise(r => setTimeout(r, 1000));
}

export async function startVirtualCam() {
  const since = Date.now() - 2000;
  const wasRunning = await isRunning();
  await launch();
  if (!wasRunning) await waitCameraExtension(since);
  const st = await callObs('GetVirtualCamStatus', undefined, 30);
  if (st?.responseData?.outputActive) return { ok: true, already: true };
  const r = await callObs('StartVirtualCam', undefined, 5);
  return { ok: !!r?.requestStatus?.result, comment: r?.requestStatus?.comment };
}

// ---- obs-websocket v5 の最小限のクライアント ----
export async function callObs(requestType, requestData, waitSec = 10) {
  const conf = wsConf();
  if (!conf?.server_enabled) throw new Error('OBS の WebSocket サーバーが無効です');
  const sha = s => crypto.createHash('sha256').update(s).digest('base64');
  for (let i = 0; i <= waitSec; i++) {
    try {
      return await new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${conf.server_port ?? 4455}`, 'obswebsocket.json');
        const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 4000);
        ws.onerror = () => { clearTimeout(timer); reject(new Error('connect')); };
        ws.onmessage = e => {
          const { op, d } = JSON.parse(e.data);
          if (op === 0) {
            const auth = d.authentication && sha(sha(conf.server_password + d.authentication.salt) + d.authentication.challenge);
            ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, ...(auth && { authentication: auth }) } }));
          } else if (op === 2) {
            ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: '1', requestData } }));
          } else if (op === 7) {
            clearTimeout(timer); ws.close(); resolve(d);
          }
        };
      });
    } catch (e) {
      if (i === waitSec) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
