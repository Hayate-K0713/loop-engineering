import { it } from "vitest";
import { WORLD_PARAMS } from "../space/params";
import { zoneRectOf } from "./project";
import { battingCameraFor } from "./rig";

it("probe", () => {
  const rows: string[] = [];
  for (let h = 560; h <= 900; h += 20) {
    const w = [("batting" as const), ("pitching" as const)].map((layout) => {
      const top = layout === "batting" ? h - 181 : h - 130;
      const pose = battingCameraFor(390 / h, layout, { top: 155 / h, bottom: top / h });
      return zoneRectOf(pose, { width: 390, height: h }, WORLD_PARAMS.zone);
    });
    rows.push(`${h} bat ${w[0]?.width.toFixed(1)}x${w[0]?.height.toFixed(1)} pit ${w[1]?.width.toFixed(1)}x${w[1]?.height.toFixed(1)}`);
  }
  console.info(rows.join("\n"));
});
