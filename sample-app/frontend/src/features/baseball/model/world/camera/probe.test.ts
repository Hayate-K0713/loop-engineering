import { it } from "vitest";
import { WORLD_PARAMS } from "../space/params";
import { batLengthScaleFor, batTipX, batterRootFor } from "../motion/batter-layout";
import { projectPoint, zoneRectOf } from "./project";
import { battingCameraFor } from "./rig";

const ZONE = WORLD_PARAMS.zone;

function overlayTop(height: number, layout: "batting" | "pitching", defense: boolean): number {
  if (layout === "batting") return height - 181;
  return defense ? height - 130 : height - (height < 800 ? 300 : 368);
}

it("probe", () => {
  const rows: string[] = [];
  for (const [w, h] of [[390, 844], [390, 745], [390, 664], [375, 667], [360, 640]] as const) {
    for (const layout of ["batting", "pitching"] as const) {
      for (const sa of [null, { top: 155 / h, bottom: overlayTop(h, layout, true) / h }] as const) {
        const pose = battingCameraFor(w / h, layout, sa);
        const r = zoneRectOf(pose, { width: w, height: h }, ZONE);
        const c = (ZONE.top + ZONE.bottom) / 2;
        const hh = ((ZONE.top - ZONE.bottom) / 2) * (5 / 3);
        const g = zoneRectOf(pose, { width: w, height: h }, { halfWidth: ZONE.halfWidth * (5 / 3), bottom: c - hh, top: c + hh, planeZ: ZONE.planeZ });
        const root = batterRootFor(w / h);
        const head = projectPoint(pose, { width: w, height: h }, { x: root.position.x, y: root.scale * 1.53, z: root.position.z });
        const edge = projectPoint(pose, { width: w, height: h }, { x: root.position.x + 0.5 * root.scale, y: root.scale * 1.53, z: root.position.z });
        const torsoEdge = projectPoint(pose, { width: w, height: h }, { x: root.position.x + 0.31 * 1.05 * root.scale, y: root.scale * 0.8, z: root.position.z });
        rows.push(
          `${w}x${h} ${layout} sa=${sa === null ? "null" : "set"} zone L${r.left.toFixed(1)} R${(r.left + r.width).toFixed(1)} T${r.top.toFixed(1)} B${(r.top + r.height).toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)} gridB ${(g.top + g.height).toFixed(1)} lift ${pose.lift.toFixed(4)} fovtan ${(Math.tan((pose.fovDeg * Math.PI) / 360) * (w / h)).toFixed(3)} head x ${head.x.toFixed(1)} r ${(edge.x - head.x).toFixed(1)} headR ${edge.x.toFixed(1)} torsoR ${torsoEdge.x.toFixed(1)}`,
        );
      }
    }
  }
  rows.push(`tip portrait ${batTipX(0.46).toFixed(4)} landscape ${batTipX(16 / 9).toFixed(4)} L ${batLengthScaleFor(0.46)}`);
  console.info(rows.join("\n"));
});
