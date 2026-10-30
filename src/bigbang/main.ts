// 빅뱅 2D: 우주 한 단면의 입자 그림 + 팽창 시계 · 로그 시간 · 보통 시계 비교.
import { createCosmology, type Cosmology, type ModelName } from "../shared/cosmology";
import { buildBBN, buildIon, buildSFR, energyFractions, laOfTemp, type Ionization, type Nucleosynthesis, type StarFormation } from "../shared/physics";
import { buildEras, eraIndex, type Era } from "../shared/eras";
import { lum, rgba, skyColor } from "../shared/color";
import { clamp, frac, laZ, rng, smooth, type RGB } from "../shared/math";
import { compare, fmtEnergy, fmtLen, fmtNum, fmtTemp, fmtTime, GYR, sci, sup } from "../shared/format";
import { buildFates, ripLead, type Fate, type FateEvent, type FateKey } from "../shared/scenarios";
import { genIC2D } from "./field2d";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const NG = 64, NPART = NG * NG, L_BOX = 100, SEED = 20261030, MPC = 3.0857e22, RATE_LA = 0.8;
type ClockKind = "expand" | "logt" | "normal";

// ---------- 우주 (모형이 바뀌면 다시 만듦) ----------
interface World {
  core: Cosmology;
  ION: Ionization;
  BBN: Nucleosynthesis;
  SFR: StarFormation;
  eras: Era[];
  laSun: number;
  laQCD: number;
  psi: Float32Array;
  /** 재가열 시각과 미래 끝 시각 [s] */
  tRH: number;
  tMax: number;
  ltMin: number;
  ltMax: number;
  /** 미래 시나리오 네 가지 (오늘까지는 Planck 2018 역사) */
  fates: Record<FateKey, Fate>;
  desi: Cosmology;
}
let world: World;

function build(model: ModelName): void {
  const core = createCosmology({ model });
  const ION = buildIon(core), BBN = buildBBN(core), SFR = buildSFR(core);
  const E = buildEras(core, ION, BBN, SFR);
  const tRH = core.tOf(core.LA_RH), tMax = core.tOf(core.LA_MAX);
  const lcdm = model === "lcdm" ? core : createCosmology(), desi = model === "desi" ? core : createCosmology({ model: "desi" });
  world = {
    core, ION, BBN, SFR, eras: E.list, laSun: E.laSun, laQCD: laOfTemp(core, 156.5),
    psi: genIC2D(core, L_BOX, NG, SEED + (state.sameSeed ? 0 : state.cycle - 1)), tRH, tMax, ltMin: Math.log10(tRH), ltMax: Math.log10(tMax),
    fates: buildFates(lcdm, desi), desi,
  };
  buildJumps();
  paintClockBars();
  paintFateChart();
  fillShares();
  updateControls();
  lastText.clear();
}

// ---------- 입자 (격자 + 표시용 흔들림, 종류를 정할 난수) ----------
const qx = new Float32Array(NPART), qy = new Float32Array(NPART), u01 = new Float32Array(NPART), charge = new Uint8Array(NPART);
const ph1 = new Float32Array(NPART), ph2 = new Float32Array(NPART);
{
  const r = rng(77);
  for (let y = 0; y < NG; y++) for (let x = 0; x < NG; x++) {
    const i = y * NG + x;
    qx[i] = (x + 0.5 + (r() - 0.5) * 0.8) / NG;
    qy[i] = (y + 0.5 + (r() - 0.5) * 0.8) / NG;
    u01[i] = r(); charge[i] = Math.floor(r() * 3); ph1[i] = r() * 100; ph2[i] = r() * 100;
  }
}
const px = new Float32Array(NPART), py = new Float32Array(NPART);
const DG = 48, dens = new Float32Array(DG * DG);

// ---------- 화면 ----------
const stage = $("stage"), cv = $<HTMLCanvasElement>("cv"), ctx = cv.getContext("2d")!;
const clk = $<HTMLCanvasElement>("clk"), cctx = clk.getContext("2d")!, tip = $("tip");
let dpr = 1, SW = 0, SH = 0;
const tokens: Record<string, string> = {};

function readTokens(): void {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["muted", "ink", "line", "panel", "accent"]) tokens[k] = cs.getPropertyValue("--" + k).trim();
  if (world) paintClockBars();
}

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  SW = r.width; SH = r.height;
  cv.width = Math.round(SW * dpr); cv.height = Math.round(SH * dpr);
  const c = clk.getBoundingClientRect();
  clk.width = Math.round(c.width * dpr); clk.height = Math.round(c.height * dpr);
  const fc = fateCv.getBoundingClientRect();
  fateCv.width = Math.round(fc.width * dpr); fateCv.height = Math.round(fc.height * dpr);
  if (world) paintClockBars();
}

const PHASE_NOTE = [
  "인플라톤 장의 양자 요동",
  "쿼크–글루온 플라스마 (색전하 세 가지)",
  "양성자(붉은 점)와 중성자(회색 점)",
  "수소 원자핵과 헬륨-4 원자핵(호박색)",
  "중성 기체와 암흑물질 · 젤도비치 근사 2D 단면",
];

function phaseOf(la: number): number {
  const { core, BBN, ION } = world;
  if (la < core.LA_RH) return state.future ? 1 : 0;
  const Tm = core.TofA(Math.pow(10, la)) * core.KMEV, z = Math.pow(10, -la) - 1;
  return Tm > 156.5 ? 1 : la < BBN.laNuc ? 2 : z > ION.zHalf ? 3 : 4;
}

