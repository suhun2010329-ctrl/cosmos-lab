// 통합 시간축: 빅뱅(과거)부터 고른 시나리오의 끝(미래)까지. 지도의 모든 층이 이 시간을 함께 쓴다.
// 과거: Planck 2018 ΛCDM 시간표. 미래: scenarios.ts의 적분 결과, 그 뒤는 해석적으로 이어 붙임
// (ΛCDM: a ∝ exp(H_Λ t), DESI: 암흑에너지가 사라져 물질 지배 a ∝ t^(2/3)).
import { createCosmology, type Cosmology } from "../shared/cosmology";
import { buildBBN, buildIon, buildSFR } from "../shared/physics";
import { buildEras, eraIndex, type Era } from "../shared/eras";
import { buildFates, type Fate, type FateKey } from "../shared/scenarios";
import { laZ } from "../shared/math";

export const YEAR_S = 3.15576e7;
/** 날짜 → 소수점 서기 연도 */
export function decimalYear(d: Date): number {
  const y = d.getUTCFullYear(), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - a) / (b - a);
}
/** 지금의 서기 연도 (페이지를 연 순간) */
export const NOW_YEAR = decimalYear(new Date());

export class Timeline {
  readonly core: Cosmology;
  readonly eras: Era[];
  readonly fates: Record<FateKey, Fate>;
  readonly t0: number;
  fate: FateKey = "lcdm";
  private hL: number;

  constructor() {
    this.core = createCosmology();
    const ION = buildIon(this.core), BBN = buildBBN(this.core), SFR = buildSFR(this.core);
    this.eras = buildEras(this.core, ION, BBN, SFR).list;
    this.fates = buildFates(this.core, createCosmology({ model: "desi" }));
    this.t0 = this.core.tOf(0);
    this.hL = this.core.H0s * Math.sqrt(this.core.OL);
  }

  get current(): Fate { return this.fates[this.fate]; }

  /** 가장 이른 시점 (빅뱅 직후) [년, 지금 기준 음수] */
  get dtMin(): number { return -(this.t0 / YEAR_S) * (1 - 1e-12); }
  /** 가장 늦은 시점 [년] */
  get dtMax(): number {
    const f = this.current;
    return f.end === "crunch" || f.end === "rip" ? (f.tEnd - this.t0) / YEAR_S : 1e100;
  }

  /** log10 a (오늘 = 0). 아주 먼 미래에는 a 자체가 배정밀도를 넘으므로 로그로 다룸 */
  la(dtYears: number): number {
    const c = this.core, t = this.t0 + dtYears * YEAR_S;
    if (dtYears <= 0) return t <= 0 ? c.LA_MIN : c.laOfT(t);
    const f = this.current, tEndTrack = f.end === "forever" || f.end === "decelerate" ? f.tEnd : Infinity;
    if (t <= tEndTrack) {
      if (f.end === "crunch" || f.end === "rip") return Math.log10(f.aFromEnd(Math.max(f.tEnd - t, 0)));
      return Math.log10(f.aAt(t));
    }
    const laEnd = Math.log10(f.aAt(tEndTrack));
    if (f.end === "forever") return laEnd + this.hL * (t - tEndTrack) / Math.LN10;
    return laEnd + (2 / 3) * Math.log10(t / tEndTrack);
  }

  /** 부호 있는 허블 매개변수 [1/s] */
  H(dtYears: number): number {
    const c = this.core, t = this.t0 + dtYears * YEAR_S;
    if (dtYears <= 0) return c.Hs(Math.pow(10, this.la(dtYears)));
    const f = this.current;
    if (f.end === "crunch" || f.end === "rip") return f.HFromEnd(Math.max(f.tEnd - t, 0));
    if (t <= f.tEnd) return f.HAt(t);
    return f.end === "forever" ? this.hL : 2 / (3 * t);
  }

  /** 우주배경복사 온도 [K] */
  Tcmb(dtYears: number): number { return this.core.P.Tcmb * Math.pow(10, -this.la(dtYears)); }

