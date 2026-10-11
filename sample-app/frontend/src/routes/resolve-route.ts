// location.hash から表示する画面を決める純粋関数。`#/baseball` と `#/baseball/` のみゲーム画面で、他は従来画面。
export function resolveRoute(hash: string): "home" | "baseball" {
  return hash === "#/baseball" || hash === "#/baseball/" ? "baseball" : "home";
}
