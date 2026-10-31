// SDF(符号付き距離)のプリミティブと、RGBA の画素バッファへの描画。顔・背番号・縞のラスタ(E2)が共有する純粋関数群。
// Canvas・DOM は使わない(画素は `Uint8Array` の RGBA。データの先頭の行 = 絵の上端)。座標は画素単位で、x は右・y は下が正。
// 画素の読み書きは `DataView` の 32bit(ビッグエンディアン = R, G, B, A の並び)で行う(変数添字の配列アクセスを避けるため。lint 規約)。

/** 距離関数。点 (x, y) から図形までの符号付き距離(内側が負・単位は画素)。 */
export type Sdf = (x: number, y: number) => number;

/** RGBA の画素バッファ。`data` は幅×高さ×4 バイトで、先頭の行が絵の上端。 */
export type PixelBuffer = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly view: DataView;
};

/** 描画範囲(画素。`x0`・`y0` を含み、`x1`・`y1` を含まない)。 */
export type Bounds = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

const BYTE = 255;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;

/** 24bit RGB の色を 0〜255 の 3 成分に分ける。 */
export function rgbOf(color: number): readonly [number, number, number] {
  return [(color >> RED_SHIFT) & BYTE, (color >> GREEN_SHIFT) & BYTE, color & BYTE];
}

/** 2 つの 24bit RGB の色を `t`(0〜1)で混ぜる(t = 0 で a、t = 1 で b)。 */
export function mixColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  const k = Math.min(1, Math.max(0, t));
  const r = Math.round(ar * (1 - k) + br * k);
  const g = Math.round(ag * (1 - k) + bg * k);
  const bl = Math.round(ab * (1 - k) + bb * k);
  return (r << RED_SHIFT) | (g << GREEN_SHIFT) | bl;
}

/** 全画素が `color`(不透明)で `alpha`(0〜255)の画素バッファを作る。 */
export function createBuffer(width: number, height: number, color: number, alpha: number): PixelBuffer {
  const data = new Uint8Array(width * height * 4);
  const view = new DataView(data.buffer);
  const [r, g, b] = rgbOf(color);
  const packed = ((r << 24) | (g << RED_SHIFT) | (b << GREEN_SHIFT) | alpha) >>> 0;
  const total = width * height;
  for (let p = 0; p < total; p += 1) {
    view.setUint32(p * 4, packed, false);
  }
  return { width, height, data, view };
}

/** 1 画素を (r, g, b, a) の 4 成分で読む。範囲外は透明の黒。 */
export function readPixel(buffer: PixelBuffer, x: number, y: number): readonly [number, number, number, number] {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return [0, 0, 0, 0];
  const packed = buffer.view.getUint32((y * buffer.width + x) * 4, false);
  return [(packed >>> 24) & BYTE, (packed >>> RED_SHIFT) & BYTE, (packed >>> GREEN_SHIFT) & BYTE, packed & BYTE];
}

function over(src: number, dst: number, srcAlpha: number, dstWeight: number, outAlpha: number): number {
  if (outAlpha <= 0) return 0;
  return Math.round((src * srcAlpha + dst * dstWeight) / outAlpha);
}

