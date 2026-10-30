// 우주의 미래 시나리오: 오늘(Planck 2018 ΛCDM 역사)에서 출발해 프리드만 방정식을 우주 시간 t로 적분한다.
// 팽창이 멈추고 수축하는 경우(H < 0)도 다루므로, 척도 인자 a가 아니라 t를 기준으로 표를 만든다.
import type { Cosmology } from "./cosmology";
import { GYR, YEAR } from "./format";

export type FateKey = "lcdm" | "desi" | "crunch" | "rip";

export interface FateEvent {
  /** 빅뱅 후 시각 [s] */
  t: number;
  label: string;
  detail: string;
  /** 끝(크런치·빅 립)까지 남은 시간 [s]: 끝에 아주 가까운 사건은 t로는 구별되지 않으므로 이 값으로 비교 */
  rem?: number;
}

export interface Fate {
  key: FateKey;
  name: string;
  short: string;
  source: string;
  text: string;
  end: "forever" | "decelerate" | "crunch" | "rip";
  /** 오늘 [s] */
  t0: number;
  /** 표의 끝: 크런치·빅 립 시각, 또는 영원히 팽창하는 경우 보여 줄 끝 [s] */
  tEnd: number;
  /** 팽창이 수축으로 바뀌는 시각과 그때의 a */
  tTurn: number | null;
  aMax: number | null;
  aAt(t: number): number;
  /** 부호 있는 허블 매개변수 [1/s] (수축이면 음수) */
  HAt(t: number): number;
  /** 끝(크런치·빅 립)까지 남은 시간 r[s]로 본 a와 H. t = tEnd − r 은 r이 아주 작으면 배정밀도로 구별되지 않으므로 따로 둠 */
  aFromEnd(r: number): number;
  HFromEnd(r: number): number;
  events: FateEvent[];
}

/**
 * 크런치 시나리오 매개변수: 오늘부터 굴러가기 시작하는 초경량 축이온 장(포텐셜 ½μ²ψ²) + 음의 우주상수.
 * Luu, Qiu & Tye (2025)의 결론(총수명 약 33 Gyr)에 맞춰 단순화해 맞춘 값이다. μ는 H0 단위.
 */
export const CRUNCH_MU = 2.1;
export const CRUNCH_OL = -1.05;
/** 빅 립: 상태 방정식 w = −1.5인 팬텀 에너지 (Caldwell, Kamionkowski & Weinberg 2003의 예) */
export const RIP_W = -1.5;

const A_SWITCH = 1e-3;

interface Track { t: Float64Array; a: Float64Array; H: Float64Array; n: number }

/**
 * 오늘(a = 1)부터 τ = H0 t 로 RK4 적분. 상태 [a, ψ, dψ/dτ].
 * E²(a, ψ, ψ') = Ωr/a⁴ + Ωm/a³ + ρ_DE(a) + ½ψ'² + ½μ²ψ²,  ψ'' = −3Eψ' − μ²ψ
 */
