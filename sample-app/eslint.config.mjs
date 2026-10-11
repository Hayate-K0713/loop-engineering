// @ts-check
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import security from "eslint-plugin-security";
import prettierRecommended from "eslint-plugin-prettier/recommended";

// loop-basic の「静的解析・自動チェックの考え方」に沿った設定。
// 参照: ../CLAUDE.md の「静的解析・自動チェックの考え方(壊れたら赤くなる仕組み)」
//
// - サイズ/複雑さ/型の締め付けルール、sonarjs/security の recommended ルールは、
//   既存コードの指摘がゼロであることを確認した上で error(ブロッキング)に昇格済み
//   (drain してから ratchet)。経緯は docs/memory/entries/eslint-strictness-ratchet-v2.md を参照。
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/playwright-report/**", "**/test-results/**"],
  },
  ...tseslint.configs.strict,
  sonarjs.configs.recommended,
  security.configs.recommended,
  {
    rules: {
      // サイズ・複雑さの締め付け(記事「②」相当)。指摘ゼロを確認しerrorへ昇格。
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ["error", 20],
      "max-depth": ["error", 4],
      "max-params": ["error", 6],
      "max-nested-callbacks": ["error", 4],

      // 型の締め付け(strictプリセットに加えて明示)。指摘ゼロを確認しerrorへ昇格。
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",

      // security/recommended はデフォルトで全ルールwarnのため、明示的にerrorへ昇格。
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-object-injection": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-bidi-characters": "error",

      // backend(NestJS)の @Module クラスはデコレータだけを持つ「空クラス」が正しい書き方であり、
      // 是正すべき負債ではない。ドレイン対象ではなくフレームワークの慣用パターンとの
      // 構造的な不一致なので、warnで様子見にせず最初からoffにする(理由をここに明記)。
      "@typescript-eslint/no-extraneous-class": "off",

      // `const { secret, ...rest } = obj` はフィールドを構造的に除外する書き方であり、
      // 残った各変数が使われていなくても未使用変数ではない。
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // テストファイルはdescribe/itのネストが構造上避けられないため、
    // 長さ・コールバックネストの締め付けはノイズになる。複雑度系のルールは維持する。
    files: ["**/*.spec.{ts,js}", "**/*.test.{ts,js}"],
    rules: {
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },
  prettierRecommended,
);
