// 원문·조황 저장 로직. 프로토타입은 JSON 파일을 쓰고, 운영 저장소는 1단계 검증 후 정한다.
import { createHash } from 'node:crypto';
import { extractReport, applyOverrides } from '../web/lib/extract.js';

export function contentHash(post) {
  const photos = (post.photos ?? []).map((p) => p.photo_key ?? p.url).join(',');
  return createHash('sha256').update(`${post.content ?? ''}\n${photos}`).digest('hex');
}

// 출처 연결의 허용 작성자인지 확인(FR-001). 미승인 출처·작성자는 공개하지 않는다.
export function isAllowedAuthor(source, post) {
  return Boolean(source.active && source.allowedAuthorKeys?.includes(post.author?.user_key));
}

/**
 * 동기화로 가져온 원문을 저장소에 반영한다.
 * - 같은 band_key + post_key는 새로 만들지 않고 갱신(FR-003, FR-011)
 * - 수정 시각 필드를 가정하지 않고 내용 해시로 변경 감지(PRD 8.1)
 * - 원문이 바뀐 경우에만 재추출하고, 관리자 교정값은 유지(FR-013)
 * - 댓글·회원 프로필은 저장하지 않는다(PRD 7.1)
 */
export function upsertPosts(store, source, posts, nowMs = Date.now()) {
  const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const post of posts) {
    if (!isAllowedAuthor(source, post)) {
      stats.skipped++;
      continue;
    }
    const id = `${source.bandKey}:${post.post_key}`;
    const hash = contentHash(post);
    const prev = store.posts[id];
    if (prev && prev.hash === hash) {
      prev.lastSeenAt = nowMs;
      stats.unchanged++;
      continue;
    }
    const extracted = extractReport({ content: post.content, createdAt: post.created_at });
    store.posts[id] = {
      id,
      bandKey: source.bandKey,
      postKey: post.post_key,
      vesselId: source.vesselId,
      content: post.content,
      createdAt: post.created_at,
      photos: (post.photos ?? []).map((p) => ({ url: p.url, width: p.width, height: p.height })),
      hash,
      firstSeenAt: prev?.firstSeenAt ?? nowMs,
      lastSeenAt: nowMs,
      changedAt: prev ? nowMs : null,
      overrides: prev?.overrides ?? null,
      // 자동 분류 결과는 관리자 승인 전까지 비공개(검토 대기)
      visibility: prev?.visibility ?? 'review',
      report: applyOverrides(extracted, prev?.overrides),
    };
    prev ? stats.updated++ : stats.created++;
  }
  return stats;
}

// 삭제가 명확히 확인된 경우에만 비공개. 인증 오류·일시 장애는 삭제로 처리하지 않는다(PRD 8.2).
export function markDeleted(store, id, nowMs = Date.now()) {
  const p = store.posts[id];
  if (!p) return;
  p.visibility = 'deleted';
  p.deletedAt = nowMs;
}

// 공개 동의 철회: 신규 수집 중단 + 기존 공개 자료 숨김
export function revokeSource(store, bandKey, nowMs = Date.now()) {
  const source = store.sources.find((s) => s.bandKey === bandKey);
  if (source) {
    source.active = false;
    source.revokedAt = nowMs;
  }
  for (const p of Object.values(store.posts)) {
    if (p.bandKey === bandKey && p.visibility !== 'deleted') p.visibility = 'hidden';
  }
}

// 이용자 화면에 내려줄 공개용 데이터. 원문 데이터와 분리한다.
export function publicReports(store) {
  return Object.values(store.posts)
    .filter((p) => p.visibility === 'public' && p.report.type === 'catch')
    .map((p) => ({ id: p.id, vesselId: p.vesselId, createdAt: p.createdAt, report: p.report }));
}
