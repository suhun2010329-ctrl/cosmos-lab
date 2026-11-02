// 우주 시뮬레이터: 실제 관측 목록으로 만든 우주 지도에 빅뱅부터 먼 미래까지의 시간축(팽창 시계)을 합친 것.
// 좌표는 은하 좌표계 [pc], 원점은 태양, Z가 은하 북극. 카메라는 원점에 두고 세상을 옮긴다(부동 원점 + RTE 셰이더).
// 시간을 움직이면 각 층이 자기 물리로 바뀐다: 별 = 직선 운동 + 수명, 태양계 = 케플러 궤도 + 영년 섭동 + 태양 진화,
// 국부 은하군 = N체 궤도, 그 밖의 은하 = 우주 팽창(척도 인자), 배경 = 그 시대의 우주배경복사 온도.
import * as THREE from "three";
import { clamp, smooth } from "../shared/math";
import { skyColor } from "../shared/color";
import { GLOBULARS, LARGE_SCALE, LOCAL_GROUP, NEBULAE, SATELLITES, SUN_POS_NOTE, type NamedObject } from "./catalog";
import { bvToTemp, galLB, hubbleName, hubbleType, loadAtlasData, planetA, planetRadiusEarth, radecToGal, starColor, type AtlasData, type Galaxy } from "./data";
import { buildMilkyWay, GC_POS } from "./milkyway";
import { GAL_FS, GAL_VS, HOST_FS, HOST_VS, MW_FS, MW_VS, SHELL_FS, SHELL_VS, STAR_FS, STAR_VS } from "./shaders";
import { buildLightCone, coneAt, matrix4, PRESETS4, project4, wMixed, XW, YW, ZW, type LightCone } from "./four";
import { exoSystem, orbitPos, solarSystem, SystemView, type SysData } from "./system";
import { ageForH0, diameterFromH, fitSolarCycle, impactEffects, kpStorm, loadLive, refreshDirect, satNow, summarizeH0, type ExoRow, type Literature, type Live } from "./live";
import type { TimedEvent } from "./sun";
import { aliveProbability, bolometricCorrection, LUM_NAMES, starPhys, STRIDE, type StarPhys } from "./stellar";
import { dayLength, earthAt, moonDistance, sunAt, totalEclipsePossible } from "./sun";
import { BLACK_HOLES, FACTS, hawkingYears, schwarzschildKm } from "./bodies";
import { trackAt } from "./localgroup";
import { SECULAR_LIMIT_YEARS } from "./secular";
import { dtToSlider, fmtDt, fmtYearsShort, NOW_YEAR, sliderToDt, Timeline, YEAR_S } from "./time";
import { buildEvents, buildForecasts, type Forecasts } from "./predict";
import { drawEccentricity, drawEncounters, drawLocalGroup, drawSun } from "./charts";
import { BODY_COMP, bulkComposition, ELEMENTS, exoComposition, layerMasses, starComposition, type Composition } from "./composition";
import { ImpactView, MODE_NAMES, type ColorMode } from "./impactview";
import { customScene, PICKABLE, SCENES, stillBody, type Scene } from "./impactscenes";
import type { ImpactSetup } from "./impact";
import { JWST_KM, planTransfer, probePosition, SATELLITES_EARTH, transferPath, VEHICLES, type Transfer } from "./mission";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const AU_PC = 4.8481368e-6, LY_PC = 0.306601, FOV = 50;
const TL = new Timeline();
const core = TL.core;

// ---------- 표기 ----------
/** 유효숫자 3자리, 단 1000 이상은 정수로 (1.50e+3 같은 표기를 피함) */
function p3(x: number): string { return x >= 1000 ? Math.round(x).toLocaleString("ko-KR") : x.toPrecision(3); }
function fmtPc(pc: number): string {
  if (!isFinite(pc)) return "무한대";
  if (pc < 0.02) return p3(pc / AU_PC) + " AU";
  const ly = pc / LY_PC;
  if (ly < 1e4) return p3(ly) + " 광년";
  if (ly < 1e8) return p3(ly / 1e4) + "만 광년";
  if (ly < 1e12) return p3(ly / 1e8) + "억 광년";
  return fmtYearsShort(ly).replace("년", "광년");
}
function fmtPcUnit(pc: number): string {
  if (pc < 0.02) return p3(pc / AU_PC) + " AU";
  if (pc < 1e3) return pc.toPrecision(3) + " pc";
  if (pc < 1e6) return (pc / 1e3).toPrecision(3) + " kpc";
  if (pc < 1e9) return (pc / 1e6).toPrecision(3) + " Mpc";
  return (pc / 1e9).toPrecision(3) + " Gpc";
}
function sci(x: number, d = 2): string {
  if (x === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
  return m.toFixed(d) + " × 10" + String(e).split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c] ?? (c === "-" ? "⁻" : c)).join("");
}
const GREEK: Record<string, string> = { Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ", Iot: "ι", Kap: "κ", Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ", Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω" };
const STAR_KO: Record<string, string> = {
  Sirius: "시리우스", Canopus: "카노푸스", Arcturus: "아르크투루스", "Rigil Kentaurus": "알파 센타우리 A", Toliman: "알파 센타우리 B", Vega: "베가 (직녀성)", Capella: "카펠라",
  Rigel: "리겔", Procyon: "프로키온", Achernar: "아케르나르", Betelgeuse: "베텔게우스", Hadar: "하다르", Altair: "알타이르 (견우성)", Acrux: "아크룩스", Aldebaran: "알데바란",
  Antares: "안타레스", Spica: "스피카", Pollux: "폴룩스", Fomalhaut: "포말하우트", Deneb: "데네브", Mimosa: "미모사", Regulus: "레굴루스", Adhara: "아다라", Castor: "카스토르",
  Shaula: "샤울라", Gacrux: "가크룩스", Bellatrix: "벨라트릭스", Elnath: "엘나트", Alnilam: "알닐람", Alnitak: "알니타크", Mintaka: "민타카", Polaris: "북극성", Mira: "미라",
  Algol: "알골", "Proxima Centauri": "프록시마 센타우리", "Barnard's Star": "바너드 별", Dubhe: "두베", Alkaid: "알카이드", Mizar: "미자르", Thuban: "투반", Rasalhague: "라스알하게",
  "Gliese 710": "글리제 710", "Ross 248": "로스 248",
};
function starLabel(name: string): string {
  if (STAR_KO[name]) return STAR_KO[name];
  const m = /^([A-Z][a-z]{1,2})(\d?) (\w+)$/.exec(name);
  return m && GREEK[m[1]] ? GREEK[m[1]] + m[2] + " " + m[3] : name;
}

// ---------- 화면 ----------
const stage = $("stage"), cv = $<HTMLCanvasElement>("cv"), labelsEl = $("labels");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: "high-performance" });
renderer.setClearColor(0x000000, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 1e-6, 1e12);
camera.up.set(0, 0, 1);
let W = 0, H = 0, dpr = 1;
const sys = new SystemView($("sysLabels"));

/** 위치를 float 두 개로 나눔 (RTE) */
function split(arr: ArrayLike<number>, n: number): { hi: Float32Array; lo: Float32Array } {
  const hi = new Float32Array(3 * n), lo = new Float32Array(3 * n);
  for (let i = 0; i < 3 * n; i++) { hi[i] = Math.fround(arr[i]); lo[i] = arr[i] - hi[i]; }
  return { hi, lo };
}
// 모든 층이 함께 쓰는 유니폼: 회전 중심(카메라 목표)과 4차원 회전·투영
const camU = {
  uTgtHi: { value: new THREE.Vector3() }, uTgtLo: { value: new THREE.Vector3() }, uCamOff: { value: new THREE.Vector3() },
  uR4: { value: new THREE.Matrix4() }, uWk: { value: 1 }, uWTgt: { value: 0 }, uP4: { value: 0 }, uL: { value: 1 }, uTint: { value: 0 },
  uSeeT: { value: 1 }, uMix: { value: 0 }, uTgtShift: { value: new THREE.Vector3() },
};

// ---------- 4차원: (x, y, z, w), w = 빛이 떠난 때 × c ----------
// 4차원 관측실의 여섯 평면 회전(rotate4)을 그대로 지도에 씀. 회전각이 모두 0이면 보통의 3차원 지도와 같다.
const four = {
  ang: [0, 0, 0, 0, 0, 0], spin: false, tint: false, persp: false, wk: 1, M: matrix4([0, 0, 0, 0, 0, 0]),
  tween: null as null | { t: number; from: number[]; to: number[]; phi0?: number; phi1?: number },
};
const SPIN_SPEEDS = [0, 0, 0.21, 0, 0.13, 0.17];
const DEG4 = Math.PI / 180;

// ---------- 시공간 조건: 팽창 · 공간 = 시간 ----------
// 팽창: 은하 사이 거리가 척도 인자 a(t)만큼 늘어나고, 빛도 늘어나는 공간을 건너 온다.
// 공간 = 시간: 멀리 있는 것일수록 빛이 떠난 옛 모습만 보인다. w = 그 빛이 떠난 때 × c (관측 시점의 과거 광원뿔).
// 공간을 w 쪽으로 돌릴수록(uMix) ‘같은 순간의 위치’에서 ‘빛이 떠날 때의 위치’로 옮겨 가 광원뿔(눈물방울)이 드러난다.
const space4 = { expand: true, seeT: true };
/** 이보다 먼(오늘 기준 거리) 천체는 우주 팽창을 따름 */
const HUB_PC = 2.5e6;
const T0_Y = TL.t0 / YEAR_S;
let cone: LightCone = buildLightCone((d) => TL.la(d), T0_Y, 0, true);
let coneKey = "";
/** 태양 기준 위치 p(그 시점)의 4차원 좌표 w, 위치 배율, 보이는가 */
function seen(p: ArrayLike<number>): { w: number; S: number; ok: boolean; ratio: number } {
  const d = Math.hypot(p[0], p[1], p[2]);
  if (!space4.seeT) return { w: 0, S: 1, ok: true, ratio: 1 };
  const chi = d / now.s;
  if (chi < HUB_PC) return { w: -d, S: 1, ok: true, ratio: 1 };
  const r = coneAt(cone, Math.min(chi, cone.horizon * 0.99999));
  return { w: r.w, S: 1 + (r.ratio - 1) * camU.uMix.value, ok: chi <= cone.horizon * 1.0001, ratio: r.ratio };
}
/** 관측 시각이나 조건이 바뀌면 광원뿔을 다시 만들고 은하·경계의 w를 갱신 */
function refreshCone(): void {
  const key = (T0_Y + time.dt).toPrecision(5) + "|" + space4.expand + space4.seeT + TL.fate;
  if (key === coneKey || !galW) return;
  coneKey = key;
  cone = buildLightCone((d) => TL.la(d), T0_Y, time.dt, space4.expand);
  const st = space4.seeT, GW = galW.array as Float32Array, GS = galS!.array as Float32Array;
  gals.forEach((e, i) => {
    const chi = Math.hypot(e.pos[0], e.pos[1], e.pos[2]);
    if (e.group !== 0) { GW[i] = st ? -chi : 0; GS[i] = 1; return; }
    const r = coneAt(cone, chi);
    GW[i] = st ? r.w : 0;
    GS[i] = !st ? 1 : r.ok ? r.ratio : -1;
  });
  galW.needsUpdate = true; galS!.needsUpdate = true;
  for (const sh of shells) {
    const u = (sh.g.material as THREE.ShaderMaterial).uniforms, r = coneAt(cone, Math.min(sh.R, cone.horizon * 0.99999));
    u.uShellW.value = st ? r.w : 0; u.uShellS.value = st ? r.ratio : 1;
    sh.ok = !st || sh.R <= cone.horizon * 1.0001;
  }
  const hz = cone.horizon * now.s / LY_PC;
  setText("c4Info", (st ? "보이는 우주의 끝(입자 지평선) " + fmtYearsShort(hz).replace("년", "광년") + " · 가장 오래된 빛 " + fmtYearsShort(cone.age) + " 전 출발" : "모든 천체가 같은 순간(w = 0)에 놓인 3차원 단면") + (space4.expand ? "" : " · 팽창 없음: 거리가 그대로"));
}
function update4(dt: number): void {
  if (four.tween) {
    const tw = four.tween;
    tw.t = Math.min(1, tw.t + dt / 1.1);
    const e = tw.t * tw.t * (3 - 2 * tw.t);
    for (let k = 0; k < 6; k++) four.ang[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
    // 광원뿔은 옆에서 봐야 모양이 드러나므로 카메라도 함께 눕힘
    if (tw.phi1 !== undefined && mode === "map" && !cam.fly) cam.phi = tw.phi0! + (tw.phi1 - tw.phi0!) * e;
    if (tw.t >= 1) four.tween = null;
    syncFourUi();
  } else if (four.spin) {
    for (let k = 0; k < 6; k++) four.ang[k] = wrapPi(four.ang[k] + SPIN_SPEEDS[k] * dt);
    syncFourUi();
  }
  matrix4(four.ang, four.M);
  const m = four.M;
  camU.uR4.value.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]);
  camU.uWk.value = four.wk;
  camU.uP4.value = four.persp ? 1 : 0;
  camU.uL.value = cam.r * 3;
  camU.uTint.value = four.tint ? 1 : 0;
  camU.uSeeT.value = space4.seeT ? 1 : 0;
  camU.uMix.value = space4.seeT ? clamp(1 - m[15] * m[15], 0, 1) : 0;
  const st = seen(cam.target);
  camU.uWTgt.value = st.w;
  camU.uTgtShift.value.set(cam.target[0] * (st.S - 1), cam.target[1] * (st.S - 1), cam.target[2] * (st.S - 1));
}
function wrapPi(a: number): number { return a - 2 * Math.PI * Math.round(a / (2 * Math.PI)); }
function is4dActive(): boolean { return wMixed(four.ang) || four.persp; }
/** 화면에 그리는 것과 같은 4차원 변환 (이름표·고르기용): 태양 기준 위치 p, w → 카메라 기준 3차원 */
function to4(p: ArrayLike<number>, w: number, S = 1): [number, number, number] {
  const sh = camU.uTgtShift.value;
  const q = project4(four.M, p[0] * S - cam.target[0] - sh.x, p[1] * S - cam.target[1] - sh.y, p[2] * S - cam.target[2] - sh.z, (w - camU.uWTgt.value) * four.wk, four.persp ? 1 : 0, camU.uL.value);
  return [q[0] - (camPos[0] - cam.target[0]), q[1] - (camPos[1] - cam.target[1]), q[2] - (camPos[2] - cam.target[2])];
}
/** 4차원 조작 막대를 지금 각도에 맞춤 */
function syncFourUi(): void {
  const set = (id: string, k: number) => {
    const deg = Math.round(wrapPi(four.ang[k]) / DEG4);
    const el = $<HTMLInputElement>(id);
    if (document.activeElement !== el) el.value = String(deg);
    setText(id + "V", (deg > 0 ? "+" : "") + deg + "°");
  };
  set("r4XW", XW); set("r4YW", YW); set("r4ZW", ZW);
  const a = [XW, YW, ZW].map((k) => Math.round(wrapPi(four.ang[k]) / DEG4));
  document.querySelectorAll<HTMLElement>("#four4 [data-r4]").forEach((b) => {
    const p = PRESETS4[b.dataset.r4!];
    b.setAttribute("aria-pressed", String(!four.spin && !four.tween && p.XW === a[0] && p.YW === a[1] && p.ZW === a[2]));
  });
  $("r4Spin").setAttribute("aria-pressed", String(four.spin));
}
function goPreset4(key: string): void {
  const p = PRESETS4[key];
  four.spin = false;
  const to = four.ang.map((a) => wrapPi(a));
  to[0] = to[1] = to[3] = 0;
  to[XW] = p.XW * DEG4; to[YW] = p.YW * DEG4; to[ZW] = p.ZW * DEG4;
  four.ang = four.ang.map((a) => wrapPi(a));
  four.tween = { t: 0, from: four.ang.slice(), to, phi0: cam.phi, phi1: key === "cone" ? 1.42 : key === "tilt" ? 1.2 : undefined };
  setText("four4Note", p.text);
}
/** 4차원 좌표축 표시 (왼쪽 아래): X·Y·Z·W 축을 지금의 4차원 회전과 카메라로 투영 */
const axCv = $<HTMLCanvasElement>("axes4"), axCtx = axCv.getContext("2d")!;
const m3 = new THREE.Matrix3(), av = new THREE.Vector3();
function drawAxes4(): void {
  const S = 112, d = Math.min(window.devicePixelRatio || 1, 2);
  if (axCv.width !== S * d) { axCv.width = axCv.height = S * d; }
  const g = axCtx;
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, S, S);
  const camM = mode === "system" ? sys.camera.matrixWorldInverse : camera.matrixWorldInverse;
  m3.setFromMatrix4(camM);
  const M = four.M, cols = ["#ff6b6b", "#5ee08a", "#6ba8ff", "#ff7fd0"], names = ["X", "Y", "Z", "W"];
  const axes = [0, 1, 2, 3].map((j) => {
    // 열 j의 공간 부분 (지도 좌표). 행성계 장면은 y가 위인 three 좌표라서 (x, z, −y)로 바꿈
    const x = M[j], y = M[4 + j], z = M[8 + j];
    if (mode === "system") av.set(x, z, -y); else av.set(x, y, z);
    av.applyMatrix3(m3);
    return { j, sx: av.x, sy: -av.y, z: av.z, len: Math.hypot(av.x, av.y) };
  }).sort((a, b) => a.z - b.z);
  const c = S / 2, L = 40;
  g.font = "600 11px 'IBM Plex Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 2; g.lineCap = "round";
  const placed: [number, number][] = [];
  const label = (t: string, x: number, y: number) => {
    // 두 축이 같은 쪽을 가리키면 이름이 겹치므로 옆으로 비킴
    while (placed.some(([px, py]) => Math.abs(px - x) < 13 && Math.abs(py - y) < 12)) x += 14;
    placed.push([x, y]); g.fillText(t, x, y);
  };
  for (const a of axes) {
    g.strokeStyle = g.fillStyle = cols[a.j];
    g.globalAlpha = 0.45 + 0.55 * Math.min(1, a.len);
    if (a.len < 0.06) {
      g.beginPath(); g.arc(c, c, 6, 0, 2 * Math.PI); g.stroke();
      label(names[a.j] + "⊥", c + 18, c + 14);
      continue;
    }
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + a.sx * L, c + a.sy * L); g.stroke();
    const n = a.len, ox = a.sx / n * 9, oy = a.sy / n * 9;
    label(names[a.j], c + a.sx * L + ox, c + a.sy * L + oy);
  }
  g.globalAlpha = 1;
}
function hud4Text(): string {
  const a = [XW, YW, ZW].map((k) => Math.round(wrapPi(four.ang[k]) / DEG4));
  const ang = "XW " + a[0] + "° · YW " + a[1] + "° · ZW " + a[2] + "°";
  const state = wMixed(four.ang) ? ang : is4dActive() ? "w 원근만" : mode === "system" ? "w가 화면에 수직" : "w가 화면에 수직 (3차원 단면)";
  if (mode === "system") return "4차원 · w = 시간" + (sys.wlYears ? " (세계선 " + fmtYearsShort(sys.wlYears) + ")" : "") + " · " + state;
  return "4차원 · " + (space4.seeT ? "w = 빛이 떠난 때 × c" : "w = 0 (같은 순간)") + " · " + state + " · " + (space4.expand ? "팽창" : "팽창 없음");
}
const uScale = { value: 1 }, uRes = { value: new THREE.Vector2(1, 1) };

