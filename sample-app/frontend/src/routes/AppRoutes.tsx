import { App } from "../App";
import { BaseballGamePage } from "../features/baseball";
import { useHashRoute } from "./use-hash-route";

// hash と画面の対応づけだけを担う薄い層。ゲーム設定や状態はここで扱わない。
export function AppRoutes() {
  const route = useHashRoute();
  if (route === "baseball") {
    return <BaseballGamePage />;
  }
  return <App />;
}
