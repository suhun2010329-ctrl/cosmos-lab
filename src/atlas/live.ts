// 실시간 우주 정보: 배포 때 수집한 스냅샷(data/live.json)을 읽고, 브라우저에서 바로 받을 수 있는 원천(NOAA SWPC, CelesTrak)은
// 몇 분마다 다시 받아 갱신한다. 받은 값은 변인으로 분석해 예측에 쓴다:
//   태양 활동 주기 맞춤(Hathaway 외 1994 함수) → 극대·다음 극소, 소행성 충돌 에너지·충돌구(Collins 외 2005),
//   인공위성 궤도 요소 → 지금 위치, 허블 상수 측정 종합(역분산 가중 평균·긴장), 행성 위치 모형 검증(JPL Horizons).

export interface LiveSource { name: string; url: string; ok: boolean; ms?: number; error?: string }
export interface Approach { name: string; date: string; distAU: number; distMinAU: number; vRel: number; H: number | null; diameter: number | null }
export interface Risk { des: string; name: string; ip: number; ps: number; ts: number; range: string; n: number; diameter: number; H: number; v: number; lastObs: string }
export interface Sat { name: string; id: number; epoch: string; n: number; e: number; i: number; raan: number; argp: number; M: number; bstar: number }
export interface ExoRow { pl_name: string; hostname: string; ra: number; dec: number; sy_dist: number; pl_orbper: number | null; pl_orbsmax: number | null; pl_orbeccen: number | null; pl_rade: number | null; pl_bmassj: number | null; pl_radj: number | null; pl_eqt: number | null; disc_year: number | null; discoverymethod: string | null; st_teff: number | null; st_rad: number | null; st_mass: number | null; st_met: number | null; st_spectype: string | null; sy_vmag: number | null; releasedate: string }
export interface Measurement { param: string; value: number; sigma: number; value2?: number; sigma2?: number; unit: string; epoch?: string; method: string; title: string; journal: string | null; doi?: string | null; arxiv?: string; status: "accepted" | "pending"; reasons?: string[]; detail?: string; date?: string; event?: { date: string; label: string; detail: string } }
export interface Live {
  generated: string;
  solar: { monthly?: [string, number, number, number][]; predicted?: [string, number, number][]; kp?: { time: string; value: number }; kpRecent?: [string, number][]; flares?: { peak: string; cls: string }[] };
  neo: { approaches?: Approach[]; risks?: Risk[] };
  exoplanets: { count?: number; recent?: ExoRow[] };
  satellites: Sat[];
  horizons: { epoch?: string; jd?: number; pos: Record<string, [number, number, number]> };
  papers: { checked: string[]; accepted: Measurement[]; pending: Measurement[] };
  sources: LiveSource[];
}
export interface Literature { checked: string; measurements: Measurement[] }

const EMPTY: Live = { generated: "", solar: {}, neo: {}, exoplanets: {}, satellites: [], horizons: { pos: {} }, papers: { checked: [], accepted: [], pending: [] }, sources: [] };

