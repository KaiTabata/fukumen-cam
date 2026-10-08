// キャラの画像を画像生成 AI に作らせるためのプロンプトと、取り込む画像の仕様。
// 設定画面（settings.html）がこれを表示し、コピーボタンで使えるようにする。
// ref（設定の「参考にするキャラ・絵柄」）を入れると、そのキャラ・絵柄に似せる指示が入る。

export const SPEC = [
  '形式：PNG（背景透過でも可）/ JPEG / WebP、1枚 20MB まで',
  'サイズ：縦長（3:4 か 2:3）。1200×1600 程度あれば十分',
  '全枚数で、画像サイズ・キャラの位置・大きさを同じにする（違うと口パクのたびに絵がずれる）',
  '背景：真緑（#00FF00）の単色か、透過PNG。単色背景はこちらで自動透過する',
  '全身が入り、足元が画像の下端近くにあること（足元を基準に配置する）',
  '文字・ロゴ・枠は入れない',
];

export const IMPORT_STEPS = [
  '下の表のマスに 1 枚ずつ入れる（マスに画像をドロップしても入る）。または「まとめてドロップ」に全部落とす',
  'まとめて入れるときは、ファイル名で振り分ける：表情（smile / doya / surprise / trouble / angry / think / wink、または 笑顔 / ドヤ / 驚き / 困り / 怒り / 考え / ウインク）と、口（closed / open、または 閉 / 開）の組み合わせ。例: smile_open.png、驚き_閉.png',
  '表情の言葉がない画像は「通常」として扱う（closed / open / half / blink、1〜4 の番号でも可）',
  '用意していない表情は、通常の画像で表示される。まず「通常」の 2 枚をそろえ、使いたい表情から足していくのがおすすめ',
];

// 標準の絵柄（参考キャラを指定しないとき）
const STYLE_JA = `キャラクターの特徴：
- 3頭身のちびキャラ。秘密組織で働く有能な「AIアシスタント」というイメージ
- 全体が青一色のモノトーン（明るい水色〜濃紺の濃淡だけ。肌も青白い）
- 濃紺の太めの主線、ベタ塗り、影は最小限のシンプルな絵柄（LINEスタンプのような雰囲気）
- 短髪で、前髪と毛先がツンツンはねている
- 半分閉じた「ジト目」で、自信ありげに口角を上げてニヤッと笑う、ちょっと得意げな表情
- 濃い色のスーツ、白いシャツ、ネクタイ
- 両手を胸の前で組んだ（もみ手の）ポーズで、足をそろえてまっすぐ立つ`;
const STYLE_EN = `Character features:
- A chibi character about 3 heads tall, an elite "AI assistant" working for a secret organization
- Strict blue monochrome: only shades from pale sky blue to deep navy; even the skin is pale bluish white
- Thick dark navy outlines, flat fills, minimal shading; simple, clean, sticker-like style
- Short spiky hair with spiky bangs
- Half-closed smug eyes and a confident, slightly cocky closed-mouth grin
- Dark business suit, white shirt, necktie
- Hands clasped together in front of the chest, feet together, standing straight`;

const OUTPUT_JA = `出力の条件：
- 正面向き・全身。キャラ全体が収まり、頭の上と足の下に少し余白
- 背景は真緑（#00FF00）の単色。グラデーション・影・床・模様は一切なし
- 文字・ロゴ・枠は入れない
- 縦長（3:4）、高解像度`;
const OUTPUT_EN = `Output requirements:
- Front view, full body, the whole character fits with a small margin above the head and below the feet
- Background: solid pure green (#00FF00), completely flat; no gradient, no shadow, no floor, no pattern
- No text, no logo, no border
- Portrait 3:4, high resolution`;

