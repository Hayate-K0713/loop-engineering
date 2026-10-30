import { useState, type SyntheticEvent } from "react";
import type { PlaytestSummary } from "../types/telemetry";
import "./PlaytestPanel.css";

type PlaytestPanelProps = {
  /** 要約表の元(`summarize(records)` の出力)。 */
  readonly summary: PlaytestSummary;
  /** 記録の件数(リングバッファの現在の件数)。 */
  readonly recordCount: number;
  /** 全記録の JSON(全選択できる `<textarea readonly>` に出す。コピー・ダウンロード・共有の元)。 */
  readonly json: string;
  /** 全記録の CSV(ダウンロード用)。 */
  readonly csv: string;
  /** `localStorage` への保存が失敗している(メモリには残っている)。 */
  readonly saveFailed: boolean;
  /** 画面が縮小表示されている疑い(`innerWidth ≥ 900` かつ `pointer: coarse`)。 */
  readonly scaleWarning: boolean;
  readonly onClear: () => void;
  readonly onClose: () => void;
};

type SummaryRow = { readonly label: string; readonly value: string };

const EMPTY = "-";
const SAVE_FAILED_TEXT = "保存できません(このまま画面から取り出してください)";
const SCALE_WARNING_TEXT = "画面が縮小表示されているかもしれません。文字やボタンが小さいときは、ブラウザの表示を 100% に戻してから遊び直してください。";
const COPY_FALLBACK = "下の枠をタップして全選択し、コピーしてください";

const REASON_LABELS: ReadonlyMap<string, string> = new Map([
  ["not-ready", "受付外(まだ/もう振れない)"],
  ["holding", "演出中"],
  ["tap-too-long", "長押し(180ms 超)"],
  ["tap-moved", "指が動いた(10px 超)"],
  ["cancel", "pointercancel"],
  ["held-release", "スキップに使った指の離し"],
]);

const SOURCE_LABELS: ReadonlyMap<string, string> = new Map([
  ["tap", "タップ"],
  ["touch-second", "2 本目の指"],
  ["button", "ボタン"],
  ["key", "キー"],
  ["mouse", "マウス"],
]);

function percent(value: number | null): string {
  return value === null ? EMPTY : `${(value * 100).toFixed(1)}%`;
}

function fixed(value: number | null, unit: string): string {
  return value === null ? EMPTY : `${value.toFixed(1)}${unit}`;
}

/** 要約表の行。理由別・入力種別の件数は、件数が 0 でも並べる(「無かった」ことも診断の材料)。 */
function summaryRows(summary: PlaytestSummary): readonly SummaryRow[] {
  const countRows = (counts: Readonly<Record<string, number>>, labels: ReadonlyMap<string, string>, prefix: string): SummaryRow[] =>
    Object.entries(counts).map(([key, count]) => ({ label: `${prefix}: ${labels.get(key) ?? key}`, value: String(count) }));
  return [
    { label: "打撃の球数", value: String(summary.battingPitches) },
    { label: "スイング数", value: String(summary.swings) },
    { label: "接触率", value: percent(summary.contactRate) },
    { label: "ストライクを振った割合", value: percent(summary.swingAtStrikeRate) },
    { label: "ボール球を振った割合", value: percent(summary.swingAtBallRate) },
    { label: "押すタイミング 平均", value: fixed(summary.dtMeanMs, " ms") },
    { label: "押すタイミング ばらつき(SD)", value: fixed(summary.dtSdMs, " ms") },
    { label: "カーソルとボールの距離(中央値)", value: fixed(summary.distancePxMedian, " px") },
    ...countRows(summary.ignoredByReason, REASON_LABELS, "スイングにならなかった入力"),
    { label: "pointercancel の回数", value: String(summary.pointerCancels) },
    ...countRows(summary.sources, SOURCE_LABELS, "スイングの入力"),
    { label: "投球数", value: String(summary.pitchesThrown) },
    { label: "ナイスピッチ率", value: percent(summary.niceRate) },
    { label: "フレーム間隔 p95", value: fixed(summary.fpsP95Ms, " ms") },
  ];
}

