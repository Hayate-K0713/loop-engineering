import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createSafeStore, type SafeStore } from "../model/prefs/safe-store";
import { toCsv } from "../model/telemetry/csv";
import { buildSessionRecord, isSuspectedScaledDown } from "../model/telemetry/records";
import { PLAYTEST_STORAGE_KEY, appendRecord, parseRecords, serializeRecords } from "../model/telemetry/ring-buffer";
import type { PlaytestDevice, PlaytestRecord } from "../types/telemetry";

/**
 * 試遊ログを有効にするか。開発ビルド(`import.meta.env.DEV`)または試遊ビルド(`VITE_PLAYTEST=1`)だけ真で、
 * 通常の本番ビルドでは偽(記録せず、ブラウザの保存領域にも一切さわらない)。
 */
export const PLAYTEST_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_PLAYTEST === "1";

/** 保存領域への書き込みをまとめる待ち時間(ms)。記録のたびに最大 600 件を直列化しないため。 */
export const PLAYTEST_SAVE_DELAY_MS = 1000;

export type PlaytestLogOptions = {
  /** 有効/無効の差し替え(テスト用)。省略は `PLAYTEST_ENABLED`。 */
  readonly enabled?: boolean;
  /** 保存先の差し替え(テスト用)。省略はこのフックが `createSafeStore` で作る。 */
  readonly store?: SafeStore;
};

export type PlaytestLogApi = {
  /** 試遊ログが有効か。偽なら以下はすべて何もしない/空を返す。 */
  readonly enabled: boolean;
  readonly sessionId: string;
  /** 起動時に読んだ端末情報。無効のときは `null`。 */
  readonly device: PlaytestDevice | null;
  /** 縮小表示の疑い(`innerWidth ≥ 900` かつ `pointer: coarse`)。画面の警告に使う。 */
  readonly scaledDownSuspected: boolean;
  /** 現在の記録(最大 600 件、古い順)。画面の要約表の元。 */
  readonly records: readonly PlaytestRecord[];
  /** 直近の保存領域への書き込みが失敗したか。「保存できません(このまま画面から取り出してください)」の表示に使う。 */
  readonly saveFailed: boolean;
  /** `performance.now()` の値をセッション開始からの経過 ms にする(記録の `atMs`)。省略は現在時刻。 */
  readonly elapsedMs: (nowMs?: number) => number;
  /** 1 件足す。最大 600 件を超えたら古いほうから落ちる。 */
  readonly record: (record: PlaytestRecord) => void;
  /** 全件を消す(保存領域の分も)。 */
  readonly clear: () => void;
  /** 全件の JSON(`<textarea>`・コピー・ダウンロード・共有の共通の形)。呼んだときに組み立てる。 */
  readonly exportJson: () => string;
  /** 全件の CSV(ダウンロード用)。呼んだときに組み立てる。 */
  readonly exportCsv: () => string;
};

function readDevice(): PlaytestDevice {
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    pointerCoarse: typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
    visualViewportScale: window.visualViewport?.scale ?? 1,
    userAgent: window.navigator.userAgent,
  };
}

/** ページを読み込んだ時刻から作るセッション ID(乱数を使わない)。 */
function makeSessionId(): string {
  return Math.round(performance.timeOrigin).toString(36);
}

type Writer = {
  readonly flush: () => void;
  readonly schedule: () => void;
  readonly cancel: () => void;
  readonly saveFailed: boolean;
  /** 保存の失敗表示を直近の書き込み結果に合わせる(消去のあと等)。 */
  readonly syncSaveFailed: () => void;
};

/**
 * 保存領域への任意の保存。書き込みを `PLAYTEST_SAVE_DELAY_MS` までまとめ、`flush` で即時に書く。
 * 変更が無ければ書かない。無効(`enabled` が偽)のときは `flush` も何もせず、保存領域にさわらない。
 */
function usePlaytestWriter(enabled: boolean, store: SafeStore, recordsRef: RefObject<readonly PlaytestRecord[]>, dirtyRef: RefObject<boolean>): Writer {
  const [saveFailed, setSaveFailed] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const handlersRef = useRef<Omit<Writer, "saveFailed"> | null>(null);
  if (handlersRef.current === null) {
    const cancel = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const syncSaveFailed = (): void => setSaveFailed(store.lastWriteOk() === false);
    const flush = (): void => {
      cancel();
      if (!enabled || !dirtyRef.current) {
        return;
      }
      dirtyRef.current = false;
      store.set(PLAYTEST_STORAGE_KEY, serializeRecords(recordsRef.current));
      syncSaveFailed();
    };
    const schedule = (): void => {
      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(flush, PLAYTEST_SAVE_DELAY_MS);
      }
    };
    handlersRef.current = { flush, schedule, cancel, syncSaveFailed };
  }
  return { ...handlersRef.current, saveFailed };
}