// キャラの説明（最初の 1 枚・表情シートで共通）
function intro(kind, ref) {
  if (kind === 'person') {
    const refJa = ref ? `「${ref}」と同じ絵柄（参考画像を添付した場合はその絵柄）で` : '下の特徴の絵柄で';
    const refEn = ref ? `in the same art style as "${ref}" (or the attached reference image)` : 'in the art style described below';
    return {
      ja: `添付した写真の人物を、${refJa}デフォルメしたキャラクターにしてください。

写真の人物らしさとして残すところ：
- 髪型（長さ・分け目・前髪の形・くせ）
- メガネ、ひげ、ほくろ、アクセサリーなど、ひと目でその人と分かる特徴
- 眉や目の形、輪郭の印象、年齢や性別の雰囲気

${ref ? '絵柄・頭身・線・ポーズは参考に合わせ、写真の元の色や服装は使わないでください。' : `絵柄に合わせるところ（写真の元の色や服装は使わない）：\n${STYLE_JA.split('\n').slice(2).join('\n')}`}`,
      en: `Turn the person in the attached photo into a chibi character ${refEn}.

Keep what makes the person recognizable:
- Hairstyle (length, parting, bangs, hair texture)
- Distinctive features such as glasses, facial hair, moles or accessories
- The impression of the eyebrows, eyes and face shape, and their age and gender vibe

${ref ? 'Match the art style, proportions, line work and pose to the reference; do not use the original colors or clothes from the photo.' : `Match this style (do not use the original colors or clothes from the photo):\n${STYLE_EN.split('\n').slice(2).join('\n')}`}`,
    };
  }
  return ref
    ? {
      ja: `「${ref}」を、そっくりな見た目で描いてください。参考画像を添付した場合は、その絵柄・色・ポーズにできるだけ忠実に合わせてください。`,
      en: `Draw "${ref}" as faithfully as possible. If a reference image is attached, match its art style, colors and pose as closely as you can.`,
    }
    : { ja: `オリジナルのマスコットキャラクターを 1 体描いてください。\n\n${STYLE_JA}`, en: `Draw one original mascot character.\n\n${STYLE_EN}` };
}

const SAME_JA = '添付した画像とまったく同じキャラクター・ポーズ・構図・画像サイズ・キャラの位置と大きさ・背景色のまま、';
const KEEP_JA = 'それ以外（髪・体・手・服・背景・線の太さ・色）は一切変えないでください。画像サイズも元と同じにしてください。';
const SAME_EN = 'Using the attached image, keep EXACTLY the same character, pose, composition, canvas size, character position and scale, and background color.';
const KEEP_EN = 'Do not change anything else (hair, body, hands, clothes, background, line weight, colors). Keep the same image size.';

// 最初の 4 枚（通常の表情: 口を閉じた・開けた・半開き・目を閉じた）
export function basePrompts(kind = 'original', ref = '') {
  const it = intro(kind, ref);
  return [
    {
      state: 'closed', title: kind === 'person' ? '① 口を閉じた顔（写真の人物から）' : '① 口を閉じた顔（最初の1枚）',
      note: kind === 'person'
        ? '人物の写真（正面・1人・明るく顔がはっきり写ったもの）を添付します。参考にする絵柄の画像があれば一緒に添付してください。写真の本人に了解をとってから使ってください。'
        : ref ? '参考にするキャラの画像を添付すると、ぐっと似やすくなります。' : '「参考にするキャラ・絵柄」を入れると、そのキャラに似せる指示になります。',
      ja: `${it.ja}\n\n${OUTPUT_JA}`,
      en: `${it.en}\n\n${OUTPUT_EN}`,
    },
    {
      state: 'open', title: '② 口を大きく開けた顔', note: '①でできた画像を添付して頼みます。',
      ja: `${SAME_JA}口だけを変えた差分を作ってください（このキャラが話している途中の顔）。\n- 口を大きく開けて、話している途中の口にする（口の中が少し見える）\n- 目はそのまま\n${KEEP_JA}`,
      en: `${SAME_EN} Change ONLY the mouth (this character in the middle of talking).\n- Wide open mouth, talking (the inside of the mouth is slightly visible)\n- Keep the same eyes\n${KEEP_EN}`,
    },
    {
      state: 'half', title: '③ 口を半分開けた顔（任意）', note: 'あると口の動きがなめらかになります。①の画像を添付して頼みます。',
      ja: `${SAME_JA}口だけを「少しだけ開いた、話している途中の口」に変えた差分を作ってください。\n${KEEP_JA}`,
      en: `${SAME_EN} Change ONLY the mouth to a slightly open mouth, as if in the middle of a word.\n${KEEP_EN}`,
    },
    {
      state: 'blink', title: '④ 目を閉じた顔（任意・まばたき用）', note: '①の画像を添付して頼みます。',
      ja: `${SAME_JA}目だけを「まばたきで閉じた目（下向きの弧の線）」に変えた差分を作ってください。口は閉じたままにしてください。\n${KEEP_JA}`,
      en: `${SAME_EN} Change ONLY the eyes to closed eyes (blinking, simple curved lines). Keep the mouth closed.\n${KEEP_EN}`,
    },
  ];
}

