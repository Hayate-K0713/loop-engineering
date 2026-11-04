import { assignLooks } from "../model/character/look";
import { INTRO_WIPE_MS, wipeStageAt, type WipeScene, type WipeStage } from "../model/world/camera/wipe";
import { WORLD_PARAMS } from "../model/world/space/params";
import type { CharacterSlot, FaceExpression, QualityTier, SceneFrame, ScenePhase } from "../types/scene";
import type { PlayerLook } from "../types/team";
import type { CastView, WipeView } from "../types/view";

// director が `sceneFrameAt` へ渡す「人物まわり」の入力(フォーム・打席の紹介の時計)と、`sceneFrameAt` の結果から DOM 側の表示(ワイプの帯・`data-expr-*`)を
// 作る純粋関数。three にも DOM にも触れない(時刻は呼び出し側が渡す)。表示専用で、判定・乱数には影響しない。

/** ワイプの帯の補足(背番号・役割ラベル)。`ui/CutIn` の `CutInDetail` と同じ形(`ui` を import しないので構造型で持つ)。 */
export type StageCutInDetail = {
  readonly number: number | null;
  readonly role: string | null;
};

/** `data-expr-*` に出す今の表情(少なくとも `pitcher`・`batter`)。 */
export type StageExpressions = Readonly<Partial<Record<CharacterSlot, FaceExpression>>>;

/** 投手と打者の見た目(フォーム・背番号・ワイプの名前の元)。 */
export type CastLooks = {
  readonly pitcher: PlayerLook;
  readonly batter: PlayerLook;
};

/** 攻守のチームと打者番号から、投手と打者の見た目を求める(`assignLooks` と同じ割り当て)。 */
export function castLooksOf(cast: CastView): CastLooks {
  const assignment = assignLooks(cast);
  return { pitcher: assignment.pitcher, batter: assignment.batter };
}

// ---------- 打席の紹介(ワイプ)の時計 ----------

/**
 * 打席の紹介の時計。`key` = どの打席か、`startedAtMs` = 紹介を始めた時刻(まだなら `null`)、`done` = この打席の紹介は終わった。
 * 同じ打席の 2 球目以降(`key` が同じ)では、もう出さない。
 */
export type IntroClock = {
  readonly key: string | null;
  readonly startedAtMs: number | null;
  readonly done: boolean;
};

export const INITIAL_INTRO_CLOCK: IntroClock = { key: null, startedAtMs: null, done: false };

/** 打席を区別するキー。攻撃側のチームと打者番号が変わるたびに別の打席になる。 */
export function introKeyOf(cast: CastView): string {
  return `${cast.offense.id}:${cast.lineupIndex}`;
}

type IntroStepInput = {
  readonly key: string;
  readonly phase: ScenePhase;
  /** 説明のカード・演出中などで次の投球を止めている間は、紹介を始めない。 */
  readonly paused: boolean;
  readonly nowMs: number;
};

type IntroStep = {
  readonly clock: IntroClock;
  /** 紹介を始めてからの経過(ms)。出さないときは `null`(`SceneFrameInput.introMs`)。 */
  readonly introMs: number | null;
};

/**
 * 時計を 1 フレーム進める。打席が変わったら時計を作り直し、`idle`・`windup` の間に(止めていなければ)始めて `INTRO_WIPE_MS` まで数える。
 * 投球が飛び始めたら、その打席の紹介は終わり。
 */
export function stepIntro(clock: IntroClock, input: IntroStepInput): IntroStep {
  const base: IntroClock = clock.key === input.key ? clock : { key: input.key, startedAtMs: null, done: false };
  if (base.done) {
    return { clock: base, introMs: null };
  }
  if (input.phase !== "idle" && input.phase !== "windup") {
    return { clock: base.startedAtMs === null ? base : { ...base, done: true }, introMs: null };
  }
  const startedAtMs = base.startedAtMs ?? (input.paused ? null : input.nowMs);
  if (startedAtMs === null) {
    return { clock: base, introMs: null };
  }
  const elapsedMs = input.nowMs - startedAtMs;
  if (elapsedMs >= INTRO_WIPE_MS) {
    return { clock: { key: base.key, startedAtMs, done: true }, introMs: null };
  }
  return { clock: { key: base.key, startedAtMs, done: false }, introMs: elapsedMs };
}

// ---------- ワイプの帯・表情の表示 ----------

