/** 24bit RGB の数値を CSS の色(`#rrggbb`)にする(`ScoreHud` のチップと `GameScreen` が結果画面に渡す色で共通)。 */
export function toCssColor(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}