  /** 그 시점의 시대 이름과 설명 (과거는 우주 역사, 미래는 시나리오 사건) */
  era(dtYears: number): { name: string; text: string } {
    if (dtYears <= 0) {
      const la = this.la(dtYears), e = this.eras[eraIndex(this.eras, la)];
      return { name: e.name, text: e.text };
    }
    const f = this.current, t = this.t0 + dtYears * YEAR_S;
    const rem = f.tEnd - t;
    const passed = f.events.filter((e) => ((f.end === "crunch" || f.end === "rip") && e.rem !== undefined ? rem <= e.rem : t >= e.t));
    const last = passed[passed.length - 1];
    return last ? { name: last.label, text: last.detail } : { name: f.short + " 시나리오의 미래", text: f.text };
  }

  /** 은하가 아직 거의 없던 시기에는 은하 층을 흐리게 (z > 10이면 0) */
  galaxyVisibility(dtYears: number): number {
    const la = this.la(dtYears);
    if (dtYears > 0) return 1;
    if (la <= laZ(12)) return 0;
    if (la >= laZ(4)) return 1;
    return (la - laZ(12)) / (laZ(4) - laZ(12));
  }
}

/** 시간 표기: "지금부터 1.2억 년 뒤", "6,600만 년 전", 가까우면 서기 연도 */
export function fmtDt(dt: number): string {
  const a = Math.abs(dt), dir = dt >= 0 ? " 뒤" : " 전";
  if (a < 0.5 / 365.25) return "지금 (" + Math.floor(NOW_YEAR) + "년)";
  if (a < 3) {
    const y = NOW_YEAR + dt, yi = Math.floor(y), d = new Date(Date.UTC(yi, 0, 1) + (y - yi) * (Date.UTC(yi + 1, 0, 1) - Date.UTC(yi, 0, 1)));
    return yi + "년 " + (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일 (" + (a < 1 ? Math.round(a * 365.25) + "일" : a.toFixed(1) + "년") + dir + ")";
  }
  if (a < 10000) {
    const y = NOW_YEAR + dt;
    return (y >= 1 ? "서기 " + Math.floor(y).toLocaleString("ko-KR") + "년" : "기원전 " + Math.ceil(1 - y).toLocaleString("ko-KR") + "년") + " (" + Math.round(a).toLocaleString("ko-KR") + "년" + dir + ")";
  }
  return fmtYearsShort(a) + dir;
}

/** 유효숫자 3자리 (반올림으로 10000이 되면 지수 대신 정수로) */
function p3(q: number): string {
  const s = q.toPrecision(3);
  return s.includes("e") ? Math.round(q).toLocaleString("ko-KR") : s.replace(/\.0+$/, "");
}
export function fmtYearsShort(a: number): string {
  if (a < 1e4) return Math.round(a).toLocaleString("ko-KR") + "년";
  if (a < 1e8) return p3(a / 1e4) + "만 년";
  if (a < 1e12) return p3(a / 1e8) + "억 년";
  if (a < 1e16) return p3(a / 1e12) + "조 년";
  const e = Math.floor(Math.log10(a));
  return (a / Math.pow(10, e)).toFixed(1) + " × 10" + String(e).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c] ?? c).join("") + "년";
}

/** 시간 막대 위치 u ∈ [−1, 1] ↔ Δt [년]. 미래는 0~0.85가 1년~10¹¹년, 그 뒤가 시나리오 끝까지 (로그 눈금) */
export function sliderToDt(u: number, dtMin: number, dtMax: number): number {
  if (Math.abs(u) < 1e-6) return 0;
  if (u < 0) return -(Math.pow(10, -u * Math.log10(1 - dtMin)) - 1);
  const Lmax = Math.log10(1 + dtMax);
  const L = Lmax > 11.5 ? (u <= 0.85 ? u / 0.85 * 11 : 11 + (u - 0.85) / 0.15 * (Lmax - 11)) : u * Lmax;
  return Math.min(Math.pow(10, L) - 1, dtMax);
}
export function dtToSlider(dt: number, dtMin: number, dtMax: number): number {
  if (dt === 0) return 0;
  if (dt < 0) return -Math.log10(1 - dt) / Math.log10(1 - dtMin);
  const Lmax = Math.log10(1 + dtMax), L = Math.log10(1 + dt);
  if (Lmax > 11.5) return L <= 11 ? L / 11 * 0.85 : 0.85 + (L - 11) / (Lmax - 11) * 0.15;
  return L / Lmax;
}
