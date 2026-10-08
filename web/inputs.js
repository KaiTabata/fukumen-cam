// カメラ・マイクから「音量(dB)・顔の位置・人物マスク」を取り出す。
// 描画ページ単体で使う場合と、sensor.html から中継サーバーへ送る場合の両方で使う。
import { FilesetResolver, FaceLandmarker, ImageSegmenter } from './vendor/vision_bundle.mjs';
import { SHAPE_NAMES } from './expressions.js';

const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export const MASK_W = 96, MASK_H = 72;

// micLabel を渡すと、名前にその文字列を含む入力デバイスを使う（例: 'BlackHole' = OBS で処理した後の声）
// audio: false にするとマイクは開かない（センサーは声の加工チェーン側でマイクを扱う）
export async function startInputs(out, { camera = true, audio = true, micLabel = '', wantsMask = () => true, onUpdate } = {}) {
  out.db = -100; out.face = null; out.mask = null;
  out.camStatus = 'なし'; out.micStatus = 'なし';

  let analyser = null, buf = null;
  if (audio) try {
    const deviceId = micLabel ? await findInput(micLabel) : null;
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId && { deviceId: { exact: deviceId } }),
        // OBS で処理済みの音には Chrome 側の加工をかけない
        echoCancellation: false, noiseSuppression: !deviceId, autoGainControl: false,
      },
    });
    const audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    buf = new Float32Array(analyser.fftSize);
    audioCtx.createMediaStreamSource(mic).connect(analyser);
    out.audioCtx = audioCtx;
    out.micStatus = mic.getAudioTracks()[0].label || 'OK';
  } catch (e) { out.micStatus = 'エラー: ' + e.name; }

  let video = null, faceLm = null, segmenter = null;
  if (camera) {
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      video = document.createElement('video');
      video.srcObject = cam; video.muted = true; video.playsInline = true;
      await video.play();
      out.camStatus = '読み込み中';
      const fileset = await FilesetResolver.forVisionTasks('./vendor/wasm');
      faceLm = await create(FaceLandmarker, fileset, {
        baseOptions: { modelAssetPath: './vendor/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      });
      segmenter = await create(ImageSegmenter, fileset, {
        baseOptions: { modelAssetPath: './vendor/selfie_segmenter.tflite' },
        runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      out.camStatus = 'OK';
    } catch (e) { out.camStatus = 'エラー: ' + (e.name || e.message || e); }
  } else {
    out.camStatus = 'オフ';
  }

  let lastVideoTime = -1;
  const tick = () => {
    if (analyser) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      out.db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
    }
    if (video && faceLm && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try { detect(out, video, faceLm, wantsMask() ? segmenter : null); } catch (e) { console.warn(e); }
    }
    onUpdate?.(out);
  };
  // 背景でも止まりにくいよう rAF ではなくタイマーで回す
  setInterval(tick, 1000 / 30);
  return out;
}

async function findInput(label) {
  // デバイス名はマイク許可後でないと取れないので、一度開いてから列挙する
  const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
  tmp.getTracks().forEach(t => t.stop());
  const devices = await navigator.mediaDevices.enumerateDevices();
  const hit = devices.find(d => d.kind === 'audioinput' && d.label.toLowerCase().includes(label.toLowerCase()));
  if (!hit) throw Object.assign(new Error(`入力デバイス「${label}」が見つかりません`), { name: 'NotFound:' + label });
  return hit.deviceId;
}

async function create(Task, fileset, opts) {
  try {
    return await Task.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
  } catch {
    return await Task.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
  }
}

function detect(out, video, faceLm, segmenter) {
  const ts = performance.now();
  const r = faceLm.detectForVideo(video, ts);
  const lm = r.faceLandmarks?.[0];
  if (lm) {
    const cats = r.faceBlendshapes?.[0]?.categories ?? [];
    const jaw = cats.find(c => c.categoryName === 'jawOpen')?.score ?? 0;
    // 表情の連動に使う値だけ取り出す（0〜1）
    const shapes = {};
    for (const c of cats) if (SHAPE_NAMES.includes(c.categoryName)) shapes[c.categoryName] = Math.round(c.score * 100) / 100;
    const prev = out.face;
    const k = prev ? 0.35 : 1;
    const roll = Math.atan2(lm[263].y - lm[33].y, lm[263].x - lm[33].x);
    out.face = {
      x: prev ? prev.x + (lm[1].x - prev.x) * k : lm[1].x,
      y: prev ? prev.y + (lm[1].y - prev.y) * k : lm[1].y,
      roll: prev ? prev.roll + (roll - prev.roll) * k : roll,
      jaw,
      shapes,
      oval: FACE_OVAL.map(i => ({ x: lm[i].x, y: lm[i].y })),
      seen: ts,
    };
  } else if (out.face && ts - out.face.seen > 800) {
    out.face = null;
  }

  if (segmenter) {
    const s = segmenter.segmentForVideo(video, ts);
    const m = s.confidenceMasks?.[0];
    if (m) out.mask = downsample(m.getAsFloat32Array(), m.width, m.height);
    s.close?.();
  } else {
    out.mask = null;
  }
}

// マスクは中継しやすいよう 96x72 の 0..255 に縮める
function downsample(src, w, h) {
  const data = new Uint8Array(MASK_W * MASK_H);
  for (let y = 0; y < MASK_H; y++) {
    const sy = Math.floor((y + 0.5) / MASK_H * h) * w;
    for (let x = 0; x < MASK_W; x++) data[y * MASK_W + x] = src[sy + Math.floor((x + 0.5) / MASK_W * w)] * 255;
  }
  return { w: MASK_W, h: MASK_H, data };
}
