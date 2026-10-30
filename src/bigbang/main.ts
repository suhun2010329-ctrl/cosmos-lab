// 빅뱅 2D: 우주 한 단면의 입자 그림 + 팽창 시계 · 로그 시간 · 보통 시계 비교.
import { createCosmology, type Cosmology, type ModelName } from "../shared/cosmology";
import { buildBBN, buildIon, buildSFR, energyFractions, laOfTemp, type Ionization, type Nucleosynthesis, type StarFormation } from "../shared/physics";
import { buildEras, eraIndex, type Era } from "../shared/eras";
import { lum, rgba, skyColor } from "../shared/color";
import { clamp, frac, laZ, rng, smooth, type RGB } from "../shared/math";
import { compare, fmtEnergy, fmtLen, fmtNum, fmtTemp, fmtTime, sci, sup } from "../shared/format";
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
}
let world: World;

function build(model: ModelName): void {
  const core = createCosmology({ model });
  const ION = buildIon(core), BBN = buildBBN(core), SFR = buildSFR(core);
  const E = buildEras(core, ION, BBN, SFR);
  const tRH = core.tOf(core.LA_RH), tMax = core.tOf(core.LA_MAX);
  world = {
    core, ION, BBN, SFR, eras: E.list, laSun: E.laSun, laQCD: laOfTemp(core, 156.5),
    psi: genIC2D(core, L_BOX, NG, SEED), tRH, tMax, ltMin: Math.log10(tRH), ltMax: Math.log10(tMax),
  };
  buildJumps();
  paintClockBars();
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
  if (la < core.LA_RH) return 0;
  const Tm = core.TofA(Math.pow(10, la)) * core.KMEV, z = Math.pow(10, -la) - 1;
  return Tm > 156.5 ? 1 : la < BBN.laNuc ? 2 : z > ION.zHalf ? 3 : 4;
}

let clockT = 0;
function drawStage(la: number, dt: number): void {
  const { core, BBN, ION, SFR } = world;
  const a = Math.pow(10, la), z = 1 / a - 1;
  const sky = skyColor(core, la), light = lum(sky) > 0.55;
  stage.classList.toggle("light-sky", light);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = rgba(sky, 1);
  ctx.fillRect(0, 0, SW, SH);

  // 단면 상자를 화면에 꽉 차게 (긴 변 기준) 놓음
  const S = Math.max(SW, SH), ox = (SW - S) / 2, oy = (SH - S) / 2;
  const D = core.growth(la), psi = world.psi;
  clockT += dt;
  const jit = la < -3.1 ? (la < core.LA_RH ? 0.004 : 0.0015 + 0.004 * clamp((-3.1 - la) / 22, 0, 1)) : 0;
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
    const starF = la > laZ(25) ? smooth(laZ(25), laZ(3), la) : 0;
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

  // 빛의 안개: 평균 자유 경로가 단면보다 짧으면 불투명
  if (la >= core.LA_RH) {
    const side = L_BOX / core.h * MPC * a, lam = ION.mfp(Math.max(z, 0)) * a;
    const fog = clamp(Math.log10(side / lam) / 4, 0, 0.8);
    if (fog > 0.003) { ctx.fillStyle = rgba(sky, fog); ctx.fillRect(0, 0, SW, SH); }
  }

  // 팽창 고리: 10배 커질 때마다 한 바퀴
  const ringCol: RGB = la < core.LA_RH ? [191, 153, 255] : light ? [41, 20, 61] : [204, 199, 255];
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    let u = la + k / 3; u -= Math.floor(u);
    ctx.strokeStyle = rgba(ringCol, (light ? 0.18 : 0.22) * Math.sin(Math.PI * u));
    ctx.beginPath(); ctx.arc(SW / 2, SH / 2, 0.06 * Math.min(SW, SH) * Math.pow(10, u), 0, 6.2832); ctx.stroke();
  }
  setText("hudNote", PHASE_NOTE[phase]);
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
    const y0 = r * ROW_H, u = laToU(row.kind, la), x = Math.round(u * w);
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
  state.la = uToLa(ROWS[r].kind, clamp((e.clientX - rect.left) / rect.width, 0, 1));
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

