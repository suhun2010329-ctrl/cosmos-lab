// 우주 지도의 네 번째 축 w. 지도 위의 모든 점은 (x, y, z, w)이고, w는 그 천체에서 지금 우리 눈에 닿은 빛이
// 출발한 때 × 빛의 속도 (과거 광원뿔 위의 자리, 단위 pc)다. 행성계 장면에서는 w = 시간 × k (세계선).
// 회전은 4차원 관측실의 여섯 평면 회전(rotate4)을 그대로 쓴다. 각이 모두 0이면 보통의 3차원 지도와 같다.
import { rotate4, type Vec4 } from "../fourd/geometry";

/** 여섯 평면 중 w가 들어간 세 평면의 번호 (PLANES 순서: XY, XZ, XW, YZ, YW, ZW) */
export const XW = 2, YW = 4, ZW = 5;
/** 1년 동안 빛이 가는 거리 [pc] */
export const LY_PC = 0.306601;

/** 여섯 평면 회전각 → 4×4 행렬 (행 우선, 열 j = rotate4(e_j)) */
export function matrix4(angles: readonly number[], out: number[] = new Array(16).fill(0)): number[] {
  for (let j = 0; j < 4; j++) {
    const e: Vec4 = [0, 0, 0, 0];
    e[j] = 1;
    const c = rotate4(e, angles as number[]);
    for (let r = 0; r < 4; r++) out[4 * r + j] = c[r];
  }
  return out;
}

/** w가 화면에 섞이는가 (w가 들어간 평면의 각 중 하나라도 0이 아님) */
export function wMixed(angles: readonly number[]): boolean {
  return Math.abs(angles[XW]) > 1e-4 || Math.abs(angles[YW]) > 1e-4 || Math.abs(angles[ZW]) > 1e-4;
}

/**
 * 셰이더 to4()와 같은 변환: v = M·(x, y, z, w). persp > 0이면 w 방향 원근 k = 1/max(0.2, 1 − persp·v.w/L)
 * (관측자 쪽 w, 즉 더 최근의 빛이 크게 보임). 결과는 화면에 그릴 3차원 좌표.
 */
export function project4(M: readonly number[], x: number, y: number, z: number, w: number, persp = 0, L = 1): [number, number, number] {
  const vx = M[0] * x + M[1] * y + M[2] * z + M[3] * w;
  const vy = M[4] * x + M[5] * y + M[6] * z + M[7] * w;
  const vz = M[8] * x + M[9] * y + M[10] * z + M[11] * w;
  const vw = M[12] * x + M[13] * y + M[14] * z + M[15] * w;
  const k = 1 / Math.max(0.2, 1 - persp * vw / L);
  return [vx * k, vy * k, vz * k];
}

/**
 * 공동 거리 [pc] → 빛이 온 거리 c·t_lookback [pc]. 가까운 우주(1 Mpc 안)에서는 둘이 같다.
 * dcMpc(z): 공동 거리 [Mpc], lookbackYears(z): 되돌아본 시간 [년].
 */
export function lightTravelTable(dcMpc: (z: number) => number, lookbackYears: (z: number) => number): (d: number) => number {
  const dc: number[] = [], dl: number[] = [];
  for (let i = 0; i <= 240; i++) {
    const z = Math.pow(10, -4 + i * 8 / 240) - 1e-4;
    dc.push(dcMpc(z) * 1e6);
    dl.push(lookbackYears(z) * LY_PC);
  }
  const n = dc.length;
  return (d: number) => {
    if (d < 1e6) return d;
    if (d >= dc[n - 1]) return dl[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (dc[m] <= d) lo = m; else hi = m; }
    return dl[lo] + (dl[hi] - dl[lo]) * (d - dc[lo]) / (dc[hi] - dc[lo]);
  };
}

/** 미리 정한 시점 (도) */
export const PRESETS4: Record<string, { XW: number; YW: number; ZW: number; label: string; text: string }> = {
  "3d": { XW: 0, YW: 0, ZW: 0, label: "3차원 단면", text: "w 축이 화면에 수직이라 보이지 않습니다. 보통의 3차원 지도와 같습니다." },
  cone: { XW: 0, YW: 0, ZW: -90, label: "과거 광원뿔", text: "세로축이 공간의 z 대신 w(빛이 떠난 때)가 됩니다. 멀리 있는 천체일수록 아래(더 먼 과거)에 놓여, 우리가 보는 우주가 원뿔 모양의 ‘과거’라는 것이 드러납니다." },
  tilt: { XW: 0, YW: 0, ZW: -45, label: "시공간 45°", text: "z와 w를 반씩 섞었습니다. 공간 구조와 빛의 나이가 함께 보입니다." },
  side: { XW: -60, YW: 0, ZW: -30, label: "옆에서 본 4차원", text: "x와 z가 모두 w와 섞여, 3차원 단면이 4차원 안에서 비스듬히 놓인 모습입니다." },
};
