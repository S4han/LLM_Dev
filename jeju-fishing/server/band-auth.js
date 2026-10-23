// 운영자 본인 계정의 BAND 접근 토큰을 OAuth로 발급받아 .env에 저장한다(PRD 4.1: 초기 검증은 운영자 토큰).
// 사용: .env에 BAND_CLIENT_ID, BAND_CLIENT_SECRET 입력 → npm run band:auth → 출력된 주소를 브라우저에서 열기
// BAND 개발자 센터에 등록한 Redirect URI와 BAND_REDIRECT_URI(기본 http://localhost:8787/callback)가 같아야 한다.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadEnv, ENV_FILE } from './env.js';
import { authorizeUrl, exchangeCode } from './band/oauth.js';
import { maskToken } from './band/client.js';

loadEnv();
const { BAND_CLIENT_ID: clientId, BAND_CLIENT_SECRET: clientSecret } = process.env;
const redirectUri = process.env.BAND_REDIRECT_URI || 'http://localhost:8787/callback';
const redirect = new URL(redirectUri);
const state = randomBytes(16).toString('hex');

async function saveToken(token) {
  const text = existsSync(ENV_FILE) ? await readFile(ENV_FILE, 'utf8') : '';
  const line = `BAND_ACCESS_TOKEN=${token}`;
  const next = /^BAND_ACCESS_TOKEN=.*$/m.test(text)
    ? text.replace(/^BAND_ACCESS_TOKEN=.*$/m, line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  await writeFile(ENV_FILE, next, { mode: 0o600 });
  await chmod(ENV_FILE, 0o600);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirect.origin);
  if (url.pathname !== redirect.pathname) return res.writeHead(404).end();
  const done = (status, msg) => {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(msg);
    server.close();
  };
  // 다른 요청이 섞여 들어와도 대기를 끝내지 않는다
  if (url.searchParams.get('state') !== state) {
    return res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('state가 일치하지 않습니다.');
  }
  const code = url.searchParams.get('code');
  if (!code) return done(400, `인가 실패: ${url.searchParams.get('error') ?? '코드 없음'}`);
  try {
    const t = await exchangeCode({ clientId, clientSecret, code });
    await saveToken(t.accessToken);
    console.log('토큰을 .env의 BAND_ACCESS_TOKEN에 저장했습니다(화면에는 표시하지 않음).');
    console.log(`user_key: ${t.userKey ?? '-'} · 만료(초): ${t.expiresIn ?? '응답에 없음'} · refresh_token: ${t.refreshToken ? '있음' : '없음'}`);
    console.log('다음: npm run band:check');
    done(200, '토큰 발급 완료. 이 창을 닫고 터미널을 확인하세요.');
  } catch (err) {
    console.error(maskToken(err.message, clientSecret));
    process.exitCode = 1;
    done(500, '토큰 발급 실패. 터미널을 확인하세요.');
  }
});

try {
  const url = authorizeUrl({ clientId, redirectUri, state });
  server.listen(Number(redirect.port) || 80, redirect.hostname, () => {
    console.log('브라우저에서 아래 주소를 열어 BAND 로그인·권한 동의를 진행하세요:\n');
    console.log(url.toString());
    console.log(`\n${redirectUri} 로 돌아오기를 기다리는 중…`);
  });
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
