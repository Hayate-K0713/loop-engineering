import { it } from "vitest";
import { batTipX } from "../motion/batter-layout";

it("probe", () => {
  const rows = Array.from({ length: 31 }, (_, i) => 0.7 + i * 0.01).map((a) => `${a.toFixed(2)} ${batTipX(a).toFixed(4)}`);
  console.info(rows.join("\n"));
});