function integrate(core: Cosmology, rhoDE: (a: number) => number, mu: number, psi0: number, tauMax: number, aStop: number): Track & { turn: number | null; aMax: number | null; ended: "crunch" | "rip" | "open"; K?: number } {
  const E2 = (a: number, p: number, dp: number) => core.Or / (a * a * a * a) + core.Om / (a * a * a) + rhoDE(a) + 0.5 * dp * dp + 0.5 * mu * mu * p * p;
  const cap = 200000, T = new Float64Array(cap), A = new Float64Array(cap), Hh = new Float64Array(cap);
  let a = 1, p = psi0, dp = 0, tau = core.tOf(0) * core.H0s, sign = 1, n = 0, turn: number | null = null, aMax: number | null = null;
  const f = (a: number, p: number, dp: number): [number, number, number] => {
    const E = sign * Math.sqrt(Math.max(E2(a, p, dp), 0));
    return [a * E, dp, -3 * E * dp - mu * mu * p];
  };
  const push = () => { T[n] = tau / core.H0s; A[n] = a; Hh[n] = sign * Math.sqrt(Math.max(E2(a, p, dp), 0)) * core.H0s; n++; };
  push();
  while (n < cap - 1) {
    const H = Math.sqrt(Math.max(E2(a, p, dp), 0)), dt = Math.min(0.002, 0.002 / (H + 1e-12));
    const k1 = f(a, p, dp);
    const k2 = f(a + dt / 2 * k1[0], p + dt / 2 * k1[1], dp + dt / 2 * k1[2]);
    const k3 = f(a + dt / 2 * k2[0], p + dt / 2 * k2[1], dp + dt / 2 * k2[2]);
    const k4 = f(a + dt * k3[0], p + dt * k3[1], dp + dt * k3[2]);
    const na = a + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    // 팽창이 멈추는 순간(E² = 0)을 지나면 H의 부호를 바꿔 수축으로 넘어감
    if (sign > 0 && (E2(na, p, dp) <= 0 || na < a)) { sign = -1; turn = tau / core.H0s; aMax = a; continue; }
    a = na;
    p += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    dp += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    tau += dt;
    push();
    if (sign < 0 && a < A_SWITCH) return { t: T, a: A, H: Hh, n, turn, aMax, ended: "crunch", K: 0.5 * dp * dp * Math.pow(a, 6) };
    if (a > aStop) return { t: T, a: A, H: Hh, n, turn, aMax, ended: "rip" };
    if (tau > tauMax) break;
  }
  return { t: T, a: A, H: Hh, n, turn, aMax, ended: "open" };
}

function lookup(tr: Track, t: number, arr: Float64Array): number {
  if (t <= tr.t[0]) return arr[0];
  if (t >= tr.t[tr.n - 1]) return arr[tr.n - 1];
  let lo = 0, hi = tr.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr.t[m] <= t) lo = m; else hi = m; }
  const w = (t - tr.t[lo]) / (tr.t[hi] - tr.t[lo]);
  return arr[lo] + (arr[hi] - arr[lo]) * w;
}

/** 감속 변수 q = −ä a / ȧ² 의 부호가 바뀌는 시각들 (H의 수치 미분) */
function accelFlips(tr: Track): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 1; i < tr.n - 1; i++) {
    const dH = (tr.H[i + 1] - tr.H[i - 1]) / (tr.t[i + 1] - tr.t[i - 1]);
    const acc = Math.sign(dH + tr.H[i] * tr.H[i]);
    if (prev && acc !== prev) out.push(tr.t[i]);
    prev = acc;
  }
  return out;
}

/** 묶여 있는 계(공전 주기 P)가 빅 립보다 얼마나 먼저 찢기는가 (Caldwell 외 2003): Δt ≈ P √(2|1+3w|) / (6π|1+w|) */
export function ripLead(P: number, w = RIP_W): number {
  return P * Math.sqrt(2 * Math.abs(1 + 3 * w)) / (6 * Math.PI * Math.abs(1 + w));
}

const DAY = 86400;

