import { describe, expect, it } from "vitest";
import { batterStancePose, batterSwingPose } from "./batter";
import { BAT_FOLLOW_LIFT, BAT_STANCE_HEIGHT, BATTER_PORTRAIT_STANCE, SWING_CONTACT_PROGRESS, SWING_FOLLOW_END_PROGRESS } from "./rig";
import { adjacentPairs, isValidAngles, isValidPose, FRAME_MS, grid, MAX_JOINT_STEP, maxJointDelta } from "./test-helpers";

// 標準のスイングは全体 200ms(progress 0→1)。16ms 刻みの progress の刻み幅。
const NOMINAL_SWING_MS = 200;
const PROGRESS_STEP = FRAME_MS / NOMINAL_SWING_MS;
const PROGRESS_GRID = grid(0, SWING_FOLLOW_END_PROGRESS, PROGRESS_STEP);
// ゾーンの下端・中心・上端の高さ(m)。
const HEIGHTS = [0.42, 0.72, 1.02] as const;

describe("batterStancePose / batterSwingPose の境界", () => {
  it.each(HEIGHTS)("batterSwingPose(0, %d) は構え姿勢に一致する(高さに依存しない)", (height) => {
    expect(batterSwingPose(0, height)).toEqual(batterStancePose());
  });

  it("構えのバットは構えの高さ・先端が上がった向きで、見えている", () => {
    const stance = batterStancePose();
    expect(stance.bat.visible).toBe(true);
    expect(stance.bat.height).toBe(BAT_STANCE_HEIGHT);
    expect(stance.bat.tilt).toBeLessThan(-0.5);
  });

  it("progress の範囲外は端に収まり、NaN は構え", () => {
    expect(batterSwingPose(-0.3, 0.72)).toEqual(batterSwingPose(0, 0.72));
    expect(batterSwingPose(2, 0.72)).toEqual(batterSwingPose(SWING_FOLLOW_END_PROGRESS, 0.72));
    expect(batterSwingPose(Number.NaN, 0.72)).toEqual(batterSwingPose(0, 0.72));
  });

  it("progress 1 の前後で連続している(1 − ε と 1 + ε がほぼ同じ)", () => {
    const before = batterSwingPose(1 - 1e-6, 0.72);
    const after = batterSwingPose(1 + 1e-6, 0.72);
    expect(maxJointDelta(before, after)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.sweepYaw - after.bat.sweepYaw)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.tilt - after.bat.tilt)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.height - after.bat.height)).toBeLessThan(1e-3);
  });

  it("progress 0.66(接触姿勢)の前後でも連続している", () => {
    const before = batterSwingPose(SWING_CONTACT_PROGRESS - 1e-6, 0.72);
    const after = batterSwingPose(SWING_CONTACT_PROGRESS + 1e-6, 0.72);
    expect(maxJointDelta(before, after)).toBeLessThan(1e-3);
    expect(Math.abs(before.bat.height - after.bat.height)).toBeLessThan(1e-3);
  });
});

describe("範囲と連続性(progress 全域)", () => {
  it.each(HEIGHTS)("高さ %d: 全関節とバットの角度が有限で ±2π 以内、バットの高さが有限", (height) => {
    for (const progress of PROGRESS_GRID) {
      const pose = batterSwingPose(progress, height);
      expect(isValidPose(pose)).toBe(true);
      expect(isValidAngles([pose.bat.sweepYaw, pose.bat.tilt])).toBe(true);
      expect(Number.isFinite(pose.bat.height)).toBe(true);
    }
  });

  it.each(HEIGHTS)(
    "高さ %d: 標準の200msスイングを16ms刻みに走査して、隣接サンプルの各関節・バットの角度の差が 0.5rad 以下(接触・振り切りの切替点を含む)",
    (height) => {
      for (const [a, b] of adjacentPairs(PROGRESS_GRID.map((progress) => batterSwingPose(progress, height)))) {
        expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
        expect(Math.abs(a.bat.sweepYaw - b.bat.sweepYaw)).toBeLessThanOrEqual(MAX_JOINT_STEP);
        expect(Math.abs(a.bat.tilt - b.bat.tilt)).toBeLessThanOrEqual(MAX_JOINT_STEP);
      }
    },
  );

  it.each(HEIGHTS)("高さ %d: バットの高さは1フレームで 0.2m 以上飛ばない", (height) => {
    for (const [a, b] of adjacentPairs(PROGRESS_GRID.map((progress) => batterSwingPose(progress, height)))) {
      expect(Math.abs(a.bat.height - b.bat.height)).toBeLessThanOrEqual(0.2);
    }
  });

  it("バットは構え(後ろ)から前へ振られる: sweepYaw は progress に対して単調増加", () => {
    const sweeps = PROGRESS_GRID.map((progress) => batterSwingPose(progress, 0.72).bat.sweepYaw);
    expect(sweeps.every((sweep, index) => index === 0 || sweep >= (sweeps.at(index - 1) ?? 0))).toBe(true);
  });

  it("関節の角度は高さに依存しない(変わるのはバットの高さだけ)", () => {
    for (const progress of PROGRESS_GRID) {
      const low = batterSwingPose(progress, 0.42);
      const high = batterSwingPose(progress, 1.02);
      expect(maxJointDelta(low, high)).toBe(0);
      expect(low.bat.sweepYaw).toBe(high.bat.sweepYaw);
      expect(low.bat.tilt).toBe(high.bat.tilt);
    }
  });
});

