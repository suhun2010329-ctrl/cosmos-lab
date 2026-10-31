// 태양계 천체의 물리 특성 (NASA 행성 자료표, 2024년 기준 위성 수), 블랙홀, 그리고 먼 미래 연표.

export interface BodyFacts {
  /** 질량 [10²⁴ kg], 평균 반지름 [km], 밀도 [kg/m³], 표면 중력 [m/s²], 탈출 속도 [km/s] */
  mass: number; radius: number; density: number; gravity: number; escape: number;
  /** 자전 주기 [시간] (음수는 역행), 자전축 기울기 [°] */
  rotation: number; tilt: number;
  /** 평균 표면(또는 1기압 고도) 온도 [°C], 표면 기압 [bar] */
  temp: number; pressure: number | null;
  atmosphere: string;
  magnetic: string;
  moons: number;
  rings: string;
  features: string;
}

export const FACTS: Record<string, BodyFacts> = {
  수성: { mass: 0.330, radius: 2439.7, density: 5429, gravity: 3.7, escape: 4.3, rotation: 1407.6, tilt: 0.03, temp: 167, pressure: null, atmosphere: "거의 없음 (나트륨·칼륨·산소로 된 외기권)", magnetic: "약함 (지구의 약 1%)", moons: 0, rings: "없음", features: "철 핵이 부피의 약 85%. 낮 430 °C, 밤 −180 °C. 3:2 자전–공전 공명." },
  금성: { mass: 4.87, radius: 6051.8, density: 5243, gravity: 8.9, escape: 10.4, rotation: -5832.5, tilt: 177.4, temp: 464, pressure: 92, atmosphere: "이산화탄소 96.5%, 질소 3.5%, 황산 구름", magnetic: "없음 (유도 자기권만)", moons: 0, rings: "없음", features: "폭주 온실 효과로 태양계에서 가장 뜨거운 행성. 거꾸로 아주 느리게 자전." },
  지구: { mass: 5.97, radius: 6371.0, density: 5514, gravity: 9.8, escape: 11.2, rotation: 23.934, tilt: 23.44, temp: 15, pressure: 1.014, atmosphere: "질소 78%, 산소 21%, 아르곤 0.9%, 이산화탄소 0.04%", magnetic: "강함 (지구 자기권, 판 구조와 액체 외핵)", moons: 1, rings: "없음", features: "표면의 71%가 액체 물. 알려진 유일한 생명의 행성." },
  화성: { mass: 0.642, radius: 3389.5, density: 3934, gravity: 3.7, escape: 5.0, rotation: 24.623, tilt: 25.19, temp: -65, pressure: 0.006, atmosphere: "이산화탄소 95%, 질소 2.8%, 아르곤 2%", magnetic: "전체 자기장 없음 (지각에 옛 자기 흔적)", moons: 2, rings: "없음", features: "태양계 최대 화산 올림푸스산(약 22 km), 극관의 물·드라이아이스, 옛 강바닥." },
  목성: { mass: 1898, radius: 69911, density: 1326, gravity: 23.1, escape: 59.5, rotation: 9.925, tilt: 3.13, temp: -110, pressure: null, atmosphere: "수소 90%, 헬륨 10%, 암모니아 구름", magnetic: "태양계에서 가장 강함 (지구의 약 2만 배 자기 모멘트)", moons: 95, rings: "희미한 먼지 고리", features: "대적점(지구보다 큰 폭풍), 금속 수소 내부. 태양계 행성 질량의 약 71%." },
  토성: { mass: 568, radius: 58232, density: 687, gravity: 9.0, escape: 35.5, rotation: 10.656, tilt: 26.73, temp: -140, pressure: null, atmosphere: "수소 96%, 헬륨 3%", magnetic: "강함 (자기축이 자전축과 거의 일치)", moons: 274, rings: "밝은 얼음 고리 (지름 약 27만 km, 두께 수십 m)", features: "밀도가 물보다 낮음. 북극의 육각형 구름." },
  천왕성: { mass: 86.8, radius: 25362, density: 1270, gravity: 8.7, escape: 21.3, rotation: -17.24, tilt: 97.77, temp: -195, pressure: null, atmosphere: "수소 83%, 헬륨 15%, 메탄 2%", magnetic: "자전축에서 59° 기울고 중심에서 벗어남", moons: 28, rings: "어두운 고리 13개", features: "옆으로 누워서 공전. 얼음 거대행성 (물·암모니아·메탄 맨틀)." },
  해왕성: { mass: 102, radius: 24622, density: 1638, gravity: 11.0, escape: 23.5, rotation: 16.11, tilt: 28.32, temp: -200, pressure: null, atmosphere: "수소 80%, 헬륨 19%, 메탄 1.5%", magnetic: "자전축에서 47° 기움", moons: 16, rings: "희미한 고리 5개", features: "초속 600 m의 가장 빠른 바람. 계산으로 위치를 먼저 예측해 찾은 행성 (1846)." },
  케레스: { mass: 0.000938, radius: 469.7, density: 2162, gravity: 0.28, escape: 0.51, rotation: 9.07, tilt: 4, temp: -105, pressure: null, atmosphere: "없음", magnetic: "없음", moons: 0, rings: "없음", features: "소행성대 질량의 약 4분의 1. 오카토르 충돌구의 밝은 탄산염." },
  명왕성: { mass: 0.0130, radius: 1188.3, density: 1854, gravity: 0.62, escape: 1.2, rotation: -153.3, tilt: 122.5, temp: -225, pressure: 0.00001, atmosphere: "질소, 메탄, 일산화탄소 (아주 엷음)", magnetic: "알려지지 않음", moons: 5, rings: "없음", features: "질소 얼음 평원 ‘스푸트니크 평원’ (뉴허라이즌스 2015). 카론과 서로 조석 고정." },
  하우메아: { mass: 0.0040, radius: 780, density: 2600, gravity: 0.4, escape: 0.8, rotation: 3.92, tilt: 0, temp: -241, pressure: null, atmosphere: "없음", magnetic: "알려지지 않음", moons: 2, rings: "고리 있음 (2017 발견)", features: "4시간도 안 되는 빠른 자전으로 럭비공 모양 (약 2100 × 1680 × 1070 km)." },
  마케마케: { mass: 0.0031, radius: 715, density: 1700, gravity: 0.5, escape: 0.8, rotation: 22.8, tilt: 0, temp: -239, pressure: null, atmosphere: "거의 없음", magnetic: "알려지지 않음", moons: 1, rings: "없음", features: "붉은빛 메탄 얼음 표면." },
  에리스: { mass: 0.0166, radius: 1163, density: 2520, gravity: 0.82, escape: 1.38, rotation: 378.9, tilt: 0, temp: -243, pressure: null, atmosphere: "얼어붙은 상태", magnetic: "알려지지 않음", moons: 1, rings: "없음", features: "명왕성보다 무거운 왜소행성. 발견(2005)이 행성 정의를 바꿈." },
  달: { mass: 0.0735, radius: 1737.4, density: 3344, gravity: 1.62, escape: 2.38, rotation: 655.7, tilt: 6.7, temp: -20, pressure: null, atmosphere: "없음", magnetic: "없음", moons: 0, rings: "", features: "지구와 조석 고정. 해마다 3.82 cm씩 멀어짐. 거대 충돌로 생겼다고 봄." },
  이오: { mass: 0.0893, radius: 1821.6, density: 3528, gravity: 1.80, escape: 2.56, rotation: 42.5, tilt: 0, temp: -143, pressure: null, atmosphere: "엷은 이산화황", magnetic: "없음", moons: 0, rings: "", features: "목성의 조석 가열로 활화산 400개 이상. 태양계에서 화산 활동이 가장 활발." },
  유로파: { mass: 0.0480, radius: 1560.8, density: 3013, gravity: 1.31, escape: 2.03, rotation: 85.2, tilt: 0.1, temp: -160, pressure: null, atmosphere: "엷은 산소", magnetic: "유도 자기장 (지하 바다의 증거)", moons: 0, rings: "", features: "얼음 껍질 아래 깊이 약 100 km의 바다. 생명 탐사의 유력 후보." },
  가니메데: { mass: 0.148, radius: 2634.1, density: 1942, gravity: 1.43, escape: 2.74, rotation: 171.7, tilt: 0.3, temp: -163, pressure: null, atmosphere: "엷은 산소", magnetic: "자체 자기장이 있는 유일한 위성", moons: 0, rings: "", features: "태양계 최대 위성 (수성보다 큼). 지하 바다." },
  칼리스토: { mass: 0.108, radius: 2410.3, density: 1834, gravity: 1.24, escape: 2.44, rotation: 400.5, tilt: 0, temp: -139, pressure: null, atmosphere: "엷은 이산화탄소", magnetic: "유도 자기장", moons: 0, rings: "", features: "충돌구로 가장 빽빽한 표면. 지질 활동이 거의 없음." },
  타이탄: { mass: 0.1345, radius: 2574.7, density: 1880, gravity: 1.35, escape: 2.64, rotation: 382.7, tilt: 0.3, temp: -179, pressure: 1.45, atmosphere: "질소 95%, 메탄 5%", magnetic: "없음", moons: 0, rings: "", features: "지구보다 두꺼운 대기, 메탄·에탄의 호수와 비. 하위헌스 착륙 (2005)." },
  엔켈라두스: { mass: 0.000108, radius: 252.1, density: 1609, gravity: 0.11, escape: 0.24, rotation: 32.9, tilt: 0, temp: -198, pressure: null, atmosphere: "물기둥에서 나온 수증기", magnetic: "없음", moons: 0, rings: "", features: "남극 틈에서 바닷물이 우주로 뿜어져 토성 E 고리를 만듦." },
  트리톤: { mass: 0.0214, radius: 1353.4, density: 2061, gravity: 0.78, escape: 1.46, rotation: -141.0, tilt: 0, temp: -235, pressure: 0.000014, atmosphere: "엷은 질소", magnetic: "없음", moons: 0, rings: "", features: "역행 공전 — 카이퍼대에서 붙잡힌 천체. 질소 간헐천." },
  카론: { mass: 0.00159, radius: 606, density: 1702, gravity: 0.29, escape: 0.59, rotation: 153.3, tilt: 0, temp: -220, pressure: null, atmosphere: "없음", magnetic: "없음", moons: 0, rings: "", features: "명왕성 지름의 절반. 둘 다 서로를 향해 고정된 이중 천체." },
  포보스: { mass: 1.07e-8, radius: 11.27, density: 1876, gravity: 0.0057, escape: 0.011, rotation: 7.65, tilt: 0, temp: -40, pressure: null, atmosphere: "없음", magnetic: "없음", moons: 0, rings: "", features: "100년에 1.8 m씩 화성에 다가감. 3천만~5천만 년 뒤 부서질 운명." },
};

