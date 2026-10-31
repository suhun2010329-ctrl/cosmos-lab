// 탐사선 미션 계획: 호만 전이(Δv · 비행 시간 · 위상각)로 행성 사이 이동을 계산하고, 오늘 행성 위치에서 다음 발사 창을 찾는다.
// 지구 둘레의 대표적인 인공위성 궤도도 여기서 정의한다.
//
// 궤도 전이 공식과 발사체 자료(2026-02-15 기준)는 Space Engineering Pack을 참고했다.
//   Original work by IDEAMAX Skills Factory
//   Creator: Dimitar Georgiev - Biko
//   https://ideamax.eu | https://biko.bg | https://github.com/devideamax
//   MIT License + Attribution (전문: THIRD_PARTY_NOTICES.md)
import * as THREE from "three";
import { FACTS } from "./bodies";
import { orbitPos, type SysPlanet } from "./system";

const MU_SUN = 1.32712440018e11; // km³/s²
const MU_EARTH = 3.986004418e5;
const AU_KM = 1.495978707e8;
const G_KM = 6.6743e-20; // km³/(kg s²)

export interface Vehicle { name: string; maker: string; costM: number; leo: number; gto?: number; mars?: number; tli?: number; reusable: boolean; status: string }
/** 발사체 (Space Engineering Pack vehicles.json, 2026-02-15 기준; 스타십 비용은 목표값) */
export const VEHICLES: Vehicle[] = [
  { name: "팰컨 9 블록 5", maker: "SpaceX", costM: 67, leo: 22800, gto: 8300, mars: 4020, reusable: true, status: "운용 중" },
  { name: "팰컨 헤비", maker: "SpaceX", costM: 97, leo: 63800, gto: 26700, mars: 16800, reusable: true, status: "운용 중" },
  { name: "스타십 + 슈퍼 헤비", maker: "SpaceX", costM: 10, leo: 150000, gto: 21000, mars: 100000, reusable: true, status: "개발 중 (비용은 목표값)" },
  { name: "일렉트론", maker: "Rocket Lab", costM: 7.5, leo: 300, reusable: false, status: "운용 중" },
  { name: "뉴트론", maker: "Rocket Lab", costM: 55, leo: 13000, gto: 1500, reusable: true, status: "개발 중" },
  { name: "아리안 6 (A64)", maker: "ArianeGroup", costM: 115, leo: 21600, gto: 11500, reusable: false, status: "운용 중" },
  { name: "벌컨 센타우르", maker: "ULA", costM: 110, leo: 27200, gto: 7300, reusable: false, status: "운용 중" },
  { name: "뉴 글렌", maker: "Blue Origin", costM: 68, leo: 45000, gto: 13600, reusable: true, status: "운용 중" },
  { name: "SLS 블록 1", maker: "NASA/Boeing", costM: 2200, leo: 95000, tli: 27000, reusable: false, status: "운용 중 (2년에 1회)" },
  { name: "창정 5호", maker: "CASC", costM: 60, leo: 25000, gto: 14000, reusable: false, status: "운용 중" },
  { name: "H3", maker: "JAXA/MHI", costM: 50, leo: 6500, gto: 3500, reusable: false, status: "운용 중" },
];

export interface Transfer {
  target: string;
  /** 전이 궤도 긴반지름 [AU], 비행 시간 [일], 출발 위상각 [°] */
  aT: number; tofDays: number; phaseDeg: number;
  /** 출발·도착 쌍곡선 초과 속도 [km/s], C3 [km²/s²] */
  vInf1: number; vInf2: number; c3: number;
  /** 지구 저궤도(200 km)에서 출발 Δv, 도착 행성 낮은 궤도 진입 Δv [km/s] */
  dvDepart: number; dvCapture: number;
  /** 다음 발사 창: 지금부터 [일], 회합 주기 [일] */
  windowDays: number; synodicDays: number;
  /** 발사 때 지구의 황경 [rad] */
  lambda0: number;
  r1: number; r2: number;
}