let clockT = 0;
function drawStage(la: number, dt: number): void {
  const { core, BBN, ION, SFR } = world;
  const a = Math.pow(10, la), z = 1 / a - 1;
  // 크런치 끝무렵(a가 재가열 때보다 작음)은 인플라톤 진공이 아니라 끝없이 뜨거워지는 플라스마
  const sky: RGB = state.future && la < core.LA_RH ? [255, 255, 255] : skyColor(core, la), light = lum(sky) > 0.55;
  stage.classList.toggle("light-sky", light);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = rgba(sky, 1);
  ctx.fillRect(0, 0, SW, SH);

  // 단면 상자를 화면에 꽉 차게 (긴 변 기준) 놓음
  const S = Math.max(SW, SH), ox = (SW - S) / 2, oy = (SH - S) / 2;
  const D = view.D, psi = world.psi;
  clockT += dt;
  const jit = la < -3.1 ? (la < core.LA_RH && !state.future ? 0.004 : 0.0015 + 0.004 * clamp((-3.1 - la) / 22, 0, 1)) : 0;
  for (let i = 0; i < NPART; i++) {
    let x = qx[i] + D * psi[2 * i], y = qy[i] + D * psi[2 * i + 1];
    if (jit) { x += jit * (frac(Math.sin(ph1[i] + clockT * 37) * 4375.5) - 0.5); y += jit * (frac(Math.sin(ph2[i] + clockT * 29) * 7613.1) - 0.5); }
    px[i] = x - Math.floor(x); py[i] = y - Math.floor(y);
  }

  const phase = phaseOf(la);
  const Tm = la < core.LA_RH ? 1e30 : core.TofA(a) * core.KMEV;
  const Xn = phase === 2 ? (la < BBN.la0 ? 1 / (1 + Math.exp(1.293 / Tm)) : BBN.XnAt(la)) : 0;
  const heF = phase === 3 ? BBN.heNum * smooth(BBN.laNuc, BBN.laNuc + 0.12, la) : 0;
  const unit = S / NG;

  if (phase < 4) {
    for (let i = 0; i < NPART; i++) {
      let c: RGB, al: number, sz: number;
      if (phase === 0) { c = [184, 153, 255]; al = 0.5; sz = 0.22; }
      else if (phase === 1) { c = charge[i] === 0 ? [199, 31, 51] : charge[i] === 1 ? [20, 140, 61] : [41, 69, 209]; al = 0.85; sz = 0.3; }
      else if (phase === 2) { c = u01[i] < Xn ? [79, 79, 99] : [191, 51, 36]; al = 0.85; sz = 0.3; }
      else { const he = u01[i] < heF; c = he ? [178, 115, 10] : [191, 61, 41]; al = he ? 0.95 : 0.75; sz = he ? 0.42 : 0.26; }
      ctx.fillStyle = rgba(c, al);
      ctx.beginPath(); ctx.arc(ox + px[i] * S, oy + py[i] * S, Math.max(1.1, sz * unit), 0, 6.2832); ctx.fill();
    }
  } else {
    // 밀도 격자 (가까운 칸 하나에 세기) → 기체 밝기와 별 형성 장소
    dens.fill(0);
    for (let i = 0; i < NPART; i++) dens[Math.min(DG - 1, Math.floor(py[i] * DG)) * DG + Math.min(DG - 1, Math.floor(px[i] * DG))] += DG * DG / NPART;
    const ion = clamp(ION.xe(Math.max(z, 0)), 0, 1);
    const dark = !light;
    const gas: RGB = dark ? [Math.round(128 + 45 * ion), Math.round(143 - 2 * ion), Math.round(217 + 18 * ion)] : [56, 51, 82];
    const starF = (la > laZ(25) ? smooth(laZ(25), laZ(3), la) : 0) * view.bound;
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (let i = 0; i < NPART; i++) {
      const d = dens[Math.min(DG - 1, Math.floor(py[i] * DG)) * DG + Math.min(DG - 1, Math.floor(px[i] * DG))];
      const al = dark ? 0.16 + 0.55 * clamp(Math.log(1 + d) / Math.log(11), 0, 1) : 0.7;
      ctx.fillStyle = rgba(gas, al);
      ctx.fillRect(ox + px[i] * S - 1, oy + py[i] * S - 1, 2.2, 2.2);
    }
    // 은하: 밀도가 평균의 4배를 넘는 곳에서 별이 켜짐. 별 형성 역사(MD14)를 따라 밝기, 시간에 따라 색이 붉어짐
    if (starF > 0) {
      const sfr = SFR.rhoAt(la) / SFR.rho0, warm = smooth(laZ(2), 0, la);
      const col: RGB = [Math.round(170 + 85 * warm), Math.round(200 + 30 * warm), Math.round(255 - 80 * warm)];
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < NPART; i++) {
        const d = dens[Math.min(DG - 1, Math.floor(py[i] * DG)) * DG + Math.min(DG - 1, Math.floor(px[i] * DG))];
        if (d < 4) continue;
        const b = starF * clamp(0.25 + 0.75 * Math.sqrt(sfr), 0, 1) * clamp((d - 4) / 12, 0.15, 1);
        const r = (1.2 + 2.2 * clamp((d - 4) / 20, 0, 1)) * (0.6 + 0.4 * starF);
        const g = ctx.createRadialGradient(ox + px[i] * S, oy + py[i] * S, 0, ox + px[i] * S, oy + py[i] * S, r * 2.5);
        g.addColorStop(0, rgba(col, 0.9 * b)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(ox + px[i] * S - r * 2.5, oy + py[i] * S - r * 2.5, r * 5, r * 5);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // 반등(새 순환 시작) 순간의 섬광
  if (flash > 0) { ctx.fillStyle = "rgba(255,255,255," + flash.toFixed(3) + ")"; ctx.fillRect(0, 0, SW, SH); flash = Math.max(0, flash - dt * 1.2); }

  // 빛의 안개: 평균 자유 경로가 단면보다 짧으면 불투명
  if (la >= core.LA_RH || state.future) {
    const side = L_BOX / core.h * MPC * a, lam = ION.mfp(Math.max(z, 0)) * a;
    const fog = clamp(Math.log10(side / lam) / 4, 0, 0.8);
    if (fog > 0.003) { ctx.fillStyle = rgba(sky, fog); ctx.fillRect(0, 0, SW, SH); }
  }

  // 팽창 고리: 10배 커질 때마다 한 바퀴
  const ringCol: RGB = la < core.LA_RH && !state.future ? [191, 153, 255] : light ? [41, 20, 61] : [204, 199, 255];
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    let u = la + k / 3; u -= Math.floor(u);
    ctx.strokeStyle = rgba(ringCol, (light ? 0.18 : 0.22) * Math.sin(Math.PI * u));
    ctx.beginPath(); ctx.arc(SW / 2, SH / 2, 0.06 * Math.min(SW, SH) * Math.pow(10, u), 0, 6.2832); ctx.stroke();
  }
  if (state.noCenter && state.observer >= 0) drawHubbleFlow(S, ox, oy, light);
  setText("hudNote", state.noCenter ? (state.observer < 0 ? "중심 없음: 아무 점이나 눌러 관측자로 삼아 보세요" : "관측자 기준 속도 v = H·d (화살표)") : PHASE_NOTE[phase]);
}

/**
 * 중심 없는 팽창: 고른 입자(관측자)에서 본 이웃들의 속도. 주기 경계에서 가장 가까운 복제본까지의 거리 d로 v = H·d.
 * 어느 입자를 골라도 화살표가 똑같이 바깥(수축 중이면 안쪽)을 향한다.
 */
function drawHubbleFlow(S: number, ox: number, oy: number, light: boolean): void {
  const o = state.observer, x0 = px[o], y0 = py[o], H = view.H;
  const near: [number, number, number][] = [];
  for (let i = 0; i < NPART; i++) {
    if (i === o) continue;
    let dx = px[i] - x0, dy = py[i] - y0;
    dx -= Math.round(dx); dy -= Math.round(dy);
    const d2 = dx * dx + dy * dy;
    if (d2 < 0.3 * 0.3 && (i * 2654435761 >>> 0) % 9 === 0) near.push([dx, dy, d2]);
  }
  const sgn = Math.sign(H) || 1, col: RGB = sgn > 0 ? (light ? [160, 30, 40] : [255, 120, 110]) : (light ? [30, 60, 170] : [120, 170, 255]);
  ctx.strokeStyle = rgba(col, 0.85); ctx.fillStyle = rgba(col, 0.85); ctx.lineWidth = 1.4;
  for (const [dx, dy] of near) {
    const sx = ox + (x0 + dx) * S, sy = oy + (y0 + dy) * S, k = 0.28 * sgn;
    const ex = sx + dx * S * k, ey = sy + dy * S * k, ang = Math.atan2(ey - sy, ex - sx);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 6 * Math.cos(ang - 0.4), ey - 6 * Math.sin(ang - 0.4)); ctx.lineTo(ex - 6 * Math.cos(ang + 0.4), ey - 6 * Math.sin(ang + 0.4)); ctx.fill();
  }
  const cx = ox + x0 * S, cy = oy + y0 * S;
  ctx.strokeStyle = light ? "rgba(20,10,40,0.9)" : "rgba(255,255,255,0.95)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 6.2832); ctx.stroke();
  ctx.font = "600 12px 'Noto Sans KR', system-ui, sans-serif"; ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = "left";
  ctx.fillText("관측자", cx + 13, cy - 10);
}

// ---------- 미래 시나리오 ----------
/** 화면에 쓰는 현재 값: 구조 성장 D, 묶인 구조가 남은 비율, 부호 있는 H */
const view = { D: 0, bound: 1, H: 0, t: 0, la: -38 };

function currentFate(): Fate | null {
  return state.fate === "none" ? null : world.fates[state.fate];
}

function updateView(): void {
  const { core } = world, f = currentFate();
  if (!state.future || !f) {
    view.la = state.la; view.t = core.tOf(state.la); view.H = core.Hs(Math.pow(10, state.la));
    view.D = core.growth(state.la); view.bound = 1;
    return;
  }
  const ended = f.end === "crunch" || f.end === "rip";
  const t = ended ? f.tEnd - state.rem : state.tf, a = ended ? f.aFromEnd(state.rem) : f.aAt(t);
  view.t = t; view.la = Math.log10(a); view.H = ended ? f.HFromEnd(state.rem) : f.HAt(t);
  // 수축 중에는 구조가 풀리지 않으므로 팽창 최대 때의 성장을 유지
  const contracting = f.tTurn !== null && (ended ? state.rem < f.tEnd - f.tTurn : t > f.tTurn);
  view.D = core.growth(Math.min(contracting ? Math.log10(f.aMax ?? 1) : view.la, 0.9));
  view.bound = 1;
  if (f.end === "rip") {
    // 은하단(약 10억 년 전) → 은하(약 6천만 년 전) 순으로 찢어짐: 구조가 흩어지고 별빛이 사라짐
    const rem = Math.max(state.rem, 1e-30), l1 = Math.log10(ripLead(3.5 * GYR)), l0 = Math.log10(ripLead(225e6 * 3.15576e7));
    view.bound = smooth(l0, l1, Math.log10(rem));
    view.D *= 0.15 + 0.85 * view.bound;
  }
}

/** 미래 시간 진행: 멀 때는 일정한 속도로, 끝(크런치·빅 립)에 가까우면 남은 시간이 기하급수로 줄어듦 */
function advanceFuture(f: Fate, dt: number): void {
  const sp = state.speed, span = f.tEnd - f.t0;
  if (f.end !== "crunch" && f.end !== "rip") {
    state.tf += span / 30 * sp * dt;
    if (state.tf >= f.tEnd) { state.tf = f.tEnd; state.running = false; updateControls(); }
    return;
  }
  const rem = state.rem;
  // 끝이 있는 시나리오는 남은 시간이 전체의 3%보다 짧아지면 1초에 10^1.6배씩 줄어드는 카운트다운으로 바꿈
  const countdown = (f.end === "crunch" || f.end === "rip") && rem < 0.03 * span;
  const next = countdown ? rem * Math.pow(10, -1.6 * sp * dt) : rem - span / 30 * sp * dt;
  const floor = f.end === "crunch" ? 1e-43 : f.end === "rip" ? 1e-22 : 0;
  if (next <= floor) {
    state.rem = floor;
    if (f.end === "crunch" && state.cyclic) { bounce(); return; }
    state.running = false; updateControls();
    return;
  }
  state.rem = next;
}

/** 순환 우주: 크런치에서 반등해 새 우주를 시작. 같은 초기 조건이면 같은 우주망이 다시 생김 */
function bounce(): void {
  state.cycle++;
  state.future = false;
  state.la = world.core.LA_MIN;
  state.observer = -1;
  world.psi = genIC2D(world.core, L_BOX, NG, SEED + (state.sameSeed ? 0 : state.cycle - 1));
  flash = 1;
  setText("cycleNote", cycleText(), true);
}
let flash = 0;

function cycleText(): string {
  if (!state.cyclic) return "";
  return "순환 " + state.cycle + "번째 우주 · " + (state.sameSeed
    ? "<b>같은 초기 조건</b>: 이 시뮬레이션은 결정론적이라 지난 순환과 똑같은 우주망이 다시 생깁니다(패턴 동일성)."
    : "<b>새 양자 요동</b>: 초기 조건이 달라 지난 순환과 다른 우주망이 생깁니다.")
    + " 실제 우주가 우연히 같은 상태로 돌아오려면(포앵카레 재귀) 엔트로피 S ≈ 10¹⁰⁴ k_B에 대해 약 e^S, 곧 10^(10¹⁰⁴)년 규모의 시간이 필요합니다.";
}

// ---------- 세 시계 비교 막대 ----------
const ROWS: { kind: ClockKind; label: string }[] = [
  { kind: "expand", label: "팽창 시계 · log a (10배 커질 때마다 한 칸)" },
  { kind: "logt", label: "로그 시간 · log t (시간이 10배 흐를 때마다 한 칸)" },
  { kind: "normal", label: "보통 시계 · t (같은 간격)" },
];
const ROW_H = 74, BAR_Y = 20, BAR_H = 26;
let bars: HTMLCanvasElement | null = null;

/** 막대 위 비율 u(0~1) → log a */
function uToLa(kind: ClockKind, u: number): number {
  const { core } = world;
  if (kind === "expand") return core.LA_MIN + u * (core.LA_MAX - core.LA_MIN);
  if (kind === "logt") return core.laOfT(Math.pow(10, world.ltMin + u * (world.ltMax - world.ltMin)));
  return core.laOfT(Math.max(world.tRH, u * world.tMax));
}
/** log a → 막대 위 비율 (인플레이션은 시간 시계에서 왼쪽 끝에 붙음) */
function laToU(kind: ClockKind, la: number): number {
  const { core } = world;
  if (kind === "expand") return (la - core.LA_MIN) / (core.LA_MAX - core.LA_MIN);
  if (la <= core.LA_RH) return 0;
  const t = core.tOf(la);
  if (kind === "logt") return clamp((Math.log10(t) - world.ltMin) / (world.ltMax - world.ltMin), 0, 1);
  return clamp(t / world.tMax, 0, 1);
}

function paintClockBars(): void {
  const w = clk.width / dpr;
  if (!w || !world) return;
  bars = document.createElement("canvas");
  bars.width = clk.width; bars.height = clk.height;
  const b = bars.getContext("2d")!;
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  b.font = "12px 'Noto Sans KR', system-ui, sans-serif";
  b.textBaseline = "alphabetic";
  const keyEras = new Set(["원소 합성", "우주배경복사", "첫 별", "우주의 정오", "태양", "오늘"]);
  ROWS.forEach((row, r) => {
    const y0 = r * ROW_H;
    b.fillStyle = tokens.ink || "#000"; b.textAlign = "left";
    b.fillText(row.label, 0, y0 + 14);
    for (let x = 0; x < w; x++) {
      b.fillStyle = rgba(skyColor(world.core, uToLa(row.kind, (x + 0.5) / w)), 1);
      b.fillRect(x, y0 + BAR_Y, 1.5, BAR_H);
    }
    b.strokeStyle = tokens.line || "#888"; b.lineWidth = 1;
    b.strokeRect(0.5, y0 + BAR_Y + 0.5, w - 1, BAR_H - 1);
    // 시대 경계 눈금과 주요 시대 이름 (겹치면 생략)
    let lastX = -1e9;
    b.font = "11px 'Noto Sans KR', system-ui, sans-serif";
    world.eras.forEach((e, i) => {
      if (i === 0 || e.la > world.core.LA_MAX) return;
      const ex = Math.round(laToU(row.kind, e.la) * w) + 0.5;
      b.strokeStyle = "rgba(128,128,140,0.6)";
      b.beginPath(); b.moveTo(ex, y0 + BAR_Y); b.lineTo(ex, y0 + BAR_Y + BAR_H + 4); b.stroke();
      if (!keyEras.has(e.short)) return;
      const tw = b.measureText(e.short).width;
      const lx = clamp(ex - tw / 2, 0, w - tw);
      if (lx < lastX + 6) return;
      b.fillStyle = tokens.muted || "#666";
      b.fillText(e.short, lx, y0 + BAR_Y + BAR_H + 16);
      lastX = lx + tw;
    });
    b.font = "12px 'Noto Sans KR', system-ui, sans-serif";
  });
}

function drawClocks(la: number): void {
  const w = clk.width / dpr;
  if (!w) return;
  cctx.setTransform(1, 0, 0, 1, 0, 0);
  cctx.clearRect(0, 0, clk.width, clk.height);
  if (bars) cctx.drawImage(bars, 0, 0);
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.font = "500 12px 'IBM Plex Mono', ui-monospace, monospace";
  cctx.textBaseline = "alphabetic";
  ROWS.forEach((row, r) => {
    // 미래(특히 수축)에서는 시간 시계는 t로 계속 앞으로 가고, 팽창 시계는 a를 따라 뒤로 돌아갈 수 있음
    const u = !state.future || row.kind === "expand" ? laToU(row.kind, la)
      : row.kind === "logt" ? clamp((Math.log10(view.t) - world.ltMin) / (world.ltMax - world.ltMin), 0, 1) : clamp(view.t / world.tMax, 0, 1);
    const y0 = r * ROW_H, x = Math.round(u * w);
    cctx.fillStyle = tokens.accent || "#63c";
    cctx.fillRect(clamp(x - 2, 0, w - 4), y0 + BAR_Y - 4, 4, BAR_H + 8);
    const pct = u * 100;
    const txt = (pct < 0.01 && pct > 0 ? "<0.01" : pct < 1 ? pct.toFixed(pct < 0.1 ? 3 : 2) : pct.toFixed(1)) + "%";
    cctx.textAlign = "right";
    cctx.fillStyle = tokens.ink || "#000";
    cctx.fillText(txt, w, y0 + 14);
  });
}

function rowAt(y: number): number {
  const r = Math.floor(y / ROW_H), yy = y - r * ROW_H;
  return r >= 0 && r < ROWS.length && yy >= BAR_Y - 6 && yy <= BAR_Y + BAR_H + 6 ? r : -1;
}
clk.addEventListener("pointermove", (e) => {
  const rect = clk.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top, r = rowAt(y);
  if (r < 0 || !world) { tip.hidden = true; return; }
  const la = uToLa(ROWS[r].kind, clamp(x / rect.width, 0, 1)), e2 = world.eras[eraIndex(world.eras, la)];
  tip.innerHTML = "<b>" + e2.name + "</b><br>" + (la < world.core.LA_RH ? "인플레이션" : "빅뱅 후 " + fmtTime(world.core.tOf(la))) + " · a = 10" + sup(la.toFixed(1));
  tip.style.left = clamp(x, 100, rect.width - 100) + "px";
  tip.style.top = r * ROW_H + BAR_Y - 6 + "px";
  tip.hidden = false;
});
clk.addEventListener("pointerleave", () => { tip.hidden = true; });
clk.addEventListener("click", (e) => {
  const rect = clk.getBoundingClientRect(), r = rowAt(e.clientY - rect.top);
  if (r < 0) return;
  state.future = false;
  state.la = Math.min(0, uToLa(ROWS[r].kind, clamp((e.clientX - rect.left) / rect.width, 0, 1)));
  state.running = false; updateControls();
});

/** 주요 사건 이전 구간이 막대에서 차지하는 비율 */
function fillShares(): void {
  const { core, BBN, ION } = world;
  const moments: [string, number][] = [
    ["원소 합성 (" + fmtTime(BBN.tNuc) + ")까지", BBN.laNuc],
    ["우주배경복사 (" + fmtTime(core.tOf(laZ(ION.zHalf))) + ")까지", laZ(ION.zHalf)],
    ["첫 별 (z ≈ 25)까지", laZ(25)],
    ["태양계 탄생까지", world.laSun],
  ];
  const pc = (u: number) => { const p = u * 100; return p < 0.001 ? "<0.001%" : p < 1 ? p.toPrecision(2) + "%" : p.toFixed(1) + "%"; };
  $("share").innerHTML = moments.map(([name, la]) =>
    "<dt>" + name + "</dt><dd>팽창 " + pc(laToU("expand", la)) + " · 로그 시간 " + pc(laToU("logt", la)) + " · 보통 " + pc(laToU("normal", la)) + "</dd>").join("");
}

// ---------- 미래 시나리오 그래프: 우주 크기 a(t) ----------
const fateCv = $<HTMLCanvasElement>("fateCv"), fctx = fateCv.getContext("2d")!;
const FATE_KEYS: FateKey[] = ["lcdm", "desi", "crunch", "rip"];
const FATE_COL: Record<FateKey, string> = { lcdm: "#2a78d6", desi: "#1baf7a", crunch: "#eb6834", rip: "#d55181" };
const CH = { tMax: 60 * GYR, aMax: 4.5, padL: 34, padB: 22, padT: 8 };

function fateXY(t: number, a: number, w: number, h: number): [number, number] {
  return [CH.padL + t / CH.tMax * (w - CH.padL - 4), CH.padT + (1 - Math.min(a, CH.aMax) / CH.aMax) * (h - CH.padT - CH.padB)];
}
function paintFateChart(): void { /* 매 프레임 drawFateChart에서 그림 (곡선 표본이 적어 가벼움) */ }

function drawFateChart(): void {
  const w = fateCv.width / dpr, h = fateCv.height / dpr;
  if (!w || !world) return;
  const c = fctx, { core } = world;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  c.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  c.fillStyle = tokens.muted || "#666"; c.strokeStyle = tokens.line || "#ccc"; c.lineWidth = 1;
  // 축과 눈금
  for (let g = 0; g <= 60; g += 10) {
    const [x] = fateXY(g * GYR, 0, w, h);
    c.beginPath(); c.moveTo(x + 0.5, CH.padT); c.lineTo(x + 0.5, h - CH.padB); c.stroke();
    c.textAlign = "center"; c.fillText(g === 0 ? "빅뱅" : g * 10 + "억 년", x, h - 6);
  }
  for (let a = 0; a <= 4; a++) {
    const [, y] = fateXY(0, a, w, h);
    c.beginPath(); c.moveTo(CH.padL, y + 0.5); c.lineTo(w - 4, y + 0.5); c.stroke();
    c.textAlign = "right"; c.fillText("a=" + a, CH.padL - 4, y + 4);
  }
  // 과거 (모두 같음)
  const t0 = core.tOf(0);
  c.strokeStyle = tokens.ink || "#000"; c.lineWidth = 2.2; c.beginPath();
  for (let i = 0; i <= 120; i++) {
    const t = t0 * i / 120, [x, y] = fateXY(t, i === 0 ? 0 : Math.pow(10, core.laOfT(t)), w, h);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  // 미래 네 가지
  for (const k of FATE_KEYS) {
    const f = world.fates[k], sel = state.fate === k, tEndShow = Math.min(f.tEnd, CH.tMax);
    c.strokeStyle = FATE_COL[k]; c.globalAlpha = sel ? 1 : 0.45; c.lineWidth = sel ? 2.6 : 1.5;
    c.beginPath();
    const N = 240;
    for (let i = 0; i <= N; i++) {
      const t = t0 + (tEndShow - t0) * (1 - Math.pow(1 - i / N, 2)), a = f.aAt(t), [x, y] = fateXY(t, a, w, h);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      if (a > CH.aMax) break; // 그래프 위로 벗어나면 거기서 멈춤 (평평한 선처럼 보이지 않게)
    }
    c.stroke();
    if (f.end === "crunch" || f.end === "rip") {
      const [x, y] = fateXY(f.tEnd, f.end === "crunch" ? 0 : CH.aMax, w, h);
      c.fillStyle = FATE_COL[k]; c.beginPath(); c.arc(x, y, sel ? 4.5 : 3, 0, 6.2832); c.fill();
    }
    c.globalAlpha = 1;
  }
  // 오늘과 현재 위치
  const [xn] = fateXY(t0, 0, w, h);
  c.setLineDash([3, 3]); c.strokeStyle = tokens.muted || "#666"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(xn + 0.5, CH.padT); c.lineTo(xn + 0.5, h - CH.padB); c.stroke(); c.setLineDash([]);
  c.fillStyle = tokens.muted || "#666"; c.textAlign = "left"; c.fillText("오늘", xn + 4, CH.padT + 10);
  if (view.t > 0 && view.t <= CH.tMax) {
    const [x, y] = fateXY(view.t, Math.pow(10, view.la), w, h);
    c.fillStyle = tokens.accent || "#63c"; c.beginPath(); c.arc(x, y, 5.5, 0, 6.2832); c.fill();
    c.strokeStyle = tokens.panel || "#fff"; c.lineWidth = 2; c.stroke();
  }
}

fateCv.addEventListener("click", (e) => {
  const r = fateCv.getBoundingClientRect(), w = r.width, h = r.height;
  const t = clamp((e.clientX - r.left - CH.padL) / (w - CH.padL - 4), 0, 1) * CH.tMax, t0 = world.core.tOf(0);
  if (t <= t0) { state.future = false; state.la = world.core.laOfT(t); }
  else {
    // 누른 높이에 가장 가까운 곡선의 시나리오를 고름
    const ya = (1 - (e.clientY - r.top - CH.padT) / (h - CH.padT - CH.padB)) * CH.aMax;
    let best: FateKey = state.fate === "none" ? "lcdm" : state.fate, bd = 1e9;
    for (const k of FATE_KEYS) { const f = world.fates[k]; if (t > f.tEnd) continue; const d = Math.abs(Math.min(f.aAt(t), CH.aMax) - ya); if (d < bd) { bd = d; best = k; } }
    selectFate(best);
    setFutureT(Math.min(t, world.fates[best].tEnd - 1));
  }
  state.running = false; updateControls();
});

/** 끝 근처 사건은 남은 시간으로 비교 (t는 배정밀도로 구별되지 않음) */
function eventPassed(f: Fate, e: FateEvent, t: number): boolean {
  return (f.end === "crunch" || f.end === "rip") && e.rem !== undefined ? state.rem <= e.rem : t >= e.t;
}

function fateInfoHtml(f: Fate, t: number): string {
  const t0 = f.t0;
  const when = (tt: number) => (tt <= t0 ? "오늘" : "지금부터 " + fmtTime(tt - t0) + " 뒤");
  const endTxt = f.end === "crunch" ? "빅 크런치: 빅뱅 후 " + (f.tEnd / GYR * 10).toFixed(0) + "억 년 (" + when(f.tEnd) + ")"
    : f.end === "rip" ? "빅 립: 빅뱅 후 " + (f.tEnd / GYR * 10).toFixed(0) + "억 년 (" + when(f.tEnd) + ")"
      : f.end === "decelerate" ? "끝없이 팽창하지만 언젠가 감속" : "끝없이 가속 팽창";
  const items = f.events.map((e) => "<li" + (state.future && state.fate === f.key && eventPassed(f, e, t) ? ' class="past"' : "") + "><b>" + e.label + "</b> · " + when(e.t) + "<br><span>" + e.detail + "</span></li>").join("");
  return "<h3>" + f.name + "</h3><p class=\"src\">" + f.source + "</p><p>" + f.text + "</p><p class=\"end\">" + endTxt + "</p><ol class=\"events\">" + items + "</ol>";
}

// ---------- 계기판 ----------
const lastText = new Map<string, string>();
function setText(id: string, v: string, html = false): void {
  if (lastText.get(id) === v) return;
  lastText.set(id, v);
  if (html) $(id).innerHTML = v; else $(id).textContent = v;
}

function updatePanel(la: number): void {
  const { core, ION, BBN } = world, fate = state.future ? currentFate() : null;
  const a = Math.pow(10, la), t = view.t, z = 1 / a - 1, ei = eraIndex(world.eras, la), e = world.eras[ei];
  const aTxt = "a = " + (la > -2 ? a.toPrecision(3) : sci(a));
  const zTxt = Math.abs(z) < 5e-4 && !state.future ? "z = 0 (오늘)" : z < 0 ? "z = " + z.toFixed(3) + " (오늘보다 큼)" : "z = " + (z < 10 ? z.toFixed(3) : z < 1e5 ? fmtNum(z) : sci(z));
  setText("rA", aTxt + "<small>" + zTxt + (fate && view.H < 0 ? " · 수축 중" : "") + "</small>", true);
  const tTxt = !state.future && la < core.LA_RH ? "인플레이션 끝나기 " + fmtTime(core.tOf(core.LA_RH) - t) + " 전" : fmtTime(t);
  setText("rT", tTxt + (fate && fate.end !== "forever" && fate.end !== "decelerate" ? "<small>" + (fate.end === "crunch" ? "크런치" : "빅 립") + "까지 " + fmtTime(Math.max(state.rem, 0)) + "</small>" : ""), true);
  const T = !state.future && la < core.LA_RH ? 0 : core.TofA(a), kT = T * core.KMEV;
  const tempTxt = fmtTemp(T) + " K";
  setText("rTemp", !state.future && la < core.LA_RH ? "정의 안 됨 (진공 에너지 지배)" : tempTxt + "<small>kT = " + fmtEnergy(kT) + "</small>", true);
  const Hkm = view.H * 3.0857e19, aH = Math.abs(Hkm);
  setText("rH", !state.future && la < core.LA_RH ? sci(core.Hs(Math.pow(10, core.LA_RH))) + " /초 (일정)"
    : (Hkm < 0 ? "−" : "") + (aH < 1e5 ? aH.toFixed(aH < 1000 ? 2 : 0) : sci(aH)) + " km/s/Mpc" + (Hkm < 0 ? "<small>음수: 수축 (먼 은하가 다가옴, 청색편이)</small>" : ""), true);
  const side = L_BOX / core.h * MPC * a;
  setText("rSize", fmtLen(side) + "<small>" + compare(side) + "</small>", true);
  if (!state.future && la < core.LA_RH) setText("rMfp", "—");
  else {
    const lam = ION.mfp(Math.max(z, 0)) * a;
    setText("rMfp", fmtLen(lam) + "<small>" + (lam > side ? "단면보다 김: 투명" : "단면의 " + sci(lam / side, 1) + ": 불투명") + "</small>", true);
  }
  const Tm = !state.future && la < core.LA_RH ? 1e30 : kT;
  let nuc: string;
  if (!state.future && la < core.LA_RH) nuc = "입자 없음 (인플라톤 장)";
  else if (Tm > 156.5) nuc = "쿼크–글루온 플라스마";
  else if (state.future && Tm > 0.08) nuc = "원자핵이 다시 양성자·중성자로 부서짐<small>kT = " + fmtEnergy(Tm) + "</small>";
  else if (la < BBN.la0) nuc = "양성자·중성자 평형<small>n/p = e^(−Q/kT) = " + Math.exp(-1.293 / Tm).toFixed(3) + "</small>";
  else if (la < BBN.laNuc) { const X = BBN.XnAt(la); nuc = "n/p = " + (X / (1 - X)).toFixed(4) + "<small>약한 반응률 적분 (계산)</small>"; }
  else nuc = "Yₚ = " + BBN.YpCalc.toFixed(3) + " (계산)<small>관측 0.2453 ± 0.0034 (Aver 외 2021)</small>";
  setText("rNuc", nuc, true);
  const D = view.D;
  setText("rS8", !state.future && la < -6 ? "≈ 0 (복사 시대)" : (core.P.sigma8 * D).toPrecision(3) + "<small>" + (view.bound < 0.999 ? "묶인 구조 " + Math.round(view.bound * 100) + "% 남음" : "선형 성장 D = " + D.toPrecision(3)) + "</small>", true);

  // 에너지 구성: 크런치 모형은 음의 우주상수가 있어 막대로 나타낼 수 없음
  const f = !fate ? energyFractions(core, la) : fate.key === "desi" ? energyFractions(world.desi, la) : fate.key === "lcdm" ? energyFractions(core, la) : fate.key === "rip" ? ripFractions(a) : null;
  const pct = (v: number) => (v >= 0.9995 ? "100%" : v < 0.0005 ? (v > 0 ? "<0.1%" : "0%") : (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%");
  const widths: [string, number][] = [["mDE", f ? f.de : 0], ["mDM", f ? f.c : 0], ["mB", f ? f.b : 0], ["mR", f ? f.r : 0]];
  for (const [id, v] of widths) $(id).style.width = v * 100 + "%";
  setText("mixLegend", fate?.key === "crunch" ? "<span>음의 우주상수(−)와 굴러가는 축이온 장(+)이 겨룹니다. 합이 물질을 이기지 못하면 팽창이 멈춥니다.</span>"
    : !f ? '<span><i style="background:var(--c-inf)"></i>인플라톤 장 100%</span>'
    : '<span><i style="background:var(--c-de)"></i>암흑에너지 ' + pct(f.de) + '</span><span><i style="background:var(--c-dm)"></i>암흑물질 ' + pct(f.c) +
      '</span><span><i style="background:var(--c-b)"></i>보통 물질 ' + pct(f.b) + '</span><span><i style="background:var(--c-rad)"></i>복사 ' + pct(f.r) + "</span>", true);

  if (fate) {
    const ev = [...fate.events].reverse().find((x) => eventPassed(fate, x, t));
    const title = ev ? ev.label : "오늘 이후";
    setText("eraTitle", title);
    setText("eraText", ev ? ev.detail : fate.text);
    setText("hudEra", title);
    setText("hudSub", "빅뱅 후 " + fmtTime(t) + " · " + fate.short);
  } else {
    setText("eraTitle", e.name);
    setText("eraText", e.text);
    setText("hudEra", la <= core.LA_MIN + 1e-9 && state.cycle === 1 ? "시작 (t = 0 근처)" : e.name);
    setText("hudSub", la <= core.LA_MIN + 1e-9 ? "그 이전(플랑크 시간 5.4 × 10⁻⁴⁴ 초 전)은 양자중력 없이는 계산할 수 없음" : la < core.LA_RH ? tTxt : "빅뱅 후 " + fmtTime(t));
  }
  setText("hudA", aTxt + " · " + zTxt + (state.cyclic ? " · 순환 " + state.cycle : ""));
  setText("hudT", !state.future && la < core.LA_RH ? "인플라톤 장" : tempTxt + " · " + fmtEnergy(kT));
  setText("hudSize", "단면 한 변 " + fmtLen(side));
  setText("fateInfo", fate || state.fate !== "none" ? fateInfoHtml(world.fates[state.fate === "none" ? "lcdm" : state.fate], t) : "", true);
  if (lastEra !== ei) { lastEra = ei; jumpBtns.forEach((b, k) => b.setAttribute("aria-pressed", String(k === ei && !state.future))); }
}

/** w = −1.5 팬텀 에너지의 구성비 (ρ_DE ∝ a^1.5) */
function ripFractions(a: number): { r: number; b: number; c: number; de: number } {
  const { core } = world, r = core.Or / Math.pow(a, 4), b = core.Ob / Math.pow(a, 3), c = (core.Oc + core.Onu) / Math.pow(a, 3), de = (1 - core.Om - core.Or) * Math.pow(a, 1.5), s = r + b + c + de;
  return { r: r / s, b: b / s, c: c / s, de: de / s };
}

// ---------- 상태와 조작 ----------
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const state = {
  la: -38, running: !reduceMotion, clock: "expand" as ClockKind, speed: 1, model: "lcdm" as ModelName,
  /** 오늘 이후로 이어 갈 시나리오 */
  fate: "lcdm" as FateKey | "none",
  /** 미래 모드: 오늘이 지나면 t(빅뱅 후 초)로 진행 */
  future: false, tf: 0, rem: 0,
  cyclic: false, sameSeed: true, cycle: 1,
  noCenter: false, observer: -1,
};
if (reduceMotion) state.la = -0.4;

let jumpBtns: HTMLButtonElement[] = [], lastEra = -1;
function buildJumps(): void {
  const box = $("jumps");
  box.innerHTML = "";
  jumpBtns = world.eras.map((e) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = e.short; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      state.future = false;
      state.la = Math.min(0, e.la + (e.la === 0 ? 0 : 0.0005));
      if (e.la > 0 && state.fate !== "none") setFutureT(world.fates[state.fate].t0 + 2 * GYR);
    });
    box.appendChild(b);
    return b;
  });
  lastEra = -1;
}

const LOGT_SECONDS = 40, NORMAL_SECONDS = 40;
function atEnd(): boolean {
  const f = currentFate();
  if (!state.future || !f) return false;
  return f.end === "crunch" || f.end === "rip" ? state.rem <= (f.end === "crunch" ? 2e-43 : 2e-22) : state.tf >= f.tEnd;
}
function updateControls(): void {
  $("playBtn").textContent = state.running ? "일시정지" : atEnd() || (!currentFate() && state.la >= 0) ? "다시 재생" : "재생";
  const sp = state.speed, core = world.core;
  $("clockNote").textContent = (state.clock === "expand"
    ? "팽창 시계: 재생 1초마다 우주가 " + Math.pow(10, RATE_LA * sp).toFixed(1) + "배 커집니다. 인플레이션부터 오늘까지 약 " + Math.round(-core.LA_MIN / (RATE_LA * sp)) + "초."
    : state.clock === "logt"
      ? "로그 시간: 재생 1초마다 시간이 " + Math.pow(10, (world.ltMax - world.ltMin) / LOGT_SECONDS * sp).toFixed(1) + "배 흐릅니다. 인플레이션(시간 눈금에 담기지 않음)은 팽창 시계로 지나갑니다."
      : "보통 시계: 재생 1초마다 " + fmtTime(world.tMax / NORMAL_SECONDS * sp) + "가 흐릅니다. 그 앞의 모든 시대는 첫 프레임 안에 지나갑니다.")
    + (state.fate === "none" ? " 오늘에서 멈춥니다." : " 오늘 이후는 ‘" + world.fates[state.fate].short + "’ 시나리오로 우주 시간 t에 따라 진행합니다.");
  setText("cycleNote", cycleText(), true);
}

function chipGroup(id: string, attr: string, fn: (v: string) => void): void {
  const box = $(id);
  box.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[" + attr + "]");
    if (!b) return;
    box.querySelectorAll("[" + attr + "]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    fn(b.getAttribute(attr)!);
  });
}
/** 미래 시각 t로 이동 (끝이 있는 시나리오는 남은 시간으로도 저장) */
function setFutureT(t: number): void {
  const f = currentFate();
  if (!f) return;
  state.future = true; state.tf = t; state.rem = Math.max(f.tEnd - t, 0);
}
function selectFate(k: FateKey | "none"): void {
  const keepT = view.t;
  state.fate = k;
  if (k !== "none" && state.future) setFutureT(Math.min(keepT, world.fates[k].tEnd - 1));
  $("fateChips").querySelectorAll("[data-fate]").forEach((x) => x.setAttribute("aria-pressed", String(x.getAttribute("data-fate") === k)));
  if (k === "none" || (state.future && state.tf > world.fates[k].tEnd)) state.future = false;
  ($("cyclicBox") as HTMLInputElement).disabled = k !== "crunch";
  if (k !== "crunch") { state.cyclic = false; ($("cyclicBox") as HTMLInputElement).checked = false; }
  updateControls();
}
chipGroup("clockChips", "data-clock", (v) => { state.clock = v as ClockKind; updateControls(); });
chipGroup("speedChips", "data-speed", (v) => { state.speed = parseFloat(v); updateControls(); });
chipGroup("modelChips", "data-model", (v) => { if (v !== state.model) { state.model = v as ModelName; state.future = false; build(state.model); } });
$("fateChips").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-fate]");
  if (b) selectFate(b.getAttribute("data-fate") as FateKey | "none");
});
$<HTMLInputElement>("cyclicBox").addEventListener("change", (e) => { state.cyclic = (e.target as HTMLInputElement).checked; state.cycle = 1; updateControls(); });
$<HTMLInputElement>("seedBox").addEventListener("change", (e) => { state.sameSeed = (e.target as HTMLInputElement).checked; updateControls(); });
$<HTMLInputElement>("noCenterBox").addEventListener("change", (e) => { state.noCenter = (e.target as HTMLInputElement).checked; if (!state.noCenter) state.observer = -1; });
$("playBtn").addEventListener("click", () => {
  if (!state.running && (atEnd() || (!currentFate() && state.la >= 0))) restart();
  state.running = !state.running; updateControls();
});
function restart(): void {
  state.future = false; state.la = world.core.LA_MIN; state.cycle = 1; state.observer = -1;
  world.psi = genIC2D(world.core, L_BOX, NG, SEED);
}
$("restartBtn").addEventListener("click", () => { restart(); state.running = true; updateControls(); });

