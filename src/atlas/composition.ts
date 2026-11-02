// 천체를 실제 원소로 구성: 층 구조(핵·맨틀·지각·바다·얼음·기체 외피)와 층마다 원소 질량 비율.
// 값은 문헌의 대표값이다. 지구 핵·맨틀 McDonough & Sun (1995), McDonough (2003) · 대륙 지각 Rudnick & Gao (2003) ·
// 달 Wieczorek 외 (2006), Weber 외 (2011) · 화성 핵 Stähler 외 (2021, InSight) · 수성 Hauck 외 (2013) ·
// 목성 Galileo 탐사선 (von Zahn 외 1998), Juno 희석 핵 (Wahl 외 2017) · 태양 Asplund 외 (2021) ·
// CI 탄소질 콘드라이트 Lodders (2021) · 얼음 위성 Schubert 외 (2004).

export type El = "H" | "He" | "C" | "N" | "O" | "Ne" | "Na" | "Mg" | "Al" | "Si" | "S" | "Cl" | "K" | "Ca" | "Ti" | "Cr" | "Fe" | "Ni";

export const ELEMENTS: Record<El, { ko: string; Z: number; color: [number, number, number] }> = {
  // 색은 분자 그림에서 흔히 쓰는 원소 색(Jmol)
  H: { ko: "수소", Z: 1, color: [0.93, 0.93, 0.97] },
  He: { ko: "헬륨", Z: 2, color: [0.85, 1.0, 1.0] },
  C: { ko: "탄소", Z: 6, color: [0.45, 0.45, 0.45] },
  N: { ko: "질소", Z: 7, color: [0.19, 0.31, 0.97] },
  O: { ko: "산소", Z: 8, color: [1.0, 0.13, 0.13] },
  Ne: { ko: "네온", Z: 10, color: [0.7, 0.89, 0.96] },
  Na: { ko: "나트륨", Z: 11, color: [0.67, 0.36, 0.95] },
  Mg: { ko: "마그네슘", Z: 12, color: [0.54, 1.0, 0.0] },
  Al: { ko: "알루미늄", Z: 13, color: [0.75, 0.65, 0.65] },
  Si: { ko: "규소", Z: 14, color: [0.94, 0.78, 0.63] },
  S: { ko: "황", Z: 16, color: [1.0, 1.0, 0.19] },
  Cl: { ko: "염소", Z: 17, color: [0.12, 0.94, 0.12] },
  K: { ko: "칼륨", Z: 19, color: [0.56, 0.25, 0.83] },
  Ca: { ko: "칼슘", Z: 20, color: [0.24, 1.0, 0.0] },
  Ti: { ko: "타이타늄", Z: 22, color: [0.75, 0.76, 0.78] },
  Cr: { ko: "크로뮴", Z: 24, color: [0.54, 0.6, 0.78] },
  Fe: { ko: "철", Z: 26, color: [0.88, 0.4, 0.2] },
  Ni: { ko: "니켈", Z: 28, color: [0.31, 0.82, 0.31] },
};

type Mix = Partial<Record<El, number>>;

/** 질량 비율을 합이 1이 되게 */
function norm(m: Mix): Mix {
  const s = Object.values(m).reduce((a, b) => a + (b ?? 0), 0);
  const o: Mix = {};
  for (const [k, v] of Object.entries(m)) o[k as El] = (v ?? 0) / s;
  return o;
}
const blend = (parts: [Mix, number][]): Mix => {
  const o: Mix = {};
  for (const [m, w] of parts) for (const [k, v] of Object.entries(m)) o[k as El] = (o[k as El] ?? 0) + (v ?? 0) * w;
  return norm(o);
};

