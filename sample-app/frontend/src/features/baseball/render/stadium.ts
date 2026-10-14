// 球場の生成(芝・内野・塁・ライン・フェンス・スタンド・屋根・ライト)。寸法はすべて StageGeometry から読む。
// テクスチャは DataTexture のみ(DOM の canvas を使わず、node でも生成できる)。
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineLoop,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  ShapeGeometry,
  Shape,
  Vector2,
  Vector3,
} from "three";
import type { Material } from "three";
import type { CrowdCell, StageGeometry } from "../types/stage";
import { CROWD_PALETTE, FOG_LOOK, LIGHT_LOOK, PALETTE, SKY_HEIGHT, SKY_STOPS, gradientPixels, rgbaPixels } from "./look";

const ARC_SEGMENTS = 64;
const GRASS_STRIPES = 4;
const GRASS_TEXTURE = { width: 4, height: 256, repeatV: 22 } as const;
const CROWD_TEXTURE = { cols: 32, rows: 16, cell: 8, dot: 5, repeatU: 22, repeatV: 5 } as const;
const ANISOTROPY = 4;

function lambert(color: number): MeshLambertMaterial {
  return new MeshLambertMaterial({ color });
}

function texturedLambert(map: DataTexture): MeshLambertMaterial {
  return new MeshLambertMaterial({ color: PALETTE.white, map });
}

function repeating(texture: DataTexture, repeatU: number, repeatV: number): DataTexture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  texture.anisotropy = ANISOTROPY;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** 縞の芝(4本の縞を v 方向に繰り返す)。 */
function createGrassTexture(): DataTexture {
  const { width, height, repeatV } = GRASS_TEXTURE;
  const pixels = rgbaPixels(width, height, (_x, y) => {
    const stripe = Math.floor(((height - 1 - y) / height) * GRASS_STRIPES);
    return stripe % 2 ? PALETTE.grassDark : PALETTE.grassLight;
  });
  return repeating(new DataTexture(pixels, width, height, RGBAFormat), 1, repeatV);
}

function crowdColorAt(cells: ReadonlyMap<number, number>, x: number, y: number): number {
  const { cols, cell, dot } = CROWD_TEXTURE;
  const row = Math.floor(y / cell);
  const localY = y % cell;
  if (localY >= dot + 1) return PALETTE.crowdSeparator;
  const dx = x - (row % 2 ? 0 : cell / 2);
  const col = Math.floor(dx / cell);
  const localX = dx - col * cell;
  const inDot = dx >= 0 && localX >= 1 && localX <= dot && localY >= 1 && localY <= dot;
  const paletteIndex = inDot ? cells.get(row * cols + col) : undefined;
  return paletteIndex === undefined ? PALETTE.crowdBackground : (CROWD_PALETTE.at(paletteIndex) ?? PALETTE.crowdBackground);
}

/** 観客席のドット柄(32×16 セルを 256×128 px に描く。奇数行は半セルずらす)。 */
function createCrowdTexture(crowd: readonly CrowdCell[]): DataTexture {
  const { cols, rows, cell, repeatU, repeatV } = CROWD_TEXTURE;
  const cells = new Map(crowd.map((c) => [c.row * cols + c.col, c.paletteIndex] as const));
  const width = cols * cell;
  const height = rows * cell;
  const pixels = rgbaPixels(width, height, (x, y) => crowdColorAt(cells, x, height - 1 - y));
  return repeating(new DataTexture(pixels, width, height, RGBAFormat), repeatU, repeatV);
}

