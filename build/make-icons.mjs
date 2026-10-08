// アイコン画像（build/icon.png・build/trayTemplate*.png）を作り直す。Mac の Google Chrome と ffmpeg が必要（開発時だけ使う）
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmp = mkdtempSync(path.join(tmpdir(), 'icons-'));
const shot = (page, size, out) => {
  // 撮影ごとに別のプロファイルを使い、終わらないときは 30 秒で打ち切る
  // （環境によっては撮影後に Chrome が終了しないので、画像ができていれば成功とみなす）
  try {
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`,
      `--user-data-dir=${mkdtempSync(path.join(tmp, 'p-'))}`, `--screenshot=${out}`, `file://${path.join(here, page)}`],
      { stdio: 'ignore', timeout: 20000, killSignal: 'SIGKILL' });
  } catch (e) { if (!existsSync(out)) throw e; }
};
const key = (src, out, scale) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf',
  `format=rgba${scale ? `,scale=${scale}:${scale}` : ''}`, out]);
shot('icon.html', 1024, path.join(tmp, 'icon.png'));
key(path.join(tmp, 'icon.png'), path.join(here, 'icon.png'));
shot('tray.html', 64, path.join(tmp, 'tray.png'));
key(path.join(tmp, 'tray.png'), path.join(here, 'trayTemplate.png'), 22);
key(path.join(tmp, 'tray.png'), path.join(here, 'trayTemplate@2x.png'), 44);
console.log('done');