// ---- 물질 (원소 질량 비율) ----
const BASE = {
  /** 지구 핵 (McDonough 2003): 철–니켈 합금 + 가벼운 원소 */
  earthCore: norm({ Fe: 85.5, Ni: 5.2, Si: 6.0, S: 1.9, Cr: 0.9, O: 0.5 }),
  /** 파이롤라이트 맨틀 (McDonough & Sun 1995) */
  pyrolite: norm({ O: 44.0, Mg: 22.8, Si: 21.0, Fe: 6.26, Ca: 2.53, Al: 2.35, Na: 0.27, Cr: 0.26, Ni: 0.2 }),
  /** 상부 대륙 지각 (Rudnick & Gao 2003) */
  contCrust: norm({ O: 47.0, Si: 31.1, Al: 8.15, Fe: 3.92, Ca: 2.57, Na: 2.43, K: 2.32, Mg: 1.5, Ti: 0.38 }),
  /** 현무암 (해양 지각, 금성·화성 표면) */
  basalt: norm({ O: 44.5, Si: 23.5, Al: 8.0, Fe: 8.7, Ca: 7.5, Mg: 4.5, Na: 2.0, Ti: 1.2 }),
  /** 바닷물 */
  seawater: norm({ O: 85.7, H: 10.8, Cl: 1.94, Na: 1.08, Mg: 0.13, S: 0.09 }),
  /** 달 고지대 회장암 */
  anorthosite: norm({ O: 44.5, Si: 21.0, Al: 13.3, Ca: 10.7, Fe: 4.7, Mg: 4.6, Na: 0.3, Ti: 0.3 }),
  /** 철이 많은 맨틀 (화성: FeO 약 18%) */
  marsMantle: norm({ O: 42.5, Si: 20.5, Mg: 18.5, Fe: 14.0, Ca: 1.7, Al: 1.6, Na: 0.4, Cr: 0.3 }),
  /** 화성 핵: 황이 많은 철 (InSight: 가벼운 원소 약 20%) */
  marsCore: norm({ Fe: 74, Ni: 7, S: 14, O: 4, H: 1 }),
  /** 수성 핵: 규소가 섞인 철 */
  mercuryCore: norm({ Fe: 80, Ni: 7, Si: 10, S: 3 }),
  /** 수성 맨틀: 철이 거의 없고 황이 많은 규산염 (MESSENGER) */
  mercuryMantle: norm({ O: 43, Si: 25, Mg: 21, Ca: 4, Al: 4, S: 2.5, Fe: 0.5 }),
  /** 달 핵 (황이 섞인 철) */
  lunarCore: norm({ Fe: 85, Ni: 6, S: 9 }),
  /** 이오 맨틀: 황이 많은 규산염 */
  ioMantle: norm({ O: 42, Si: 20, Mg: 19, Fe: 11, S: 5, Ca: 1.5, Al: 1.5 }),
  /** 철–황화철 핵 (갈릴레이 위성) */
  feFeS: norm({ Fe: 70, S: 22, Ni: 8 }),
  /** H 콘드라이트 (보통 콘드라이트, S형 소행성) */
  chondrite: norm({ O: 35.7, Fe: 27.5, Si: 16.9, Mg: 14.0, S: 2.0, Ni: 1.6, Ca: 1.25, Al: 1.13, Na: 0.64 }),
  /** CI 탄소질 콘드라이트 (Lodders 2021) */
  carbonaceous: norm({ O: 46, Fe: 18.5, Si: 10.7, Mg: 9.6, S: 5.4, C: 3.5, H: 2.0, Ni: 1.1, Ca: 0.92, Al: 0.85, Na: 0.5, N: 0.3 }),
  /** 물 얼음 */
  ice: norm({ O: 88.8, H: 11.2 }),
  /** 질소·메탄 얼음 (명왕성·트리톤 표면) */
  n2ice: norm({ N: 96, C: 3, H: 1 }),
  /** 얼음 거대행성 맨틀: 물 65% + 메탄 20% + 암모니아 15% */
  ices: norm({ O: 57.7, C: 15.0, N: 12.3, H: 15.0 }),
  /** 태양 구성 (Asplund 외 2021): X = 0.744, Y = 0.242, Z = 0.014 */
  solar: norm({ H: 74.38, He: 24.23, O: 0.6, C: 0.25, Ne: 0.13, Fe: 0.13, N: 0.07, Si: 0.07, Mg: 0.07, S: 0.03 }),
  /** 태양 핵 평균 (표준 태양 모형: 중심 34% → 핵 가장자리 약 70%, 반지름 0.25 R☉ 안 평균 약 55%) */
  solarCore: norm({ H: 55, He: 43.5, O: 0.7, C: 0.1, N: 0.3, Ne: 0.2, Fe: 0.2 }),
  /** 목성 외피 (갈릴레오 탐사선: Y = 0.234, 무거운 원소 태양의 약 3배) */
  jupiterEnv: norm({ H: 73.5, He: 23.5, O: 1.5, C: 0.7, N: 0.3, S: 0.2, Ne: 0.3 }),
  /** 토성 외피 (헬륨이 비로 가라앉아 적음) */
  saturnEnv: norm({ H: 77, He: 18, C: 2, O: 2, N: 0.5, S: 0.5 }),
  /** 천왕성·해왕성 외피 */
  iceGiantEnv: norm({ H: 67, He: 25, C: 6, N: 1, O: 1 }),
  /** 철 운석 (M형 소행성) */
  iron: norm({ Fe: 91, Ni: 8.5, S: 0.5 }),
} satisfies Record<string, Mix>;
export const MAT = {
  ...BASE,
  /** 목성·토성의 희석 핵: 수소·헬륨에 바위·얼음이 녹아 섞임 */
  diluteCore: blend([[BASE.jupiterEnv, 0.55], [BASE.chondrite, 0.25], [BASE.ice, 0.2]]),
  /** 바위와 얼음 혼합 (덜 분화된 얼음 천체) */
  rockIce: blend([[BASE.carbonaceous, 0.55], [BASE.ice, 0.45]]),
  /** 혜성 핵 */
  cometNucleus: blend([[BASE.carbonaceous, 0.5], [BASE.ice, 0.4], [BASE.n2ice, 0.1]]),
};
const M = MAT;

