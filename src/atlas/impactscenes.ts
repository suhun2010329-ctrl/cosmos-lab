// 픽셀 충돌 시나리오: 실제 사건·예측과 그 근거. 질량·반지름은 NASA 자료표, 충돌 조건은 문헌값.
import { BODY_COMP, type Composition } from "./composition";
import { FACTS } from "./bodies";
import { approach, G_SI, mutualEscape, type ImpactSetup } from "./impact";
import { NOW_YEAR } from "./time";

export interface Scene {
  key: string;
  label: string;
  /** 시간 막대에서 이 사건의 때 [년, 지금 기준] (가상이면 없음) */
  years?: number;
  when: string;
  text: string;
  src: string;
  make: (q: number) => ImpactSetup;
}

const ME = 5.972e24, RE = 6.371e6;
const body = (name: string): { M: number; R: number; comp: Composition } => {
  const f = FACTS[name];
  return { M: f.mass * 1e24, R: f.radius * 1e3, comp: BODY_COMP[name] };
};
/** 품질 q (0 보통, 1 자세히, 2 아주 자세히) → 픽셀 수 배율 */
const Q = [0.5, 1, 2];

/** 원궤도 (고정 행성 둘레, 역행이면 dir = −1), 조석 고정 자전 */
function orbiting(Mp: number, r: number, dir = 1): { pos: [number, number, number]; vel: [number, number, number]; spin: number } {
  const v = Math.sqrt(G_SI * Mp / r);
  return { pos: [r, 0, 0], vel: [0, dir * v, 0], spin: dir * v / r };
}