// ---------- 카메라 (배정밀도) ----------
interface Fly { t: number; T: number; from: number[]; to: number[]; r0: number; r1: number; bump: number; phi1?: number; phi0: number; get?: () => ArrayLike<number> }
const cam = { target: [0, 0, 0] as number[], r: 8, theta: 0.6, phi: 1.05, auto: false, fly: null as null | Fly, label: "태양", follow: null as null | (() => ArrayLike<number>) };
const camPos = [0, 0, 0];
function camDir(): [number, number, number] {
  const sp = Math.sin(cam.phi);
  return [sp * Math.cos(cam.theta), sp * Math.sin(cam.theta), Math.cos(cam.phi)];
}
/** 대상으로 날아감. get을 주면 시간이 흘러 대상이 움직여도 따라감 */
function flyTo(p: ArrayLike<number>, r: number, label: string, opts: { phi?: number; get?: () => ArrayLike<number> } = {}): void {
  const d = Math.hypot(p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2]);
  const bump = Math.max(0, Math.log(d / Math.max(cam.r, r) + 1)) * 0.9;
  const T = clamp(1.6 + 0.18 * Math.abs(Math.log10((d + r) / cam.r)), 1.8, 4.2);
  cam.fly = { t: 0, T, from: cam.target.slice(), to: [p[0], p[1], p[2]], r0: cam.r, r1: r, bump, phi0: cam.phi, phi1: opts.phi, get: opts.get };
  cam.follow = null;
  cam.label = label;
}
function ease(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function updateCamera(dt: number): void {
  const f = cam.fly;
  if (f) {
    f.t += dt;
    const u = clamp(f.t / f.T, 0, 1), e = ease(u), to = f.get ? f.get() : f.to;
    for (let k = 0; k < 3; k++) cam.target[k] = f.from[k] + (to[k] - f.from[k]) * e;
    cam.r = Math.exp(Math.log(f.r0) + (Math.log(f.r1) - Math.log(f.r0)) * e + f.bump * Math.sin(Math.PI * e));
    if (f.phi1 !== undefined) cam.phi = f.phi0 + (f.phi1 - f.phi0) * e;
    if (u >= 1) { cam.fly = null; cam.follow = f.get ?? null; }
  } else {
    if (cam.follow) { const p = cam.follow(); cam.target = [p[0], p[1], p[2]]; }
    if (cam.auto && !pointers.size) cam.theta += 0.05 * dt;
  }
  const d = camDir();
  for (let k = 0; k < 3; k++) camPos[k] = cam.target[k] + cam.r * d[k];
  camera.position.set(0, 0, 0);
  camera.lookAt(-d[0], -d[1], -d[2]);
  camera.near = Math.max(cam.r * 1e-4, 1e-9);
  camera.far = Math.max(cam.r * 1e7, 1e3);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  for (let k = 0; k < 3; k++) {
    const hi = Math.fround(cam.target[k]);
    camU.uTgtHi.value.setComponent(k, hi); camU.uTgtLo.value.setComponent(k, cam.target[k] - hi);
    camU.uCamOff.value.setComponent(k, camPos[k] - cam.target[k]);
  }
}

// ---------- 시간 ----------
/** dt: 지금부터 [년] (음수 = 과거). rate: 재생 1초에 흐르는 년 (log면 1초에 10배) */
const time = { dt: 0, dir: 0, rate: 1 as number | "log" };
/** 현재 시점에서 계산한 값들 (매 프레임 갱신) */
const now = {
  la: 0, s: 1, dtLocal: 0, local: 1, gcOff: [0, 0, 0], m31Off: [0, 0, 0], lmcOff: [0, 0, 0], milk: 0, lmcGone: 0,
  gc: [...GC_POS], sunMag: 4.83, fog: 0, sun: sunAt(0),
};
const OMEGA_SUN = 233 / 977792 / 8178; // 태양의 은하 공전 각속도 [rad/년] (원 궤도 속도 233 km/s, Eilers 외 2019)
const OMEGA_P = 28.2 / 977792 / 1000; // 나선팔 패턴 속도 [rad/년] (Dias 외 2019: 28.2 km/s/kpc)

let appliedDt = NaN;
function applyTime(): void {
  const dt = time.dt;
  if (dt === appliedDt) return;
  appliedDt = dt;
  now.la = TL.la(dt);
  now.s = space4.expand ? Math.min(Math.pow(10, now.la), 1e30) : 1;
  now.dtLocal = clamp(dt, -1e7, 1e7);
  now.sun = sunAt(dt / 1e9);
  now.local = 1 - smooth(1e7, 4e7, Math.abs(dt));
  // 태양이 은하 중심을 돌므로 (태양 기준 좌표에서) 은하 중심이 태양 둘레를 도는 것처럼 보임: GC = R0 (cos φ, −sin φ)
  const ph = OMEGA_SUN * dt, R0 = GC_POS[0];
  now.gc = [R0 * Math.cos(ph), -R0 * Math.sin(ph), GC_POS[2]];
  now.gcOff = [now.gc[0] - GC_POS[0], now.gc[1] - GC_POS[1], 0];
  // 국부 은하군 N체 궤도 (최선 추정): 미래만 계산, 과거는 지금 위치에 고정
  if (fc && dt > 0) {
    const g = dt / 1e9, b = fc.lg.best, m0 = trackAt(b, "m31", 0), m1 = trackAt(b, "m31", g), l0 = trackAt(b, "lmc", 0), l1 = trackAt(b, "lmc", g);
    now.m31Off = [0, 1, 2].map((k) => now.gcOff[k] + (m1[k] - m0[k]) * 1000);
    now.lmcOff = [0, 1, 2].map((k) => now.gcOff[k] + (l1[k] - l0[k]) * 1000);
    now.milk = b.mergeM31 !== null ? smooth(b.mergeM31 - 0.15, b.mergeM31 + 0.35, g) : 0;
    now.lmcGone = b.mergeLMC !== null ? smooth(b.mergeLMC - 0.05, b.mergeLMC + 0.2, g) : 0;
  } else {
    now.m31Off = now.gcOff.slice(); now.lmcOff = now.gcOff.slice(); now.milk = 0; now.lmcGone = 0;
  }
  // 태양의 모습
  const sun = now.sun;
  now.sunMag = sun.L > 0 ? 4.74 - 2.5 * Math.log10(sun.L) - bolometricCorrection(sun.T) : 99;
  // 배경: 그 시대 우주 안에서 본 하늘. 우주배경복사가 3000 K보다 뜨거우면 빛이 갇힌 불투명한 플라스마
  const T = TL.Tcmb(dt), laSky = dt > 0 && now.la < core.LA_RH ? core.LA_RH + 1 : now.la;
  const sky = skyColor(core, laSky);
  renderer.setClearColor(new THREE.Color(sky[0] / 255, sky[1] / 255, sky[2] / 255), 1);
  now.fog = smooth(2600, 4500, T);
  const fogEl = $("fog");
  fogEl.style.opacity = now.fog.toFixed(3);
  fogEl.style.background = "rgb(" + sky.map((v) => Math.round(v)).join(",") + ")";
}

// ---------- 층 ----------
let data: AtlasData;
let fc: Forecasts | null = null;
let starMat: THREE.ShaderMaterial, hostMat: THREE.ShaderMaterial, galMat: THREE.ShaderMaterial, mwMat: THREE.ShaderMaterial, dustMat: THREE.ShaderMaterial;
let mwPts: THREE.Points, dustPts: THREE.Points, starPts: THREE.Points, hostPts: THREE.Points, galMesh: THREE.Mesh;
const shells: { g: THREE.LineSegments; R: number; name: string; note: string; ok: boolean }[] = [];
let galW: THREE.InstancedBufferAttribute | null = null, galS: THREE.InstancedBufferAttribute | null = null;
/** 은하 무리: 0 우주 팽창을 따름, 1 국부 은하군(고정), 2 안드로메다 무리, 3 마젤란 은하, 4 은하 중심을 도는 위성, 5 밀코메다 */
interface GalEntry { name: string; sub: string; pos: number[]; R: number; type: number; absMag: number; group: number; g?: Galaxy; o?: NamedObject }
const gals: GalEntry[] = [];
interface Named { name: string; pos: number[]; kind: NamedObject["kind"] | "blackhole"; o?: NamedObject; bh?: (typeof BLACK_HOLES)[number]; move: "static" | "gc" | "hubble" }
const named: Named[] = [];
let phys: StarPhys[] = [];
const M31_GROUP = new Set(["NGC0224", "NGC0221", "NGC0205", "NGC0147", "NGC0185", "And I", "And II", "NGC0598"]);

function buildLayers(): void {
  const b = data.stars.buf, ns0 = data.stars.n;
  // 별 (HYG) + 태양
  const n = ns0 + 1, P = new Float64Array(3 * n), mag = new Float32Array(n), col = new Float32Array(3 * n), vel = new Float32Array(3 * n), life = new Float32Array(n), isSun = new Float32Array(n);
  phys = new Array(ns0);
  for (let i = 0; i < ns0; i++) {
    const o = STRIDE * i;
    P[3 * i] = b[o]; P[3 * i + 1] = b[o + 1]; P[3 * i + 2] = b[o + 2];
    vel[3 * i] = b[o + 5]; vel[3 * i + 1] = b[o + 6]; vel[3 * i + 2] = b[o + 7];
    mag[i] = b[o + 3];
    const c = starColor(b[o + 4]);
    col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2];
    phys[i] = starPhys(b[o + 3], b[o + 4], b[o + 8] % 16);
    life[i] = isFinite(phys[i].tRemMax) ? phys[i].tRemMax : 1e30;
  }
  mag[n - 1] = 4.83; col.set(starColor(0.656), 3 * (n - 1)); isSun[n - 1] = 1; life[n - 1] = 1e30;
  const sp = split(P, n), sg = new THREE.BufferGeometry(), hiAttr = new THREE.BufferAttribute(sp.hi, 3);
  sg.setAttribute("position", hiAttr); sg.setAttribute("aHi", hiAttr); sg.setAttribute("aLo", new THREE.BufferAttribute(sp.lo, 3));
  sg.setAttribute("aMag", new THREE.BufferAttribute(mag, 1)); sg.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  sg.setAttribute("aVel", new THREE.BufferAttribute(vel, 3)); sg.setAttribute("aLife", new THREE.BufferAttribute(life, 1)); sg.setAttribute("aSun", new THREE.BufferAttribute(isSun, 1));
  starMat = new THREE.ShaderMaterial({
    uniforms: { ...camU, uMLim: { value: 6.5 }, uFade: { value: 1 }, uPx: { value: 1.6 }, uDt: { value: 0 }, uAge: { value: 0 }, uLocal: { value: 1 }, uSunMag: { value: 4.83 }, uSunCol: { value: new THREE.Vector3(...starColor(0.656)) } },
    vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  starPts = new THREE.Points(sg, starMat); starPts.frustumCulled = false; scene.add(starPts);

  // 외계행성계 표시 (HYG 별과 짝지어지면 그 별의 속도로 움직임)
  const nsys = data.systems.length, HP = new Float64Array(3 * nsys), hn = new Float32Array(nsys), hidx = new Float32Array(nsys), hv = new Float32Array(3 * nsys);
  data.systems.forEach((s, i) => {
    HP.set(s.pos, 3 * i); hn[i] = s.planets.length; hidx[i] = i;
    if (s.hyg >= 0) { const o = STRIDE * s.hyg; hv[3 * i] = b[o + 5]; hv[3 * i + 1] = b[o + 6]; hv[3 * i + 2] = b[o + 7]; }
  });
  const hs = split(HP, nsys), hg = new THREE.BufferGeometry(), hh = new THREE.BufferAttribute(hs.hi, 3);
  hg.setAttribute("position", hh); hg.setAttribute("aHi", hh); hg.setAttribute("aLo", new THREE.BufferAttribute(hs.lo, 3));
  hg.setAttribute("aN", new THREE.BufferAttribute(hn, 1)); hg.setAttribute("aIdx", new THREE.BufferAttribute(hidx, 1)); hg.setAttribute("aVel", new THREE.BufferAttribute(hv, 3));
  hostMat = new THREE.ShaderMaterial({ uniforms: { ...camU, uRange: { value: 10 }, uPx: { value: 1 }, uFade: { value: 1 }, uSelIdx: { value: -1 }, uDt: { value: 0 } }, vertexShader: HOST_VS, fragmentShader: HOST_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  hostPts = new THREE.Points(hg, hostMat); hostPts.frustumCulled = false; scene.add(hostPts);

  // 은하
  for (const g of data.galaxies) {
    const absMag = g.bmag != null ? g.bmag - 5 * Math.log10(g.dMpc * 1e6 / 10) : -19;
    gals.push({ name: galName(g), sub: g.id, pos: g.pos, R: (g.sizeKpc ?? 10) * 1000, type: hubbleType(g.hubble), absMag, group: M31_GROUP.has(g.id) ? 2 : g.dMpc < 3 ? 1 : 0, g });
  }
  const extraMag = (o: NamedObject) => (o.en === "LMC" ? -18.1 : o.en === "SMC" ? -16.8 : o.kind === "satellite" ? -10 : -13.5);
  for (const o of [...SATELLITES, ...LOCAL_GROUP]) {
    const grp = o.en === "LMC" || o.en === "SMC" ? 3 : o.kind === "satellite" ? 4 : M31_GROUP.has(o.en ?? "") ? 2 : 1;
    gals.push({ name: o.name, sub: o.en ?? "", pos: radecToGal(o.ra, o.dec, o.dkpc! * 1000), R: (o.size ?? 1.5) * 1000, type: o.en === "LMC" || o.en === "SMC" || o.kind === "localgroup" ? 1 : 3, absMag: extraMag(o), group: grp, o });
  }
  gals.push({ name: "밀코메다 (예측)", sub: "Milkomeda", pos: [...GC_POS], R: 60000, type: 3, absMag: -22.2, group: 5 });
  const ng = gals.length, GP = new Float64Array(3 * ng), E1 = new Float32Array(3 * ng), E2 = new Float32Array(3 * ng), gp = new Float32Array(4 * ng), gi = new Float32Array(ng), gg = new Float32Array(ng), gw = new Float32Array(ng);
  gals.forEach((e, i) => {
    GP.set(e.pos, 3 * i);
    const [a, bb] = diskAxes(e);
    E1.set(a, 3 * i); E2.set(bb, 3 * i);
    gp[4 * i] = e.type; gp[4 * i + 1] = hash01(e.sub || e.name); gp[4 * i + 2] = e.absMag; gp[4 * i + 3] = e.type === 3 ? 1 : 0; gi[i] = i; gg[i] = e.group;
  });
  const gs = split(GP, ng), geo = new THREE.InstancedBufferGeometry();
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setAttribute("gHi", new THREE.InstancedBufferAttribute(gs.hi, 3)); geo.setAttribute("gLo", new THREE.InstancedBufferAttribute(gs.lo, 3));
  geo.setAttribute("gE1", new THREE.InstancedBufferAttribute(E1, 3)); geo.setAttribute("gE2", new THREE.InstancedBufferAttribute(E2, 3));
  geo.setAttribute("gP", new THREE.InstancedBufferAttribute(gp, 4)); geo.setAttribute("gIdx", new THREE.InstancedBufferAttribute(gi, 1)); geo.setAttribute("gGroup", new THREE.InstancedBufferAttribute(gg, 1)); geo.setAttribute("gW", galW = new THREE.InstancedBufferAttribute(gw, 1)); geo.setAttribute("gS", galS = new THREE.InstancedBufferAttribute(new Float32Array(ng).fill(1), 1));
  geo.instanceCount = ng;
  galMat = new THREE.ShaderMaterial({
    uniforms: { ...camU, uMLim: { value: 20 }, uScale, uRes, uFade: { value: 1 }, uMinPx: { value: 1.6 }, uSelIdx: { value: -1 },
      uA: { value: 1 }, uM31Off: { value: new THREE.Vector3() }, uLMCOff: { value: new THREE.Vector3() }, uGcOff: { value: new THREE.Vector3() }, uMilk: { value: 0 }, uLmcGone: { value: 0 } },
    vertexShader: GAL_VS, fragmentShader: GAL_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  galMesh = new THREE.Mesh(geo, galMat); galMesh.frustumCulled = false; scene.add(galMesh);

  // 우리 은하 모형 + 먼지
  const mw = buildMilkyWay();
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.BufferAttribute(mw.pos, 3)); mg.setAttribute("aCol", new THREE.BufferAttribute(mw.col, 4)); mg.setAttribute("aSize", new THREE.BufferAttribute(mw.size, 1));
  const mwU = { uOrigin: { value: new THREE.Vector3(...GC_POS) }, uRotZ: { value: 0 } };
  mwMat = new THREE.ShaderMaterial({ uniforms: { ...camU, ...mwU, uScale, uFade: { value: 1 }, uMinPx: { value: 1.2 } }, vertexShader: MW_VS, fragmentShader: MW_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  mwPts = new THREE.Points(mg, mwMat); mwPts.frustumCulled = false;
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(mw.dust.pos, 3)); dg.setAttribute("aCol", new THREE.BufferAttribute(mw.dust.col, 4)); dg.setAttribute("aSize", new THREE.BufferAttribute(mw.dust.size, 1));
  dustMat = new THREE.ShaderMaterial({ uniforms: { ...camU, ...mwU, uScale, uFade: { value: 1 }, uMinPx: { value: 1.0 } }, vertexShader: MW_VS, fragmentShader: MW_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending });
  dustPts = new THREE.Points(dg, dustMat); dustPts.frustumCulled = false;
  scene.add(mwPts); scene.add(dustPts);

  // 이름 붙은 천체: 구상성단(은하 중심과 함께), 성운(제자리), 은하단·초은하단·공동(우주 팽창), 블랙홀
  for (const o of [...GLOBULARS, ...NEBULAE, ...LARGE_SCALE]) {
    const dpc = o.dkpc !== undefined ? o.dkpc * 1000 : core.comovingDistance(o.z!) * 1e6;
    named.push({ name: o.name, pos: radecToGal(o.ra, o.dec, dpc), kind: o.kind, o, move: o.kind === "globular" ? "gc" : o.kind === "nebula" ? "static" : "hubble" });
  }
  for (const bh of BLACK_HOLES) named.push({ name: bh.name, pos: radecToGal(bh.ra, bh.dec, bh.dkpc * 1000), kind: "blackhole", bh, move: bh.dkpc < 3 ? "static" : bh.dkpc < 20 ? "gc" : "hubble" });

  // 관측 가능한 우주의 경계들 (공동 거리, Planck 2018)
  const ring = (R: number) => {
    const pts: number[] = [], seg = 128;
    const circ = (f: (t: number) => [number, number, number]) => { for (let k = 0; k < seg; k++) pts.push(...f(2 * Math.PI * k / seg), ...f(2 * Math.PI * (k + 1) / seg)); };
    circ((t) => [R * Math.cos(t), R * Math.sin(t), 0]);
    circ((t) => [R * Math.cos(t), 0, R * Math.sin(t)]);
    circ((t) => [0, R * Math.cos(t), R * Math.sin(t)]);
    for (const lat of [-60, -30, 30, 60]) { const z = R * Math.sin(lat * Math.PI / 180), rr = R * Math.cos(lat * Math.PI / 180); circ((t) => [rr * Math.cos(t), rr * Math.sin(t), z]); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  };
  const shellDefs: [string, number, string, number][] = [
    ["z = 0.1", core.comovingDistance(0.1) * 1e6, "빛이 약 13억 년 걸려 오는 거리. 근방 우주 지도(SDSS·2dF)의 깊이.", 0x5d7fbf],
    ["허블 거리 c/H₀", 299792.458 / (100 * core.h) * 1e6, "지금 후퇴 속도가 빛의 속도와 같은 거리 (약 44.5억 파섹).", 0x7a6fd1],
    ["우주 사건 지평선", eventHorizonPc(), "지금 여기서 보낸 빛이 영원히 닿을 수 있는 한계. 이보다 먼 은하에는 어떤 신호도 닿지 않습니다 (ΛCDM).", 0x3fbf9f],
    ["z = 14.44 (MoM-z14)", core.comovingDistance(14.44) * 1e6, "JWST가 분광으로 확인한 가장 먼 은하 (Naidu 외 2025).", 0xd98a3a],
    ["우주배경복사 (z ≈ 1090)", core.comovingDistance(1089.9) * 1e6, "마지막 산란면. 우리가 볼 수 있는 가장 오래된 빛.", 0xe0603a],
    ["입자 지평선", core.comovingDistance(1e9) * 1e6, "빅뱅 이후 빛이 올 수 있었던 가장 먼 곳. 관측 가능한 우주의 반지름.", 0xc8c8d8],
  ];
  for (const [name, R, note, color] of shellDefs) {
    // 경계 위의 점은 모두 같은 w (그 경계의 빛이 떠난 때): 4차원으로 돌리면 과거 빛원뿔의 단면으로 보임
    const mat = new THREE.ShaderMaterial({ uniforms: { ...camU, uK: { value: 1 }, uShellW: { value: -R }, uShellS: { value: 1 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.35 } }, vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthTest: false, depthWrite: false });
    const g = new THREE.LineSegments(ring(R), mat);
    g.frustumCulled = false; scene.add(g);
    shells.push({ g, R, name, note, ok: true });
  }
}

/** 우주 사건 지평선의 지금 공동 거리 [pc]: c ∫₁^∞ da / (a² H(a)) */
function eventHorizonPc(): number {
  let s = 0;
  const n = 4000, l1 = Math.log(1e4), dl = l1 / n;
  for (let i = 0; i <= n; i++) { const a = Math.exp(i * dl); s += (i === 0 || i === n ? 0.5 : 1) / (a * core.E(a)); }
  return 299792.458 / (100 * core.h) * s * dl * 1e6;
}

const GAL_KO: Record<string, string> = {
  "Andromeda Galaxy": "안드로메다 은하", "Triangulum Galaxy": "삼각형자리 은하", "Whirlpool Galaxy": "소용돌이 은하", "Sombrero Galaxy": "솜브레로 은하",
  "Pinwheel Galaxy": "바람개비 은하", "Southern Pinwheel Galaxy": "남쪽 바람개비 은하", "Cigar Galaxy": "시가 은하", "Bode's Galaxy": "보데 은하",
  "Black Eye Galaxy": "검은 눈 은하", "Sunflower Galaxy": "해바라기 은하", "Centaurus A": "센타우루스 A", "Virgo Galaxy": "처녀자리 은하 (M87)",
  "Sculptor Galaxy": "조각가자리 은하", "Silver Coin": "은화 은하", "Barnard's Galaxy": "바너드 은하", "Cartwheel Galaxy": "수레바퀴 은하",
  "Stephan's Quintet": "스테판의 오중주", "Fornax A": "화로자리 A", "Needle Galaxy": "바늘 은하", "Leo Triplet": "사자자리 삼중주",
  "Antennae Galaxies": "더듬이 은하", "Tadpole Galaxy": "올챙이 은하", "Sculptor Filament": "조각가자리 필라멘트",
};
function galName(g: Galaxy): string {
  const common = GAL_KO[g.common] ?? g.common;
  if (common && g.messier && !common.includes("M" + g.messier)) return common + " (M" + g.messier + ")";
  if (common) return common;
  if (g.messier) return "M" + g.messier;
  return g.id.replace(/^(NGC|IC)0*/, "$1 ");
}
function hash01(s: string): number {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619) >>> 0;
  return h / 4294967296;
}

/** 원반의 두 축 [pc]: 하늘의 위치각 PA와 축비 q(경사각 i = acos q)로 원반면을 3차원에 세움 */
function diskAxes(e: GalEntry): [number[], number[]] {
  const R = e.R, g = e.g;
  if (!g || g.q == null || g.pa == null) {
    const h = hash01(e.name), u = 2 * Math.PI * h, v = Math.acos(2 * hash01(e.name + "v") - 1);
    const n = [Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)];
    const a = norm(cross(n, Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), b = cross(n, a);
    return [a.map((x) => x * R), b.map((x) => x * R * (e.type === 3 ? 0.8 : 1))];
  }
  const ra = g.ra * Math.PI / 180, dec = g.dec * Math.PI / 180, pa = g.pa * Math.PI / 180;
  const rhat = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const east = [-Math.sin(ra), Math.cos(ra), 0], north = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const major = [0, 1, 2].map((k) => Math.cos(pa) * north[k] + Math.sin(pa) * east[k]);
  const minorSky = cross(rhat, major), inc = Math.acos(clamp(g.q, 0.1, 1));
  const minor = [0, 1, 2].map((k) => Math.cos(inc) * minorSky[k] + Math.sin(inc) * rhat[k]);
  const toGal = (v: number[]) => radecToGal(Math.atan2(v[1], v[0]) * 180 / Math.PI, Math.asin(clamp(v[2], -1, 1)) * 180 / Math.PI, 1);
  const a = toGal(major), b = toGal(minor);
  return [a.map((x) => x * R), b.map((x) => x * R * (e.type === 3 ? Math.max(g.q ?? 1, 0.4) : 1))];
}
function cross(a: number[], b: number[]): number[] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: number[]): number[] { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// ---------- 시점별 위치 ----------
function starPos(i: number): number[] {
  const b = data.stars.buf, o = STRIDE * i, t = now.dtLocal;
  return [b[o] + b[o + 5] * t, b[o + 1] + b[o + 6] * t, b[o + 2] + b[o + 7] * t];
}
function hostPos(k: number): number[] {
  const s = data.systems[k];
  if (s.hyg < 0) return [...s.pos];
  const b = data.stars.buf, o = STRIDE * s.hyg, t = now.dtLocal;
  return [s.pos[0] + b[o + 5] * t, s.pos[1] + b[o + 6] * t, s.pos[2] + b[o + 7] * t];
}
function galPos(e: GalEntry): number[] {
  const p = e.pos;
  switch (e.group) {
    case 0: return [p[0] * now.s + now.gcOff[0], p[1] * now.s + now.gcOff[1], p[2] * now.s];
    case 1: return [p[0] + now.gcOff[0], p[1] + now.gcOff[1], p[2]];
    case 2: return [p[0] + now.m31Off[0], p[1] + now.m31Off[1], p[2] + now.m31Off[2]];
    case 3: return [p[0] + now.lmcOff[0], p[1] + now.lmcOff[1], p[2] + now.lmcOff[2]];
    case 4: case 5: return [p[0] + now.gcOff[0], p[1] + now.gcOff[1], p[2] + now.gcOff[2]];
    default: return [...p];
  }
}
function galAlpha(e: GalEntry): number {
  return e.group === 2 ? 1 - now.milk : e.group === 3 ? 1 - now.lmcGone : e.group === 5 ? now.milk : 1;
}
function namedPos(o: Named): number[] {
  const p = o.pos;
  if (o.move === "gc") return [p[0] + now.gcOff[0], p[1] + now.gcOff[1], p[2]];
  if (o.move === "hubble") return [p[0] * now.s, p[1] * now.s, p[2] * now.s];
  return [...p];
}

// ---------- 층 표시 ----------
const layers = { stars: true, hosts: true, mw: true, named: true, gals: true, shells: true };
for (const k of new URLSearchParams(location.search).get("hide")?.split(",") ?? []) {
  if (k in layers) {
    (layers as Record<string, boolean>)[k] = false;
    const box = document.querySelector<HTMLInputElement>('#layerBox input[data-layer="' + k + '"]');
    if (box) box.checked = false;
  }
}
function mLimit(): number { return clamp(6.5 + 2.5 * Math.log10(Math.max(cam.r, 0.05)), 5.5, 30); }
function updateLayers(): void {
  const r = cam.r, mLim = mLimit(), visGal = TL.galaxyVisibility(time.dt);
  starMat.uniforms.uMLim.value = mLim;
  starMat.uniforms.uFade.value = layers.stars ? 1 - smooth(3e3, 3e4, r) : 0;
  starMat.uniforms.uDt.value = now.dtLocal;
  starMat.uniforms.uAge.value = Math.max(time.dt, 0);
  starMat.uniforms.uLocal.value = now.local;
  starMat.uniforms.uSunMag.value = now.sunMag;
  const sun = now.sun;
  if (sun.L > 0) { const c = starColor(bvFromT(sun.T)); starMat.uniforms.uSunCol.value.set(c[0], c[1], c[2]); }
  hostMat.uniforms.uRange.value = Math.max(r * 2.5, 3);
  hostMat.uniforms.uFade.value = layers.hosts ? (1 - smooth(4e3, 2e4, r)) * now.local : 0;
  hostMat.uniforms.uDt.value = now.dtLocal;
  galMat.uniforms.uMLim.value = mLim + 1.5;
  galMat.uniforms.uFade.value = layers.gals ? (0.35 + 0.65 * smooth(2e3, 3e4, r)) * visGal : 0;
  galMat.uniforms.uA.value = now.s;
  galMat.uniforms.uM31Off.value.set(now.m31Off[0], now.m31Off[1], now.m31Off[2]);
  galMat.uniforms.uLMCOff.value.set(now.lmcOff[0], now.lmcOff[1], now.lmcOff[2]);
  galMat.uniforms.uGcOff.value.set(now.gcOff[0], now.gcOff[1], now.gcOff[2]);
  galMat.uniforms.uMilk.value = now.milk;
  galMat.uniforms.uLmcGone.value = now.lmcGone;
  // 우리 은하: 밀코메다가 되면 원반이 사라짐. 빅뱅 쪽 과거(첫 은하 이전)에도 숨김
  const mwF = layers.mw ? smooth(150, 2500, r) * (1 - smooth(5e6, 6e7, r)) * (1 - 0.85 * now.milk) * visGal : 0;
  mwMat.uniforms.uFade.value = mwF; dustMat.uniforms.uFade.value = mwF * (1 - now.milk);
  // 좌표축은 돌지 않으므로 나선팔 무늬는 패턴 속도 Ω_p로 시계 방향 회전 (은하 중심의 위치 이동은 now.gc에 들어 있음)
  mwMat.uniforms.uOrigin.value.set(now.gc[0], now.gc[1], now.gc[2]);
  mwMat.uniforms.uRotZ.value = -OMEGA_P * time.dt;
  mwPts.visible = dustPts.visible = mwF > 0.01;
  starPts.visible = starMat.uniforms.uFade.value > 0.01;
  hostPts.visible = hostMat.uniforms.uFade.value > 0.01;
  galMesh.visible = galMat.uniforms.uFade.value > 0.01;
  for (const s of shells) {
    // 경계는 공동 거리라서 지금 기준. 다른 시점에서는 그 시점의 실제 거리로 늘이거나 줄임
    const k = Math.min(now.s, 1e12), u = (s.g.material as THREE.ShaderMaterial).uniforms, R = s.R * k;
    u.uK.value = k;
    u.uOpacity.value = layers.shells ? 0.4 * smooth(R * 0.02, R * 0.15, r) * (1 - smooth(R * 30, R * 300, r)) : 0;
    s.g.visible = u.uOpacity.value > 0.003 && s.ok;
  }
}
/** bvToTemp의 역함수 (이분법) */
function bvFromT(T: number): number {
  let lo = -0.4, hi = 2.0;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (bvToTemp(m) > T) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- 이름표 ----------
interface Cand { name: string; get: () => ArrayLike<number>; pri: number; cls: string }
const labelPool: HTMLDivElement[] = [];
let shown: { el: HTMLDivElement; c: Cand }[] = [];
const vtmp = new THREE.Vector3();
/** 태양 기준 위치 p (w를 주지 않으면 빛이 온 거리로) → 화면 좌표. 셰이더와 같은 4차원 변환을 거침 */
function project(p: ArrayLike<number>, w?: number): [number, number, number] | null {
  let q: [number, number, number];
  if (w === undefined) { const sn = seen(p); if (!sn.ok) return null; q = to4(p, sn.w, sn.S); } else q = to4(p, w);
  vtmp.set(q[0], q[1], q[2]).applyMatrix4(camera.matrixWorldInverse);
  const depth = -vtmp.z;
  if (depth <= 0) return null;
  vtmp.applyMatrix4(camera.projectionMatrix);
  if (Math.abs(vtmp.x) > 1.02 || Math.abs(vtmp.y) > 1.02) return null;
  return [(vtmp.x * 0.5 + 0.5) * W, (-vtmp.y * 0.5 + 0.5) * H, depth];
}
function dist3(a: ArrayLike<number>, b: ArrayLike<number>): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

function candidates(): Cand[] {
  const r = cam.r, out: Cand[] = [], mLim = mLimit(), dt = Math.max(time.dt, 0);
  if (now.fog > 0.9) return out;
  if (layers.stars && r < 3e3 && now.local > 0.3) {
    for (const s of data.stars.named) {
      if (aliveProbability(phys[s.i], dt) < 0.3) continue;
      const p = starPos(s.i), m = data.stars.buf[STRIDE * s.i + 3] + 5 * Math.log10(Math.max(dist3(p, camPos), 1e-6) / 10);
      if (m < mLim - 3) out.push({ name: starLabel(s.name), get: () => starPos(s.i), pri: 10 - m + (STAR_KO[s.name] ? 3 : 0), cls: "star" });
    }
  }
  if (r < 3e3 && now.sunMag < 40) out.push({ name: "태양", get: () => [0, 0, 0], pri: r < 50 ? 30 : 8, cls: "sun" });
  if (layers.hosts && r < 400 && now.local > 0.3) {
    data.systems.forEach((s, k) => {
      const p = hostPos(k), d = dist3(p, camPos);
      if (d < r * 2.2) out.push({ name: s.name, get: () => hostPos(k), pri: 6 + s.planets.length - Math.log10(d + 1), cls: "host" });
    });
  }
  if (layers.named) {
    for (const o of named) {
      const k = o.kind;
      const ok = k === "nebula" ? r > 2 && r < 4e3 && now.local > 0.3 : k === "globular" ? r > 800 && r < 3e5 : k === "cluster" ? r > 4e6 * Math.min(now.s, 1e9) && r < 2e9 * Math.min(now.s, 1e9) : k === "blackhole" ? (o.move === "hubble" ? r > 4e6 && r < 2e8 : o.move === "gc" ? r > 1e3 && r < 2e5 : r > 50 && r < 8e3 && now.local > 0.3) : r > 2e7 * Math.min(now.s, 1e9) && r < 5e9 * Math.min(now.s, 1e9);
      if (ok && TL.galaxyVisibility(time.dt) > 0.3) out.push({ name: o.name, get: () => namedPos(o), pri: k === "supercluster" ? 22 : k === "cluster" ? 18 : k === "blackhole" ? 16 : k === "void" ? 12 : 9, cls: k });
    }
  }
  if (layers.gals && r > 3e3 && TL.galaxyVisibility(time.dt) > 0.3) {
    for (const g of gals) {
      if (!(g.g?.messier || g.g?.common || g.o || g.group === 5) || galAlpha(g) < 0.3) continue;
      const p = galPos(g), d = dist3(p, camPos), m = g.absMag + 5 * Math.log10(Math.max(d, 1) / 10) + (g.group === 0 && now.s > 1 ? 10 * Math.log10(now.s) : 0);
      if (m < mLim - 1 && d < r * 8) out.push({ name: g.name, get: () => galPos(g), pri: 14 - m * 0.5 + (g.g?.messier ? 3 : 0) + (g.group === 5 ? 10 : 0), cls: g.o ? "sat" : "gal" });
    }
  }
  if (layers.mw && r > 4e3 && r < 3e6 && now.milk < 0.5) out.push({ name: "우리 은하 중심 (궁수자리 A*)", get: () => now.gc, pri: 25, cls: "gc" });
  if (layers.shells) for (const s of shells) if (s.g.visible) { const R = s.R * Math.min(now.s, 1e12); out.push({ name: s.name, get: () => [R * 0.7071, R * 0.7071, 0], pri: 20, cls: "shell" }); }
  return out;
}

function chooseLabels(): void {
  const cs = candidates().sort((a, b) => b.pri - a.pri), taken: number[][] = [];
  const next: Cand[] = [];
  for (const c of cs) {
    if (next.length >= 42) break;
    const s = project(c.get());
    if (!s) continue;
    let w = 16;
    for (const ch of c.name) w += ch.charCodeAt(0) > 0x2000 ? 12.5 : 7;
    if (taken.some(([x, y, ww]) => Math.abs(x - s[0]) < (w + ww) / 2 && Math.abs(y - s[1]) < 18)) continue;
    taken.push([s[0] + w / 2, s[1], w]);
    next.push(c);
  }
  while (labelPool.length < next.length) { const el = document.createElement("div"); el.className = "lbl"; labelsEl.appendChild(el); labelPool.push(el); }
  shown = next.map((c, i) => { const el = labelPool[i]; el.textContent = c.name; el.className = "lbl " + c.cls; el.style.display = "block"; return { el, c }; });
  for (let i = next.length; i < labelPool.length; i++) labelPool[i].style.display = "none";
}
function placeLabels(): void {
  for (const { el, c } of shown) {
    const s = project(c.get());
    if (!s) { el.style.display = "none"; continue; }
    el.style.display = "block";
    el.style.transform = "translate(" + s[0].toFixed(1) + "px," + s[1].toFixed(1) + "px)";
  }
  const sel = selected && mode === "map" ? project(selPos(selected)) : null;
  const ring = $("selRing");
  ring.hidden = !sel;
  if (sel) ring.style.transform = "translate(" + sel[0].toFixed(1) + "px," + sel[1].toFixed(1) + "px)";
}

// ---------- 고르기 ----------
type Sel =
  | { kind: "star"; i: number; name: string }
  | { kind: "sun"; name: string }
  | { kind: "host"; i: number; name: string }
  | { kind: "gal"; i: number; name: string }
  | { kind: "named"; k: number; name: string }
  | { kind: "mw"; name: string }
  | { kind: "body"; name: string };
let selected: Sel | null = null;
function selPos(s: Sel): number[] {
  switch (s.kind) {
    case "star": return starPos(s.i);
    case "host": return hostPos(s.i);
    case "gal": return galPos(gals[s.i]);
    case "named": return namedPos(named[s.k]);
    case "mw": return now.gc.slice();
    default: return [0, 0, 0];
  }
}

function pick(x: number, y: number): Sel | null {
  let best: Sel | null = null, bs = 16;
  const r = cam.r, mLim = mLimit(), dt = Math.max(time.dt, 0);
  const tryP = (pos: ArrayLike<number>, bonus: number, make: () => Sel) => {
    const s = project(pos);
    if (!s) return;
    const sc = Math.hypot(s[0] - x, s[1] - y) - bonus;
    if (sc < bs) { bs = sc; best = make(); }
  };
  if (layers.hosts && hostPts.visible && now.local > 0.3) data.systems.forEach((s, i) => { const p = hostPos(i); if (dist3(p, camPos) < r * 5) tryP(p, 4, () => ({ kind: "host", i, name: s.name })); });
  if (layers.stars && starPts.visible && now.local > 0.3) {
    const b = data.stars.buf;
    for (let i = 0; i < data.stars.n; i++) {
      const p = starPos(i), m = b[STRIDE * i + 3] + 5 * Math.log10(Math.max(dist3(p, camPos), 1e-6) / 10);
      if (m > mLim || aliveProbability(phys[i], dt) < 0.2) continue;
      tryP(p, (mLim - m) * 0.8, () => ({ kind: "star", i, name: starName(i) }));
    }
    if (now.sunMag < 40) tryP([0, 0, 0], 6, () => ({ kind: "sun", name: "태양" }));
  }
  if (layers.gals && galMesh.visible) gals.forEach((g, i) => {
    if (galAlpha(g) < 0.3) return;
    const p = galPos(g), d = dist3(p, camPos), m = g.absMag + 5 * Math.log10(Math.max(d, 1) / 10);
    if (m < mLim + 1.5) tryP(p, Math.min(10, g.R / d * W * 0.6), () => ({ kind: "gal", i, name: g.name }));
  });
  if (layers.named) named.forEach((o, k) => tryP(namedPos(o), 2, () => ({ kind: "named", k, name: o.name })));
  if (layers.mw && cam.r > 3e3) tryP(now.gc, 3, () => ({ kind: "mw", name: "우리 은하" }));
  return best;
}
const starNameIdx = new Map<number, string>();
function starName(i: number): string {
  const n = starNameIdx.get(i);
  if (n) return starLabel(n);
  const host = data.systems.find((s) => s.hyg === i);
  return host ? host.name : "HYG 별 #" + i;
}

// ---------- 정보 카드: 특징 + 이 시점의 예측 ----------
function row(k: string, v: string): string { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; }
function lbText(p: ArrayLike<number>): string { const [l, b] = galLB(p); return "l = " + l.toFixed(2) + "°, b = " + b.toFixed(2) + "°"; }
function fmtL(L: number): string { return L < 0.01 ? sci(L) : L < 1e4 ? L.toPrecision(3) : sci(L, 1); }
/** 카드: 원소 구성 (질량 비율 막대 + 층 구조) */
function compRows(c: Composition): string {
  const bulk = bulkComposition(c), top = bulk.slice(0, 7), lm = layerMasses(c);
  const pct = (f: number) => (f * 100 < 1 ? (f * 100).toFixed(1) : Math.round(f * 100)) + "%";
  const bar = '<span class="elbar">' + top.map((x) => '<i style="width:' + (x.f * 100).toFixed(2) + "%;background:rgb(" + ELEMENTS[x.el].color.map((v) => Math.round(v * 255)).join(",") + ')" title="' + ELEMENTS[x.el].ko + '"></i>').join("") + "</span>";
  return row("구성 원소 (질량)", top.map((x) => ELEMENTS[x.el].ko + " " + pct(x.f)).join(" · ") + bar)
    + row("층 구조 (안 → 밖)", c.layers.map((l, k) => l.name + " " + pct(lm[k])).join(" · ") + "<small>" + (c.note ? c.note + " " : "") + (c.src ? "근거: " + c.src : "") + "</small>");
}
let cardComp: { name: string; comp: Composition; M: number; R: number } | null = null;
/** 카드: 4차원 좌표 w와 그 빛이 떠날 때의 모습 */
function row4(pos: number[]): string {
  if (!space4.seeT) return row("4차원 좌표 w", "0<small>공간 = 시간 조건이 꺼져 있어 모든 천체가 같은 순간에 놓임</small>");
  const sn = seen(pos);
  if (!sn.ok) return row("4차원 좌표 w", "없음<small>입자 지평선 밖: 이 시점에는 아직 빛이 오지 않아 보이지 않음</small>");
  const yrs = -sn.w / LY_PC, ago = yrs < 1 ? (yrs * 365.25).toPrecision(3) + "일" : fmtYearsShort(yrs);
  const d = Math.hypot(pos[0], pos[1], pos[2]);
  return row("4차원 좌표 w", "−" + fmtPc(-sn.w) + "<small>보이는 빛이 " + ago + " 전에 떠남 (빅뱅 뒤 " + fmtYearsShort(Math.max(cone.age - yrs, 0)) + ")</small>")
    + (sn.ratio < 0.9999 && space4.expand ? row("빛이 떠날 때 거리", fmtPc(d * sn.ratio) + "<small>그때 우주 크기는 지금의 " + (sn.ratio < 0.01 ? sn.ratio.toExponential(1) : sn.ratio.toFixed(3)) + "배 (z = " + (1 / sn.ratio - 1).toPrecision(3) + ")</small>") : "");
}
function lifeText(y: number): string { return !isFinite(y) ? "끝나지 않음" : fmtYearsShort(y); }

function starCard(i: number): { sub: string; rows: string; fut: string } {
  const b = data.stars.buf, o = STRIDE * i, p = phys[i], nm = data.stars.named.find((x) => x.i === i), hasRV = b[o + 8] >= 16;
  const v = Math.hypot(b[o + 5], b[o + 6], b[o + 7]) * 977792;
  let rows = row("분류", (nm?.spect ? nm.spect + " · " : "") + p.spectral + "형 · " + LUM_NAMES[p.lum])
    + row("표면 온도", Math.round(p.T).toLocaleString("ko-KR") + " K<small>색지수 B−V " + b[o + 4].toFixed(2) + "에서</small>")
    + row("광도 · 반지름", fmtL(p.L) + " L☉ · " + (p.R < 0.1 ? p.R.toFixed(3) : p.R.toPrecision(3)) + " R☉<small>절대등급 " + b[o + 3].toFixed(2) + ", 복사 보정 후</small>")
    + row("질량 (추정)", p.M.toPrecision(2) + " M☉<small>질량–광도 관계</small>")
    + row("우주 공간 속도", v.toFixed(1) + " km/s<small>" + (hasRV ? "고유 운동 + 시선 속도" : "시선 속도 없음 (고유 운동만)") + "</small>");
  if (nm) rows += row("겉보기 등급 (지금 지구)", nm.mag.toFixed(2));
  const dtF = Math.max(time.dt, 0), P = aliveProbability(p, dtF), pNow = starPos(i), d = Math.hypot(pNow[0], pNow[1], pNow[2]);
  let fut = row("주계열 수명", lifeText(p.tMS)) + row("최후", p.fate);
  if (time.dt !== 0) fut += row(fmtDt(time.dt) + " 위치", fmtPc(d) + (Math.abs(time.dt) > 1e7 ? "<small>천만 년 너머는 은하 궤도 때문에 직선 예측이 맞지 않음</small>" : ""))
    + row("그때 살아 있을 확률", Math.round(P * 100) + "%<small>나이를 모르므로 남은 수명이 고르게 퍼져 있다고 봄</small>");
  if (hasRV) {
    const v2 = b[o + 5] ** 2 + b[o + 6] ** 2 + b[o + 7] ** 2, tm = -(b[o] * b[o + 5] + b[o + 1] * b[o + 6] + b[o + 2] * b[o + 7]) / v2;
    const dm = Math.hypot(b[o] + b[o + 5] * tm, b[o + 1] + b[o + 6] * tm, b[o + 2] + b[o + 7] * tm);
    if (Math.abs(tm) < 2e7) fut += row("태양에 가장 가까워지는 때", fmtDt(tm) + "<small>그때 거리 " + fmtPc(dm) + "</small>");
  }
  return { sub: p.spectral + "형 " + LUM_NAMES[p.lum], rows, fut };
}

function select(s: Sel | null): void {
  selected = s;
  hostMat.uniforms.uSelIdx.value = s?.kind === "host" ? s.i : -1;
  galMat.uniforms.uSelIdx.value = s?.kind === "gal" ? s.i : -1;
  refreshCard();
}
let cardKey = "";
function refreshCard(force = false): void {
  const s = selected, card = $("infoCard");
  if (!s) { card.hidden = true; return; }
  const key = JSON.stringify(s) + "|" + time.dt.toPrecision(3) + "|" + mode;
  if (!force && key === cardKey) return;
  cardKey = key;
  card.hidden = false;
  const pos = selPos(s), d = Math.hypot(pos[0], pos[1], pos[2]);
  let sub = "", rows = "", fut = "", text = "", canSystem = false;
  cardComp = null;
  const lt = d / LY_PC;
  const common = s.kind === "body" ? "" : row("태양에서 거리" + (time.dt ? " (그 시점)" : ""), fmtPc(d) + "<small>" + fmtPcUnit(d) + " · 빛으로 " + (lt < 1 ? (lt * 365.25).toPrecision(3) + "일" : fmtYearsShort(lt)) + "</small>") + (d > 0 ? row("은하 좌표", lbText(pos)) : "")
    + (d > 0 ? row4(pos) : "");
  if (s.kind === "sun") {
    sub = "G2V 주계열성 (지금)"; canSystem = true;
    const st = sunAt(time.dt / 1e9);
    rows = row("질량 · 반지름 (지금)", "1 M☉ (1.989 × 10³⁰ kg) · 1 R☉ (69.6만 km)") + row("표면 · 중심 온도", "5,772 K · 1,570만 K") + row("광도", "3.828 × 10²⁶ W") + row("나이", "45.7억 년") + compRows(BODY_COMP["태양"]) + row("은하 공전", "약 2억 1,500만 년에 한 바퀴 (233 km/s)");
    cardComp = { name: "태양", comp: BODY_COMP["태양"], M: 1.989e30, R: 6.957e8 };
    fut = row(fmtDt(time.dt) + "의 태양", st.phase) + row("광도 · 반지름", fmtL(st.L) + " L☉ · " + (st.R < 0.1 ? st.R.toFixed(4) : st.R.toPrecision(3)) + " R☉") + row("표면 온도 · 질량", Math.round(st.T).toLocaleString("ko-KR") + " K · " + st.M.toFixed(2) + " M☉");
    text = SUN_POS_NOTE + " 주계열 광도는 Gough (1981), 적색거성 이후는 Schröder & Smith (2008)의 진화 계산을 따릅니다.";
  } else if (s.kind === "star" || s.kind === "host") {
    const ps = s.kind === "host" ? data.systems[s.i] : data.systems.find((x) => x.hyg === s.i);
    const hi = s.kind === "star" ? s.i : ps && ps.hyg >= 0 ? ps.hyg : -1;
    if (hi >= 0) {
      const c = starCard(hi), ph = phys[hi];
      sub = c.sub; rows = c.rows + compRows(starComposition(ph.lum === 7 ? "wd" : ph.lum >= 1 && ph.lum <= 3 ? "giant" : "ms")); fut = c.fut;
    }
    if (ps) {
      canSystem = true;
      sub = ps.planets.length + "개 행성을 가진 별" + (sub ? " · " + sub : "");
      const st = ps.star;
      if (st.mass) rows += row("별 질량 · 반지름 (목록)", st.mass + " M☉" + (st.radius ? " · " + st.radius + " R☉" : ""));
      if (st.temp) rows += row("별 온도 (목록)", Math.round(st.temp).toLocaleString("ko-KR") + " K");
      if (st.feh != null) rows += row("금속량 [Fe/H]", st.feh.toFixed(2));
      rows += row("행성", ps.planets.map((p) => p.name.replace(ps.name, "").trim() || p.name).join(", "));
      const yrs = ps.planets.map((p) => p.year).filter((y): y is number => !!y);
      if (yrs.length) rows += row("처음 발견", Math.min(...yrs) + "년 · " + (ps.planets[0].method ?? ""));
      text = "Open Exoplanet Catalogue의 확인된 행성입니다. ‘행성계 보기’로 실제 궤도 자료로 만든 행성계에 들어갈 수 있습니다.";
    } else text = "HYG 별 목록 v4.1의 위치·밝기·색·속도로 계산했습니다.";
  } else if (s.kind === "gal") {
    const e = gals[s.i], g = e.g;
    sub = e.group === 5 ? "우리 은하와 안드로메다가 합쳐진 거대 타원은하 (예측)" : g ? hubbleName(g.hubble) + (g.hubble ? " (" + g.hubble + ")" : "") : e.o?.kind === "satellite" ? "우리 은하의 위성은하" : "국부 은하군 은하";
    if (g) {
      const t = hubbleType(g.hubble), ml = t === 3 ? 5 : t === 4 ? 3.5 : t === 1 ? 1.2 : 2.5, Lb = Math.pow(10, -0.4 * (e.absMag - 5.44)), mstar = ml * Lb;
      if (g.messier) rows += row("메시에 번호", "M" + g.messier);
      rows += row("목록 이름", g.id) + row("지름 (D25)", g.sizeKpc ? g.sizeKpc.toPrecision(3) + " kpc<small>" + fmtPc(g.sizeKpc * 1000) + "</small>" : "—");
      if (g.bmag != null) rows += row("별 질량 (추정)", sci(mstar, 1) + " M☉<small>B 절대등급 " + e.absMag.toFixed(1) + " × 질량/광도비 " + ml + "</small>") + row("암흑물질 헤일로 (추정)", sci(Math.pow(10, mosterHalo(Math.log10(mstar))), 1) + " M☉<small>Moster 외 2013</small>");
      if (g.cz != null) rows += row("시선 속도 cz", Math.round(g.cz).toLocaleString("ko-KR") + " km/s");
      if (e.group === 0) {
        const z = zFromComoving(e.g!.dMpc), tlb = TL.t0 - core.tOf(-Math.log10(1 + z));
        rows += row("빛이 떠난 때", fmtYearsShort(tlb / YEAR_S) + " 전<small>z = " + z.toFixed(4) + "</small>");
        const dNow = e.g!.dMpc * 1e6, eh = shells.find((x) => x.name === "우주 사건 지평선")!.R;
        fut = row(fmtDt(time.dt) + " 실제 거리", fmtPc(dNow * now.s) + "<small>척도 인자 a = " + (now.s < 1e4 ? now.s.toPrecision(3) : sci(now.s)) + "</small>")
          + row("그때 후퇴 속도", (Math.abs(TL.H(time.dt)) * dNow * now.s * 3.0857e13 < 1e6 ? (TL.H(time.dt) * dNow * now.s * 3.0857e13).toFixed(0) + " km/s" : sci(TL.H(time.dt) * dNow * now.s * 3.0857e13) + " km/s") + "<small>v = H·d</small>")
          + row("우주 사건 지평선", dNow > eh ? "바깥: 지금 보낸 빛은 영원히 닿지 않음" : "안쪽: 지금 보낸 빛이 언젠가 닿음");
      }
      rows += row("거리 근거", g.src === "lit" ? "세페이드·TRGB 등 문헌 거리" : g.src === "virgo" ? "처녀자리 은하단 평균 거리 (16.5 Mpc)" : g.src === "fornax" ? "화로자리 은하단 평균 거리" : "적색편이 → 공동 거리 (특이 속도 무시)");
      text = "OpenNGC 목록의 은하입니다. 판의 크기와 기울기는 실제 지름·위치각·축비로 만들었고, 무늬는 허블 형태에 맞춘 그림입니다.";
    } else if (e.o) { rows += row("지름", (e.o.size ?? 1.5) + " kpc (대략)"); text = e.o.note; }
    if (e.group === 2 && fc) fut += row("우리 은하와 병합", fc.lg.best.mergeM31 !== null ? fmtYearsShort(fc.lg.best.mergeM31 * 1e9) + " 뒤 (최선 추정)" : "140억 년 안에 없음") + row("병합 확률", "50억 년 안 " + Math.round(fc.lg.pMerge5 * 100) + "% · 100억 년 안 " + Math.round(fc.lg.pMerge10 * 100) + "%<small>" + fc.lg.runs + "번 몬테카를로 (질량·접선 속도·거리 불확실성)</small>");
    if (e.group === 3 && fc) fut += row("우리 은하와 병합", fc.lg.best.mergeLMC !== null ? fmtYearsShort(fc.lg.best.mergeLMC * 1e9) + " 뒤 (최선 추정)" : "—");
    if (e.group === 5) text = "우리 은하와 안드로메다가 합쳐진 뒤 수억 년에 걸쳐 원반이 흐트러지고 거대한 타원은하가 된다고 봅니다 (Cox & Loeb 2008). 이 시뮬레이터의 국부 은하군 궤도 계산이 병합한 뒤에만 나타납니다.";
  } else if (s.kind === "named") {
    const o = named[s.k];
    if (o.bh) {
      const bh = o.bh, rs = schwarzschildKm(bh.mass);
      sub = "블랙홀";
      rows = row("질량", (bh.mass < 1e3 ? bh.mass + " M☉" : sci(bh.mass, 2) + " M☉")) + row("사건지평선 반지름", rs < 1e6 ? rs.toPrecision(3) + " km" : (rs / 1.496e8).toPrecision(3) + " AU") + row("그림자 지름", "약 " + (rs * 2 * 2.6 < 1e6 ? (rs * 5.2).toPrecision(3) + " km" : (rs * 5.2 / 1.496e8).toPrecision(3) + " AU") + "<small>사건지평선의 약 2.6배</small>");
      fut = row("호킹 복사로 증발", fmtYearsShort(hawkingYears(bh.mass)) + " 뒤<small>t ≈ 2.1 × 10⁶⁷ (M/M☉)³ 년</small>");
      text = bh.note;
    } else {
      const ob = o.o!;
      sub = { satellite: "위성은하", localgroup: "국부 은하군", globular: "구상성단", nebula: "성운·성단", cluster: "은하단", supercluster: "초은하단", void: "우주 공동" }[ob.kind];
      if (ob.z) rows += row("적색편이", "z = " + ob.z);
      if (o.move === "hubble" && time.dt) fut = row(fmtDt(time.dt) + " 실제 거리", fmtPc(Math.hypot(o.pos[0], o.pos[1], o.pos[2]) * now.s));
      text = ob.note;
    }
  } else if (s.kind === "mw") {
    sub = now.milk > 0.5 ? "안드로메다와 합쳐짐 (밀코메다)" : "막대나선은하 (SBbc)";
    rows = row("별 질량", "약 6 × 10¹⁰ M☉ (Licquia & Newman 2015)") + row("전체 질량", "약 1 × 10¹² M☉ (암흑물질 포함)") + row("원반 지름 · 두께", "약 30 kpc · 0.3 kpc") + row("별의 수", "약 1,000억~4,000억 개") + row("나선팔", "직각자–바깥, 방패–센타우루스, 궁수–용골, 페르세우스, 국부(오리온) 팔") + row("중심 블랙홀", "궁수자리 A*, 430만 M☉");
    if (fc) fut = row("대마젤란은하 병합", fc.lg.best.mergeLMC !== null ? fmtYearsShort(fc.lg.best.mergeLMC * 1e9) + " 뒤" : "—") + row("안드로메다 병합", fc.lg.best.mergeM31 !== null ? fmtYearsShort(fc.lg.best.mergeM31 * 1e9) + " 뒤 (확률 100억 년 안 " + Math.round(fc.lg.pMerge10 * 100) + "%)" : "—");
    text = "나선팔 위치는 Reid 외 (2019)를 단순화한 모형이고, 시간이 흐르면 패턴 속도(28.2 km/s/kpc)로 돕니다. 지도는 태양 기준이라 은하 중심이 2억 1,500만 년마다 태양 둘레를 한 바퀴 도는 것처럼 보입니다.";
  } else if (s.kind === "body") {
    const f = FACTS[s.name], pl = sys.planet(s.name), dG = time.dt / 1e9;
    sub = pl ? pl.type : "위성";
    if (f) {
      rows = row("질량", f.mass >= 0.01 ? f.mass + " × 10²⁴ kg" : sci(f.mass * 1e24, 2) + " kg") + row("반지름 · 밀도", f.radius.toLocaleString("ko-KR") + " km · " + f.density.toLocaleString("ko-KR") + " kg/m³")
        + row("표면 중력 · 탈출 속도", f.gravity + " m/s² · " + f.escape + " km/s") + row("자전 · 자전축 기울기", (f.rotation < 0 ? "역행 " : "") + (Math.abs(f.rotation) > 48 ? (Math.abs(f.rotation) / 24).toFixed(1) + "일" : Math.abs(f.rotation).toFixed(2) + "시간") + " · " + f.tilt + "°")
        + row("평균 온도" + (f.pressure !== null ? " · 기압" : ""), f.temp + " °C" + (f.pressure !== null ? " · " + (f.pressure < 0.01 ? sci(f.pressure, 1) : f.pressure) + " bar" : "")) + row("대기", f.atmosphere) + row("자기장", f.magnetic)
        + (f.rings ? row("고리", f.rings) : "") + (f.moons ? row("알려진 위성", f.moons + "개") : "");
      text = f.features;
    }
    const comp = BODY_COMP[s.name] ?? (pl && !sysIsSolar ? exoComposition(pl.R) : undefined);
    if (comp) {
      rows += compRows(comp);
      const M = f ? f.mass * 1e24 : (pl?.mass ?? Math.pow(pl!.R, 2.06)) * 5.972e24, R = f ? f.radius * 1e3 : pl!.R * 6.371e6;
      cardComp = { name: s.name, comp, M, R };
    }
    if (pl) {
      const st = sunAt(dG), a = pl.a, S = st.L / (a * a);
      rows += row("궤도 (그 시점)", "a = " + a.toPrecision(4) + " AU · e = " + pl.e.toFixed(4) + " · i = " + pl.i.toFixed(2) + "°" + (Math.abs(time.dt) > 10 && Math.abs(time.dt) <= SECULAR_LIMIT_YEARS ? "<small>라플라스–라그랑주 영년 섭동</small>" : ""));
      fut = row(fmtDt(time.dt) + " 받는 햇빛", (S < 0.01 ? sci(S, 1) : S.toPrecision(3)) + " × 지금 지구<small>태양 광도 " + fmtL(st.L) + " L☉</small>") + row("평형 온도", Math.round(255 * Math.pow(S, 0.25) - 273) + " °C<small>반사율 0.3 가정</small>");
      if (s.name === "지구") { const e = earthAt(dG); fut += row("지구 상태", e.status) + row("하루 길이 · 달 거리", dayLength(time.dt).toFixed(2) + "시간 · " + Math.round(moonDistance(time.dt)).toLocaleString("ko-KR") + " km"); }
      if (sys.bodies().find((b) => b.name === s.name)?.gone) fut += row("상태", "부푼 태양에 삼켜짐");
    } else if (s.name === "달") fut = row(fmtDt(time.dt) + " 거리", Math.round(moonDistance(time.dt)).toLocaleString("ko-KR") + " km<small>조석 후퇴 3.82 cm/년, da/dt ∝ a^(−11/2)</small>") + row("개기일식", totalEclipsePossible(time.dt).possible ? "가능" : "불가능 (달이 태양을 다 가리지 못함)");
  }
  $("icTitle").textContent = s.name;
  $("icSub").textContent = sub;
  $("icRows").innerHTML = common + rows;
  $("icFuture").innerHTML = fut;
  $("icFutureBox").hidden = !fut;
  $("icText").textContent = text;
  $("icSystem").hidden = !canSystem || mode === "system";
  $("icPixel").hidden = !cardComp || mode === "impact";
  $("flyBtn").hidden = s.kind === "body";
}
function mosterHalo(lmStar: number): number {
  const M1 = 11.59, Nn = 0.0351, be = 1.376, ga = 0.608;
  const f = (lh: number) => { const r = Math.pow(10, lh - M1); return Math.log10(2 * Nn * Math.pow(10, lh) / (Math.pow(r, -be) + Math.pow(r, ga))) - lmStar; };
  let lo = 9, hi = 16;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
function zFromComoving(dMpc: number): number {
  let lo = 0, hi = 2;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (core.comovingDistance(m) > dMpc) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
function flyToSel(s: Sel): void {
  const get = () => selPos(s);
  if (s.kind === "gal") return flyTo(get(), Math.max(gals[s.i].R * 2.2, 50), s.name, { get });
  if (s.kind === "named") {
    const k = named[s.k].kind;
    return flyTo(get(), k === "globular" ? 60 : k === "nebula" ? 25 : k === "blackhole" ? 30 : k === "cluster" ? 1.2e7 : k === "void" ? 6e7 : 8e7, s.name, { get });
  }
  if (s.kind === "mw") return flyTo(get(), 4.5e4, "우리 은하", { phi: 0.35, get });
  if (s.kind === "body") return;
  return flyTo(get(), 0.04, s.name, { get });
}

// ---------- 픽셀 충돌 ----------
// 같은 화면·같은 시간축 안의 한 장면: 사건 목록이나 천체 카드에서 들어가고, 돌아가면 지도·행성계로 이어진다.
const imp = new ImpactView();
let impBack: "map" | "system" = "map", impScene: Scene | null = null, impMake: ((q: number) => ImpactSetup) | null = null, impQ = 0;
function enterImpact(make: (q: number) => ImpactSetup, scene: Scene | null, title: string): void {
  impMake = make; impScene = scene;
  if (mode !== "impact") impBack = mode;
  $("fade").classList.add("on");
  setTimeout(() => {
    mode = "impact";
    labelsEl.hidden = true; sys.hideLabels(); $("selRing").hidden = true;
    $("mapControls").hidden = true; $("sysControls").hidden = true; $("impControls").hidden = false;
    $("impCard").hidden = false; $("infoCard").hidden = true; $("sysCard").hidden = true;
    const setup = make(impQ);
    imp.start(setup);
    imp.mode = 0; imp.cut = !!setup.still;
    syncImpUi();
    $("impFollow").querySelector<HTMLElement>('[data-fl="-2"]')!.hidden = !setup.fixed;
    setFollowChip(setup.follow);
    setText("ipTitle", title);
    setText("ipWhen", scene ? scene.when : setup.still ? "실제 층 구조와 원소 비율로 쌓은 픽셀 천체" : "가상 충돌");
    setText("ipText", scene ? scene.text : setup.still ? "픽셀 하나는 그 층의 원소 비율에 따라 뽑은 원소 덩어리입니다. ‘원소’ 색으로 바꾸면 핵의 철·니켈, 맨틀의 산소·마그네슘·규소, 얼음의 수소·산소가 보입니다." : "두 천체를 같은 크기의 픽셀로 쌓아 정한 속력과 각도로 부딪칩니다. 충돌 속력이 탈출 속도에 가까우면 대부분 다시 합쳐지고, 훨씬 빠르면 산산이 흩어집니다.");
    setText("ipSrc", scene ? "근거: " + scene.src : "질량·반지름: NASA 행성 자료표 · 층 구조: 원소 구성 모형의 근거 문헌");
    if (scene?.years !== undefined) setTime(scene.years);
    setTimeout(() => $("fade").classList.remove("on"), 60);
  }, 320);
}
function exitImpact(): void {
  $("fade").classList.add("on");
  setTimeout(() => {
    imp.stop();
    mode = impBack;
    $("impControls").hidden = true; $("impCard").hidden = true;
    if (mode === "map") { labelsEl.hidden = false; $("mapControls").hidden = false; }
    else { $("sysControls").hidden = false; $("sysCard").hidden = false; }
    refreshCard(true);
    setTimeout(() => $("fade").classList.remove("on"), 60);
  }, 320);
}
function setFollowChip(f: number): void { $("impFollow").querySelectorAll<HTMLElement>("[data-fl]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.fl! === f))); }
function syncImpUi(): void {
  $("impMode").querySelectorAll<HTMLElement>("[data-cm]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.cm! === imp.mode)));
  $("impCut").setAttribute("aria-pressed", String(imp.cut));
  $("impQ").querySelectorAll<HTMLElement>("[data-q]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.q! === impQ)));
  const still = !!imp.info.setup?.still;
  $("impPlay").hidden = still;
  $("impPlay").textContent = imp.info.running ? "일시정지" : imp.info.done ? "더 계속하기" : "계속";
}
const fmtHours = (t: number) => t < 3600 ? Math.round(t / 60) + "분" : Math.floor(t / 3600) + "시간 " + Math.round((t % 3600) / 60) + "분";
/** 분석 카드 */
function refreshImpactCard(): void {
  const I = imp.info, a = I.a, st = I.setup;
  if (!st) return;
  syncImpUi();
  const pct = (f: number) => (f * 100 < 0.1 && f > 0 ? (f * 100).toFixed(2) : (f * 100).toFixed(1)) + "%";
  const elList = (l: { el: string; f: number }[]) => l.slice(0, 6).map((x) => ELEMENTS[x.el as keyof typeof ELEMENTS].ko + " " + pct(x.f)).join(" · ");
  let h = row("픽셀", I.n.toLocaleString("ko-KR") + "개<small>" + st.bodies.map((b) => b.name).join(" + ") + (st.fixed ? " · " + st.fixed.name + "(고정)" : "") + "</small>");
  if (I.progress) h += row("상태", I.progress);
  if (!st.still) h += row("경과 시간", fmtHours(I.t) + " / " + fmtHours(st.duration) + (I.dt ? "<small>계산 간격 " + I.dt.toFixed(I.dt < 10 ? 1 : 0) + "초</small>" : ""));
  if (a && !st.still) {
    if (st.fixed) {
      h += row(st.fixed.name + " 둘레를 도는 조각 (고리)", pct(a.disk)) + row(st.fixed.name + "에 떨어짐", pct(a.absorbed)) + row("튀어나감", pct(a.escape))
        + row("덩어리 수 (픽셀 5개 이상)", String(a.clumps) + (st.key === "sl9" ? "<small>관측: 조각 21개 (해상도가 낮으면 적게 나옴)</small>" : ""));
      if (a.disk > 0) h += row("고리의 원소", elList(a.diskEl));
    } else if (I.contact) {
      h += row("하나로 합쳐진 행성", pct(a.planet)) + row("행성 둘레 원반", pct(a.disk) + "<small>달 질량의 " + a.diskLunar.toFixed(2) + "배</small>") + row("튀어나가 탈출", pct(a.escape));
      if (a.disk > 0) {
        h += row("원반 물질의 출처", "부딪친 천체(" + st.bodies[1].name + ")에서 " + pct(a.diskFromImpactor) + (st.key === "theia" ? "<small>표준 모형: 70–90% (Canup 2004)</small>" : ""));
        h += row("철 비율: 원반 · 행성", pct(a.diskFe) + " · " + pct(a.planetFe) + (st.key === "theia" ? "<small>달은 철이 적음 (철 핵 질량 1–2%)</small>" : ""));
        h += row("원반의 원소", elList(a.diskEl));
      }
      if (a.escape > 0.001) h += row("탈출한 물질의 원소", elList(a.escEl));
    } else h += row("상태", "다가오는 중 (아직 닿지 않음)");
    h += row("충돌로 1000 K 넘게 뜨거워진 질량", pct(a.hot)) + row("가장 뜨거운 픽셀", a.Tmax > 2e4 ? "2만 K 넘음<small>이 모형은 증발·복사를 넣지 않아 실제보다 높게 나옴</small>" : Math.round(a.Tmax).toLocaleString("ko-KR") + " K");
  }
  if (st.still && st.bodies[0]) h += compRows(st.bodies[0].comp);
  setText("ipRows", h, true);
  // 원소 범례
  setText("ipLegend", imp.mode === 1 ? I.elements.map((el) => '<span><i style="background:rgb(' + ELEMENTS[el as keyof typeof ELEMENTS].color.map((v) => Math.round(v * 255)).join(",") + ')"></i>' + ELEMENTS[el as keyof typeof ELEMENTS].ko + "</span>").join("")
    : imp.mode === 0 ? I.layers.map((l) => '<span><i style="background:rgb(' + l.color.map((v) => Math.round(v * 255)).join(",") + ')"></i>' + (st.bodies.length > 1 ? st.bodies[l.body].name + " " : "") + l.name + "</span>").join("")
    : imp.mode === 3 ? st.bodies.map((b, k) => '<span><i style="background:' + ["#59a6ff", "#ff8c40", "#99e666"][k % 3] + '"></i>' + b.name + "</span>").join("")
    : '<span><i style="background:#0d1459"></i>차가움</span><span><i style="background:#e6261a"></i>2000 K</span><span><i style="background:#ffd933"></i>5000 K</span><span><i style="background:#fff"></i>2만 K</span>', true);
}
imp.onChange = refreshImpactCard;
// 시나리오 단추와 직접 고르기
SCENES.forEach((sc) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip";
  b.innerHTML = sc.label + "<small>" + sc.when + "</small>";
  b.addEventListener("click", () => enterImpact(sc.make, sc, sc.label));
  $("impScenes").appendChild(b);
});
for (const id of ["cuA", "cuB"]) {
  const sel = $<HTMLSelectElement>(id);
  for (const nm of PICKABLE) { const o = document.createElement("option"); o.value = nm; o.textContent = nm; sel.appendChild(o); }
}
$<HTMLSelectElement>("cuA").value = "지구"; $<HTMLSelectElement>("cuB").value = "달";
$<HTMLInputElement>("cuV").addEventListener("input", (e) => { const v = +(e.currentTarget as HTMLInputElement).value; setText("cuVo", v === 0 ? "탈출 속도" : v + " km/s"); });
$<HTMLInputElement>("cuAng").addEventListener("input", (e) => setText("cuAngO", (e.currentTarget as HTMLInputElement).value + "°"));
$("cuGo").addEventListener("click", () => {
  const a = $<HTMLSelectElement>("cuA").value, b = $<HTMLSelectElement>("cuB").value, v = +$<HTMLInputElement>("cuV").value, ang = +$<HTMLInputElement>("cuAng").value;
  if (a === b) { setText("cuVo", "다른 천체를 고르세요"); return; }
  enterImpact((q) => customScene(a, b, v, ang, q), null, a + " × " + b + " (" + (v ? v + " km/s" : "탈출 속도") + ", " + ang + "°)");
});
$("impBack").addEventListener("click", exitImpact);
$("impPlay").addEventListener("click", () => { if (imp.info.running) imp.pause(); else imp.resume(); });
$("impMode").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-cm]"); if (!b) return; imp.mode = +b.dataset.cm! as ColorMode; refreshImpactCard(); });
$("impCut").addEventListener("click", () => { imp.cut = !imp.cut; syncImpUi(); });
$("impFollow").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-fl]"); if (!b) return; imp.setFollow(+b.dataset.fl!); setFollowChip(+b.dataset.fl!); });
$("impQ").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-q]");
  if (!b || !impMake) return;
  impQ = +b.dataset.q!;
  const st = impMake(impQ);
  imp.start(st); imp.cut = !!st.still; setFollowChip(st.follow); syncImpUi();
});
$("icPixel").addEventListener("click", () => { const c = cardComp; if (c) enterImpact((q) => stillBody(c.name, c.comp, c.M, c.R, q), null, c.name + " — 픽셀 단면"); });
$("evImpact").addEventListener("click", () => { const k = $("evImpact").dataset.scene, sc = SCENES.find((x) => x.key === k); if (sc) enterImpact(sc.make, sc, sc.label); });

// ---------- 실시간 우주 정보 ----------
let LIVE: { live: Live; lit: Literature } = { live: { generated: "", solar: {}, neo: {}, exoplanets: {}, satellites: [], horizons: { pos: {} }, papers: { checked: [], accepted: [], pending: [] }, sources: [] }, lit: { checked: "", measurements: [] } };
let liveDirect: { at: Date; names: string[] } | null = null;
const liveAdded = new Map<string, string>();
const MON: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
/** JPL CAD 날짜 "2026-Nov-05 12:34" → Date */
function cadDate(s: string): Date { const m = /(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})/.exec(s); return m ? new Date(Date.UTC(+m[1], MON[m[2]] ?? 0, +m[3], +m[4], +m[5])) : new Date(s); }
const yearsFromNow = (d: Date) => (d.getTime() - Date.now()) / (365.25 * 864e5);
const LD_KM = 384400, AU_KM = 1.495978707e8;
/** NASA 외계행성 기록에서 최근 등록된 행성을 지도에 더함 (이미 있는 행성은 건너뜀) */
function mergeExoplanets(rows: ExoRow[]): number {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byName = new Map(data.systems.map((sy) => [norm(sy.name), sy]));
  const known = new Set(data.systems.flatMap((sy) => sy.planets.map((p) => norm(p.name))));
  let added = 0;
  for (const r of rows) {
    if (known.has(norm(r.pl_name)) || !(r.sy_dist > 0)) continue;
    let sy = byName.get(norm(r.hostname));
    if (!sy) {
      sy = { name: r.hostname, pos: radecToGal(r.ra, r.dec, r.sy_dist) as [number, number, number], dist: r.sy_dist, hyg: -1, star: { mass: r.st_mass, radius: r.st_rad, temp: r.st_teff, feh: r.st_met, spect: r.st_spectype, vmag: r.sy_vmag }, planets: [] };
      data.systems.push(sy); byName.set(norm(r.hostname), sy);
    }
    sy.planets.push({ name: r.pl_name, mass: r.pl_bmassj, radius: r.pl_radj ?? (r.pl_rade ? r.pl_rade / 11.209 : null), period: r.pl_orbper, a: r.pl_orbsmax, e: r.pl_orbeccen, year: r.disc_year, method: r.discoverymethod, temp: r.pl_eqt });
    known.add(norm(r.pl_name)); liveAdded.set(r.pl_name, r.releasedate); added++;
  }
  return added;
}
/** 실시간 자료에서 온 사건: 검증된 논문의 사건 + 1년 안 가까운 소행성 접근 */
function liveEvents(): TimedEvent[] {
  const out: TimedEvent[] = [];
  for (const m of LIVE.lit.measurements) if (m.event && m.status === "accepted") out.push({ years: yearsFromNow(new Date(m.event.date + "T12:00:00Z")), label: m.event.label, detail: m.event.detail + " (" + (m.journal ?? "") + ")", scale: "earth" });
  for (const a of (LIVE.live.neo.approaches ?? []).filter((x) => x.distAU * AU_KM < 2 * LD_KM).slice(0, 8)) {
    const D = a.diameter ? a.diameter * 1000 : a.H !== null ? diameterFromH(a.H) : null;
    out.push({ years: yearsFromNow(cadDate(a.date)), label: "소행성 " + a.name.replace(/^\(|\)$/g, "") + "이 달 거리의 " + (a.distAU * AU_KM / LD_KM).toFixed(2) + "배까지 접근", detail: "JPL 근접 접근 자료 (실시간 수집). 상대 속도 " + a.vRel.toFixed(1) + " km/s" + (D ? ", 지름 약 " + (D < 1000 ? Math.round(D) + " m" : (D / 1000).toFixed(1) + " km") : "") + ". 지구에 닿지 않습니다.", scale: "earth" });
  }
  return out;
}
function withLive(ev: TimedEvent[]): TimedEvent[] { return [...ev.filter((e) => !e.label.startsWith("소행성 ") || e.impact), ...liveEvents()].sort((a, b) => a.years - b.years); }
/** 실시간 인공위성 궤도 요소를 행성계 장면의 위성 목록에 반영 */
function liveSatList(): [string, number, number, number, string, number?, number?][] {
  const list: [string, number, number, number, string, number?, number?][] = SATELLITES_EARTH.map((x) => [...x]);
  const nowDays = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 864e5;
  for (const s of LIVE.live.satellites) {
    const st = satNow(s, new Date()), note = "실시간 궤도 요소 (CelesTrak, 기준 " + s.epoch.slice(0, 16).replace("T", " ") + " UTC, " + st.ageDays.toFixed(1) + "일 전)";
    const k = list.findIndex((x) => x[0] === s.name);
    const item: [string, number, number, number, string, number, number] = [s.name, Math.round(st.alt), +s.i.toFixed(2), +st.periodMin.toFixed(2), note, st.phase, nowDays];
    if (k >= 0) list[k] = item; else list.splice(2, 0, item);
  }
  return list;
}
/** 사이트의 케플러 모형으로 계산한 행성 위치를 JPL Horizons와 비교 (각 오차) */
function horizonsCheck(): { name: string; arcmin: number }[] {
  const H = LIVE.live.horizons;
  if (!H.jd) return [];
  const days = H.jd - 2451545.0, v = new THREE.Vector3(), out: { name: string; arcmin: number }[] = [];
  for (const p of solarSystem().planets) {
    const h = H.pos[p.name];
    if (!h) continue;
    orbitPos(p, days, v);
    const e = [v.x, -v.z, v.y], dot = e[0] * h[0] + e[1] * h[1] + e[2] * h[2], ang = Math.acos(clamp(dot / (Math.hypot(...e) * Math.hypot(...h)), -1, 1));
    out.push({ name: p.name, arcmin: ang * 180 / Math.PI * 60 });
  }
  return out;
}
function renderLive(): void {
  const L = LIVE.live, lit = LIVE.lit;
  const okN = L.sources.filter((x) => x.ok).length;
  setText("lvStamp", (L.generated ? "스냅샷 수집 " + L.generated.slice(0, 16).replace("T", " ") + " UTC (원천 " + okN + "/" + L.sources.length + " 성공, 몇 시간마다 자동 갱신)" : "아직 수집된 스냅샷이 없습니다 (배포할 때 GitHub Actions가 만듭니다)") + (liveDirect ? " · 브라우저에서 직접 갱신 " + liveDirect.at.toTimeString().slice(0, 5) + ": " + (liveDirect.names.join(", ") || "실패 (스냅샷 사용)") : ""));
  let h = "";
  const sol = L.solar;
  if (sol.monthly?.length) {
    const last = sol.monthly[sol.monthly.length - 1];
    h += row("태양 흑점수 (" + last[0] + ")", Math.round(last[1]) + " · F10.7 " + Math.round(last[3]) + " sfu" + (sol.kp ? "<small>지금 Kp " + sol.kp.value.toFixed(1) + " (" + kpStorm(sol.kp.value) + ")" + (sol.flares?.length ? " · 최근 7일 가장 센 플레어 " + [...sol.flares].sort((a, b) => flareRank(b.cls) - flareRank(a.cls))[0].cls : "") + "</small>" : ""));
    const fit = fitSolarCycle(sol.monthly);
    if (fit) {
      const nextYr = sol.predicted?.find((r) => r[0] >= new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 7));
      h += row("태양 활동 주기 25 예측", "극대 " + fit.label(fit.maxAt) + " (흑점수 " + Math.round(fit.maxR) + ") · 다음 극소 " + fit.label(fit.minAt) + "<small>관측 " + fit.nObs + "개월에 Hathaway 외 (1994) 주기 함수를 맞춤 (오차 rms " + fit.rms.toFixed(0) + ")" + (nextYr ? " · NOAA 1년 뒤 예측 흑점수 " + Math.round(nextYr[1]) : "") + "</small>");
    }
  }
  const ap = L.neo.approaches ?? [];
  if (ap.length) {
    const c = [...ap].sort((a, b) => a.distAU - b.distAU)[0];
    h += row("1년 안 가까운 소행성 접근", ap.length + "번 (0.05 AU 안)<small>가장 가까움: " + c.name + " · " + cadDate(c.date).toISOString().slice(0, 10) + " · 달 거리의 " + (c.distAU * AU_KM / LD_KM).toFixed(2) + "배 · " + c.vRel.toFixed(1) + " km/s</small>");
  }
  for (const r of (L.neo.risks ?? []).slice(0, 3)) {
    const D = r.diameter ? r.diameter * 1000 : diameterFromH(r.H), fx = impactEffects(D, r.v || 17);
    h += row("충돌 위험: " + r.name, "확률 1/" + Math.round(1 / Math.max(r.ip, 1e-12)).toLocaleString("ko-KR") + " (" + r.range + ")<small>지름 약 " + (D < 1000 ? Math.round(D) + " m" : (D / 1000).toFixed(1) + " km") + " · 토리노 " + r.ts + " · 부딪치면 " + (fx.E_Mt < 1 ? (fx.E_Mt * 1000).toPrecision(2) + " kt" : fx.E_Mt.toPrecision(2) + " Mt") + (fx.airburst ? " (대부분 공중 폭발)" : " · 충돌구 약 " + fx.craterKm!.toFixed(1) + " km") + "</small>");
  }
  if (L.exoplanets.count) h += row("확인된 외계행성 (NASA)", L.exoplanets.count.toLocaleString("ko-KR") + "개<small>지난 120일 새로 등록 " + (L.exoplanets.recent?.length ?? 0) + "개 → 지도에 없던 " + liveAdded.size + "개를 더함</small>");
  for (const s of L.satellites.slice(0, 2)) { const st = satNow(s, new Date()); h += row(s.name, "고도 약 " + Math.round(st.alt) + " km · " + st.periodMin.toFixed(1) + "분에 한 바퀴<small>CelesTrak 궤도 요소 (" + st.ageDays.toFixed(1) + "일 전 기준) · 행성계 장면의 지구 둘레에 반영</small>"); }
  const hc = horizonsCheck();
  if (hc.length) h += row("모형 검증 (JPL Horizons)", "행성 위치 각 오차 최대 " + Math.max(...hc.map((x) => x.arcmin)).toFixed(1) + "′<small>" + hc.map((x) => x.name + " " + x.arcmin.toFixed(1) + "′").join(" · ") + " (J2000 궤도 요소의 케플러 계산 대 JPL 수치 적분)</small>");
  const H0 = summarizeH0(lit.measurements, L.papers.accepted);
  if (H0.early.n && H0.late.n) h += row("허블 상수 (논문 종합)", "초기 우주 " + H0.early.mean.toFixed(2) + " ± " + H0.early.sigma.toFixed(2) + " · 가까운 우주 " + H0.late.mean.toFixed(2) + " ± " + H0.late.sigma.toFixed(2) + " km/s/Mpc<small>학술지에 실린 측정만 역분산 가중 평균 · 두 값의 차이(‘허블 긴장’) " + H0.tension.toFixed(1) + "σ · 가까운 우주 값이 맞다면 (물질 비율을 그대로 두면) 우주 나이는 138억 년이 아니라 약 " + Math.round(ageForH0(H0.late.mean) * 10) + "억 년</small>");
  const de = lit.measurements.find((m) => m.param === "w0wa" && m.status === "accepted");
  if (de) h += row("암흑에너지 (DESI DR2)", "w₀ = " + de.value + " ± " + de.sigma + " · wₐ = " + de.value2 + " ± " + de.sigma2 + "<small>" + de.method + " · ‘약해지는 암흑에너지’ 시나리오에 적용 중</small>");
  setText("lvRows", h, true);
  // 논문 목록
  const all = [...lit.measurements.map((m) => ({ ...m, src: "사람 검증" })), ...L.papers.accepted.map((m) => ({ ...m, src: "자동 수집" })), ...L.papers.pending.map((m) => ({ ...m, src: "자동 수집" }))];
  setText("lvPaperSum", "논문에서 온 변인 (반영 " + all.filter((m) => m.status === "accepted").length + " · 보류 " + all.filter((m) => m.status === "pending").length + ")");
  setText("lvPapers", '<ul class="plist">' + all.map((m) => "<li>" + (m.status === "accepted" ? '<span class="ok">반영</span> ' : '<span class="wait">보류</span> ') + "<b>" + (m.param === "H0" ? "H₀ = " + m.value + " ± " + m.sigma : m.param === "w0wa" ? "w₀ " + m.value + ", wₐ " + m.value2 : m.event ? m.event.label : m.value) + "</b> " + escapeHtml(m.method) + "<small>" + escapeHtml(m.title ?? "") + " — " + (m.journal ? escapeHtml(m.journal) : "학술지 미확인") + (m.arxiv ? " · arXiv:" + m.arxiv : "") + " · " + m.src + (m.reasons?.length ? " · 이유: " + m.reasons.map(escapeHtml).join(", ") : "") + "</small></li>").join("") + "</ul>", true);
  setText("lvSources", L.sources.length ? '<ul class="srcs">' + L.sources.map((x) => "<li" + (x.ok ? "" : ' class="bad"') + ">" + (x.ok ? "✓ " : "✗ ") + escapeHtml(x.name) + "</li>").join("") + "</ul>" : "", true);
}
function flareRank(c: string): number { const k = "ABCMX".indexOf(c[0]); return k * 10 + (parseFloat(c.slice(1)) || 0); }
function escapeHtml(x: string): string { return x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!); }
async function liveTick(): Promise<void> {
  const names = await refreshDirect(LIVE.live);
  liveDirect = { at: new Date(), names };
  renderLive();
  if (mode === "system" && sysIsSolar) sys.setSatellites(liveSatList(), JWST_KM);
}

// ---------- 행성계 ----------
let mode: "map" | "system" | "impact" = "map";
let sysIsSolar = false, sysHost: { life: number } | null = null;
const J2000_NOW_DAYS = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;
function systemFor(s: Sel): SysData | null {
  if (s.kind === "sun") return solarSystem();
  const ps = s.kind === "host" ? data.systems[s.i] : s.kind === "star" ? data.systems.find((x) => x.hyg === s.i) : undefined;
  if (!ps) return null;
  sysHost = ps.hyg >= 0 ? { life: phys[ps.hyg].tRemMax } : null;
  return exoSystem(ps);
}
const DEF4_MAP = "지도의 모든 점은 (x, y, z, <b>w</b>)입니다. <b>w</b> = 그 천체에서 지금 보이는 빛이 떠난 때 × 빛의 속도";
const DEF4_SYS = "행성계 장면의 모든 점은 (x, y, z, <b>w</b>)입니다. <b>w</b> = 시간. w를 돌려 넣으면 행성은 태양의 곧은 세계선을 감는 나선(세계선)이 됩니다";
function enterSystem(d: SysData): void {
  $("fade").classList.add("on");
  setTimeout(() => {
    sysIsSolar = d.real;
    if (d.real) sysHost = null;
    sys.show(d);
    mode = "system";
    labelsEl.hidden = true;
    $("mapControls").hidden = true; $("sysControls").hidden = false;
    setText("four4Def", DEF4_SYS, true);
    showSysCard(d);
    $("missionBox").hidden = !d.real;
    if (d.real) { sys.setSatellites(liveSatList(), JWST_KM); mission = null; buildMissionUi(); }
    applySystemTime();
    refreshCard(true);
    setTimeout(() => $("fade").classList.remove("on"), 60);
  }, 320);
}
function exitSystem(): void {
  $("fade").classList.add("on");
  setTimeout(() => {
    mode = "map";
    sys.clear();
    labelsEl.hidden = false;
    $("mapControls").hidden = false; $("sysControls").hidden = true; $("sysCard").hidden = true;
    setText("four4Def", DEF4_MAP, true);
    if (selected?.kind === "body") select({ kind: "sun", name: "태양" });
    setTimeout(() => $("fade").classList.remove("on"), 60);
  }, 320);
}
function applySystemTime(): void {
  const dt = time.dt;
  sys.days = (sysIsSolar ? J2000_NOW_DAYS : 0) + dt * 365.25;
  if (sysIsSolar && fc) {
    const ts = clamp(dt, -SECULAR_LIMIT_YEARS, SECULAR_LIMIT_YEARS);
    sys.applyTime({ secular: Math.abs(dt) > 10 ? fc.secular.at(ts) : undefined, sun: sunAt(dt / 1e9), moonScale: moonDistance(dt) / 384400, earthGone: earthAt(dt / 1e9).engulfed });
    if (mission) {
      const since = (dt - mission.launchDt) * 365.25;
      sys.setProbe(since >= 0 && since <= mission.tr.tofDays ? probePosition(mission.tr, since, probeV) : null);
    }
  } else {
    sys.applyTime({ starDead: !!sysHost && dt > 0 && dt > sysHost.life });
  }
}
function showSysCard(d: SysData): void {
  $("sysCard").hidden = false;
  $("scName").textContent = d.name;
  const s = d.star;
  $("scStar").innerHTML = row("별", (s.spect || "—") + " · " + Math.round(s.T).toLocaleString("ko-KR") + " K") + row("질량 · 반지름", s.M.toPrecision(3) + " M☉ · " + s.R.toPrecision(3) + " R☉")
    + row("광도", (s.L < 0.01 ? s.L.toExponential(1) : s.L.toPrecision(3)) + " L☉") + row("생명 가능 지대", d.hz[0].toPrecision(2) + "–" + d.hz[1].toPrecision(2) + " AU<small>Kopparapu 외 2013 (별 온도 의존)</small>");
  const rows = d.planets.map((p) => {
    const inHZ = p.a >= d.hz[0] && p.a <= d.hz[1];
    return "<tr><td>" + p.name + "</td><td>" + p.type + (inHZ ? ' <span class="hz">· 생명 가능 지대</span>' : "") + '</td><td class="num">' + p.R.toFixed(2) + (p.Rest ? "*" : "") + '</td><td class="num">' + p.a.toPrecision(3) + '</td><td class="num">' + (p.P < 1000 ? p.P.toFixed(p.P < 10 ? 2 : 1) : Math.round(p.P).toLocaleString("ko-KR")) + '</td><td class="num">' + (p.e ? p.e.toFixed(2) : "0") + "</td></tr>";
  }).join("");
  $("scPlanets").innerHTML = "<thead><tr><th>천체</th><th>종류</th><th>R⊕</th><th>a (AU)</th><th>주기 (일)</th><th>e</th></tr></thead><tbody>" + rows + "</tbody>";
  $("scNote").textContent = d.real
    ? "시간을 움직이면 그날의 실제 위치(케플러 방정식), 수백만 년 단위의 궤도 변화(영년 섭동), 태양의 진화와 삼켜지는 행성, 멀어지는 달이 함께 바뀝니다. 행성·위성을 누르면 자세한 특성이 나옵니다."
    : "Open Exoplanet Catalogue의 실제 긴반지름·주기·이심률입니다. 궤도 방향과 현재 위치는 알 수 없어 임의로 정했습니다. * 표시는 질량에서 추정한 반지름 (Chen & Kipping 2017).";
}

// ---------- 탐사선 미션 계획 (Space Engineering Pack의 궤도 전이 공식) ----------
let mission: { tr: Transfer; launchDt: number } | null = null;
const probeV = new THREE.Vector3();
const MISSION_TARGETS = ["수성", "금성", "화성", "케레스", "목성", "토성", "천왕성", "해왕성", "명왕성"];
function buildMissionUi(): void {
  const box = $("msTargets");
  box.innerHTML = "";
  for (const name of MISSION_TARGETS) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = name; b.dataset.target = name; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => planMission(name));
    box.appendChild(b);
  }
  $("msRows").innerHTML = "";
  $("msGo").hidden = true;
  $("msVehicles").innerHTML = vehicleTable(null);
  $("msSats").innerHTML = liveSatList().map(([n, alt, inc, P, note]) => row(n, alt.toLocaleString("ko-KR") + " km · " + inc + "° · " + (P < 120 ? P.toFixed(1) + "분" : (P / 60).toFixed(2) + "시간") + "<small>" + note + "</small>")).join("")
    + row("제임스 웹 우주 망원경", "L2 · 약 150만 km<small>태양–지구 라그랑주 점. 지구와 함께 1년에 한 바퀴 태양을 돕니다.</small>");
}
function vehicleTable(target: string | null): string {
  const mars = target === "화성";
  const rows = VEHICLES.map((v) => "<tr><td>" + v.name + "</td><td class=\"num\">" + v.leo.toLocaleString("ko-KR") + "</td><td class=\"num\">" + (v.gto ? v.gto.toLocaleString("ko-KR") : "—") + "</td><td class=\"num\">" + (v.mars ? v.mars.toLocaleString("ko-KR") : "—") + "</td><td class=\"num\">" + v.costM + "</td><td class=\"num\">" + Math.round(v.costM * 1e6 / v.leo).toLocaleString("ko-KR") + "</td></tr>").join("");
  return "<thead><tr><th>발사체</th><th>저궤도 kg</th><th>정지 전이 kg</th><th" + (mars ? ' class="hl"' : "") + ">화성 kg</th><th>발사비 백만$</th><th>$/kg (저궤도)</th></tr></thead><tbody>" + rows + "</tbody>";
}
function planMission(name: string): void {
  const ss = solarSystem(), earth = ss.planets.find((p) => p.name === "지구")!, target = ss.planets.find((p) => p.name === name)!;
  const nowDays = J2000_NOW_DAYS + time.dt * 365.25;
  const tr = planTransfer(earth, target, nowDays);
  mission = { tr, launchDt: time.dt + tr.windowDays / 365.25 };
  sys.setTransfer(transferPath(tr), "탐사선 → " + name);
  $("msTargets").querySelectorAll("[data-target]").forEach((x) => x.setAttribute("aria-pressed", String(x.getAttribute("data-target") === name)));
  const launchYear = NOW_YEAR + mission.launchDt, tof = tr.tofDays;
  $("msRows").innerHTML = row("다음 발사 창", fmtCal(launchYear) + "<small>지금 보고 있는 시점부터 " + Math.round(tr.windowDays) + "일 뒤 · 회합 주기 " + (tr.synodicDays / 365.25).toFixed(2) + "년마다</small>")
    + row("비행 시간", (tof < 730 ? Math.round(tof) + "일" : (tof / 365.25).toFixed(1) + "년") + "<small>도착 " + fmtCal(launchYear + tof / 365.25) + "</small>")
    + row("출발 Δv (지구 저궤도 200 km)", tr.dvDepart.toFixed(2) + " km/s<small>C3 = " + tr.c3.toFixed(1) + " km²/s² · v∞ = " + tr.vInf1.toFixed(2) + " km/s</small>")
    + row("도착 궤도 진입 Δv", (isFinite(tr.dvCapture) ? tr.dvCapture.toFixed(2) + " km/s" : "—") + "<small>도착 v∞ = " + tr.vInf2.toFixed(2) + " km/s, 행성 반지름 1.1배 원 궤도</small>")
    + row("출발 위상각", tr.phaseDeg.toFixed(1) + "°<small>발사 때 목표 행성이 지구보다 앞서 있어야 할 각도</small>")
    + row("전이 궤도", "긴반지름 " + tr.aT.toFixed(3) + " AU · " + (tr.r2 > tr.r1 ? "근일점에서 출발" : "원일점에서 출발"));
  $("msGo").hidden = false;
  $("msVehicles").innerHTML = vehicleTable(name);
  if (name !== "화성") $("msRows").innerHTML += row("참고", "외행성은 실제로는 금성·지구·목성의 중력 도움(스윙바이)으로 Δv와 비행 시간을 크게 줄입니다.");
}
function fmtCal(year: number): string {
  const y = Math.floor(year), d = new Date(Date.UTC(y, 0, 1) + (year - y) * 365.25 * 86400000);
  return y + "년 " + (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일";
}
$("msGo").addEventListener("click", () => {
  if (!mission) return;
  setTime(mission.launchDt);
  time.rate = 0.0821355; time.dir = 1;
  $("tRate").querySelectorAll("[data-rate]").forEach((x) => x.setAttribute("aria-pressed", String(x.getAttribute("data-rate") === "0.0821355")));
  updateTimeUi();
});

// ---------- 외계행성 분포 그래프 (주기–반지름) ----------
const scat = $<HTMLCanvasElement>("scat"), sctx = scat.getContext("2d")!;
interface ScatPt { x: number; y: number; sys: number; method: string; est: boolean }
let scatPts: ScatPt[] = [];
const METHOD_COL: Record<string, string> = { transit: "#2a78d6", RV: "#eb6834", imaging: "#d55181", microlensing: "#1baf7a", timing: "#eda100" };
const SOLAR_REF: [string, number, number][] = [["수성", 87.97, 0.383], ["금성", 224.7, 0.949], ["지구", 365.26, 1], ["화성", 687, 0.532], ["목성", 4333, 11.21], ["토성", 10759, 9.45], ["천왕성", 30687, 4.01], ["해왕성", 60190, 3.88]];
const SX = { p0: -1, p1: 6, r0: -0.6, r1: 1.5, padL: 46, padB: 30 };
function scatXY(P: number, R: number, w: number, h: number): [number, number] {
  return [SX.padL + (Math.log10(P) - SX.p0) / (SX.p1 - SX.p0) * (w - SX.padL - 8), 8 + (1 - (Math.log10(R) - SX.r0) / (SX.r1 - SX.r0)) * (h - SX.padB - 8)];
}
function buildScatter(): void {
  scatPts = [];
  data.systems.forEach((s, si) => s.planets.forEach((p) => {
    const a = planetA(p, s.star.mass), P = p.period ?? (a ? 365.25 * Math.sqrt(a * a * a / (s.star.mass ?? 1)) : null);
    if (!P || (p.radius == null && p.mass == null)) return;
    const { R, estimated } = planetRadiusEarth(p);
    scatPts.push({ x: P, y: R, sys: si, method: p.method ?? "", est: estimated });
  }));
}
function drawScatter(): void {
  const r = scat.getBoundingClientRect(), w = r.width, h = r.height, c = sctx, pr = Math.min(window.devicePixelRatio || 1, 2);
  if (!w) return;
  if (scat.width !== Math.round(w * pr)) { scat.width = Math.round(w * pr); scat.height = Math.round(h * pr); }
  c.setTransform(pr, 0, 0, pr, 0, 0); c.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement), muted = cs.getPropertyValue("--muted").trim(), line = cs.getPropertyValue("--line").trim(), ink = cs.getPropertyValue("--ink").trim();
  c.font = "11px 'IBM Plex Mono', ui-monospace, monospace"; c.strokeStyle = line; c.fillStyle = muted; c.lineWidth = 1;
  const xl = ["0.1", "1", "10", "100", "1000", "1만", "10만", "100만"];
  for (let e = SX.p0; e <= SX.p1; e++) { const [x] = scatXY(Math.pow(10, e), 1, w, h); c.beginPath(); c.moveTo(x + 0.5, 8); c.lineTo(x + 0.5, h - SX.padB); c.stroke(); c.textAlign = "center"; c.fillText(xl[e + 1], x, h - SX.padB + 14); }
  for (const R of [0.3, 1, 2, 4, 10, 30]) { const [, y] = scatXY(1, R, w, h); c.beginPath(); c.moveTo(SX.padL, y + 0.5); c.lineTo(w - 8, y + 0.5); c.stroke(); c.textAlign = "right"; c.fillText(String(R), SX.padL - 6, y + 4); }
  c.textAlign = "center"; c.fillText("공전 주기 (일)", (w + SX.padL) / 2, h - 4);
  c.save(); c.translate(11, (h - SX.padB) / 2); c.rotate(-Math.PI / 2); c.fillText("반지름 (지구 = 1)", 0, 0); c.restore();
  const [, ya] = scatXY(1, 2.0, w, h), [, yb] = scatXY(1, 1.5, w, h);
  c.fillStyle = "rgba(128,128,140,0.12)"; c.fillRect(SX.padL, ya, w - SX.padL - 8, yb - ya);
  for (const p of scatPts) {
    const [x, y] = scatXY(p.x, p.y, w, h);
    if (x < SX.padL || y < 4 || y > h - SX.padB) continue;
    const key = /transit/i.test(p.method) ? "transit" : /RV|radial/i.test(p.method) ? "RV" : /imag/i.test(p.method) ? "imaging" : /micro/i.test(p.method) ? "microlensing" : "timing";
    c.globalAlpha = p.est ? 0.25 : 0.55; c.fillStyle = METHOD_COL[key];
    c.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }
  c.globalAlpha = 1;
  for (const [n, P, R] of SOLAR_REF) { const [x, y] = scatXY(P, R, w, h); c.fillStyle = ink; c.beginPath(); c.arc(x, y, 3.5, 0, 6.2832); c.fill(); c.textAlign = "left"; c.fillText(n, x + 5, y - 4); }
  const sel = selected?.kind === "host" ? selected.i : selected?.kind === "star" ? data.systems.findIndex((s) => s.hyg === (selected as { i: number }).i) : -1;
  if (sel >= 0) for (const p of scatPts) if (p.sys === sel) {
    const [x, y] = scatXY(p.x, p.y, w, h);
    c.strokeStyle = "#f2b300"; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 6, 0, 6.2832); c.stroke();
  }
}
scat.addEventListener("click", (e) => {
  const r = scat.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bd = 12;
  for (const p of scatPts) { const [px, py] = scatXY(p.x, p.y, r.width, r.height), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = p.sys; } }
  if (best < 0) return;
  const sel: Sel = { kind: "host", i: best, name: data.systems[best].name };
  if (mode === "system") exitSystem();
  select(sel); flyToSel(sel); drawScatter();
});

