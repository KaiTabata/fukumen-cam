// キャラの表情の一覧と、カメラで読み取った自分の表情（MediaPipe の blendshape）から表情を選ぶ処理。
// 描画ページ（themes/hayato.js）と設定画面（いま検出中の表情の表示）の両方で使う。

export const EXPRESSIONS = [
  { id: 'normal', label: '通常', desc: 'ジト目でニヤッ' },
  { id: 'smile', label: '笑顔', desc: '目を細めてにっこり' },
  { id: 'doya', label: 'ドヤ顔', desc: '得意げに口の端を上げる' },
  { id: 'surprise', label: '驚き', desc: '目を丸くして口が「お」' },
  { id: 'trouble', label: '困り', desc: '八の字眉に冷や汗' },
  { id: 'angry', label: '怒り', desc: '眉をつり上げて怒りマーク' },
  { id: 'think', label: '考え中', desc: '目線が上で「？」' },
  { id: 'wink', label: 'ウインク', desc: '片目を閉じて星' },
];

// 画像キャラの枠（設定のキー）。通常の表情は口の半開き・まばたきも持てる。それ以外は「口を閉じた / 開けた」の2枚
export const MOUTH_STATES = [
  { id: 'closed', label: '口を閉じた' },
  { id: 'open', label: '口を開けた' },
  { id: 'half', label: '口を半開き', normalOnly: true },
  { id: 'blink', label: '目を閉じた', normalOnly: true },
];
// 登録できる画像キャラの枠
export const CHAR_SLOTS = ['c1', 'c2', 'c3', 'c4'];
// キャラ char の、表情 expr・口の状態 state の画像の設定キー（その組み合わせがなければ null）
export function imageKey(char, expr, state) {
  if (expr !== 'normal' && (state === 'half' || state === 'blink')) return null;
  return `${char}.img_${expr}_${state}`;
}

// ファイル名から「どの表情の、どの口の状態か」を推測する（まとめて取り込み用）
const EXPR_WORDS = {
  smile: /smile|笑顔|にっこり|egao/i, doya: /doya|ドヤ|どや|smug/i, surprise: /surprise|驚|おどろ|odoroki/i,
  trouble: /trouble|困|こまり|worried/i, angry: /angry|怒|いかり|ikari/i, think: /think|考|かんがえ|kangae/i,
  wink: /wink|ウインク|ウィンク/i, normal: /normal|通常|base|ベース|基本/i,
};
const STATE_WORDS = { blink: /blink|まばたき|目を閉/i, half: /half|半/i, open: /open|開|talk/i, closed: /closed|close|閉/i };
export function guessSlot(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '');
  let expr = Object.keys(EXPR_WORDS).find(k => EXPR_WORDS[k].test(base)) ?? null;
  let state = Object.keys(STATE_WORDS).find(k => STATE_WORDS[k].test(base)) ?? null;
  // 「目を閉じた」は blink（「閉」より優先）。番号 1〜4 は通常の 閉/開/半/まばたき
  if (!expr && !state) {
    const n = base.match(/(?:^|\D)([1-4])(?:\D|$)/)?.[1];
    if (n) { expr = 'normal'; state = ['closed', 'open', 'half', 'blink'][n - 1]; }
  }
  if (!expr && !state) return null;
  expr ??= 'normal';
  state ??= 'closed';
  if (expr !== 'normal' && (state === 'half' || state === 'blink')) state = 'closed';
  return { expr, state };
}

// センサーが送る blendshape の名前（MediaPipe Face Landmarker の 52 種のうち使うものだけ）
export const SHAPE_NAMES = [
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker',
  'browInnerUp', 'browDownLeft', 'browDownRight', 'eyeWideLeft', 'eyeWideRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'jawOpen',
];

// 1フレーム分の判定。sensitivity が大きいほど、少しの表情の変化でも切り替わる
export function detectExpression(sh, sensitivity = 1) {
  if (!sh) return 'normal';
  const k = 1 / sensitivity;
  const avg = (a, b) => ((sh[a] ?? 0) + (sh[b] ?? 0)) / 2;
  const smile = avg('mouthSmileLeft', 'mouthSmileRight');
  const smileGap = Math.abs((sh.mouthSmileLeft ?? 0) - (sh.mouthSmileRight ?? 0));
  const frown = avg('mouthFrownLeft', 'mouthFrownRight');
  const browDown = avg('browDownLeft', 'browDownRight');
  const browUp = sh.browInnerUp ?? 0;
  const wide = avg('eyeWideLeft', 'eyeWideRight');
  const bl = sh.eyeBlinkLeft ?? 0, br = sh.eyeBlinkRight ?? 0;
  const lookUp = avg('eyeLookUpLeft', 'eyeLookUpRight');

  if (Math.abs(bl - br) > 0.45 * k && Math.max(bl, br) > 0.55 * k) return 'wink';
  if (browUp > 0.5 * k && (wide > 0.25 * k || (sh.jawOpen ?? 0) > 0.45 * k)) return 'surprise';
  if (browDown > 0.45 * k && smile < 0.3) return 'angry';
  if (smile > 0.55 * k) return 'smile';
  if (smile > 0.25 * k && smileGap > 0.2 * k) return 'doya';
  if ((browUp > 0.4 * k && smile < 0.2) || frown > 0.35 * k) return 'trouble';
  if (lookUp > 0.45 * k || (sh.mouthPucker ?? 0) > 0.6 * k) return 'think';
  return 'normal';
}

// 判定がちらつかないよう、同じ結果が一定時間続いたら切り替える
export function makeExpressionFilter({ settle = 0.25, hold = 0.8 } = {}) {
  let current = 'normal', candidate = 'normal', since = 0, changedAt = -Infinity;
  return (next, t) => {
    if (next !== candidate) { candidate = next; since = t; }
    if (candidate !== current && t - since >= settle && t - changedAt >= hold) {
      current = candidate; changedAt = t;
    }
    return current;
  };
}