/** 失敗しても例外を出さず、表示用の文言を返す。sandbox の iframe などで使えない経路は、ボタンを無効にせず失敗を表示する。 */
async function copyText(text: string): Promise<string> {
  try {
    if (typeof navigator.clipboard?.writeText !== "function") {
      return `コピーできません。${COPY_FALLBACK}`;
    }
    await navigator.clipboard.writeText(text);
    return "コピーしました";
  } catch {
    return `コピーできません。${COPY_FALLBACK}`;
  }
}

function downloadText(filename: string, mime: string, text: string): string {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return `${filename} のダウンロードを始めました。始まらないときは、下の枠からコピーしてください`;
  } catch {
    return `ダウンロードできません。${COPY_FALLBACK}`;
  }
}

async function shareText(text: string): Promise<string> {
  try {
    if (typeof navigator.share !== "function") {
      return `共有できません。${COPY_FALLBACK}`;
    }
    await navigator.share({ title: "試遊ログ", text });
    return "共有しました";
  } catch {
    return `共有を完了できませんでした。${COPY_FALLBACK}`;
  }
}

/** 押したときに全文を選ぶ(iOS は `select()` だけでは選べないので `setSelectionRange` も呼ぶ)。 */
function selectAll(event: SyntheticEvent<HTMLTextAreaElement>): void {
  const area = event.currentTarget;
  area.select();
  area.setSelectionRange(0, area.value.length);
}

function SummaryTable({ rows }: { readonly rows: readonly SummaryRow[] }) {
  return (
    <table className="bb-playtest__table" data-testid="playtest-summary">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 試遊ログの画面(開発/試遊ビルドだけ。入口は親が出す)。必ず動く経路は「要約表」と「全選択できる `<textarea readonly>`(JSON)」。
 * コピー・ダウンロード・共有は、使えない環境でも無効にせず、失敗を `role="status"` で表示する。保存失敗と縮小表示の疑いは上部に出す。
 */
export function PlaytestPanel({ summary, recordCount, json, csv, saveFailed, scaleWarning, onClear, onClose }: PlaytestPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const run = (task: Promise<string>): void => {
    void task.then(setStatus);
  };
  return (
    <div className="bb-playtest" data-testid="playtest-panel" role="dialog" aria-modal="true" aria-labelledby="bb-playtest-title">
      <div className="bb-playtest__sheet">
        <header className="bb-playtest__head">
          <h2 id="bb-playtest-title" className="bb-playtest__title">
            試遊ログ({recordCount} 件)
          </h2>
          <button type="button" className="bb-button bb-playtest__button" data-testid="playtest-close" onClick={onClose}>
            とじる
          </button>
        </header>
        {scaleWarning ? (
          <p className="bb-playtest__warn" role="alert" data-testid="playtest-scale-warning">
            {SCALE_WARNING_TEXT}
          </p>
        ) : null}
        {saveFailed ? (
          <p className="bb-playtest__warn" role="alert" data-testid="playtest-save-failed">
            {SAVE_FAILED_TEXT}
          </p>
        ) : null}
        <SummaryTable rows={summaryRows(summary)} />
        <textarea
          className="bb-playtest__json"
          data-testid="playtest-json"
          aria-label="試遊ログ(JSON)"
          readOnly
          rows={8}
          spellCheck={false}
          value={json}
          onFocus={selectAll}
          onClick={selectAll}
        />
        <div className="bb-playtest__actions">
          <button type="button" className="bb-button bb-playtest__button" data-testid="playtest-copy" onClick={() => run(copyText(json))}>
            コピー
          </button>
          <button
            type="button"
            className="bb-button bb-playtest__button"
            data-testid="playtest-download-json"
            onClick={() => setStatus(downloadText("playtest-log.json", "application/json", json))}
          >
            JSON を保存
          </button>
          <button
            type="button"
            className="bb-button bb-playtest__button"
            data-testid="playtest-download-csv"
            onClick={() => setStatus(downloadText("playtest-log.csv", "text/csv", csv))}
          >
            CSV を保存
          </button>
          <button type="button" className="bb-button bb-playtest__button" data-testid="playtest-share" onClick={() => run(shareText(json))}>
            共有
          </button>
          <button type="button" className="bb-button bb-playtest__button bb-playtest__button--danger" data-testid="playtest-clear" onClick={onClear}>
            消去
          </button>
        </div>
        <p className="bb-playtest__status" role="status" data-testid="playtest-status">
          {status}
        </p>
      </div>
    </div>
  );
}