// ---------- 블랙홀 ----------
export interface BlackHole { name: string; ra: number; dec: number; dkpc: number; mass: number; note: string }
export const BLACK_HOLES: BlackHole[] = [
  { name: "궁수자리 A* (우리 은하 중심 블랙홀)", ra: 266.4168, dec: -29.0078, dkpc: 8.178, mass: 4.30e6, note: "별 S2의 궤도로 질량을 재고 (2020 노벨상), 사건지평선 망원경이 그림자를 찍음 (EHT 2022)." },
  { name: "M87* (처녀자리 A의 블랙홀)", ra: 187.7059, dec: 12.3911, dkpc: 16500, mass: 6.5e9, note: "인류가 처음 사진을 찍은 블랙홀 (EHT 2019). 길이 5천 광년의 제트." },
  { name: "Gaia BH1 (가장 가까운 블랙홀)", ra: 262.1711, dec: -0.5809, dkpc: 0.480, mass: 9.62, note: "Gaia 위성의 별 궤도로 찾은 ‘조용한’ 블랙홀 (El-Badry 외 2023)." },
  { name: "Gaia BH3", ra: 294.3926, dec: 14.9336, dkpc: 0.590, mass: 33, note: "우리 은하에서 알려진 가장 무거운 항성 블랙홀 (Gaia 2024)." },
  { name: "백조자리 X-1", ra: 299.5903, dec: 35.2016, dkpc: 2.22, mass: 21.2, note: "처음 확인된 블랙홀 후보 (1971). 청색 초거성 짝별의 가스를 빨아들이며 X선을 냄." },
];