// ---------- 예측 그래프 ----------
let encShown: ReturnType<typeof drawEncounters> = [];
function drawCharts(): void {
  if (!fc) return;
  drawEccentricity($<HTMLCanvasElement>("chEcc"), fc.secular, time.dt);
  drawSun($<HTMLCanvasElement>("chSun"), time.dt);
  drawLocalGroup($<HTMLCanvasElement>("chLG"), fc.lg, time.dt);
  encShown = drawEncounters($<HTMLCanvasElement>("chEnc"), fc.encounters, starName, time.dt);
}
$("chEnc").addEventListener("click", (e) => {
  const cvs = e.currentTarget as HTMLCanvasElement, r = cvs.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const X = (t: number) => 44 + (t + 5e6) / 1e7 * (r.width - 54), Y = (d: number) => 22 + d / 2.5 * (r.height - 48);
  let best = -1, bd = 14;
  for (const en of encShown) { const d = Math.hypot(X(en.tMin) - x, Y(en.dMin) - y); if (d < bd) { bd = d; best = en.i; } }
  if (best < 0) return;
  const en = encShown.find((q) => q.i === best)!;
  setTime(en.tMin);
  const s: Sel = { kind: "star", i: best, name: starName(best) };
  select(s);
  flyTo([0, 0, 0], 3, "태양 이웃");
});
for (const id of ["chEcc", "chSun", "chLG"]) {
  $(id).addEventListener("click", (e) => {
    const cvs = e.currentTarget as HTMLCanvasElement, r = cvs.getBoundingClientRect(), u = clamp((e.clientX - r.left - 44) / (r.width - 54), 0, 1);
    setTime(id === "chEcc" ? -1e6 + u * 2e6 : id === "chSun" ? u * 8e9 : u * 14e9);
  });
}

