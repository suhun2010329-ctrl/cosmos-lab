// 지도를 열 때 한 번 계산해 두는 예측: 행성 궤도의 영년 변화, 국부 은하군 몬테카를로, 별의 근접 통과,
// 태양·지구·달의 이정표, 그리고 과거~먼 미래의 사건 목록.
import type { AtlasData } from "./data";
import { buildSecular, type Secular } from "./secular";
import { forecastLocalGroup, type LGForecast } from "./localgroup";
import { closeEncounters, nearestAt, STRIDE, type Encounter } from "./stellar";
import { dayLength, earthAt, eclipseEndYears, solarSystemEvents, type TimedEvent } from "./sun";
import { FAR_FUTURE } from "./bodies";
import { Timeline, YEAR_S } from "./time";

export interface Forecasts {
  secular: Secular;
  lg: LGForecast;
  encounters: Encounter[];
  nearbyIdx: number[];
  eclipseEnd: number;
  events: TimedEvent[];
  buf: Float32Array;
}

function solve(f: (x: number) => boolean, lo: number, hi: number): number {
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m)) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

/** 무거운 계산 (지도를 열 때 한 번): 영년 섭동, 국부 은하군 몬테카를로, 근접 통과 */
export function buildForecasts(data: AtlasData, starName: (i: number) => string, TL: Timeline): Forecasts {
  const secular = buildSecular();
  const lg = forecastLocalGroup(200);
  const buf = data.stars.buf, n = data.stars.n;
  const encounters = closeEncounters(buf, n, 2.5, 1e7);
  const nearbyIdx: number[] = [];
  for (let i = 0; i < n; i++) if (buf[STRIDE * i + 8] >= 16 && Math.hypot(buf[STRIDE * i], buf[STRIDE * i + 1], buf[STRIDE * i + 2]) < 25) nearbyIdx.push(i);
  const f: Forecasts = { secular, lg, encounters, nearbyIdx, eclipseEnd: eclipseEndYears(), events: [], buf };
  f.events = buildEvents(f, starName, TL);
  return f;
}

