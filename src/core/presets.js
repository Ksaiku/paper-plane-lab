// ============================================================
// お手本の機体（要件 5-3）。値は画面の単位。ここに無い項目は初期値を使う。
// ============================================================
import { defaultSetup } from './config.js';

export const PRESETS = [
  {
    id: 'basic',
    name: '入門型',
    blurb: 'だれが投げても安定して飛ぶ',
    setup: {},
  },
  {
    id: 'speed',
    name: 'スピード型',
    blurb: '細く尖っていて、速く遠くへ飛ぶ',
    setup: {
      wingSpan: 14, wingChord: 12, wingSweep: 40, wingDihedral: 4,
      tailSpan: 6, tailAngle: 3, finHeight: 3,
      weightPos: 70, weightMass: 3.5, paperThickness: 0.16,
      throwSpeed: 12, throwPitch: 0,
    },
  },
  {
    id: 'floaty',
    name: 'ゆったり型',
    blurb: '翼が広く、ゆっくり長く浮かぶ',
    setup: {
      wingSpan: 36, wingChord: 8, wingSweep: 0, wingDihedral: 12,
      tailSpan: 11, tailAngle: 4, finHeight: 4.5,
      weightPos: 30, weightMass: 0.8, paperThickness: 0.07,
      throwSpeed: 3, throwPitch: 0,
    },
  },
  {
    id: 'stunt',
    name: '曲芸型',
    blurb: '宙返りしやすい',
    setup: {
      wingSpan: 22, wingChord: 11, wingSweep: 15, wingDihedral: 6,
      tailSpan: 12.5, tailAngle: 7, finHeight: 5,
      weightPos: 30, weightMass: 1.5,
      throwSpeed: 14, throwPitch: 10,
    },
  },
  {
    id: 'fail',
    name: '失敗例',
    blurb: '重心が後ろすぎて、うまく飛ばない',
    setup: { weightPos: 100, weightMass: 1.0 },
  },
];

/** お手本の設定一式（初期値に上書きしたもの）を返す */
export function presetSetup(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  return { ...defaultSetup(), ...p.setup };
}
