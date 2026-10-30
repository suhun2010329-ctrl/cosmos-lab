// 시공간 시소: 특수 상대성 이론에서 모든 물체는 4차원 시공간을 늘 빛의 속도 c로 움직인다는 그림.
// 공간으로 빨리 갈수록 시간 방향 몫(dτ/dt = 1/γ)이 줄어든다. 쌍둥이 여행과 운동 에너지 (γ − 1)mc²도 함께 보여 준다.
import { hexRgb, rgba } from "../shared/color";
import type { RGB } from "../shared/math";

const C = 299792458;
const YEAR_S = 3.15576e7;

export interface Preset { label: string; v: number; note: string }

/** 실제 속도 예 (m/s) */
export const SPEED_PRESETS: Preset[] = [
  { label: "걷기", v: 1.4, note: "사람이 걷는 속도 1.4 m/s" },
  { label: "국제우주정거장", v: 7660, note: "ISS 궤도 속도 7.66 km/s: 6개월 머물면 약 0.005초 덜 늙습니다" },
  { label: "파커 태양 탐사선", v: 192e3, note: "사람이 만든 가장 빠른 물체 (2024년 근일점 약 192 km/s)" },
  { label: "0.5c", v: 0.5 * C, note: "빛의 절반" },
  { label: "0.9c", v: 0.9 * C, note: "빛의 90%" },
  { label: "0.99c", v: 0.99 * C, note: "빛의 99%" },
  // 6.8 TeV / 0.938 GeV → γ ≈ 7,250, 1 − β ≈ 1/(2γ²)
  { label: "LHC 양성자", v: C * (1 - 1 / (2 * 7250 * 7250)), note: "LHC의 6.8 TeV 양성자: γ ≈ 7,250" },
];

export function lorentz(beta: number): number {
  return 1 / Math.sqrt((1 - beta) * (1 + beta));
}

