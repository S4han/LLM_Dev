import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeUrl, exchangeCode } from '../server/band/oauth.js';
import { fieldTable, authorSummary, postStats } from '../server/band/inspect.js';
import { parseEnv } from '../server/env.js';

test('인가 주소에 client_id·redirect_uri·state를 담는다', () => {
  const url = authorizeUrl({ clientId: 'cid', redirectUri: 'http://localhost:8787/callback', state: 's1' });
  assert.equal(url.origin + url.pathname, 'https://auth.band.us/oauth2/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:8787/callback');
  assert.equal(url.searchParams.get('state'), 's1');
});

test('토큰 교환은 Basic 인증으로 보내고 실패 시 시크릿을 메시지에 넣지 않는다', async () => {
  let seen;
  const t = await exchangeCode({
    clientId: 'cid',
    clientSecret: 'SECRET',
    code: 'c1',
    fetchImpl: async (url, init) => {
      seen = { url, auth: init.headers.Authorization };
      return new Response(JSON.stringify({ access_token: 'AT', refresh_token: 'RT', expires_in: 100, user_key: 'u1' }));
    },
  });
  assert.deepEqual(t, { accessToken: 'AT', refreshToken: 'RT', expiresIn: 100, userKey: 'u1' });
  assert.equal(seen.url.searchParams.get('grant_type'), 'authorization_code');
  assert.equal(seen.auth, `Basic ${Buffer.from('cid:SECRET').toString('base64')}`);

  await assert.rejects(
    exchangeCode({
      clientId: 'cid',
      clientSecret: 'SECRET',
      code: 'bad',
      fetchImpl: async () => new Response(JSON.stringify({ error: 'invalid_grant', secret: 'SECRET' }), { status: 400 }),
    }),
    (e) => /invalid_grant/.test(e.message) && !e.message.includes('SECRET'),
  );
});

test('필드표는 값 없이 경로·타입·출현 수만 남긴다', () => {
  const rows = fieldTable([
    { post_key: 'a', content: '비밀 본문', author: { user_key: 'u1', name: '홍길동' }, photos: [{ url: 'x', width: 1 }] },
    { post_key: 'b', content: '본문', author: { user_key: 'u2', name: null }, photos: [] },
  ]);
  const byPath = Object.fromEntries(rows.map((r) => [r.path, r]));
  assert.equal(byPath['author.name'].types, 'null|string');
  assert.equal(byPath['photos[].url'].count, 1);
  assert.equal(byPath.post_key.count, 2);
  assert.ok(!JSON.stringify(rows).includes('홍길동'));
  assert.ok(!JSON.stringify(rows).includes('비밀'));
});

test('작성자별 글 수와 게시 시각 범위를 집계한다', () => {
  const items = [
    { author: { user_key: 'u1' }, created_at: 3000, photos: [{}] },
    { author: { user_key: 'u2' }, created_at: 1000 },
    { author: { user_key: 'u1' }, created_at: 2000 },
  ];
  assert.deepEqual(authorSummary(items).map((a) => [a.userKey, a.posts]), [['u1', 2], ['u2', 1]]);
  const s = postStats(items);
  assert.equal(s.withPhotos, 1);
  assert.equal(s.outOfCreatedOrder, 1);
  assert.equal(s.createdFrom, new Date(1000).toISOString());
});

test('.env 파싱: 주석·따옴표·빈 줄 처리', () => {
  assert.deepEqual(parseEnv('# c\nA=1\n\nB="x y"\nC = \'z\'\nbad line'), { A: '1', B: 'x y', C: 'z' });
});
