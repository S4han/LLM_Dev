# 제주 조황 모아보기 (가칭) — MVP 프로토타입

제주 낚시배들이 네이버 밴드에 올린 조황을 어종·낚시 방식·출조일·항구·선사별로 모아 보여주는 모바일 웹입니다.
요구사항은 [docs/PRD.md](docs/PRD.md)(v0.1 초안)에 있습니다.

> ⚠️ 화면의 선사·조황은 모두 **가상의 샘플 데이터**입니다. 실제 BAND API 연동 검증(PRD 4.2, 11.1)은 아직 하지 않았습니다.

## 실행

Node 20 이상이 필요하고, 외부 의존성은 없습니다.

```bash
npm start      # http://localhost:5173 — 모바일 화면(개발자 도구의 기기 모드) 권장
npm test       # 추출 규칙·저장 로직 단위 테스트
```

## 구성

| 경로 | 내용 | PRD |
|---|---|---|
| `web/lib/extract.js` | 규칙 기반 추출: 게시물 유형, 출조일(명시·상대·추정), 어종·방식(해시태그 전용 값 분리), 조과 주장(개인·개인 최고·선박 전체 기준) | 7.2, FR-004~006 |
| `web/app.js` | 조황 피드·필터 시트·상세·선사·관심 화면. 필터는 URL에 저장해 뒤로 가기 때 복원, 관심 선사는 localStorage | 5.1~5.4, FR-007~010, 014 |
| `web/data/sample.js` | 가상 선사 5곳과 원문 13건(조황·모집·혼합·취소·공지·사진 전용·상대 날짜) | 11.2 |
| `server/band/client.js` | BAND Open API 클라이언트(서버 전용), `next_params` 페이지 처리, 인증 오류와 일시 오류 구분, 토큰 마스킹 | 4, FR-002·003 |
| `server/store.js` | 허용 작성자 필터, 원문 ID 기준 갱신, 내용 해시로 변경 감지, 관리자 교정 유지, 삭제·동의 철회, 공개용 데이터 분리 | FR-001·011·012·013 |
| `vercel.json` | Vercel 배포 설정(`web/`만 정적 배포) | - |
| `server/sync.js` | 동기화 1회 실행(스케줄러에서 60분 간격 호출 가정) | 8.1 |

### BAND 동기화 시험 실행 (1단계 검증용)

```bash
cp data/sources.example.json data/sources.json   # band_key, 허용 작성자 user_key, 동의 범위 입력
BAND_ACCESS_TOKEN=... npm run sync                # 결과는 data/store.json (git 제외)
```

수집한 글은 `visibility: "review"` 상태로 저장되어, 관리자가 승인하기 전에는 공개되지 않습니다.
응답 필드명(`result_data.items`, `post_key`, `author.user_key`, `photos` 등)은 공식 문서에 근거한 가정이며, 실제 호출 결과로 확인해야 합니다.

## 아직 구현하지 않은 것

- 관리자 화면(지금은 브라우저 콘솔의 `__reviewQueue()`로 피드 제외 글만 확인할 수 있음)
- 공개용 API(`publicReports`)를 화면에 연결하는 부분. 지금 화면은 샘플 원문을 브라우저에서 바로 추출합니다
- 삭제 재확인 주기, 지수 백오프, AI 요약(선택 기능)
- 기술 스택·배포는 PRD 12에 따라 1단계 검증 후 정합니다

## 배포 (Vercel 또는 Cloudflare Pages)

`web/`은 빌드 단계가 없는 정적 사이트입니다. 서버 코드(`server/`)와 데이터는 배포되지 않습니다.

**Vercel** — Add New → Project → GitHub `s4han/llm_dev` 가져오기 → Root Directory를 `jeju-fishing`로 지정 → Deploy.
나머지 설정은 `vercel.json`에 있습니다. 이후 push할 때마다 자동으로 배포됩니다(main은 프로덕션, 다른 브랜치는 미리보기).

**Cloudflare Pages** — Workers & Pages → Create → Pages → Git 연결 → Root directory `jeju-fishing`, Build command 비움, Build output directory `web`.

**iPad·iPhone** — Safari에서 배포 URL을 열고 공유 → "홈 화면에 추가"를 누르면 앱처럼 전체 화면으로 실행됩니다.