export async function loadLive(root: string): Promise<{ live: Live; lit: Literature }> {
  const [live, lit] = await Promise.all([
    fetch(root + "data/live.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : EMPTY)).catch(() => EMPTY),
    fetch(root + "data/literature.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ checked: "", measurements: [] })),
  ]);
  return { live: { ...EMPTY, ...live }, lit };
}

/** 브라우저에서 바로 받을 수 있는 원천을 다시 받음 (실패하면 스냅샷 유지). 갱신된 원천 이름을 돌려줌 */
export async function refreshDirect(L: Live): Promise<string[]> {
  const done: string[] = [];
  const j = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  await Promise.all([
    j("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json").then((kp: (string[] | Record<string, string | number>)[]) => {
      // 예전 형식(배열의 배열, 첫 줄 머리글)과 새 형식(객체 배열) 모두
      const rows = kp.map((r) => (Array.isArray(r) ? [r[0], +r[1]] : [String(r.time_tag), +(r.Kp ?? r.kp ?? r.kp_index ?? r.estimated_kp)]) as [string, number]).filter((r) => isFinite(r[1]));
      if (rows.length) { const last = rows[rows.length - 1]; L.solar.kp = { time: last[0], value: last[1] }; L.solar.kpRecent = rows.slice(-24); done.push("Kp 지수"); }
    }).catch(() => {}),
    j("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json").then((f: { max_time?: string; time_tag?: string; max_class?: string; current_class?: string }[]) => {
      L.solar.flares = f.slice(-12).map((x) => ({ peak: x.max_time ?? x.time_tag ?? "", cls: x.max_class ?? x.current_class ?? "" })).filter((x) => x.cls); done.push("X선 플레어");
    }).catch(() => {}),
    ...L.satellites.map((s) => j("https://celestrak.org/NORAD/elements/gp.php?CATNR=" + s.id + "&FORMAT=json").then((r: Record<string, string | number>[]) => {
      const g = r[0]; if (!g) return;
      Object.assign(s, { epoch: String(g.EPOCH), n: +g.MEAN_MOTION, e: +g.ECCENTRICITY, i: +g.INCLINATION, raan: +g.RA_OF_ASC_NODE, argp: +g.ARG_OF_PERICENTER, M: +g.MEAN_ANOMALY, bstar: +g.BSTAR });
      done.push(s.name);
    }).catch(() => {})),
  ]);
  return done;
}

// ---------- 태양 활동 주기 ----------
/** Hathaway, Wilson & Reichmann (1994): R(t) = a t³ / (exp(t²/b²) − c), t = 주기 시작부터 개월, b = 27.12 + 25.15/(10³a)^¼, c = 0.71 */
export function hathaway(a: number, t: number): number {
  if (t <= 0) return 0;
  const b = 27.12 + 25.15 / Math.pow(a * 1e3, 0.25);
  return a * t ** 3 / (Math.exp((t / b) ** 2) - 0.71);
}
const monthIndex = (tag: string) => { const [y, m] = tag.split("-").map(Number); return y * 12 + (m - 1); };
const monthTag = (k: number) => Math.floor(k / 12) + "년 " + ((Math.round(k) % 12) + 1) + "월";
export interface CycleFit { a: number; start: number; maxAt: number; maxR: number; minAt: number; rms: number; nObs: number; label: (k: number) => string; at: (k: number) => number }
/** 주기 25 (2019년 12월 무렵 시작)의 월별 흑점수에 맞춤: 시작 시점 t₀와 크기 a를 격자로 훑어 제곱 오차 최소 */
export function fitSolarCycle(monthly: [string, number, number, number][], startGuess = "2019-12"): CycleFit | null {
  const s0 = monthIndex(startGuess);
  const pts = monthly.map(([tag, ssn]) => [monthIndex(tag), ssn] as [number, number]).filter(([k, r]) => k >= s0 - 6 && r >= 0);
  if (pts.length < 24) return null;
  let best = { a: 0, t0: 0, e: Infinity };
  for (let t0 = s0 - 18; t0 <= s0 + 18; t0 += 0.5) for (let la = -3.6; la <= -2.1; la += 0.01) {
    const a = Math.pow(10, la);
    let e = 0;
    for (const [k, r] of pts) { const d = hathaway(a, k - t0) - r; e += d * d; }
    if (e < best.e) best = { a, t0, e };
  }
  let maxAt = best.t0, maxR = 0;
  for (let t = 0; t < 200; t += 0.25) { const r = hathaway(best.a, t); if (r > maxR) { maxR = r; maxAt = best.t0 + t; } }
  // 다음 극소: 극대 뒤 흑점수가 극대의 6% 아래로 내려가는 때 (다음 주기와 겹치기 시작하는 무렵)
  let minAt = maxAt;
  for (let t = maxAt - best.t0; t < 240; t += 0.25) if (hathaway(best.a, t) < 0.06 * maxR) { minAt = best.t0 + t; break; }
  return { a: best.a, start: best.t0, maxAt, maxR, minAt, rms: Math.sqrt(best.e / pts.length), nObs: pts.length, label: monthTag, at: (k) => hathaway(best.a, k - best.t0) };
}
export function kpStorm(kp: number): string { return kp >= 9 ? "G5 극심한 지자기 폭풍" : kp >= 8 ? "G4 심한 지자기 폭풍" : kp >= 7 ? "G3 강한 지자기 폭풍" : kp >= 6 ? "G2 보통 지자기 폭풍" : kp >= 5 ? "G1 약한 지자기 폭풍" : kp >= 4 ? "조금 활발" : "조용함"; }

// ---------- 소행성 ----------
/** 절대등급 H, 반사율 p → 지름 [m] (D = 1329 km / √p × 10^(−H/5)) */
export function diameterFromH(H: number, albedo = 0.14): number { return 1329e3 / Math.sqrt(albedo) * Math.pow(10, -H / 5); }
/**
 * 충돌 에너지와 충돌구: 밀도 2600 kg/m³ 돌, 45° 충돌, 지구 암반(2500 kg/m³) 기준.
 * 일시 충돌구 지름 D_tc = 1.161 (ρi/ρt)^⅓ L^0.78 v^0.44 g^−0.22 sin^⅓θ, 최종 단순 충돌구 ≈ 1.25 D_tc (Collins, Melosh & Marcus 2005).
 * 지름 약 50 m보다 작은 돌은 대부분 대기에서 터짐.
 */
export function impactEffects(Dm: number, vKms: number): { E_Mt: number; craterKm: number | null; airburst: boolean } {
  const rho = 2600, m = rho * Math.PI / 6 * Dm ** 3, v = vKms * 1000, E = 0.5 * m * v * v;
  const airburst = Dm < 50;
  const Dtc = 1.161 * Math.cbrt(rho / 2500) * Math.pow(Dm, 0.78) * Math.pow(v, 0.44) * Math.pow(9.81, -0.22) * Math.cbrt(Math.sin(Math.PI / 4));
  return { E_Mt: E / 4.184e15, craterKm: airburst ? null : 1.25 * Dtc / 1000, airburst };
}

// ---------- 인공위성 ----------
const MU_E = 398600.4418, RE = 6378.137, J2 = 1.08263e-3;
/** 궤도 요소 → 평균 고도 [km], 주기 [분], 지금 궤도 위 위상 [rad] (근지점 인수 + 평균 근점 이각, J2 섭동으로 근지점·승교점 이동 포함) */
export function satNow(s: Sat, date: Date): { alt: number; periodMin: number; phase: number; raan: number; ageDays: number } {
  const n = s.n * 2 * Math.PI / 86400, a = Math.cbrt(MU_E / (n * n)), ageDays = (date.getTime() - Date.parse(s.epoch.endsWith("Z") ? s.epoch : s.epoch + "Z")) / 864e5;
  const i = s.i * Math.PI / 180, p = a * (1 - s.e * s.e), k = 1.5 * J2 * (RE / p) ** 2 * n;
  const dRaan = -k * Math.cos(i), dArgp = k * (2 - 2.5 * Math.sin(i) ** 2), dt = ageDays * 86400;
  const M = s.M * Math.PI / 180 + n * dt, argp = s.argp * Math.PI / 180 + dArgp * dt;
  return { alt: a - RE, periodMin: 1440 / s.n, phase: (argp + M) % (2 * Math.PI), raan: (s.raan * Math.PI / 180 + dRaan * dt) % (2 * Math.PI), ageDays };
}

// ---------- 논문 측정 종합 ----------
export interface H0Summary { early: { mean: number; sigma: number; n: number }; late: { mean: number; sigma: number; n: number }; tension: number; list: Measurement[] }
/** 역분산 가중 평균 (학술지 게재가 확인된 값만) */
export function weighted(ms: Measurement[]): { mean: number; sigma: number; n: number } {
  const w = ms.reduce((s, m) => s + 1 / m.sigma ** 2, 0);
  return { mean: ms.reduce((s, m) => s + m.value / m.sigma ** 2, 0) / (w || 1), sigma: 1 / Math.sqrt(w || 1), n: ms.length };
}
export function summarizeH0(curated: Measurement[], auto: Measurement[]): H0Summary {
  const all = [...curated, ...auto].filter((m) => m.param === "H0");
  const acc = all.filter((m) => m.status === "accepted");
  // 자동으로 받아들인 값은 방법을 모르므로 ‘후기 우주’(거리 사다리·렌즈) 쪽으로 넣지 않고 따로 보여 줌
  const early = weighted(acc.filter((m) => m.epoch === "early")), late = weighted(acc.filter((m) => m.epoch === "late"));
  return { early, late, tension: (late.mean - early.mean) / Math.hypot(late.sigma, early.sigma), list: all };
}
/** ΛCDM에서 Ωm을 고정하면 우주 나이는 1/H₀에 비례 */
export function ageForH0(H0: number, age0 = 13.797, H00 = 67.4): number { return age0 * H00 / H0; }