type Session = {
  readonly enabled: boolean;
  readonly store: SafeStore;
  readonly startMs: number;
  readonly sessionId: string;
  readonly device: PlaytestDevice | null;
  /** 前回の記録(リロードしても取り出せるよう引き継ぐ)。無効のときは保存領域を読まず空。 */
  readonly initial: readonly PlaytestRecord[];
};

/** 起動時に 1 回だけ決まる値(有効/無効・保存先・開始時刻・セッション ID・端末情報・前回の記録)。 */
function useSession(options: PlaytestLogOptions): Session {
  const [session] = useState<Session>(() => {
    const enabled = options.enabled ?? PLAYTEST_ENABLED;
    const store = options.store ?? createSafeStore(() => window.localStorage);
    return {
      enabled,
      store,
      startMs: performance.now(),
      sessionId: makeSessionId(),
      device: enabled ? readDevice() : null,
      initial: enabled ? parseRecords(store.get(PLAYTEST_STORAGE_KEY)) : [],
    };
  });
  return session;
}

type LifecycleArgs = {
  readonly session: Session;
  readonly record: (record: PlaytestRecord) => void;
  readonly elapsedMs: (nowMs?: number) => number;
  readonly flush: () => void;
};

/** 起動時にセッションの記録を 1 件足し(StrictMode の二重実行でも 1 回)、ページを離れる/破棄されるときに保存を確定する。 */
function usePlaytestLifecycle({ session, record, elapsedMs, flush }: LifecycleArgs): void {
  const { enabled, device, sessionId } = session;
  const sessionLoggedRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    if (!sessionLoggedRef.current && device !== null) {
      sessionLoggedRef.current = true;
      record(buildSessionRecord(elapsedMs(), sessionId, device));
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [enabled, device, sessionId, record, elapsedMs, flush]);
}

/**
 * 試遊ログ(`PLAYTEST_ENABLED` のときだけ動く)。**記録の主はメモリ**(ref のリングバッファ、最大 600 件)で、
 * 保存領域(`createSafeStore` 経由。直接 `localStorage` にはさわらない)への保存は任意: 書き込みをまとめ、失敗しても記録は続き `saveFailed` に出る。
 * 無効のときは保存領域を読みも書きもしない。外部送信はしない。
 */
export function usePlaytestLog(options: PlaytestLogOptions = {}): PlaytestLogApi {
  const session = useSession(options);
  const { enabled, store, startMs, sessionId, device, initial } = session;
  const [records, setRecords] = useState<readonly PlaytestRecord[]>(initial);
  const recordsRef = useRef<readonly PlaytestRecord[]>(initial);
  const dirtyRef = useRef(false);
  const writer = usePlaytestWriter(enabled, store, recordsRef, dirtyRef);
  const { flush, schedule, cancel, syncSaveFailed } = writer;

  const record = useCallback(
    (next: PlaytestRecord): void => {
      if (!enabled) {
        return;
      }
      recordsRef.current = appendRecord(recordsRef.current, next);
      dirtyRef.current = true;
      setRecords(recordsRef.current);
      schedule();
    },
    [enabled, schedule],
  );

  const clear = useCallback((): void => {
    if (!enabled) {
      return;
    }
    cancel();
    recordsRef.current = [];
    dirtyRef.current = false;
    setRecords([]);
    store.remove(PLAYTEST_STORAGE_KEY);
    syncSaveFailed();
  }, [enabled, store, cancel, syncSaveFailed]);

  const elapsedMs = useCallback((nowMs?: number): number => (nowMs ?? performance.now()) - startMs, [startMs]);

  usePlaytestLifecycle({ session, record, elapsedMs, flush });

  const exportJson = useCallback((): string => serializeRecords(recordsRef.current), []);
  const exportCsv = useCallback((): string => toCsv(recordsRef.current), []);

  return {
    enabled,
    sessionId,
    device,
    scaledDownSuspected: device !== null && isSuspectedScaledDown(device),
    records,
    saveFailed: writer.saveFailed,
    elapsedMs,
    record,
    clear,
    exportJson,
    exportCsv,
  };
}
