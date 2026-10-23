// BAND OAuth 2.0 (서버 전용). 엔드포인트는 공식 문서 기준이며 1단계 검증에서 실제 동작을 확인한다.
// 클라이언트 시크릿과 발급된 토큰은 브라우저·로그·Git에 남기지 않는다(PRD 4.1).

export const AUTH_BASE = 'https://auth.band.us';

export function authorizeUrl({ clientId, redirectUri, state }) {
  if (!clientId || !redirectUri) throw new Error('BAND_CLIENT_ID와 redirect URI가 필요합니다');
  const url = new URL('/oauth2/authorize', AUTH_BASE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  if (state) url.searchParams.set('state', state);
  return url;
}

// 인가 코드 → 접근 토큰. 클라이언트 인증은 Basic 헤더(client_id:client_secret)로 보낸다.
export async function exchangeCode({ clientId, clientSecret, code, fetchImpl = fetch }) {
  if (!clientId || !clientSecret) throw new Error('BAND_CLIENT_ID와 BAND_CLIENT_SECRET이 필요합니다');
  const url = new URL('/oauth2/token', AUTH_BASE);
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('code', code);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetchImpl(url, { headers: { Authorization: `Basic ${basic}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    // 응답 본문에 토큰·시크릿이 섞여 있을 수 있으니 오류 코드만 남긴다
    throw new Error(`토큰 발급 실패 (HTTP ${res.status}${body.error ? `, ${body.error}` : ''})`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresIn: body.expires_in ?? null,
    userKey: body.user_key ?? null,
  };
}