/** いま出しているワイプの場面。打席の紹介は `idle`・`windup`、それ以外は `play` の間の `plan.wipe` の区間。なければ `null`。 */
export function wipeSceneOf(input: {
  readonly phase: ScenePhase;
  readonly plan: { readonly wipe: readonly WipeStage[] } | null;
  readonly tMs: number;
  readonly introMs: number | null;
}): WipeScene | null {
  const { phase, plan, tMs, introMs } = input;
  if ((phase === "idle" || phase === "windup") && introMs !== null) {
    return "intro";
  }
  if (phase !== "play" || plan === null) {
    return null;
  }
  return wipeStageAt(plan.wipe, tMs)?.scene ?? null;
}

/** 場面ごとの役割ラベル。 */
function roleOf(scene: WipeScene): string {
  switch (scene) {
    case "intro":
      return "打席";
    case "hit":
      return "ヒット!";
    case "homerun":
      return "ホームラン!";
    case "strikeout":
      return "三振";
    case "nice-pitch":
      return "ナイスピッチ!";
  }
}

/** ワイプの帯の名前の元(表示用 view の打者・投手。`GameView` がそのまま満たす)。 */
type WipeNames = {
  readonly batter: { readonly name: string; readonly orderLabel: string };
  readonly pitcher: { readonly name: string };
};

/** ワイプの帯に出す表示。出していないときは `wipe` も `detail` も `null`。 */
export type WipeDisplay = {
  readonly wipe: WipeView | null;
  readonly detail: StageCutInDetail | null;
};

export const NO_WIPE_DISPLAY: WipeDisplay = { wipe: null, detail: null };

/**
 * `SceneFrame.wipe`(カメラ側の指定)から、DOM 側の帯の表示を作る。名前は表示用の view の打者(「1番 カイト」)か投手、背番号は `looks` から。
 * 対象が打者・打者走者・投手のいずれでもない(想定外)ときは、名前・背番号なしで縁だけ出す。
 */
export function wipeDisplayOf(input: {
  readonly scene: WipeScene | null;
  readonly frameWipe: SceneFrame["wipe"];
  readonly view: WipeNames;
  readonly looks: CastLooks;
}): WipeDisplay {
  const { scene, frameWipe, view, looks } = input;
  if (scene === null || !frameWipe.visible) {
    return NO_WIPE_DISPLAY;
  }
  const detail = (number: number | null): StageCutInDetail => ({ number, role: roleOf(scene) });
  switch (frameWipe.target) {
    case "pitcher":
      return { wipe: { visible: true, rect: frameWipe.rect, label: view.pitcher.name }, detail: detail(looks.pitcher.number) };
    case "batter":
    case "runner0":
      return {
        wipe: { visible: true, rect: frameWipe.rect, label: `${view.batter.orderLabel} ${view.batter.name}` },
        detail: detail(looks.batter.number),
      };
    default:
      return { wipe: { visible: true, rect: frameWipe.rect, label: null }, detail: detail(null) };
  }
}

/**
 * この品質ティアでワイプ(第 2 パス)を描くか。描かないティア(T3)では、縁取り・名前の帯(DOM)も出さない(中身の無い枠だけが残らないように)。
 * 値は描画側(`render/stage.ts`)が読むのと同じ `WORLD_PARAMS.qualityTier.tiers`。
 */
export function wipeAllowedAt(tier: QualityTier): boolean {
  return WORLD_PARAMS.qualityTier.tiers.at(tier)?.wipe ?? false;
}

/** `data-expr-pitcher`・`data-expr-batter` に出す今の表情。 */
export function expressionsOf(frame: SceneFrame): StageExpressions {
  return { pitcher: frame.pitcher.expression, batter: frame.batter.expression };
}

// ---------- 同値判定(毎フレーム呼んでも再描画を増やさない) ----------

export function sameWipeView(a: WipeView | null, b: WipeView | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.visible === b.visible &&
    a.label === b.label &&
    a.rect.x === b.rect.x &&
    a.rect.y === b.rect.y &&
    a.rect.width === b.rect.width &&
    a.rect.height === b.rect.height
  );
}

export function sameDetail(a: StageCutInDetail | null, b: StageCutInDetail | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.number === b.number && a.role === b.role;
}

export function sameExpressions(a: StageExpressions, b: StageExpressions): boolean {
  return a.pitcher === b.pitcher && a.batter === b.batter;
}
