// 表情シート（同じキャラを格子状に並べた1枚の画像）を、コマごとの画像に切り分ける。
// 画像生成 AI のコマ割りは等間隔とは限らないので、背景色（四隅の色）の「すき間」を探して区切る。
// 切り出したキャラは、足元と体の中心をそろえて同じ大きさの画像に置き直す（口パクで絵がずれないように）。

export async function sliceSheet(file, cols, rows, { tol = 60 } = {}) {
  const img = await createImageBitmap(file);
  const W = img.width, H = img.height;
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;

  // 背景色 = 四隅の平均
  let r = 0, gr = 0, b = 0, n = 0;
  for (const [x0, y0] of [[0, 0], [W - 6, 0], [0, H - 6], [W - 6, H - 6]]) {
    for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) {
      const i = (y * W + x) * 4; r += px[i]; gr += px[i + 1]; b += px[i + 2]; n++;
    }
  }
  const bg = [r / n, gr / n, b / n];
  const fg = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; i += 4, p++) {
    fg[p] = Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]) > tol ? 1 : 0;
  }

  // 列・行ごとの「キャラの画素の数」から、区切り位置を探す
  const colSum = new Float32Array(W), rowSum = new Float32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fg[y * W + x]) { colSum[x]++; rowSum[y]++; }
  const xs = cuts(colSum, cols), ys = cuts(rowSum, rows);

  // コマごとのキャラの範囲と、体の中心（下半分の画素の平均の x）
  const cells = [];
  for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
    const x0 = xs[cx], x1 = xs[cx + 1], y0 = ys[ry], y1 = ys[ry + 1];
    let minX = x1, maxX = x0, minY = y1, maxY = y0, cnt = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!fg[y * W + x]) continue;
      cnt++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (cnt < 200) { cells.push(null); continue; }   // ほぼ空のコマ
    let sx = 0, sn = 0;
    const mid = minY + (maxY - minY) * 0.5;
    for (let y = Math.floor(mid); y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (fg[y * W + x]) { sx += x; sn++; }
    cells.push({ minX, maxX, minY, maxY, center: sn ? sx / sn : (minX + maxX) / 2 });
  }

  // すべてのコマを同じ大きさの画像に置き直す（足元をそろえ、体の中心を真ん中に）
  const live = cells.filter(Boolean);
  if (!live.length) throw new Error('キャラが見つかりません（背景が単色か確認してください）');
  const halfW = Math.max(...live.map(c => Math.max(c.center - c.minX, c.maxX - c.center))) * 1.08;
  const tallest = Math.max(...live.map(c => c.maxY - c.minY));
  const outW = Math.ceil(halfW * 2), outH = Math.ceil(tallest * 1.06);
  const bgCss = `rgb(${bg.map(Math.round).join(',')})`;
  const blobs = [];
  for (const c of cells) {
    if (!c) { blobs.push(null); continue; }
    const out = new OffscreenCanvas(outW, outH);
    const o = out.getContext('2d');
    o.fillStyle = bgCss; o.fillRect(0, 0, outW, outH);
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    const dx = Math.round(outW / 2 - (c.center - c.minX)), dy = Math.round(outH - Math.ceil(tallest * 0.02) - h);
    o.drawImage(img, c.minX, c.minY, w, h, dx, dy, w, h);
    blobs.push(await out.convertToBlob({ type: 'image/png' }));
  }
  return { blobs, grid: { xs, ys }, size: [outW, outH] };
}

// 合計画素の少ない位置を、等分の位置の近くから探す
function cuts(sum, parts) {
  const L = sum.length, out = [0];
  for (let k = 1; k < parts; k++) {
    const center = (L * k) / parts, span = (L / parts) * 0.35;
    let best = Math.round(center), bestV = Infinity;
    for (let x = Math.max(1, Math.round(center - span)); x < Math.min(L - 1, Math.round(center + span)); x++) {
      // 中心に近いほどわずかに有利にして、すき間の中央を選びやすくする
      const v = sum[x] + Math.abs(x - center) * 0.001;
      if (v < bestV) { bestV = v; best = x; }
    }
    out.push(best);
  }
  out.push(L);
  return out;
}
