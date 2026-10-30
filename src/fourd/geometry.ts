// 4차원 도형(꼭짓점·모서리), 회전 평면, 회전 프리셋.

export type Vec4 = [number, number, number, number];
export type Edge = [number, number];

export interface Geometry4 {
  v: Vec4[];
  e: Edge[];
  /** 선이 많은 도형: 얇게 그림 */
  dense?: boolean;
}

export interface ShapeDef {
  label: string;
  text: string;
  num: string;
  build(): Geometry4;
}

/** 회전 평면: [축 i, 축 j, 이름]. 4차원에는 평면이 C(4,2) = 6개 */
export const PLANES: [number, number, string][] = [[0, 1, "XY"], [0, 2, "XZ"], [0, 3, "XW"], [1, 2, "YZ"], [1, 3, "YW"], [2, 3, "ZW"]];
export const AXIS_NAMES = ["X", "Y", "Z", "W"];

function dist2(a: Vec4, b: Vec4): number {
  let s = 0;
  for (let k = 0; k < 4; k++) s += (a[k] - b[k]) * (a[k] - b[k]);
  return s;
}

/** 가장 먼 꼭짓점이 반지름 1이 되도록 맞춤 */
function normalize(v: Vec4[]): Vec4[] {
  let r = 0;
  for (const p of v) r = Math.max(r, Math.hypot(p[0], p[1], p[2], p[3]));
  return v.map((p) => p.map((c) => c / r) as Vec4);
}

function edgesWhere(v: Vec4[], test: (a: Vec4, b: Vec4) => boolean): Edge[] {
  const e: Edge[] = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (test(v[i], v[j])) e.push([i, j]);
  return e;
}

const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;

export const SHAPES = {
  tesseract: {
    label: "테서랙트",
    text: "정육면체 8개로 둘러싸인 4차원 정육면체입니다.",
    num: "꼭짓점 16 · 모서리 32 · 면 24 · 셀 8",
    build() {
      const v: Vec4[] = [];
      for (let i = 0; i < 16; i++) v.push([0, 1, 2, 3].map((k) => ((i >> k) & 1 ? 1 : -1)) as Vec4);
      return { v: normalize(v), e: edgesWhere(v, (a, b) => near(dist2(a, b), 4)) };
    },
  },
  cell16: {
    label: "16포체",
    text: "정사면체 16개로 이루어진 도형으로, 테서랙트와 쌍대 관계입니다.",
    num: "꼭짓점 8 · 모서리 24 · 면 32 · 셀 16",
    build() {
      const v: Vec4[] = [];
      for (let k = 0; k < 4; k++) for (const s of [1, -1]) { const p: Vec4 = [0, 0, 0, 0]; p[k] = s; v.push(p); }
      return { v: normalize(v), e: edgesWhere(v, (a, b) => near(dist2(a, b), 2)) };
    },
  },
  cell24: {
    label: "24포체",
    text: "3차원에는 짝이 없는 4차원만의 정다포체입니다. 정팔면체 24개로 이루어집니다.",
    num: "꼭짓점 24 · 모서리 96 · 면 96 · 셀 24",
    build() {
      const v: Vec4[] = [];
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++)
        for (const sa of [1, -1]) for (const sb of [1, -1]) { const p: Vec4 = [0, 0, 0, 0]; p[a] = sa; p[b] = sb; v.push(p); }
      return { v: normalize(v), e: edgesWhere(v, (p, q) => near(dist2(p, q), 2)) };
    },
  },
  cell5: {
    label: "5포체",
    text: "4차원의 삼각형에 해당하는 단체(simplex)입니다. 모든 꼭짓점이 서로 이어져 있습니다.",
    num: "꼭짓점 5 · 모서리 10 · 면 10 · 셀 5",
    build() {
      const a = (1 - Math.sqrt(5)) / 4;
      let v: Vec4[] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [a, a, a, a]];
      const c = [0, 1, 2, 3].map((k) => v.reduce((s, p) => s + p[k], 0) / 5);
      v = v.map((p) => p.map((x, k) => x - c[k]) as Vec4);
      return { v: normalize(v), e: edgesWhere(v, () => true) };
    },
  },
  clifford: {
    label: "클리퍼드 토러스",
    text: "4차원 공의 껍질(3차원 구면) 위에 놓인 토러스입니다. 화면에서는 도넛처럼 보이지만 실제로는 전혀 휘지 않은 평평한 면입니다.",
    num: "격자 24 × 24 · 선분 1,152",
    build() {
      const N = 24, v: Vec4[] = [], e: Edge[] = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const t = 2 * Math.PI * i / N, u = 2 * Math.PI * j / N;
        v.push([Math.cos(t), Math.sin(t), Math.cos(u), Math.sin(u)]);
        e.push([i * N + j, ((i + 1) % N) * N + j]);
        e.push([i * N + j, i * N + (j + 1) % N]);
      }
      return { v: normalize(v), e, dense: true };
    },
  },
} satisfies Record<string, ShapeDef>;

export type ShapeKey = keyof typeof SHAPES;

export interface Preset { label: string; speeds: number[]; note: string }

export const PRESETS = {
  w4: { label: "4차원 회전", speeds: [0, 0, 0.5, 0, 0.3, 0],
    note: "XW·YW 평면 회전입니다. 안쪽 정육면체가 바깥으로 빠져나오며 뒤집히는 움직임이 4차원 회전의 그림자입니다." },
  iso: { label: "이중 회전", speeds: [0.5, 0, 0, 0, 0, 0.5],
    note: "XY와 ZW를 같은 속도로 돌리는 등각 이중 회전(isoclinic)입니다. 3차원에는 없는 방식으로, 멈춰 있는 축이 하나도 없습니다." },
  r3: { label: "3차원 회전만", speeds: [0.3, 0.2, 0, 0.25, 0, 0],
    note: "W가 들어간 평면을 쓰지 않으면 평범한 3차원 회전처럼 보이고, 색도 바뀌지 않습니다." },
  all: { label: "여섯 평면 모두", speeds: [0.2, 0.15, 0.35, 0.1, 0.25, 0.3],
    note: "여섯 평면을 모두 서로 다른 속도로 회전합니다." },
  stop: { label: "정지", speeds: [0, 0, 0, 0, 0, 0],
    note: "모든 회전을 멈췄습니다. 슬라이더로 원하는 평면만 돌려 보세요." },
} satisfies Record<string, Preset>;

export type PresetKey = keyof typeof PRESETS;

/** 여섯 평면 회전을 차례로 적용 (각 평면의 기븐스 회전) */
export function rotate4(src: Vec4, angles: number[]): Vec4 {
  const p = src.slice() as Vec4;
  for (let k = 0; k < 6; k++) {
    const a = angles[k];
    if (a === 0) continue;
    const [i, j] = PLANES[k], c = Math.cos(a), s = Math.sin(a), pi = p[i], pj = p[j];
    p[i] = c * pi - s * pj;
    p[j] = s * pi + c * pj;
  }
  return p;
}
