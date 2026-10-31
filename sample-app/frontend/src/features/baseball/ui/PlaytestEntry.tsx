import type { PlaytestLogApi } from "../hooks/usePlaytestLog";
import { playtestPanelOf } from "../hooks/usePlaytestRecorder";
import { PlaytestPanel } from "./PlaytestPanel";
import "./PlaytestPanel.css";

type PlaytestEntryProps = {
  readonly log: PlaytestLogApi;
  /** 試遊ログの画面を開いている(開閉の状態は `BaseballGamePage` が持ち、開いている間は試合を止める)。 */
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
};

/**
 * 試遊ログの入口(試遊ビルド・開発ビルドだけ。`log.enabled` が偽の通常の本番ビルドでは何も描かない)。ページの最上段に置き、
 * タイトル・試合・結果画面のどこからでも開ける(試合をまたいで記録が残るので、数試合遊んだあとに結果画面から取り出せる)。
 * 閉じている間は小さな「試遊ログ」ボタン、開いている間は試遊ログの画面を全面に重ねる。
 */
export function PlaytestEntry({ log, open, onOpen, onClose }: PlaytestEntryProps) {
  if (!log.enabled) {
    return null;
  }
  return (
    <div className="bb-playtest-host">
      {open ? (
        <PlaytestPanel {...playtestPanelOf(log)} onClose={onClose} />
      ) : (
        <button type="button" className="bb-playtest-entry" data-testid="playtest-open" onClick={onOpen}>
          試遊ログ
        </button>
      )}
    </div>
  );
}
