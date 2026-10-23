import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertPosts, markDeleted, revokeSource, publicReports } from '../server/store.js';
import { createBandClient, fetchRecentPosts, maskToken, BandApiError } from '../server/band/client.js';

const source = { bandKey: 'b1', vesselId: 'v1', active: true, allowedAuthorKeys: ['owner'] };
const T = Date.UTC(2026, 9, 23, 0, 0);
const post = (key, content, author = 'owner') => ({ post_key: key, content, created_at: T, author: { user_key: author, name: 'x' }, photos: [] });
const emptyStore = () => ({ posts: {}, sources: [source], connections: {} });

test('허용되지 않은 작성자의 글은 저장하지 않는다', () => {
  const store = emptyStore();
  const stats = upsertPosts(store, source, [post('p1', '갈치 30수'), post('p2', '한치 10수', 'member')]);
  assert.equal(stats.created, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(store.posts['b1:p2'], undefined);
});

test('같은 원문 ID는 중복 생성하지 않고 내용 변경 시에만 갱신한다', () => {
  const store = emptyStore();
  upsertPosts(store, source, [post('p1', '갈치 30수')]);
  assert.equal(upsertPosts(store, source, [post('p1', '갈치 30수')]).unchanged, 1);
  assert.equal(upsertPosts(store, source, [post('p1', '갈치 35수')]).updated, 1);
  assert.equal(Object.keys(store.posts).length, 1);
});

test('관리자 교정과 공개 상태는 재동기화 후에도 유지된다', () => {
  const store = emptyStore();
  upsertPosts(store, source, [post('p1', '갈치 30수 조황')]);
  const p = store.posts['b1:p1'];
  p.overrides = { tripDate: { value: '2026-10-20', inferred: false, evidence: '관리자' } };
  p.visibility = 'public';
  upsertPosts(store, source, [post('p1', '갈치 32수 조황')]);
  assert.equal(store.posts['b1:p1'].report.tripDate.value, '2026-10-20');
  assert.equal(store.posts['b1:p1'].visibility, 'public');
});

test('미승인(검토 대기)·삭제·철회 자료는 공개 목록에서 빠진다', () => {
  const store = emptyStore();
  upsertPosts(store, source, [post('p1', '갈치 30수 조황'), post('p2', '한치 20수 조황')]);
  assert.equal(publicReports(store).length, 0);
  store.posts['b1:p1'].visibility = 'public';
  store.posts['b1:p2'].visibility = 'public';
  markDeleted(store, 'b1:p1');
  assert.deepEqual(publicReports(store).map((r) => r.id), ['b1:p2']);
  revokeSource(store, 'b1');
  assert.equal(publicReports(store).length, 0);
  assert.equal(store.sources[0].active, false);
});

test('토큰을 오류 메시지에서 가린다', () => {
  assert.equal(maskToken('url?access_token=SECRET&x=1', 'SECRET'), 'url?access_token=***&x=1');
});

test('API 인증 오류는 auth로 분류해 삭제와 구분한다', async () => {
  const client = createBandClient({
    accessToken: 't',
    fetchImpl: async () => new Response(JSON.stringify({ result_code: 10401 }), { status: 401 }),
  });
  await assert.rejects(client.listBands(), (e) => e instanceof BandApiError && e.kind === 'auth');
});

test('next_params로 다음 페이지를 따라가고 오래된 페이지에서 멈춘다', async () => {
  const pages = [
    { items: [{ post_key: 'a', created_at: T }], paging: { next_params: { after: '1' } } },
    { items: [{ post_key: 'b', created_at: T - 40 * 86400e3 }], paging: { next_params: { after: '2' } } },
    { items: [{ post_key: 'c', created_at: T }], paging: {} },
  ];
  const calls = [];
  const client = createBandClient({
    accessToken: 't',
    fetchImpl: async (url) => {
      calls.push(url.searchParams.get('after'));
      return new Response(JSON.stringify({ result_code: 1, result_data: pages[calls.length - 1] }));
    },
  });
  const items = await fetchRecentPosts(client, 'b1', { sinceMs: T - 30 * 86400e3 });
  assert.deepEqual(items.map((i) => i.post_key), ['a', 'b']);
  assert.deepEqual(calls, [null, '1']);
});
