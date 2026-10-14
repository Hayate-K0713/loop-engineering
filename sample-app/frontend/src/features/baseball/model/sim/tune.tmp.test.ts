/* eslint-disable */
// @ts-nocheck
import { describe, it } from "vitest";
import { BATTING_PARAMS } from "../batting/params";
import { RESULT_TABLE } from "../batting/result-table";
import { getDifficulty } from "../cpu/difficulty";
import { BOTS, rateOf, runBot, runCpuNormal } from "./bot-sim";
import { readFileSync } from "node:fs";
import { simulateGame } from "../game/simulate";

const CONFIG_PATH = "/tmp/claude-0/-home-user/41656968-7fcb-53f0-b4ad-be1c855b6111/scratchpad/tune-configs.json";

function snapshot() {
  return {
    params: JSON.parse(JSON.stringify(BATTING_PARAMS)),
    table: JSON.parse(JSON.stringify(RESULT_TABLE)),
    normal: { ...getDifficulty("normal") },
    easy: { ...getDifficulty("easy") },
    hard: { ...getDifficulty("hard") },
  };
}

function restore(snap) {
  Object.assign(BATTING_PARAMS, snap.params);
  RESULT_TABLE.forEach((row, i) => Object.assign(row.weights, snap.table[i].weights));
  Object.assign(getDifficulty("normal"), snap.normal);
  Object.assign(getDifficulty("easy"), snap.easy);
  Object.assign(getDifficulty("hard"), snap.hard);
}

function applyConfig(cfg) {
  for (const [k, v] of Object.entries(cfg.params ?? {})) BATTING_PARAMS[k] = v;
  for (const [key, w] of Object.entries(cfg.table ?? {})) {
    const [type, strength] = key.split("/");
    const row = RESULT_TABLE.find((r) => r.type === type && r.strength === strength);
    Object.assign(row.weights, w);
  }
  for (const d of ["easy", "normal", "hard"]) Object.assign(getDifficulty(d), (cfg.diff ?? {})[d] ?? {});
}

const f = (x) => (x * 100).toFixed(1).padStart(5);

function balance() {
  const CONFIG = { innings: 9, humanSide: null, difficulty: "normal" };
  const results = Array.from({ length: 100 }, (_, i) => simulateGame(CONFIG, i + 1));
  const plates = results.flatMap((r) => r.plates);
  const cells = results.flatMap((r) => [...r.final.lineScore.away, ...r.final.lineScore.home]);
  const margins = results.map((r) => r.final.lineScore.away.reduce((a, b) => a + b, 0) - r.final.lineScore.home.reduce((a, b) => a + b, 0));
  const count = (o) => plates.filter((p) => p === o).length;
  const hits = plates.filter((p) => ["single", "double", "triple", "homerun"].includes(p)).length;
  const walks = count("walk");
  const away = margins.filter((m) => m > 0).length;
  const home = margins.filter((m) => m < 0).length;
  return `BAL: runs/half ${(cells.reduce((a, b) => a + b, 0) / cells.length).toFixed(2)} K ${f(count("strikeout") / plates.length)} BB ${f(walks / plates.length)} AVG ${(hits / (plates.length - walks)).toFixed(3)} HR ${f(count("homerun") / plates.length)} DP ${count("doublePlay")} draws ${margins.filter((m) => m === 0).length} winrate ${(away / (away + home)).toFixed(2)} PA ${plates.length}`;
}

describe("tune", () => {
  it("sweeps", () => {
    const configs = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    const snap = snapshot();
    const out = [];
    for (const cfg of configs) {
      restore(snap);
      applyConfig(cfg);
      const N = cfg.n ?? 8000;
      const parts = [];
      for (const key of ["A", "B", "B664", "F", "C", "D", "E", "BPower"]) {
        const t = runBot(BOTS[key], N, 20261013);
        parts.push(`${key}: ign${f(rateOf(t, "ignored"))} mis${f(rateOf(t, "miss"))} fou${f(rateOf(t, "foul"))} hit${f(rateOf(t, "hit"))} hr${f(rateOf(t, "homeRun"))}`);
      }
      const c = runCpuNormal(N, 20261014);
      parts.push(`CPU: mis${f(rateOf(c, "miss"))} fou${f(rateOf(c, "foul"))} hit${f(rateOf(c, "hit"))}`);
      parts.push(balance());
      out.push(`## ${cfg.name}\n` + parts.join("\n"));
    }
    restore(snap);
    console.info(out.join("\n"));
  }, 600000);
});
