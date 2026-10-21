import { useSyncExternalStore } from "react";
import { resolveRoute } from "./resolve-route";

// hashchange を購読する。戻り値は購読解除関数(effect 相当の cleanup)。
function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): "home" | "baseball" {
  return resolveRoute(window.location.hash);
}

// 現在の location.hash に対応する画面名を返す。hash が変わると再描画される。
export function useHashRoute(): "home" | "baseball" {
  return useSyncExternalStore(subscribe, getSnapshot);
}