// ---- 表情ごとの差分画像 ----
const EXPR_LOOK = {
  normal: ['自信ありげに口角を上げてニヤッと笑う、いつもの顔', 'the usual face: a confident, slightly cocky grin'],
  smile: ['目を「^」の形に細め、口角を大きく上げてにっこり笑った顔。頬に照れの斜線を数本', 'a big happy smile with eyes closed into upward arcs, with a few blush lines on the cheeks'],
  doya: ['目を閉じて口の片端を上げた、得意げなドヤ顔。頭の横に小さな白い星', 'a smug, proud face with eyes closed and one corner of the mouth raised, with a small white sparkle star beside the head'],
  surprise: ['目を丸く見開き（白目に小さな黒目）、眉を高く上げ、口を「お」の形にした驚いた顔。頭の上に驚きの短い線', 'a surprised face with wide round eyes (small pupils), eyebrows raised high, mouth in an "O" shape, with short shock lines above the head'],
  trouble: ['八の字眉の困った顔。口は波線、こめかみに大きな冷や汗', 'a troubled, worried face with eyebrows slanted upward in the middle, a wavy mouth, and a big sweat drop on the temple'],
  angry: ['眉を強くつり上げた怒った顔。への字口で歯を見せ、頭に漫画の怒りマーク', 'an angry face with sharply slanted eyebrows, a frowning mouth showing teeth, and a manga anger mark on the head'],
  think: ['目線を右上に向けて考えている顔。口は小さくすぼめ、頭の横に白い「？」', 'a thinking face looking up to the right, a small pursed mouth, and a white question mark beside the head'],
  wink: ['片目（向かって左）を閉じてウインクし、口はニヤッと開いた顔。目元に小さな白い星', 'a wink (one eye closed), a sly open grin, and a small white sparkle star near the eye'],
};
const EXPR_LABEL = { normal: '通常', smile: '笑顔', doya: 'ドヤ顔', surprise: '驚き', trouble: '困り', angry: '怒り', think: '考え中', wink: 'ウインク' };

export function expressionPrompts(id) {
  const label = EXPR_LABEL[id], [ja, en] = EXPR_LOOK[id];
  return [
    {
      title: `${label}（口を閉じた）`, note: '①の画像（通常・口を閉じた顔）を添付して頼みます。',
      ja: `${SAME_JA}表情だけを「${label}」に変えた差分を作ってください（絵柄はそのまま）。\n- ${ja}\n- 話していない状態にする（口を開けた表情の場合も、開きは控えめに）\n${KEEP_JA}`,
      en: `${SAME_EN} Change ONLY the facial expression to "${id}" (keep the same art style).\n- ${en}\n- Not talking (if the mouth is open in this expression, keep it modest)\n${KEEP_EN}`,
    },
    {
      title: `${label}（口を開けた）`, note: '直前に作った「口を閉じた」画像を添付して頼みます。',
      ja: `${SAME_JA}口だけを変えた差分を作ってください。\n- 同じ表情のまま、話している途中のように口を大きく開ける（口の中が少し見える）\n- 目・眉・飾り（星・汗・マークなど）はそのまま\n${KEEP_JA}`,
      en: `${SAME_EN} Change ONLY the mouth.\n- Keep the same expression, but open the mouth wide as if in the middle of talking (inside of the mouth slightly visible)\n- Keep the eyes, eyebrows and decorations (stars, sweat, marks) unchanged\n${KEEP_EN}`,
    },
  ];
}

// ---- 表情シート（全表情をまとめて1回で出してもらう）----
// 上の段 = 口を閉じた、下の段 = 口を開けた。列 = 表情。取り込むと sheet.js がコマを切り分ける
export const SHEETS = {
  A: { label: 'シートA（通常・笑顔・ドヤ顔・驚き）', exprs: ['normal', 'smile', 'doya', 'surprise'], cols: 4, rows: 2 },
  B: { label: 'シートB（困り・怒り・考え中・ウインク）', exprs: ['trouble', 'angry', 'think', 'wink'], cols: 4, rows: 2 },
  all: { label: '16コマ（全表情を1枚に）', exprs: ['normal', 'smile', 'doya', 'surprise', 'trouble', 'angry', 'think', 'wink'], cols: 4, rows: 4 },
};
// コマの並び → [表情, 口の状態] の一覧（左上から右へ、上の段から順に）
export function sheetLayout(id) {
  const s = SHEETS[id], out = [];
  const groups = id === 'all' ? [s.exprs.slice(0, 4), s.exprs.slice(4)] : [s.exprs];
  for (const g of groups) for (const st of ['closed', 'open']) for (const e of g) out.push([e, st]);
  return out;
}

