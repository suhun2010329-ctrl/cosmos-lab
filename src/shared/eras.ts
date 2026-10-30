// 빅뱅부터 미래까지의 시대 목록. 경계 대부분은 계산값(온도, 동등 시점, 감속 변수 등)에서 정한다.
import type { Cosmology } from "./cosmology";
import { bisect, laZ } from "./math";
import { fmtEnergy, fmtNum, fmtTime, GYR, YEAR } from "./format";
import { laOfTemp, type Ionization, type Nucleosynthesis, type StarFormation } from "./physics";

export interface Era {
  la: number;
  name: string;
  short: string;
  text: string;
}

export interface EraList {
  list: Era[];
  /** 태양계 탄생 시점 log10(a) */
  laSun: number;
  /** 물질–복사 동등 적색편이 */
  zEq: number;
}

export function buildEras(core: Cosmology, ION: Ionization, BBN: Nucleosynthesis, SFR: StarFormation): EraList {
  const p = core.parts;
  const zEq = Math.pow(10, -bisect((la) => { const q = p(Math.pow(10, la)); return q.r - (q.b + q.c); }, -6, -2)) - 1;
  const laAcc = bisect((la) => {
    const a = Math.pow(10, la), q = p(a), tot = q.r + q.b + q.c + q.de;
    return (2 * q.r + 0.5 * (q.b + q.c) + 0.5 * q.de * (1 + 3 * core.wOf(a))) / tot;
  }, -1.5, 0.3);
  const laDE = bisect((la) => { const q = p(Math.pow(10, la)); return q.de - (q.b + q.c); }, -1.5, 0.3);
  const tNow = core.tOf(0), laSun = core.laOfT(tNow - 4.568e9 * YEAR);
  const Trh = core.TofA(Math.pow(10, core.LA_RH)) * core.KMEV;
  const zOf = (la: number) => Math.pow(10, -la) - 1;
  const list: Era[] = [
    { la: core.LA_MIN, name: "인플레이션", short: "인플레이션",
      text: "공간이 거의 일정한 허블 매개변수로 지수 팽창합니다. 양자 요동이 우주 크기로 늘어나 n_s ≈ 0.965의 거의 균일한 밀도 씨앗이 됩니다. 여기서는 12자릿수(약 28 e-배)로 줄였고, 실제는 최소 50~60 e-배입니다." },
    { la: core.LA_RH, name: "재가열", short: "재가열",
      text: "인플라톤 에너지가 표준 모형 입자로 바뀝니다(순간 재가열 가정, kT ≈ " + fmtEnergy(Trh) + "). 유효 자유도 g* = 106.75: 모든 표준 모형 입자가 빛처럼 움직이는 플라스마입니다." },
    { la: laOfTemp(core, 159.5e3), name: "전약 상전이", short: "전약",
      text: "약 159.5 GeV(격자 계산)에서 힉스 장이 값을 가지며 입자들이 질량을 얻고, 전자기력과 약한 핵력이 갈라집니다. 쿼크와 글루온은 아직 자유롭습니다. 점의 세 색은 쿼크의 색전하입니다." },
    { la: laOfTemp(core, 156.5), name: "QCD 상전이 · 하드론화", short: "양성자 탄생",
      text: "약 156.5 MeV(HotQCD 2019)에서 쿼크와 글루온이 양성자·중성자 안에 갇힙니다. 첫 원소인 수소의 원자핵(양성자)이 이때 생깁니다. 붉은 점은 양성자, 회색 점은 중성자입니다." },
    { la: laOfTemp(core, 1.0), name: "중성미자 분리 · 약한 상호작용 동결", short: "중성미자",
      text: "약 1 MeV 아래에서 중성미자가 빠져나가고, 중성자↔양성자 전환이 느려져 n/p가 평형값에서 벗어납니다. 회색 점 비율이 계산된 중성자 비율입니다." },
    { la: laOfTemp(core, 0.5), name: "전자–양전자 소멸", short: "e⁺e⁻ 소멸",
      text: "전자–양전자 쌍이 소멸하며 광자를 데웁니다. 이후 광자 온도는 중성미자보다 (11/4)^(1/3) ≈ 1.40배 높습니다. 자유 중성자는 수명 878.4초로 붕괴하기 시작합니다." },
    { la: BBN.laNuc, name: "빅뱅 핵합성", short: "원소 합성",
      text: "중수소 병목이 풀리는 0.073 MeV(빅뱅 후 " + fmtTime(BBN.tNuc) + ")에서 남은 중성자가 거의 모두 헬륨-4로 들어갑니다. 수소·헬륨과 미량의 리튬이 이때 생기고, 그보다 무거운 원소는 별이 생길 때까지 1억 년 넘게 없습니다." },
    { la: laOfTemp(core, 0.02), name: "광자 시대", short: "광자",
      text: "핵반응이 끝나고, 빛이 에너지 대부분을 차지합니다. 빛이 자유전자에 계속 부딪혀 우주는 빛나는 불투명한 안개입니다." },
    { la: laZ(zEq), name: "물질–복사 동등", short: "물질 우세",
      text: "z ≈ " + fmtNum(zEq) + "(Planck 2018: 3402 ± 26)에서 물질 밀도가 복사를 앞지르고, 암흑물질 밀도 요동이 a에 비례해 자랍니다." },
    { la: laZ(ION.zHalf), name: "재결합 · 마지막 산란", short: "우주배경복사",
      text: "수소가 절반 중성이 되는 z ≈ " + fmtNum(ION.zHalf) + "에서 안개가 걷힙니다. 마지막 산란면 계산값 z* ≈ " + fmtNum(ION.zStar) + "(Planck 2018: 1089.92). 원자가 처음으로 생깁니다." },
    { la: laZ(400), name: "암흑 시대", short: "암흑 시대",
      text: "별이 아직 없습니다. 중성 수소와 암흑물질(회청색 점, 실제로는 보이지 않음)이 중력으로 실과 매듭 모양으로 뭉칩니다." },
    { la: laZ(25), name: "첫 별 (종족 III)", short: "첫 별",
      text: "이론상 z ≈ 20~30, 가장 드문 밀도 봉우리에서 금속이 전혀 없는 무거운 첫 별이 켜집니다. 이 별들이 폭발하며 탄소·산소·철 같은 첫 무거운 원소가 우주에 뿌려집니다. 금속이 없으니 행성은 아직 만들 수 없습니다." },
    { la: laZ(14.44), name: "JWST가 본 가장 먼 은하", short: "JWST",
      text: "JWST가 분광으로 확인한 가장 먼 은하 MoM-z14(z = 14.44, Naidu 외 2025)의 시대, 빅뱅 후 약 " + fmtTime(core.tOf(laZ(14.44))) + "입니다." },
    { la: laZ(core.P.zre), name: "재이온화", short: "재이온화",
      text: "은하의 자외선이 우주 수소를 다시 이온화합니다. 중간점 z_re = 7.67(Planck 2018), 계산한 재이온화 광학 깊이 τ = " + ION.tauRe.toFixed(4) + "(Planck 2018: 0.0544)." },
    { la: laZ(SFR.zNoon), name: "우주의 정오", short: "우주의 정오",
      text: "별 형성률이 최대인 z ≈ " + SFR.zNoon.toFixed(2) + "(Madau & Dickinson 2014). 백색왜성 폭발과 중성자별 충돌이 늘어나 철과 금 같은 원소가 빠르게 쌓입니다." },
    { la: laAcc, name: "가속 팽창 시작", short: "가속",
      text: "감속 변수 q가 0이 되는 z ≈ " + zOf(laAcc).toFixed(2) + "부터 팽창이 빨라집니다(" + (core.model === "desi" ? "DESI DR2 w₀wₐ" : "ΛCDM") + " 계산)." },
    { la: laSun, name: "태양계 탄생", short: "태양",
      text: "운석 속 가장 오래된 광물(CAI)의 나이로 잰 45억 6800만 년 전, z ≈ " + zOf(laSun).toFixed(2) + "에 태양과 지구가 생깁니다. 이때 이미 92종의 자연 원소가 모두 있었습니다." },
    { la: laDE, name: "암흑에너지 우세", short: "암흑에너지",
      text: "z ≈ " + zOf(laDE).toFixed(2) + "부터 암흑에너지 밀도가 물질을 앞지릅니다." },
    { la: 0, name: "오늘", short: "오늘",
      text: "우주 나이 계산값 " + (tNow / GYR).toFixed(3) + " Gyr(Planck 2018: 13.797 ± 0.023 Gyr). 구성: 암흑에너지 " + (core.OL * 100).toFixed(1) + "%, 암흑물질 " + ((core.Oc + core.Onu) * 100).toFixed(1) + "%, 보통 물질 " + (core.Ob * 100).toFixed(1) + "%. 사람이 만든 원소 26종도 이제 있습니다." },
    { la: 0.05, name: "미래", short: "미래",
      text: core.model === "desi"
        ? "DESI DR2의 w₀wₐ 모형에서는 암흑에너지가 시간에 따라 약해져 ΛCDM보다 가속이 덜합니다. 2025년 결과는 ΛCDM과 2.8~4.2σ 차이로, 아직 확정은 아닙니다."
        : "우주 상수(ΛCDM)라면 팽창은 계속 가속하고, 먼 은하들은 점점 관측할 수 있는 영역 밖으로 멀어집니다." },
  ];
  list.sort((x, y) => x.la - y.la);
  return { list, laSun, zEq };
}

export function eraIndex(eras: Era[], la: number): number {
  let k = 0;
  for (let i = 0; i < eras.length; i++) if (la >= eras[i].la) k = i;
  return k;
}
