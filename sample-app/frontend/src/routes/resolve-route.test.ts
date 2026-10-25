import { describe, expect, it } from "vitest";
import { resolveRoute } from "./resolve-route";

describe("resolveRoute", () => {
  it.each(["", "#", "#/"])("%j は home", (hash) => {
    expect(resolveRoute(hash)).toBe("home");
  });

  it.each(["#/baseball", "#/baseball/"])("%j は baseball", (hash) => {
    expect(resolveRoute(hash)).toBe("baseball");
  });

  it.each(["#/unknown", "#/baseballs", "#baseball"])("%j は home", (hash) => {
    expect(resolveRoute(hash)).toBe("home");
  });
});
