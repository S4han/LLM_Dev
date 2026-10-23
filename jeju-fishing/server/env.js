// .env 파일(git 제외)을 읽어 process.env에 채운다. 이미 설정된 환경 변수가 우선한다.
// Node 20에서도 동작하도록 --env-file 대신 직접 읽는다.
import { readFileSync, existsSync } from 'node:fs';

export const ENV_FILE = new URL('../.env', import.meta.url);

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function loadEnv(file = ENV_FILE) {
  if (!existsSync(file)) return;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
