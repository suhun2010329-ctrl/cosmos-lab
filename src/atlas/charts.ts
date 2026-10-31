// 예측 그래프 네 개: 지구 궤도 이심률(밀란코비치), 태양의 진화, 우리 은하–안드로메다 거리, 태양 근접 통과 별.
import type { Secular } from "./secular";
import type { LGForecast } from "./localgroup";
import type { Encounter } from "./stellar";
import { sunAt } from "./sun";

interface Frame { c: CanvasRenderingContext2D; w: number; h: number; ink: string; muted: string; line: string; accent: string }
const PAD = { l: 44, r: 10, t: 22, b: 26 };

function frame(cv: HTMLCanvasElement, title: string): Frame | null {
  const r = cv.getBoundingClientRect(), pr = Math.min(window.devicePixelRatio || 1, 2);
  if (!r.width) return null;
  if (cv.width !== Math.round(r.width * pr) || cv.height !== Math.round(r.height * pr)) { cv.width = Math.round(r.width * pr); cv.height = Math.round(r.height * pr); }
  const c = cv.getContext("2d")!, cs = getComputedStyle(document.documentElement);
  c.setTransform(pr, 0, 0, pr, 0, 0); c.clearRect(0, 0, r.width, r.height);
  const f = { c, w: r.width, h: r.height, ink: cs.getPropertyValue("--ink").trim(), muted: cs.getPropertyValue("--muted").trim(), line: cs.getPropertyValue("--line").trim(), accent: cs.getPropertyValue("--accent").trim() };
  c.font = "600 12px 'Noto Sans KR', system-ui, sans-serif"; c.fillStyle = f.ink; c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.fillText(title, 2, 14);
  c.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  return f;
}
function axes(f: Frame, xs: [number, string][], ys: [number, string][], X: (v: number) => number, Y: (v: number) => number): void {
  const c = f.c;
  c.strokeStyle = f.line; c.fillStyle = f.muted; c.lineWidth = 1;
  for (const [v, s] of xs) { const x = X(v); c.beginPath(); c.moveTo(x + 0.5, PAD.t); c.lineTo(x + 0.5, f.h - PAD.b); c.stroke(); c.textAlign = "center"; c.fillText(s, x, f.h - PAD.b + 14); }
  for (const [v, s] of ys) { const y = Y(v); c.beginPath(); c.moveTo(PAD.l, y + 0.5); c.lineTo(f.w - PAD.r, y + 0.5); c.stroke(); c.textAlign = "right"; c.fillText(s, PAD.l - 5, y + 4); }
}
function marker(f: Frame, x: number): void {
  if (x < PAD.l || x > f.w - PAD.r) return;
  f.c.strokeStyle = f.accent; f.c.lineWidth = 2; f.c.beginPath(); f.c.moveTo(x, PAD.t); f.c.lineTo(x, f.h - PAD.b); f.c.stroke();
}

