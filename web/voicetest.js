// 設定画面の「録音して試聴」。数秒録音し、いまの（下書きの）声の設定で加工して再生する。
// 本番と同じ加工チェーン（voice.js）を使うので、反映前に聞こえ方を確認できる。
import { buildVoiceChain, findDevice } from './voice.js';

const MAX_SEC = 10;

export function mountVoiceTest(box, getCfg) {
  box.innerHTML = `
    <div class="vt-title">録音して試聴</div>
    <div class="vt-desc">数秒しゃべって録音すると、反映前の設定で加工した声を再生できます。</div>
    <div class="vt-btns">
      <button class="vt-rec">録音する</button>
      <button class="vt-play" disabled>加工した声を再生</button>
      <button class="vt-orig" disabled>元の声を再生</button>
    </div>
    <div class="vt-status">録音は最大${MAX_SEC}秒です。再生はスピーカーから流れます。</div>`;
  const rec = box.querySelector('.vt-rec'), play = box.querySelector('.vt-play'), orig = box.querySelector('.vt-orig');
  const status = box.querySelector('.vt-status');
  let recorder = null, stream = null, timer = null, buffer = null, playing = null;

  async function start() {
    const cfg = getCfg();
    try {
      const dev = cfg['voice.mic'] ? await findDevice('audioinput', cfg['voice.mic']) : null;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...(dev && { deviceId: { exact: dev.deviceId } }), echoCancellation: false, autoGainControl: false, noiseSuppression: cfg['voice.noise'] },
      });
    } catch (e) {
      status.textContent = `マイクを使えません（${e.name}）。Chrome のアドレスバー左のアイコンからマイクを許可してください`;
      return;
    }
    stopPlayback();
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const ctx = new AudioContext();
      buffer = await ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
      ctx.close();
      play.disabled = orig.disabled = false;
      status.textContent = `録音しました（${buffer.duration.toFixed(1)}秒）。設定を変えて何度でも再生できます`;
      rec.textContent = '録り直す';
    };
    recorder.start();
    const t0 = Date.now();
    rec.textContent = '録音を止める';
    timer = setInterval(() => {
      const sec = (Date.now() - t0) / 1000;
      status.textContent = `録音中… ${sec.toFixed(1)}秒`;
      if (sec >= MAX_SEC) stop();
    }, 100);
  }

  function stop() {
    clearInterval(timer);
    if (recorder?.state === 'recording') recorder.stop();
    recorder = null;
  }

  function stopPlayback() {
    if (!playing) return;
    clearInterval(playing.tick);
    try { playing.src.stop(); } catch {}
    playing.ctx.close();
    playing = null;
  }

  async function playBuffer(processed) {
    if (!buffer) return;
    stopPlayback();
    const ctx = new AudioContext();
    const src = new AudioBufferSourceNode(ctx, { buffer });
    let tick = null;
    if (processed) {
      const chain = await buildVoiceChain(ctx, src);
      chain.update(getCfg());
      chain.setFloor(noiseFloor(buffer));
      tick = setInterval(() => chain.tick(), 1000 / 30);
    } else {
      src.connect(ctx.destination);
    }
    playing = { ctx, src, tick };
    src.onended = () => setTimeout(() => { if (playing?.src === src) stopPlayback(); }, 300);
    src.start();
    status.textContent = processed ? '加工した声を再生中（いまの下書きの設定）' : '元の声を再生中';
  }

  rec.onclick = () => (recorder ? stop() : start());
  play.onclick = () => playBuffer(true);
  orig.onclick = () => playBuffer(false);
}

// 録音の静かな部分（下位 10%）の音量を雑音レベルとみなす
function noiseFloor(buf) {
  const d = buf.getChannelData(0), n = 1024, levels = [];
  for (let i = 0; i + n <= d.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += d[j] * d[j];
    levels.push(20 * Math.log10(Math.sqrt(s / n) + 1e-9));
  }
  levels.sort((a, b) => a - b);
  return levels[Math.floor(levels.length * 0.1)] ?? -70;
}
