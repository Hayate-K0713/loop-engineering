import { useEffect, useRef } from "react";
import { assignLooks, hairRgb } from "../model/character/look";
import { rasterAtlas, rasterPlainAtlas, type FaceAtlas } from "../model/character/raster/face";
import { rasterPinstripe, type FabricTexture } from "../model/character/raster/fabric";
import { rasterNumber, type NumberColors, type NumberDecal } from "../model/character/raster/number";
import { mixColor } from "../model/character/raster/primitives";
import type { CharacterLookData, CharacterSlot, ScenePhase } from "../types/scene";
import type { StageHandle } from "../types/stage";
import type { PlayerLook, Team } from "../types/team";
import { useLatest } from "./useLatest";

// 画面の 14 体の見た目(顔・髪・ユニフォーム・背番号)を、model の割り当て(`assignLooks`)とラスタ(`model/character/raster`)から
// `CharacterLookData` にして `StageHandle.setLook` へ渡す(character 分冊 §3-4-2「生成の負荷」)。
// 顔アトラスのラスタ生成は実機で 100ms を超えうるので、(1) 飛行中・演出中(`idle` 以外)は生成も差し替えもしない、
// (2) 1 フレームに生成するのは顔 1 体分まで、(3) まだ作れていない体には無地の仮の顔を貼って進行を止めない、(4) 空き時間に次の打者・両チームの全員を先読みする。
// ここは `three` を import しない(受け渡すのはプレーンデータだけ)。ロジックは純関数と `createLookController` に寄せ、hook は rAF のループだけを持つ。

/** 近景の優先順位(画面に大きく映る順)。打者 → 投手 → 捕手 → 走者 → 野手。 */
const SLOT_PRIORITY: readonly CharacterSlot[] = [
  "batter",
  "pitcher",
  "catcher",
  "runner0",
  "runner1",
  "runner2",
  "runner3",
  "fielder0",
  "fielder1",
  "fielder2",
  "fielder3",
  "fielder4",
  "fielder5",
  "fielder6",
];

/** ズボンの色(白)。ユニフォームの色の導き方はモデルに定義が無いので、チーム色 `uniformColor` からここで決める。 */
export const UNIFORM_PANTS = 0xf2f2f2;
/** 差し色・背番号の数字・ピンストライプの縞の色(白)。 */
export const UNIFORM_ACCENT = 0xffffff;
/** 背番号の縁取りの色を作るときに、チーム色へ混ぜる黒の割合。 */
const NUMBER_OUTLINE_DARKEN = 0.55;

/** 先読みで、攻撃側の何人先の打者まで見るか(次の打者・その次)。 */
const UPCOMING_BATTERS = 2;

/** 顔以外の見た目(`CharacterLookData` から顔・背番号・模様を除いた、チームの色)。 */
export type UniformColors = Omit<CharacterLookData["uniform"], "pattern">;

/** チーム色から、ユニフォームの各部の色を決める。帽子・ヘルメット・ストッキングはチーム色、ズボンと差し色は白。 */
export function uniformColorsOf(team: Team): UniformColors {
  const base = team.uniformColor;
  return { base, pants: UNIFORM_PANTS, accent: UNIFORM_ACCENT, socks: base, cap: base, helmet: base };
}

/** 背番号の配色(数字は差し色、縁取りはチーム色を暗くしたもの)。 */
export function numberColorsOf(team: Team): NumberColors {
  return { fill: UNIFORM_ACCENT, outline: mixColor(team.uniformColor, 0x000000, NUMBER_OUTLINE_DARKEN) };
}

/** 攻撃側(打者・走者)の枠か。それ以外は守備側。 */
export function isOffenseSlot(slot: CharacterSlot): boolean {
  return slot === "batter" || slot.startsWith("runner");
}

/** 顔アトラスを作ってよい/差し替えてよい場面か。飛行中(`flight`)・投球動作中(`windup`)・演出中(`play`)は偽、`idle` だけ真。 */
export function canGenerateLooks(phase: ScenePhase): boolean {
  return phase === "idle";
}

