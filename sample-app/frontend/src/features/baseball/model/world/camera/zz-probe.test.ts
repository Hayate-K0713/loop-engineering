import { it } from "vitest";
import { WORLD_PARAMS } from "../space/params";
import { projectPoint, zoneRectOf } from "./project";
import { PITCHER_HEAD_TOP, battingCameraFor, fitPortraitFraming } from "./rig";

const ZONE = WORLD_PARAMS.zone;
function grid() {
  const c = (ZONE.top + ZONE.bottom) / 2;
  const h = ((ZONE.top - ZONE.bottom) / 2) * (5 / 3);
  return { halfWidth: ZONE.halfWidth * (5 / 3), bottom: c - h, top: c + h, planeZ: ZONE.planeZ };
}
it("probe", () => {
  const lines: string[] = [];
  for (const [w, h] of [[390, 844], [390, 745], [390, 664], [375, 667], [360, 640], [390, 600], [390, 580], [390, 560]] as const) {
    for (const layout of ["batting", "pitching"] as const) {
      const bar = layout === "batting" ? 181 : h < 800 ? 300 : 368;
      const sa = { top: 155 / h, bottom: (h - bar) / h };
      const pose = battingCameraFor(w / h, layout, sa);
      const fit = fitPortraitFraming(w / h, layout, sa);
      const size = { width: w, height: h };
      const zr = zoneRectOf(pose, size, ZONE);
      const gr = zoneRectOf(pose, size, grid());
      const head = projectPoint(pose, size, PITCHER_HEAD_TOP).y;
      lines.push(`${w}x${h} ${layout}: tan ${fit.halfWidthTan.toFixed(3)} lift ${fit.lift.toFixed(3)} zone ${zr.width.toFixed(0)}x${zr.height.toFixed(0)} y ${zr.top.toFixed(0)}-${(zr.top + zr.height).toFixed(0)} gridBottom ${(gr.top + gr.height).toFixed(0)} overlayTop ${h - bar} headTop ${head.toFixed(1)}`);
    }
  }
  console.log(lines.join("\n"));
});
