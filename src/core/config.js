// ============================================================
// 設定値はすべてこのファイルに集める（要件 5-2）。
// 物理の係数の根拠は docs/design.md に書いてある。
// ============================================================

/** 物理・数値計算の定数 */
export const PHYS = {
  g: 9.80665, // 重力加速度 [m/s^2]
  rho: 1.20, // 空気の密度 [kg/m^3]（20℃・海面）
  dt: 1 / 480, // 物理の時間刻み [s]（固定）
  recordEvery: 4, // 何ステップごとに記録するか（120Hz）
  maxTime: 60, // 飛行の打ち切り時間 [s]
  maxRange: 380, // これより遠くへ行ったら打ち切り [m]
  seed: 20261115, // 風の揺らぎ用の乱数の種（固定）

  // 投げるときの小さなブレ（人の手は完全にまっすぐには投げられない）。固定値。
  throwYawErrorDeg: 1.5, // 機首が進行方向から右へずれている角度
  throwRollErrorDeg: 1.0, // 右への傾き
};

/** 空気力の係数 */
export const AERO = {
  cd90: 1.2, // 板が風に真正面から当たるときの抗力係数（低アスペクト比の平板）
  cd0Surface: 0.022, // 翼面の摩擦・折り目・縁の抵抗（翼面積あたり）
  cd0Body: 0.045, // 胴体（折り重ね部）の抵抗（側面積あたり）
  oswald: 0.8, // 翼の効率（誘導抗力）
  leSuction: 0.25, // 前縁吸引力の割合（紙の鋭い縁ではほとんど働かない）
  stallBaseDeg: 9, // 失速角 = stallBase + stallPerInvAR / アスペクト比
  stallPerInvAR: 12,
  stallMinDeg: 11,
  stallMaxDeg: 20,
  stallWidthDeg: 6, // 失速の進み切るまでの角度の幅
  downwash: 1.2, // 主翼の吹き下ろしが尾翼に届く強さ（1=翼の位置、2=はるか後方）
  maxDownwashRad: 0.35,
};

/** 機体の作り（設計パネルでは変えない固定の寸法） */
export const BUILD = {
  fuselageLength: 0.28, // 胴体の長さ [m]
  wingRootLE: 0.115, // 機首から主翼の付け根前縁まで [m]
  wingTaper: 0.6, // 翼端の翼弦 ÷ 付け根の翼弦
  wingStrips: 5, // 片翼を何本の帯に分けて力を計算するか
  wingLayers: 2, // 主翼の紙の重なり枚数
  keelDepth: 0.022, // 胴体（下向きの折り返し）の深さ [m]
  keelDeepest: 0.25, // 一番深い位置（胴体長に対する割合）
  keelTailDepth: 0.5, // 後端の深さ（最深部に対する割合）
  keelLayersFront: 12, // 機首側の紙の重なり枚数
  keelLayersRear: 1, // 後端側の紙の重なり枚数
  tailChordRatio: 0.4, // 水平尾翼の付け根翼弦 ÷ 翼幅
  tailTaper: 0.7,
  tailLayers: 1,
  finChordRatio: 0.9, // 垂直尾翼の付け根翼弦 ÷ 高さ
  finTaper: 0.55,
  finLayers: 1,
  paperDensity: 800, // 紙の密度 [kg/m^3]（厚さ0.1mmで 80 g/m^2）
  minGap: 0.004, // 主翼の後縁と水平尾翼の前縁のすき間の最小値 [m]
};

/** 環境 */
export const ENV = {
  windRefHeight: 2.0, // 風速を定義する高さ [m]
  windShearExp: 0.15, // 地面近くで風が弱くなる度合い（べき乗則）
  gustIntensity: 0.15, // 風の揺らぎの強さ（平均風速に対する割合）
  thermals: [
    // 上昇気流の柱（位置 [m]、半径 [m]、中心の上昇速度 [m/s]）
    { x: 14, z: 0, r: 7, w: 1.3 },
    { x: 42, z: -6, r: 9, w: 1.1 },
    { x: 75, z: 8, r: 10, w: 1.0 },
  ],
  thermalFullHeight: 2.5, // この高さで上昇気流が最大になる [m]
  flatRadius: 400, // この半径の内側は平らな草原 [m]
};