export function sheetPrompt(kind, id, ref = '') {
  const s = SHEETS[id], all = id === 'all', prev = id === 'B';
  const groups = all ? [s.exprs.slice(0, 4), s.exprs.slice(4)] : [s.exprs];
  const rowsJa = all
    ? `- 1段目：${groups[0].map(e => EXPR_LABEL[e]).join('・')} の「口を閉じた顔」\n- 2段目：1段目と同じ表情で「口を大きく開けた顔」\n- 3段目：${groups[1].map(e => EXPR_LABEL[e]).join('・')} の「口を閉じた顔」\n- 4段目：3段目と同じ表情で「口を大きく開けた顔」`
    : '- 上の段：口を閉じた顔（話していない。驚きの「お」の口など、口の形が特徴の表情は小さめに）\n- 下の段：上の段と同じ表情のまま、話している途中のように口を大きく開けた顔（口の中が少し見える）';
  const rowsEn = all
    ? `- Row 1: ${groups[0].join(', ')} with the mouth closed\n- Row 2: same expressions as row 1 with the mouth wide open (talking)\n- Row 3: ${groups[1].join(', ')} with the mouth closed\n- Row 4: same expressions as row 3 with the mouth wide open (talking)`
    : '- Top row: mouth closed (not talking; for expressions with a distinctive mouth shape such as the surprised "O", keep it small)\n- Bottom row: the same expressions as the top row, but with the mouth wide open as if talking (inside slightly visible)';
  const colsJa = groups.map((g, gi) => g.map((e, i) => `- ${all ? `${gi * 2 + 1}・${gi * 2 + 2}段目の` : ''}${i + 1}列目（左から）：${EXPR_LABEL[e]} … ${EXPR_LOOK[e][0]}`).join('\n')).join('\n');
  const colsEn = groups.map((g, gi) => g.map((e, i) => `- ${all ? `Rows ${gi * 2 + 1}-${gi * 2 + 2}, ` : ''}column ${i + 1} (from left): ${e} — ${EXPR_LOOK[e][1]}`).join('\n')).join('\n');
  const it = intro(kind, ref);
  const attach = kind === 'person' ? '人物の写真（＋あれば参考にする絵柄の画像）' : ref ? '参考にするキャラの画像' : '（参考画像はなくても可）';
  return {
    title: s.label,
    note: prev ? `先に作ったシートA の画像を添付して頼みます（キャラをそろえるため）。${kind === 'person' ? '人物の写真も一緒に添付してください。' : ''}` : `${attach}を添付して頼みます。`,
    ja: `${prev ? '添付したシートA と同じキャラクター・絵柄・色・大きさで、続きの表情シートを作ってください。\n\n' : ''}${it.ja}

【出力：表情シート】
このキャラクターを、1枚の画像の中に 横${s.cols}列 × 縦${s.rows}段 の${s.cols * s.rows}コマで描いてください。
- 各コマは同じ大きさ。コマの間に線・枠・余白の色は入れず、背景は画像全体で真緑（#00FF00）の単色
- どのコマも、キャラの大きさ・位置・ポーズ（正面・全身・立ち姿）・服装・色は完全に同じ。違うのは顔の表情と口、表情の飾り（星・汗・マークなど）だけ
- 各コマのキャラは全身が入り、コマの中央に配置し、上下左右に少し余白をとる。隣のコマにはみ出さない
- 文字・番号・ラベル・吹き出しは入れない

列（表情）：
${colsJa}

段（口）：
${rowsJa}

画像は${all ? '縦長（2:3）' : '横長（3:2）'}で、できるだけ高解像度にしてください。`,
    en: `${prev ? 'Create the next expression sheet with exactly the same character, art style, colors and size as the attached Sheet A.\n\n' : ''}${it.en}

[Output: expression sheet]
Draw this character in ONE image as a grid of ${s.cols} columns x ${s.rows} rows (${s.cols * s.rows} panels).
- All panels are the same size. No lines, borders or gutters between panels; the whole background is solid pure green (#00FF00)
- In every panel the character's size, position, pose (front view, full body, standing), clothes and colors are exactly the same. Only the facial expression, the mouth and expression decorations (stars, sweat, marks) change
- Each panel shows the full body, centered with a small margin on all sides, never crossing into the neighboring panel
- No text, numbers, labels or speech bubbles

Columns (expressions):
${colsEn}

Rows (mouth):
${rowsEn}

Make the image ${all ? 'portrait (2:3)' : 'landscape (3:2)'} at the highest resolution possible.`,
  };
}