export type Phase = "metal" | "rock" | "crust" | "water" | "ice" | "gas" | "plasma";
export interface Layer {
  name: string;
  /** 바깥 경계 (반지름 비) */
  r: number;
  /** 대표 밀도 [kg/m³] */
  rho: number;
  el: Mix;
  phase: Phase;
  /** 보기 색 (물질) */
  color: [number, number, number];
  /** 비열 [J/kg/K] */
  cv: number;
}
export interface Composition { layers: Layer[]; note: string; src: string }

const L = (name: string, r: number, rho: number, el: Mix, phase: Phase, color: [number, number, number]): Layer =>
  ({ name, r, rho, el, phase, color, cv: phase === "metal" ? 450 : phase === "gas" ? 12000 : phase === "plasma" ? 20000 : phase === "ice" ? 2000 : phase === "water" ? 4180 : 1000 });

const C_IRON: [number, number, number] = [0.62, 0.36, 0.22], C_IRON2: [number, number, number] = [0.78, 0.5, 0.26];
const C_MANTLE: [number, number, number] = [0.55, 0.3, 0.2], C_ROCK: [number, number, number] = [0.5, 0.45, 0.4];
const C_CRUST: [number, number, number] = [0.62, 0.55, 0.42], C_OCEAN: [number, number, number] = [0.15, 0.35, 0.75];
const C_ICE: [number, number, number] = [0.85, 0.92, 1.0];

