// 실시간 우주 자료 수집기. GitHub Actions가 몇 시간마다 실행해 사이트와 함께 배포한다 (외부 패키지 없이 Node 20+).
//   node scripts/live/fetch.mjs public/data/live.json
// 원천: NOAA SWPC(태양 활동), NASA JPL(근접 소행성 CAD, 충돌 위험 Sentry, Horizons 행성 위치), NASA Exoplanet Archive,
// CelesTrak(인공위성 궤도 요소), arXiv + Crossref(새 논문과 게재 여부).
// 한 원천이 실패해도 나머지는 그대로 쓰고, 실패한 원천은 sources[].ok = false로 남긴다. 이 스크립트는 빌드를 멈추지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { PARAMS, parseAtom, verify } from "./lib.mjs";

const OUT = process.argv[2] ?? "public/data/live.json";
const UA = "cosmos-lab-live/1.0 (+https://github.com/suhun2010329-ctrl/cosmos-lab)";
const now = new Date();
const sources = [];

async function get(name, url, kind = "json") {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: kind === "json" ? "application/json" : "*/*" }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const body = kind === "json" ? await r.json() : await r.text();
    sources.push({ name, url, ok: true, ms: Date.now() - t0 });
    return body;
  } catch (e) {
    sources.push({ name, url, ok: false, error: String(e && e.message || e) });
    return null;
  }
}
const iso = (d) => d.toISOString().slice(0, 10);