/** 1 画素へ色 `color` を不透明度 `alpha`(0〜1)で重ねる(通常の over 合成)。範囲外は無視する。 */
export function blendPixel(buffer: PixelBuffer, x: number, y: number, color: number, alpha: number): void {
  if (alpha <= 0 || x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return;
  const offset = (y * buffer.width + x) * 4;
  const packed = buffer.view.getUint32(offset, false);
  const dstAlpha = (packed & BYTE) / BYTE;
  const srcAlpha = Math.min(1, alpha);
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  const [sr, sg, sb] = rgbOf(color);
  const dstWeight = dstAlpha * (1 - srcAlpha);
  const r = over(sr, (packed >>> 24) & BYTE, srcAlpha, dstWeight, outAlpha);
  const g = over(sg, (packed >>> RED_SHIFT) & BYTE, srcAlpha, dstWeight, outAlpha);
  const b = over(sb, (packed >>> GREEN_SHIFT) & BYTE, srcAlpha, dstWeight, outAlpha);
  const a = Math.round(outAlpha * BYTE);
  buffer.view.setUint32(offset, ((r << 24) | (g << RED_SHIFT) | (b << GREEN_SHIFT) | a) >>> 0, false);
}

/** 描画の設定。`softness` = 縁のぼかしの幅(画素。既定 1 = 1 画素のアンチエイリアス)、`opacity` = 全体の不透明度(0〜1)。 */
export type PaintOptions = { readonly softness?: number; readonly opacity?: number };

/**
 * 距離関数 `sdf`(座標系は `buffer` の画素。`offsetX`・`offsetY` を足して書き込む)の内側を `color` で塗る。
 * 範囲は `bounds`(`sdf` の座標系)と `clip`(`buffer` の座標系。外へは書かない)の共通部分。画素の中心(+0.5)で距離を評価する。
 */
export function paintSdf(
  buffer: PixelBuffer,
  placement: { readonly offsetX: number; readonly offsetY: number; readonly clip: Bounds },
  bounds: Bounds,
  sdf: Sdf,
  color: number,
  options: PaintOptions = {},
): void {
  const { offsetX, offsetY, clip } = placement;
  const softness = Math.max(0.0001, options.softness ?? 1);
  const opacity = options.opacity ?? 1;
  const x0 = Math.max(Math.floor(bounds.x0), clip.x0 - offsetX);
  const y0 = Math.max(Math.floor(bounds.y0), clip.y0 - offsetY);
  const x1 = Math.min(Math.ceil(bounds.x1), clip.x1 - offsetX);
  const y1 = Math.min(Math.ceil(bounds.y1), clip.y1 - offsetY);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const coverage = Math.min(1, Math.max(0, 0.5 - sdf(x + 0.5, y + 0.5) / softness));
      if (coverage > 0) blendPixel(buffer, x + offsetX, y + offsetY, color, coverage * opacity);
    }
  }
}

