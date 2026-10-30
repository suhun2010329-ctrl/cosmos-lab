// @ts-nocheck
// 3D 우주 탐사기 화면 코드. 원래 단일 HTML 안의 스크립트였던 것을 모듈로 옮겼다.
// 과학 계산(src/shared)과 N-body 작업자, 셰이더는 타입이 붙은 별도 모듈이고,
// 이 파일(렌더링·카메라·LOD·UI)은 단계적으로 타입을 붙이는 중이라 검사를 잠시 끈다.
import * as THREE from "three";
import { createCosmology } from "../shared/cosmology";
import { bisect, clamp, frac, laZ, rng, smooth } from "../shared/math";
import { compare, fmtEnergy, fmtLen, fmtNum, fmtTemp, fmtTime, GYR, sci, sup } from "../shared/format";
import { blackbody, hexRgb, lum, rgba, skyColor as skyColorOf } from "../shared/color";
import { buildBBN, buildIon, buildSFR, laOfTemp as laOfTempOf, psiMD } from "../shared/physics";
import { buildEras, eraIndex as eraIndexOf } from "../shared/eras";
import { EL_KO, EL_SYM, elFraction as elFractionOf, elOrigins, LOGEPS, ORIGINS, originFractions as originFractionsOf, ptPos } from "../shared/elements";
import { DET_FS, DET_VS, GAL_FS, GAL_VS, PART_VS, PL_FS, PL_VS, POINT_FS, STAR_FS, STAR_VS } from "./shaders";

