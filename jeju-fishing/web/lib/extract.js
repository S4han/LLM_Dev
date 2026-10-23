// 규칙 기반 조황 추출기 (PRD 7.2, 8.3, FR-004~FR-006)
// 브라우저와 Node(서버 동기화) 양쪽에서 같은 코드를 사용한다.
// 원문은 분석 대상 데이터로만 취급하며, 포함된 링크·명령을 실행하지 않는다.

export const SPECIES = [
  { key: '한치', group: '한치', aliases: ['한치', '한치오징어'] },
  { key: '갈치', group: '갈치', aliases: ['갈치', '은갈치'] },
  { key: '참돔', group: '참돔', aliases: ['참돔', '빨간돔'] },
  { key: '무늬오징어', group: '기타', aliases: ['무늬오징어', '무늬'] },
  { key: '쭈꾸미', group: '기타', aliases: ['쭈꾸미', '주꾸미'] },
  { key: '방어', group: '기타', aliases: ['방어'] },
  { key: '부시리', group: '기타', aliases: ['부시리'] },
  { key: '고등어', group: '기타', aliases: ['고등어'] },
  { key: '우럭', group: '기타', aliases: ['우럭', '조피볼락'] },
  { key: '벵에돔', group: '기타', aliases: ['벵에돔'] },
  { key: '광어', group: '기타', aliases: ['광어'] },
  { key: '쏨뱅이', group: '기타', aliases: ['쏨뱅이'] },
  { key: '옥돔', group: '기타', aliases: ['옥돔'] },
];

export const METHODS = [
  { key: '이카메탈', aliases: ['이카메탈', '이까메탈'] },
  { key: '오모리그', aliases: ['오모리그'] },
  { key: '외줄', aliases: ['외줄낚시', '외줄'] },
  { key: '텐빈', aliases: ['텐빈'] },
  { key: '텐야', aliases: ['텐야'] },
  { key: '타이라바', aliases: ['타이라바'] },
  { key: '지깅', aliases: ['슬로우지깅', '지깅'] },
  { key: '에깅', aliases: ['팁런', '에깅'] },
];

export const POST_TYPES = {
  catch: '조황',
  recruit: '모집',
  notice: '공지',
  cancel: '기상 취소',
  unknown: '미확인',
};

const CANCEL_RE = /(출항\s*취소|출조\s*취소|결항|풍랑\s*(주의보|경보)|기상\s*악화로?\s*(취소|휴항)|휴항)/;
const RECRUIT_RE = /(예약\s*(받|문의|가능|접수)|모집|자리\s*(있|남)|남은\s*자리|선착순|잔여석|빈자리)/;
const NOTICE_RE = /^\s*\[?\s*(공지|안내)\s*\]?/;
const CATCH_RE = /(조황|조과|\d+\s*(수|마리|미)(?![가-힣])|쿨러|손맛|마릿수|장원)/;

// 제목·본문과 해시태그를 분리한다. 범용 홍보 태그보다 본문을 우선(PRD 7.2 태그 규칙).
export function splitHashtags(text) {
  const tags = [];
  const body = text.replace(/#([^\s#]+)/g, (_, tag) => {
    tags.push(tag);
    return ' ';
  });
  return { body, tags };
}

function findTerms(dict, body, tags) {
  const found = [];
  const tagOnly = [];
  for (const item of dict) {
    const inBody = item.aliases.find((a) => body.includes(a));
    if (inBody) {
      found.push({ key: item.key, evidence: snippet(body, body.indexOf(inBody)) });
    } else if (tags.some((t) => item.aliases.some((a) => t.includes(a)))) {
      tagOnly.push(item.key);
    }
  }
  return { found, tagOnly };
}

