import type { PitchKind, PitchSpec } from "../../types/pitch";

// 球種の仕様(仮値)。`cursorScale` は打者のカーソル半径に掛ける「打ちにくさ補正」、
// `bend` は表示用の軌道の終盤の曲がり量(ゾーン単位。+x = ライト側(画面右)、+y = 上)で判定には使わない。
// 右投手の実際の向き: スライダー・カーブ = グラブ側(+x)、シュート = 腕側(−x)、カーブ・フォークは落ちる(−y)。
const PITCH_SPECS: readonly PitchSpec[] = [
  { kind: "straight", label: "ストレート", speedOffsetKmh: 0, cursorScale: { x: 1.0, y: 1.0 }, bend: { x: 0, y: 0 } },
  { kind: "slider", label: "スライダー", speedOffsetKmh: -12, cursorScale: { x: 0.95, y: 0.9 }, bend: { x: 1.2, y: -0.27 } },
  { kind: "curve", label: "カーブ", speedOffsetKmh: -30, cursorScale: { x: 0.95, y: 0.85 }, bend: { x: 0.8, y: -1.83 } },
  { kind: "fork", label: "フォーク", speedOffsetKmh: -15, cursorScale: { x: 0.95, y: 0.8 }, bend: { x: 0, y: -1.67 } },
  { kind: "shoot", label: "シュート", speedOffsetKmh: -8, cursorScale: { x: 0.9, y: 0.95 }, bend: { x: -1.15, y: -0.33 } },
];

const SPEC_BY_KIND: ReadonlyMap<PitchKind, PitchSpec> = new Map(PITCH_SPECS.map((spec) => [spec.kind, spec]));

/** 球種の仕様を返す。未定義の球種は `Error`(プログラミングエラー)。 */
export function getPitchSpec(kind: PitchKind): PitchSpec {
  const spec = SPEC_BY_KIND.get(kind);
  if (spec === undefined) {
    throw new Error(`getPitchSpec: unknown pitch kind "${kind}"`);
  }
  return spec;
}