(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var LN10 = Math.LN10;
  var NP = 32, N = NP * NP * NP, L_BOX = 100, SEED = 20261030, NSTEPS = 96, LA_I = -2;
  var core, model = "lcdm", ION, BBN, SFR, ERAS, LA_QCD = -12;
  var MPC = 3.0857e22;

  // 공용 모듈(src/shared)을 이 페이지의 현재 우주(core, BBN, SFR, ERAS)에 묶는 얇은 연결
  function laOfTemp(mev) { return laOfTempOf(core, mev); }
  function skyColor(la) { return skyColorOf(core, la); }
  function eraIndex(la) { return eraIndexOf(ERAS, la); }
  function originFractions(la) { return originFractionsOf(la, BBN, SFR); }
  function elFraction(c, F) { return elFractionOf(c.o, F); }

  var elCells = [], originRgb = {};
  function buildPeriodicTable() {
    var pt = $("pt");
    pt.innerHTML = "";
    for (var Z = 1; Z <= 118; Z++) {
      var pos = ptPos(Z), o = elOrigins(Z), cell = document.createElement("div");
      cell.className = "el absent";
      cell.style.gridRow = pos[0]; cell.style.gridColumn = pos[1];
      var bar = '<div class="bar">' + ORIGINS.filter(function (x) { return o[x[0]]; }).map(function (x) { return '<span style="flex:' + o[x[0]] + ';background:var(--' + x[2] + ')"></span>'; }).join("") + "</div>";
      cell.innerHTML = '<span class="z">' + Z + '</span><span class="s">' + EL_SYM[Z - 1] + "</span>" + bar;
      cell.dataset.z = Z;
      pt.appendChild(cell);
      var dom = ORIGINS.reduce(function (best, x) { return (o[x[0]] || 0) > (o[best[0]] || 0) ? x : best; }, ORIGINS[0]);
      elCells.push({ el: cell, Z: Z, o: o, dom: dom[2], f: -1 });
    }
    var g1 = document.createElement("div"); g1.className = "gap"; g1.style.gridRow = 8; pt.appendChild(g1);
    [[6, 3, "57–71"], [7, 3, "89–103"]].forEach(function (r) { var d = document.createElement("div"); d.className = "ref"; d.style.gridRow = r[0]; d.style.gridColumn = r[1]; d.textContent = r[2]; pt.appendChild(d); });
    pt.addEventListener("pointermove", elHover);
    pt.addEventListener("pointerleave", function () { $("elTip").hidden = true; });
  }
  function readOriginColors() {
    var cs = getComputedStyle(document.documentElement);
    ORIGINS.forEach(function (x) { originRgb[x[2]] = hexRgb(cs.getPropertyValue("--" + x[2]).trim()); });
  }
  var lastPT = -99;
  function updatePeriodicTable(la, force) {
    if (!force && Math.abs(la - lastPT) < 0.004) return;
    lastPT = la;
    var F = originFractions(la), count = 0, nat = 0;
    elCells.forEach(function (c) {
      var f = elFraction(c, F);
      if (c.Z === 1) f = la >= LA_QCD ? 1 : 0;   // 수소 원자핵(양성자)은 QCD 상전이 때 생김
      var present = f > 1e-6 && !(c.Z === 43 || c.Z === 61) || (c.o.H && F.H);
      if ((c.Z === 43 || c.Z === 61) && F.H) present = true;
      if (present) { count++; if (c.Z <= 92 && c.Z !== 43 && c.Z !== 61) nat++; }
      var rgb = originRgb[c.dom] || [128, 128, 128];
      var alpha = present ? 0.16 + 0.6 * Math.pow(clamp(f, 0, 1), 0.3) : 0;
      if (Math.abs(alpha - c.f) > 0.01) {
        c.f = alpha;
        c.el.style.backgroundColor = present ? "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha.toFixed(2) + ")" : "transparent";
        c.el.classList.toggle("absent", !present);
      }
      c.frac = f; c.present = present;
    });
    var z = Math.pow(10, -la) - 1;
    $("elSummary").textContent = count === 0 ? "아직 원소가 없습니다. 원자핵이 될 양성자도 생기기 전입니다."
      : "지금 우주에 있는 원소 " + count + "종" + (F.H ? " (자연 원소 " + nat + "종 + 사람이 만든 원소)" : "") + ". 칸의 진하기는 오늘 양 대비 지금까지 만들어진 비율입니다.";
    if (la < LA_QCD) $("elSummary").textContent = "아직 원소가 없습니다. 쿼크가 양성자로 묶이기 전입니다.";
    else if (la < BBN.laNuc && count <= 1) $("elSummary").textContent = "수소 원자핵(양성자)만 있습니다. 헬륨은 빅뱅 핵합성(약 3분) 때 생깁니다.";
  }
  function elHover(e) {
    var cell = e.target.closest(".el"), tip = $("elTip");
    if (!cell) { tip.hidden = true; return; }
    var Z = +cell.dataset.z, c = elCells[Z - 1], wrap = $("ptWrap").getBoundingClientRect(), r = cell.getBoundingClientRect();
    var orig = ORIGINS.filter(function (x) { return c.o[x[0]]; }).map(function (x) { return x[1] + " " + Math.round(c.o[x[0]] * 100) + "%"; }).join(" · ");
    var ab = LOGEPS[Z] !== undefined ? "태양: 수소 10¹²개당 10" + sup(LOGEPS[Z].toFixed(2)) + "개" : (Z > 92 || Z === 43 || Z === 61 ? "안정한 동위원소 없음" : "태양 존재비 미량");
    var note = Z >= 84 && Z <= 91 && Z !== 90 ? "<br>우라늄·토륨이 붕괴하며 계속 생기는 방사성 원소" : "";
    tip.innerHTML = "<b>" + Z + " " + EL_SYM[Z - 1] + " " + EL_KO[Z - 1] + "</b><br>" + orig + "<br>" + ab +
      "<br>" + (c.present ? "지금까지 오늘 양의 " + (c.frac >= 0.995 ? "100" : (c.frac * 100).toPrecision(2)) + "% 생성" : "아직 없음") + note;
    tip.style.left = clamp(r.left - wrap.left + $("ptWrap").scrollLeft - 40, 0, Math.max(0, wrap.width - 260)) + "px";
    tip.style.top = (r.bottom - wrap.top + 6) + "px";
    tip.hidden = false;
  }
  function metalSummary(la) {
    var F = originFractions(la);
    if (F.M <= 0) return "없음<small>첫 별이 폭발하기 전</small>";
    var oh = Math.log10(Math.max(F.M, 1e-9));
    return "산소 " + pctS(F.M) + " · 철 " + pctS(0.4 * F.M + 0.6 * F.W) + " · 금 " + pctS(F.N) + "<small>오늘까지 생길 양 대비 누적 비율</small>";
    function pctS(v) { return v >= 0.995 ? "100%" : v < 1e-4 ? "<0.01%" : (v * 100).toPrecision(2) + "%"; }
  }

  // ---------- N-body 작업자 연결 ----------
  var rnd = rng(77);
  var qx = new Float32Array(N), qy = new Float32Array(N), qz = new Float32Array(N), u01 = new Float32Array(N), charge = new Uint8Array(N), rr2 = new Float32Array(N);
  (function () {
    for (var z = 0; z < NP; z++) for (var y = 0; y < NP; y++) for (var x = 0; x < NP; x++) {
      var i = (z * NP + y) * NP + x;
      // 표시용으로 격자 무늬만 흐리게 하는 흔들림 (±0.4칸, 중력 계산에는 쓰지 않음)
      qx[i] = (x + 0.5 + (rnd() - 0.5) * 0.8) / NP;
      qy[i] = (y + 0.5 + (rnd() - 0.5) * 0.8) / NP;
      qz[i] = (z + 0.5 + (rnd() - 0.5) * 0.8) / NP;
      u01[i] = rnd(); charge[i] = Math.floor(rnd() * 3); rr2[i] = rnd();
    }
  })();
  var worker = null, psi = null, snaps = [], sim = { step: 0, done: false, failed: false }, GAL = null;
  function startWorker() {
    if (worker) worker.terminate();
    worker = null; psi = null; snaps = []; sim = { step: 0, done: false, failed: false };
    clearGalaxies();
    try {
      worker = new Worker(new URL("./nbody.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = function (ev) {
        var m = ev.data;
        if (m.type === "ic") psi = m.psi;
        else if (m.type === "snap") { snaps[m.i] = { la: m.la, d: m.d, q: m.q }; sim.step = m.i; }
        else if (m.type === "done") sim.done = true;
        else if (m.type === "gal") setGalaxies(m);
      };
      worker.onerror = function () { useFallback(); };
      worker.postMessage({ model: model, seed: SEED });
    } catch (err) { useFallback(); }
  }
  function useFallback() {
    if (worker) worker.terminate();
    worker = null; sim.failed = true;
    if (!psi) psi = core.genIC(L_BOX, NP, SEED);
  }

  // ---------- 타임라인 ----------
  var stage = $("stage"), tlc = $("tl"), tctx = tlc.getContext("2d"), tip = $("tip");
  var dpr = 1, W = 0, H = 0, tokens = {};
  var BAND = 40, COMP_Y = 64, COMP_H = 36;
  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    ["muted", "ink", "line", "panel", "c-de", "c-dm", "c-b", "c-rad", "c-inf"].forEach(function (k) { tokens[k] = cs.getPropertyValue("--" + k).trim(); });
    readOriginColors();
    drawTimeline();
    if (core) { lastPT = -99; elCells.forEach(function (c) { c.f = -1; }); updatePeriodicTable(state.la, true); }
  }
  function laToX(la, w) { return (la - core.LA_MIN) / (core.LA_MAX - core.LA_MIN) * w; }
  function xToLa(x, w) { return core.LA_MIN + clamp(x / w, 0, 1) * (core.LA_MAX - core.LA_MIN); }
  function fractions(la) {
    if (la < core.LA_RH) return null;
    var q = core.parts(Math.pow(10, la)), s = q.r + q.b + q.c + q.de;
    return { r: q.r / s, b: q.b / s, c: q.c / s, de: q.de / s };
  }
  function drawTimeline() {
    if (!core) return;
    var w = tlc.width / dpr;
    if (!w) return;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.clearRect(0, 0, w, tlc.height / dpr);
    var x;
    for (x = 0; x < w; x++) { tctx.fillStyle = rgba(skyColor(xToLa(x + 0.5, w)), 1); tctx.fillRect(x, 0, 1.5, BAND); }
    tctx.strokeStyle = tokens.line || "#888"; tctx.lineWidth = 1; tctx.strokeRect(0.5, 0.5, w - 1, BAND - 1);
    ERAS.forEach(function (e, i) {
      if (i === 0 || e.la > core.LA_MAX) return;
      var ex = Math.round(laToX(e.la, w)) + 0.5;
      tctx.strokeStyle = "rgba(128,128,140,0.55)";
      tctx.beginPath(); tctx.moveTo(ex, 0); tctx.lineTo(ex, BAND); tctx.stroke();
    });
    tctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace"; tctx.textBaseline = "top";
    var marks = [[BBN.laNuc, "3분", "center"], [laZ(ION.zStar), "38만 년", "right"], [0, "오늘", "left"]];
    tctx.fillStyle = tokens.muted || "#888"; tctx.textAlign = "center";
    for (var d = -35; d < 0; d += 5) {
      var dx = laToX(d, w);
      tctx.fillRect(Math.round(dx), BAND, 1, 4);
      if (marks.some(function (m) { return Math.abs(m[0] - d) < 2.6; })) continue;
      tctx.fillText("10" + sup(d), dx, BAND + 6);
    }
    tctx.fillStyle = tokens.ink || "#000";
    marks.forEach(function (m) {
      var mx = laToX(m[0], w);
      tctx.fillRect(Math.round(mx), BAND, 1, 6);
      tctx.textAlign = m[2];
      tctx.fillText(m[1], m[2] === "right" ? mx + 4 : m[2] === "left" ? Math.min(mx - 3, w - 26) : mx, BAND + 6);
    });
    var y0 = COMP_Y, hh = COMP_H;
    for (x = 0; x < w; x++) {
      var f = fractions(xToLa(x + 0.5, w));
      if (!f) { tctx.fillStyle = tokens["c-inf"]; tctx.fillRect(x, y0, 1.5, hh); continue; }
      var acc = 0, segs = [[f.r, "c-rad"], [f.b, "c-b"], [f.c, "c-dm"], [f.de, "c-de"]];
      for (var s = 0; s < 4; s++) {
        var hgt = segs[s][0] * hh;
        tctx.fillStyle = tokens[segs[s][1]];
        tctx.fillRect(x, y0 + hh - acc - hgt, 1.5, hgt);
        acc += hgt;
      }
    }
    tctx.strokeStyle = tokens.panel || "#fff"; tctx.lineWidth = 2;
    for (var b = 1; b < 4; b++) {
      tctx.beginPath();
      var started = false;
      for (x = Math.ceil(laToX(core.LA_RH, w)); x < w; x += 2) {
        var ff = fractions(xToLa(x + 0.5, w)), cum = [ff.r, ff.r + ff.b, ff.r + ff.b + ff.c][b - 1];
        var below = [ff.r, ff.b, ff.c][b - 1], above = [ff.b, ff.c, ff.de][b - 1];
        var yy = y0 + hh - cum * hh;
        if (below > 0.004 && above > 0.004) { if (!started) { tctx.moveTo(x, yy); started = true; } else tctx.lineTo(x, yy); }
        else if (started) { tctx.stroke(); tctx.beginPath(); started = false; }
      }
      if (started) tctx.stroke();
    }
    tctx.strokeStyle = tokens.line; tctx.lineWidth = 1; tctx.strokeRect(0.5, y0 + 0.5, w - 1, hh - 1);
  }
  tlc.addEventListener("pointermove", function (e) {
    var r = tlc.getBoundingClientRect(), y = e.clientY - r.top, x = e.clientX - r.left;
    if (y < COMP_Y || y > COMP_Y + COMP_H) { tip.hidden = true; return; }
    var la = xToLa(x, r.width), f = fractions(la), z = Math.pow(10, -la) - 1;
    var head = "a = 10" + sup(la.toFixed(1)) + (la > -4 ? " · z = " + (z < 10 ? z.toFixed(2) : fmtNum(z)) : "");
    var pc = function (v) { return v < 0.0005 ? "<0.1%" : (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%"; };
    tip.innerHTML = head + "<br>" + (f ? "암흑에너지 " + pc(f.de) + " · 암흑물질 " + pc(f.c) + "<br>보통 물질 " + pc(f.b) + " · 복사 " + pc(f.r) : "인플라톤 장 100%");
    tip.style.left = clamp(x, 90, r.width - 90) + "px";
    tip.hidden = false;
  });
  tlc.addEventListener("pointerleave", function () { tip.hidden = true; });
  tlc.addEventListener("click", function (e) {
    var r = tlc.getBoundingClientRect();
    if (e.clientY - r.top >= COMP_Y) state.la = xToLa(e.clientX - r.left, r.width);
  });

  // =====================================================================
  // 3D: 렌더러, 공유 유니폼, VAT 키프레임 텍스처
  // =====================================================================
  var cv = $("cv"), renderer = null, glOK = false;
  try {
    if (typeof THREE === "undefined") throw new Error("three");
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: "high-performance" });
    glOK = renderer.capabilities.isWebGL2 && renderer.capabilities.maxVertexTextures > 0;
  } catch (err) { glOK = false; }
  if (!glOK) {
    var msg = document.createElement("div");
    msg.className = "glfail";
    msg.textContent = "이 브라우저에서 3D 화면(WebGL 2)을 켜지 못했습니다. 최신 Chrome·Edge·Firefox·Safari에서 열거나 하드웨어 가속을 켜 주세요. 계기판·타임라인·원소 주기율표는 그대로 작동합니다.";
    stage.appendChild(msg);
  }

  var BOX = 10, FOV = 50, TW = 256, TH = 128;
  function makeTex() {
    var t = new THREE.DataTexture(new Float32Array(TW * TH * 4), TW, TH, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    t.kfKey = "";
    return t;
  }
  var texA, texB, U;
  if (glOK) {
    texA = makeTex(); texB = makeTex();
    U = { uTexA: { value: texA }, uTexB: { value: texB }, uSA: { value: 0 }, uSB: { value: 0 }, uWDA: { value: 0 }, uWDB: { value: 0 },
      uCam: { value: new THREE.Vector3() }, uWrap: { value: 0 }, uScale: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } };
  }
  function loadTex(t, key) {
    if (t.kfKey === key) return;
    var d = t.image.data, i;
    if (key === "psi") { for (i = 0; i < N; i++) { d[4 * i] = psi[3 * i]; d[4 * i + 1] = psi[3 * i + 1]; d[4 * i + 2] = psi[3 * i + 2]; d[4 * i + 3] = 0; } }
    else if (key === "zero") d.fill(0);
    else {
      var s = snaps[+key.slice(1)], sc = 1 / 8192;
      for (i = 0; i < N; i++) { d[4 * i] = s.d[3 * i] * sc; d[4 * i + 1] = s.d[3 * i + 1] * sc; d[4 * i + 2] = s.d[3 * i + 2] * sc; d[4 * i + 3] = s.q[i] / 255 * 3.5 - 1; }
    }
    t.kfKey = key; t.needsUpdate = true;
  }
  var KF = { sA: 0, sB: 0 };
  function setKeyframes(la) {
    var sA = 0, sB = 0, wA = 0, wB = 0, kA = "zero", kB = "zero", last = snaps.length - 1;
    if (psi) {
      if (la <= LA_I || last < 0) { kA = kB = "psi"; sA = core.growth(la); }
      else if (la >= snaps[last].la) { kA = "s" + last; kB = "psi"; sA = 1; sB = core.growth(la) - core.growth(snaps[last].la); wA = 1; }
      else {
        var j = clamp(Math.floor((la - snaps[0].la) / (snaps[1].la - snaps[0].la)), 0, last - 1);
        while (j > 0 && snaps[j].la > la) j--;
        while (j < last - 1 && snaps[j + 1].la <= la) j++;
        var w = (la - snaps[j].la) / (snaps[j + 1].la - snaps[j].la);
        kA = "s" + j; kB = "s" + (j + 1); sA = 1 - w; sB = w; wA = 1 - w; wB = w;
      }
    }
    // 더블 버퍼: 다음 키프레임이 이미 B에 있으면 A와 B를 맞바꾸고 새 키프레임 하나만 올림
    if (texA.kfKey !== kA && texB.kfKey === kA) { var t = texA; texA = texB; texB = t; U.uTexA.value = texA; U.uTexB.value = texB; }
    loadTex(texA, kA); loadTex(texB, kB);
    U.uSA.value = sA; U.uSB.value = sB; U.uWDA.value = wA; U.uWDB.value = wB;
    KF.sA = sA; KF.sB = sB;
  }

  var scene, camera, partMat, partPts, galMesh = null, galMat, boxLines, shells = [], clearCol, pool = [];
  var DET_MAX = 48000, DUST_MAX = 6000;
  if (glOK) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 1e-7, 300);
    clearCol = new THREE.Color();
    // 입자
    var pg = new THREE.BufferGeometry(), aIdx = new Float32Array(N), aQ = new Float32Array(3 * N), aRand = new Float32Array(4 * N);
    for (var i = 0; i < N; i++) { aIdx[i] = i; aQ[3 * i] = qx[i]; aQ[3 * i + 1] = qy[i]; aQ[3 * i + 2] = qz[i]; aRand[4 * i] = charge[i]; aRand[4 * i + 1] = u01[i]; aRand[4 * i + 2] = rr2[i]; aRand[4 * i + 3] = frac(rr2[i] * 7.31); }
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    pg.setAttribute("aIdx", new THREE.BufferAttribute(aIdx, 1));
    pg.setAttribute("aQ", new THREE.BufferAttribute(aQ, 3));
    pg.setAttribute("aRand", new THREE.BufferAttribute(aRand, 4));
    partMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uMinSize: { value: 1.3 }, uMaxPx: { value: 30 }, uFogDensity: { value: 0 }, uFogStart: { value: 0 }, uFogColor: { value: new THREE.Color() },
        uTime: { value: 0 }, uJit: { value: 0 }, uPhase: { value: 0 }, uXn: { value: 0 }, uHeF: { value: 0 }, uIon: { value: 0 }, uGasBase: { value: 0.3 }, uDark: { value: 1 }, uDM: { value: 1 }, uNearFade: { value: 0 } }),
      vertexShader: PART_VS, fragmentShader: POINT_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    partPts = new THREE.Points(pg, partMat); partPts.frustumCulled = false;
    scene.add(partPts);
    // 상자와 팽창 고리 (전체 보기에서만)
    boxLines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX, BOX, BOX)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false }));
    scene.add(boxLines);
    var ringGeos = [0, 1, 2].map(function (axis) {
      var pts = [];
      for (var i = 0; i < 96; i++) {
        var t = i / 96 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        pts.push(axis === 0 ? new THREE.Vector3(0, c, s) : axis === 1 ? new THREE.Vector3(c, 0, s) : new THREE.Vector3(c, s, 0));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    });
    for (var sIdx = 0; sIdx < 3; sIdx++) {
      var mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
      var grp = new THREE.Group();
      ringGeos.forEach(function (g) { grp.add(new THREE.LineLoop(g, mat)); });
      grp.rotation.set(sIdx * 0.7, sIdx * 1.1, sIdx * 0.4);
      scene.add(grp);
      shells.push({ g: grp, m: mat });
    }
    galMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uLogRho: { value: -30 }, uZ: { value: 0 }, uAinv: { value: 1 }, uHub: { value: 0.6736 }, uExp: { value: 1e-9 }, uMinPx: { value: 1.6 },
        uHideId: { value: new THREE.Vector4(-1, -1, -1, -1) }, uHideF: { value: new THREE.Vector4(1, 1, 1, 1) } }),
      vertexShader: GAL_VS, fragmentShader: GAL_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    // 객체 풀: 정밀 은하 3개분 버퍼를 미리 만들어 재사용
    for (var pIdx = 0; pIdx < 3; pIdx++) pool.push(makeSlot());
  }
  function detailMaterial(dust) {
    return new THREE.ShaderMaterial({
      uniforms: { uScale: U.uScale, uMinSize: { value: 1.0 }, uUnit: { value: 1 }, uFade: { value: 0 }, uSB: { value: 0.5 } },
      vertexShader: DET_VS, fragmentShader: DET_FS, transparent: true, depthWrite: false, depthTest: false,
      blending: dust ? THREE.NormalBlending : THREE.AdditiveBlending
    });
  }
  function makeSlot() {
    function geo(n) {
      var g = new THREE.BufferGeometry(), p = new Float32Array(3 * n), c = new Float32Array(4 * n), s = new Float32Array(n);
      g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("aCol", new THREE.BufferAttribute(c, 4)); g.setAttribute("aSize", new THREE.BufferAttribute(s, 1));
      g.setDrawRange(0, 0);
      return { g: g, p: p, c: c, s: s };
    }
    var a = geo(DET_MAX), b = geo(DUST_MAX);
    var pts = new THREE.Points(a.g, detailMaterial(false)), dust = new THREE.Points(b.g, detailMaterial(true));
    pts.frustumCulled = false; dust.frustumCulled = false; pts.visible = false; dust.visible = false;
    scene.add(dust); scene.add(pts);
    return { pts: pts, dust: dust, A: a, B: b, gal: -1, type: -1, fade: 0, gen: null };
  }

  // ---------- 은하 목록 받기 ----------
  var gHost, gBase, GP, gNrm, GCOUNT = 0;
  function clearGalaxies() {
    GAL = null; GCOUNT = 0;
    if (galMesh) { scene.remove(galMesh); galMesh.geometry.dispose(); galMesh = null; }
    pool.forEach(function (s) { s.gal = -1; s.fade = 0; s.gen = null; s.pts.visible = false; s.dust.visible = false; });
    if (cam && (cam.mode === "orbit" || cam.mode === "goto")) { cam.sel = -1; }
  }
  function setGalaxies(m) {
    GCOUNT = m.G; gHost = m.host; GP = m.GP; gNrm = m.nrm;
    gBase = new Float32Array(3 * GCOUNT);
    for (var g = 0; g < GCOUNT; g++) { var h = gHost[g]; gBase[3 * g] = qx[h] + m.off[3 * g]; gBase[3 * g + 1] = qy[h] + m.off[3 * g + 1]; gBase[3 * g + 2] = qz[h] + m.off[3 * g + 2]; }
    GAL = true;
    if (!glOK) return;
    var geo = new THREE.InstancedBufferGeometry();
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    var hostF = new Float32Array(GCOUNT), p1 = new Float32Array(4 * GCOUNT), p2 = new Float32Array(4 * GCOUNT);
    for (g = 0; g < GCOUNT; g++) {
      hostF[g] = gHost[g];
      p1[4 * g] = GP[8 * g]; p1[4 * g + 1] = GP[8 * g + 1]; p1[4 * g + 2] = GP[8 * g + 2]; p1[4 * g + 3] = GP[8 * g + 6];
      p2[4 * g] = GP[8 * g + 3]; p2[4 * g + 1] = GP[8 * g + 4]; p2[4 * g + 2] = GP[8 * g + 5]; p2[4 * g + 3] = g;
    }
    geo.setAttribute("gHost", new THREE.InstancedBufferAttribute(hostF, 1));
    geo.setAttribute("gBase", new THREE.InstancedBufferAttribute(gBase, 3));
    geo.setAttribute("gP1", new THREE.InstancedBufferAttribute(p1, 4));
    geo.setAttribute("gP2", new THREE.InstancedBufferAttribute(p2, 4));
    geo.setAttribute("gNrm", new THREE.InstancedBufferAttribute(gNrm, 3));
    geo.instanceCount = GCOUNT;
    galMesh = new THREE.Mesh(geo, galMat); galMesh.frustumCulled = false;
    scene.add(galMesh);
    hashFrame = -999;
  }

  // ---------- 현재 시점의 값 (셰이더와 같은 식을 CPU에서도 씀) ----------
  var cur = { la: 0, a: 1, z: 0, logRho: -30 };
  var _gb = [0, 0, 0];
  function galBox(g, out) {
    var h = gHost[g] * 4, A = texA.image.data, B = texB.image.data;
    for (var k = 0; k < 3; k++) { var v = gBase[3 * g + k] + A[h + k] * KF.sA + B[h + k] * KF.sB; out[k] = v - Math.floor(v); }
    return out;
  }
  function galState(g) {
    var o = 8 * g, lm = GP[o] + GP[o + 1] * cur.logRho;
    if (lm < 5) return null;
    var zq = GP[o + 2], quen = zq >= 0 && cur.z < zq;
    var type = quen ? 3 + GP[o + 3] : (GP[o + 4] < 0.5 ? (cur.z > 2 && lm > 9 ? 2 : 0) : 1);
    var M = Math.pow(10, lm);
    var rk = (quen && GP[o + 3] < 0.5 && lm > 10) ? Math.max(0.4, 4 * Math.pow(M / 5e10, 0.75) * Math.pow(1 + cur.z, -1.48)) : Math.max(0.4, 7.1 * Math.pow(M / 5e10, 0.22) * Math.pow(1 + cur.z, -0.75));
    var Rw = rk * 1e-4 * core.h / cur.a, ext = (type === 3 ? 5 : 3.5) * Rw;
    var sb = clamp(0.25 + 0.2 * (Math.log10(M / (ext * ext)) - 15), 0.12, 0.9);
    return { lm: lm, M: M, quen: quen, type: type, rk: rk, Rw: Rw, ext: ext, sb: sb, seed: GP[o + 6], bar: type === 0 && lm > 9.8 && frac(GP[o + 6] * 3.3) < 0.55 };
  }
  var TYPE_NAME = ["나선은하", "왜소 불규칙은하", "덩어리 원반은하 (초기 우주)", "타원은하", "렌즈형(S0) 은하", "왜소 타원체은하"];

  // =====================================================================
  // 카메라: 부동 원점. 실제 위치는 JS 배정밀도로 들고, GPU에는 카메라 기준 상대 위치만 넘긴다.
  // =====================================================================
  var C0 = [5, 5, 5];
  var cam = { mode: "overview", pos: [0, 0, 0], theta: 0.75, phi: 1.12, r: 17, auto: true, yaw: 0, pitch: 0, sel: -1, orbitR: 1, tw: null, speedMul: 1, near: 1, quat: null };
  var _m4, _v0, _vt, _up, _q1, _q2;
  if (glOK) { _m4 = new THREE.Matrix4(); _v0 = new THREE.Vector3(); _vt = new THREE.Vector3(); _up = new THREE.Vector3(0, 1, 0); _q1 = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); cam.quat = new THREE.Quaternion(); }
  function dirOf(theta, phi) { return [Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)]; }
  function lookQuat(d, out) { _vt.set(d[0], d[1], d[2]); _m4.lookAt(_v0, _vt, _up); out.setFromRotationMatrix(_m4); return out; }
  function inside(p) { return p[0] >= 0 && p[0] < 10 && p[1] >= 0 && p[1] < 10 && p[2] >= 0 && p[2] < 10; }
  var wrapOn = false;
  function galWorld(g, out) {
    galBox(g, out);
    for (var k = 0; k < 3; k++) {
      out[k] *= 10;
      if (wrapOn) { var d = out[k] - cam.pos[k]; d -= 10 * Math.round(d / 10); out[k] = cam.pos[k] + d; }
    }
    return out;
  }
  function len3(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function startGoto(g) {
    if (!GAL || g < 0) return;
    var st = galState(g); if (!st) return;
    state.running = false; updateControls();
    var G = galWorld(g, [0, 0, 0]);
    var v = [cam.pos[0] - G[0], cam.pos[1] - G[1], cam.pos[2] - G[2]], d0 = Math.hypot(v[0], v[1], v[2]);
    if (d0 < 1e-9) { v = [0, 0.3, 1]; d0 = 1; }
    var dir = [v[0] / d0, v[1] / d0, v[2] / d0];
    var r1 = st.ext / Math.tan(FOV / 2 * Math.PI / 180) * 0.62;
    cam.tw = { kind: "goto", g: g, t: 0, T: clamp(1.4 + 0.25 * Math.log10(d0 / r1), 1.6, 3.4), d0: d0, r1: r1, dir: dir, q0: cam.quat.clone() };
    cam.mode = "goto"; cam.sel = g;
    $("flyBtn").setAttribute("aria-pressed", "false");
    showGalCard(g);
  }
  function startHome() {
    var v = [cam.pos[0] - C0[0], cam.pos[1] - C0[1], cam.pos[2] - C0[2]], d0 = Math.hypot(v[0], v[1], v[2]);
    if (d0 < 1e-6) { v = dirOf(0.75, 1.12); d0 = 1; }
    cam.tw = { kind: "home", t: 0, T: 2.2, d0: Math.max(d0, 1e-4), r1: 17, dir: [v[0] / Math.max(d0, 1e-9), v[1] / Math.max(d0, 1e-9), v[2] / Math.max(d0, 1e-9)], q0: cam.quat.clone() };
    cam.mode = "home"; cam.sel = -1;
    $("flyBtn").setAttribute("aria-pressed", "false");
    $("galCard").hidden = true;
  }
  function updateCamera(dt) {
    var G;
    if (cam.mode === "overview") {
      if (cam.auto && !pointers.size) cam.theta += 0.07 * dt;
      var d = dirOf(cam.theta, cam.phi);
      cam.pos = [C0[0] + cam.r * d[0], C0[1] + cam.r * d[1], C0[2] + cam.r * d[2]];
      lookQuat([-d[0], -d[1], -d[2]], cam.quat);
    } else if (cam.mode === "orbit") {
      if (cam.auto && !pointers.size) cam.theta += 0.05 * dt;
      G = galWorld(cam.sel, [0, 0, 0]);
      var od = dirOf(cam.theta, cam.phi);
      cam.pos = [G[0] + cam.orbitR * od[0], G[1] + cam.orbitR * od[1], G[2] + cam.orbitR * od[2]];
      lookQuat([-od[0], -od[1], -od[2]], cam.quat);
    } else if (cam.mode === "fly") {
      var f = [Math.cos(cam.pitch) * Math.cos(cam.yaw), Math.sin(cam.pitch), Math.cos(cam.pitch) * Math.sin(cam.yaw)];
      var rgt = [-Math.sin(cam.yaw), 0, Math.cos(cam.yaw)];
      var sp = clamp(cam.near * 0.9, 2e-5, 2.5) * cam.speedMul * (keys.shift ? 4 : 1);
      var mvF = (keys.w ? 1 : 0) - (keys.s ? 1 : 0), mvR = (keys.d ? 1 : 0) - (keys.a ? 1 : 0), mvU = (keys.r ? 1 : 0) - (keys.f ? 1 : 0);
      for (var k = 0; k < 3; k++) cam.pos[k] += (f[k] * mvF + rgt[k] * mvR + (k === 1 ? mvU : 0)) * sp * dt;
      cam.flySpeed = sp;
      lookQuat(f, cam.quat);
    } else if (cam.tw) {
      var tw = cam.tw;
      tw.t += dt;
      var u = clamp(tw.t / tw.T, 0, 1), e = ease(u);
      var dd = Math.exp(Math.log(tw.d0) + (Math.log(tw.r1) - Math.log(tw.d0)) * e);
      var target = tw.kind === "goto" ? galWorld(tw.g, [0, 0, 0]) : C0;
      cam.pos = [target[0] + tw.dir[0] * dd, target[1] + tw.dir[1] * dd, target[2] + tw.dir[2] * dd];
      lookQuat([-tw.dir[0], -tw.dir[1], -tw.dir[2]], _q2);
      cam.quat.copy(tw.q0).slerp(_q2, clamp(u / 0.35, 0, 1));
      if (u >= 1) {
        cam.theta = Math.atan2(tw.dir[2], tw.dir[0]); cam.phi = clamp(Math.acos(clamp(tw.dir[1], -1, 1)), 0.12, Math.PI - 0.12);
        if (tw.kind === "goto") { cam.mode = "orbit"; cam.orbitR = tw.r1; }
        else { cam.mode = "overview"; cam.r = 17; }
        cam.tw = null;
      }
    }
    wrapOn = cam.mode === "orbit" || cam.mode === "fly" || (cam.mode === "goto" && inside(cam.pos));
    if (wrapOn && (cam.mode === "fly")) for (var j = 0; j < 3; j++) cam.pos[j] -= 10 * Math.floor(cam.pos[j] / 10);
    camera.position.set(0, 0, 0);
    camera.quaternion.copy(cam.quat);
    camera.updateMatrixWorld();
  }

  // ---------- 입력 ----------
  var pointers = new Map(), downAt = null, keys = {};
  function pinchDist() { var p = Array.from(pointers.values()); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  stage.addEventListener("pointerdown", function (e) {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add("dragging");
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  stage.addEventListener("pointermove", function (e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (pointers.size === 1) {
      if (cam.mode === "system") { sys.theta += dx * 0.006; sys.phi = clamp(sys.phi - dy * 0.006, 0.08, Math.PI - 0.08); }
      else if (cam.mode === "fly") { cam.yaw += dx * 0.004; cam.pitch = clamp(cam.pitch - dy * 0.004, -1.5, 1.5); }
      else { cam.theta += dx * 0.006; cam.phi = clamp(cam.phi - dy * 0.006, 0.12, Math.PI - 0.12); }
      p.x = e.clientX; p.y = e.clientY;
    } else if (pointers.size === 2) {
      var before = pinchDist();
      p.x = e.clientX; p.y = e.clientY;
      var after = pinchDist();
      if (after > 0) zoomBy(before / after);
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) stage.classList.remove("dragging");
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5 && performance.now() - downAt.t < 450 && cam.mode !== "system") {
      var r = stage.getBoundingClientRect();
      pickAt(e.clientX - r.left, e.clientY - r.top);
    }
    downAt = null;
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", function (e) { pointers.delete(e.pointerId); downAt = null; if (!pointers.size) stage.classList.remove("dragging"); });
  stage.addEventListener("wheel", function (e) { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  function zoomBy(f) {
    if (cam.mode === "system") sys.r = clamp(sys.r * f, sys.rMin, sys.rMax);
    else if (cam.mode === "overview") cam.r = clamp(cam.r * f, 9, 40);
    else if (cam.mode === "orbit") { var st = galState(cam.sel); var mn = st ? st.ext * 0.6 : 1e-4; cam.orbitR = clamp(cam.orbitR * f, mn, 6); }
    else if (cam.mode === "fly") cam.speedMul = clamp(cam.speedMul / f, 0.02, 50);
  }
  window.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    var k = e.key.toLowerCase();
    if ("wasdrf".indexOf(k) >= 0 && k.length === 1) { keys[k] = true; if (cam.mode === "fly") e.preventDefault(); }
    if (e.key === "Shift") keys.shift = true;
  });
  window.addEventListener("keyup", function (e) { var k = e.key.toLowerCase(); if (k.length === 1) keys[k] = false; if (e.key === "Shift") keys.shift = false; });
  window.addEventListener("blur", function () { keys = {}; });

  // ---------- 고르기 (화면 좌표 → 가장 가까운 보이는 은하) ----------
  var _pv;
  function pickAt(x, y) {
    if (!GAL || !glOK) return;
    if (!_pv) _pv = new THREE.Vector3();
    var best = -1, bestScore = 18, w = W, h = H, S = U.uScale.value / dpr, Ev = galMat.uniforms.uExp.value, p = [0, 0, 0];
    for (var g = 0; g < GCOUNT; g++) {
      var st = galState(g); if (!st) continue;
      galWorld(g, p);
      _pv.set(p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]);
      if (!wrapOn) { /* 상자 밖에서는 그대로 */ }
      _pv.applyMatrix4(camera.matrixWorldInverse);
      var d = -_pv.z; if (d <= 0) continue;
      var px = st.ext * S / d, flux = Ev * st.M * (st.quen ? 0.5 : 1.2) / (d * d);
      if (px < 1 && flux * 0.6 < 0.01) continue;
      _pv.applyMatrix4(camera.projectionMatrix);
      var sx = (_pv.x * 0.5 + 0.5) * w, sy = (-_pv.y * 0.5 + 0.5) * h;
      var score = Math.hypot(sx - x, sy - y) - Math.min(px, 60) * 0.8;
      if (score < bestScore) { bestScore = score; best = g; }
    }
    if (best >= 0) startGoto(best);
  }

  // ---------- 공간 해시 격자 (카메라 주변 은하 찾기) ----------
  var HG = 32, hashStart = new Int32Array(HG * HG * HG + 1), hashItems = null, hashFrame = -999, hashPos = null;
  function rebuildHash() {
    if (!GAL) return;
    if (!hashItems || hashItems.length !== GCOUNT) { hashItems = new Int32Array(GCOUNT); hashPos = new Float32Array(3 * GCOUNT); }
    var cnt = new Int32Array(HG * HG * HG), cellOf = new Int32Array(GCOUNT), b = [0, 0, 0], g;
    for (g = 0; g < GCOUNT; g++) {
      galBox(g, b);
      hashPos[3 * g] = b[0] * 10; hashPos[3 * g + 1] = b[1] * 10; hashPos[3 * g + 2] = b[2] * 10;
      var c = (Math.min(HG - 1, Math.floor(b[2] * HG)) * HG + Math.min(HG - 1, Math.floor(b[1] * HG))) * HG + Math.min(HG - 1, Math.floor(b[0] * HG));
      cellOf[g] = c; cnt[c]++;
    }
    hashStart[0] = 0;
    for (var i = 0; i < HG * HG * HG; i++) hashStart[i + 1] = hashStart[i] + cnt[i];
    var fill = hashStart.slice(0, HG * HG * HG);
    for (g = 0; g < GCOUNT; g++) hashItems[fill[cellOf[g]]++] = g;
  }
  function queryNear(p, radius, fn) {
    var cs = 10 / HG, R = Math.ceil(radius / cs);
    var cx = Math.floor(p[0] / cs), cy = Math.floor(p[1] / cs), cz = Math.floor(p[2] / cs);
    for (var dz = -R; dz <= R; dz++) for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
      var x = cx + dx, y = cy + dy, z = cz + dz;
      if (wrapOn) { x = (x % HG + HG) % HG; y = (y % HG + HG) % HG; z = (z % HG + HG) % HG; }
      else if (x < 0 || y < 0 || z < 0 || x >= HG || y >= HG || z >= HG) continue;
      var c = (z * HG + y) * HG + x;
      for (var i = hashStart[c]; i < hashStart[c + 1]; i++) fn(hashItems[i]);
    }
  }

  // ---------- 정밀 LOD 관리 ----------
  var LOD_IN = 45, LOD_FULL = 100;
  function lodUpdate(frameNo) {
    if (!GAL || !wrapOn || cam.mode === "system") { pool.forEach(function (s) { s.want = 0; }); return; }
    if (frameNo - hashFrame > 24) { rebuildHash(); hashFrame = frameNo; }
    var S = U.uScale.value / dpr, cand = [], p = [0, 0, 0], nearest = 1e9;
    queryNear(cam.pos, 0.7, function (g) {
      var st = galState(g); if (!st) return;
      galWorld(g, p);
      var d = len3(p, cam.pos);
      if (d < nearest) nearest = d;
      var px = st.ext * S / Math.max(d, 1e-9);
      if (px > LOD_IN) cand.push({ g: g, px: px });
    });
    cam.near = nearest < 1e9 ? Math.max(nearest, 1e-4) : 0.5;
    cand.sort(function (a, b) { return b.px - a.px; });
    cand = cand.slice(0, 3);
    var want = {};
    cand.forEach(function (c) { want[c.g] = c.px; });
    pool.forEach(function (s) { s.want = s.gal >= 0 && want[s.gal] !== undefined ? smooth(LOD_IN, LOD_FULL, want[s.gal]) : 0; if (s.gal >= 0 && want[s.gal] !== undefined) delete want[s.gal]; });
    Object.keys(want).forEach(function (gs) {
      var free = pool.filter(function (s) { return s.gal < 0 || (s.fade <= 0.001 && s.want === 0); })[0];
      if (!free) return;
      var g = +gs;
      startDetail(free, g);
      free.want = smooth(LOD_IN, LOD_FULL, want[gs]);
    });
  }
  function lodFrame(dt) {
    var hid = [-1, -1, -1], hf = [1, 1, 1];
    pool.forEach(function (s, k) {
      if (s.gal < 0) return;
      if (s.gen) stepDetail(s, 3.5);
      var st = galState(s.gal);
      if (!st) { s.want = 0; }
      else if (st.type !== s.type) { startDetail(s, s.gal); }
      var ready = s.gen ? s.gen.i / s.gen.n : 1;
      s.fade += (Math.min(s.want, ready) - s.fade) * (1 - Math.exp(-dt / 0.25));
      if (s.want === 0 && s.fade < 0.002) { s.gal = -1; s.fade = 0; s.pts.visible = false; s.dust.visible = false; return; }
      var p = galWorld(s.gal, [0, 0, 0]);
      s.pts.position.set(p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]);
      s.dust.position.copy(s.pts.position);
      if (st) { s.pts.scale.setScalar(st.Rw); s.dust.scale.setScalar(st.Rw); s.pts.material.uniforms.uUnit.value = st.Rw; s.dust.material.uniforms.uUnit.value = st.Rw; s.pts.material.uniforms.uSB.value = Math.min(1, st.sb * 1.9); s.dust.material.uniforms.uSB.value = 1; }
      s.pts.material.uniforms.uFade.value = s.fade; s.dust.material.uniforms.uFade.value = s.fade;
      s.pts.visible = s.fade > 0.002; s.dust.visible = s.fade > 0.002 && s.B.g.drawRange.count > 0;
      hid[k] = s.gal; hf[k] = 1 - s.fade;
    });
    var u = galMat.uniforms;
    u.uHideId.value.set(hid[0], hid[1], hid[2], -1); u.uHideF.value.set(hf[0], hf[1], hf[2], 1);
  }

  // 절차 생성: 은하 번호의 씨앗에서 매번 같은 은하가 나옴. 시간 분할로 몇 밀리초씩 생성.
  function startDetail(slot, g) {
    var st = galState(g); if (!st) return;
    if (slot.gal !== g) slot.fade = 0;
    slot.gal = g; slot.type = st.type;
    var seed = st.seed, rr = rng((Math.floor(seed * 4294967295) ^ 0x2545F491) >>> 0);
    var R = function () { return rr(); };
    var Ng = function () { var u = 1 - rr(), v = rr(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
    var atanh = function (x) { return 0.5 * Math.log((1 + x) / (1 - x)); };
    var pitch = 0.22 + 0.25 * frac(seed * 1.37), ph = frac(seed * 7.13) * 6.2831853, tanp = Math.tan(pitch);
    var hR = 1 / 1.68, type = st.type, lm = st.lm;
    var BT = type === 4 ? 0.45 : clamp(0.08 + 0.12 * (lm - 9.5), 0.05, 0.4);
    var ratio = GP[8 * g + 5];
    var armTh = function (r) { return Math.log(r + 0.05) / tanp - ph / 2 + Math.PI * Math.floor(R() * 2); };
    var comps = [], dust = 0, clumps = [];
    function put(o, x, y, z, c, a, s) { o.x = x; o.y = y; o.z = z; o.c = c; o.a = a; o.s = s; }
    var disk = function (o, arms) {
      var r = Math.min(4.5, -hR * Math.log(R() * R() + 1e-12)), onArm = arms && R() < 0.55;
      var th = onArm ? armTh(r) + Ng() * 0.2 : R() * 6.2831853, z = clamp(0.06 * atanh(2 * R() - 1), -0.4, 0.4);
      var young = onArm && R() < 0.6;
      put(o, r * Math.cos(th), r * Math.sin(th), z, young ? [0.62, 0.74, 1.0] : [1.0, 0.88, 0.72], young ? 0.75 : 0.45, young ? 0.011 + 0.01 * R() : 0.009);
    };
    var bulge = function (o) {
      var u = Math.sqrt(R()), r = Math.min(2, 0.1 * u / (1 - u + 1e-6)), cz = 2 * R() - 1, ph2 = 6.2831853 * R(), s = Math.sqrt(1 - cz * cz);
      put(o, r * s * Math.cos(ph2), r * s * Math.sin(ph2), r * cz * 0.7, [1.0, 0.78, 0.52], 0.6, 0.01);
    };
    if (type === 0 || type === 4) {
      var nS = type === 0 ? 42000 : 30000, nB = Math.round(nS * BT), nBar = st.bar ? Math.round(nS * 0.08) : 0, nH = type === 0 ? 300 : 0;
      comps.push([nB, bulge]);
      if (nBar) comps.push([nBar, function (o) { var x = (R() * 2 - 1) * 0.75, y = Ng() * 0.08, c = Math.cos(-ph / 2), s = Math.sin(-ph / 2); put(o, x * c - y * s, x * s + y * c, Ng() * 0.05, [1.0, 0.82, 0.6], 0.55, 0.01); }]);
      if (nH) comps.push([nH, function (o) { var r = 0.3 + 1.6 * R(), th = armTh(r) + Ng() * 0.1; put(o, r * Math.cos(th), r * Math.sin(th), Ng() * 0.02, [1.0, 0.42, 0.62], 0.95, 0.026); }]);
      comps.push([nS - nB - nBar - nH, function (o) { disk(o, type === 0); }]);
      if (type === 0) dust = 5000;
    } else if (type === 3) {
      var aH = 1 / 1.815, bq = Math.sqrt(ratio), cq = ratio;
      comps.push([32000, function (o) {
        var u = Math.sqrt(R()), r = Math.min(7, aH * u / (1 - u + 1e-6)), cz = 2 * R() - 1, p2 = 6.2831853 * R(), s = Math.sqrt(1 - cz * cz);
        put(o, r * s * Math.cos(p2), r * s * Math.sin(p2) * bq, r * cz * cq, [1.0, 0.74 + 0.08 * R(), 0.5], 0.5, 0.012);
      }]);
      comps.push([160, function (o) { var r = 0.6 + 6 * Math.pow(R(), 0.6), cz = 2 * R() - 1, p2 = 6.2831853 * R(), s = Math.sqrt(1 - cz * cz); put(o, r * s * Math.cos(p2), r * s * Math.sin(p2), r * cz, [1.0, 0.9, 0.75], 0.9, 0.02); }]);
    } else if (type === 5) {
      comps.push([12000, function (o) { var r = Math.min(5, 0.75 / Math.sqrt(Math.pow(R() + 1e-6, -2 / 3) - 1 + 1e-6)), cz = 2 * R() - 1, p2 = 6.2831853 * R(), s = Math.sqrt(1 - cz * cz); put(o, r * s * Math.cos(p2), r * s * Math.sin(p2), r * cz * 0.8, [0.95, 0.85, 0.7], 0.4, 0.012); }]);
    } else {
      var K = type === 2 ? 6 : 4 + Math.floor(R() * 4);
      for (var k = 0; k < K; k++) { var cr = type === 2 ? 0.2 + R() : R() * 0.8, ca = R() * 6.2831853; clumps.push([cr * Math.cos(ca), cr * Math.sin(ca), type === 2 ? 0.08 : 0.15 + 0.25 * R()]); }
      var nT = type === 2 ? 28000 : 16000;
      comps.push([nT, function (o) {
        if (R() < 0.6) { var cl = clumps[Math.floor(R() * clumps.length)]; put(o, cl[0] + Ng() * cl[2], cl[1] + Ng() * cl[2], Ng() * cl[2] * 0.6, R() < 0.3 ? [1.0, 0.6, 0.8] : [0.66, 0.78, 1.0], 0.6, 0.012); }
        else { var r = Math.min(4, -0.7 * Math.log(R() * R() + 1e-12)), th = R() * 6.2831853; put(o, r * Math.cos(th), r * Math.sin(th) * (type === 2 ? 1 : 0.7), Ng() * (type === 2 ? 0.15 : 0.25), [0.75, 0.82, 1.0], 0.4, 0.01); }
      }]);
    }
    var n = comps.reduce(function (s, c) { return s + c[0]; }, 0);
    slot.gen = { i: 0, n: Math.min(n, DET_MAX), comps: comps, ci: 0, cleft: comps[0][0], di: 0, dn: dust, R: R, Ng: Ng, armTh: armTh, atanh: atanh };
    slot.A.g.setDrawRange(0, 0); slot.B.g.setDrawRange(0, 0);
    // 원반 법선 방향으로 회전 (타원은하는 씨앗에서 정한 임의 방향)
    if (type === 3 || type === 5) slot.pts.quaternion.setFromEuler(new THREE.Euler(seed * 6.28, frac(seed * 3.7) * 6.28, frac(seed * 5.1) * 6.28));
    else { _vt.set(gNrm[3 * g], gNrm[3 * g + 1], gNrm[3 * g + 2]); slot.pts.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _vt); }
    slot.dust.quaternion.copy(slot.pts.quaternion);
  }
  function stepDetail(slot, budgetMs) {
    var gen = slot.gen, t0 = performance.now(), o = {}, A = slot.A, B = slot.B;
    while (gen.i < gen.n && performance.now() - t0 < budgetMs) {
      for (var b = 0; b < 400 && gen.i < gen.n; b++) {
        while (gen.cleft <= 0) { gen.ci++; gen.cleft = gen.comps[gen.ci][0]; }
        gen.comps[gen.ci][1](o); gen.cleft--;
        var i = gen.i++;
        A.p[3 * i] = o.x; A.p[3 * i + 1] = o.y; A.p[3 * i + 2] = o.z;
        A.c[4 * i] = o.c[0]; A.c[4 * i + 1] = o.c[1]; A.c[4 * i + 2] = o.c[2]; A.c[4 * i + 3] = o.a; A.s[i] = o.s;
      }
    }
    if (gen.i >= gen.n && gen.di < gen.dn) {
      for (; gen.di < gen.dn; gen.di++) {
        var j = gen.di, r = Math.min(4, -(1 / 1.68) * Math.log(gen.R() * gen.R() + 1e-12)), th = gen.armTh(r) - 0.1 + gen.Ng() * 0.08;
        B.p[3 * j] = r * Math.cos(th); B.p[3 * j + 1] = r * Math.sin(th); B.p[3 * j + 2] = clamp(0.02 * gen.atanh(2 * gen.R() - 1), -0.15, 0.15);
        B.c[4 * j] = 0.09; B.c[4 * j + 1] = 0.06; B.c[4 * j + 2] = 0.04; B.c[4 * j + 3] = 0.35; B.s[j] = 0.035;
      }
      B.g.setDrawRange(0, gen.dn);
      ["position", "aCol", "aSize"].forEach(function (k) { B.g.attributes[k].needsUpdate = true; });
    }
    A.g.setDrawRange(0, gen.i);
    ["position", "aCol", "aSize"].forEach(function (k) { A.g.attributes[k].needsUpdate = true; });
    if (gen.i >= gen.n && gen.di >= gen.dn) slot.gen = null;
  }

  // =====================================================================
  // 별계 (LOD 3단계): 별을 원점으로 둔 별도 장면을 불러옴
  // =====================================================================
  var sys = { scene: null, cam: null, theta: 0.6, phi: 1.15, r: 3, rMin: 0.05, rMax: 200, planets: [], daysPerSec: 20, star: null, labels: [], back: null };
  function glowTexture() {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.2, "rgba(255,255,255,0.55)"); g.addColorStop(0.5, "rgba(255,255,255,0.12)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  // 주계열 별: 질량 → 광도·반지름·온도
  function starProps(M) {
    var L = M < 0.43 ? 0.23 * Math.pow(M, 2.3) : M < 2 ? Math.pow(M, 4) : M < 55 ? 1.4 * Math.pow(M, 3.5) : 32000 * M;
    var Rr = M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57), T = 5772 * Math.pow(L / (Rr * Rr), 0.25);
    var cls = T > 30000 ? "O" : T > 10000 ? "B" : T > 7500 ? "A" : T > 6000 ? "F" : T > 5200 ? "G" : T > 3700 ? "K" : "M";
    return { M: M, L: L, R: Rr, T: T, cls: cls, life: 10 * Math.pow(M, -2.5) };
  }
  function kroupa(R, mmin, mmax) {
    // Kroupa (2001): 0.08–0.5 M☉ 기울기 1.3, 0.5 M☉ 이상 2.3. 거부 표본 추출
    for (var tries = 0; tries < 2000; tries++) {
      var lm = Math.log(mmin) + R() * (Math.log(mmax) - Math.log(mmin)), m = Math.exp(lm);
      var w = (m < 0.5 ? Math.pow(m / 0.5, -0.3) : Math.pow(m / 0.5, -1.3)) / Math.pow(mmin / 0.5, mmin < 0.5 ? -0.3 : -1.3);
      if (R() < w) return m;
    }
    return mmin;
  }
  function ohMZR(lm, z) {
    // Tremonti (2004) 관계식. 이 보정 방식은 다른 방식보다 0.2~0.3 dex 높게 나오므로(Kewley & Ellison 2008) 0.25를 뺌
    var x = clamp(lm, 8.5, 11.5), oh = -1.492 + 1.847 * x - 0.08026 * x * x;
    if (lm < 8.5) oh += 0.3 * (lm - 8.5);
    return oh - 8.69 - 0.25 - 0.6 * Math.log10(1 + z);
  }
  function genSystem(kind) {
    var tNow = core.tOf(cur.la) / GYR, z = cur.z, st = cam.sel >= 0 ? galState(cam.sel) : null;
    if (kind === "solar") {
      return { name: "태양계", star: { M: 1, L: 1, R: 1, T: 5772, cls: "G2V", life: 10, age: 4.57, feh: 0 }, real: true,
        planets: [["수성", 0.387, 0.383, 87.97, "암석 행성"], ["금성", 0.723, 0.949, 224.7, "암석 행성"], ["지구", 1.0, 1.0, 365.26, "암석 행성"], ["화성", 1.524, 0.532, 686.98, "암석 행성"],
          ["목성", 5.203, 11.21, 4332.6, "가스 거대행성"], ["토성", 9.537, 9.45, 10759, "가스 거대행성"], ["천왕성", 19.19, 4.01, 30687, "얼음 거대행성"], ["해왕성", 30.07, 3.88, 60190, "얼음 거대행성"]]
          .map(function (p) { return { name: p[0], a: p[1], R: p[2], P: p[3], type: p[4] }; }) };
    }
    var seed = ((cam.sel >= 0 ? cam.sel : 7) * 2654435761 + Math.floor(performance.now())) >>> 0, rr = rng(seed);
    var R = function () { return rr(); }, Ng = function () { var u = 1 - rr(), v = rr(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); };
    // 별 나이: 별 형성이 이어지는 은하는 고르게, 정지한 은하는 정지 이전에 생긴 늙은 별
    var tFirst = core.tOf(laZ(15)) / GYR, gal = st;
    var tq = gal && gal.quen ? core.tOf(laZ(Math.max(GP[8 * cam.sel + 2], 0))) / GYR : tNow;
    var age = Math.max(0.01, tNow - (tFirst + R() * Math.max(0.01, Math.min(tq, tNow) - tFirst)));
    var mto = Math.pow(10 / age, 0.4);
    var M = kind === "sun" ? 0.9 + 0.2 * R() : kind === "red" ? 0.1 + 0.33 * R() : kroupa(R, 0.08, Math.min(mto, 60));
    var sp = starProps(M);
    if (sp.life < age) age = sp.life * (0.2 + 0.7 * R());
    var feh = gal ? ohMZR(gal.lm, z) - 0.1 + Ng() * 0.2 : -0.3;
    var F = originFractions(cur.la);
    if (F.M < 1e-3) feh = -5;
    var star = { M: M, L: sp.L, R: sp.R, T: sp.T, cls: sp.cls + "V", life: sp.life, age: age, feh: feh };
    // 행성: 케플러 통계 (작은 행성은 흔하고, 거대행성은 금속량 10^(2[Fe/H])에 비례)
    var planets = [], lamS = (M < 0.6 ? 2.5 : 1.6) * (feh < -1.5 ? 0.05 : feh < -0.8 ? 0.4 : 1), pG = clamp(0.07 * Math.pow(10, 2 * feh) * Math.min(1.6, M), 0, 0.6);
    function poisson(l) { var k = 0, p = Math.exp(-l), s = p, u = R(); while (u > s && k < 12) { k++; p *= l / k; s += p; } return k; }
    var nS = poisson(lamS), nG = R() < pG ? 1 + (R() < 0.3 ? 1 : 0) : 0, list = [];
    for (var i = 0; i < nS; i++) list.push({ P: Math.exp(Math.log(1) + R() * (Math.log(400) - Math.log(1))), small: true });
    for (i = 0; i < nG; i++) list.push({ P: Math.exp(Math.log(30) + R() * (Math.log(20000) - Math.log(30))), small: false });
    list.sort(function (a, b) { return a.P - b.P; });
    var lastP = 0;
    list.forEach(function (p) {
      if (lastP && p.P / lastP < 1.35) return;
      var a = Math.cbrt(M * Math.pow(p.P / 365.25, 2));
      // 행성 재료가 될 금속이 충분해야 함 (Johnson & Li 2012: [Fe/H]crit ≈ −1.5 + log a)
      if (feh < -1.5 + Math.log10(a)) return;
      var Rp, type;
      if (p.small) { Rp = R() < 0.5 ? clamp(1.3 + 0.25 * Ng(), 0.4, 1.75) : clamp(2.4 + 0.45 * Ng(), 1.9, 4); }
      else Rp = R() < 0.15 ? 3.5 + 2.5 * R() : 7 + 5 * R();
      var Teq = 278.6 * Math.pow(sp.L, 0.25) / Math.sqrt(a) * 0.915;
      type = Rp < 1.6 ? "암석 행성" : Rp < 4 ? (Rp < 1.9 ? "슈퍼지구" : "미니 해왕성") : Rp < 7 ? "얼음 거대행성" : (p.P < 10 ? "뜨거운 목성" : "가스 거대행성");
      planets.push({ a: a, R: Rp, P: p.P, type: type, Teq: Teq });
      lastP = p.P;
    });
    planets.forEach(function (p, k) { p.name = String.fromCharCode(98 + k); });
    var gname = gal ? TYPE_NAME[gal.type] : "은하";
    return { name: gname + "의 " + sp.cls + "형 별", star: star, planets: planets, real: false, noMetal: F.M < 1e-3 };
  }
  function enterSystem(kind) {
    if (!glOK) return;
    var sysData = genSystem(kind);
    $("fade").classList.add("on");
    setTimeout(function () {
      buildSystemScene(sysData);
      sys.prevMode = cam.mode === "system" ? sys.prevMode : cam.mode;
      cam.mode = "system";
      state.running = false; updateControls();
      showSysCard(sysData);
      $("sysGroup").hidden = false; $("galGroup").hidden = true; $("starGroup").hidden = true;
      setTimeout(function () { $("fade").classList.remove("on"); }, 60);
    }, 360);
  }
  function exitSystem() {
    $("fade").classList.add("on");
    setTimeout(function () {
      cam.mode = sys.prevMode && sys.prevMode !== "system" ? (sys.prevMode === "goto" ? "orbit" : sys.prevMode) : "overview";
      if (cam.mode === "orbit" && cam.sel < 0) cam.mode = "overview";
      $("sysGroup").hidden = true; $("galGroup").hidden = false; $("starGroup").hidden = false; $("sysCard").hidden = true;
      sys.labels.forEach(function (l) { l.el.remove(); }); sys.labels = [];
      setTimeout(function () { $("fade").classList.remove("on"); }, 60);
    }, 360);
  }
  var glowTex = null;
  function buildSystemScene(d) {
    if (!sys.scene) { sys.scene = new THREE.Scene(); sys.cam = new THREE.PerspectiveCamera(FOV, 1, 1e-4, 1e5); glowTex = glowTexture(); }
    sys.cam.aspect = W / Math.max(1, H); sys.cam.updateProjectionMatrix();
    var s = sys.scene;
    while (s.children.length) { var c = s.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
    sys.labels.forEach(function (l) { l.el.remove(); }); sys.labels = [];
    var col = blackbody(d.star.T).map(function (v) { return v / 255; });
    var Rs = 0.06 * Math.pow(d.star.R, 0.5);
    var starMesh = new THREE.Mesh(new THREE.SphereGeometry(Rs, 48, 24), new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Vector3(col[0], col[1], col[2]) } }, vertexShader: STAR_VS, fragmentShader: STAR_FS }));
    s.add(starMesh);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(col[0], col[1], col[2]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(Rs * 9); s.add(glow);
    // 생명 가능 지대 (Kopparapu et al. 2013: 폭주 온실 1.107, 최대 온실 0.356 S⊕)
    var hzIn = Math.sqrt(d.star.L / 1.107), hzOut = Math.sqrt(d.star.L / 0.356);
    var hz = new THREE.Mesh(new THREE.RingGeometry(hzIn, hzOut, 160, 1), new THREE.MeshBasicMaterial({ color: 0x1baf7a, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    hz.rotation.x = -Math.PI / 2; s.add(hz);
    d.hz = [hzIn, hzOut];
    // 배경 별
    var bg = new THREE.BufferGeometry(), bp = new Float32Array(3 * 2500), rb = rng(99);
    for (var i = 0; i < 2500; i++) { var cz = 2 * rb() - 1, p = 6.2831853 * rb(), sn = Math.sqrt(1 - cz * cz); bp[3 * i] = 3000 * sn * Math.cos(p); bp[3 * i + 1] = 3000 * cz; bp[3 * i + 2] = 3000 * sn * Math.sin(p); }
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    s.add(new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xbfc4dc, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
    sys.planets = [];
    var maxA = 0.2;
    d.planets.forEach(function (p, k) {
      maxA = Math.max(maxA, p.a);
      var orb = [], seg = 192;
      for (var j = 0; j < seg; j++) { var t = j / seg * 6.2831853; orb.push(new THREE.Vector3(p.a * Math.cos(t), 0, p.a * Math.sin(t))); }
      s.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orb), new THREE.LineBasicMaterial({ color: 0x8a86a0, transparent: true, opacity: 0.35 })));
      var inHZ = p.a >= hzIn && p.a <= hzOut && p.R < 1.8;
      var base = p.type.indexOf("가스") >= 0 || p.type === "뜨거운 목성" ? [[0.82, 0.68, 0.5], [0.95, 0.88, 0.75], 1] : p.type.indexOf("얼음") >= 0 || p.type === "미니 해왕성" ? [[0.45, 0.7, 0.85], [0.6, 0.82, 0.92], 1]
        : inHZ ? [[0.2, 0.42, 0.7], [0.42, 0.55, 0.35], 0] : (p.Teq > 700 ? [[0.55, 0.3, 0.2], [0.85, 0.5, 0.25], 0] : [[0.5, 0.47, 0.44], [0.7, 0.66, 0.6], 0]);
      if (d.real) { var RC = { "수성": [[0.55, 0.53, 0.5], [0.7, 0.68, 0.64], 0], "금성": [[0.9, 0.82, 0.62], [0.95, 0.9, 0.75], 1], "지구": [[0.15, 0.35, 0.7], [0.35, 0.55, 0.3], 0], "화성": [[0.7, 0.32, 0.18], [0.85, 0.5, 0.3], 0] }; if (RC[p.name]) base = RC[p.name]; }
      var rd = 0.025 * Math.pow(p.R, 0.55);
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(rd, 32, 16), new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Vector3(base[0][0], base[0][1], base[0][2]) }, uCol2: { value: new THREE.Vector3(base[1][0], base[1][1], base[1][2]) }, uBands: { value: base[2] }, uSeed: { value: k * 1.7 + 0.3 } },
        vertexShader: PL_VS, fragmentShader: PL_FS }));
      s.add(mesh);
      var ang = (k * 2.399) % 6.2831853;
      sys.planets.push({ mesh: mesh, a: p.a, P: p.P, ang: ang });
      var lab = document.createElement("div"); lab.className = "plabel"; lab.textContent = p.name; $("labels").appendChild(lab);
      sys.labels.push({ el: lab, mesh: mesh });
    });
    sys.r = clamp(maxA * 2.6, 0.4, 120); sys.rMin = Rs * 3; sys.rMax = Math.max(200, maxA * 8); sys.theta = 0.6; sys.phi = 1.15;
    sys.data = d;
  }
  var _sv;
  function updateSystem(dt) {
    sys.planets.forEach(function (p) {
      p.ang += 6.2831853 * dt * sys.daysPerSec / p.P;
      p.mesh.position.set(p.a * Math.cos(p.ang), 0, -p.a * Math.sin(p.ang));
      p.mesh.rotation.y += dt * 0.6;
    });
    if (cam.auto && !pointers.size) sys.theta += 0.04 * dt;
    var d = dirOf(sys.theta, sys.phi);
    sys.cam.position.set(d[0] * sys.r, d[1] * sys.r, d[2] * sys.r);
    sys.cam.lookAt(0, 0, 0);
    sys.cam.updateMatrixWorld();
    if (!_sv) _sv = new THREE.Vector3();
    sys.labels.forEach(function (l) {
      _sv.copy(l.mesh.position).project(sys.cam);
      var vis = _sv.z < 1 && Math.abs(_sv.x) < 1.05 && Math.abs(_sv.y) < 1.05;
      l.el.style.display = vis ? "block" : "none";
      if (vis) { l.el.style.left = ((_sv.x * 0.5 + 0.5) * W) + "px"; l.el.style.top = ((-_sv.y * 0.5 + 0.5) * H) + "px"; }
    });
  }

  // ---------- 카드 ----------
  function mosterHalo(lmStar, z) {
    var a = z / (1 + z), M1 = 11.59 + 1.195 * a, Nn = 0.0351 - 0.0247 * a, be = 1.376 - 0.826 * a, ga = 0.608 + 0.329 * a;
    function mstar(lh) { var r = Math.pow(10, lh - M1); return Math.log10(2 * Nn * Math.pow(10, lh) / (Math.pow(r, -be) + Math.pow(r, ga))); }
    return bisect(function (lh) { return mstar(lh) - lmStar; }, 8, 16);
  }
  function showGalCard(g) { $("galCard").hidden = false; last.gcFrame = -99; galCardUpdate(g, true); }
  function galCardUpdate(g, force) {
    if (g < 0 || !GAL) { $("galCard").hidden = true; return; }
    var st = galState(g);
    if (!st) { setText("gcName", "아직 생기기 전인 은하"); setText("gcList", "", true); return; }
    var name = st.type === 0 && st.bar ? "막대나선은하" : TYPE_NAME[st.type];
    setText("gcName", name + " #" + g);
    var tG = core.tOf(cur.la) / GYR, sfr = Math.pow(10, (0.84 - 0.026 * tG) * st.lm - (6.51 - 0.11 * tG)) * (st.quen ? 0.01 : 1);
    var p = galWorld(g, [0, 0, 0]), dist = len3(p, cam.pos) / 10 * L_BOX / core.h * cur.a;
    var oh = ohMZR(st.lm, cur.z), F = originFractions(cur.la);
    var rows = [
      ["별 질량", "10" + sup(st.lm.toFixed(2)) + " M☉"],
      ["헤일로 질량", "10" + sup(mosterHalo(st.lm, cur.z).toFixed(1)) + " M☉<small>Moster 2013 관계식</small>"],
      ["유효 반지름", st.rk.toFixed(st.rk < 10 ? 1 : 0) + " kpc<small>van der Wel 2014 크기 관계</small>"],
      ["별 형성률", (sfr < 0.01 ? sfr.toExponential(1) : sfr.toPrecision(2)) + " M☉/년<small>" + (st.quen ? "별 형성 정지 (붉은 은하)" : "주계열 (Speagle 2014)") + "</small>"],
      ["기체 금속량", F.M < 1e-3 ? "없음 (첫 별 이전)" : "[O/H] = " + oh.toFixed(2) + "<small>질량–금속량 관계 (Tremonti 2004)</small>"],
      ["거리", dist < 1 ? (dist * 1000).toFixed(0) + " kpc" : dist.toPrecision(3) + " Mpc"],
      ["세부 구조", "씨앗 #" + Math.floor(st.seed * 1e6) + "에서 절차 생성"]
    ];
    setText("gcList", rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join(""), true);
  }
  function showSysCard(d) {
    $("sysCard").hidden = false; $("galCard").hidden = true;
    var s = d.star, life = s.life > 100 ? "1,000억 년 이상" : s.life.toPrecision(2) + " Gyr";
    $("scName").textContent = d.name;
    $("scStar").innerHTML = [["분광형 · 온도", s.cls + " · " + fmtNum(s.T) + " K"], ["질량 · 반지름", s.M.toFixed(2) + " M☉ · " + s.R.toFixed(2) + " R☉"],
      ["광도", (s.L < 0.01 ? s.L.toExponential(1) : s.L.toPrecision(3)) + " L☉"], ["나이 · 수명", s.age.toFixed(2) + " Gyr · " + life],
      ["금속량 [Fe/H]", s.feh < -4 ? "없음 (종족 III)" : s.feh.toFixed(2)], ["생명 가능 지대", d.hz[0].toPrecision(2) + "–" + d.hz[1].toPrecision(2) + " AU"]]
      .map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("");
    var rows = d.planets.map(function (p) {
      var inHZ = p.a >= d.hz[0] && p.a <= d.hz[1];
      var Teq = p.Teq !== undefined ? p.Teq : 278.6 * Math.pow(s.L, 0.25) / Math.sqrt(p.a) * 0.915;
      return "<tr><td>" + p.name + "</td><td>" + p.type + (inHZ ? ' <span class="hz">· 생명 가능 지대</span>' : "") + '</td><td class="num">' + p.R.toFixed(2) + '</td><td class="num">' + p.a.toPrecision(3) + '</td><td class="num">' + (p.P < 1000 ? p.P.toFixed(1) : fmtNum(p.P)) + '</td><td class="num">' + fmtNum(Teq) + "</td></tr>";
    }).join("");
    $("scPlanets").innerHTML = d.planets.length ? "<thead><tr><th>행성</th><th>종류</th><th>반지름 R⊕</th><th>궤도 AU</th><th>공전 일</th><th>평형 온도 K</th></tr></thead><tbody>" + rows + "</tbody>" : "";
    $("scNote").textContent = d.real ? "실제 태양계 자료입니다. 화면의 행성·별 크기는 보기 쉽게 확대했습니다."
      : d.noMetal ? "이 시대에는 무거운 원소(금속)가 없어 행성을 만들 재료가 없습니다. 첫 별이 폭발한 뒤에야 암석 행성이 생길 수 있습니다."
      : d.planets.length ? "케플러 관측 통계에 맞춰 생성한 가상의 행성입니다. 암석 행성은 지구처럼 철·산소·규소·마그네슘이 90% 이상이고, 가스 거대행성은 대부분 수소·헬륨입니다."
      : "이번에는 행성이 생성되지 않았습니다. 금속량이 낮거나 확률상 행성이 없는 별입니다. 다시 눌러 다른 별을 골라 보세요.";
  }

  // ---------- 계기판 ----------
  var last = {};
  function setText(id, v, html) {
    if (last[id] === v) return;
    last[id] = v;
    if (html) $(id).innerHTML = v; else $(id).textContent = v;
  }
  function updatePanel(la, frameNo) {
    var a = Math.pow(10, la), t = core.tOf(la), ei = eraIndex(la), e = ERAS[ei], z = 1 / a - 1;
    var aTxt = "a = " + (la > -2 ? a.toPrecision(3) : sci(a));
    var zTxt = Math.abs(z) < 5e-4 ? "z = 0 (오늘)" : z < 0 ? "z = " + z.toFixed(3) + " (미래)" : "z = " + (z < 10 ? z.toFixed(3) : z < 1e5 ? fmtNum(z) : sci(z));
    setText("rA", aTxt + "<small>" + zTxt + "</small>", true);
    var tTxt = la < core.LA_RH ? "인플레이션 끝나기 " + fmtTime(core.tOf(core.LA_RH) - t) + " 전" : fmtTime(t);
    setText("rT", tTxt);
    var T = la < core.LA_RH ? 0 : core.TofA(a), kT = T * core.KMEV;
    setText("rTemp", la < core.LA_RH ? "정의 안 됨 (진공 에너지 지배)" : fmtTemp(T) + " K<small>kT = " + fmtEnergy(kT) + " · g*ₛ = " + core.gsOf(a).toFixed(2) + "</small>", true);
    var Hkm = core.Hs(a) * 3.0857e19;
    setText("rH", la < core.LA_RH ? sci(core.Hs(Math.pow(10, core.LA_RH))) + " /초 (일정)" : (Hkm < 1e5 ? Hkm.toFixed(Hkm < 1000 ? 2 : 0) : sci(Hkm)) + " km/s/Mpc");
    var side = L_BOX / core.h * MPC * a;
    setText("rSize", fmtLen(side) + "<small>" + compare(side) + "</small>", true);
    if (cam.mode !== "system") {
      setText("hudEra", e.name);
      setText("hudEraSub", la < core.LA_RH ? tTxt : "빅뱅 후 " + fmtTime(t));
      setText("hudA", aTxt + " · " + zTxt);
      setText("hudT", la < core.LA_RH ? "인플라톤 장" : fmtTemp(T) + " K · " + fmtEnergy(kT));
      setText("hudSize", cam.mode === "overview" || cam.mode === "home" ? "상자 한 변 " + fmtLen(side) : cam.mode === "fly" ? "비행 속도 " + fmtLen((cam.flySpeed || 0) / 10 * L_BOX / core.h * MPC * a) + "/초" : "");
    } else if (sys.data) {
      setText("hudEra", sys.data.name);
      setText("hudEraSub", "빅뱅 후 " + fmtTime(t) + " · 별 나이 " + sys.data.star.age.toFixed(2) + " Gyr");
      setText("hudA", "1초 = " + sys.daysPerSec + "일");
      setText("hudT", "");
      setText("hudSize", "궤도 단위 AU · 크기 확대 표시");
    }
    setText("hudHint", cam.mode === "system" ? "드래그: 회전 · 휠/두 손가락: 확대" : cam.mode === "fly" ? "드래그: 바라보기 · W/S 앞뒤 · A/D 옆 · R/F 위아래 · Shift 빠르게 · 휠 속도" : "드래그: 회전 · 휠: 확대 · 은하를 누르면 날아감", false);
    setText("eraTitle", e.name);
    setText("eraText", e.text);

    var f = fractions(la), pct = function (v) { return v >= 0.9995 ? "100%" : v < 0.0005 ? (v > 0 ? "<0.1%" : "0%") : (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%"; };
    if (!f) { $("mDE").style.width = "0"; $("mDM").style.width = "0"; $("mB").style.width = "0"; $("mR").style.width = "0"; }
    else { $("mDE").style.width = f.de * 100 + "%"; $("mDM").style.width = f.c * 100 + "%"; $("mB").style.width = f.b * 100 + "%"; $("mR").style.width = f.r * 100 + "%"; }
    setText("mixLegend", !f ? '<span><i style="background:var(--c-inf)"></i>인플라톤 장 100%</span>'
      : '<span><i style="background:var(--c-de)"></i>암흑에너지 ' + pct(f.de) + '</span><span><i style="background:var(--c-dm)"></i>암흑물질 ' + pct(f.c) +
        '</span><span><i style="background:var(--c-b)"></i>보통 물질 ' + pct(f.b) + '</span><span><i style="background:var(--c-rad)"></i>복사 ' + pct(f.r) + "</span>", true);

    if (la < core.LA_RH) { setText("rXe", "—"); setText("rMfp", "—"); }
    else if (z > 1e4) { setText("rXe", "완전 이온화 플라스마"); setText("rMfp", fmtLen(ION.mfp(Math.min(z, 1e9)) * a) + "<small>빛이 거의 나아가지 못함</small>", true); }
    else {
      var xe = ION.xe(Math.max(z, 0));
      setText("rXe", (xe >= 0.01 ? xe.toFixed(3) : sci(xe, 2)) + "<small>마지막 산란 z* = " + ION.zStar.toFixed(1) + " (계산)</small>", true);
      var lam = ION.mfp(Math.max(z, 0)) * a;
      setText("rMfp", fmtLen(lam) + "<small>" + (lam / side > 1 ? "상자보다 김: 투명" : "상자의 " + (lam / side * 100).toPrecision(2) + "%: 불투명") + "</small>", true);
    }
    var Tm = la < core.LA_RH ? 1e30 : core.TofA(a) * core.KMEV, nuc;
    if (la < core.LA_RH) nuc = "입자 없음 (인플라톤 장)";
    else if (Tm > 156.5) nuc = "쿼크–글루온 플라스마";
    else if (la < BBN.la0) nuc = "양성자·중성자 평형<small>n/p = e^(−Q/kT) = " + Math.exp(-1.293 / Tm).toFixed(3) + "</small>";
    else if (la < BBN.laNuc) { var X = BBN.XnAt(la); nuc = "n/p = " + (X / (1 - X)).toFixed(4) + "<small>약한 반응률 적분 (계산)</small>"; }
    else nuc = "Yₚ = " + BBN.YpCalc.toFixed(3) + " (계산)<small>PRIMAT 0.2471 · 관측 0.2453±0.0034<br>D/H 2.46×10⁻⁵ 예측 · 2.527×10⁻⁵ 관측<br>⁷Li/H 5.6×10⁻¹⁰ 예측 · 1.6×10⁻¹⁰ 관측 (리튬 문제)</small>";
    setText("rNuc", nuc, true);
    setText("rMetal", metalSummary(la), true);

    var D = core.growth(la);
    setText("rS8", la < -6 ? "≈ 0 (복사 시대: 거의 자라지 않음)" : (core.P.sigma8 * D).toPrecision(3) + "<small>선형 성장 D(a) = " + D.toPrecision(3) + "</small>", true);
    if (z < 40) {
      var ps = psiMD(Math.max(z, -0.99)), rs = SFR.rhoAt(la);
      setText("rSfr", ps.toPrecision(3) + " M☉/년/Mpc³<small>MD14 · 최대 대비 " + Math.round(ps / SFR.peak * 100) + "%</small>", true);
      setText("rRhoS", (rs > 0 ? sci(rs, 2) : "0") + " M☉/Mpc³<small>상자 안 별 " + (rs > 0 ? sci(rs * Math.pow(L_BOX / core.h, 3), 1) : "0") + " M☉</small>", true);
    } else { setText("rSfr", "0 (별 없음)"); setText("rRhoS", "0"); }
    setText("rGal", GAL ? fmtNum(GCOUNT) + "개<small>별 질량 ≥ 10⁷ M☉ (오늘 기준, Baldry 2012)</small>" : (sim.done ? "만드는 중…" : "N-body 계산 뒤 생성"), true);
    setText("rSim", simStatus(la), true);

    if (last.era !== ei) { last.era = ei; jumpBtns.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === ei)); }); }
    if (document.activeElement !== scrub) scrub.value = la;
    var galOK = glOK && GAL && la > laZ(15);
    ["goNear", "goMW", "goDwarf", "goBCG", "flyBtn"].forEach(function (id) { $(id).disabled = !galOK || cam.mode === "system"; });
    $("homeBtn").disabled = cam.mode === "overview";
    var inGal = cam.mode === "orbit" && cam.sel >= 0 && galOK;
    ["sysRandom", "sysSun", "sysRed"].forEach(function (id) { $(id).disabled = !inGal; });
    $("sysSolar").disabled = !(la >= ERAS.laSun) || !glOK;
    if (cam.sel >= 0 && cam.mode !== "system" && frameNo % 15 === 0) galCardUpdate(cam.sel);
  }
  function simStatus(la) {
    var pct = Math.round(sim.step / NSTEPS * 100);
    var lastLa = snaps.length ? snaps[snaps.length - 1].la : LA_I;
    var base = sim.failed ? "작업자를 쓸 수 없어 젤도비치 근사만 표시"
      : sim.done ? "PM 완료 · 96단계 · z = 99 → 미래"
      : "계산 중 " + pct + "% (z = " + (Math.pow(10, -lastLa) - 1).toFixed(2) + "까지)";
    var mode = la <= LA_I ? "z > 99: 선형 젤도비치 변위" : (la > lastLa ? "아직 계산 전: 선형 근사로 표시" : "N-body 결과 표시 중");
    setText("hudSim", cam.mode === "system" ? "" : la > LA_I ? (la > lastLa && !sim.done ? "N-body 계산 중 " + pct + "% · 선형 근사 표시" : "PM N-body 결과") : "");
    return base + "<small>" + mode + "</small>";
  }

  // ---------- 해상도 · 노출 ----------
  var dyn = { scale: 1, ema: 16.7, lastAdj: 0, fps: 60 };
  var expo = { log: -8.5, user: 0 };
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    if (glOK) {
      var pr = dpr * dyn.scale;
      renderer.setPixelRatio(pr);
      renderer.setSize(W, H, false);
      camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
      if (sys.cam) { sys.cam.aspect = camera.aspect; sys.cam.updateProjectionMatrix(); }
      U.uScale.value = H * pr / (2 * Math.tan(FOV / 2 * Math.PI / 180));
      U.uRes.value.set(Math.max(1, W * pr), Math.max(1, H * pr));
      partMat.uniforms.uMinSize.value = 1.3 * pr; partMat.uniforms.uMaxPx.value = 34 * pr;
      galMat.uniforms.uMinPx.value = 1.6 * pr;
      pool.forEach(function (s) { s.pts.material.uniforms.uMinSize.value = 1.0 * pr; s.dust.material.uniforms.uMinSize.value = 1.2 * pr; });
    }
    var t = tlc.getBoundingClientRect();
    tlc.width = Math.round(t.width * dpr); tlc.height = Math.round(t.height * dpr);
    drawTimeline();
  }
  function dynamicResolution(frameMs, now) {
    if (frameMs > 250) return;
    dyn.ema = dyn.ema * 0.93 + frameMs * 0.07;
    dyn.fps = 1000 / dyn.ema;
    if (now - dyn.lastAdj < 1200) return;
    if (dyn.ema > 24 && dyn.scale > 0.55) { dyn.scale = Math.max(0.55, dyn.scale - 0.1); dyn.lastAdj = now; resize(); }
    else if (dyn.ema < 14 && dyn.scale < 1) { dyn.scale = Math.min(1, dyn.scale + 0.05); dyn.lastAdj = now; resize(); }
  }

  // ---------- 장면 갱신 ----------
  var L_M = L_BOX / 0.6736 * MPC, frameNo = 0, clock = 0;
  function render(la, dt) {
    var a = Math.pow(10, la), z = 1 / a - 1;
    cur.la = la; cur.a = a; cur.z = z;
    var rs = la > SFR.la0 ? SFR.rhoAt(la) : 0;
    cur.logRho = rs > 0 ? Math.log10(rs / SFR.rho0) : -30;
    var sky = skyColor(la), Lsky = lum(sky), dark = Lsky <= 0.55;
    stage.classList.toggle("light-sky", Lsky > 0.55 && cam.mode !== "system");
    if (!glOK) return;
    setKeyframes(la);
    if (cam.mode === "system") {
      updateSystem(dt);
      renderer.setClearColor(0x000000, 1);
      renderer.render(sys.scene, sys.cam);
      return;
    }
    updateCamera(dt);
    clearCol.setRGB(sky[0] / 255, sky[1] / 255, sky[2] / 255);
    renderer.setClearColor(clearCol, 1);
    U.uCam.value.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    U.uWrap.value = wrapOn ? 1 : 0;

    // 입자 유니폼: 시대별 입자와 안개
    var pu = partMat.uniforms;
    var Tm = la < core.LA_RH ? 1e30 : core.TofA(a) * core.KMEV;
    var phase = la < core.LA_RH ? 0 : Tm > 156.5 ? 1 : la < BBN.laNuc ? 2 : z > ION.zHalf ? 3 : 4;
    pu.uPhase.value = phase;
    pu.uXn.value = phase === 2 ? (la < BBN.la0 ? 1 / (1 + Math.exp(1.293 / Tm)) : BBN.XnAt(la)) : 0;
    pu.uHeF.value = phase === 3 ? BBN.heNum * smooth(BBN.laNuc, BBN.laNuc + 0.12, la) : 0;
    pu.uIon.value = phase === 4 ? clamp(ION.xe(Math.max(z, 0)), 0, 1) : 0;
    pu.uGasBase.value = (0.24 + 0.26 * smooth(laZ(ION.zHalf), laZ(30), la)) * (GAL && la > laZ(6) ? 0.75 : 1);
    pu.uDark.value = dark ? 1 : 0;
    pu.uDM.value = (dmOn ? 1 : 0) * (wrapOn ? 0.45 : 1);
    pu.uNearFade.value = wrapOn ? 1 : 0;
    clock += dt; pu.uTime.value = clock % 100;
    pu.uJit.value = la < -3.1 ? (la < core.LA_RH ? 0.004 : 0.0015 + 0.004 * clamp((-3.1 - la) / 22, 0, 1)) : 0;
    var fogD = la < core.LA_RH ? 0.05 : z > 1700 ? 0.42 : clamp(L_M / (ION.mfp(Math.max(z, 0)) * BOX), 0.012, 0.42);
    pu.uFogDensity.value = fogD; pu.uFogColor.value.copy(clearCol);
    pu.uFogStart.value = wrapOn ? 0 : Math.max(0, len3(cam.pos, C0) - BOX * 0.5);
    var wantBlend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (partMat.blending !== wantBlend) { partMat.blending = wantBlend; partMat.needsUpdate = true; }

    // 은하 유니폼 + 자동 노출 (눈 적응)
    if (galMesh) {
      var gu = galMat.uniforms;
      gu.uLogRho.value = cur.logRho; gu.uZ.value = Math.max(z, 0); gu.uAinv.value = 1 / a; gu.uHub.value = core.h;
      var rRef = cam.mode === "overview" ? cam.r : cam.mode === "orbit" ? cam.orbitR : cam.mode === "fly" ? Math.max(cam.near, 0.002) : Math.max(1e-3, cam.tw ? len3(cam.pos, cam.tw.kind === "goto" ? galWorld(cam.tw.g, [0, 0, 0]) : C0) : 1);
      var target = Math.log10(1.7e-10 * rRef) + expo.user * 0.3;
      expo.log += (target - expo.log) * (1 - Math.exp(-dt / 0.6));
      gu.uExp.value = Math.pow(10, expo.log);
      galMesh.visible = la > laZ(40);
    }

    // 상자 테두리와 팽창 고리: 상자 밖 전체 보기에서만
    var showBox = !wrapOn;
    var lineCol = la < core.LA_RH ? [0.75, 0.6, 1] : dark ? [0.8, 0.78, 1] : [0.16, 0.08, 0.24];
    boxLines.visible = showBox;
    boxLines.position.set(C0[0] - cam.pos[0], C0[1] - cam.pos[1], C0[2] - cam.pos[2]);
    boxLines.material.color.setRGB(lineCol[0], lineCol[1], lineCol[2]);
    boxLines.material.opacity = dark ? 0.16 : 0.28;
    shells.forEach(function (sh, k) {
      var u = la + k / 3; u -= Math.floor(u);
      sh.g.visible = showBox;
      sh.g.position.copy(boxLines.position);
      sh.g.scale.setScalar(1.3 * Math.pow(10, u));
      sh.m.color.setRGB(lineCol[0], lineCol[1], lineCol[2]);
      sh.m.opacity = (dark ? 0.2 : 0.16) * Math.sin(Math.PI * u);
    });

    if (frameNo % 3 === 0) lodUpdate(frameNo);
    lodFrame(dt);
    renderer.render(scene, camera);
  }

  // ---------- 상태와 조작 ----------
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var state = { la: -38, running: true, clock: "expand", speed: 1 };
  var RATE_LA = 0.8, dmOn = true;
  if (reduceMotion) { state.la = -0.4; state.running = false; cam.auto = false; $("autoBtn").setAttribute("aria-pressed", "false"); }
  var scrub = $("scrub");
  scrub.addEventListener("input", function () { state.la = parseFloat(scrub.value); });
  scrub.addEventListener("pointerdown", function () { state.running = false; updateControls(); });

  var jumpBtns = [];
  function buildJumps() {
    $("jumps").innerHTML = "";
    jumpBtns = ERAS.map(function (e) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = e.short; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { if (cam.mode === "system") exitSystem(); state.la = Math.min(core.LA_MAX, e.la + (e.la === 0 ? 0 : 0.0005)); });
      $("jumps").appendChild(b);
      return b;
    });
    last.era = -1;
  }
  function rateT() { return core.tOf(0) / 35; }
  function updateControls() {
    $("playBtn").textContent = state.running ? "일시정지" : (state.la >= core.LA_MAX ? "다시 재생" : "재생");
    var sp = state.speed;
    $("clockNote").textContent = state.clock === "expand"
      ? "팽창 시계: 재생 1초마다 우주가 " + Math.pow(10, RATE_LA * sp).toFixed(1) + "배 커집니다. 인플레이션부터 오늘까지 약 " + Math.round(-core.LA_MIN / (RATE_LA * sp)) + "초. 은하가 생긴 뒤에는 은하를 누르거나 ‘은하 탐험’으로 가까이 갈 수 있습니다."
      : "보통 시계: 재생 1초마다 " + fmtTime(rateT() * sp) + "가 흐릅니다. 오늘까지 약 " + Math.round(35 / sp) + "초, 그 앞의 모든 일은 첫 순간에 지나갑니다.";
  }
  $("playBtn").addEventListener("click", function () {
    if (cam.mode === "system") exitSystem();
    if (!state.running && state.la >= core.LA_MAX) state.la = core.LA_MIN;
    state.running = !state.running; updateControls();
  });
  $("restartBtn").addEventListener("click", function () { if (cam.mode === "system") exitSystem(); if (cam.mode !== "overview") startHome(); state.la = core.LA_MIN; state.running = true; updateControls(); });
  function chipGroup(id, attr, fn) {
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("[" + attr + "]"); if (!b) return;
      $(id).querySelectorAll("[" + attr + "]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      fn(b.getAttribute(attr));
    });
  }
  chipGroup("clockChips", "data-clock", function (v) { state.clock = v; updateControls(); });
  chipGroup("speedChips", "data-speed", function (v) { state.speed = parseFloat(v); updateControls(); });
  chipGroup("modelChips", "data-model", function (v) { if (v !== model) { model = v; if (cam.mode !== "overview" && cam.mode !== "system") startHome(); build(); } });
  chipGroup("sysGroup", "data-days", function (v) { sys.daysPerSec = parseFloat(v); });
  $("autoBtn").addEventListener("click", function () { cam.auto = !cam.auto; this.setAttribute("aria-pressed", String(cam.auto)); });
  $("dmBtn").addEventListener("click", function () { dmOn = !dmOn; this.setAttribute("aria-pressed", String(dmOn)); });
  $("expDown").addEventListener("click", function () { expo.user = Math.max(-4, expo.user - 1); });
  $("expUp").addEventListener("click", function () { expo.user = Math.min(4, expo.user + 1); });
  $("homeBtn").addEventListener("click", function () { if (cam.mode !== "overview") startHome(); });
  $("flyBtn").addEventListener("click", function () {
    if (!glOK) return;
    if (cam.mode === "fly") { this.setAttribute("aria-pressed", "false"); if (cam.sel >= 0) { cam.mode = "orbit"; } else startHome(); return; }
    var f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quat);
    if (!inside(cam.pos)) { cam.pos = [5, 5, 5]; }
    cam.yaw = Math.atan2(f.z, f.x); cam.pitch = Math.asin(clamp(f.y, -1, 1));
    cam.mode = "fly"; cam.tw = null; state.running = false; updateControls();
    this.setAttribute("aria-pressed", "true");
  });
  // 은하 고르기 버튼: 조건에 맞는 은하 중 카메라에서 가장 가까운 것
  function findGalaxy(test) {
    if (!GAL) return -1;
    var best = -1, bd = 1e9, p = [0, 0, 0], ref = cam.mode === "overview" ? C0 : cam.pos, saveWrap = wrapOn;
    wrapOn = cam.mode !== "overview";
    for (var g = 0; g < GCOUNT; g++) {
      if (g === cam.sel) continue;
      var st = galState(g); if (!st || !test(st, g)) continue;
      galWorld(g, p);
      var d = len3(p, ref);
      if (d < bd) { bd = d; best = g; }
    }
    wrapOn = saveWrap;
    return best;
  }
  $("goNear").addEventListener("click", function () { startGoto(findGalaxy(function (s) { return s.lm > 8.6; })); });
  $("goMW").addEventListener("click", function () { startGoto(findGalaxy(function (s) { return s.type === 0 && s.lm > 10.55 && s.lm < 11.0; })); });
  $("goDwarf").addEventListener("click", function () { startGoto(findGalaxy(function (s) { return (s.type === 1 || s.type === 5) && s.lm < 8.8; })); });
  $("goBCG").addEventListener("click", function () {
    if (!GAL) return;
    var best = -1, bl = 0;
    for (var g = 0; g < GCOUNT; g++) { var st = galState(g); if (st && st.type === 3 && st.lm > bl) { bl = st.lm; best = g; } }
    startGoto(best);
  });
  $("sysRandom").addEventListener("click", function () { enterSystem("random"); });
  $("sysSun").addEventListener("click", function () { enterSystem("sun"); });
  $("sysRed").addEventListener("click", function () { enterSystem("red"); });
  $("sysSolar").addEventListener("click", function () { enterSystem("solar"); });
  $("sysBack").addEventListener("click", exitSystem);

  function build() {
    core = createCosmology({ model: model });
    LA_QCD = laOfTemp(156.5);
    ION = buildIon(core);
    BBN = buildBBN(core);
    SFR = buildSFR(core);
    var eras = buildEras(core, ION, BBN, SFR);
    ERAS = eras.list; ERAS.laSun = eras.laSun;
    buildJumps();
    last = {};
    startWorker();
    drawTimeline();
    updateControls();
    lastPT = -99;
    updatePeriodicTable(state.la, true);
  }

  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", readTokens);
  }
  new MutationObserver(readTokens).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  buildPeriodicTable();
  readOriginColors();
  build();
  if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(stage); ro.observe(tlc); }
  else window.addEventListener("resize", resize);
  resize(); readTokens();

  var prev = performance.now();
  function frame(now) {
    var ms = now - prev; prev = now;
    tick(ms, now);
    requestAnimationFrame(frame);
  }
  function tick(ms, now) {
    var dt = Math.min(0.05, ms / 1000);
    frameNo++;
    if (glOK) dynamicResolution(ms, now);
    if (state.running && cam.mode !== "system") {
      if (state.clock === "expand") state.la += RATE_LA * state.speed * dt;
      else state.la = core.laOfT(core.tOf(state.la) + rateT() * state.speed * dt);
      if (state.la >= core.LA_MAX) { state.la = core.LA_MAX; state.running = false; updateControls(); }
    }
    render(state.la, dt);
    updatePanel(state.la, frameNo);
    if (frameNo % 6 === 0) updatePeriodicTable(state.la, false);
    if (glOK && frameNo % 20 === 0) setText("hudPerf", Math.round(dyn.fps) + " fps · 해상도 " + Math.round(dyn.scale * 100) + "% · 정밀 은하 " + pool.filter(function (s) { return s.gal >= 0; }).length + "개");
  }
  requestAnimationFrame(frame);
})();