/** 슈바르츠실트 반지름 [km] */
export function schwarzschildKm(Msun: number): number { return 2.953 * Msun; }
/** 호킹 복사로 증발하는 시간 [년] ≈ 2.1 × 10⁶⁷ (M/M☉)³ (주변 우주배경복사 흡수는 무시) */
export function hawkingYears(Msun: number): number { return 2.1e67 * Math.pow(Msun, 3); }

// ---------- 먼 미래 연표 (영원히 팽창하는 ΛCDM 기준) ----------
export interface FarEvent { years: number; label: string; detail: string }
export const FAR_FUTURE: FarEvent[] = [
  { years: 1.5e11, label: "국부 은하군 밖 은하가 모두 보이지 않게 됨", detail: "가속 팽창으로 먼 은하의 빛이 끝없이 적색편이되어, 밖을 보면 병합된 우리 은하군만 남습니다 (Loeb 2002; Krauss & Scherrer 2007)." },
  { years: 1e12, label: "우주배경복사도 관측할 수 없게 됨", detail: "파장이 우주 크기만큼 늘어나 빅뱅의 흔적을 직접 볼 수 없게 됩니다." },
  { years: 1e14, label: "별 탄생이 끝남", detail: "별을 만들 가스가 바닥나고, 가장 오래 사는 적색왜성까지 꺼지기 시작합니다 (Adams & Laughlin 1997)." },
  { years: 1e15, label: "행성이 별에서 떨어져 나감", detail: "별끼리 가까이 지나가며 행성계가 흐트러집니다." },
  { years: 1e19, label: "은하가 증발함", detail: "별들이 서로 당기며 은하 밖으로 튕겨 나가고, 남은 것은 중심 블랙홀로 떨어집니다." },
  { years: 2.4e34, label: "양성자 붕괴의 관측 하한", detail: "슈퍼카미오칸데는 양성자 수명이 최소 2.4 × 10³⁴년임을 보였습니다. 양성자가 붕괴한다면 10⁴⁰년쯤 백색왜성·행성이 사라집니다." },
  { years: 2.1e67, label: "태양 질량 블랙홀 증발", detail: "호킹 복사로 질량을 잃어 사라집니다." },
  { years: 1e100, label: "가장 무거운 블랙홀까지 증발", detail: "10¹¹ M☉급 블랙홀이 사라지면 우주에는 희박한 입자와 빛만 남는 ‘열적 죽음’ 상태가 됩니다." },
];
