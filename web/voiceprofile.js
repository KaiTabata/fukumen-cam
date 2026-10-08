// 声のプロファイル（タイル人型の声 / キャラの声 / その他の声）と、見た目との対応。
// 声の加工チェーン（voice.js）は 'voice.*' のキーを読むので、使うプロファイルの値を 'voice.*' に載せ替えて渡す。
export const VOICE_PROFILES = [
  { id: 'voice', label: 'タイル人型の声' },
  { id: 'voice_h', label: 'キャラの声' },
  { id: 'voice_x', label: 'その他の声' },
];
const PROFILE_KEYS = ['enabled', 'pitch', 'robot', 'robotHz', 'lowpass', 'highpass', 'volume'];

// 見た目 'テーマ:モード[:キャラ]' から、使う声のプロファイルを決める
export function profileForLook(cfg, look = cfg['output.look']) {
  const [theme, , char] = String(look).split(':');
  if (theme === 'beppan') return 'voice';
  if (!char || char === 'builtin') return 'voice_h';
  return cfg[`${char}.voice`] ?? 'voice_h';
}

export function voiceCfg(cfg, profile) {
  const out = { ...cfg };
  for (const k of PROFILE_KEYS) out[`voice.${k}`] = cfg[`${profile}.${k}`];
  return out;
}