/** 지구 궤도 이심률: 라플라스–라그랑주 이론, ±100만 년 */
export function drawEccentricity(cv: HTMLCanvasElement, sec: Secular, dt: number): void {
  const f = frame(cv, "지구 궤도 이심률 (영년 섭동 · 밀란코비치 주기)");
  if (!f) return;
  const X = (t: number) => PAD.l + (t + 1e6) / 2e6 * (f.w - PAD.l - PAD.r), Y = (e: number) => PAD.t + (1 - e / 0.065) * (f.h - PAD.t - PAD.b);
  axes(f, [[-1e6, "−100만 년"], [-5e5, "−50만"], [0, "지금"], [5e5, "+50만"], [1e6, "+100만 년"]], [[0, "0"], [0.02, "0.02"], [0.04, "0.04"], [0.06, "0.06"]], X, Y);
  const c = f.c;
  c.strokeStyle = "#2a78d6"; c.lineWidth = 1.6; c.beginPath();
  for (let k = 0; k <= 800; k++) { const t = -1e6 + k * 2500, x = X(t), y = Y(sec.at(t).e[2]); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
  c.stroke();
  marker(f, X(dt));
  if (Math.abs(dt) <= 1e6) { c.fillStyle = f.ink; c.textAlign = "left"; c.fillText("e = " + sec.at(dt).e[2].toFixed(4), Math.min(X(dt) + 5, f.w - 90), PAD.t + 12); }
}

/** 태양의 광도·반지름: 지금부터 80억 년 (세로는 로그) */
export function drawSun(cv: HTMLCanvasElement, dt: number): void {
  const f = frame(cv, "태양의 진화 (광도 · 반지름, 지금 = 1)");
  if (!f) return;
  const X = (g: number) => PAD.l + g / 8 * (f.w - PAD.l - PAD.r), Y = (v: number) => PAD.t + (1 - (Math.log10(v) + 2.5) / 6) * (f.h - PAD.t - PAD.b);
  axes(f, [[0, "지금"], [2, "20억"], [4, "40억"], [6, "60억"], [8, "80억 년"]], [[0.01, "0.01"], [1, "1"], [100, "100"], [3000, "3000"]], X, Y);
  const c = f.c;
  for (const [key, col] of [["L", "#eda100"], ["R", "#eb6834"]] as const) {
    c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath();
    for (let k = 0; k <= 1600; k++) {
      const g = k / 200, s = sunAt(g), v = Math.max(key === "L" ? s.L : s.R, 0.004), x = X(g), y = Y(v);
      if (k) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke();
  }
  c.textAlign = "left"; c.fillStyle = "#eda100"; c.fillText("광도", PAD.l + 4, PAD.t + 12); c.fillStyle = "#eb6834"; c.fillText("반지름", PAD.l + 44, PAD.t + 12);
  marker(f, X(dt / 1e9));
}

/** 우리 은하–안드로메다 거리 (최선 추정 궤도) + 몬테카를로 병합 시각 분포 */
export function drawLocalGroup(cv: HTMLCanvasElement, lg: LGForecast, dt: number): void {
  const f = frame(cv, "우리 은하–안드로메다 거리 (kpc)와 병합 시각 분포");
  if (!f) return;
  const X = (g: number) => PAD.l + g / 14 * (f.w - PAD.l - PAD.r), Y = (kpc: number) => PAD.t + (1 - kpc / 800) * (f.h - PAD.t - PAD.b);
  axes(f, [[0, "지금"], [5, "50억"], [10, "100억"], [14, "140억 년"]], [[0, "0"], [200, "200"], [400, "400"], [600, "600"], [800, "800"]], X, Y);
  const c = f.c, bins = new Array(28).fill(0);
  for (const t of lg.mergeTimes) if (isFinite(t) && t < 14) bins[Math.floor(t / 0.5)]++;
  const maxB = Math.max(...bins, 1);
  c.fillStyle = "rgba(235,104,52,0.35)";
  bins.forEach((b, k) => { if (!b) return; const x0 = X(k * 0.5), x1 = X((k + 1) * 0.5), hgt = b / maxB * (f.h - PAD.t - PAD.b) * 0.6; c.fillRect(x0 + 1, f.h - PAD.b - hgt, x1 - x0 - 2, hgt); });
  c.strokeStyle = "#2a78d6"; c.lineWidth = 1.8; c.beginPath();
  const tr = lg.best;
  for (let k = 0; k < tr.t.length; k++) { const x = X(tr.t[k]), y = Y(tr.sep[k]); if (k) c.lineTo(x, y); else c.moveTo(x, y); }
  c.stroke();
  c.fillStyle = f.ink; c.textAlign = "right";
  c.fillText("병합 확률 50억 년 안 " + Math.round(lg.pMerge5 * 100) + "% · 100억 년 안 " + Math.round(lg.pMerge10 * 100) + "%", f.w - PAD.r, PAD.t + 12);
  marker(f, X(dt / 1e9));
}

/** 태양 근접 통과 별: 가로 시각, 세로 최근접 거리 */
export function drawEncounters(cv: HTMLCanvasElement, enc: Encounter[], name: (i: number) => string, dt: number): Encounter[] {
  const f = frame(cv, "태양 가까이 지나가는 별 (±500만 년, 직선 운동)");
  if (!f) return [];
  const X = (t: number) => PAD.l + (t + 5e6) / 1e7 * (f.w - PAD.l - PAD.r), Y = (d: number) => PAD.t + d / 2.5 * (f.h - PAD.t - PAD.b);
  axes(f, [[-5e6, "−500만"], [-2.5e6, "−250만"], [0, "지금"], [2.5e6, "+250만"], [5e6, "+500만 년"]], [[0, "0 pc"], [1, "1"], [2, "2"]], X, Y);
  const c = f.c, shown = enc.filter((e) => Math.abs(e.tMin) <= 5e6).slice(0, 40);
  c.fillStyle = "rgba(42,120,214,0.12)"; c.fillRect(PAD.l, Y(0), f.w - PAD.l - PAD.r, Y(0.3) - Y(0));
  c.fillStyle = f.muted; c.textAlign = "right"; c.fillText("오르트 구름 (~0.3 pc)", f.w - PAD.r - 2, Y(0.3) - 3);
  const placed: [number, number, number][] = [];
  shown.forEach((e, k) => {
    const x = X(e.tMin), y = Y(e.dMin);
    c.fillStyle = e.tMin > 0 ? "#eb6834" : "#2a78d6";
    c.beginPath(); c.arc(x, y, k < 8 ? 4 : 2.5, 0, 6.2832); c.fill();
    if (k >= 8) return;
    // 이름표가 겹치면 건너뜀
    const label = name(e.i), w = c.measureText(label).width;
    if (placed.some(([px, py, pw]) => Math.abs(py - y) < 13 && x + 6 < px + pw && px < x + 6 + w)) return;
    placed.push([x + 6, y, w]);
    c.fillStyle = f.ink; c.textAlign = "left"; c.fillText(label, x + 6, y + 4);
  });
  marker(f, X(dt));
  return shown;
}