function snippet(text, index, radius = 24) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ---------- 날짜 ----------

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function toKstDateString(ms) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function shiftDays(dateStr, days) {
  const dt = new Date(dateStr + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// 출조일 추출. 명시 날짜 우선, 상대 표현은 게시 시각 기준으로 해석하고 inferred=true로 기록.
// 게시일 이후의 날짜(예약 모집 날짜 등)는 출조일로 보지 않는다.
export function extractTripDate(body, createdAtMs) {
  const postDate = toKstDateString(createdAtMs);
  const postYear = Number(postDate.slice(0, 4));
  const candidates = [];

  const full = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;
  for (const m of body.matchAll(full)) {
    candidates.push({ index: m.index, value: ymd(+m[1], +m[2], +m[3]), evidence: m[0].trim(), explicitYear: true });
  }
  const masked = body.replace(full, (s) => ' '.repeat(s.length));

  const short = /(?<![\d.])(\d{1,2})\s*(?:월\s*(\d{1,2})\s*일|[./](\d{1,2})(?![\d.]|\s*(?:kg|키로|cm|시|:)))/g;
  for (const m of masked.matchAll(short)) {
    const month = +m[1];
    const day = +(m[2] ?? m[3]);
    let value = ymd(postYear, month, day);
    // 연말 게시물이 아닌 이상, 게시일보다 뒤면 작년으로 본다(1월에 올린 12월 조황 등)
    if (value && value > postDate) {
      const prev = ymd(postYear - 1, month, day);
      // 한 달 이상 미래면 미래 일정(모집)일 가능성이 높으니 작년 해석만 채택
      value = daysBetween(value, postDate) > 31 ? prev : null;
    }
    candidates.push({ index: m.index, value, evidence: m[0].trim() });
  }

  const explicit = candidates
    .filter((c) => c.value && c.value <= postDate)
    .sort((a, b) => a.index - b.index);
  if (explicit.length) {
    return { value: explicit[0].value, inferred: false, evidence: explicit[0].evidence };
  }

  const relative = [
    { re: /그저께|그제/, days: -2 },
    { re: /어제|전날|어젯밤/, days: -1 },
    { re: /오늘|금일|당일/, days: 0 },
  ];
  for (const r of relative) {
    const m = body.match(r.re);
    if (m) return { value: shiftDays(postDate, r.days), inferred: true, evidence: m[0] };
  }
  return { value: null, inferred: false, evidence: null };
}

function daysBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 86400000;
}

// ---------- 조과 주장 ----------

const CLAIM_RE = /(?<![\d.])(\d{1,4}(?:\.\d+)?)(?:\s*[~\-]\s*(\d{1,4}(?:\.\d+)?))?\s*(수|마리|미|kg|키로)(?![가-힣])/g;

function detectBasis(context) {
  if (/(최고|장원|1등|일등|최대)/.test(context)) return 'personal_best';
  if (/(1인|인당|개인|한\s*분|평균)/.test(context)) return 'person';
  if (/(선박|배\s*전체|전체|총|합계|선단|모두\s*합)/.test(context)) return 'boat';
  return 'unknown';
}

export const BASIS_LABELS = {
  person: '개인(인당)',
  personal_best: '개인 최고',
  boat: '선박 전체',
  unknown: '기준 불명',
};

// 수량은 원문 주장으로만 저장한다(PRD 7.2). 사진으로 추정·합산하지 않는다.
export function extractCatchClaims(body) {
  const claims = [];
  for (const line of body.split(/\n|(?<=[.!?])\s+/)) {
    for (const m of line.matchAll(CLAIM_RE)) {
      const before = line.slice(0, m.index);
      const context = line.slice(Math.max(0, m.index - 16), m.index);
      let species = null;
      let speciesPos = -1;
      for (const s of SPECIES) {
        for (const a of s.aliases) {
          const pos = before.lastIndexOf(a);
          if (pos > speciesPos) {
            speciesPos = pos;
            species = s.key;
          }
        }
      }
      const unitRaw = m[3];
      claims.push({
        species,
        min: Number(m[1]),
        max: m[2] ? Number(m[2]) : Number(m[1]),
        unit: unitRaw === 'kg' || unitRaw === '키로' ? 'kg' : '마리',
        basis: detectBasis(context),
        evidence: line.trim().slice(0, 80),
        status: 'claimed',
      });
    }
  }
  return claims;
}

// 같은 줄에 어종이 없는 수량은, 본문 어종이 하나뿐일 때만 그 어종으로 본다(추정 표시)
function fillClaimSpecies(claims, foundSpecies) {
  if (foundSpecies.length !== 1) return claims;
  return claims.map((c) => (c.species ? c : { ...c, species: foundSpecies[0].key, speciesInferred: true }));
}

// ---------- 유형 ----------

export function classifyPost(body) {
  const hasCatch = CATCH_RE.test(body);
  const hasRecruit = RECRUIT_RE.test(body);
  if (CANCEL_RE.test(body) && !hasCatch) return { type: 'cancel', mixed: false };
  if (hasCatch) return { type: 'catch', mixed: hasRecruit };
  if (hasRecruit) return { type: 'recruit', mixed: false };
  if (NOTICE_RE.test(body)) return { type: 'notice', mixed: false };
  return { type: 'unknown', mixed: false };
}

// ---------- 전체 ----------

export function extractReport({ content, createdAt }) {
  const text = String(content ?? '');
  const { body, tags } = splitHashtags(text);
  const { type, mixed } = classifyPost(body);
  const species = findTerms(SPECIES, body, tags);
  const methods = findTerms(METHODS, body, tags);
  return {
    type,
    mixed,
    tripDate: extractTripDate(body, createdAt),
    species: species.found,
    methods: methods.found,
    // 해시태그에만 있는 값은 실제 조황으로 확정하지 않는다(FR-005)
    hashtagOnly: { species: species.tagOnly, methods: methods.tagOnly },
    claims: type === 'catch' ? fillClaimSpecies(extractCatchClaims(body), species.found) : [],
    photoOnly: body.replace(/\s/g, '').length < 10,
  };
}

export function speciesGroup(key) {
  return SPECIES.find((s) => s.key === key)?.group ?? '기타';
}

// 관리자 수동 교정은 자동 추출값보다 우선하며 재동기화에 덮어쓰지 않는다(FR-013)
export function applyOverrides(extracted, overrides) {
  if (!overrides) return extracted;
  return { ...extracted, ...overrides, overridden: Object.keys(overrides) };
}

// 짧은 요약(규칙 기반). AI 요약이 없거나 실패해도 이 기본 요약을 쓴다(PRD 8.3).
export function basicSummary(report) {
  const parts = [];
  if (report.species.length) parts.push(report.species.map((s) => s.key).join('·'));
  if (report.methods.length) parts.push(report.methods.map((m) => m.key).join('·'));
  const claim = report.claims[0];
  if (claim) {
    const qty = claim.min === claim.max ? `${claim.min}` : `${claim.min}~${claim.max}`;
    parts.push(`${claim.species ?? ''} ${qty}${claim.unit === 'kg' ? 'kg' : '수'} (${BASIS_LABELS[claim.basis]}, 원문 주장)`.trim());
  }
  return parts.join(' / ') || '요약할 정보가 부족합니다';
}
