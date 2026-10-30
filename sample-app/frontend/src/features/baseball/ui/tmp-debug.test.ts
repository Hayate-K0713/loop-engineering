import { it } from "vitest";
import css from "./Tutorial.css?raw";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlaytestPanel } from "./PlaytestPanel";

it("debug", () => {
  console.log("CSSLEN", css.length, css.slice(0, 80));
  const html = renderToStaticMarkup(
    createElement(PlaytestPanel, {
      summary: {} as never,
      recordCount: 0,
      json: "x",
      csv: "",
      saveFailed: false,
      scaleWarning: false,
      onClear: () => undefined,
      onClose: () => undefined,
    }),
  ).catch?.call;
  console.log(String(html));
});