/** 空のグラデーション(`scene.background` に使う)。上が `SKY_STOPS` の先頭。 */
export function createSkyTexture(): DataTexture {
  const texture = new DataTexture(gradientPixels([...SKY_STOPS].reverse(), SKY_HEIGHT), 1, SKY_HEIGHT, RGBAFormat);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** 遠景の霞(`scene.fog` に使う)。 */
export function createFog(): Fog {
  return new Fog(FOG_LOOK.color, FOG_LOOK.near, FOG_LOOK.far);
}

function flat(geometry: BufferGeometry, color: number, y: number, x: number, z: number): Mesh {
  const mesh = new Mesh(geometry, lambert(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function buildGround(geometry: StageGeometry): Mesh {
  const ground = new Mesh(new PlaneGeometry(geometry.groundSize, geometry.groundSize), texturedLambert(createGrassTexture()));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
}

function buildInfield(geometry: StageGeometry): Mesh[] {
  const { infield, mound, rubber } = geometry;
  const dirt = flat(new CircleGeometry(infield.dirtRadius, ARC_SEGMENTS), PALETTE.dirt, infield.dirtY, 0, infield.dirtCenterZ);
  const grass = flat(new PlaneGeometry(infield.grassSide, infield.grassSide), PALETTE.grassLight, infield.grassY, 0, infield.grassCenterZ);
  grass.rotation.z = Math.PI / 4;
  const homeDirt = flat(new CircleGeometry(infield.homeDirtRadius, 40), PALETTE.dirt, infield.homeDirtY, 0, 0);
  const moundMesh = new Mesh(new CylinderGeometry(mound.radiusTop, mound.radiusBottom, mound.height, 32), lambert(PALETTE.dirt));
  moundMesh.position.set(0, mound.y, mound.z);
  moundMesh.receiveShadow = true;
  const plate = new Mesh(new BoxGeometry(rubber.width, rubber.height, rubber.depth), lambert(PALETTE.white));
  plate.position.set(0, rubber.y, rubber.z);
  return [dirt, grass, homeDirt, moundMesh, plate];
}

function buildBases(geometry: StageGeometry): Mesh[] {
  const { bases, homePlate } = geometry;
  const baseMeshes = [bases.first, bases.second, bases.third].map((position) => {
    const base = new Mesh(new BoxGeometry(bases.size, bases.height, bases.size), lambert(PALETTE.white));
    base.position.set(position.x, position.y, position.z);
    base.rotation.y = Math.PI / 4;
    base.castShadow = true;
    return base;
  });
  // ShapeGeometry を x 軸まわり −π/2 で寝かせると、シェイプの y が世界の −z になる。
  const shape = new Shape(homePlate.points.map((p) => new Vector2(p.x, -p.z)));
  return [...baseMeshes, flat(new ShapeGeometry(shape), PALETTE.white, homePlate.y, 0, 0)];
}

function buildLines(geometry: StageGeometry): Array<Mesh | LineLoop> {
  const { foulLines, batterBoxes } = geometry;
  const lineMaterial = new LineBasicMaterial({ color: PALETTE.white });
  return [1, -1].flatMap((side) => {
    const foul = new Mesh(new BoxGeometry(foulLines.width, foulLines.height, foulLines.length), lambert(PALETTE.white));
    foul.position.set(side * foulLines.centerOffset, foulLines.y, -foulLines.centerOffset);
    foul.rotation.y = -side * (Math.PI / 4);
    const { innerX, outerX, halfDepth, y } = batterBoxes;
    const corners = [
      { x: innerX, z: -halfDepth },
      { x: outerX, z: -halfDepth },
      { x: outerX, z: halfDepth },
      { x: innerX, z: halfDepth },
    ].map((corner) => new Vector3(side * corner.x, y, corner.z));
    return [foul, new LineLoop(new BufferGeometry().setFromPoints(corners), lineMaterial)];
  });
}

/** 本塁中心の円弧(CylinderGeometry の開口・両面)。センター方向(−z)を中心に左右 `spreadRad` ずつ張る。 */
function arc(topRadius: number, bottomRadius: number, height: number, y: number, spreadRad: number, material: Material): Mesh {
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, ARC_SEGMENTS, 1, true, Math.PI - spreadRad, spreadRad * 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = y;
  material.side = DoubleSide;
  return mesh;
}

function buildWalls(geometry: StageGeometry, crowd: readonly CrowdCell[]): Mesh[] {
  const { fence, stands, roof } = geometry;
  return [
    arc(fence.radius, fence.radius, fence.height, fence.y, fence.spreadRad, lambert(PALETTE.fence)),
    arc(fence.cap.radius, fence.cap.radius, fence.cap.height, fence.cap.y, fence.spreadRad, lambert(PALETTE.fenceCap)),
    arc(stands.outerRadius, stands.innerRadius, stands.height, stands.y, stands.spreadRad, texturedLambert(createCrowdTexture(crowd))),
    arc(roof.radius, roof.radius, roof.height, roof.y, roof.spreadRad, lambert(PALETTE.roof)),
  ];
}

function buildLights(shadowMapSize: number): { hemisphere: HemisphereLight; sun: DirectionalLight } {
  const { hemisphere, sun } = LIGHT_LOOK;
  const hemi = new HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity);
  const light = new DirectionalLight(sun.color, sun.intensity);
  light.position.set(sun.position.x, sun.position.y, sun.position.z);
  light.target.position.set(sun.target.x, sun.target.y, sun.target.z);
  light.castShadow = true;
  light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  light.shadow.normalBias = sun.shadow.normalBias;
  const { left, right, top, bottom, near, far } = sun.shadow;
  Object.assign(light.shadow.camera, { left, right, top, bottom, near, far });
  light.shadow.camera.updateProjectionMatrix();
  return { hemisphere: hemi, sun: light };
}

export type StadiumOptions = {
  /** 太陽光の影マップの一辺(px)。省略時は `LIGHT_LOOK.sun.shadow.mapSize`。タッチ端末では小さくする(`shadowMapSizeFor`)。 */
  readonly shadowMapSize?: number;
};

/** 球場全体(地面・内野・塁・ライン・フェンス・スタンド・屋根・ライト)。空と霧は `createSkyTexture`/`createFog` で別に作る。 */
export function buildStadium(geometry: StageGeometry, crowd: readonly CrowdCell[], options: StadiumOptions = {}): Group {
  const group = new Group();
  const { hemisphere, sun } = buildLights(options.shadowMapSize ?? LIGHT_LOOK.sun.shadow.mapSize);
  group.add(buildGround(geometry), ...buildInfield(geometry), ...buildBases(geometry), ...buildLines(geometry), ...buildWalls(geometry, crowd));
  group.add(hemisphere, sun, sun.target);
  return group;
}