/** 顔アトラスの絵が決まる項目(`rasterAtlas` が読む肌・目・眉・口)。同じキーなら同じ顔なので、選手をまたいで共有する。 */
export function faceKeyOf(look: PlayerLook): string {
  return `${look.skin}.${look.eyes}.${look.brow}.${look.restMouth}`;
}

/** 1 つの枠の見た目の全体を表すキー(顔・髪・体格・背番号・チーム色・縞)。同じ枠で同じキーなら `setLook` し直さない。 */
export function lookKeyOf(look: PlayerLook, team: Team): string {
  const hair = `${look.hair.style}.${look.hair.color}`;
  return `${faceKeyOf(look)}|${hair}|${look.build}|${look.number}|${team.uniformColor}.${team.pinstripe}`;
}

/** 1 つの枠が欲しい見た目。 */
export type LookRequest = {
  readonly slot: CharacterSlot;
  readonly look: PlayerLook;
  readonly team: Team;
};

/** 14 体の枠が欲しい見た目を、優先順位(打者から)に並べる。純関数(同じ入力なら同じ結果)。 */
export function wantedLooks(offense: Team, defense: Team, lineupIndex: number): readonly LookRequest[] {
  const assignment = assignLooks({ offense, defense, lineupIndex });
  const bySlot = new Map<string, PlayerLook>(Object.entries(assignment));
  return SLOT_PRIORITY.map((slot) => ({ slot, look: bySlot.get(slot) ?? assignment.batter, team: isOffenseSlot(slot) ? offense : defense }));
}

/**
 * 先読みする選手の見た目(顔だけ生成して貯める)。攻撃側の次の打者から順に、続けて両チームの投手・打線の全員。
 * 攻守交代の直後でも、顔がすでに貯まっているようにする。重複は呼び出し側が顔のキーで弾く。
 */
export function prefetchLooks(offense: Team, defense: Team, lineupIndex: number): readonly PlayerLook[] {
  const upcoming = Array.from({ length: UPCOMING_BATTERS }, (_unused, step) => assignLooks({ offense, defense, lineupIndex: lineupIndex + step + 1 }).batter);
  return [
    ...upcoming,
    defense.pitcher.look,
    ...defense.batters.map((batter) => batter.look),
    offense.pitcher.look,
    ...offense.batters.map((batter) => batter.look),
  ];
}

/** ラスタ関数の束。テストでは呼ばれた回数を数えるものに差し替える。 */
export type LookRaster = {
  readonly face: (look: PlayerLook) => FaceAtlas;
  readonly plain: (skin: number) => FaceAtlas;
  readonly number: (value: number, colors: NumberColors) => NumberDecal;
  readonly pinstripe: (base: number, stripe: number) => FabricTexture;
};

export const DEFAULT_LOOK_RASTER: LookRaster = {
  face: rasterAtlas,
  plain: rasterPlainAtlas,
  number: rasterNumber,
  pinstripe: rasterPinstripe,
};

/** `step` の結果。`pending` が真の間は、次のフレームでもう一度 `step` を呼ぶ。 */
export type LookStepResult = {
  /** このフレームで新しく作った顔アトラスの数(0 か 1)。 */
  readonly generatedFaces: number;
  /** このフレームで `setLook` した枠の数。 */
  readonly appliedSlots: number;
  /** まだ本物の顔が貼れていない枠、または先読みが残っているか。 */
  readonly pending: boolean;
};

export type LookSink = (slot: CharacterSlot, data: CharacterLookData) => void;

export type LookController = {
  /** 1 フレーム分の仕事。顔アトラスの生成は 1 回まで。 */
  readonly step: (wanted: readonly LookRequest[], prefetch: readonly PlayerLook[], sink: LookSink) => LookStepResult;
  /** 適用済みの記録を忘れる(ステージを作り直したとき)。作った顔・背番号・縞のキャッシュは残す。 */
  readonly reset: () => void;
  /** 顔アトラスを作った累計(テスト・計測用)。 */
  readonly generatedFaceCount: () => number;
};

