// 説明(チュートリアル)のカードと、最初の数球のヒントの文言。打撃は**タップ方式**(play 分冊 §1-5)。
// 絵は CSS だけで描くので、`illustration` は CSS のクラスの選択キー。文言はひらがな中心(子どもにも読める)。
import type { IgnoredInputReason } from "../../types/batting";
import type { TutorialStep } from "../../types/view";

export type TutorialMode = "batting" | "pitching";

const SOUND_NOTE = "おとが でないときは、スマホの マナーモードを はずして みてね。";

/** 打撃のカード(3 ページ)。 */
const BATTING_STEPS: readonly TutorialStep[] = [
  {
    id: "batting-drag",
    title: "カーソルを うごかす",
    body: "ゆびを のせて スライドすると、カーソル(きいろ)が うごくよ。",
    illustration: "drag",
  },
  {
    id: "batting-preview",
    title: "ボールの くる ばしょ",
    body: "ボールが くる ところに ● が でるよ。カーソルを ● に あわせよう。",
    illustration: "preview",
  },
  {
    id: "batting-tap",
    title: "リングが かさなったら タップ!",
    body: `リングが ● に かさなる しゅんかんに タップ! もう 1 ほんの ゆび か スイングボタンで おしても OK。ゆびを うごかさず ポンと おそう。${SOUND_NOTE}`,
    illustration: "tap",
  },
];

/** 投球のカード(3 ページ)。 */
const PITCHING_STEPS: readonly TutorialStep[] = [
  {
    id: "pitching-select",
    title: "球しゅを えらぶ",
    body: "なげる 球しゅを えらぼう。はやさと まがる ほうこうも のっているよ。",
    illustration: "select",
  },
  {
    id: "pitching-aim",
    title: "ねらいを きめる",
    body: "ゾーンを なぞって ねらいを きめて、ゆびを はなそう。",
    illustration: "aim",
  },
  {
    id: "pitching-gauge",
    title: "リングが かさなったら タップ!",
    body: `リングが ちぢんで ねらいに かさなる しゅんかんに タップ! ぴったりで ナイスピッチ!${SOUND_NOTE}`,
    illustration: "gauge",
  },
];

/** モードごとのカード。ページ数は常に 3。 */
export function tutorialStepsFor(mode: TutorialMode): readonly TutorialStep[] {
  return mode === "batting" ? BATTING_STEPS : PITCHING_STEPS;
}

/** 最初の何球にヒントを出すか(人間の打撃・投球のそれぞれ)。 */
export const FIRST_BALL_HINT_COUNT = 5;
/** タップが通らなかったときのヒントを出す回数の上限。 */
export const MAX_TAP_HINTS = 3;

const BATTING_HINT = "カーソルを ● に あわせて、リングが かさなったら タップ!";
const PITCHING_HINT = "ゾーンを なぞって ねらって、リングが かさなったら タップ!";

const TAP_HINT = "タップは すばやく ポンと おす";

/** 最初の数球のヒント。`ballsSoFar`(このモードでこれまでに始めた球数)が `FIRST_BALL_HINT_COUNT` 未満のときだけ文言を返す。 */
export function firstBallHint(mode: TutorialMode, ballsSoFar: number): string | null {
  if (ballsSoFar >= FIRST_BALL_HINT_COUNT) {
    return null;
  }
  return mode === "batting" ? BATTING_HINT : PITCHING_HINT;
}

/**
 * タップが通らなかったときのヒント。長押し(`tap-too-long`)と移動(`tap-moved`)のときだけ、
 * これまでに出した回数が `MAX_TAP_HINTS` 未満なら文言を返す。それ以外の理由・上限に達したあとは `null`。
 */
export function tapHintFor(reason: IgnoredInputReason, shownCount: number): string | null {
  if (reason !== "tap-too-long" && reason !== "tap-moved") {
    return null;
  }
  return shownCount < MAX_TAP_HINTS ? TAP_HINT : null;
}