function helioLongitude(p: SysPlanet, days: number, v: THREE.Vector3): number {
  orbitPos(p, days, v);
  return Math.atan2(-v.z, v.x);
}
const wrap = (x: number) => ((x % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;

/**
 * 지구 → 목표 행성 호만 전이 (원 궤도 근사, 행성 궤도 경사 무시).
 * Δv₁ = √(μ/r₁)(√(2r₂/(r₁+r₂)) − 1), 비행 시간 = π√(a_t³/μ), 필요한 위상각 = π − n₂ · TOF
 * 발사 창은 J2000 궤도 요소로 계산한 실제 행성 위치에서 위상각이 맞는 날을 찾는다.
 */
export function planTransfer(earth: SysPlanet, target: SysPlanet, nowDays: number): Transfer {
  const r1 = earth.a * AU_KM, r2 = target.a * AU_KM, aT = (r1 + r2) / 2;
  const tof = Math.PI * Math.sqrt(aT ** 3 / MU_SUN), n2 = Math.sqrt(MU_SUN / r2 ** 3);
  const vInf1 = Math.abs(Math.sqrt(MU_SUN / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1));
  const vInf2 = Math.abs(Math.sqrt(MU_SUN / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))));
  const rp = 6378.1 + 200;
  const dvDepart = Math.sqrt(vInf1 ** 2 + 2 * MU_EARTH / rp) - Math.sqrt(MU_EARTH / rp);
  const f = FACTS[target.name], muP = f ? f.mass * 1e24 * G_KM : 0, rc = f ? f.radius * 1.1 : 1;
  const dvCapture = muP ? Math.sqrt(vInf2 ** 2 + 2 * muP / rc) - Math.sqrt(muP / rc) : NaN;
  const phase = wrap(Math.PI - n2 * tof);
  const synodic = 1 / Math.abs(1 / earth.P - 1 / target.P);
  // 위상각 오차가 0을 지나는 첫날 (하루 간격으로 훑은 뒤 이분법)
  const v = new THREE.Vector3(), err = (d: number) => wrap(helioLongitude(target, d, v) - helioLongitude(earth, d, v) - phase);
  let d0 = nowDays, e0 = err(d0), found = nowDays;
  for (let d = nowDays + 1; d < nowDays + synodic * 1.5 + 2; d++) {
    const e1 = err(d);
    if (Math.sign(e1) !== Math.sign(e0) && Math.abs(e1 - e0) < Math.PI) {
      let lo = d0, hi = d;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (Math.sign(err(m)) === Math.sign(e0)) lo = m; else hi = m; }
      found = (lo + hi) / 2;
      break;
    }
    d0 = d; e0 = e1;
  }
  return {
    target: target.name, aT: aT / AU_KM, tofDays: tof / 86400, phaseDeg: phase * 180 / Math.PI,
    vInf1, vInf2, c3: vInf1 ** 2, dvDepart, dvCapture, windowDays: found - nowDays, synodicDays: synodic,
    lambda0: helioLongitude(earth, found, v), r1: earth.a, r2: target.a,
  };
}

/** 전이 궤도 위 탐사선 위치 [AU, three 좌표]. 발사 뒤 경과 일수 t (0 ~ TOF) */
export function probePosition(tr: Transfer, tDays: number, out: THREE.Vector3): THREE.Vector3 {
  const q = Math.min(tr.r1, tr.r2), Q = Math.max(tr.r1, tr.r2), a = (q + Q) / 2, e = (Q - q) / (Q + q);
  const outward = tr.r2 > tr.r1, u = Math.max(0, Math.min(1, tDays / tr.tofDays));
  const M = outward ? Math.PI * u : Math.PI + Math.PI * u;
  let E = M;
  for (let k = 0; k < 12; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E)), lam = tr.lambda0 + (outward ? nu : nu - Math.PI);
  return out.set(r * Math.cos(lam), 0, -r * Math.sin(lam));
}

/** 전이 궤도 반 바퀴의 점들 */
export function transferPath(tr: Transfer): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 128; k++) pts.push(probePosition(tr, tr.tofDays * k / 128, new THREE.Vector3()));
  return pts;
}

/** 지구 둘레의 대표 인공위성 궤도: 이름, 고도 [km], 경사 [°], 주기 [분], 설명 */
export const SATELLITES_EARTH: [string, number, number, number, string][] = [
  ["국제우주정거장 (ISS)", 420, 51.6, 92.9, "1998년부터 조립. 사람이 늘 머무는 가장 큰 인공 구조물 (약 420톤)."],
  ["허블 우주 망원경", 535, 28.5, 95.4, "1990년 발사. 대기 끌림으로 고도가 서서히 낮아지고 있습니다."],
  ["스타링크 (한 궤도면)", 550, 53, 95.6, "수천 기가 여러 궤도면에 나뉘어 도는 통신 위성군."],
  ["GPS 위성", 20200, 55, 717.97, "중궤도 위성 31기 안팎. 하루에 두 바퀴 돌며 위치를 알려 줍니다."],
  ["정지 궤도", 35786, 0, 1436.1, "적도 위에서 지구 자전과 같이 돌아 하늘의 한 점에 멈춰 보이는 궤도 (방송·기상 위성)."],
];
/** 제임스 웹 우주 망원경: 태양–지구 L2 점 (지구에서 약 150만 km, 태양 반대쪽) */
export const JWST_KM = 1.5e6;