export const SCENES: Scene[] = [
  {
    key: "theia", label: "테이아 충돌 — 달의 탄생", years: -4.51e9, when: "약 45.1억 년 전",
    text: "화성 크기의 원시 행성 테이아(지구 질량의 13%)가 원시 지구에 45°로, 둘의 탈출 속도(약 9.1 km/s)로 부딪친 ‘표준 거대 충돌’입니다. 튀어나간 물질 일부가 지구 둘레를 도는 원반이 되어 달이 됩니다. 원반에 철이 적고 테이아 물질이 많다는 것이 이 모형의 특징입니다.",
    src: "Canup & Asphaug 2001, Nature 412, 708; Canup 2004, Icarus 168, 433",
    make: (q) => {
      const Mt = 0.887 * ME, Rt = 0.97 * RE, Mi = 0.13 * ME, Ri = 3.62e6;
      const v = mutualEscape(Mt, Rt, Mi, Ri), a = approach(Mt, Rt, Mi, Ri, v, 45);
      return { key: "theia", duration: 20 * 3600, follow: -1, bodies: [
        { name: "원시 지구", comp: BODY_COMP["지구"], M: Mt, R: Rt, n: Math.round(2400 * Q[q]), pos: a.p1, vel: a.v1 },
        { name: "테이아", comp: BODY_COMP["테이아"], M: Mi, R: Ri, n: Math.round(900 * Q[q]), pos: a.p2, vel: a.v2 },
      ] };
    },
  },
  {
    key: "sl9", label: "슈메이커–레비 9 혜성의 조석 붕괴", years: 1992.52 - NOW_YEAR, when: "1992년 7월 7~8일 (관측된 사건)",
    text: "목성 구름 꼭대기 위 목성 반지름의 약 0.31–0.38배(중심에서 약 1.33배)까지 스쳐 지나가던 혜성 핵(지름 약 1.5 km의 느슨한 잔해 더미)이 목성의 조석력에 찢겨 ‘진주 목걸이’처럼 늘어섰습니다. 조각들은 1994년 7월 목성에 떨어졌습니다 (관측된 조각 21개 이상, 처음에는 큰 조각 10–12개로 갈라졌다는 분석도 있음). 이 장면은 모형이 관측과 맞는지 확인하는 검증용입니다.",
    src: "Asphaug & Benz 1994, Nature 370, 120; NASA NSSDC 혜성 자료",
    make: (q) => {
      const J = body("목성"), R = 750, M = 600 * 4 / 3 * Math.PI * R ** 3, qp = 1.33 * J.R;
      // 목성에 붙잡힌 약 2년 주기 궤도 (a ≈ 0.156 AU, e ≈ 0.996), 근점 q. 목성 반지름의 약 3배 거리에서 출발 (근점 약 1.7시간 전)
      const mu = G_SI * J.M, aOrb = 2.34e10, e = 1 - qp / aOrb, p = aOrb * (1 - e * e), nu = -1.714;
      const r = p / (1 + e * Math.cos(nu)), vx = -Math.sqrt(mu / p) * Math.sin(nu), vy = Math.sqrt(mu / p) * (e + Math.cos(nu));
      return { key: "sl9", duration: 30 * 3600, follow: 0, fixed: { name: "목성", comp: J.comp, M: J.M, R: J.R }, bodies: [
        { name: "슈메이커–레비 9 핵", comp: BODY_COMP["슈메이커–레비 9"], M, R, n: Math.round(2800 * Q[q]), pos: [r * Math.cos(nu), r * Math.sin(nu), 0], vel: [vx, vy, 0], spin: 0 },
      ] };
    },
  },
  {
    key: "phobos", label: "포보스가 부서져 화성의 고리가 됨", years: 3e7, when: "약 2천만~4천만 년 뒤 (예측)",
    text: "포보스는 화성의 조석 때문에 100년에 약 1.8 m씩 화성에 다가갑니다. Black & Mittal(2015)은 포보스의 강도가 조석력을 버티기에 약해서 2천만~4천만 년 안에 부서지고, 조각들이 화성 둘레에 고리를 만들어 최대 1억 년쯤 남는다고 예측했습니다 (예: 화성 반지름의 1.2배에서 부서지면 좁은 고리). 이 장면은 강도가 없는 잔해 더미를 화성 반지름의 1.6배 궤도에 놓고 조석에 찢기는 모습을 봅니다.",
    src: "Black & Mittal 2015, Nature Geoscience 8, 913",
    make: (q) => {
      const Ma = body("화성"), P = body("포보스"), o = orbiting(Ma.M, 1.6 * Ma.R);
      return { key: "phobos", duration: 24 * 3600, follow: 0, fixed: { name: "화성", comp: Ma.comp, M: Ma.M, R: Ma.R }, bodies: [
        { name: "포보스", comp: P.comp, M: P.M, R: P.R, n: Math.round(2800 * Q[q]), pos: o.pos, vel: o.vel, spin: o.spin },
      ] };
    },
  },
  {
    key: "triton", label: "트리톤이 해왕성의 조석에 찢어짐", years: 3.6e9, when: "약 36억 년 뒤 (예측, 해왕성 내부에 따라 30억 년 이상)",
    text: "트리톤은 해왕성 자전과 반대로 도는 역행 위성이라 조석이 궤도를 줄입니다. 해왕성의 로슈 한계(얼음·암석 천체에서 해왕성 반지름의 약 2.2배) 안으로 들어오면 찢어져 토성보다 큰 고리를 만들 것으로 봅니다. 이 장면은 해왕성 반지름의 2.0배 궤도에서 시작합니다.",
    src: "Chyba, Jankowski & Nicholson 1989, A&A 219, L23",
    make: (q) => {
      const N = body("해왕성"), T = body("트리톤"), o = orbiting(N.M, 2.0 * N.R, -1);
      return { key: "triton", duration: 40 * 3600, follow: 0, fixed: { name: "해왕성", comp: N.comp, M: N.M, R: N.R }, bodies: [
        { name: "트리톤", comp: T.comp, M: T.M, R: T.R, n: Math.round(2800 * Q[q]), pos: o.pos, vel: o.vel, spin: o.spin },
      ] };
    },
  },
  {
    key: "mercvenus", label: "수성과 금성의 충돌 (확률 약 1%)", years: 3.5e9, when: "수십억 년 뒤, 일어날 확률 약 1%",
    text: "수성 궤도는 목성과의 공명 때문에 수십억 년에 걸쳐 이심률이 커질 수 있습니다. 태양계 미래를 2,500번 계산한 결과 약 1%에서 수성이 금성이나 태양과 부딪쳤습니다. 이 장면은 그런 충돌을 두 행성의 탈출 속도보다 조금 빠른 10 km/s, 40°로 가정합니다.",
    src: "Laskar & Gastineau 2009, Nature 459, 817",
    make: (q) => {
      const V = body("금성"), Me = body("수성"), v = Math.hypot(mutualEscape(V.M, V.R, Me.M, Me.R), 4500), a = approach(V.M, V.R, Me.M, Me.R, v, 40);
      return { key: "mercvenus", duration: 14 * 3600, follow: -1, bodies: [
        { name: "금성", comp: V.comp, M: V.M, R: V.R, n: Math.round(2400 * Q[q]), pos: a.p1, vel: a.v1 },
        { name: "수성", comp: Me.comp, M: Me.M, R: Me.R, n: Math.round(1000 * Q[q]), pos: a.p2, vel: a.v2 },
      ] };
    },
  },
];

