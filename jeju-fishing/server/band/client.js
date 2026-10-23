// BAND Open API 클라이언트 (서버 전용).
// 엔드포인트는 공식 문서 기준(PRD 4, 2026-10-23 확인)이며 실제 계정 호출 검증 전이다.
// 응답 필드명(result_data.items, paging.next_params 등)은 1단계 검증에서 확정한다.
// 접근 토큰은 환경 변수로만 받고, 브라우저 응답·로그·저장소에 남기지 않는다.

const BASE = 'https://openapi.band.us';

export class BandApiError extends Error {
  constructor(message, { status, resultCode, kind }) {
    super(message);
    this.status = status;
    this.resultCode = resultCode;
    // auth: 만료·철회 → 연결 중단 / transient: 재시도 / unknown
    // 권한 오류를 원문 삭제로 오판하지 않기 위해 구분한다(FR-012).
    this.kind = kind;
  }
}

export function maskToken(text, token) {
  if (!token) return String(text);
  return String(text).split(token).join('***');
}

export function createBandClient({ accessToken, locale = 'ko_KR', fetchImpl = fetch } = {}) {
  if (!accessToken) throw new Error('BAND_ACCESS_TOKEN이 설정되지 않았습니다');

  async function call(path, params = {}) {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries({ ...params, access_token: accessToken })) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    let res;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      throw new BandApiError(maskToken(`네트워크 오류: ${err.message}`, accessToken), { kind: 'transient' });
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.result_code === 1) return body.result_data;
    const kind = res.status === 401 || res.status === 403 ? 'auth' : res.status >= 500 || res.status === 429 ? 'transient' : 'unknown';
    throw new BandApiError(`BAND API 오류 ${path} (HTTP ${res.status}, result_code ${body.result_code ?? '-'})`, {
      status: res.status,
      resultCode: body.result_code,
      kind,
    });
  }

  return {
    listBands: () => call('/v2.1/bands'),
    // 최종 수정일 순 반환(공식 문서). 다음 페이지는 paging.next_params 사용
    listPosts: (bandKey, nextParams = {}) => call('/v2/band/posts', { band_key: bandKey, locale, ...nextParams }),
    getPost: (bandKey, postKey) => call('/v2.1/band/post', { band_key: bandKey, post_key: postKey }),
  };
}

// 한 밴드의 최근 게시글을 페이지 단위로 조회한다. 밴드당 한 번 호출로 모든 글을 확보한다고 가정하지 않는다.
// 수정일 정렬이므로 since 이전 글이 maxPages 안에서 연속해 나오면 중단한다(최근 페이지 겹쳐 확인, PRD 8.1).
export async function fetchRecentPosts(client, bandKey, { sinceMs, maxPages = 5 } = {}) {
  const items = [];
  let next = {};
  for (let page = 0; page < maxPages; page++) {
    const data = await client.listPosts(bandKey, next);
    const pageItems = data?.items ?? [];
    items.push(...pageItems);
    const allOld = sinceMs && pageItems.length > 0 && pageItems.every((p) => p.created_at < sinceMs);
    next = data?.paging?.next_params;
    if (!next || allOld || pageItems.length === 0) break;
  }
  return items;
}
