// render/ のテスト用フィクスチャ。render/ は model/ を import しないため、寸法・色・フレームはここで持つ(値は設計書の初期値)。
import type { BatterPose, CharacterPose, SceneFrame } from "../types/scene";
import type { CharacterRig, CrowdCell, StageGeometry } from "../types/stage";

export function makeRig(): CharacterRig {
  return { hipX: 0.14, hipY: 0.5, torsoY: 0.55, shoulderX: 0.36, shoulderY: 0.48, headY: 0.98, armLength: 0.38 };
}

export function makeGeometry(zone: StageGeometry["zone"] = { halfWidth: 0.26, bottom: 0.42, top: 1.02, planeZ: 0.03 }): StageGeometry {
  return {
    zone,
    ballRadius: 0.1,
    groundSize: 700,
    infield: { dirtRadius: 29, dirtCenterZ: -18.4, dirtY: 0.01, grassSide: 23.5, grassCenterZ: -19.4, grassY: 0.02, homeDirtRadius: 4.2, homeDirtY: 0.03 },
    mound: { radiusTop: 2.6, radiusBottom: 2.9, height: 0.25, y: 0.12, z: -18.4 },
    rubber: { width: 0.6, height: 0.05, depth: 0.15, y: 0.27, z: -18.4 },
    bases: { size: 0.45, height: 0.08, first: { x: 19.4, y: 0.05, z: -19.4 }, second: { x: 0, y: 0.05, z: -38.8 }, third: { x: -19.4, y: 0.05, z: -19.4 } },
    homePlate: {
      points: [
        { x: -0.22, z: -0.2 },
        { x: 0.22, z: -0.2 },
        { x: 0.22, z: 0.02 },
        { x: 0, z: 0.22 },
        { x: -0.22, z: 0.02 },
      ],
      y: 0.04,
    },
    foulLines: { length: 98, width: 0.12, height: 0.02, y: 0.04, centerOffset: 34.6 },
    batterBoxes: { innerX: 0.45, outerX: 1.6, halfDepth: 0.9, y: 0.05 },
    fence: { radius: 105, height: 3.2, y: 1.6, spreadRad: 1.0, cap: { radius: 105.1, height: 0.3, y: 3.25 } },
    stands: { innerRadius: 109, outerRadius: 147, height: 34, y: 20, spreadRad: 1.15 },
    roof: { radius: 155, height: 2, y: 38, spreadRad: 1.15 },
  };
}

/** 32×16 セルの観客席(決定論の Park-Miller 法。列・行に規則的な縞が出ないようにする)。 */
export function makeCrowd(): CrowdCell[] {
  let seed = 1;
  return Array.from({ length: 32 * 16 }, (_, i) => {
    seed = (seed * 48271) % 2147483647;
    return { col: i % 32, row: Math.floor(i / 32), paletteIndex: Math.floor(seed / 7) % 8 };
  });
}

export function makePose(overrides: Partial<CharacterPose> = {}): CharacterPose {
  return {
    visible: true,
    position: { x: 1, y: 0.25, z: -18.4 },
    yaw: 0.5,
    scale: 1.15,
    torso: { x: 0.1, y: 0.2, z: 0.3 },
    head: { x: -0.1, y: 0.4, z: 0 },
    armL: { x: -1.1, y: 0, z: 0.5 },
    armR: { x: -1.2, y: 0.1, z: -0.5 },
    legL: { x: 0.8, y: 0, z: 0 },
    legR: { x: -0.8, y: 0, z: 0.1 },
    ...overrides,
  };
}

export function makeBatterPose(): BatterPose {
  return {
    ...makePose({ position: { x: -0.85, y: 0, z: 0.05 }, yaw: Math.PI / 2 }),
    bat: { visible: true, sweepYaw: -1.9, tilt: -1.05, height: 1.1, lengthScale: 1 },
  };
}

export function makeFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    camera: { position: { x: 0, y: 1.25, z: 3.4 }, target: { x: 0, y: 1, z: -18 }, fovDeg: 34, lift: 0 },
    layout: "batting",
    safeArea: { top: 0.1837, bottom: 0.7855 },
    uniforms: { offense: 0x2f63c8, defense: 0xe8473c },
    ball: { visible: true, position: { x: 0.1, y: 1, z: -5 }, scale: 1, rotation: { x: 0, y: 0, z: 0 }, halo: 0.35, outlineScale: 1.12 },
    pitcher: makePose(),
    catcher: makePose({ visible: false }),
    batter: makeBatterPose(),
    fielders: Array.from({ length: 7 }, () => makePose()),
    zone: { visible: true, grid: true, pulse: 0 },
    landingMark: { visible: false, position: { x: 0, y: 0.07, z: -60 }, radius: 2 },
    cursor: {
      visible: true,
      position: { x: 0.08, y: 0.72, z: 0.03 },
      scaleX: 0.05,
      scaleY: 0.03,
      flash: false,
      raw: { visible: true, position: { x: 0.05, y: 0.7, z: 0.03 } },
    },
    guide: {
      visible: true,
      mode: "exact",
      position: { x: -0.1, y: 0.9, z: 0.03 },
      markerRadius: 0.04,
      fadeRadius: 0.1,
      alpha: 1,
      ring: { visible: true, radius: 0.2, width: 0.01, tone: "preview", glow: 0 },
      spread: { visible: false, radius: 0.1 },
    },
    ...overrides,
  };
}
