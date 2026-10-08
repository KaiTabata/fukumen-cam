import { EXPRESSIONS, MOUTH_STATES, CHAR_SLOTS } from './expressions.js';

// 設定項目の一覧。設定画面(settings.html)はこれを元にスライダー等を作り、描画ページは既定値として使う。
// 値は "グループ.名前" のキーで settings.json に保存される。

// 声の加工の項目（声のプロファイルごとに持つ）。初期値はプロファイルごとに変える
const voiceItems = d => [
  { key: 'enabled', label: 'ボイスチェンジャーを使う', type: 'check', def: true },
  { key: 'pitch', label: '声の高さ（半音）', type: 'range', min: -12, max: 12, step: 0.5, def: d.pitch },
  { key: 'robot', label: 'ロボット感（無線機っぽさ）', type: 'range', min: 0, max: 1, step: 0.01, def: d.robot },
  { key: 'robotHz', label: 'ロボット感の周波数', type: 'range', min: 20, max: 200, step: 1, def: d.robotHz },
  { key: 'lowpass', label: 'こもり具合（高音カット Hz）', type: 'range', min: 1500, max: 12000, step: 100, def: d.lowpass },
  { key: 'highpass', label: '低音カット（Hz）', type: 'range', min: 40, max: 400, step: 5, def: d.highpass },
  { key: 'volume', label: '音量', type: 'range', min: 0, max: 3, step: 0.05, def: d.volume },
];