// ---------- 예측 계기판 · 사건 ----------
const lastTxt: Record<string, string> = {};
function setText(id: string, v: string, html = false): void {
  if (lastTxt[id] === v) return;
  lastTxt[id] = v;
  if (html) $(id).innerHTML = v; else $(id).textContent = v;
}
function updateForecastPanel(): void {
  const dt = time.dt, dG = dt / 1e9, la = now.la, T = TL.Tcmb(dt), Hn = TL.H(dt) * 3.0857e19, age = (TL.t0 + dt * YEAR_S) / YEAR_S, era = TL.era(dt);
  const st = sunAt(dG), ea = earthAt(dG);
  let html = row("우주 나이", age > 0 ? fmtYearsShort(age) : "—") + row("우주 크기 (오늘 = 1)", la > 4 ? "10^" + la.toFixed(la < 1e4 ? 1 : 0) : la < -4 ? "10^" + la.toFixed(1) : Math.pow(10, la).toPrecision(4))
    + row("우주배경복사 온도", (T > 1e5 || T < 1e-3 ? sci(T) : T.toPrecision(4)) + " K") + row("허블 매개변수", (Math.abs(Hn) < 1e5 ? Hn.toFixed(Math.abs(Hn) < 10 ? 3 : 1) : sci(Hn)) + " km/s/Mpc" + (Hn < 0 ? "<small>수축 중</small>" : ""))
    + row("시대", era.name);
  if (dG > -4.6 && dG < 1e3) {
    html += row("태양", st.phase + "<small>광도 " + fmtL(st.L) + " L☉ · 반지름 " + (st.R < 0.1 ? st.R.toFixed(4) : st.R.toPrecision(3)) + " R☉ · " + Math.round(st.T).toLocaleString("ko-KR") + " K</small>");
    if (dG > -4.54) html += row("지구", ea.engulfed ? "삼켜짐" : "받는 햇빛 " + ea.S.toPrecision(3) + "배 · 평형 온도 " + Math.round(ea.Teq - 273) + " °C<small>" + ea.status + "</small>");
    if (dt > -1.4e9 && !ea.engulfed) html += row("달 · 하루", Math.round(moonDistance(dt)).toLocaleString("ko-KR") + " km · " + dayLength(dt).toFixed(2) + "시간<small>개기일식 " + (totalEclipsePossible(dt).possible ? "가능" : "불가능") + "</small>");
  }
  if (fc && Math.abs(dt) <= SECULAR_LIMIT_YEARS) {
    const se = fc.secular.at(dt);
    html += row("지구 궤도 이심률", se.e[2].toFixed(4) + "<small>영년 섭동 (밀란코비치)" + (Math.abs(dt) > 5e6 ? " · 수백만 년 너머는 정확도가 떨어짐" : "") + "</small>");
  }
  if (fc && Math.abs(dt) <= 1e7) {
    const nb = nearestOf(dt);
    if (nb.i >= 0) html += row("가장 가까운 별", starName(nb.i) + " · " + fmtPc(nb.d));
  }
  if (fc && dt >= 0 && dt < 1.4e10) {
    const g = dt / 1e9, sep = Math.hypot(...trackAt(fc.lg.best, "m31", g));
    html += row("안드로메다까지", now.milk > 0.5 ? "합쳐짐 (밀코메다)" : Math.round(sep).toLocaleString("ko-KR") + " kpc<small>최선 추정 궤도</small>");
  }
  setText("fcRows", html, true);
  // 사건: 지금 시점 앞뒤
  if (fc) {
    const ev = fc.events, idx = ev.findIndex((e) => e.years > dt);
    const lo = Math.max(0, (idx < 0 ? ev.length : idx) - 3), hi = Math.min(ev.length, (idx < 0 ? ev.length : idx) + 6);
    const items = ev.slice(lo, hi).map((e) => '<li class="' + (e.years <= dt ? "past" : "") + '"><button type="button" data-y="' + e.years + '"><b>' + e.label + "</b><span>" + fmtDt(e.years) + "</span></button></li>").join("");
    setText("events", items, true);
  }
}
function nearestOf(dt: number): { i: number; d: number } {
  const b = data.stars.buf;
  let best = -1, bd = Infinity;
  for (const i of fc!.nearbyIdx) { const o = STRIDE * i, d = Math.hypot(b[o] + b[o + 5] * dt, b[o + 1] + b[o + 6] * dt, b[o + 2] + b[o + 7] * dt); if (d < bd) { bd = d; best = i; } }
  return { i: best, d: bd };
}
$("events").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button[data-y]");
  if (!b) return;
  const y = parseFloat(b.getAttribute("data-y")!);
  setTime(y);
  const ev = fc?.events.find((x) => x.years === y);
  if (ev) $("evDetail").textContent = ev.label + " — " + ev.detail;
  $("evImpact").hidden = !ev?.impact;
  if (ev?.impact) $("evImpact").dataset.scene = ev.impact;
});

