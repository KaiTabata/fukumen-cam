// 中継サーバー（アプリ内で動く）。
//   - web/ の画面を配信する
//   - センサー（POST /state）→ 描画ページ・設定画面（GET /events, SSE）へ状態を中継する
//   - 設定（本番 settings.json / 下書き settings-draft.json）とアップロード画像を、ユーザーデータのフォルダに保存する
//   - /system/* でアプリ本体（OBS の設定・起動など）の機能を呼び出す
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.task': 'application/octet-stream', '.tflite': 'application/octet-stream',
};
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

// 旧形式の設定（キャラの画像が hayato.* にあった頃）を、登録キャラ1（c1.*）へ引き継ぐ
const LEGACY = { 'hayato.imgClosed': 'normal_closed', 'hayato.imgOpen': 'normal_open', 'hayato.imgHalf': 'normal_half', 'hayato.imgBlink': 'normal_blink' };
export function migrate(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (LEGACY[k]) out[`c1.img_${LEGACY[k]}`] ??= v;
    else if (/^hayato\.img_[a-z]+_(closed|open)$/.test(k)) out[`c1.${k.split('.')[1]}`] ??= v;
    else if (k === 'hayato.keyOut' || k === 'hayato.keyTol') out[`c1.${k.split('.')[1]}`] ??= v;
    else if (k !== 'hayato.style') out[k] = v;
  }
  if (data['hayato.style'] === 'image' && out['output.look'] === 'hayato:chara') out['output.look'] = 'hayato:chara:c1';
  return out;
}

export function startServer({ webDir, dataDir, port = 8732, system = {} }) {
  const SETTINGS = path.join(dataDir, 'settings.json');
  const DRAFT = path.join(dataDir, 'settings-draft.json');
  const UPLOADS = path.join(dataDir, 'uploads');
  fs.mkdirSync(UPLOADS, { recursive: true });

  const load = (file, fallback) => {
    try { return migrate(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return fallback ?? {}; }
  };
  const save = (file, data) => {
    fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
    fs.renameSync(file + '.tmp', file);
  };
  const cleanupUploads = () => {
    const used = JSON.stringify(load(SETTINGS)) + JSON.stringify(load(DRAFT));
    for (const f of fs.readdirSync(UPLOADS)) if (!used.includes(`assets/private/${f}`)) fs.rmSync(path.join(UPLOADS, f), { force: true });
  };
  // ページのプログラムの最終更新時刻。変われば各ページが自動で読み込み直す（開発中に便利）
  const codeVersion = () => {
    let newest = 0;
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'assets') walk(path.join(dir, e.name)); }
        else if (/\.(html|js|css)$/.test(e.name)) newest = Math.max(newest, fs.statSync(path.join(dir, e.name)).mtimeMs);
      }
    };
    walk(webDir);
    return newest;
  };

  let latest = '{}', seq = 0;
  const listeners = new Set();
  const readBody = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 25e6) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  const json = (res, data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  const sendFile = (res, file) => {
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    try {
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (p === '/state') {
          latest = body.toString() || '{}'; seq++;
          for (const l of listeners) l.write(`data: ${latest}\n\n`);
          res.writeHead(204); res.end(); return;
        }
        if (p === '/upload') {
          const name = url.searchParams.get('name') ?? '';
          const ext = IMAGE_EXT[req.headers['content-type']];
          if (!/^[a-z0-9-]{1,40}$/.test(name) || !ext) return json(res, { error: 'bad upload' }, 400);
          // 使用中の画像を上書きしないよう、毎回別名で保存する（古いものは反映時に掃除）
          const file = `${name}-${Date.now()}${ext}`;
          fs.writeFileSync(path.join(UPLOADS, file), body);
          return json(res, { path: `assets/private/${file}` });
        }
        const data = body.length ? JSON.parse(body.toString()) : {};
        if (p === '/settings') { save(SETTINGS, data); return json(res, { ok: true }); }
        if (p === '/settings/draft') { save(DRAFT, data); return json(res, { ok: true }); }
        if (p === '/settings/apply') { save(SETTINGS, load(DRAFT, load(SETTINGS))); cleanupUploads(); return json(res, { ok: true }); }
        if (p === '/settings/discard') { save(DRAFT, load(SETTINGS)); cleanupUploads(); return json(res, { ok: true }); }
        if (p === '/settings/instant') {
          // 手元だけの設定（モニター・表情など）: 本番と下書きの両方へ即座に書く。null は削除（＝初期値）
          for (const file of [SETTINGS, DRAFT]) {
            const cur = load(file, load(SETTINGS));
            for (const [k, v] of Object.entries(data)) { if (v === null) delete cur[k]; else cur[k] = v; }
            save(file, cur);
          }
          return json(res, { ok: true });
        }
        if (p.startsWith('/system/') && system[p.slice(8)]) return json(res, await system[p.slice(8)](data));
        return json(res, { error: 'not found' }, 404);
      }

      if (p === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`data: ${latest}\n\n`);
        listeners.add(res);
        const keep = setInterval(() => res.write(': keep\n\n'), 15000);
        req.on('close', () => { clearInterval(keep); listeners.delete(res); });
        return;
      }
      if (p === '/settings') return json(res, load(SETTINGS));
      if (p === '/settings/draft') return json(res, load(DRAFT, load(SETTINGS)));
      if (p === '/health') return json(res, { seq, now: Date.now() });
      if (p === '/version') return json(res, { version: codeVersion() });
      if (p.startsWith('/system/') && system[p.slice(8)]) return json(res, await system[p.slice(8)]());
      if (p.startsWith('/assets/private/')) return sendFile(res, path.join(UPLOADS, path.basename(p)));

      const file = path.normalize(path.join(webDir, p === '/' ? 'index.html' : p));
      if (!file.startsWith(webDir)) { res.writeHead(403); res.end(); return; }
      return sendFile(res, file);
    } catch (e) {
      json(res, { error: String(e.message ?? e) }, 500);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