/** 태양계 천체의 층 구조 */
export const BODY_COMP: Record<string, Composition> = {
  지구: { layers: [L("내핵", 0.192, 12900, M.earthCore, "metal", C_IRON2), L("외핵 (액체)", 0.546, 10900, M.earthCore, "metal", C_IRON), L("맨틀", 0.99, 4400, M.pyrolite, "rock", C_MANTLE), L("지각·바다", 1, 2900, blend([[M.contCrust, 0.6], [M.basalt, 0.3], [M.seawater, 0.1]]), "crust", C_CRUST)], note: "핵은 질량의 32%, 반지름의 55%. 바다는 질량의 0.02%뿐이라 표면 픽셀에 섞어 넣음.", src: "McDonough & Sun 1995; McDonough 2003; Rudnick & Gao 2003" },
  달: { layers: [L("핵", 0.19, 7000, M.lunarCore, "metal", C_IRON), L("맨틀", 0.975, 3350, M.pyrolite, "rock", C_MANTLE), L("고지대 지각 (회장암)", 1, 2900, M.anorthosite, "crust", [0.72, 0.72, 0.7])], note: "핵 반지름 약 330 km, 질량의 1–2%뿐. 지구 맨틀과 비슷한 구성 (거대 충돌의 흔적).", src: "Weber 외 2011; Wieczorek 외 2006" },
  수성: { layers: [L("핵 (철–규소)", 0.83, 7300, M.mercuryCore, "metal", C_IRON), L("맨틀·지각", 1, 3300, M.mercuryMantle, "rock", [0.55, 0.53, 0.5])], note: "철 핵이 반지름의 83%. 거대 충돌로 맨틀이 벗겨졌다는 설명이 있음.", src: "Hauck 외 2013 (MESSENGER)" },
  금성: { layers: [L("핵", 0.5, 10500, M.earthCore, "metal", C_IRON), L("맨틀", 0.99, 4400, M.pyrolite, "rock", C_MANTLE), L("현무암 지각", 1, 2900, M.basalt, "crust", [0.6, 0.5, 0.36])], note: "구성은 지구와 거의 같다고 봄.", src: "지구 모형을 크기에 맞춤" },
  화성: { layers: [L("핵 (황이 많은 철)", 0.54, 6000, M.marsCore, "metal", C_IRON), L("맨틀", 0.985, 3500, M.marsMantle, "rock", [0.5, 0.28, 0.18]), L("현무암 지각", 1, 2900, M.basalt, "crust", [0.72, 0.38, 0.22])], note: "InSight 지진계: 핵 반지름 1,830 km, 생각보다 크고 가벼움.", src: "Stähler 외 2021" },
  테이아: { layers: [L("핵", 0.5, 7500, M.earthCore, "metal", C_IRON), L("맨틀", 1, 3600, M.marsMantle, "rock", [0.45, 0.4, 0.55])], note: "가상의 화성 크기 원시 행성. 화성처럼 분화되었다고 가정.", src: "Canup & Asphaug 2001" },
  목성: { layers: [L("희석 핵", 0.3, 4500, M.diluteCore, "gas", [0.55, 0.45, 0.35]), L("금속 수소", 0.8, 1900, M.jupiterEnv, "gas", [0.72, 0.62, 0.5]), L("분자 수소 외피", 1, 400, M.jupiterEnv, "gas", [0.85, 0.75, 0.6])], note: "주노: 핵이 뚜렷하지 않고 반지름의 절반 가까이 퍼진 ‘희석 핵’.", src: "von Zahn 외 1998; Wahl 외 2017" },
  토성: { layers: [L("희석 핵", 0.25, 6000, M.diluteCore, "gas", [0.6, 0.5, 0.4]), L("금속 수소", 0.55, 1500, M.saturnEnv, "gas", [0.8, 0.72, 0.55]), L("분자 수소 외피", 1, 300, M.saturnEnv, "gas", [0.9, 0.82, 0.62])], note: "헬륨이 안쪽으로 비처럼 가라앉아 대기에는 헬륨이 적음.", src: "Mankovich & Fuller 2021" },
  천왕성: { layers: [L("암석 핵", 0.25, 8000, M.chondrite, "rock", C_ROCK), L("얼음 맨틀 (물·암모니아·메탄)", 0.75, 2500, M.ices, "water", [0.35, 0.65, 0.75]), L("수소·헬륨 외피", 1, 500, M.iceGiantEnv, "gas", [0.6, 0.85, 0.9])], note: "‘얼음’은 실제로는 뜨겁고 압축된 유체.", src: "Helled 외 2020" },
  해왕성: { layers: [L("암석 핵", 0.25, 8000, M.chondrite, "rock", C_ROCK), L("얼음 맨틀 (물·암모니아·메탄)", 0.75, 2700, M.ices, "water", [0.25, 0.45, 0.85]), L("수소·헬륨 외피", 1, 600, M.iceGiantEnv, "gas", [0.35, 0.55, 0.95])], note: "천왕성보다 조금 무겁고 밀도가 높음.", src: "Helled 외 2020" },
  케레스: { layers: [L("함수 규산염 핵", 0.6, 2400, M.carbonaceous, "rock", C_ROCK), L("얼음·진흙 지각", 1, 1300, M.rockIce, "ice", [0.6, 0.6, 0.58])], note: "물 얼음과 탄산염이 섞인 지각 (돈 탐사선).", src: "Park 외 2016" },
  명왕성: { layers: [L("암석 핵", 0.72, 2900, M.carbonaceous, "rock", C_ROCK), L("물 얼음 맨틀", 0.985, 950, M.ice, "ice", C_ICE), L("질소·메탄 얼음", 1, 1000, M.n2ice, "ice", [0.92, 0.8, 0.7])], note: "얼음 아래 바다가 있을 가능성.", src: "Nimmo 외 2016" },
  이오: { layers: [L("철–황화철 핵", 0.52, 6000, M.feFeS, "metal", C_IRON), L("규산염 맨틀", 1, 3300, M.ioMantle, "rock", [0.85, 0.75, 0.3])], note: "황 화산이 표면을 계속 덮음.", src: "Schubert 외 2004" },
  유로파: { layers: [L("철 핵", 0.4, 6000, M.feFeS, "metal", C_IRON), L("규산염 맨틀", 0.91, 3300, M.pyrolite, "rock", C_MANTLE), L("바다", 0.985, 1000, M.seawater, "water", C_OCEAN), L("얼음 껍질", 1, 920, M.ice, "ice", [0.85, 0.8, 0.72])], note: "두께 약 100 km의 짠 바다.", src: "Schubert 외 2004" },
  가니메데: { layers: [L("철 핵", 0.25, 6000, M.feFeS, "metal", C_IRON), L("규산염 맨틀", 0.55, 3300, M.pyrolite, "rock", C_MANTLE), L("고압 얼음", 0.8, 1300, M.ice, "ice", [0.7, 0.8, 0.9]), L("바다", 0.9, 1050, M.seawater, "water", C_OCEAN), L("얼음 지각", 1, 920, M.ice, "ice", [0.6, 0.58, 0.55])], note: "자기장이 있는 유일한 위성.", src: "Schubert 외 2004" },
  칼리스토: { layers: [L("암석·얼음 혼합", 0.85, 2100, M.rockIce, "rock", [0.4, 0.38, 0.35]), L("바다", 0.93, 1050, M.seawater, "water", C_OCEAN), L("얼음 지각", 1, 950, M.ice, "ice", [0.45, 0.42, 0.38])], note: "덜 분화된 내부.", src: "Schubert 외 2004" },
  타이탄: { layers: [L("함수 규산염 핵", 0.65, 2600, M.carbonaceous, "rock", C_ROCK), L("고압 얼음", 0.8, 1300, M.ice, "ice", [0.7, 0.75, 0.8]), L("바다", 0.9, 1100, M.seawater, "water", C_OCEAN), L("얼음 지각", 1, 950, blend([[M.ice, 0.9], [M.n2ice, 0.1]]), "ice", [0.85, 0.65, 0.35])], note: "두꺼운 질소 대기 (픽셀에는 넣지 않음).", src: "Iess 외 2014" },
  엔켈라두스: { layers: [L("다공성 암석 핵", 0.75, 2400, M.carbonaceous, "rock", C_ROCK), L("바다", 0.92, 1030, M.seawater, "water", C_OCEAN), L("얼음 껍질", 1, 920, M.ice, "ice", C_ICE)], note: "남극에서 바닷물이 뿜어져 나옴.", src: "Iess 외 2014" },
  트리톤: { layers: [L("암석·금속 핵", 0.72, 3000, M.chondrite, "rock", C_ROCK), L("물 얼음 맨틀", 0.98, 950, M.ice, "ice", C_ICE), L("질소 얼음", 1, 1000, M.n2ice, "ice", [0.9, 0.78, 0.75])], note: "붙잡힌 카이퍼대 천체. 역행 궤도라 해왕성으로 떨어지는 중.", src: "McKinnon & Kirk 2014" },
  카론: { layers: [L("암석 핵", 0.6, 2700, M.carbonaceous, "rock", C_ROCK), L("물 얼음", 1, 950, M.ice, "ice", [0.62, 0.62, 0.6])], note: "", src: "Nimmo 외 2016" },
  포보스: { layers: [L("탄소질 잔해 더미", 1, 1876, M.carbonaceous, "rock", [0.32, 0.29, 0.27])], note: "공극률 약 30%의 잔해 더미로 봄 (밀도 1.88 g/cm³).", src: "Rosenblatt 2011" },
  데이모스: { layers: [L("탄소질 잔해 더미", 1, 1470, M.carbonaceous, "rock", [0.4, 0.37, 0.33])], note: "", src: "Rosenblatt 2011" },
  "슈메이커–레비 9": { layers: [L("얼음·먼지 잔해 더미", 1, 600, M.cometNucleus, "ice", [0.55, 0.55, 0.6])], note: "핵 지름 약 1.5–2 km의 느슨한 잔해 더미 (Asphaug & Benz 1994).", src: "Asphaug & Benz 1994" },
  태양: { layers: [L("핵 (수소 → 헬륨)", 0.25, 30000, M.solarCore, "plasma", [1.0, 0.95, 0.75]), L("복사층", 0.71, 1500, M.solar, "plasma", [1.0, 0.82, 0.45]), L("대류층", 1, 30, M.solar, "plasma", [1.0, 0.68, 0.3])], note: "46억 년 동안 맨 중심의 수소가 약 71%에서 34%로 줄었음 (핵은 평균값). 층 질량은 대략값.", src: "Asplund 외 2021; 표준 태양 모형" },
};

