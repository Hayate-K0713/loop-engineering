// backend(NestJSのDTO兼pure function)とfrontendの両方が参照する唯一の型定義。
// ここを変えれば両側に反映される — API契約のズレを防ぐための共有ポイント。

export interface QuoteInput {
  amount: number;
  taxRate: number;
}

export interface QuoteResult {
  subtotal: number;
  tax: number;
  total: number;
}
