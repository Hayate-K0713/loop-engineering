// 設定・説明の既読・試遊ログ・品質ティアの保存先。メモリを主とし、ブラウザの保存領域は「任意の保存」として try/catch で守る。
// 公開アーティファクト(sandbox の iframe)では保存領域にさわるだけで例外が出ることがあるので、
// `getStorage` の呼び出し・`getItem`・`setItem`・`removeItem` のどれが例外を投げても、このモジュールからは例外を出さない。
// 保存領域そのものには依存しない(`getStorage` を注入で受ける。実体は hooks が `() => window.localStorage` を渡す)。

/** ブラウザの `Storage` のうち使う部分。 */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** 保存領域を返す関数。取得に失敗したら例外を投げてよい(使えないなら `null` でもよい)。 */
export type StorageGetter = () => StorageLike | null;

export type SafeStore = {
  /** メモリにあればそれ、無ければ保存領域から読む(読めたらメモリに写す)。どちらにも無ければ `null`。 */
  get(key: string): string | null;
  /** メモリに必ず書き、保存領域にも書く。保存領域に書けたら `true`、書けなかった(例外・無い)なら `false`(メモリには残る)。 */
  set(key: string, value: string): boolean;
  /** メモリと保存領域から消す。保存領域から消せたら `true`。 */
  remove(key: string): boolean;
  /** 直近の保存領域への書き込み/消去の結果。まだ試していなければ `null`。画面の「保存できません」表示に使う。 */
  lastWriteOk(): boolean | null;
};

function readStorage(getStorage: StorageGetter, key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(getStorage: StorageGetter, key: string, value: string): boolean {
  try {
    const storage = getStorage();
    if (storage === null) {
      return false;
    }
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeFromStorage(getStorage: StorageGetter, key: string): boolean {
  try {
    const storage = getStorage();
    if (storage === null) {
      return false;
    }
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** 保存先を作る。呼び出しごとに独立したメモリを持つ。 */
export function createSafeStore(getStorage: StorageGetter): SafeStore {
  const memory = new Map<string, string>();
  let lastWrite: boolean | null = null;
  return {
    get(key) {
      const cached = memory.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const stored = readStorage(getStorage, key);
      if (stored !== null) {
        memory.set(key, stored);
      }
      return stored;
    },
    set(key, value) {
      memory.set(key, value);
      lastWrite = writeStorage(getStorage, key, value);
      return lastWrite;
    },
    remove(key) {
      memory.delete(key);
      lastWrite = removeFromStorage(getStorage, key);
      return lastWrite;
    },
    lastWriteOk() {
      return lastWrite;
    },
  };
}