type Applied = { readonly key: string; readonly placeholder: boolean };

/** 顔・背番号・縞・無地の顔のキャッシュ。同じ背番号・同じチームには同じ `Uint8Array` のインスタンスを返す(render 側は配列の同一性で共有する)。 */
function createPieceCache(raster: LookRaster): {
  readonly cachedFace: (look: PlayerLook) => FaceAtlas | undefined;
  readonly makeFace: (look: PlayerLook) => FaceAtlas;
  readonly plain: (skin: number) => FaceAtlas;
  readonly decal: (value: number, team: Team) => NumberDecal;
  readonly fabric: (team: Team) => FabricTexture | null;
} {
  const faces = new Map<string, FaceAtlas>();
  const plains = new Map<number, FaceAtlas>();
  const decals = new Map<string, NumberDecal>();
  const fabrics = new Map<string, FabricTexture>();
  return {
    cachedFace: (look) => faces.get(faceKeyOf(look)),
    makeFace: (look) => {
      const key = faceKeyOf(look);
      const found = faces.get(key);
      if (found !== undefined) return found;
      const made = raster.face(look);
      faces.set(key, made);
      return made;
    },
    plain: (skin) => {
      const found = plains.get(skin);
      if (found !== undefined) return found;
      const made = raster.plain(skin);
      plains.set(skin, made);
      return made;
    },
    decal: (value, team) => {
      const key = `${value}|${team.uniformColor}`;
      const found = decals.get(key);
      if (found !== undefined) return found;
      const made = raster.number(value, numberColorsOf(team));
      decals.set(key, made);
      return made;
    },
    fabric: (team) => {
      if (!team.pinstripe) return null;
      const found = fabrics.get(String(team.uniformColor));
      if (found !== undefined) return found;
      const made = raster.pinstripe(team.uniformColor, UNIFORM_ACCENT);
      fabrics.set(String(team.uniformColor), made);
      return made;
    },
  };
}

/** 枠の `CharacterLookData` を組み立てる(顔は引数。背番号・縞はキャッシュから)。 */
function buildLookData(request: LookRequest, face: FaceAtlas, pieces: ReturnType<typeof createPieceCache>): CharacterLookData {
  const { slot, look, team } = request;
  const pattern = pieces.fabric(team);
  return {
    slot,
    skin: look.skin,
    build: look.build,
    hair: { style: look.hair.style, color: hairRgb(look.hair.color) },
    eyes: look.eyes,
    faceAtlas: face,
    numberDecal: pieces.decal(look.number, team),
    uniform: { ...uniformColorsOf(team), pattern: pattern === null ? null : pattern.rgba },
  };
}

/**
 * 見た目の受け渡しの状態機械(`React` に依存しない)。枠ごとに「何を貼ったか(本物/仮)」を覚え、`step` ごとに
 * (1) 本物の顔がまだの枠のうち最優先の 1 体だけ顔を生成し、(2) 顔が揃った枠には本物を、揃っていない枠には無地の仮の顔を貼り、
 * (3) 生成する対象が無ければ先読みを 1 体分進める。同じ見た目を二度生成せず、貼ったものと同じなら `setLook` しない。
 */