// ---------- 시간 조작 ----------
const tSlider = $<HTMLInputElement>("tSlider");
function setTime(dt: number): void {
  time.dt = clamp(dt, TL.dtMin, TL.dtMax);
  time.dir = 0;
  updateTimeUi();
}
function updateTimeUi(): void {
  if (document.activeElement !== tSlider) tSlider.value = String(dtToSlider(time.dt, TL.dtMin, TL.dtMax));
  setText("tReadout", fmtDt(time.dt));
  setText("tAge", "우주 나이 " + fmtYearsShort(Math.max((TL.t0 + time.dt * YEAR_S) / YEAR_S, 0)) + " · " + TL.era(time.dt).name);
  $("tBack").setAttribute("aria-pressed", String(time.dir < 0));
  $("tFwd").setAttribute("aria-pressed", String(time.dir > 0));
}
tSlider.addEventListener("input", () => { time.dt = sliderToDt(parseFloat(tSlider.value), TL.dtMin, TL.dtMax); time.dir = 0; updateTimeUi(); });
$("tBack").addEventListener("click", () => { time.dir = time.dir < 0 ? 0 : -1; updateTimeUi(); });
$("tFwd").addEventListener("click", () => { time.dir = time.dir > 0 ? 0 : 1; updateTimeUi(); });
$("tNow").addEventListener("click", () => setTime(0));
$("tRate").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-rate]");
  if (!b) return;
  const v = b.getAttribute("data-rate")!;
  time.rate = v === "log" ? "log" : parseFloat(v);
  $("tRate").querySelectorAll("[data-rate]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
});
$("tJump").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-jump]");
  if (!b) return;
  const v = b.getAttribute("data-jump")!;
  setTime(v === "bb" ? TL.dtMin * (1 - 1e-9) : v === "cmb" ? (core.tOf(-Math.log10(1091)) - TL.t0) / YEAR_S : parseFloat(v));
});
$("fateChips").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-fate]");
  if (!b) return;
  TL.fate = b.getAttribute("data-fate") as typeof TL.fate;
  $("fateChips").querySelectorAll("[data-fate]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  if (fc) fc.events = withLive(buildEvents(fc, starName, TL));
  appliedDt = NaN; // 미래의 척도 인자가 시나리오마다 다르므로 다시 계산
  time.dt = clamp(time.dt, TL.dtMin, TL.dtMax);
  setText("fateNote", TL.current.text + " (" + TL.current.source + ")");
  updateTimeUi();
});
function advanceTime(sec: number): void {
  if (!time.dir) return;
  if (time.rate === "log") {
    // 로그 재생: 1초에 |Δt|가 10배 (0을 지날 때는 1년부터)
    const a = Math.abs(time.dt), sgn = Math.sign(time.dt) || time.dir;
    let na = sgn === time.dir ? Math.max(a, 1) * Math.pow(10, sec) : a / Math.pow(10, sec);
    if (sgn !== time.dir && na < 1) na = 0;
    time.dt = sgn * na;
  } else time.dt += time.dir * time.rate * sec;
  if (time.dt <= TL.dtMin || time.dt >= TL.dtMax) { time.dt = clamp(time.dt, TL.dtMin, TL.dtMax); time.dir = 0; }
  updateTimeUi();
}