// ---------- 계기판 ----------
const lastText = new Map<string, string>();
function setText(id: string, v: string, html = false): void {
  if (lastText.get(id) === v) return;
  lastText.set(id, v);
  if (html) $(id).innerHTML = v; else $(id).textContent = v;
}

function updatePanel(la: number): void {
  const { core, ION, BBN } = world;
  const a = Math.pow(10, la), t = core.tOf(la), z = 1 / a - 1, ei = eraIndex(world.eras, la), e = world.eras[ei];
  const aTxt = "a = " + (la > -2 ? a.toPrecision(3) : sci(a));
  const zTxt = Math.abs(z) < 5e-4 ? "z = 0 (오늘)" : z < 0 ? "z = " + z.toFixed(3) + " (미래)" : "z = " + (z < 10 ? z.toFixed(3) : z < 1e5 ? fmtNum(z) : sci(z));
  setText("rA", aTxt + "<small>" + zTxt + "</small>", true);
  const tTxt = la < core.LA_RH ? "인플레이션 끝나기 " + fmtTime(core.tOf(core.LA_RH) - t) + " 전" : fmtTime(t);
  setText("rT", tTxt);
  const T = la < core.LA_RH ? 0 : core.TofA(a), kT = T * core.KMEV;
  const tempTxt = fmtTemp(T) + " K";
  setText("rTemp", la < core.LA_RH ? "정의 안 됨 (진공 에너지 지배)" : tempTxt + "<small>kT = " + fmtEnergy(kT) + "</small>", true);
  const Hkm = core.Hs(a) * 3.0857e19;
  setText("rH", la < core.LA_RH ? sci(core.Hs(Math.pow(10, core.LA_RH))) + " /초 (일정)" : (Hkm < 1e5 ? Hkm.toFixed(Hkm < 1000 ? 2 : 0) : sci(Hkm)) + " km/s/Mpc");
  const side = L_BOX / core.h * MPC * a;
  setText("rSize", fmtLen(side) + "<small>" + compare(side) + "</small>", true);
  if (la < core.LA_RH) setText("rMfp", "—");
  else {
    const lam = ION.mfp(Math.max(z, 0)) * a;
    setText("rMfp", fmtLen(lam) + "<small>" + (lam > side ? "단면보다 김: 투명" : "단면의 " + sci(lam / side, 1) + ": 불투명") + "</small>", true);
  }
  const Tm = la < core.LA_RH ? 1e30 : kT;
  let nuc: string;
  if (la < core.LA_RH) nuc = "입자 없음 (인플라톤 장)";
  else if (Tm > 156.5) nuc = "쿼크–글루온 플라스마";
  else if (la < BBN.la0) nuc = "양성자·중성자 평형<small>n/p = e^(−Q/kT) = " + Math.exp(-1.293 / Tm).toFixed(3) + "</small>";
  else if (la < BBN.laNuc) { const X = BBN.XnAt(la); nuc = "n/p = " + (X / (1 - X)).toFixed(4) + "<small>약한 반응률 적분 (계산)</small>"; }
  else nuc = "Yₚ = " + BBN.YpCalc.toFixed(3) + " (계산)<small>관측 0.2453 ± 0.0034 (Aver 외 2021)</small>";
  setText("rNuc", nuc, true);
  const D = core.growth(la);
  setText("rS8", la < -6 ? "≈ 0 (복사 시대)" : (core.P.sigma8 * D).toPrecision(3) + "<small>선형 성장 D(a) = " + D.toPrecision(3) + "</small>", true);

  const f = energyFractions(core, la);
  const pct = (v: number) => (v >= 0.9995 ? "100%" : v < 0.0005 ? (v > 0 ? "<0.1%" : "0%") : (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%");
  const widths: [string, number][] = [["mDE", f ? f.de : 0], ["mDM", f ? f.c : 0], ["mB", f ? f.b : 0], ["mR", f ? f.r : 0]];
  for (const [id, v] of widths) $(id).style.width = v * 100 + "%";
  setText("mixLegend", !f ? '<span><i style="background:var(--c-inf)"></i>인플라톤 장 100%</span>'
    : '<span><i style="background:var(--c-de)"></i>암흑에너지 ' + pct(f.de) + '</span><span><i style="background:var(--c-dm)"></i>암흑물질 ' + pct(f.c) +
      '</span><span><i style="background:var(--c-b)"></i>보통 물질 ' + pct(f.b) + '</span><span><i style="background:var(--c-rad)"></i>복사 ' + pct(f.r) + "</span>", true);

  setText("eraTitle", e.name);
  setText("eraText", e.text);
  setText("hudEra", e.name);
  setText("hudSub", la < core.LA_RH ? tTxt : "빅뱅 후 " + fmtTime(t));
  setText("hudA", aTxt + " · " + zTxt);
  setText("hudT", la < core.LA_RH ? "인플라톤 장" : tempTxt + " · " + fmtEnergy(kT));
  setText("hudSize", "단면 한 변 " + fmtLen(side));
  if (lastEra !== ei) { lastEra = ei; jumpBtns.forEach((b, k) => b.setAttribute("aria-pressed", String(k === ei))); }
}

// ---------- 상태와 조작 ----------
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const state = { la: -38, running: !reduceMotion, clock: "expand" as ClockKind, speed: 1, model: "lcdm" as ModelName };
if (reduceMotion) state.la = -0.4;

let jumpBtns: HTMLButtonElement[] = [], lastEra = -1;
function buildJumps(): void {
  const box = $("jumps");
  box.innerHTML = "";
  jumpBtns = world.eras.map((e) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = e.short; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { state.la = Math.min(world.core.LA_MAX, e.la + (e.la === 0 ? 0 : 0.0005)); });
    box.appendChild(b);
    return b;
  });
  lastEra = -1;
}