export function createLookController(raster: LookRaster = DEFAULT_LOOK_RASTER): LookController {
  const pieces = createPieceCache(raster);
  const applied = new Map<CharacterSlot, Applied>();
  let generated = 0;

  const isRealApplied = (request: LookRequest): boolean => {
    const current = applied.get(request.slot);
    return current !== undefined && !current.placeholder && current.key === lookKeyOf(request.look, request.team);
  };

  const apply = (request: LookRequest, face: FaceAtlas, placeholder: boolean, sink: LookSink): void => {
    sink(request.slot, buildLookData(request, face, pieces));
    applied.set(request.slot, { key: lookKeyOf(request.look, request.team), placeholder });
  };

  const applyPlaceholder = (request: LookRequest, sink: LookSink): boolean => {
    const current = applied.get(request.slot);
    if (current !== undefined && current.placeholder && current.key === lookKeyOf(request.look, request.team)) return false;
    apply(request, pieces.plain(request.look.skin), true, sink);
    return true;
  };

  const generate = (look: PlayerLook): number => {
    if (pieces.cachedFace(look) !== undefined) return 0;
    pieces.makeFace(look);
    generated += 1;
    return 1;
  };

  const step = (wanted: readonly LookRequest[], prefetch: readonly PlayerLook[], sink: LookSink): LookStepResult => {
    const stale = wanted.filter((request) => !isRealApplied(request));
    const uncached = (look: PlayerLook): boolean => pieces.cachedFace(look) === undefined;
    const toMake = stale.find((request) => uncached(request.look))?.look ?? prefetch.find(uncached);
    const generatedFaces = toMake === undefined ? 0 : generate(toMake);
    let appliedSlots = 0;
    for (const request of stale) {
      const face = pieces.cachedFace(request.look);
      if (face !== undefined) {
        apply(request, face, false, sink);
        appliedSlots += 1;
      } else if (applyPlaceholder(request, sink)) {
        appliedSlots += 1;
      }
    }
    const waiting = wanted.some((request) => !isRealApplied(request));
    const prefetching = prefetch.some(uncached);
    return { generatedFaces, appliedSlots, pending: waiting || prefetching };
  };

  return {
    step,
    reset: () => applied.clear(),
    generatedFaceCount: () => generated,
  };
}

export type UseCharacterLooksOptions = {
  /** 見た目を貼る先。作る前・破棄後・WebGL 不可のときは `null`(何もしない)。 */
  readonly stage: StageHandle | null;
  /** 攻撃側のチーム(打者・走者)。 */
  readonly offense: Team;
  /** 守備側のチーム(投手・捕手・野手)。 */
  readonly defense: Team;
  /** 攻撃側の現在の打者番号。 */
  readonly lineupIndex: number;
  /** 演出の段階。`idle` の間だけ生成・差し替えをする(飛行中・演出中はしない)。 */
  readonly phase: ScenePhase;
};

/**
 * 14 体の見た目を `stage.setLook` へ渡す。打者・チームが変わるたびに、`idle` の間だけ rAF で 1 フレームずつ進める
 * (顔の生成は 1 フレーム 1 体まで、まだの体は無地の仮の顔、終われば先読みをして止まる)。
 * effect の cleanup は rAF のキャンセル。ステージが作り直されたら、適用済みの記録を捨てて貼り直す(キャッシュは残す)。
 */
export function useCharacterLooks(options: UseCharacterLooksOptions): void {
  const { stage, offense, defense, lineupIndex, phase } = options;
  const latest = useLatest(options);
  const controllerRef = useRef<LookController | null>(null);
  const lastStageRef = useRef<StageHandle | null>(null);
  const active = stage !== null && canGenerateLooks(phase);
  const wakeKey = `${offense.id}:${defense.id}:${lineupIndex}`;

  useEffect(() => {
    if (stage === null || !active) {
      return undefined;
    }
    controllerRef.current ??= createLookController();
    const controller = controllerRef.current;
    if (lastStageRef.current !== stage) {
      controller.reset();
      lastStageRef.current = stage;
    }
    const wanted = wantedLooks(latest.current.offense, latest.current.defense, latest.current.lineupIndex);
    const prefetch = prefetchLooks(latest.current.offense, latest.current.defense, latest.current.lineupIndex);
    let frameId = 0;
    const tick = (): void => {
      if (!canGenerateLooks(latest.current.phase)) {
        return;
      }
      const result = controller.step(wanted, prefetch, (slot, data) => stage.setLook(slot, data));
      if (result.pending) {
        frameId = window.requestAnimationFrame(tick);
      }
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [stage, active, wakeKey, latest]);
}
