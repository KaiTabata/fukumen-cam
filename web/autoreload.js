// プログラム（.html/.js）が書き換わったら、このページを自動で読み込み直す
let first = null;
setInterval(async () => {
  try {
    const { version } = await (await fetch('/version', { cache: 'no-store' })).json();
    if (first === null) first = version;
    else if (version !== first) location.reload();
  } catch { /* サーバー停止中は何もしない */ }
}, 1500);