// 관측자 고르기: 화면에서 가장 가까운 입자
stage.addEventListener("click", (e) => {
  if (!state.noCenter) return;
  const r = stage.getBoundingClientRect(), S = Math.max(SW, SH), ox = (SW - S) / 2, oy = (SH - S) / 2;
  const x = (e.clientX - r.left - ox) / S, y = (e.clientY - r.top - oy) / S;
  let best = -1, bd = 1e9;
  for (let i = 0; i < NPART; i++) { const d = (px[i] - x) ** 2 + (py[i] - y) ** 2; if (d < bd) { bd = d; best = i; } }
  state.observer = best;
});

function advance(dt: number): void {
  const { core } = world, sp = state.speed, f = currentFate();
  if (state.future && f) { advanceFuture(f, dt); return; }
  if (state.clock === "expand" || (state.clock === "logt" && state.la < core.LA_RH)) state.la += RATE_LA * sp * dt;
  else if (state.clock === "logt") {
    const lt = Math.log10(core.tOf(state.la)) + (world.ltMax - world.ltMin) / LOGT_SECONDS * sp * dt;
    state.la = core.laOfT(Math.pow(10, lt));
  } else state.la = core.laOfT(core.tOf(state.la) + world.tMax / NORMAL_SECONDS * sp * dt);
  // 오늘에 닿으면: 시나리오가 있으면 미래로, 없으면 멈춤
  if (state.la >= 0) {
    state.la = 0;
    if (f) setFutureT(f.t0);
    else { state.running = false; updateControls(); }
  }
}

// ---------- 시작 ----------
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", readTokens);
new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
readTokens();
build(state.model);
const ro = new ResizeObserver(resize);
ro.observe(stage); ro.observe(clk); ro.observe(fateCv);
resize();

let prev = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (state.running) advance(dt);
  updateView();
  drawStage(view.la, dt);
  drawClocks(view.la);
  drawFateChart();
  updatePanel(view.la);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