// ---------- 검색 ----------
interface Entry { key: string; label: string; sel: () => Sel }
const index: Entry[] = [];
function buildIndex(): void {
  const add = (keys: string[], label: string, sel: () => Sel) => index.push({ key: keys.join(" ").toLowerCase().replace(/\s+/g, ""), label, sel });
  add(["태양", "sun", "sol", "태양계"], "태양 (태양계)", () => ({ kind: "sun", name: "태양" }));
  add(["우리은하", "milkyway", "은하수"], "우리 은하", () => ({ kind: "mw", name: "우리 은하" }));
  add(["밀코메다", "milkomeda"], "밀코메다 (미래의 병합 은하)", () => ({ kind: "gal", i: gals.length - 1, name: "밀코메다 (예측)" }));
  for (const s of data.stars.named) {
    starNameIdx.set(s.i, s.name);
    add([s.name, STAR_KO[s.name] ?? "", starLabel(s.name)], starLabel(s.name) + (STAR_KO[s.name] ? " · " + s.name : "") + " (별)", () => ({ kind: "star", i: s.i, name: starLabel(s.name) }));
  }
  data.systems.forEach((s, i) => add([s.name, ...s.planets.map((p) => p.name)], s.name + " (행성 " + s.planets.length + "개)", () => ({ kind: "host", i, name: s.name })));
  gals.forEach((g, i) => { if (g.group !== 5) add([g.name, g.sub, g.g?.messier ? "m" + g.g.messier : "", g.g?.id.replace(/0+(\d)/, "$1") ?? ""], g.name + (g.sub && g.sub !== g.name ? " · " + g.sub : "") + " (은하)", () => ({ kind: "gal", i, name: g.name })); });
  named.forEach((o, k) => add([o.name, o.o?.en ?? "", o.kind === "blackhole" ? "블랙홀 blackhole" : ""], o.name, () => ({ kind: "named", k, name: o.name })));
}
const searchIn = $<HTMLInputElement>("search"), sugg = $("sugg");
function search(q: string): Entry[] {
  const k = q.toLowerCase().replace(/\s+/g, "").replace(/^ngc0*/, "ngc").replace(/^ic0*/, "ic");
  if (!k) return [];
  const starts: Entry[] = [], inc: Entry[] = [];
  for (const e of index) { const p = e.key.indexOf(k); if (p === 0) starts.push(e); else if (p > 0) inc.push(e); if (starts.length > 12) break; }
  return [...starts, ...inc].slice(0, 9);
}
searchIn.addEventListener("input", () => {
  const res = search(searchIn.value);
  sugg.innerHTML = "";
  sugg.hidden = !res.length;
  res.forEach((e) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = e.label;
    b.addEventListener("click", () => go(e));
    sugg.appendChild(b);
  });
});
searchIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { const r = search(searchIn.value); if (r[0]) go(r[0]); } if (ev.key === "Escape") sugg.hidden = true; });
function go(e: Entry): void {
  const s = e.sel();
  sugg.hidden = true; searchIn.value = "";
  if (mode === "system") exitSystem();
  select(s); flyToSel(s); drawScatter();
}

