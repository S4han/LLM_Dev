import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReport,
  extractTripDate,
  extractCatchClaims,
  classifyPost,
  applyOverrides,
} from '../web/lib/extract.js';

// 2026-10-23 09:00 KST
const POSTED = Date.UTC(2026, 9, 23, 0, 0);

test('명시 날짜를 출조일로 우선 사용한다', () => {
  const r = extractTripDate('10월 21일 갈치 조황입니다. 어제는 쉬었어요', POSTED);
  assert.deepEqual(r, { value: '2026-10-21', inferred: false, evidence: '10월 21일' });
});

test('점·슬래시 날짜와 연도 포함 날짜를 인식한다', () => {
  assert.equal(extractTripDate('10/22 출조', POSTED).value, '2026-10-22');
  assert.equal(extractTripDate('2026.10.20 한치', POSTED).value, '2026-10-20');
});

test('무게·시각 숫자를 날짜로 오인하지 않는다', () => {
  assert.equal(extractTripDate('참돔 3.5kg 한 마리', POSTED).value, null);
});

test('상대 날짜는 게시 시각 기준으로 해석하고 추정으로 표시한다', () => {
  const r = extractTripDate('어제 밤 한치 잘 나왔습니다', POSTED);
  assert.equal(r.value, '2026-10-22');
  assert.equal(r.inferred, true);
});

test('게시일 이후 날짜(모집 일정)는 출조일로 쓰지 않는다', () => {
  assert.equal(extractTripDate('10월 30일 자리 있습니다', POSTED).value, null);
});

test('1월 게시물의 12월 날짜는 작년으로 본다', () => {
  const jan = Date.UTC(2027, 0, 2, 0, 0);
  assert.equal(extractTripDate('12월 30일 갈치', jan).value, '2026-12-30');
});

test('날짜 정보가 없으면 미확인(null)', () => {
  assert.deepEqual(extractTripDate('사진 참고하세요', POSTED), { value: null, inferred: false, evidence: null });
});

test('게시물 유형: 조황·모집·혼합·취소·공지·미확인', () => {
  assert.equal(classifyPost('갈치 1인 30수 조황').type, 'catch');
  assert.deepEqual(classifyPost('오늘 한치 50수! 내일 자리 있습니다'), { type: 'catch', mixed: true });
  assert.equal(classifyPost('10월 30일 예약 받습니다 선착순').type, 'recruit');
  assert.equal(classifyPost('풍랑주의보로 출항 취소합니다').type, 'cancel');
  assert.equal(classifyPost('[공지] 승선 명부 작성 안내').type, 'notice');
  assert.equal(classifyPost('좋은 하루 되세요').type, 'unknown');
});

test('해시태그에만 있는 어종은 확정하지 않는다', () => {
  const r = extractReport({ content: '오늘 갈치 1인 20수 조황 #한치 #참돔 #제주낚시', createdAt: POSTED });
  assert.deepEqual(r.species.map((s) => s.key), ['갈치']);
  assert.deepEqual(r.hashtagOnly.species, ['한치', '참돔']);
});

test('복수 어종·방식을 지원한다', () => {
  const r = extractReport({ content: '10/22 타이라바로 참돔, 텐빈으로 갈치 조황', createdAt: POSTED });
  assert.deepEqual(r.species.map((s) => s.key).sort(), ['갈치', '참돔']);
  assert.deepEqual(r.methods.map((m) => m.key).sort(), ['타이라바', '텐빈']);
});

test('조과 수량은 기준(개인·최고·선박)과 함께 원문 주장으로 저장한다', () => {
  const claims = extractCatchClaims('갈치 인당 30~40수\n장원 72수\n배 전체 합계 350마리\n참돔 2.5kg 1마리');
  assert.equal(claims[0].species, '갈치');
  assert.equal(claims[0].basis, 'person');
  assert.equal(claims[0].min, 30);
  assert.equal(claims[0].max, 40);
  assert.equal(claims[1].basis, 'personal_best');
  assert.equal(claims[2].basis, 'boat');
  assert.ok(claims.every((c) => c.status === 'claimed'));
});

test('모집 글에는 조과 주장을 붙이지 않는다', () => {
  const r = extractReport({ content: '10월 30일 예약 받습니다 정원 10명', createdAt: POSTED });
  assert.equal(r.type, 'recruit');
  assert.deepEqual(r.claims, []);
});

test('사진 전용 글은 표시한다', () => {
  assert.equal(extractReport({ content: '👍', createdAt: POSTED }).photoOnly, true);
});

test('관리자 교정값이 자동 추출값보다 우선한다', () => {
  const r = extractReport({ content: '조황', createdAt: POSTED });
  const merged = applyOverrides(r, { tripDate: { value: '2026-10-20', inferred: false, evidence: '관리자 교정' } });
  assert.equal(merged.tripDate.value, '2026-10-20');
  assert.deepEqual(merged.overridden, ['tripDate']);
});

test('소수점 무게를 정수 일부로 잘라 읽지 않는다', () => {
  const [c] = extractCatchClaims('참돔 최고 4.2kg');
  assert.equal(c.min, 4.2);
  assert.equal(c.unit, 'kg');
  assert.equal(c.basis, 'personal_best');
});

test('본문 어종이 하나면 어종 없는 수량 줄에 그 어종을 추정해 붙인다', () => {
  const r = extractReport({ content: '어제 갈치 텐빈 출조\n1인 평균 25수', createdAt: POSTED });
  assert.equal(r.claims[0].species, '갈치');
  assert.equal(r.claims[0].speciesInferred, true);
});
