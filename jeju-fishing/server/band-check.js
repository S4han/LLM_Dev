// 1단계 BAND 연동 검증(PRD 4.2, 11.1, 12).
//   npm run band:check                      → 토큰으로 접근 가능한 밴드 목록(band_key 확인)
//   npm run band:check -- --band KEY [--pages 2]
//                                           → 게시글 목록·개별 글 응답 필드표, 페이지 처리, 작성자별 글 수
// 결과는 data/band-check.json(git 제외)에 값 없이 구조만 저장한다. 본문·사진 URL은 저장하지 않는다.
import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadEnv } from './env.js';
import { createBandClient, fetchRecentPosts, maskToken } from './band/client.js';
import { fieldTable, authorSummary, postStats } from './band/inspect.js';

loadEnv();
const token = process.env.BAND_ACCESS_TOKEN;
const OUT = new URL('../data/band-check.json', import.meta.url);

const { values: args } = parseArgs({
  options: { band: { type: 'string' }, pages: { type: 'string', default: '2' } },
});

function printFields(title, rows) {
  console.log(`\n## ${title}`);
  console.table(rows);
}

async function main() {
  const client = createBandClient({ accessToken: token });
  const report = { checkedAt: new Date().toISOString() };

  const bandsData = await client.listBands();
  const bands = bandsData?.bands ?? [];
  report.bands = { count: bands.length, fields: fieldTable(bands) };
  console.log(`접근 가능한 밴드 ${bands.length}개`);
  console.table(bands.map((b) => ({ name: b.name, band_key: b.band_key, member_count: b.member_count })));

  if (args.band) {
    let pages = 0;
    const counting = {
      listPosts: async (...a) => {
        pages++;
        const d = await client.listPosts(...a);
        report.paging ??= { fields: fieldTable([d?.paging ?? {}]) };
        return d;
      },
    };
    const items = await fetchRecentPosts(counting, args.band, { maxPages: Number(args.pages) || 1 });
    const authors = authorSummary(items);
    report.posts = { band: args.band, pagesFetched: pages, ...postStats(items), fields: fieldTable(items) };
    // 파일에는 user_key와 글 수만(이름·역할 제외)
    report.authors = authors.map(({ userKey, posts }) => ({ userKey, posts }));

    console.log(`\n게시글 ${items.length}건 / ${pages}페이지`, postStats(items));
    printFields('게시글 목록 필드 (경로 · 타입 · 출현 수)', report.posts.fields);
    printFields('paging 필드', report.paging?.fields ?? []);
    console.log('\n## 작성자별 글 수 — 허용 작성자의 user_key를 data/sources.json의 allowedAuthorKeys에 넣으세요');
    console.table(authors);

    if (items[0]?.post_key) {
      const one = await client.getPost(args.band, items[0].post_key);
      report.post = { fields: fieldTable([one?.post ?? one ?? {}]) };
      printFields('개별 글 조회 필드 (원문 URL 필드가 있는지 확인)', report.post.fields);
    }
  } else if (bands.length) {
    console.log('\n게시글 구조를 보려면: npm run band:check -- --band <band_key>');
  }

  await mkdir(new URL('.', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(report, null, 2));
  console.log('\n저장: data/band-check.json');
}

main().catch((err) => {
  console.error(maskToken(err.message, token));
  if (err.kind === 'auth') console.error('토큰이 만료·철회되었거나 권한이 없습니다. npm run band:auth로 다시 발급하세요.');
  process.exitCode = 1;
});