// 縦長の構え(縦横比の補間 k = portrait)。k = 0 は従来の構え、k = 1 は手を下げて体に引く構え。
const PORTRAIT_KS = [0.25, 0.5, 0.75, 1] as const;

describe("縦長の構え(portrait)", () => {
  it("portrait = 0 と省略は同じ(横長は従来どおり)。範囲外は 0〜1 に収め、NaN は 0", () => {
    for (const progress of PROGRESS_GRID) {
      expect(batterSwingPose(progress, 0.72, 0)).toEqual(batterSwingPose(progress, 0.72));
      expect(batterSwingPose(progress, 0.72, -1)).toEqual(batterSwingPose(progress, 0.72));
      expect(batterSwingPose(progress, 0.72, Number.NaN)).toEqual(batterSwingPose(progress, 0.72));
      expect(batterSwingPose(progress, 0.72, 3)).toEqual(batterSwingPose(progress, 0.72, 1));
    }
    expect(batterStancePose(0)).toEqual(batterStancePose());
  });

  it("portrait = 1 の構えは BATTER_PORTRAIT_STANCE で、batterSwingPose(0, h, 1) と一致する(高さに依存しない)", () => {
    const stance = batterStancePose(1);
    expect(stance.torso).toEqual(BATTER_PORTRAIT_STANCE.torso);
    expect(stance.head).toEqual(BATTER_PORTRAIT_STANCE.head);
    expect(stance.armL).toEqual(BATTER_PORTRAIT_STANCE.armL);
    expect(stance.armR).toEqual(BATTER_PORTRAIT_STANCE.armR);
    for (const height of HEIGHTS) {
      expect(batterSwingPose(0, height, 1)).toEqual(stance);
    }
  });

  it("縦長の構えは前の手(armL)・後ろの手(armR)とも腕が下がり(x が 0 に近づく)、体の脇に引かれる(z が 0 に近づく)", () => {
    const landscape = batterStancePose();
    const portrait = batterStancePose(1);
    expect(Math.abs(portrait.armL.x)).toBeLessThan(Math.abs(landscape.armL.x) - 0.5);
    expect(Math.abs(portrait.armR.x)).toBeLessThan(Math.abs(landscape.armR.x) - 0.5);
    expect(Math.abs(portrait.armL.z)).toBeLessThan(Math.abs(landscape.armL.z));
    expect(Math.abs(portrait.armR.z)).toBeLessThan(Math.abs(landscape.armR.z));
  });

  it("頭の向き(体の向きとの合計)は横長と同じで、ボールを見続ける。構えのバットも横長と同じ", () => {
    const landscape = batterStancePose();
    for (const k of [0, ...PORTRAIT_KS]) {
      const stance = batterStancePose(k);
      expect(stance.torso.y + stance.head.y).toBeCloseTo(landscape.torso.y + landscape.head.y, 12);
      expect(stance.bat.sweepYaw).toBeCloseTo(landscape.bat.sweepYaw, 12);
      expect(stance.bat.tilt).toBeCloseTo(landscape.bat.tilt, 12);
      expect(stance.bat.height).toBeCloseTo(landscape.bat.height, 12);
    }
  });

  it("構えの腕は portrait に対して単調に動く(前の手の x は −1.1 から縦長の値へ、k が増えるほど 0 に近づく)", () => {
    const xs = [0, ...PORTRAIT_KS].map((k) => batterStancePose(k).armL.x);
    expect(xs.every((x, index) => index === 0 || x >= (xs.at(index - 1) ?? 0))).toBe(true);
  });

  it.each(PORTRAIT_KS)("portrait %d: 接触(0.66)以降の姿勢は横長と同じ。バット(向き・高さ)は全 progress で横長と同じ", (k) => {
    for (const progress of PROGRESS_GRID) {
      const portrait = batterSwingPose(progress, 0.72, k);
      const landscape = batterSwingPose(progress, 0.72);
      expect(portrait.bat.sweepYaw).toBeCloseTo(landscape.bat.sweepYaw, 12);
      expect(portrait.bat.tilt).toBeCloseTo(landscape.bat.tilt, 12);
      expect(portrait.bat.height).toBeCloseTo(landscape.bat.height, 12);
      if (progress >= SWING_CONTACT_PROGRESS) {
        expect(maxJointDelta(portrait, landscape)).toBeLessThan(1e-12);
      }
    }
  });

  it.each(PORTRAIT_KS)("portrait %d: 接触姿勢のバットの高さは height(接触位置)に一致する", (k) => {
    for (const height of HEIGHTS) {
      expect(batterSwingPose(SWING_CONTACT_PROGRESS, height, k).bat.height).toBeCloseTo(height, 12);
    }
  });

  it.each(PORTRAIT_KS)(
    "portrait %d: 標準の200msスイングを16ms刻みに走査して、隣接サンプルの各関節・バットの角度の差が 0.5rad 以下(構え〜接触の連続性)",
    (k) => {
      for (const height of HEIGHTS) {
        for (const [a, b] of adjacentPairs(PROGRESS_GRID.map((progress) => batterSwingPose(progress, height, k)))) {
          expect(maxJointDelta(a, b)).toBeLessThanOrEqual(MAX_JOINT_STEP);
          expect(Math.abs(a.bat.sweepYaw - b.bat.sweepYaw)).toBeLessThanOrEqual(MAX_JOINT_STEP);
          expect(Math.abs(a.bat.tilt - b.bat.tilt)).toBeLessThanOrEqual(MAX_JOINT_STEP);
          expect(Math.abs(a.bat.height - b.bat.height)).toBeLessThanOrEqual(0.2);
        }
      }
    },
  );

  it.each(PORTRAIT_KS)("portrait %d: 全 progress で関節・バットの角度が有限で ±2π 以内", (k) => {
    for (const progress of PROGRESS_GRID) {
      const pose = batterSwingPose(progress, 0.72, k);
      expect(isValidPose(pose)).toBe(true);
      expect(isValidAngles([pose.bat.sweepYaw, pose.bat.tilt])).toBe(true);
    }
  });
});