const LOGT_SECONDS = 40, NORMAL_SECONDS = 40;
function updateControls(): void {
  $("playBtn").textContent = state.running ? "일시정지" : state.la >= world.core.LA_MAX ? "다시 재생" : "재생";
  const sp = state.speed, core = world.core;
  $("clockNote").textContent = state.clock === "expand"
    ? "팽창 시계: 재생 1초마다 우주가 " + Math.pow(10, RATE_LA * sp).toFixed(1) + "배 커집니다. 인플레이션부터 오늘까지 약 " + Math.round(-core.LA_MIN / (RATE_LA * sp)) + "초."
    : state.clock === "logt"
      ? "로그 시간: 재생 1초마다 시간이 " + Math.pow(10, (world.ltMax - world.ltMin) / LOGT_SECONDS * sp).toFixed(1) + "배 흐릅니다. 인플레이션(시간 눈금에 담기지 않음)은 팽창 시계로 지나갑니다."
      : "보통 시계: 재생 1초마다 " + fmtTime(world.tMax / NORMAL_SECONDS * sp) + "가 흐릅니다. 그 앞의 모든 시대는 첫 프레임 안에 지나갑니다.";
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
chipGroup("clockChips", "data-clock", (v) => { state.clock = v as ClockKind; updateControls(); });
chipGroup("speedChips", "data-speed", (v) => { state.speed = parseFloat(v); updateControls(); });
chipGroup("modelChips", "data-model", (v) => { if (v !== state.model) { state.model = v as ModelName; build(state.model); } });
$("playBtn").addEventListener("click", () => {
  if (!state.running && state.la >= world.core.LA_MAX) state.la = world.core.LA_MIN;
  state.running = !state.running; updateControls();
});
$("restartBtn").addEventListener("click", () => { state.la = world.core.LA_MIN; state.running = true; updateControls(); });

function advance(dt: number): void {
  const { core } = world, sp = state.speed;
  if (state.clock === "expand" || (state.clock === "logt" && state.la < core.LA_RH)) state.la += RATE_LA * sp * dt;
  else if (state.clock === "logt") {
    const lt = Math.log10(core.tOf(state.la)) + (world.ltMax - world.ltMin) / LOGT_SECONDS * sp * dt;
    state.la = core.laOfT(Math.pow(10, lt));
  } else state.la = core.laOfT(core.tOf(state.la) + world.tMax / NORMAL_SECONDS * sp * dt);
  if (state.la >= core.LA_MAX) { state.la = core.LA_MAX; state.running = false; updateControls(); }
}

// ---------- 시작 ----------
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", readTokens);
new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
readTokens();
build(state.model);
const ro = new ResizeObserver(resize);
ro.observe(stage); ro.observe(clk);
resize();

let prev = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (state.running) advance(dt);
  drawStage(state.la, dt);
  drawClocks(state.la);
  updatePanel(state.la);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