/** 외계행성: 반지름으로 고른 대표 구성 (Zeng 외 2019의 질량–반지름 관계) */
export function exoComposition(Rp: number): Composition {
  if (Rp < 1.6) return { ...BODY_COMP["지구"], note: "반지름 1.6 R⊕ 미만: 지구처럼 철 핵 약 33% + 규산염 맨틀이라고 가정.", src: "Zeng 외 2019" };
  if (Rp < 2.6) return { layers: [L("철 핵", 0.45, 11000, M.earthCore, "metal", C_IRON), L("규산염 맨틀", 0.75, 5000, M.pyrolite, "rock", C_MANTLE), L("고압 물·얼음", 0.92, 2500, M.ice, "water", [0.3, 0.5, 0.8]), L("수소·헬륨 대기", 1, 200, M.solar, "gas", [0.7, 0.8, 0.9])], note: "슈퍼지구~미니 해왕성: 바위 위에 물 또는 얇은 수소 대기 (질량의 1–3%).", src: "Zeng 외 2019" };
  if (Rp < 7) return BODY_COMP["해왕성"];
  return BODY_COMP["목성"];
}

/** 별: 진화 단계에 따른 대표 구성 */
export function starComposition(phase: "ms" | "giant" | "wd" | "ns"): Composition {
  if (phase === "wd") return { layers: [L("탄소·산소 핵", 0.98, 1e9, norm({ C: 40, O: 58, Ne: 2 }), "plasma", [0.85, 0.9, 1.0]), L("헬륨·수소 대기", 1, 1e6, norm({ He: 70, H: 30 }), "plasma", [0.9, 0.95, 1.0])], note: "지구만 한 크기에 태양 질량의 절반 이상이 압축된 탄소·산소.", src: "표준 백색왜성 모형" };
  if (phase === "giant") return { layers: [L("헬륨 핵 (또는 탄소·산소)", 0.002, 1e8, norm({ He: 97, C: 2, O: 1 }), "plasma", [1.0, 0.95, 0.85]), L("수소 외피", 1, 1e-3, M.solar, "plasma", [1.0, 0.55, 0.3])], note: "핵은 지구 크기, 외피는 수억 km로 부풀어 있음.", src: "표준 항성 진화 모형" };
  if (phase === "ns") return { layers: [L("중성자", 1, 4e17, norm({ H: 100 }), "plasma", [0.7, 0.8, 1.0])], note: "원소가 아니라 중성자로 된 핵물질.", src: "" };
  return { ...BODY_COMP["태양"], note: "태양과 같은 구성이라고 가정 (금속 함량을 모르는 별).", src: "Asplund 외 2021" };
}