export const SCHEMA = [
  {
    id: 'output', title: 'Zoomに出す見た目', items: [
      // 'テーマ:モード[:キャラ]'。キャラは builtin（同梱の標準キャラ「AIモリモリ」）または c1〜c4（登録キャラ）
      { key: 'look', label: '出力する見た目', type: 'text', def: 'beppan:figure' },
    ],
  },
  {
    // 'voice' はタイル人型の声 ＋ 全プロファイル共通の項目（判定・ノイズ・マイク）
    id: 'voice', title: 'タイル人型の声', items: [
      // タイル人型: 低く、少し無線機を通したような声（ボイスチェンジャーを通した感じ）
      ...voiceItems({ pitch: -5, robot: 0.2, robotHz: 50, lowpass: 5000, highpass: 120, volume: 1.2 }),
      { key: 'gate', label: '話していないときは無音にする（環境音カット）', type: 'check', def: true },
      { key: 'noise', label: 'ノイズ除去（Chrome内蔵）', type: 'check', def: true },
      { key: 'mic', label: '使うマイク', type: 'device', def: '' },
    ],
  },
  {
    // キャラ: 高めで明るい少年っぽい声
    id: 'voice_h', title: 'キャラの声', items: voiceItems({ pitch: 4, robot: 0, robotHz: 60, lowpass: 9500, highpass: 160, volume: 1.2 }),
  },
  {
    id: 'voice_x', title: 'その他の声', items: voiceItems({ pitch: 0, robot: 0, robotHz: 60, lowpass: 8000, highpass: 120, volume: 1.2 }),
  },
  {
    // 画像生成 AI 用プロンプトの設定（Zoom には影響しないので即時保存）
    id: 'prompt', title: 'プロンプト', instant: true, items: [
      { key: 'ref', label: '参考にするキャラ・絵柄（任意）', type: 'text', def: '', hint: '例: 自分で描いたキャラ「〇〇」、〇〇風の絵柄' },
    ],
  },
  {
    // 本番中に操作するもの。反映ボタンを待たずにすぐ Zoom に出す
    id: 'expr', title: 'キャラの表情', instant: true, items: [
      { key: 'mode', label: '表情の切り替え方', type: 'select', def: 'manual', options: [
        ['manual', '手動（ボタン・キーで切り替え）'], ['face', '自分の表情に連動（カメラ）'], ['auto', 'おまかせ（ときどき自動で変わる）'],
      ] },
      { key: 'current', label: '手動のときの表情', type: 'select', def: 'normal', options: [
        ['normal', '通常'], ['smile', '笑顔'], ['doya', 'ドヤ顔'], ['surprise', '驚き'], ['trouble', '困り'], ['angry', '怒り'], ['think', '考え中'], ['wink', 'ウインク'],
      ] },
      { key: 'revert', label: '手動で変えた表情を通常に戻すまでの秒数（0 で戻さない）', type: 'range', min: 0, max: 30, step: 1, def: 0 },
      { key: 'sensitivity', label: '連動の感度', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1 },
    ],
  },
  {
    // instant: Zoom には影響しない手元の設定なので、反映ボタンを待たずにすぐ切り替える
    id: 'monitor', title: '自分の声を聞く（モニター）', instant: true, items: [
      { key: 'enabled', label: 'Zoomに出ている声を自分でも聞く（イヤホン必須）', type: 'check', def: false },
      { key: 'device', label: '聞く機器', type: 'outdevice', def: '' },
      { key: 'volume', label: 'モニターの音量', type: 'range', min: 0, max: 2, step: 0.05, def: 0.8 },
    ],
  },
  {
    id: 'common', title: '共通', items: [
      { key: 'label', label: '大きい文字', type: 'text', def: '', hint: '例: 接触コード：32118' },
      { key: 'sub', label: '小さい文字', type: 'text', def: '', hint: '例: The Contact Code' },
      { key: 'captionY', label: '文字の位置（上から%）', type: 'range', min: 5, max: 98, step: 1, def: 82 },
      { key: 'captionSize', label: '文字の大きさ', type: 'range', min: 16, max: 100, step: 1, def: 44 },
      { key: 'gateMargin', label: '声の判定の厳しさ（雑音より何dB大きければ声か）', type: 'range', min: 2, max: 24, step: 1, def: 8 },
      { key: 'gateMin', label: '反応する最小の音量（dB）', type: 'range', min: -90, max: -20, step: 1, def: -60 },
    ],
  },
  {
    id: 'field', title: '背景', items: [
      { key: 'density', label: '粒の量', type: 'range', min: 0, max: 2.5, step: 0.05, def: 1, rebuild: true },
      { key: 'front', label: '手前のボケた粒の量', type: 'range', min: 0, max: 3, step: 0.05, def: 1, rebuild: true },
      { key: 'speed', label: '粒の流れる速さ', type: 'range', min: 0, max: 4, step: 0.05, def: 1 },
      { key: 'lines', label: '横線の濃さ', type: 'range', min: 0, max: 0.8, step: 0.01, def: 0.3 },
      { key: 'circles', label: '同心円の濃さ', type: 'range', min: 0, max: 0.5, step: 0.01, def: 0.09 },
      { key: 'bg', label: '背景色', type: 'color', def: '#02040c' },
    ],
  },
  {
    id: 'beppan', title: 'タイル人型', theme: 'beppan', items: [
      { key: 'size', label: '人型の大きさ（タイル間隔）', type: 'range', min: 8, max: 34, step: 0.5, def: 16 },
      { key: 'tile', label: 'タイルの大きさ（隙間の少なさ）', type: 'range', min: 0.3, max: 1, step: 0.01, def: 0.64 },
      { key: 'headY', label: '頭の高さ（上から%）', type: 'range', min: 5, max: 60, step: 1, def: 26 },
      { key: 'body', label: '胴体の幅', type: 'range', min: 1.5, max: 9, step: 0.1, def: 4.1 },
      { key: 'follow', label: '顔の動きへの追従', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.5 },
      { key: 'green', label: '話すときの色', type: 'color', def: '#34aa8a' },
      { key: 'white', label: 'タイルの色', type: 'color', def: '#f0f8ff' },
      { key: 'pulse', label: '話すときの大小の動き', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.6 },
      { key: 'idleGreen', label: '無音でも頭を緑のままにする', type: 'check', def: false },
      { key: 'glow', label: '光のにじみ', type: 'range', min: 0, max: 1.5, step: 0.05, def: 0.7 },
      { key: 'silSize', label: '本人シルエットのタイル間隔', type: 'range', min: 6, max: 28, step: 0.5, def: 13 },
    ],
  },
  {
    id: 'hayato', title: 'キャラの表示', theme: 'hayato', items: [
      { key: 'scale', label: 'キャラの大きさ', type: 'range', min: 0.3, max: 1.5, step: 0.01, def: 0.86 },
      { key: 'footY', label: '足元の位置（上から%）', type: 'range', min: 40, max: 130, step: 1, def: 97 },
      { key: 'follow', label: '顔の動きへの追従', type: 'range', min: 0, max: 1, step: 0.05, def: 0.25 },
      { key: 'mouth', label: '口の開きやすさ', type: 'range', min: 0.3, max: 4, step: 0.05, def: 1.6 },
      { key: 'bounce', label: '話すときの弾み', type: 'range', min: 0, max: 40, step: 1, def: 10 },
      { key: 'blink', label: 'まばたきする', type: 'check', def: true },
    ],
  },
];

// 登録キャラ（画像キャラ）c1〜c4: 名前・使う声・背景の透過・表情ごとの画像
for (const [n, id] of CHAR_SLOTS.entries()) {
  SCHEMA.push({
    id, title: `キャラ${n + 1}`, char: true, items: [
      { key: 'name', label: 'キャラの名前', type: 'text', def: `キャラ${n + 1}` },
      { key: 'voice', label: 'このキャラで使う声', type: 'select', def: 'voice_h', options: [
        ['voice_h', 'キャラの声'], ['voice', 'タイル人型の声'], ['voice_x', 'その他の声'],
      ] },
      { key: 'keyOut', label: '画像の背景色を自動で透過する（四隅の色を消す）', type: 'check', def: true },
      { key: 'keyTol', label: '透過する色の幅', type: 'range', min: 5, max: 160, step: 1, def: 60 },
      ...EXPRESSIONS.flatMap(e => MOUTH_STATES.filter(m => e.id === 'normal' || !m.normalOnly).map(m => ({
        key: `img_${e.id}_${m.id}`, label: `${e.label}（${m.label}）`, type: 'image', name: `${id}-${e.id}-${m.id}`, def: '',
      }))),
    ],
  });
}

export function defaults() {
  const out = {};
  for (const g of SCHEMA) for (const it of g.items) out[`${g.id}.${it.key}`] = it.def;
  return out;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