/** 사용자가 고르는 충돌: 두 천체, 충돌 속력 [km/s] (0이면 탈출 속도), 각도 */
export const PICKABLE = ["지구", "달", "화성", "수성", "금성", "테이아", "케레스", "명왕성", "카론", "이오", "유로파", "가니메데", "칼리스토", "타이탄", "트리톤", "엔켈라두스"];
export function customScene(a: string, b: string, vKms: number, angle: number, q: number): ImpactSetup {
  const A = a === "테이아" ? { M: 0.13 * ME, R: 3.62e6, comp: BODY_COMP["테이아"] } : body(a);
  const Bd = b === "테이아" ? { M: 0.13 * ME, R: 3.62e6, comp: BODY_COMP["테이아"] } : body(b);
  const [P, S, pn, sn] = A.M >= Bd.M ? [A, Bd, a, b] : [Bd, A, b, a];
  const vesc = mutualEscape(P.M, P.R, S.M, S.R), v = vKms > 0 ? Math.max(vKms * 1000, vesc * 0.5) : vesc;
  const ap = approach(P.M, P.R, S.M, S.R, v, angle);
  // 작은 쪽도 최소 픽셀 수를 보장 (크기 차이가 크면 픽셀 크기가 서로 다름)
  const n1 = Math.round(2200 * Q[q]), n2 = Math.round(Math.max(500, Math.min(1400, 2200 * (S.R / P.R) ** 3)) * Q[q]);
  // 충돌에 걸리는 시간 규모: 큰 천체 둘레 궤도 몇 바퀴
  const tdyn = 2 * Math.PI * Math.sqrt((3 * P.R) ** 3 / (G_SI * P.M));
  return { key: "custom", duration: Math.min(Math.max(3 * tdyn, 4 * 3600), 40 * 3600), follow: -1, bodies: [
    { name: pn, comp: P.comp, M: P.M, R: P.R, n: n1, pos: ap.p1, vel: ap.v1 },
    { name: sn, comp: S.comp, M: S.M, R: S.R, n: n2, pos: ap.p2, vel: ap.v2 },
  ] };
}

/** 한 천체를 픽셀로 쌓아 단면만 보기 */
export function stillBody(name: string, comp: Composition, M: number, R: number, q: number): ImpactSetup {
  return { key: "still", still: true, duration: 0, follow: 0, bodies: [{ name, comp, M, R, n: Math.round(5000 * Q[q]), pos: [0, 0, 0], vel: [0, 0, 0] }] };
}
