import type { StageGeometry } from "../../../types/stage";
import { LANDING_PARAMS } from "../../batting/params";
import { WORLD_PARAMS } from "./params";

// 球場の寸法(StageGeometry)を WORLD_PARAMS と LANDING_PARAMS から組み立てる。render/ はここで作った値だけを読み、寸法を直書きしない。

const STADIUM = WORLD_PARAMS.stadium;

function infieldOf(): StageGeometry["infield"] {
  return {
    dirtRadius: STADIUM.dirt.radius,
    dirtCenterZ: STADIUM.dirt.centerZ,
    dirtY: STADIUM.dirt.y,
    grassSide: STADIUM.infieldGrass.side,
    grassCenterZ: STADIUM.infieldGrass.centerZ,
    grassY: STADIUM.infieldGrass.y,
    homeDirtRadius: STADIUM.homeDirt.radius,
    homeDirtY: STADIUM.homeDirt.y,
  };
}

/** 塁の中心。塁間(= `LANDING_PARAMS.baseDistance`)から導く。一塁は +x、二塁はセンター方向(−z)。 */
function basesOf(): StageGeometry["bases"] {
  const { baseDistance } = LANDING_PARAMS;
  const side = baseDistance * Math.SQRT1_2;
  const { y } = STADIUM.base;
  return {
    size: STADIUM.base.size,
    height: STADIUM.base.height,
    first: { x: side, y, z: -side },
    second: { x: 0, y, z: -2 * side },
    third: { x: -side, y, z: -side },
  };
}

/** 本塁の五角形(XZ 平面の頂点。尖りは捕手側 +z)。 */
function homePlateOf(): StageGeometry["homePlate"] {
  const { halfWidth, frontZ, shoulderZ, tipZ, y } = STADIUM.homePlate;
  return {
    points: [
      { x: -halfWidth, z: frontZ },
      { x: halfWidth, z: frontZ },
      { x: halfWidth, z: shoulderZ },
      { x: 0, z: tipZ },
      { x: -halfWidth, z: shoulderZ },
    ],
    y,
  };
}

/** ファウルラインの箱は本塁から ±45° に長さ `length` で伸び、中心は本塁から `length / 2` の位置にある。 */
function foulLinesOf(): StageGeometry["foulLines"] {
  const { length, width, height, y } = STADIUM.foulLine;
  return { length, width, height, y, centerOffset: (length / 2) * Math.SQRT1_2 };
}

function fenceOf(): StageGeometry["fence"] {
  const { height, y, spreadRad, capRadiusOffset, capHeight, capY } = STADIUM.fence;
  const radius = LANDING_PARAMS.fenceRadius;
  return { radius, height, y, spreadRad, cap: { radius: radius + capRadiusOffset, height: capHeight, y: capY } };
}

/** 球場全体の寸法。 */
export function buildStageGeometry(): StageGeometry {
  return {
    zone: { ...WORLD_PARAMS.zone },
    ballRadius: WORLD_PARAMS.ballRadius,
    groundSize: STADIUM.groundSize,
    infield: infieldOf(),
    mound: { ...STADIUM.mound },
    rubber: { ...STADIUM.rubber },
    bases: basesOf(),
    homePlate: homePlateOf(),
    foulLines: foulLinesOf(),
    batterBoxes: { ...STADIUM.batterBox },
    fence: fenceOf(),
    stands: { ...STADIUM.stands },
    roof: { ...STADIUM.roof },
  };
}

/**
 * スタンドの斜面(下端の半径 `innerRadius` で高さ `y − height / 2`、上端の半径 `outerRadius` で `y + height / 2` の直線)の、
 * 本塁からの水平距離 `radius` における高さ。内側は斜面の延長(地面より下には潜らない)、外側は上端で頭打ちにする。
 */
export function standsHeightAt(stands: StageGeometry["stands"], radius: number): number {
  const ratio = Math.min(1, (radius - stands.innerRadius) / (stands.outerRadius - stands.innerRadius));
  return Math.max(0, stands.y - stands.height / 2 + ratio * stands.height);
}
