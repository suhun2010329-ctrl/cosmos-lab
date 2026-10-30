// 우리 은하 모형: 은하 중심 기준 좌표 [pc] (축 방향은 은하 좌표계와 같음, 태양은 (−R0, 0, +z☉)).
// 나선팔은 Reid 외 (2019) 메이저 시차 측정으로 맞춘 로그 나선을 단순화했고, 원반·팽대부·막대는 Bland-Hawthorn & Gerhard (2016)의 대표값을 쓴다.
import { rng, gauss } from "../shared/math";
import { R0_PC, Z_SUN_PC } from "./catalog";

/** 나선팔: 이름, β_kink [°], R_kink [kpc], 피치각 안쪽/바깥쪽 [°], β 범위 */
export const ARMS: [string, number, number, number, number, number, number][] = [
  ["직각자–바깥 팔", 18, 4.46, -1.0, 19.5, -30, 280],
  ["방패–센타우루스 팔", 23, 4.91, 14.1, 12.1, -40, 280],
  ["궁수–용골 팔", 24, 6.04, 17.1, 1.0, -30, 210],
  ["국부 팔 (오리온 팔)", 9, 8.26, 11.4, 11.4, -10, 40],
  ["페르세우스 팔", 40, 8.87, 10.3, 8.7, -25, 260],
];

/** 팔 위의 한 점 (은하 중심 기준, 은하 좌표 축) [pc] */
export function armPoint(arm: (typeof ARMS)[number], betaDeg: number): [number, number] {
  const [, bk, rk, pIn, pOut] = arm;
  const psi = (betaDeg < bk ? pIn : pOut) * Math.PI / 180;
  const R = rk * Math.exp(-(betaDeg - bk) * Math.PI / 180 * Math.tan(psi)) * 1000;
  const b = betaDeg * Math.PI / 180;
  // β = 0이 태양 방향(−X), 은하 회전 방향(+Y)으로 증가
  return [-R * Math.cos(b), R * Math.sin(b)];
}

export interface MilkyWayModel { pos: Float32Array; col: Float32Array; size: Float32Array; n: number; dust: { pos: Float32Array; col: Float32Array; size: Float32Array; n: number } }

export function buildMilkyWay(n = 160000): MilkyWayModel {
  const r = rng(424242), pos = new Float32Array(3 * n), col = new Float32Array(4 * n), size = new Float32Array(n);
  const zOff = 0; // 은하 중심 기준 좌표라 은하면이 z = 0 (태양 높이는 GC_POS에 반영)
  const put = (i: number, x: number, y: number, z: number, c: [number, number, number], a: number, s: number) => {
    pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z + zOff;
    col[4 * i] = c[0]; col[4 * i + 1] = c[1]; col[4 * i + 2] = c[2]; col[4 * i + 3] = a; size[i] = s;
  };
  const barAng = 27 * Math.PI / 180; // 막대의 가까운 끝이 l > 0 쪽 (Wegg 외 2015)
  for (let i = 0; i < n; i++) {
    const u = r();
    if (u < 0.12) {
      // 막대 + 팽대부: 길이 반 ~4.5 kpc의 삼축 분포
      const x = gauss(r) * 1700, y = gauss(r) * 600, z = gauss(r) * 420;
      const ca = Math.cos(barAng), sa = Math.sin(barAng);
      // 막대 축을 태양–중심 선에서 27° 돌림 (근단이 +Y 쪽)
      put(i, -(x * ca) + y * sa, x * sa + y * ca, z, [1.0, 0.8, 0.55], 0.5, 60);
    } else if (u < 0.5) {
      // 얇은 원반 (지수 원반, 규모 길이 2.6 kpc, 규모 높이 300 pc)
      const R = -2600 * Math.log(r() * r() + 1e-9), th = r() * 2 * Math.PI;
      if (R > 16000) { i--; continue; }
      const z = 300 * Math.log(r() + 1e-9) * (r() < 0.5 ? 1 : -1);
      put(i, R * Math.cos(th), R * Math.sin(th), z, [1.0, 0.9, 0.78], 0.32, 70);
    } else if (u < 0.93) {
      // 나선팔: 젊고 푸른 별과 붉은 성운
      const arm = ARMS[Math.floor(r() * ARMS.length)], beta = arm[5] + r() * (arm[6] - arm[5]);
      const [x, y] = armPoint(arm, beta), R = Math.hypot(x, y);
      if (R < 2500 || R > 17000) { i--; continue; }
      const w = 350 + 0.04 * R;
      const hii = r() < 0.06;
      put(i, x + gauss(r) * w, y + gauss(r) * w, gauss(r) * 90, hii ? [1.0, 0.45, 0.6] : [0.66, 0.78, 1.0], hii ? 0.6 : 0.42, hii ? 90 : 75);
    } else {
      // 항성 헤일로 (희미함)
      const rr = 3000 * Math.pow(r(), -0.5) - 2000, cz = 2 * r() - 1, ph = 2 * Math.PI * r(), s = Math.sqrt(1 - cz * cz);
      if (rr > 40000 || rr < 1000) { i--; continue; }
      put(i, rr * s * Math.cos(ph), rr * s * Math.sin(ph), rr * cz * 0.8, [1.0, 0.85, 0.7], 0.08, 120);
    }
  }
  // 먼지 띠: 팔 안쪽 가장자리를 따라 어두운 점 (보통 혼합으로 빛을 가림)
  const nd = 22000, dp = new Float32Array(3 * nd), dc = new Float32Array(4 * nd), ds = new Float32Array(nd);
  for (let i = 0; i < nd; i++) {
    const arm = ARMS[Math.floor(r() * 4) === 3 ? 4 : Math.floor(r() * 3)], beta = arm[5] + r() * (arm[6] - arm[5]);
    const [x, y] = armPoint(arm, beta), R = Math.hypot(x, y);
    const inward = -220;
    dp[3 * i] = x + x / R * inward + gauss(r) * 200; dp[3 * i + 1] = y + y / R * inward + gauss(r) * 200; dp[3 * i + 2] = gauss(r) * 50 + zOff;
    dc[4 * i] = 0.05; dc[4 * i + 1] = 0.03; dc[4 * i + 2] = 0.02; dc[4 * i + 3] = 0.25; ds[i] = 160;
  }
  return { pos, col, size, n, dust: { pos: dp, col: dc, size: ds, n: nd } };
}

export const GC_POS: [number, number, number] = [R0_PC, 0, -Z_SUN_PC];