// ---------- 태양 활동 (NOAA SWPC) ----------
async function solar() {
  const [obs, pred, kp, flares] = await Promise.all([
    get("NOAA SWPC 태양 주기 관측", "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json"),
    get("NOAA SWPC 태양 주기 예측", "https://services.swpc.noaa.gov/json/solar-cycle/predicted-solar-cycle.json"),
    get("NOAA SWPC Kp 지수", "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
    get("NOAA SWPC X선 플레어", "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json"),
  ]);
  const out = {};
  if (Array.isArray(obs)) out.monthly = obs.filter((r) => r["time-tag"] >= "2008-01").map((r) => [r["time-tag"], r.ssn, r["smoothed_ssn"], r["f10.7"]]);
  if (Array.isArray(pred)) out.predicted = pred.slice(0, 120).map((r) => [r["time-tag"], r.predicted_ssn, r["predicted_f10.7"]]);
  if (Array.isArray(kp) && kp.length > 1) { const last = kp[kp.length - 1]; out.kp = { time: last[0], value: +last[1] }; out.kpRecent = kp.slice(-24).map((r) => [r[0], +r[1]]); }
  if (Array.isArray(flares)) out.flares = flares.slice(-12).map((f) => ({ peak: f.max_time ?? f.time_tag, cls: f.max_class ?? f.current_class })).filter((f) => f.cls);
  return out;
}

// ---------- 근접 소행성 (JPL CAD) · 충돌 위험 (JPL Sentry) ----------
async function neo() {
  const cad = await get("JPL 근접 접근 (CAD)", "https://ssd-api.jpl.nasa.gov/cad.api?dist-max=0.05&date-min=now&date-max=%2B366&sort=date&fullname=true&diameter=true");
  const sentry = await get("JPL 충돌 위험 (Sentry)", "https://ssd-api.jpl.nasa.gov/sentry.api");
  const out = {};
  if (cad && cad.data) {
    const f = cad.fields;
    out.approaches = cad.data.map((row) => Object.fromEntries(f.map((k, i) => [k, row[i]]))).map((r) => ({
      name: (r.fullname || r.des).trim(), date: r.cd, distAU: +r.dist, distMinAU: +r.dist_min, vRel: +r.v_rel, H: r.h === null ? null : +r.h, diameter: r.diameter ? +r.diameter : null,
    }));
  }
  if (sentry && sentry.data) {
    out.risks = sentry.data.map((r) => ({ des: r.des, name: r.fullname, ip: +r.ip, ps: +r.ps_cum, ts: +r.ts_max, range: r.range, n: +r.n_imp, diameter: +r.diameter, H: +r.h, v: +r.v_inf, lastObs: r.last_obs }))
      .sort((a, b) => b.ps - a.ps).slice(0, 40);
  }
  return out;
}

// ---------- 외계행성 (NASA Exoplanet Archive) ----------
async function exoplanets() {
  const q = (s) => "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?format=json&query=" + encodeURIComponent(s);
  const cnt = await get("NASA 외계행성 수", q("select count(*) as n from pscomppars"));
  const since = new Date(now.getTime() - 120 * 864e5);
  const cols = "pl_name,hostname,ra,dec,sy_dist,pl_orbper,pl_orbsmax,pl_orbeccen,pl_rade,pl_bmassj,pl_radj,pl_eqt,disc_year,discoverymethod,st_teff,st_rad,st_mass,st_met,st_spectype,sy_vmag,releasedate";
  // 1) 기본 행성 표(ps, default_flag = 1)에서 최근 120일 등록 2) 날짜 비교가 안 되면 올해·작년 발견분에서 날짜로 거름
  let recent = await get("NASA 최근 등록 외계행성", q("select top 400 " + cols + " from ps where default_flag = 1 and releasedate >= '" + iso(since) + "' order by releasedate desc"));
  if (!Array.isArray(recent)) {
    const r2 = await get("NASA 최근 발견 외계행성 (대체 질의)", q("select " + cols + " from ps where default_flag = 1 and disc_year >= " + (now.getUTCFullYear() - 1)));
    if (Array.isArray(r2)) recent = r2.filter((r) => String(r.releasedate ?? "") >= iso(since)).sort((x, y) => String(y.releasedate).localeCompare(String(x.releasedate))).slice(0, 400);
  }
  const out = {};
  if (Array.isArray(cnt) && cnt[0]) out.count = +cnt[0].n;
  if (Array.isArray(recent)) out.recent = recent.filter((r) => r.ra != null && r.dec != null && r.sy_dist != null);
  return out;
}

// ---------- 인공위성 (CelesTrak GP) ----------
async function satellites() {
  const list = [["국제우주정거장 (ISS)", 25544], ["허블 우주 망원경", 20580], ["톈궁 (중국 우주정거장)", 48274]];
  const out = [];
  for (const [name, id] of list) {
    const r = await get("CelesTrak " + id, "https://celestrak.org/NORAD/elements/gp.php?CATNR=" + id + "&FORMAT=json");
    if (Array.isArray(r) && r[0]) {
      const g = r[0];
      out.push({ name, id, epoch: g.EPOCH, n: +g.MEAN_MOTION, e: +g.ECCENTRICITY, i: +g.INCLINATION, raan: +g.RA_OF_ASC_NODE, argp: +g.ARG_OF_PERICENTER, M: +g.MEAN_ANOMALY, bstar: +g.BSTAR });
    }
  }
  return out;
}

// ---------- 행성 위치 (JPL Horizons): 사이트의 케플러 모형을 검증하는 기준 ----------
async function horizons() {
  const ids = { 수성: 199, 금성: 299, 지구: 399, 화성: 499, 목성: 599, 토성: 699, 천왕성: 799, 해왕성: 899 };
  const t = iso(now), t1 = iso(new Date(now.getTime() + 864e5));
  const out = { epoch: t + "T00:00:00Z", pos: {} };
  for (const [ko, id] of Object.entries(ids)) {
    const url = "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&MAKE_EPHEM=YES&EPHEM_TYPE=VECTORS&CENTER='500@10'&REF_PLANE=ECLIPTIC&REF_SYSTEM=J2000&OUT_UNITS=AU-D&VEC_TABLE=1&CSV_FORMAT=YES"
      + "&COMMAND='" + id + "'&START_TIME='" + t + "'&STOP_TIME='" + t1 + "'&STEP_SIZE='1 d'";
    const r = await get("JPL Horizons " + ko, url);
    const txt = r && r.result;
    const m = txt && txt.match(/\$\$SOE\s*([\s\S]*?)\$\$EOE/);
    if (m) {
      const first = m[1].trim().split("\n")[0].split(",").map((s) => s.trim());
      // JDTDB, 날짜, X, Y, Z
      out.pos[ko] = [+first[2], +first[3], +first[4]];
      out.jd = +first[0];
    }
  }
  return out;
}

// ---------- 새 논문 (arXiv) → 값 뽑기 → 규칙 검증 ----------
async function crossrefPublished(title) {
  const r = await get("Crossref 게재 확인", "https://api.crossref.org/works?rows=3&select=DOI,title,container-title,type,published&query.bibliographic=" + encodeURIComponent(title));
  const items = r && r.message && r.message.items || [];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const it of items) {
    if (it.type !== "journal-article" || !it.title) continue;
    const a = norm(it.title[0]), b = norm(title);
    if (a === b || (a.length > 30 && (a.includes(b) || b.includes(a)))) return { doi: it.DOI, journal: (it["container-title"] || [""])[0] };
  }
  return null;
}
async function papers(curated) {
  const out = { checked: [], accepted: [], pending: [] };
  for (const [key, P] of Object.entries(PARAMS)) {
    const xml = await get("arXiv " + key, "https://export.arxiv.org/api/query?search_query=" + encodeURIComponent(P.query) + "&sortBy=submittedDate&sortOrder=descending&max_results=40", "text");
    if (!xml) continue;
    // 기준값: 이미 검증된(curated) 측정의 역분산 가중 평균
    const ref = curated.filter((m) => m.param === key && m.status === "accepted");
    const w = ref.reduce((s, m) => s + 1 / m.sigma ** 2, 0), mean = ref.reduce((s, m) => s + m.value / m.sigma ** 2, 0) / (w || 1), sMean = 1 / Math.sqrt(w || 1);
    for (const e of parseAtom(xml)) {
      const m = e.summary && e.summary.match(P.re);
      if (!m) continue;
      out.checked.push(e.id);
      if (curated.some((c) => c.arxiv && e.id && e.id.startsWith(c.arxiv))) continue;
      let pub = e.journal || e.doi ? { journal: e.journal, doi: e.doi } : null;
      if (!pub && e.title) pub = await crossrefPublished(e.title);
      const rec = verify(key, +m[1], +m[2], { mean, sigma: sMean, n: ref.length }, pub, e);
      (rec.status === "pending" ? out.pending : out.accepted).push(rec);
    }
  }
  return out;
}

