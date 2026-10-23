// 반복 동기화 1회 실행. 스케줄러(cron 등)에서 60분 간격 호출을 가정한다(PRD 8.1, API 한도 검증 후 확정).
// 사용: npm run sync (토큰은 .env의 BAND_ACCESS_TOKEN 또는 환경 변수)
// 소스 설정은 data/sources.json (예: data/sources.example.json 참고)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createBandClient, fetchRecentPosts, maskToken } from './band/client.js';
import { upsertPosts } from './store.js';
import { loadEnv } from './env.js';

loadEnv();

const DATA_DIR = new URL('../data/', import.meta.url);
const STORE_FILE = new URL('store.json', DATA_DIR);
const SOURCES_FILE = new URL('sources.json', DATA_DIR);
const INITIAL_DAYS = 30;

async function loadJson(url, fallback) {
  return existsSync(url) ? JSON.parse(await readFile(url, 'utf8')) : fallback;
}

async function main() {
  const token = process.env.BAND_ACCESS_TOKEN;
  const client = createBandClient({ accessToken: token });
  const sources = await loadJson(SOURCES_FILE, null);
  if (!sources) throw new Error('data/sources.json이 없습니다. data/sources.example.json을 복사해 작성하세요.');

  const store = await loadJson(STORE_FILE, { posts: {}, sources: [], connections: {} });
  store.sources = sources;
  const now = Date.now();

  for (const source of sources.filter((s) => s.active)) {
    const conn = (store.connections[source.bandKey] ??= {});
    const sinceMs = conn.lastSuccessAt ? conn.lastSuccessAt - 24 * 3600e3 : now - INITIAL_DAYS * 24 * 3600e3;
    try {
      const posts = await fetchRecentPosts(client, source.bandKey, { sinceMs });
      const stats = upsertPosts(store, source, posts, now);
      Object.assign(conn, { lastSuccessAt: now, lastError: null, failures: 0 });
      console.log(`[${source.bandKey}] ${JSON.stringify(stats)}`);
    } catch (err) {
      // 연결별 마지막 성공 상태는 보존하고 오류만 기록. 인증 오류면 연결 중단 표시(FR-002)
      conn.failures = (conn.failures ?? 0) + 1;
      conn.lastError = { at: now, kind: err.kind ?? 'unknown', message: maskToken(err.message, token) };
      if (err.kind === 'auth') conn.suspended = true;
      console.error(`[${source.bandKey}] 실패: ${conn.lastError.message}`);
    }
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

main().catch((err) => {
  console.error(maskToken(err.message, process.env.BAND_ACCESS_TOKEN));
  process.exitCode = 1;
});
