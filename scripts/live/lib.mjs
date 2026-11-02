// 실시간 수집기의 순수 함수 (테스트할 수 있게 따로 둠): arXiv Atom 해석, 초록에서 값 뽑기, 규칙 검증.
export const PARAMS = {
  H0: { label: "허블 상수 H₀", unit: "km/s/Mpc", lo: 55, hi: 90, query: 'cat:astro-ph.CO AND abs:"Hubble constant"',
    re: /H_?\{?0\}?\s*\$?\s*=\s*\$?\s*(\d{2}(?:\.\d{1,2})?)\s*(?:\\pm|±|\+\/-|\$\\pm\$)\s*(\d{1,2}(?:\.\d{1,2})?)/ },
};
/** 공백 정리 + XML 문자 참조 풀기 (&amp; → &) */
export function strip(s) { return s.replace(/\s+/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim(); }
export function parseAtom(xml) {
  const out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1], tag = (t) => { const x = e.match(new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">")); return x ? strip(x[1]) : null; };
    out.push({ id: tag("id")?.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", ""), title: tag("title"), summary: tag("summary"), published: tag("published"), updated: tag("updated"), journal: tag("arxiv:journal_ref"), doi: tag("arxiv:doi") });
  }
  return out;
}

/**
 * 검증 규칙: ① 값과 불확도가 함께 있음 ② 물리적으로 가능한 범위 ③ 불확도가 값의 15% 미만
 * ④ 이미 검증된 측정들의 가중 평균과 6σ 넘게 어긋나지 않음 ⑤ 학술지 게재 확인 (arXiv journal_ref·DOI 또는 Crossref 제목 대조).
 * 모두 통과하면 accepted, 아니면 pending과 이유.
 */
export function verify(key, value, sigma, ref, pub, e) {
  const P = PARAMS[key], reasons = [];
  if (!(value >= P.lo && value <= P.hi)) reasons.push("값이 물리적으로 가능한 범위(" + P.lo + "–" + P.hi + ") 밖");
  if (!(sigma > 0 && sigma < 0.15 * value)) reasons.push("불확도가 없거나 너무 큼");
  const dev = ref.n ? Math.abs(value - ref.mean) / Math.sqrt(sigma ** 2 + ref.sigma ** 2) : 0;
  if (ref.n && dev > 6) reasons.push("기존 측정들과 " + dev.toFixed(1) + "σ 차이: 사람 검토 필요");
  if (!pub) reasons.push("학술지 게재 확인 전 (arXiv 프리프린트)");
  return { param: key, label: P.label, value, sigma, unit: P.unit, title: e.title, arxiv: e.id, date: (e.published || "").slice(0, 10), journal: pub?.journal ? strip(pub.journal) : null, doi: pub?.doi ?? null, dev: ref.n ? +dev.toFixed(2) : null, method: "자동 추출 (초록의 수식)", status: reasons.length ? "pending" : "accepted", reasons };
}