/** 사건 목록 (가벼움): 우주 시나리오를 바꾸면 이것만 다시 만든다 */
export function buildEvents(f: Forecasts, starName: (i: number) => string, TL: Timeline): TimedEvent[] {
  const { lg, encounters, nearbyIdx, eclipseEnd, buf } = f;
  const ev: TimedEvent[] = [...solarSystemEvents()];
  const ly = (pc: number) => (pc / 0.306601).toFixed(pc < 0.3 ? 2 : 1) + "광년";

  // 가장 가까운 별이 바뀌는 순간 (지금부터 10만 년)
  let prev = nearestAt(buf, nearbyIdx, 0).i;
  for (let y = 500; y <= 1e5; y += 500) {
    const nb = nearestAt(buf, nearbyIdx, y);
    if (nb.i !== prev && nb.i >= 0) {
      ev.push({ years: y, label: "가장 가까운 별이 바뀜: " + starName(nb.i), detail: "그때 거리 " + ly(nb.d) + ". 고유 운동과 시선 속도로 계산한 직선 운동 예측입니다.", scale: "star" });
      prev = nb.i;
    }
  }
  for (const e of encounters.slice(0, 6)) {
    ev.push({ years: e.tMin, label: "근접 통과: " + starName(e.i) + " (태양에서 " + ly(e.dMin) + ")", detail: "상대 속도 " + e.vRel.toFixed(0) + " km/s. " + (starName(e.i).includes("710") ? "HYG(히파르코스) 고유 운동 기준입니다. Gaia DR3로 다시 재면 약 128만 년 뒤 0.05 pc까지 와서 오르트 구름을 통과합니다 (Bailer-Jones 2022). " : "") + (e.dMin < 0.3 ? "오르트 구름(약 0.3 pc 안)을 지나가 혜성들의 궤도를 흔들 수 있습니다." : "HYG 목록의 위치·속도로 계산한 직선 운동 예측입니다."), scale: "star" });
  }
  ev.push({ years: 1e5, label: "베텔게우스 초신성 (10만 년 안 언제든)", detail: "적색 초거성 베텔게우스는 핵의 헬륨을 태우는 중이라 대략 10만 년 안에 폭발할 것으로 봅니다 (Joyce 외 2020). 정확한 날짜는 예측할 수 없습니다.", scale: "star" });

  // 태양과 지구
  const S = (y: number) => earthAt(y / 1e9).S;
  const s106 = solve((y) => S(y) > 1.06, 0, 5e9), s110 = solve((y) => S(y) > 1.1, 0, 5e9), s140 = solve((y) => S(y) > 1.4, 0, 6e9);
  ev.push(
    { years: s106, label: "지구가 복잡한 생명이 살기 어려울 만큼 더워짐", detail: "태양이 6% 밝아져 광합성에 필요한 이산화탄소가 줄고 기온이 오릅니다.", scale: "earth" },
    { years: s110, label: "지구의 바다가 증발하기 시작 (습윤 온실)", detail: "받는 햇빛이 지금보다 10% 많아지면 수증기가 성층권까지 올라가 우주로 빠져나갑니다 (Kasting 1988).", scale: "earth" },
    { years: s140, label: "지구가 금성처럼 됨 (폭주 온실)", detail: "바다가 모두 사라지고 표면이 수백 °C가 됩니다.", scale: "earth" },
    { years: 5.4e9, label: "태양이 주계열을 떠남", detail: "중심의 수소가 바닥나 준거성이 되어 부풀기 시작합니다.", scale: "solar" },
    { years: 7.585e9, label: "태양이 적색거성의 정점에 이름", detail: "반지름 256배(1.2 AU), 광도 2,730배. 수성과 금성을 삼키고, 지구도 조석 끌림으로 삼켜질 가능성이 큽니다 (Schröder & Smith 2008).", scale: "solar" },
    { years: 7.7e9, label: "태양이 헬륨을 태움", detail: "헬륨 섬광 뒤 반지름 10배의 수평 가지 별이 됩니다.", scale: "solar" },
    { years: 7.735e9, label: "태양이 행성상 성운을 남김", detail: "바깥층을 날려 보내 수만 년 동안 빛나는 성운을 만듭니다.", scale: "solar" },
    { years: 7.74e9, label: "태양이 백색왜성이 됨", detail: "지구만 한 크기에 0.54 M☉. 이후 수천억 년 동안 천천히 식습니다.", scale: "solar" },
    { years: eclipseEnd, label: "지구에서 개기일식이 끝남", detail: "달이 멀어지고 태양이 커져서 달이 태양을 다 가리지 못합니다.", scale: "moon" },
    { years: solve((y) => dayLength(y) > 25, 0, 3e9), label: "하루가 25시간이 됨", detail: "조석 마찰로 지구 자전이 느려지고 그 각운동량이 달 궤도로 옮겨 갑니다.", scale: "moon" },
  );

  // 국부 은하군 (최선 추정 궤도 + 몬테카를로)
  const b = lg.best;
  if (b.mergeLMC !== null) ev.push({ years: b.mergeLMC * 1e9, label: "대마젤란은하가 우리 은하와 합쳐짐", detail: "역학적 마찰로 궤도가 줄어 들어옵니다. 몬테카를로 중앙값 " + (lg.lmcMedian ?? 0).toFixed(1) + " Gyr (Cautun 외 2019: 약 25억 년).", scale: "galaxy" });
  if (b.mergeM31 !== null) ev.push({ years: b.mergeM31 * 1e9, label: "우리 은하와 안드로메다가 합쳐져 ‘밀코메다’가 됨", detail: "최선 추정값의 궤도. " + lg.runs + "번 몬테카를로에서 100억 년 안 병합 확률 " + Math.round(lg.pMerge10 * 100) + "% (Sawala 외 2025: 약 50%).", scale: "galaxy" });

  // 우주 규모 (시나리오 사건, 그리고 ΛCDM이면 먼 미래 연표)
  const fate = TL.current;
  for (const e of fate.events) if (e.t > TL.t0) ev.push({ years: (e.t - TL.t0) / YEAR_S, label: e.label, detail: e.detail, scale: "cosmic" });
  if (fate.end === "forever") for (const e of FAR_FUTURE) ev.push({ years: e.years, label: e.label, detail: e.detail, scale: "cosmic" });

  // 과거
  for (const e of TL.eras) {
    const dt = (TL.core.tOf(e.la) - TL.t0) / YEAR_S;
    if (dt < 0) ev.push({ years: dt, label: e.name, detail: e.text, scale: "cosmic" });
  }
  ev.push(
    { years: -4.567e9, label: "태양과 원시 행성계 원반 탄생", detail: "운석 속 가장 오래된 광물(CAI)의 나이.", scale: "solar" },
    { years: -4.51e9, label: "달 탄생 (거대 충돌)", detail: "화성만 한 천체 테이아가 원시 지구와 부딪쳐 생긴 파편이 모였다고 봅니다.", scale: "moon" },
    { years: -3.7e9, label: "지구 생명의 흔적", detail: "그린란드 암석의 스트로마톨라이트형 구조 (논쟁 중), 확실한 화석은 약 35억 년 전.", scale: "earth" },
    { years: -2.4e9, label: "대산화 사건", detail: "광합성 미생물이 대기에 산소를 쌓기 시작합니다.", scale: "earth" },
    { years: -5.38e8, label: "캄브리아기 대폭발", detail: "복잡한 동물이 짧은 기간에 다양해집니다.", scale: "earth" },
    { years: -6.6e7, label: "공룡 대멸종", detail: "칙술루브 소행성 충돌.", scale: "earth" },
    { years: -3.0e5, label: "현생 인류 등장", detail: "모로코 제벨 이르후드 화석.", scale: "earth" },
  );
  ev.sort((x, y) => x.years - y.years);
  return ev;
}
