// 1단계 검증용: 실제 API 응답의 필드 구조를 값 없이 요약한다(PRD 12 '응답 필드표').
// 본문·이름·URL 같은 값은 기록하지 않고 경로·타입·출현 횟수만 남긴다.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// items 배열 전체를 훑어 'author.user_key' 같은 경로별로 타입과 출현 수를 센다. 배열 원소는 '[]'로 표기.
export function fieldTable(items) {
  const fields = new Map();
  const visit = (value, path) => {
    const t = typeOf(value);
    if (path) {
      const f = fields.get(path) ?? { path, types: new Set(), count: 0 };
      f.types.add(t);
      f.count++;
      fields.set(path, f);
    }
    if (t === 'array') value.forEach((v) => visit(v, `${path}[]`));
    else if (t === 'object') for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k);
  };
  items.forEach((item) => visit(item, ''));
  return [...fields.values()]
    .map((f) => ({ path: f.path, types: [...f.types].sort().join('|'), count: f.count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// 허용 작성자 등록(sources.json의 allowedAuthorKeys)에 필요한 작성자별 글 수.
// 이름·역할은 운영자 터미널 확인용으로만 쓰고 파일에는 user_key와 글 수만 저장한다.
export function authorSummary(items) {
  const byKey = new Map();
  for (const p of items) {
    const key = p.author?.user_key ?? '(없음)';
    const a = byKey.get(key) ?? { userKey: key, name: p.author?.name ?? '', role: p.author?.role ?? '', posts: 0 };
    a.posts++;
    byKey.set(key, a);
  }
  return [...byKey.values()].sort((a, b) => b.posts - a.posts);
}

export function postStats(items) {
  const created = items.map((p) => p.created_at).filter(Number.isFinite);
  return {
    posts: items.length,
    withPhotos: items.filter((p) => (p.photos ?? []).length > 0).length,
    createdFrom: created.length ? new Date(Math.min(...created)).toISOString() : null,
    createdTo: created.length ? new Date(Math.max(...created)).toISOString() : null,
    // 목록이 수정일 순이라는 문서 설명 확인용: created_at이 내림차순이 아닌 지점 수
    outOfCreatedOrder: created.filter((t, i) => i > 0 && t > created[i - 1]).length,
  };
}