// ---------- 축척 단계 ----------
const LEVELS: [string, string, () => void][] = [
  ["solar", "태양계", () => enterSystem(solarSystem())],
  ["near", "태양 이웃", () => flyTo([0, 0, 0], 6, "태양 이웃")],
  ["stars", "별 지도", () => flyTo([0, 0, 0], 300, "태양 주변 별")],
  ["mw", "우리 은하", () => flyTo(now.gc, 4.5e4, "우리 은하", { phi: 0.35, get: () => now.gc })],
  ["lg", "국부 은하군", () => flyTo(radecToGal(10.68, 41.27, 3.2e5), 2.6e6, "국부 은하군")],
  ["virgo", "근방 은하", () => flyTo(radecToGal(187.7, 12.39, 5e6), 3.2e7, "국부 초은하단")],
  ["local", "근방 우주", () => flyTo([0, 0, 0], 3.5e8, "근방 우주")],
  ["obs", "관측 가능한 우주", () => flyTo([0, 0, 0], 4.6e10, "관측 가능한 우주")],
];
LEVELS.forEach(([key, label, fn]) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = label; b.dataset.level = key;
  b.addEventListener("click", () => { if (mode === "system" && key !== "solar") exitSystem(); fn(); });
  $("levels").appendChild(b);
});