/**
 * 設計できる項目の一覧（要件 5-2）。値は画面の単位（cm, g, mm, 度, m/s, m）。
 * group: wing / tail / weight / paper / throw / env
 */
export const PARAMS = [
  { key: 'wingSpan', group: 'wing', label: '翼幅', unit: 'cm', min: 10, max: 40, step: 0.5, def: 22, hint: '左右の長さ。広いほどゆっくり浮かぶ' },
  { key: 'wingChord', group: 'wing', label: '翼弦', unit: 'cm', min: 4, max: 12, step: 0.5, def: 9, hint: '付け根の前後の幅' },
  { key: 'wingSweep', group: 'wing', label: '後退角', unit: '°', min: 0, max: 45, step: 1, def: 10, hint: '翼を後ろへ傾ける角度' },
  { key: 'wingDihedral', group: 'wing', label: '上反角', unit: '°', min: 0, max: 25, step: 1, def: 10, hint: '翼をV字に持ち上げる角度。傾きから戻る力になる' },
  { key: 'tailSpan', group: 'tail', label: '水平尾翼の大きさ', unit: 'cm', min: 4, max: 18, step: 0.5, def: 9, hint: '左右の長さ。機首の上下を安定させる' },
  { key: 'tailAngle', group: 'tail', label: '水平尾翼の角度', unit: '°', min: -5, max: 15, step: 0.5, def: 4, hint: '後ろ上がりの角度。大きいほど機首が上がりやすい' },
  { key: 'finHeight', group: 'tail', label: '垂直尾翼の大きさ', unit: 'cm', min: 0.5, max: 8, step: 0.5, def: 3.5, hint: '高さ。左右の向きを安定させる' },
  { key: 'weightPos', group: 'weight', label: '重りの位置', unit: '%', min: 0, max: 100, step: 1, def: 50, hint: '0%が機首（前端）、100%が後端' },
  { key: 'weightMass', group: 'weight', label: '重りの重さ', unit: 'g', min: 0, max: 4, step: 0.1, def: 0.8, hint: 'クリップ1個でおよそ0.5〜1.5g' },
  { key: 'paperThickness', group: 'paper', label: '紙の厚さ', unit: 'mm', min: 0.06, max: 0.2, step: 0.01, def: 0.1, hint: 'コピー用紙はおよそ0.1mm' },
  { key: 'throwSpeed', group: 'throw', label: '投げる速さ', unit: 'm/s', min: 2, max: 14, step: 0.5, def: 4.5, hint: '' },
  { key: 'throwPitch', group: 'throw', label: '投げる角度（上下）', unit: '°', min: -20, max: 60, step: 1, def: 3, hint: '' },
  { key: 'throwHeading', group: 'throw', label: '投げる向き（左右）', unit: '°', min: -45, max: 45, step: 1, def: 0, hint: 'マイナスが左、プラスが右' },
  { key: 'throwHeight', group: 'throw', label: '投げる高さ', unit: 'm', min: 0.5, max: 15, step: 0.5, def: 4, hint: '' },
  { key: 'windDir', group: 'env', label: '風の向き', unit: '°', min: 0, max: 345, step: 15, def: 90, hint: '風が吹いてくる向き。0°=正面（向かい風）、90°=右から、180°=後ろ（追い風）、270°=左から' },
  { key: 'windSpeed', group: 'env', label: '風の強さ', unit: 'm/s', min: 0, max: 6, step: 0.5, def: 0, hint: '' },
  { key: 'updraft', group: 'env', label: '上昇気流', unit: '', type: 'bool', def: false, hint: '地面から上に向かう空気の柱' },
];

export const GROUPS = [
  { id: 'wing', label: '主翼' },
  { id: 'tail', label: '尾翼' },
  { id: 'weight', label: '重り' },
  { id: 'paper', label: '紙' },
  { id: 'throw', label: '投げ方' },
  { id: 'env', label: '環境' },
];

export const MAX_SAVES = 10; // 保存できる設計の数
export const MAX_OLD_TRAILS = 3; // 前回までの軌跡を残す本数

/** 初期値だけを集めた設定を返す */
export function defaultSetup() {
  const s = {};
  for (const p of PARAMS) s[p.key] = p.def;
  return s;
}
