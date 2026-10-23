# BAND 연동 1단계 검증 가이드

PRD 4.2·11.1·12(1단계)를 실제 계정으로 확인하는 절차입니다. 운영자 본인 토큰으로 **한 개 밴드**에서 시작합니다.

> ⚠️ 아래 메뉴명·엔드포인트·응답 필드는 BAND 개발자 문서(developers.band.us)를 기준으로 작성했지만, 이 저장소에서는 아직 실제 호출로 확인하지 않았습니다. 화면이나 응답이 다르면 이 문서를 실제 결과에 맞게 고쳐 주세요.

## 0. 준비물

- 네이버 밴드 계정(운영자 본인). 검증할 밴드에 가입되어 있어야 합니다.
- 협조 선사의 동의: 어떤 작성자의 글을, 본문·사진·요약 중 어디까지 외부에 보여줄지(PRD 4.1).
- Node 20 이상. 외부 패키지는 필요 없습니다.

## 1. 서비스 등록 (개발자 센터)

1. https://developers.band.us 에 밴드 계정으로 로그인합니다.
2. **내 서비스 → 서비스 등록**에서 서비스 이름·설명을 입력합니다.
3. **Redirect URI**에 `http://localhost:8787/callback`을 등록합니다.
   - localhost가 허용되지 않으면, 받을 수 있는 다른 주소를 등록하고 `.env`의 `BAND_REDIRECT_URI`를 같게 맞춥니다.
4. 발급된 **Client ID**와 **Client Secret**을 확인합니다.

## 2. 접근 토큰 발급

```bash
cd jeju-fishing
cp .env.example .env        # BAND_CLIENT_ID, BAND_CLIENT_SECRET 입력
npm run band:auth           # 출력된 주소를 브라우저에서 열고 BAND 로그인·동의
```

동의를 마치면 브라우저가 `localhost:8787/callback`으로 돌아오고, 토큰이 `.env`의 `BAND_ACCESS_TOKEN`에 저장됩니다. 저장할 때 파일 권한은 600으로 바뀌고, 토큰은 화면에 표시되지 않습니다.

- 개발자 센터의 내 서비스 화면에서 본인 계정 토큰을 직접 받을 수 있다면, `.env`의 `BAND_ACCESS_TOKEN`에 붙여 넣어도 됩니다.
- 터미널에 출력되는 만료 시간(`expires_in`)과 `refresh_token` 유무를 기록해 두세요. 검증 항목 5에 해당합니다.

## 3. 응답 구조 확인

```bash
npm run band:check                       # 접근 가능한 밴드 목록 → band_key 확인
npm run band:check -- --band <band_key>  # 게시글 2페이지 + 개별 글 1건의 필드표
```

화면에는 다음 내용이 출력됩니다.

| 출력 | 확인할 것 |
|---|---|
| 밴드 목록 | 검증할 밴드의 `band_key` |
| 게시글 목록 필드표 | `post_key`, `content`, `created_at`, `author.user_key`, `photos[].url`/`photo_key` 등 코드가 가정한 필드가 실제로 있는지 |
| paging 필드 | `next_params`로 다음 페이지가 이어지는지 |
| 정렬 확인 | `outOfCreatedOrder` > 0 이면 게시 시각 순이 아님(문서상 수정일 순) |
| 작성자별 글 수 | 공개를 허락받은 작성자의 `user_key` |
| 개별 글 필드표 | 원문으로 이동할 URL 필드가 있는지(없으면 원문 링크를 어떻게 만들지 정해야 함) |

결과는 `data/band-check.json`에 저장되며 이 파일은 Git에 올라가지 않습니다. 필드 경로·타입·개수만 저장하고, 본문·이름·URL·토큰 같은 실제 값은 넣지 않습니다.

## 4. 동기화 시험

```bash
cp data/sources.example.json data/sources.json
# bandKey, vesselId, allowedAuthorKeys(3단계에서 확인한 user_key), consent 입력
npm run sync
```

수집된 글은 `data/store.json`에 `visibility: "review"` 상태로 저장되므로, 승인하기 전에는 공개되지 않습니다.
같은 명령을 다시 실행했을 때 `unchanged`가 늘어나고 새 글이 중복으로 생기지 않는지 확인합니다.

## 5. 검증 체크리스트 (PRD 4.2)

| # | 항목 | 확인 방법 | 결과 |
|---|---|---|---|
| 1 | 앱 등록·읽기 권한 발급 | 1~2단계 | |
| 2 | 밴드 공개 형태·계정 역할별 조회 범위 | 비공개/공개 밴드, 일반 회원/리더 계정으로 `band:check` 비교 | |
| 3 | 사진 URL 표시 가능 범위·유효 기간 | `photos[].url`을 시간차를 두고 열어 보기 | |
| 4 | 원문 URL 확보·모바일 이동 | 개별 글 필드표, 모바일에서 링크 열기 | |
| 5 | 호출 한도·토큰 만료·철회 | 토큰 발급 결과, 개발자 센터 안내, 연결 해제 후 `band:check` → `auth` 오류 확인 | |
| 6 | 수정·삭제·탈퇴 시 응답 | 테스트 글 수정 → `sync`가 `updated`로 집계하는지, 삭제 후 개별 글 조회 응답 | |
| 7 | 저장·외부 공개·자동 분석 조건 | 개발자 센터 이용약관·정책 확인 | |

확인이 끝나면 이 표와 `data/band-check.json`의 필드표를 PRD 4장에 반영하고, 운영 스택(동기화 실행 위치, 저장소)을 정합니다(PRD 12).
