// 声の加工チェーン（センサー側で使う）:
//   マイク → 低音カット → ボイスチェンジャー(worklet) → 高音カット → ゲート → コンプ → 音量 → 出力(BlackHole)
// ゲートは周囲の雑音レベルを自動で追い、それより「厳しさ」dB 以上大きい音のときだけ開く。

// ctx.destination へ出す。モニター等で別の出口が要るときは返り値の out（最終段）につなぐ
export async function buildVoiceChain(ctx, src) {
  await ctx.audioWorklet.addModule('./voice-worklet.js');
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 120, Q: 0.7 });
  const shifter = new AudioWorkletNode(ctx, 'voice-processor', { outputChannelCount: [1] });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6000, Q: 0.7 });
  const gate = new GainNode(ctx, { gain: 0 });
  const comp = new DynamicsCompressorNode(ctx, { threshold: -24, ratio: 4, attack: 0.003, release: 0.2 });
  const vol = new GainNode(ctx, { gain: 1.2 });
  const pre = new AnalyserNode(ctx, { fftSize: 1024 });
  const post = new AnalyserNode(ctx, { fftSize: 1024 });

  src.connect(hp).connect(shifter).connect(lp).connect(gate).connect(comp).connect(vol);
  src.connect(pre);
  vol.connect(post);
  vol.connect(ctx.destination);

  const buf = new Float32Array(1024);
  const rms = an => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
  };

  let cfg = {}, floor = null, openUntil = 0;
  return {
    post,
    out: vol,
    // 録音の試聴用: 雑音レベルを先に教えておく（学習を待たずにゲートを正しく動かす）
    setFloor(db) { floor = db; },
    update(c) {
      cfg = c;
      const on = c['voice.enabled'];
      shifter.port.postMessage({
        pitch: on ? c['voice.pitch'] : 0, robot: on ? c['voice.robot'] : 0, robotHz: c['voice.robotHz'],
      });
      hp.frequency.value = c['voice.highpass'];
      lp.frequency.value = c['voice.lowpass'];
      vol.gain.value = c['voice.volume'];
    },
    // 30回/秒ほど呼ぶ。ゲートの開閉と、加工前の音量を返す
    tick() {
      const db = rms(pre);
      if (db > -99) floor = floor === null ? db : floor + (db - floor) * (db < floor ? 0.05 : 0.002);
      const thr = Math.max(cfg['common.gateMin'] ?? -60, (floor ?? -100) + (cfg['common.gateMargin'] ?? 8));
      const now = ctx.currentTime;
      if (db > thr) openUntil = now + 0.25; // 語尾が切れないよう少し開けておく
      const open = !cfg['voice.gate'] || now < openUntil;
      gate.gain.setTargetAtTime(open ? 1 : 0, now, open ? 0.005 : 0.06);
      return { db, floor, thr, open };
    },
    outDb: () => rms(post),
  };
}

// 名前に label を含む機器の deviceId（kind: 'audioinput' | 'audiooutput'）
export async function findDevice(kind, label) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.find(d => d.kind === kind && d.label.toLowerCase().includes(label.toLowerCase()));
}
