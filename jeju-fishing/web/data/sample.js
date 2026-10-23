// 샘플 데이터 — 실제 선사·밴드가 아닌 가상의 예시입니다.
// 실제 BAND 연동(PRD 4.2 검증) 전 화면·추출 규칙 검증용. 게시 시각은 현재 기준 상대값으로 생성한다.

const HOUR = 3600 * 1000;
const now = Date.now();
const ago = (days, hours = 0) => now - days * 24 * HOUR - hours * HOUR;
const md = (ms) => {
  const d = new Date(ms + 9 * HOUR);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

export const SAMPLE_NOTICE = '샘플 데이터입니다. 실제 선사·조황이 아닙니다.';

export const VESSELS = [
  { id: 'v1', name: '샘플1호', company: '샘플낚시 A', port: '도두항', phone: '010-0000-0001', reservationUrl: 'https://example.com/reserve/a', bandUrl: 'https://band.us/', mainSpecies: ['한치', '갈치'], mainMethods: ['이카메탈', '오모리그', '텐빈'] },
  { id: 'v2', name: '샘플2호', company: '샘플낚시 B', port: '한림항', phone: '010-0000-0002', reservationUrl: null, bandUrl: 'https://band.us/', mainSpecies: ['갈치'], mainMethods: ['외줄', '텐빈'] },
  { id: 'v3', name: '샘플3호', company: '샘플피싱 C', port: '서귀포항', phone: '010-0000-0003', reservationUrl: 'https://example.com/reserve/c', bandUrl: 'https://band.us/', mainSpecies: ['참돔'], mainMethods: ['타이라바', '텐야'] },
  { id: 'v4', name: '샘플4호', company: '샘플피싱 D', port: '모슬포항', phone: '010-0000-0004', reservationUrl: null, bandUrl: 'https://band.us/', mainSpecies: ['한치', '참돔'], mainMethods: ['이카메탈', '타이라바'] },
  { id: 'v5', name: '샘플5호', company: '샘플선상 E', port: '성산항', phone: null, reservationUrl: 'https://example.com/reserve/e', bandUrl: 'https://band.us/', mainSpecies: ['갈치', '기타'], mainMethods: ['텐빈', '지깅'] },
];

// 원문(raw). 실제 운영에서는 서버 동기화 결과의 공개용 데이터로 대체된다.
export const POSTS = [
  { id: 'p1', vesselId: 'v1', port: '도두항', createdAt: ago(0, 3), photo: 'squid',
    content: `${md(ago(1))} 야간 한치 조황\n이카메탈·오모리그 병행, 인당 30~50수\n장원 87수 하셨습니다.\n#제주한치 #도두항 #갈치` },
  { id: 'p2', vesselId: 'v2', port: '한림항', createdAt: ago(0, 6), photo: 'hairtail',
    content: `어제 갈치 텐빈 출조\n씨알 3~4지 위주, 1인 평균 25수 정도 나왔습니다\n선박 전체 210마리` },
  { id: 'p3', vesselId: 'v3', port: '서귀포항', createdAt: ago(1, 2), photo: 'seabream',
    content: `${md(ago(2))} 타이라바 참돔 조황입니다\n참돔 최고 4.2kg, 총 9마리\n동출하신 분들 수고하셨습니다` },
  { id: 'p4', vesselId: 'v4', port: '모슬포항', createdAt: ago(1, 5), photo: null,
    content: `${md(ago(1))} 풍랑주의보로 출항 취소합니다. 예약자분들께 개별 연락드렸습니다.` },
  { id: 'p5', vesselId: 'v1', port: '도두항', createdAt: ago(2, 1), photo: null,
    content: `${md(ago(-5))} 한치 야간 자리 있습니다. 선착순 예약 받습니다 #한치 #이카메탈` },
  { id: 'p6', vesselId: 'v5', port: '성산항', createdAt: ago(2, 4), photo: 'hairtail',
    content: `오늘 갈치 텐빈, 인당 15~20수\n고등어·방어도 섞여 나왔습니다\n내일도 자리 남았습니다` },
  { id: 'p7', vesselId: 'v4', port: '모슬포항', createdAt: ago(3, 2), photo: 'squid',
    content: '👍🦑' },
  { id: 'p8', vesselId: 'v3', port: '서귀포항', createdAt: ago(4, 3), photo: 'seabream',
    content: `${md(ago(4))} 텐야로 참돔, 쏨뱅이 손맛\n참돔 1인 2~3마리` },
  { id: 'p9', vesselId: 'v2', port: '한림항', createdAt: ago(5, 1), photo: null,
    content: '[공지] 승선 시 신분증 지참 부탁드립니다' },
  { id: 'p10', vesselId: 'v5', port: '김녕항', createdAt: ago(6, 2), photo: 'jig',
    content: `${md(ago(6))} 김녕항 임시 출항, 슬로우지깅 부시리·방어 조황\n선박 전체 12마리 #참돔 #타이라바` },
  { id: 'p11', vesselId: 'v1', port: '도두항', createdAt: ago(9, 2), photo: 'squid',
    content: `${md(ago(10))} 한치 이카메탈 개인 최고 64수, 평균 20수` },
  { id: 'p12', vesselId: 'v4', port: '모슬포항', createdAt: ago(12, 2), photo: 'squid',
    content: `${md(ago(12))} 한치 조황 인당 40수 전후 #한치 #오모리그` },
  { id: 'p13', vesselId: 'v2', port: '한림항', createdAt: ago(20, 2), photo: 'hairtail',
    content: `${md(ago(21))} 외줄 갈치 조황 1인 최고 80수` },
];

export const SYNC = {
  lastSuccessAt: ago(0, 1),
  // 기준 시간(분) 이상 경과하면 갱신 지연 안내 (PRD 8.1: 60분 가정)
  staleAfterMinutes: 120,
};
