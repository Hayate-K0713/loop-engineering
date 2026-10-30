import { describe, expect, it } from "vitest";
import { createSafeStore, type StorageLike } from "./safe-store";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function throwingStorage(): StorageLike {
  const fail = (): never => {
    throw new Error("SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe("createSafeStore", () => {
  it("保存領域が使えるときは書いた値が保存領域にも残る", () => {
    const storage = fakeStorage();
    const store = createSafeStore(() => storage);
    expect(store.lastWriteOk()).toBeNull();
    expect(store.set("a", "1")).toBe(true);
    expect(storage.data.get("a")).toBe("1");
    expect(store.get("a")).toBe("1");
    expect(store.lastWriteOk()).toBe(true);
  });

  it("メモリに無い値は保存領域から読み、メモリに写す", () => {
    const storage = fakeStorage({ k: "stored" });
    const store = createSafeStore(() => storage);
    expect(store.get("k")).toBe("stored");
    storage.data.delete("k");
    expect(store.get("k")).toBe("stored");
    expect(store.get("none")).toBeNull();
  });

  it("remove はメモリと保存領域の両方から消す", () => {
    const storage = fakeStorage({ k: "v" });
    const store = createSafeStore(() => storage);
    expect(store.get("k")).toBe("v");
    expect(store.remove("k")).toBe(true);
    expect(store.get("k")).toBeNull();
    expect(storage.data.has("k")).toBe(false);
  });

  it("getStorage が例外を投げても例外を出さず、メモリで動く", () => {
    const store = createSafeStore(() => {
      throw new Error("SecurityError: localStorage is not available");
    });
    expect(store.get("a")).toBeNull();
    expect(store.set("a", "1")).toBe(false);
    expect(store.lastWriteOk()).toBe(false);
    expect(store.get("a")).toBe("1");
    expect(store.remove("a")).toBe(false);
    expect(store.get("a")).toBeNull();
  });

  it("getItem / setItem / removeItem が例外を投げても例外を出さず、メモリで動く", () => {
    const store = createSafeStore(() => throwingStorage());
    expect(store.get("a")).toBeNull();
    expect(store.set("a", "1")).toBe(false);
    expect(store.lastWriteOk()).toBe(false);
    expect(store.get("a")).toBe("1");
    expect(store.remove("a")).toBe(false);
    expect(store.get("a")).toBeNull();
  });

  it("保存領域が無い(null)ときもメモリで動き、書き込みは false", () => {
    const store = createSafeStore(() => null);
    expect(store.set("a", "1")).toBe(false);
    expect(store.get("a")).toBe("1");
  });

  it("書き込みが一度失敗しても、次に成功すれば lastWriteOk が true に戻る", () => {
    const working = fakeStorage();
    let broken = true;
    const store = createSafeStore(() => (broken ? throwingStorage() : working));
    expect(store.set("a", "1")).toBe(false);
    broken = false;
    expect(store.set("a", "2")).toBe(true);
    expect(store.lastWriteOk()).toBe(true);
    expect(working.data.get("a")).toBe("2");
  });

  it("ストアごとにメモリは独立している", () => {
    const first = createSafeStore(() => null);
    const second = createSafeStore(() => null);
    first.set("a", "1");
    expect(second.get("a")).toBeNull();
  });
});
