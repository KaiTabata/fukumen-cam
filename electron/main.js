// アプリ本体。
//   起動: 中継サーバー → センサー（見えないウィンドウ: カメラ・マイク・声の加工）→ 設定画面 → OBS（裏で仮想カメラ）
//   終了: 仮想カメラと OBS（自分用のとき）を止めてから終了
import { app, BrowserWindow, Tray, Menu, nativeImage, session, shell, systemPreferences, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.js';
import * as obs from './obs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(here, '..', 'web');
const PORT = 8732;
const BASE = `http://127.0.0.1:${PORT}`;
const IS_MAC = process.platform === 'darwin';

// 設定・取り込んだ画像の保存先（OS ごとのユーザーデータの場所）
app.setPath('userData', process.env.FUKUMEN_DATA_DIR || path.join(app.getPath('appData'), 'fukumen-cam'));  // 環境変数はテスト用

const BACKUP = () => path.join(app.getPath('userData'), 'obs-backup.json');

// アンインストールの後片付け: OBS の設定を元に戻し、必要ならデータフォルダも消す
async function cleanup(deleteData) {
  await obs.restore(BACKUP()).catch(() => {});
  if (deleteData) fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
}

// Windows のアンインストーラーから「--cleanup [--delete-data]」付きで呼ばれたときは、後片付けだけして終わる
if (process.argv.includes('--cleanup')) {
  app.whenReady().then(async () => { await cleanup(process.argv.includes('--delete-data')); app.exit(0); });
} else if (!app.requestSingleInstanceLock()) app.quit();

let settingsWin = null, sensorWin = null, tray = null, quitting = false;

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 720, minHeight: 560, title: 'ふくめんカメラ',
    icon: path.join(here, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true },
  });
  settingsWin.loadURL(`${BASE}/settings.html`);
  // 外部リンク（ダウンロードページなど）はブラウザで開く
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  settingsWin.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(BASE)) { e.preventDefault(); shell.openExternal(url); } });
  // 閉じてもアプリは動き続ける（Zoom 中に誤って閉じても映像と声が止まらないように）
  settingsWin.on('close', e => { if (!quitting) { e.preventDefault(); settingsWin.hide(); } });
}

function startSensor() {
  sensorWin = new BrowserWindow({
    show: false, width: 400, height: 300,
    webPreferences: { backgroundThrottling: false, contextIsolation: true },
  });
  sensorWin.loadURL(`${BASE}/sensor.html`);
  sensorWin.webContents.on('render-process-gone', () => { if (!quitting) setTimeout(startSensor, 1000); });
}

function makeTray() {
  const img = nativeImage.createFromPath(path.join(here, '..', 'build', IS_MAC ? 'trayTemplate.png' : 'icon.png')).resize({ width: 18, height: 18 });
  if (IS_MAC) img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('ふくめんカメラ');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '設定を開く', click: openSettings },
    { type: 'separator' },
    { label: 'ふくめんカメラを終了', click: () => app.quit() },
  ]));
  tray.on('click', openSettings);
}

// 設定画面から呼ぶ、アプリ本体の機能
const system = {
  status: async () => ({ platform: process.platform, obs: await obs.status() }),
  'obs-setup': async () => {
    try {
      await obs.setup({ pageUrl: `${BASE}/?source=relay&hud=0`, backupFile: BACKUP() });
      return { ok: true, ...(await obs.startVirtualCam()) };
    } catch (e) { return { ok: false, error: e.message }; }
  },
  'obs-start': async () => { try { return await obs.startVirtualCam(); } catch (e) { return { ok: false, error: e.message }; } },
  shutdown: async () => { setTimeout(() => app.quit(), 100); return { ok: true }; },
  // アプリ内からのアンインストール: OBS を元に戻す → （選べば）データを消す → アプリ本体を消す
  uninstall: async ({ deleteData } = {}) => {
    quitting = true;
    sensorWin?.destroy();
    await cleanup(!!deleteData);
    setTimeout(async () => {
      if (app.isPackaged && IS_MAC) {
        // /Applications/ふくめんカメラ.app をゴミ箱へ
        const bundle = path.resolve(app.getPath('exe'), '../../..');
        if (bundle.endsWith('.app')) await shell.trashItem(bundle).catch(() => {});
      } else if (app.isPackaged && process.platform === 'win32') {
        // インストール先のアンインストーラーを、確認なし（後片付けは済んでいる）で実行
        const dir = path.dirname(app.getPath('exe'));
        const un = fs.readdirSync(dir).find(f => /^Uninstall .*\.exe$/i.test(f));
        if (un) spawn(path.join(dir, un), ['/S'], { detached: true, stdio: 'ignore' }).unref();
      }
      app.exit(0);
    }, 300);
    return { ok: true, packaged: app.isPackaged };
  },
};

if (!process.argv.includes('--cleanup')) app.whenReady().then(async () => {
  // カメラ・マイク・出力先の選択を、このアプリ自身の画面にだけ許可する
  const ours = url => (url ?? '').startsWith(BASE);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(ours(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => ours(origin) || ours(wc?.getURL()));
  if (IS_MAC) {
    await systemPreferences.askForMediaAccess('camera').catch(() => {});
    await systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  try {
    await startServer({ webDir: WEB, dataDir: app.getPath('userData'), port: PORT, system });
  } catch (e) {
    dialog.showErrorBox('ふくめんカメラ', `起動できませんでした（ポート ${PORT} が使用中です）。\nほかに起動しているふくめんカメラを終了してから、もう一度開いてください。`);
    app.exit(1);
    return;
  }

  startSensor();
  openSettings();
  makeTray();

  // OBS の設定が済んでいれば、裏で仮想カメラを開始する（未設定なら設定画面の「はじめに」で案内）
  const st = await obs.status();
  if (st.installed && st.configured) obs.startVirtualCam().catch(() => {});
});

app.on('second-instance', openSettings);
app.on('activate', openSettings);
app.on('window-all-closed', () => { /* トレイに常駐する */ });

app.on('before-quit', async e => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  await obs.quitIfOurs().catch(() => {});
  app.exit(0);
});
