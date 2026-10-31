// 우주지도 자료 읽기와 좌표 변환. 모든 위치는 은하 좌표계 직교 좌표 [pc], 원점은 태양.
import { blackbody } from "../shared/color";
import type { RGB } from "../shared/math";

/** ICRS(J2000) → 은하 좌표 회전 행렬 */
const M = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];

export function eqToGal(x: number, y: number, z: number): [number, number, number] {
  return [M[0][0] * x + M[0][1] * y + M[0][2] * z, M[1][0] * x + M[1][1] * y + M[1][2] * z, M[2][0] * x + M[2][1] * y + M[2][2] * z];
}

export function radecToGal(raDeg: number, decDeg: number, d: number): [number, number, number] {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  return eqToGal(d * Math.cos(dec) * Math.cos(ra), d * Math.cos(dec) * Math.sin(ra), d * Math.sin(dec));
}

/** 은하 좌표 (l, b) [도] */
export function galLB(p: ArrayLike<number>): [number, number] {
  const r = Math.hypot(p[0], p[1], p[2]) || 1;
  return [((Math.atan2(p[1], p[0]) * 180 / Math.PI) + 360) % 360, Math.asin(p[2] / r) * 180 / Math.PI];
}

/** B−V 색지수 → 유효 온도 (Ballesteros 2012) */
export function bvToTemp(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

export function starColor(bv: number): RGB {
  const c = blackbody(bvToTemp(Math.max(-0.4, Math.min(2.0, bv))));
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

// ---------- 별 (HYG v4.1) ----------
export interface Stars {
  n: number;
  /** 별 하나에 9개: x, y, z [pc], 절대등급, B−V, vx, vy, vz [pc/년], 깃발 (광도 계급 + 16 × 시선 속도 있음) */
  buf: Float32Array;
  named: { i: number; name: string; spect: string; dist: number; mag: number }[];
}

// ---------- 외계행성 (Open Exoplanet Catalogue) ----------
export interface PlanetRow {
  name: string;
  /** 질량 [M_J], 반지름 [R_J], 주기 [일], 긴반지름 [AU], 이심률 */
  mass: number | null; radius: number | null; period: number | null; a: number | null; e: number | null;
  year: number | null; method: string | null; temp: number | null;
}
export interface PlanetSystem {
  name: string;
  pos: [number, number, number];
  dist: number;
  /** 별 질량 [M☉], 반지름 [R☉], 온도 [K], [Fe/H], 분광형, V등급 */
  star: { mass: number | null; radius: number | null; temp: number | null; feh: number | null; spect: string | null; vmag: number | null };
  hyg: number;
  planets: PlanetRow[];
}

// ---------- 은하 (OpenNGC) ----------
export interface Galaxy {
  id: string;
  common: string;
  messier: number;
  hubble: string;
  pos: [number, number, number];
  /** 거리 [Mpc], 지름 [kpc], 축비, 위치각 [도], 시선 속도 [km/s], B등급 */
  dMpc: number; sizeKpc: number | null; q: number | null; pa: number | null; cz: number | null; bmag: number | null;
  src: "lit" | "virgo" | "fornax" | "z";
  ra: number; dec: number;
}

export interface AtlasData { stars: Stars; systems: PlanetSystem[]; galaxies: Galaxy[] }

export async function loadAtlasData(base: string, onProgress: (msg: string) => void): Promise<AtlasData> {
  onProgress("별 109,400개 읽는 중…");
  const [sb, nm, ex, ga] = await Promise.all([
    fetch(base + "data/stars.bin").then((r) => r.arrayBuffer()),
    fetch(base + "data/star-names.json").then((r) => r.json()),
    fetch(base + "data/exoplanets.json").then((r) => r.json()),
    fetch(base + "data/galaxies.json").then((r) => r.json()),
  ]);
  const buf = new Float32Array(sb);
  const named = (nm as [number, string, string, number, number][]).map(([i, name, spect, dist, mag]) => ({ i, name, spect, dist, mag }));
  const systems: PlanetSystem[] = (ex as RawSystem[]).map((s) => ({
    name: s.n, pos: s.p, dist: s.d, hyg: s.h,
    star: { mass: s.s[0], radius: s.s[1], temp: s.s[2], feh: s.s[3], spect: s.s[4], vmag: s.s[5] },
    planets: s.pl.map((p) => ({ name: p[0], mass: p[1], radius: p[2], period: p[3], a: p[4], e: p[5], year: p[6], method: p[7], temp: p[8] })),
  }));
  const galaxies: Galaxy[] = (ga as RawGalaxy[]).map((g) => ({
    // 파일의 은하 위치는 Mpc 단위라서 지도 단위(pc)로 바꿈
    id: g[0], common: g[1], messier: g[2], hubble: g[3], pos: [g[4][0] * 1e6, g[4][1] * 1e6, g[4][2] * 1e6], dMpc: g[5], sizeKpc: g[6], q: g[7], pa: g[8], cz: g[9], bmag: g[10], src: g[11], ra: g[12], dec: g[13],
  }));
  return { stars: { n: buf.length / 9, buf, named }, systems, galaxies };
}

type RawSystem = { n: string; p: [number, number, number]; d: number; h: number; s: [number | null, number | null, number | null, number | null, string | null, number | null]; pl: [string, number | null, number | null, number | null, number | null, number | null, number | null, string | null, number | null][] };
type RawGalaxy = [string, string, number, string, [number, number, number], number, number | null, number | null, number | null, number | null, number | null, Galaxy["src"], number, number];

/** 질량 → 반지름 (Chen & Kipping 2017 확률적 관계의 평균선) [R⊕] */
export function radiusFromMass(mEarth: number): number {
  if (mEarth < 2.04) return 1.008 * Math.pow(mEarth, 0.279);
  if (mEarth < 132) return 1.23 * Math.pow(mEarth / 2.04, 0.589);
  return 14.3 * Math.pow(mEarth / 132, -0.044);
}

export const MJ_ME = 317.83, RJ_RE = 11.21;

/** 행성 반지름 [R⊕]: 잰 값이 없으면 질량에서 추정 */
export function planetRadiusEarth(p: PlanetRow): { R: number; estimated: boolean } {
  if (p.radius) return { R: p.radius * RJ_RE, estimated: false };
  if (p.mass) return { R: radiusFromMass(p.mass * MJ_ME), estimated: true };
  return { R: 1, estimated: true };
}

/** 행성 긴반지름 [AU]: 없으면 케플러 제3법칙 a³ = M P² */
export function planetA(p: PlanetRow, mStar: number | null): number | null {
  if (p.a) return p.a;
  if (p.period) return Math.cbrt((mStar ?? 1) * Math.pow(p.period / 365.25, 2));
  return null;
}

/** 허블 형태 → 그리기 유형: 0 나선, 1 불규칙, 3 타원, 4 렌즈형 */
export function hubbleType(h: string): number {
  if (!h) return 0;
  if (h.startsWith("E")) return 3;
  if (h.startsWith("S0") || h.startsWith("SB0")) return 4;
  if (h.startsWith("I") || h.includes("m")) return 1;
  return 0;
}

export function hubbleName(h: string): string {
  const t = hubbleType(h);
  if (t === 3) return "타원은하";
  if (t === 4) return "렌즈형 은하";
  if (t === 1) return "불규칙은하";
  return h.startsWith("SB") ? "막대나선은하" : "나선은하";
}