// ---------- 입력 ----------
const pointers = new Map<number, { x: number; y: number }>();
let downAt: { x: number; y: number; t: number } | null = null;
stage.addEventListener("pointerdown", (e) => {
  stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.classList.add("dragging");
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
stage.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (pointers.size === 1 && e.shiftKey) {
    // Shift + 드래그: 가로 = XW 평면, 세로 = ZW 평면 회전
    four.spin = false; four.tween = null;
    four.ang[XW] = wrapPi(four.ang[XW] + dx * 0.008);
    four.ang[ZW] = wrapPi(four.ang[ZW] - dy * 0.008);
    syncFourUi();
    p.x = e.clientX; p.y = e.clientY;
  } else if (pointers.size === 1) {
    if (mode === "impact") { imp.theta -= dx * 0.006; imp.phi = clamp(imp.phi - dy * 0.006, 0.05, Math.PI - 0.05); imp.auto = false; }
    else if (mode === "system") { sys.theta += dx * 0.006; sys.phi = clamp(sys.phi - dy * 0.006, 0.05, Math.PI - 0.05); }
    else { cam.theta -= dx * 0.006; cam.phi = clamp(cam.phi - dy * 0.006, 0.02, Math.PI - 0.02); }
    p.x = e.clientX; p.y = e.clientY;
  } else if (pointers.size === 2) {
    const ps = [...pointers.values()], before = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    p.x = e.clientX; p.y = e.clientY;
    const qs = [...pointers.values()], after = Math.hypot(qs[0].x - qs[1].x, qs[0].y - qs[1].y);
    if (after > 0) zoom(before / after);
  }
});
function endPointer(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (!pointers.size) stage.classList.remove("dragging");
  if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5 && performance.now() - downAt.t < 450) {
    const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (mode === "map") { const s = pick(x, y); select(s); drawScatter(); }
    else if (mode === "system") pickBody(x, y);
  }
  downAt = null;
}
/** 행성계 장면의 선택 고리: 고른 행성·위성(또는 별)에 맞춤 */
function placeSysRing(): void {
  const ring = $("selRing");
  const pos = selected?.kind === "body" ? sys.bodies().find((b) => b.name === selected!.name && !b.gone)?.pos : selected?.kind === "sun" || selected?.kind === "host" ? new THREE.Vector3() : undefined;
  const v = pos ? pos.clone().project(sys.camera) : null;
  ring.hidden = !v || v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02;
  if (v && !ring.hidden) ring.style.transform = "translate(" + ((v.x * 0.5 + 0.5) * W).toFixed(1) + "px," + ((-v.y * 0.5 + 0.5) * H).toFixed(1) + "px)";
}
/** 행성계 장면에서 행성·위성 고르기 */
function pickBody(x: number, y: number): void {
  let best = "", bd = 22;
  for (const b of sys.bodies()) {
    if (b.gone) continue;
    const v = b.pos.clone().project(sys.camera);
    if (v.z > 1) continue;
    const d = Math.hypot((v.x * 0.5 + 0.5) * W - x, (-v.y * 0.5 + 0.5) * H - y);
    if (d < bd) { bd = d; best = b.name; }
  }
  if (best) select({ kind: "body", name: best });
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", (e) => { pointers.delete(e.pointerId); downAt = null; });
stage.addEventListener("dblclick", () => { if (selected && mode === "map") flyToSel(selected); });
stage.addEventListener("wheel", (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
function zoom(f: number): void {
  if (mode === "impact") { imp.r = clamp(imp.r * f, imp.rMin, imp.rMax); return; }
  if (mode === "system") { sys.r = clamp(sys.r * f, sys.rMin, sys.rMax); return; }
  cam.fly = null;
  cam.r = clamp(cam.r * f, 2e-5, 8e10);
}
$("flyBtn").addEventListener("click", () => { if (selected) flyToSel(selected); });
$("icSystem").addEventListener("click", () => { if (!selected) return; const d = systemFor(selected); if (d) enterSystem(d); });
$("sysBack").addEventListener("click", exitSystem);
$("autoBtn").addEventListener("click", (e) => { cam.auto = !cam.auto; (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(cam.auto)); });
// 4차원 조작
document.querySelectorAll<HTMLElement>("#four4 [data-r4]").forEach((b) => b.addEventListener("click", () => goPreset4(b.dataset.r4!)));
([["r4XW", XW], ["r4YW", YW], ["r4ZW", ZW]] as [string, number][]).forEach(([id, k]) => {
  $<HTMLInputElement>(id).addEventListener("input", (e) => {
    four.spin = false; four.tween = null;
    four.ang[k] = +(e.currentTarget as HTMLInputElement).value * DEG4;
    syncFourUi();
  });
});
$("r4Spin").addEventListener("click", () => {
  four.spin = !four.spin; four.tween = null;
  setText("four4Note", four.spin ? "XW·YW·ZW 세 평면을 서로 다른 빠르기로 돌립니다. 3차원 지도가 4차원 안에서 뒤집히며 w(빛의 나이)가 공간으로 들어왔다 나갑니다." : "회전을 멈췄습니다. 막대로 각도를 바꾸거나 시점을 고르세요.");
  syncFourUi();
});
$("r4Wk").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-wk]");
  if (!b) return;
  four.wk = +b.dataset.wk!;
  $("r4Wk").querySelectorAll("[data-wk]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
});
// 시공간 조건
$<HTMLInputElement>("c4Expand").addEventListener("change", (e) => {
  space4.expand = (e.currentTarget as HTMLInputElement).checked;
  appliedDt = NaN;
  setText("four4Note", space4.expand ? "팽창을 켰습니다. 은하 사이 거리가 그 시점의 척도 인자 a(t)를 따르고, 빛도 늘어나는 공간을 건너 옵니다." : "팽창을 껐습니다. 은하들이 오늘 거리에 멈춰 있고 빛은 곧은 거리 c·t만 건너 옵니다. 시간 막대를 움직여 차이를 비교해 보세요.");
});
$<HTMLInputElement>("c4SeeT").addEventListener("change", (e) => {
  space4.seeT = (e.currentTarget as HTMLInputElement).checked;
  setText("four4Note", space4.seeT ? "공간 = 시간을 켰습니다. 멀리 있는 것일수록 빛이 떠난 옛 모습으로 보이고, 입자 지평선 밖은 보이지 않습니다. 별의 죽음도 빛이 도착한 뒤에야 보입니다." : "공간 = 시간을 껐습니다. 모든 천체를 같은 순간(w = 0)에 놓은 3차원 단면입니다. 4차원으로 돌리면 이 단면이 4차원 안에서 기울어집니다.");
});
$<HTMLInputElement>("r4Tint").addEventListener("change", (e) => { four.tint = (e.currentTarget as HTMLInputElement).checked; });
$<HTMLInputElement>("r4Persp").addEventListener("change", (e) => { four.persp = (e.currentTarget as HTMLInputElement).checked; });
$("layerBox").addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  (layers as Record<string, boolean>)[t.dataset.layer!] = t.checked;
});

// ---------- 크기 · 화면 갱신 ----------
function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height;
  renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
  camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
  uScale.value = H * dpr / (2 * Math.tan(FOV / 2 * Math.PI / 180));
  uRes.value.set(W * dpr, H * dpr);
  if (starMat) { starMat.uniforms.uPx.value = 1.6 * dpr; hostMat.uniforms.uPx.value = dpr; galMat.uniforms.uMinPx.value = 1.6 * dpr; mwMat.uniforms.uMinPx.value = 1.1 * dpr; }
  drawScatter();
  drawCharts();
}

function scaleName(r: number): string {
  if (r < 0.02) return "행성계 크기";
  if (r < 30) return "태양 이웃";
  if (r < 3000) return "태양 주변 별";
  if (r < 3e5) return "우리 은하";
  if (r < 6e6) return "국부 은하군";
  if (r < 1.5e8) return "근방 은하";
  if (r < 3e9) return "근방 우주";
  return "관측 가능한 우주";
}
function updateHud(): void {
  if (mode === "impact") {
    const I = imp.info, st = I.setup;
    setText("hudScale", st ? (impScene?.label ?? $("ipTitle").textContent ?? "픽셀 충돌") : "픽셀 충돌");
    setText("hudSub", st?.still ? "픽셀 " + I.n.toLocaleString("ko-KR") + "개 · " + MODE_NAMES[imp.mode] + " 색" : (I.progress || "경과 " + fmtHours(I.t)) + " · 픽셀 " + I.n.toLocaleString("ko-KR") + "개");
    const km = imp.r * I.L / 1000;
    setText("hudTarget", "시야 " + (km < 1e4 ? Math.round(km).toLocaleString("ko-KR") + " km" : (km / 1e3).toPrecision(3) + "천 km"));
    setText("hudDist", st && impScene?.years !== undefined ? fmtDt(time.dt) : "");
    setText("hud4", "충돌 장면 · 4차원 회전은 지도·행성계에 적용");
    return;
  }
  setText("hud4", hud4Text());
  if (mode === "system") {
    const d = sys.data!;
    setText("hudScale", d.name);
    setText("hudSub", (d.real && Math.abs(time.dt) < 1e4 ? new Date(Date.UTC(2000, 0, 1, 12) + sys.days * 86400000).toISOString().slice(0, 10) : fmtDt(time.dt)) + (d.real ? " · 태양: " + sunAt(time.dt / 1e9).phase : ""));
    setText("hudTarget", "시야 " + (sys.r < 0.2 ? (sys.r * 149.6).toPrecision(3) + "백만 km" : sys.r.toPrecision(3) + " AU"));
    setText("hudDist", "");
    return;
  }
  setText("hudScale", scaleName(cam.r));
  setText("hudSub", "시야 반지름 " + fmtPc(cam.r) + " (" + fmtPcUnit(cam.r) + ")");
  const d = Math.hypot(cam.target[0], cam.target[1], cam.target[2]);
  setText("hudTarget", cam.label);
  setText("hudDist", (d < 1e-6 ? "태양 기준" : "태양에서 " + fmtPc(d)) + " · " + fmtDt(time.dt));
}

let frameNo = 0, prev = performance.now(), fpsT = 0, fpsN = 0;
function frame(nowMs: number): void {
  const dt = Math.min(0.05, (nowMs - prev) / 1000);
  fpsT += nowMs - prev; fpsN++;
  if (fpsT > 1000) { stage.dataset.fps = String(Math.round(fpsN * 1000 / fpsT)); fpsT = 0; fpsN = 0; }
  prev = nowMs; frameNo++;
  advanceTime(dt);
  applyTime();
  refreshCone();
  update4(dt);
  if (mode === "impact") {
    imp.update(dt, W, H, dpr);
    renderer.setClearColor(0x000000, 1);
    renderer.render(imp.scene, imp.camera);
  } else if (mode === "system") {
    applySystemTime();
    sys.set4D(four.M, wMixed(four.ang), four.wk, four.tint);
    sys.update(dt, W, H, cam.auto);
    placeSysRing();
    renderer.render(sys.scene, sys.camera);
  } else {
    updateCamera(dt);
    updateLayers();
    if (frameNo % 6 === 1) chooseLabels();
    placeLabels();
    renderer.render(scene, camera);
  }
  updateHud();
  drawAxes4();
  if (frameNo % 10 === 0) { updateForecastPanel(); refreshCard(); }
  if (frameNo % 30 === 0) drawCharts();
  requestAnimationFrame(frame);
}

// ---------- 시작 ----------
(async () => {
  // 빌드는 상대 경로(base "./")라서, 한 단계 아래(/atlas/)에 있는 이 페이지에서 사이트 뿌리를 계산함
  const base = import.meta.env.BASE_URL, root = base.startsWith("/") ? base : new URL("../", location.href).pathname;
  const liveP = loadLive(root);
  try {
    data = await loadAtlasData(root, (m) => setText("loading", m));
  } catch (err) {
    setText("loading", "자료를 읽지 못했습니다: " + String(err));
    return;
  }
  setText("loading", "지도와 예측 만드는 중…");
  await new Promise((r) => setTimeout(r, 30));
  LIVE = await liveP;
  mergeExoplanets(LIVE.live.exoplanets.recent ?? []);
  buildLayers();
  buildIndex();
  buildScatter();
  fc = buildForecasts(data, starName, TL);
  fc.events = withLive(fc.events);
  renderLive();
  void liveTick();
  setInterval(() => void liveTick(), 5 * 60 * 1000);
  $("loading").hidden = true;
  let nVel = 0, nRV = 0;
  for (let i = 0; i < data.stars.n; i++) { const o = STRIDE * i; if (data.stars.buf[o + 5] || data.stars.buf[o + 6] || data.stars.buf[o + 7]) nVel++; if (data.stars.buf[o + 8] >= 16) nRV++; }
  setText("stats", row("별 (HYG v4.1)", data.stars.n.toLocaleString("ko-KR") + "개<small>운동이 측정된 별 " + nVel.toLocaleString("ko-KR") + " · 시선 속도까지 " + nRV.toLocaleString("ko-KR") + "</small>") + row("행성계 · 행성 (OEC)", data.systems.length.toLocaleString("ko-KR") + " · " + data.systems.reduce((s, x) => s + x.planets.length, 0).toLocaleString("ko-KR") + "개")
    + row("은하 (OpenNGC)", data.galaxies.length.toLocaleString("ko-KR") + "개") + row("위성·국부 은하군 · 구상성단 · 성운", (SATELLITES.length + LOCAL_GROUP.length) + " · " + GLOBULARS.length + " · " + NEBULAE.length) + row("은하단 · 초은하단 · 공동 · 블랙홀", LARGE_SCALE.length + " · " + BLACK_HOLES.length), true);
  setText("fateNote", TL.current.text + " (" + TL.current.source + ")");
  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(() => { drawScatter(); drawCharts(); }).observe($("charts"));
  resize();
  select({ kind: "sun", name: "태양" });
  cam.r = 3e4; cam.phi = 0.5;
  flyTo([0, 0, 0], 8, "태양 이웃", { phi: 1.05 });
  updateTimeUi();
  requestAnimationFrame(frame);
})();