export class SpacetimeSeesaw {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private W = 0;
  private H = 0;
  /** v/c (1에 아주 가까운 값은 1 − β로 따로 들고 있어 정밀도 유지) */
  beta = 0.8;
  oneMinusBeta = 0.2;
  private col: Record<string, RGB> = {};

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(cv);
    this.resize();
  }

  readTokens(): void {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["ink", "muted", "line", "accent", "wneg", "wpos"]) this.col[k] = hexRgb(cs.getPropertyValue("--" + k));
    this.draw();
  }

  setSpeed(v: number): void {
    this.beta = Math.min(v / C, 1 - 1e-15);
    this.oneMinusBeta = Math.max((C - v) / C, 1e-15);
    this.draw();
  }

  get gamma(): number {
    return 1 / Math.sqrt(this.oneMinusBeta * (1 + this.beta));
  }

  private resize(): void {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height;
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    this.draw();
  }

  draw(): void {
    const c = this.ctx, W = this.W, H = this.H;
    if (!W || !this.col.ink) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const wide = W > 640, pw = wide ? W / 2 : W, ph = wide ? H : H / 2;
    this.drawCircle(0, 0, pw, ph);
    this.drawTwins(wide ? pw : 0, wide ? 0 : ph, pw, ph);
  }

  /** 속도 원 (엡스타인 그림): 길이 c인 화살표가 시간 축과 공간 축 사이에서 기울어짐 */
  private drawCircle(x0: number, y0: number, w: number, h: number): void {
    const c = this.ctx, k = this.col, b = this.beta, tau = Math.sqrt(this.oneMinusBeta * (1 + b));
    const R = Math.min(w - 70, h - 70), ox = x0 + 40, oy = y0 + h - 34;
    c.strokeStyle = rgba(k.line, 1); c.lineWidth = 1;
    c.beginPath(); c.arc(ox, oy, R, -Math.PI / 2, 0); c.stroke();
    c.strokeStyle = rgba(k.muted, 1); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + R + 14, oy); c.moveTo(ox, oy); c.lineTo(ox, oy - R - 14); c.stroke();
    c.font = "12px 'IBM Plex Sans KR', system-ui, sans-serif"; c.fillStyle = rgba(k.muted, 1);
    c.textAlign = "right"; c.fillText("공간 속도 v →", ox + R + 14, oy + 18);
    c.textAlign = "left"; c.fillText("↑ 시간이 흐르는 빠르기 c·dτ/dt", ox + 6, oy - R - 18);
    const ex = ox + R * b, ey = oy - R * tau;
    // 성분
    c.setLineDash([4, 4]); c.strokeStyle = rgba(k.muted, 0.8);
    c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex, oy); c.moveTo(ex, ey); c.lineTo(ox, ey); c.stroke(); c.setLineDash([]);
    c.lineWidth = 6; c.lineCap = "round";
    c.strokeStyle = rgba(k.wneg, 0.9); c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + R * b, oy); c.stroke();
    c.strokeStyle = rgba(k.wpos, 0.9); c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox, ey); c.stroke();
    c.lineWidth = 3; c.strokeStyle = rgba(k.accent, 1);
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ex, ey); c.stroke();
    const ang = Math.atan2(ey - oy, ex - ox);
    c.fillStyle = rgba(k.accent, 1); c.beginPath(); c.moveTo(ex, ey);
    c.lineTo(ex - 12 * Math.cos(ang - 0.35), ey - 12 * Math.sin(ang - 0.35)); c.lineTo(ex - 12 * Math.cos(ang + 0.35), ey - 12 * Math.sin(ang + 0.35)); c.fill();
    c.font = "600 13px 'IBM Plex Sans KR', system-ui, sans-serif"; c.fillStyle = rgba(k.ink, 1); c.textAlign = "left";
    c.fillText("길이는 언제나 c", ox + (ex - ox) * 0.45 + 10, oy + (ey - oy) * 0.45 - 6);
    c.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
    c.fillStyle = rgba(k.wneg, 1); c.fillText("v/c = " + fmtBeta(b, this.oneMinusBeta), ox + 4, oy + 18 + 14 * 0);
    c.fillStyle = rgba(k.wpos, 1); c.fillText("dτ/dt = " + fmtSmall(tau), ox - 30, ey - 8 < y0 + 30 ? y0 + 30 : ey - 8);
  }

  /** 쌍둥이 여행: 4광년 떨어진 별까지 갔다 오기. 민코프스키 그림 (가로 공간, 세로 지구 시간) */
  private drawTwins(x0: number, y0: number, w: number, h: number): void {
    const c = this.ctx, k = this.col, b = Math.max(this.beta, 1e-9), g = this.gamma;
    const D = 4, tEarth = 2 * D / b, tTrav = tEarth / g;
    const plotH = h - 64, plotW = w - 70, ox = x0 + 48, oy = y0 + h - 30;
    const tShow = Math.max(tEarth, 10), sy = plotH / tShow, sx = Math.min(plotW / D, sy * 1.0) * 0.92;
    c.strokeStyle = rgba(k.line, 1); c.lineWidth = 1;
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + D * sx + 20, oy); c.moveTo(ox, oy); c.lineTo(ox, oy - plotH - 6); c.stroke();
    // 빛의 길 (45°)
    c.setLineDash([3, 4]); c.strokeStyle = rgba(k.muted, 0.6);
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.min(D, tShow) * sx, oy - Math.min(D, tShow) * sy); c.stroke(); c.setLineDash([]);
    c.font = "12px 'IBM Plex Sans KR', system-ui, sans-serif"; c.fillStyle = rgba(k.muted, 1);
    c.textAlign = "center"; c.fillText("거리 (광년)", ox + D * sx / 2, oy + 22);
    c.fillText("4광년 별", ox + D * sx, oy + 12);
    c.save(); c.translate(ox - 34, oy - plotH / 2); c.rotate(-Math.PI / 2); c.fillText("지구 시간 (년)", 0, 0); c.restore();
    // 지구 쌍둥이
    c.strokeStyle = rgba(k.wneg, 1); c.lineWidth = 3;
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox, oy - tEarth * sy); c.stroke();
    // 여행자
    c.strokeStyle = rgba(k.wpos, 1);
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + D * sx, oy - tEarth / 2 * sy); c.lineTo(ox, oy - tEarth * sy); c.stroke();
    // 1년마다 눈금: 지구는 지구 시간 1년, 여행자는 고유 시간 1년 (= 지구 시간 γ년)
    const tickEvery = tEarth > 60 ? Math.ceil(tEarth / 40) : 1;
    c.fillStyle = rgba(k.wneg, 1);
    for (let y = tickEvery; y < tEarth; y += tickEvery) { c.beginPath(); c.arc(ox, oy - y * sy, 2.6, 0, 6.2832); c.fill(); }
    c.fillStyle = rgba(k.wpos, 1);
    const travEvery = tTrav > 60 ? Math.ceil(tTrav / 40) : 1;
    for (let p = travEvery; p < tTrav; p += travEvery) {
      const te = p * g, xx = te < tEarth / 2 ? b * te : 2 * D - b * te;
      c.beginPath(); c.arc(ox + xx * sx, oy - te * sy, 3.2, 0, 6.2832); c.fill();
    }
    c.font = "500 12px 'JetBrains Mono', ui-monospace, monospace"; c.textAlign = "left";
    c.fillStyle = rgba(k.wneg, 1); c.fillText("지구: " + fmtYears(tEarth), ox + 8, oy - tEarth * sy - 8 < y0 + 14 ? y0 + 14 : oy - tEarth * sy - 8);
    c.fillStyle = rgba(k.wpos, 1); c.fillText("여행자: " + fmtYears(tTrav), ox + D * sx * 0.55, oy - tEarth / 2 * sy + 4);
  }

  /** 계기판에 쓸 값 */
  readouts(): [string, string][] {
    const b = this.beta, g = this.gamma, tau = 1 / g, v = b * C;
    const ek = (g - 1) * 1 * C * C, earthYearPerTrav = g;
    return [
      ["속도", (v < 1e4 ? v.toPrecision(3) + " m/s" : v < 1e7 ? (v / 1000).toPrecision(4) + " km/s" : Math.round(v / 1000).toLocaleString("ko-KR") + " km/s") + "<small>v/c = " + fmtBeta(b, this.oneMinusBeta) + "</small>"],
      ["로런츠 인자 γ", g < 1.0001 ? "1 + " + (g - 1).toExponential(2) : g.toPrecision(5)],
      ["시간이 흐르는 빠르기 dτ/dt", fmtSmall(tau) + "<small>여행자의 1초 = 바깥의 " + (g < 1.0001 ? "1 + " + (g - 1).toExponential(2) : g.toPrecision(4)) + "초</small>"],
      ["여행자 1년 동안 지구에서", fmtYears(earthYearPerTrav) + "<small>" + (g < 1.0001 ? "차이 " + ((g - 1) * YEAR_S).toPrecision(2) + "초" : "") + "</small>"],
      ["1 kg를 이 속도로 (운동 에너지)", ek.toExponential(2) + " J<small>" + energyCompare(ek) + "</small>"],
    ];
  }
}

function fmtBeta(b: number, omb: number): string {
  if (b < 1e-3) return b.toExponential(2);
  if (omb < 1e-4) return "1 − " + omb.toExponential(1);
  return b.toFixed(b > 0.99 ? 4 : 3);
}
function fmtSmall(x: number): string {
  return x > 0.9999 ? "1 − " + (1 - x).toExponential(2) : x < 1e-3 ? x.toExponential(2) : x.toFixed(4);
}
function fmtYears(y: number): string {
  if (y < 1e4) return y.toPrecision(4).replace(/\.?0+$/, "") + "년";
  return y.toExponential(2) + "년";
}
function energyCompare(J: number): string {
  const refs: [string, number][] = [["TNT 1톤", 4.184e9], ["히로시마 원자폭탄", 6.3e13], ["차르 봄바", 2.1e17], ["세계 1년 에너지 소비", 6.2e20]];
  let best = refs[0];
  for (const r of refs) if (J >= r[1]) best = r;
  return J < refs[0][1] ? "TNT 1톤의 " + (J / refs[0][1]).toExponential(1) + "배" : best[0] + "의 약 " + (J / best[1]).toPrecision(2) + "배 · v → c면 무한대";
}