export function buildFates(core: Cosmology, desi: Cosmology): Record<FateKey, Fate> {
  const t0 = core.tOf(0), DE0 = 1 - core.Om - core.Or, horizon = 80 * GYR;
  const tauMax = (t0 + horizon) * core.H0s;
  const local: FateEvent[] = [
    { t: t0 + 4.5 * GYR, label: "우리 은하–안드로메다 접근", detail: "두 은하가 수십억 년 안에 가까이 지나가거나 합쳐질 수 있습니다(Sawala 외 2025: 100억 년 안에 합쳐질 확률 약 50%)." },
    { t: t0 + 5 * GYR, label: "태양이 적색거성으로", detail: "태양이 수소를 다 쓰고 부풀어 올라 수성·금성을 삼킵니다." },
  ];

  function make(key: FateKey, info: Omit<Fate, "key" | "t0" | "tEnd" | "tTurn" | "aMax" | "aAt" | "HAt" | "aFromEnd" | "HFromEnd" | "events" | "end">, tr: ReturnType<typeof integrate>, extra: FateEvent[]): Fate {
    let tEnd = tr.t[tr.n - 1], end: Fate["end"] = key === "desi" ? "decelerate" : "forever";
    let tSw = 0;
    // 크런치 직전 (a < 10⁻³): 우주상수와 축이온 포텐셜은 무시할 만하고, 수축 중에는 장의 운동 에너지가
    // 반(反)마찰로 a⁻⁶처럼 커진다(딱딱한 물질). E² = Ωr/a⁴ + Ωm/a³ + K/a⁶ 이므로
    // 크런치까지 남은 시간 rem(a) = (1/H0) ∫₀^a a'² da' / √(Ωr a'² + Ωm a'³ + K) 를 표로 만든다.
    const NR = 1600, remA = new Float64Array(NR), remT = new Float64Array(NR);
    if (tr.ended === "crunch") {
      const K = Math.max(tr.K ?? 0, 1e-300), aSw = tr.a[tr.n - 1], l0 = Math.log(1e-40), dl = (Math.log(aSw) - l0) / (NR - 1);
      const g = (a: number) => a * a * a / Math.sqrt(core.Or * a * a + core.Om * a * a * a + K);
      remA[0] = 1e-40; remT[0] = Math.pow(1e-40, 3) / (3 * Math.sqrt(K));
      for (let i = 1; i < NR; i++) {
        remA[i] = Math.exp(l0 + i * dl);
        remT[i] = remT[i - 1] + 0.5 * (g(remA[i - 1]) + g(remA[i])) * dl;
      }
      for (let i = 0; i < NR; i++) remT[i] /= core.H0s;
      tSw = tEnd;
      tEnd = tSw + remT[NR - 1];
      end = "crunch";
    } else if (tr.ended === "rip") {
      // 남은 적분 ∫ da/(aE), E ≈ √Ω_DE a^(−3(1+w)/2)
      const a = tr.a[tr.n - 1], k = -1.5 * (1 + RIP_W);
      tEnd += Math.pow(a, -k) / (k * Math.sqrt(DE0)) / core.H0s;
      end = "rip";
    }
    const tLast = tr.t[tr.n - 1], kRip = -1.5 * (1 + RIP_W);
    const aFromEnd = (r: number): number => {
      r = Math.max(r, 0);
      if (end === "crunch" && r < tEnd - tSw) {
        if (r <= remT[0]) return remA[0] * Math.cbrt(r / remT[0]);
        let lo = 0, hi = NR - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (remT[m] <= r) lo = m; else hi = m; }
        const w = Math.log(r / remT[lo]) / Math.log(remT[hi] / remT[lo]);
        return Math.exp(Math.log(remA[lo]) + w * Math.log(remA[hi] / remA[lo]));
      }
      // 빅 립 직전: 팬텀 에너지만 남아 a ∝ r^(−1/k)
      if (end === "rip" && r < tEnd - tLast) return Math.pow(kRip * Math.sqrt(DE0) * core.H0s * Math.max(r, 1e-300), -1 / kRip);
      return lookup(tr, tEnd - r, tr.a);
    };
    const HFromEnd = (r: number): number => {
      if (end === "crunch" && r < tEnd - tSw) {
        const a = aFromEnd(r), K = tr.K ?? 0;
        return -core.H0s * Math.sqrt(core.Or / Math.pow(a, 4) + core.Om / Math.pow(a, 3) + K / Math.pow(a, 6));
      }
      if (end === "rip" && r < tEnd - tLast) return 1 / (kRip * Math.max(r, 1e-300));
      return lookup(tr, tEnd - r, tr.H);
    };
    const aAt = (t: number) => (t > tSw && end === "crunch") || (end === "rip" && t > tLast) ? aFromEnd(tEnd - t) : lookup(tr, t, tr.a);
    const HAt = (t: number) => (t > tSw && end === "crunch") || (end === "rip" && t > tLast) ? HFromEnd(tEnd - t) : lookup(tr, t, tr.H);
    const events = [...local, ...extra].filter((e) => e.t <= tEnd).sort((x, y) => x.t - y.t);
    return { key, ...info, end, t0, tEnd, tTurn: tr.turn, aMax: tr.aMax, aAt, HAt, aFromEnd, HFromEnd, events };
  }

  const lcdmTr = integrate(core, () => core.OL, 0, 0, tauMax, 1e9);
  const desiTr = integrate(core, (a) => desi.OL * desi.fDE(a), 0, 0, tauMax, 1e9);
  const psi0 = Math.sqrt(2 * (DE0 - CRUNCH_OL)) / CRUNCH_MU;
  const crunchTr = integrate(core, () => CRUNCH_OL, CRUNCH_MU, psi0, tauMax, 1e9);
  const ripTr = integrate(core, (a) => DE0 * Math.pow(a, -3 * (1 + RIP_W)), 0, 0, tauMax, 1e5);

  const desiFlip = accelFlips(desiTr).find((t) => t > t0);
  const fates: Record<FateKey, Fate> = {
    lcdm: make("lcdm", {
      name: "영원한 가속 팽창 (ΛCDM)", short: "ΛCDM", source: "Planck 2018",
      text: "암흑에너지가 우주상수라면 팽창은 끝없이 빨라집니다. 국부 은하군 밖의 은하들은 하나씩 우주 지평선 너머로 사라지고, 별이 다 타고 나면 차갑고 어두운 ‘열적 죽음’에 가까워집니다.",
    }, lcdmTr, []),
    desi: make("desi", {
      name: "약해지는 암흑에너지 (DESI DR2 w₀wₐ)", short: "DESI", source: "DESI 2025",
      text: "DESI DR2의 w₀wₐ 모형을 미래로 그대로 늘이면 암흑에너지 밀도가 점점 줄어, 언젠가 가속이 멈추고 감속 팽창으로 돌아갑니다. 다만 이 식은 관측 구간(z < 2.3)에 맞춘 근사라서 먼 미래 예측은 불확실합니다.",
    }, desiTr, desiFlip ? [{ t: desiFlip, label: "가속 팽창이 끝남", detail: "암흑에너지가 약해져 감속 변수 q가 다시 양수가 됩니다." }] : []),
    crunch: make("crunch", {
      name: "빅 크런치 (축이온 + 음의 우주상수)", short: "빅 크런치", source: "Luu, Qiu & Tye 2025 (단순화)",
      text: "DESI·DES 자료를 초경량 축이온 장과 음의 우주상수로 설명하면, 팽창이 최대에 이른 뒤 수축으로 돌아서 모든 것이 다시 뜨겁고 빽빽한 한 점으로 모입니다. 여기서는 그 결론(총수명 약 330억 년)에 맞춘 단순 모형으로 계산합니다.",
    }, crunchTr, []),
    rip: make("rip", {
      name: "빅 립 (팬텀 에너지 w = −1.5)", short: "빅 립", source: "Caldwell, Kamionkowski & Weinberg 2003",
      text: "암흑에너지 밀도가 시간이 갈수록 커지는(w < −1) 경우, 팽창 속도가 유한한 시간 안에 무한대가 되어 은하단 → 은하 → 행성계 → 행성 → 원자 순서로 찢어집니다.",
    }, ripTr, []),
  };

  // 크런치: 팽창 최대, 그리고 과거 역사를 거꾸로 되짚는 사건들 (온도 T = T_CMB / a)
  const cr = fates.crunch;
  if (cr.end === "crunch") {
    // 수축 구간에서 온도 T = T_CMB / a 가 되는 순간을 '크런치까지 남은 시간'으로 이분법 탐색 (log r)
    const back = (aT: number) => {
      let lo = Math.log(1e-60), hi = Math.log(cr.tEnd - (cr.tTurn ?? cr.t0));
      for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (cr.aFromEnd(Math.exp(m)) > aT) hi = m; else lo = m; }
      const r = Math.exp(0.5 * (lo + hi));
      return { t: cr.tEnd - r, rem: r };
    };
    const laT = (Tk: number) => core.P.Tcmb / Tk;
    cr.events.push(
      { t: cr.tTurn ?? cr.t0, rem: cr.tEnd - (cr.tTurn ?? cr.t0), label: "팽창 최대", detail: "우주가 오늘의 " + (cr.aMax ?? 1).toFixed(2) + "배까지 커진 뒤 수축으로 돌아섭니다. 이때부터 먼 은하들은 청색편이로 보입니다." },
      { ...back(laT(3000)), label: "다시 빛의 안개", detail: "우주배경복사가 3000 K로 데워져 원자가 다시 이온화됩니다(재결합의 역과정)." },
      { ...back(laT(1.0e9)), label: "원자핵이 부서짐", detail: "kT ≈ 0.1 MeV에서 헬륨 원자핵이 양성자·중성자로 쪼개집니다(빅뱅 핵합성의 역과정)." },
      { ...back(laT(156.5 / core.KMEV)), label: "쿼크–글루온 플라스마", detail: "양성자와 중성자가 녹아 쿼크와 글루온으로 돌아갑니다." },
      { t: cr.tEnd, rem: 0, label: "빅 크런치", detail: "밀도와 온도가 무한대로 발산합니다. 그 너머(반등해 새 우주가 시작되는지)는 양자중력 없이는 알 수 없습니다." },
    );
    cr.events.sort((x, y) => x.t - y.t || (y.rem ?? 0) - (x.rem ?? 0));
  }
  // 빅 립: 묶인 계가 찢기는 순서
  const rp = fates.rip;
  if (rp.end === "rip") {
    const list: [string, number, string][] = [
      ["은하단이 흩어짐", 3.5 * GYR, "은하들을 묶던 중력보다 팬텀 에너지의 밀어내는 힘이 커집니다."],
      ["우리 은하가 찢김", 225e6 * YEAR, "별들이 은하 중심에 묶여 있지 못하고 흩어집니다."],
      ["해왕성이 떨어져 나감", 164.8 * YEAR, "바깥 행성부터 태양의 중력에서 벗어납니다."],
      ["지구가 태양을 떠남", 365.25 * DAY, "지구 공전 궤도가 풀립니다."],
      ["달이 지구를 떠남", 27.32 * DAY, "지구–달 계가 풀립니다."],
      ["지구가 부서짐", 84.5 * 60, "행성을 묶는 중력도 이깁니다."],
      ["원자가 찢김", 1.5e-16, "전자기력으로 묶인 원자까지 분해됩니다."],
    ];
    for (const [label, P, detail] of list) rp.events.push({ t: rp.tEnd - ripLead(P), rem: ripLead(P), label, detail: detail + " (빅 립 " + leadText(ripLead(P)) + " 전)" });
    rp.events.push({ t: rp.tEnd, rem: 0, label: "빅 립", detail: "척도 인자와 팽창 속도가 무한대가 됩니다." });
    rp.events.sort((x, y) => x.t - y.t || (y.rem ?? 0) - (x.rem ?? 0));
  }
  return fates;
}

function leadText(s: number): string {
  if (s < 1e-6) return s.toExponential(0) + " 초";
  if (s < 3600) return (s / 60).toFixed(0) + " 분";
  if (s < 2 * DAY) return (s / 3600).toFixed(1) + " 시간";
  if (s < YEAR) return (s / DAY).toFixed(0) + " 일";
  if (s < 1e6 * YEAR) return (s / YEAR).toFixed(0) + " 년";
  if (s < 1e9 * YEAR) return (s / YEAR / 1e6).toFixed(0) + "백만 년";
  return (s / GYR * 10).toFixed(0) + "억 년";
}