// ---------- 실행 ----------
const curatedPath = new URL("../../public/data/literature.json", import.meta.url);
let curated = [];
try { curated = JSON.parse(readFileSync(curatedPath, "utf-8")).measurements ?? []; } catch { /* 없음 */ }
const [sol, ne, ex, sat, hz] = await Promise.all([solar(), neo(), exoplanets(), satellites(), horizons()]);
const pap = await papers(curated);
const live = { generated: now.toISOString(), solar: sol, neo: ne, exoplanets: ex, satellites: sat, horizons: hz, papers: pap, sources };
writeFileSync(OUT, JSON.stringify(live));
const ok = sources.filter((s) => s.ok).length;
console.log("live.json: " + ok + "/" + sources.length + " 원천 성공 → " + OUT);
for (const s of sources) if (!s.ok) console.log("  실패: " + s.name + " — " + s.error);
// 받은 자료 요약 (Actions 기록에서 확인용)
const m = sol.monthly ?? [];
console.log("  태양: 월별 " + m.length + "개, 마지막 " + JSON.stringify(m[m.length - 1]) + ", Kp " + JSON.stringify(sol.kp) + ", 플레어 " + (sol.flares?.length ?? 0) + "개, 예측 " + (sol.predicted?.length ?? 0) + "개");
console.log("  소행성: 근접 " + (ne.approaches?.length ?? 0) + "개 " + JSON.stringify((ne.approaches ?? [])[0] ?? null) + ", 위험 " + (ne.risks?.length ?? 0) + "개 " + JSON.stringify((ne.risks ?? [])[0] ?? null));
console.log("  외계행성: " + ex.count + "개, 최근 " + (ex.recent?.length ?? 0) + "개 " + JSON.stringify((ex.recent ?? [])[0] ?? null));
console.log("  위성: " + sat.map((x) => x.name + " n=" + x.n + " i=" + x.i + " epoch=" + x.epoch).join(" | "));
console.log("  Horizons: jd " + hz.jd + " " + Object.entries(hz.pos).map(([k, v]) => k + "=" + v.map((x) => x.toFixed(4)).join(",")).join(" "));
console.log("  논문: 확인 " + pap.checked.length + "편, 반영 " + pap.accepted.map((x) => x.value + "±" + x.sigma + " " + x.arxiv + " " + x.journal).join("; ") + " | 보류 " + pap.pending.map((x) => x.value + "±" + x.sigma + " " + x.arxiv + " [" + x.reasons.join("/") + "]").join("; "));