/** 천체 전체의 원소 질량 비율 (층의 부피 × 밀도로 가중) */
export function bulkComposition(c: Composition): { el: El; f: number }[] {
  const out: Mix = {};
  let r0 = 0, tot = 0;
  for (const l of c.layers) {
    const m = (l.r ** 3 - r0 ** 3) * l.rho;
    tot += m;
    for (const [k, v] of Object.entries(l.el)) out[k as El] = (out[k as El] ?? 0) + (v ?? 0) * m;
    r0 = l.r;
  }
  return Object.entries(out).map(([el, v]) => ({ el: el as El, f: (v ?? 0) / tot })).sort((a, b) => b.f - a.f);
}

/** 층별 질량 비율 */
export function layerMasses(c: Composition): number[] {
  let r0 = 0;
  const m = c.layers.map((l) => { const v = (l.r ** 3 - r0 ** 3) * l.rho; r0 = l.r; return v; });
  const s = m.reduce((a, b) => a + b, 0);
  return m.map((x) => x / s);
}

/** 그 층의 원소 비율에 따라 원소 하나를 뽑음 (픽셀 하나 = 원소 덩어리 하나) */
export function sampleElement(el: Mix, u: number): El {
  let acc = 0;
  for (const [k, v] of Object.entries(el)) { acc += v ?? 0; if (u <= acc) return k as El; }
  return Object.keys(el)[0] as El;
}
