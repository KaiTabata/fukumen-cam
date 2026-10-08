// ボイスチェンジャー本体（AudioWorklet）。
// 遅延線ピッチシフト: 2つの読み出し位置を書き込み位置に対してずらしながら読み、sin² 窓で交互に重ねる。
// 声を下げると声道ごと低くなるので、体格の大きい声に聞こえる。robot > 0 で無線機風のリング変調をかける。
class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1 << 15;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.phase = 0;
    this.win = Math.round(sampleRate * 0.05); // 50ms 窓
    this.ratio = 1;
    this.robot = 0;
    this.robotHz = 60;
    this.carrier = 0;
    this.port.onmessage = e => {
      const p = e.data;
      if (p.pitch !== undefined) this.ratio = Math.pow(2, p.pitch / 12);
      if (p.robot !== undefined) this.robot = p.robot;
      if (p.robotHz !== undefined) this.robotHz = p.robotHz;
    };
  }

  read(delay) {
    let pos = this.w - delay;
    while (pos < 0) pos += this.size;
    const i = Math.floor(pos), f = pos - i;
    const a = this.buf[i & (this.size - 1)], b = this.buf[(i + 1) & (this.size - 1)];
    return a + (b - a) * f;
  }

  process(inputs, outputs) {
    const inp = inputs[0][0], out = outputs[0][0];
    if (!out) return true;
    const n = out.length, W = this.win, step = (1 - this.ratio) / W;
    const dc = (2 * Math.PI * this.robotHz) / sampleRate;
    for (let k = 0; k < n; k++) {
      this.buf[this.w] = inp ? inp[k] : 0;
      let y;
      if (this.ratio === 1) {
        y = this.buf[this.w];
      } else {
        // 2つの読み出し位置（位相を半周ずらす）。sin² 窓の和は常に 1
        const p1 = this.phase, p2 = (this.phase + 0.5) % 1;
        const g1 = Math.sin(Math.PI * p1) ** 2, g2 = Math.sin(Math.PI * p2) ** 2;
        y = this.read(p1 * W + 2) * g1 + this.read(p2 * W + 2) * g2;
        this.phase += step;
        this.phase -= Math.floor(this.phase);
      }
      if (this.robot > 0) {
        this.carrier += dc;
        if (this.carrier > 2 * Math.PI) this.carrier -= 2 * Math.PI;
        y *= 1 - this.robot + this.robot * Math.sin(this.carrier) * 1.4;
      }
      out[k] = y;
      this.w = (this.w + 1) & (this.size - 1);
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('voice-processor', VoiceProcessor);