describe("接触姿勢(progress 0.66)", () => {
  it.each(HEIGHTS)("高さ %d: バットの高さがボールの高さに一致する", (height) => {
    expect(batterSwingPose(SWING_CONTACT_PROGRESS, height).bat.height).toBeCloseTo(height, 12);
  });

  it("バットはほぼ水平で、ホームベース上(sweepYaw ≈ 0)を横切る", () => {
    const contact = batterSwingPose(SWING_CONTACT_PROGRESS, 0.72);
    expect(Math.abs(contact.bat.tilt)).toBeLessThan(0.2);
    expect(Math.abs(contact.bat.sweepYaw)).toBeLessThan(0.3);
  });

  it("バットの高さは構えから接触まで単調に近づく", () => {
    const heights = grid(0, SWING_CONTACT_PROGRESS, PROGRESS_STEP).map((progress) => batterSwingPose(progress, 0.42).bat.height);
    expect(heights.every((height, index) => index === 0 || height <= (heights.at(index - 1) ?? 0) + 1e-9)).toBe(true);
  });

  it("接触後は肩へ向かって巻き上がり、最大で BAT_FOLLOW_LIFT だけ上がる", () => {
    const end = batterSwingPose(SWING_FOLLOW_END_PROGRESS, 0.72);
    expect(end.bat.height).toBeCloseTo(0.72 + BAT_FOLLOW_LIFT, 12);
    expect(batterSwingPose(1, 0.72).bat.height).toBeGreaterThan(0.72);
    expect(batterSwingPose(1, 0.72).bat.height).toBeLessThan(end.bat.height);
  });
});