/** 中心 (cx, cy)・半径 r の円。 */
export function circle(cx: number, cy: number, r: number): Sdf {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

/**
 * 中心 (cx, cy)・半径 (rx, ry) の楕円(近似の距離。縁の近くで正確で、AA に十分)。
 * 内側は負、外側は正で、縁(d = 0)は楕円の輪郭に一致する。
 */
export function ellipse(cx: number, cy: number, rx: number, ry: number): Sdf {
  const scale = Math.min(rx, ry);
  return (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * scale;
}

/** 太さ `r * 2` の丸い端の線分(カプセル)。 */
export function capsule(ax: number, ay: number, bx: number, by: number, r: number): Sdf {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = Math.max(dx * dx + dy * dy, 1e-9);
  return (x, y) => {
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
    return Math.hypot(x - (ax + dx * t), y - (ay + dy * t)) - r;
  };
}

/** 中心 (cx, cy)・半幅 (hx, hy)・角の丸み r の長方形。 */
export function roundBox(cx: number, cy: number, hx: number, hy: number, r: number): Sdf {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (hx - r);
    const qy = Math.abs(y - cy) - (hy - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

/** 半平面 `x * nx + y * ny <= offset` の内側(法線 (nx, ny) は単位ベクトル)。距離は法線方向の符号付き距離。 */
export function halfPlane(nx: number, ny: number, offset: number): Sdf {
  return (x, y) => x * nx + y * ny - offset;
}

/**
 * 円弧の線(太さなし)までの距離。中心 (cx, cy)・半径 r で、`mid` 方向(ラジアン。0 = +x、π/2 = +y = 下)を中心に両側へ `half` ずつ開く。
 * `half` ≤ π。太さは `expand` で付ける。
 */
export function arcDistance(cx: number, cy: number, r: number, mid: number, half: number): Sdf {
  const endAx = cx + r * Math.cos(mid - half);
  const endAy = cy + r * Math.sin(mid - half);
  const endBx = cx + r * Math.cos(mid + half);
  const endBy = cy + r * Math.sin(mid + half);
  return (x, y) => {
    const around = Math.atan2(y - cy, x - cx) - mid;
    const rel = Math.atan2(Math.sin(around), Math.cos(around));
    if (Math.abs(rel) <= half) return Math.abs(Math.hypot(x - cx, y - cy) - r);
    return Math.min(Math.hypot(x - endAx, y - endAy), Math.hypot(x - endBx, y - endBy));
  };
}

type Edge = { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number };

/** 凸・凹を問わない単純な多角形(頂点は輪を成す順)。辺は作成時に前計算する。 */
export function polygon(points: readonly (readonly [number, number])[]): Sdf {
  const edges: Edge[] = points.map(([ax, ay], i) => {
    const next = points.at((i + 1) % points.length) ?? [ax, ay];
    return { ax, ay, bx: next[0], by: next[1] };
  });
  return (x, y) => {
    let minDistSq = Infinity;
    let inside = false;
    for (const e of edges) {
      const ex = e.bx - e.ax;
      const ey = e.by - e.ay;
      const t = Math.min(1, Math.max(0, ((x - e.ax) * ex + (y - e.ay) * ey) / Math.max(ex * ex + ey * ey, 1e-9)));
      const px = x - (e.ax + ex * t);
      const py = y - (e.ay + ey * t);
      minDistSq = Math.min(minDistSq, px * px + py * py);
      if (e.ay > y !== e.by > y && x < ((e.bx - e.ax) * (y - e.ay)) / (e.by - e.ay) + e.ax) inside = !inside;
    }
    return inside ? -Math.sqrt(minDistSq) : Math.sqrt(minDistSq);
  };
}

/** 距離を `amount` だけ外へ広げる(負なら縮める)。 */
export function expand(sdf: Sdf, amount: number): Sdf {
  return (x, y) => sdf(x, y) - amount;
}

/** 共通部分(両方の内側)。 */
export function intersect(a: Sdf, b: Sdf): Sdf {
  return (x, y) => Math.max(a(x, y), b(x, y));
}

/** 和集合(どちらかの内側)。 */
export function union(shapes: readonly Sdf[]): Sdf {
  return (x, y) => {
    let best = Infinity;
    for (const shape of shapes) best = Math.min(best, shape(x, y));
    return best;
  };
}

/** 座標系の変換の指定。`angle` = 局所の図形を画面上で時計回り(y 下向きで正)に回す角度(ラジアン)、`mirror` = そのあとで中心を軸に左右反転する。 */
export type Frame = { readonly cx: number; readonly cy: number; readonly angle?: number; readonly mirror?: boolean };

/**
 * 局所座標(原点 = (cx, cy))で作った図形を、画面の座標系へ置く(先に `angle` で回し、そのあと `mirror` で反転する。
 * 左右の目は同じ局所の図形に `mirror` だけを変えて置けば、傾きも左右対称になる)。距離は回転・反転で変わらない。
 */
export function place(frame: Frame, local: Sdf): Sdf {
  const angle = frame.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sign = frame.mirror === true ? -1 : 1;
  return (x, y) => {
    const dx = sign * (x - frame.cx);
    const dy = y - frame.cy;
    return local(dx * cos + dy * sin, -dx * sin + dy * cos);
  };
}

/** 図形を (dx, dy) だけ動かす。 */
export function translate(sdf: Sdf, dx: number, dy: number): Sdf {
  return (x, y) => sdf(x - dx, y - dy);
}

/** 局所座標の図形の外接の正方形(`frame` の中心から半径 `extent`)を画面の座標系の `Bounds` にする。 */
export function boundsAround(cx: number, cy: number, extent: number): Bounds {
  return { x0: cx - extent, y0: cy - extent, x1: cx + extent, y1: cy + extent };
}

/** FNV-1a の 32bit ハッシュ(テストで出力の同一性を固定するための値。暗号用ではない)。 */
export function hashBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash;
}
