import {
  extractReport,
  basicSummary,
  speciesGroup,
  toKstDateString,
  METHODS,
  BASIS_LABELS,
  POST_TYPES,
} from './lib/extract.js';
import { VESSELS, POSTS, SYNC, SAMPLE_NOTICE } from './data/sample.js';

const SPECIES_TABS = ['전체', '한치', '갈치', '참돔', '기타'];
const DAY_OPTIONS = [
  { value: '', label: '전체 기간' },
  { value: '1', label: '오늘' },
  { value: '3', label: '최근 3일' },
  { value: '7', label: '최근 7일' },
  { value: '30', label: '최근 30일' },
];
const FAV_KEY = 'jeju-fishing:favorites';

const app = document.getElementById('app');
const sheet = document.getElementById('filter-sheet');
const filterBody = document.getElementById('filter-body');

// ---------- 데이터 준비 ----------
// 실제 운영에서는 서버가 저장해 둔 공개용 결과를 조회한다(이용자마다 BAND API를 호출하지 않음).

const vesselById = new Map(VESSELS.map((v) => [v.id, v]));

function buildReports(posts) {
  return posts.map((p) => {
    const ex = extractReport({ content: p.content, createdAt: p.createdAt });
    const species = ex.species.map((s) => s.key);
    return {
      ...p,
      ...ex,
      vessel: vesselById.get(p.vesselId),
      postDate: toKstDateString(p.createdAt),
      speciesKeys: species,
      speciesGroups: [...new Set(species.map(speciesGroup))],
      methodKeys: ex.methods.map((m) => m.key),
      summary: basicSummary(ex),
    };
  });
}

let REPORTS = [];
try {
  REPORTS = buildReports(POSTS);
} catch (err) {
  console.error(err);
}
// 조황 피드에는 실제 조황으로 분류된 글만 노출(FR-004). 그 외는 관리자 검토 대상.
const catchReports = () => REPORTS.filter((r) => r.type === 'catch');
const PORTS = [...new Set(REPORTS.map((r) => r.port))].sort();

// ---------- 유틸 ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  const w = '일월화수목금토'[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${w})`;
}

function fmtDateTime(ms) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(ms);
}

function todayKst() {
  return toKstDateString(Date.now());
}

function shiftDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadFavorites() {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
let favorites = new Set(loadFavorites());
function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등): 현재 세션 동안만 유지
  }
}

// ---------- 라우팅 & 필터 상태(URL에 보존 → 뒤로 가기 시 복원, FR-007) ----------

function parseHash() {
  const raw = location.hash.slice(1) || '/feed';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'feed', id: parts[1], params: new URLSearchParams(query) };
}

function readFilters(params) {
  return {
    q: params.get('q') || '',
    species: SPECIES_TABS.includes(params.get('species')) ? params.get('species') : '전체',
    days: params.get('days') || '',
    methods: params.getAll('method'),
    ports: params.getAll('port'),
    vessels: params.getAll('vessel'),
  };
}

function filtersToQuery(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.species !== '전체') p.set('species', f.species);
  if (f.days) p.set('days', f.days);
  f.methods.forEach((m) => p.append('method', m));
  f.ports.forEach((m) => p.append('port', m));
  f.vessels.forEach((m) => p.append('vessel', m));
  const s = p.toString();
  return s ? `?${s}` : '';
}

function navigateFeed(f) {
  location.hash = `#/feed${filtersToQuery(f)}`;
}

function applyFilters(list, f) {
  const today = todayKst();
  const from = f.days ? shiftDays(today, -(Number(f.days) - 1)) : null;
  const q = f.q.trim();
  return list.filter((r) => {
    if (f.species !== '전체' && !r.speciesGroups.includes(f.species)) return false;
    if (f.methods.length && !f.methods.some((m) => r.methodKeys.includes(m))) return false;
    if (f.ports.length && !f.ports.includes(r.port)) return false;
    if (f.vessels.length && !f.vessels.includes(r.vesselId)) return false;
    if (from && (r.tripDate.value ?? r.postDate) < from) return false;
    if (q && !`${r.vessel.name} ${r.vessel.company} ${r.content}`.includes(q)) return false;
    return true;
  });
}

// 확인된 출조일 최신순, 출조일 미확인은 별도 묶음에서 게시일순(PRD 5.1)
function splitAndSort(list) {
  const dated = list
    .filter((r) => r.tripDate.value)
    .sort((a, b) => b.tripDate.value.localeCompare(a.tripDate.value) || b.createdAt - a.createdAt);
  const undated = list.filter((r) => !r.tripDate.value).sort((a, b) => b.createdAt - a.createdAt);
  return { dated, undated };
}

// ---------- 스크롤 위치 복원 ----------

let currentKey = location.hash;
function saveScroll() {
  try {
    sessionStorage.setItem(`scroll:${currentKey}`, String(window.scrollY));
  } catch {}
}
function restoreScroll() {
  let y = 0;
  try {
    y = Number(sessionStorage.getItem(`scroll:${location.hash}`) || 0);
  } catch {}
  window.scrollTo(0, y);
}

// ---------- 공통 조각 ----------

const PHOTO_ART = {
  squid: { bg: '#0d3b52', fg: '#9fd8ef', label: '한치 사진' },
  hairtail: { bg: '#1d2b3a', fg: '#d6dee6', label: '갈치 사진' },
  seabream: { bg: '#3d1f24', fg: '#ff9a8b', label: '참돔 사진' },
  jig: { bg: '#203a2a', fg: '#a8e0b5', label: '지깅 조과 사진' },
};

// 사진 이용이 허용되지 않았거나 없으면 기본 이미지(PRD 5.2). 프로토타입은 사진 대신 일러스트를 쓴다.
function photoSvg(r, cls) {
  const art = PHOTO_ART[r.photo];
  if (!art) {
    return `<svg class="${cls}" viewBox="0 0 160 90" role="img" aria-label="사진 없음(기본 이미지)">
      <rect width="160" height="90" fill="var(--chip)"/><text x="80" y="50" text-anchor="middle" font-size="10" fill="var(--muted)">사진 없음</text></svg>`;
  }
  return `<svg class="${cls}" viewBox="0 0 160 90" role="img" aria-label="${esc(r.vessel.name)} ${art.label}(샘플 이미지)">
    <rect width="160" height="90" fill="${art.bg}"/>
    <path d="M30 50 Q70 20 120 45 L138 34 L134 50 L138 64 L120 55 Q70 80 30 50Z" fill="${art.fg}" opacity=".85"/>
    <circle cx="48" cy="47" r="3" fill="${art.bg}"/>
    <text x="8" y="84" font-size="8" fill="${art.fg}" opacity=".7">SAMPLE</text></svg>`;
}

function tripDateLabel(r) {
  if (!r.tripDate.value) return `<span class="badge warn">출조일 미확인</span>`;
  return `출조 ${fmtDate(r.tripDate.value)}${r.tripDate.inferred ? '<span class="badge warn">추정</span>' : ''}`;
}

function chips(r) {
  return [
    ...r.speciesKeys.map((s) => `<span class="chip">${esc(s)}</span>`),
    ...r.methodKeys.map((m) => `<span class="chip outline">${esc(m)}</span>`),
  ].join('');
}

function reportCard(r) {
  return `<li class="card"><a href="#/report/${esc(r.id)}">
    ${photoSvg(r, 'thumb')}
    <div class="body">
      <h3>${esc(r.vessel.name)} <span class="meta">· ${esc(r.port)}</span></h3>
      <div class="meta">${tripDateLabel(r)} · 게시 ${fmtDate(r.postDate)}</div>
      <div class="chips">${chips(r)}</div>
      <p class="summary">${esc(r.summary)}</p>
      <div class="meta">출처: 네이버 밴드 · ${esc(r.vessel.company)}</div>
    </div></a></li>`;
}

function syncBanner() {
  const minutes = (Date.now() - SYNC.lastSuccessAt) / 60000;
  const stale = minutes > SYNC.staleAfterMinutes;
  return `<p class="notice">마지막 정상 동기화 ${fmtDateTime(SYNC.lastSuccessAt)} · ${esc(SAMPLE_NOTICE)}</p>
    ${stale ? '<p class="banner" role="status">갱신이 지연되고 있습니다. 최신 조황이 반영되지 않았을 수 있습니다.</p>' : ''}`;
}

function favButton(vesselId) {
  const on = favorites.has(vesselId);
  const name = vesselById.get(vesselId)?.name ?? '';
  return `<button class="fav-btn" data-action="fav" data-id="${esc(vesselId)}" aria-pressed="${on}"
    aria-label="${esc(name)} 관심 선사 ${on ? '해제' : '추가'}">${on ? '★' : '☆'}</button>`;
}

// ---------- 화면 ----------

function renderFeed(params) {
  const f = readFilters(params);
  const filtered = applyFilters(catchReports(), f);
  const { dated, undated } = splitAndSort(filtered);
  const applied = [
    f.days && DAY_OPTIONS.find((d) => d.value === f.days)?.label,
    ...f.methods,
    ...f.ports,
    ...f.vessels.map((id) => vesselById.get(id)?.name),
    f.q && `“${f.q}”`,
  ].filter(Boolean);
  const anyFilter = applied.length || f.species !== '전체';

  app.innerHTML = `
    <form class="search" role="search" data-form="search">
      <label class="sr-only" for="q">선박명·검색어</label>
      <input id="q" name="q" type="search" placeholder="선박명·검색어" value="${esc(f.q)}" enterkeyhint="search">
      <button class="btn" type="submit">검색</button>
    </form>
    <div class="segmented" role="group" aria-label="어종">
      ${SPECIES_TABS.map((s) => `<button type="button" data-action="species" data-value="${s}" aria-pressed="${f.species === s}">${s}</button>`).join('')}
    </div>
    <div class="toolbar">
      <div class="applied">
        ${applied.map((a) => `<span class="pill">${esc(a)}</span>`).join('') || '<span class="meta">출조일 최신순</span>'}
        ${anyFilter ? '<button class="link" data-action="reset">초기화</button>' : ''}
      </div>
      <button class="btn small" data-action="open-filter" aria-haspopup="dialog">필터${applied.length ? ` ${applied.length}` : ''}</button>
    </div>
    ${syncBanner()}
    ${
      REPORTS.length === 0
        ? '<p class="state">조황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>'
        : filtered.length === 0
          ? `<p class="state">조건에 맞는 조황이 없습니다.<br><span class="meta">게시글이 없다고 조황이 나쁘거나 출항이 없었다는 뜻은 아닙니다.</span></p>`
          : `<p class="meta">${filtered.length}건</p>
             <ul class="cards">${dated.map(reportCard).join('')}</ul>
             ${undated.length ? `<h2 class="section-title">출조일 미확인 · 게시일순</h2><ul class="cards">${undated.map(reportCard).join('')}</ul>` : ''}`
    }`;
}

function renderReport(id) {
  const r = REPORTS.find((x) => x.id === id && x.type === 'catch');
  if (!r) {
    app.innerHTML = `<p class="state">조황을 찾을 수 없습니다. 삭제되었거나 비공개로 전환되었을 수 있습니다.</p>
      <p style="text-align:center"><a class="btn" href="#/feed">조황 목록</a></p>`;
    return;
  }
  const v = r.vessel;
  const claimRows = r.claims
    .map((c) => {
      const qty = c.min === c.max ? `${c.min}` : `${c.min}~${c.max}`;
      return `<tr><td>${esc(c.species ?? '불명')}${c.speciesInferred ? ' <span class="meta">(추정)</span>' : ''}</td><td>${qty}${c.unit === 'kg' ? 'kg' : '수'}</td><td>${BASIS_LABELS[c.basis]}</td><td><span class="meta">${esc(c.evidence)}</span></td></tr>`;
    })
    .join('');
  const tagOnly = [...r.hashtagOnly.species, ...r.hashtagOnly.methods];

  app.innerHTML = `<article class="detail">
    <p><a href="javascript:history.back()" data-action="back">← 뒤로</a></p>
    ${photoSvg(r, 'hero')}
    <h1>${esc(v.name)} <span class="meta">${esc(v.company)}</span></h1>
    <dl class="kv">
      <dt>출항 항구</dt><dd>${esc(r.port)}${r.port !== v.port ? ` <span class="meta">(당시 항구, 기본 ${esc(v.port)})</span>` : ''}</dd>
      <dt>출조일</dt><dd>${r.tripDate.value ? `${fmtDate(r.tripDate.value)}${r.tripDate.inferred ? ` <span class="badge warn">추정: “${esc(r.tripDate.evidence)}” 기준</span>` : ''}` : '<span class="badge warn">미확인</span>'}</dd>
      <dt>게시일</dt><dd>${fmtDateTime(r.createdAt)}</dd>
      <dt>어종·방식</dt><dd><div class="chips" style="margin:0">${chips(r) || '<span class="meta">미확인</span>'}</div></dd>
    </dl>

    <section class="panel">
      <h2>조황 요약 <span class="badge">자동 요약</span></h2>
      <p style="margin:0">${esc(r.summary)}</p>
      ${r.mixed ? '<p class="notice">이 글에는 예약 모집 내용도 포함되어 있습니다.</p>' : ''}
    </section>

    <section class="panel">
      <h2>조과 수치 <span class="meta">(원문 주장 · 실측 검증값 아님)</span></h2>
      ${claimRows ? `<table class="claims"><thead><tr><th>어종</th><th>수량</th><th>기준</th><th>근거</th></tr></thead><tbody>${claimRows}</tbody></table>
        <p class="notice">개인 최고와 선박 전체 수량은 서로 비교할 수 있는 지표가 아닙니다.</p>` : '<p class="meta" style="margin:0">원문에 수치가 없거나 확인되지 않았습니다.</p>'}
    </section>

    <section class="panel">
      <h2>원문 발췌</h2>
      <blockquote>${esc(r.content)}</blockquote>
      ${tagOnly.length ? `<p class="notice">해시태그에만 있는 값(${esc(tagOnly.join(', '))})은 본문 근거가 없어 조황으로 확정하지 않았습니다.</p>` : ''}
    </section>

    <div class="actions">
      <a class="btn primary wide" href="${esc(v.bandUrl)}" target="_blank" rel="noopener noreferrer">원문에서 확인 (네이버 밴드)</a>
      <p class="notice wide" style="margin-top:-4px">원문 열람에는 밴드 가입이나 로그인이 필요할 수 있습니다.</p>
      <a class="btn" href="#/vessel/${esc(v.id)}">선사 보기</a>
      ${v.reservationUrl ? `<a class="btn" href="${esc(v.reservationUrl)}" target="_blank" rel="noopener noreferrer">예약 채널</a>` : '<span class="btn" aria-disabled="true" style="opacity:.5">예약 채널 없음</span>'}
      ${v.phone ? `<a class="btn wide" href="tel:${esc(v.phone)}">전화 문의 ${esc(v.phone)}</a>` : ''}
      <a class="btn ghost wide" href="mailto:report@example.com?subject=${encodeURIComponent(`[정보 오류·삭제 요청] ${r.id}`)}">정보 오류·삭제 요청</a>
    </div>
  </article>`;
}

function renderVessels() {
  app.innerHTML = `<h1 style="font-size:18px">참여 선사</h1>${syncBanner()}
    <ul class="vessel-list">${VESSELS.map((v) => {
      const latest = splitAndSort(catchReports().filter((r) => r.vesselId === v.id)).dated[0];
      return `<li class="vessel-item">
        <a class="main" href="#/vessel/${esc(v.id)}">
          <strong>${esc(v.name)}</strong> <span class="meta">${esc(v.company)} · ${esc(v.port)}</span>
          <div class="chips">${v.mainSpecies.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}${v.mainMethods.map((m) => `<span class="chip outline">${esc(m)}</span>`).join('')}</div>
          <div class="meta">${latest ? `최근 조황 ${fmtDate(latest.tripDate.value)}` : '최근 조황 없음'}</div>
        </a>${favButton(v.id)}</li>`;
    }).join('')}</ul>`;
}

function renderVessel(id) {
  const v = vesselById.get(id);
  if (!v) {
    app.innerHTML = '<p class="state">선사를 찾을 수 없습니다.</p>';
    return;
  }
  const { dated, undated } = splitAndSort(catchReports().filter((r) => r.vesselId === id));
  app.innerHTML = `<article class="detail">
    <p><a href="javascript:history.back()">← 뒤로</a></p>
    <div style="display:flex;align-items:center;gap:8px">
      <h1 style="flex:1">${esc(v.name)} <span class="meta">${esc(v.company)}</span></h1>${favButton(v.id)}
    </div>
    <dl class="kv">
      <dt>기본 항구</dt><dd>${esc(v.port)}</dd>
      <dt>주요 어종</dt><dd>${esc(v.mainSpecies.join(', '))}</dd>
      <dt>주요 방식</dt><dd>${esc(v.mainMethods.join(', '))}</dd>
      <dt>연락처</dt><dd>${v.phone ? `<a href="tel:${esc(v.phone)}">${esc(v.phone)}</a>` : '<span class="meta">확인된 연락처 없음</span>'}</dd>
    </dl>
    <div class="actions" style="margin-top:12px">
      <a class="btn" href="${esc(v.bandUrl)}" target="_blank" rel="noopener noreferrer">공식 밴드</a>
      ${v.reservationUrl ? `<a class="btn" href="${esc(v.reservationUrl)}" target="_blank" rel="noopener noreferrer">예약 채널</a>` : '<span class="btn" aria-disabled="true" style="opacity:.5">예약 채널 없음</span>'}
    </div>
    <p class="notice">예약 가능 여부·잔여석은 선사에 직접 확인하세요.</p>
    <h2 class="section-title">최근 조황</h2>
    ${dated.length + undated.length ? `<ul class="cards">${[...dated, ...undated].map(reportCard).join('')}</ul>` : '<p class="state">공개된 조황이 없습니다.</p>'}
  </article>`;
}

function renderFavorites() {
  const ids = [...favorites].filter((id) => vesselById.has(id));
  if (!ids.length) {
    app.innerHTML = `<h1 style="font-size:18px">관심 선사</h1>
      <p class="state">관심 선사가 없습니다.<br>선사 화면에서 ☆를 눌러 추가하세요.</p>
      <p style="text-align:center"><a class="btn" href="#/vessels">선사 둘러보기</a></p>
      <p class="notice">관심 목록은 이 브라우저에만 저장됩니다.</p>`;
    return;
  }
  const { dated, undated } = splitAndSort(catchReports().filter((r) => ids.includes(r.vesselId)));
  app.innerHTML = `<h1 style="font-size:18px">관심 선사</h1>
    <div class="chips">${ids.map((id) => `<a class="chip" href="#/vessel/${esc(id)}">${esc(vesselById.get(id).name)}</a>`).join('')}</div>
    <p class="notice">관심 목록은 이 브라우저에만 저장됩니다.</p>
    <h2 class="section-title">관심 선사의 최근 조황</h2>
    ${dated.length + undated.length ? `<ul class="cards">${[...dated, ...undated].map(reportCard).join('')}</ul>` : '<p class="state">관심 선사의 공개 조황이 없습니다.</p>'}`;
}

// ---------- 필터 시트 ----------

function openFilterSheet() {
  const f = readFilters(parseHash().params);
  const group = (legend, name, options, selected, multi = true) => `
    <fieldset><legend>${legend}</legend><div class="chip-group">
      ${options.map((o) => `<button type="button" class="chip-toggle" data-name="${name}" data-value="${esc(o.value)}" data-multi="${multi}"
        aria-pressed="${multi ? selected.includes(o.value) : selected === o.value}">${esc(o.label)}</button>`).join('')}
    </div></fieldset>`;
  filterBody.innerHTML =
    group('출조일', 'days', DAY_OPTIONS, f.days, false) +
    group('낚시 방식', 'method', METHODS.map((m) => ({ value: m.key, label: m.key })), f.methods) +
    group('출항 항구', 'port', PORTS.map((p) => ({ value: p, label: p })), f.ports) +
    group('선사', 'vessel', VESSELS.map((v) => ({ value: v.id, label: v.name })), f.vessels);
  sheet.showModal();
}

function readSheet() {
  const pick = (name) =>
    [...filterBody.querySelectorAll(`[data-name="${name}"][aria-pressed="true"]`)].map((b) => b.dataset.value);
  return { days: pick('days')[0] || '', methods: pick('method'), ports: pick('port'), vessels: pick('vessel') };
}

filterBody.addEventListener('click', (e) => {
  const b = e.target.closest('.chip-toggle');
  if (!b) return;
  if (b.dataset.multi === 'false') {
    filterBody.querySelectorAll(`[data-name="${b.dataset.name}"]`).forEach((x) => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
  } else {
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  }
});

document.getElementById('filter-form').addEventListener('submit', () => {
  const f = readFilters(parseHash().params);
  navigateFeed({ ...f, ...readSheet() });
});

sheet.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'filter-close' || e.target === sheet) sheet.close();
  if (action === 'filter-reset') {
    filterBody.querySelectorAll('.chip-toggle').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    filterBody.querySelector('[data-name="days"][data-value=""]')?.setAttribute('aria-pressed', 'true');
  }
});

// ---------- 이벤트 ----------

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const f = readFilters(parseHash().params);
  switch (el.dataset.action) {
    case 'species':
      navigateFeed({ ...f, species: el.dataset.value });
      break;
    case 'reset':
      navigateFeed(readFilters(new URLSearchParams()));
      break;
    case 'open-filter':
      openFilterSheet();
      break;
    case 'fav':
      toggleFavorite(el.dataset.id);
      render({ keepScroll: true });
      break;
    case 'back':
      e.preventDefault();
      history.length > 1 ? history.back() : (location.hash = '#/feed');
      break;
  }
});

app.addEventListener('submit', (e) => {
  if (e.target.dataset.form !== 'search') return;
  e.preventDefault();
  const f = readFilters(parseHash().params);
  navigateFeed({ ...f, q: new FormData(e.target).get('q').trim() });
});

function render({ keepScroll = false } = {}) {
  const { name, id, params } = parseHash();
  const tab = { feed: 'feed', report: 'feed', vessels: 'vessels', vessel: 'vessels', favorites: 'favorites' }[name] || 'feed';
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.toggleAttribute('aria-current', a.dataset.tab === tab);
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
  });
  const y = window.scrollY;
  if (name === 'report') renderReport(id);
  else if (name === 'vessels') renderVessels();
  else if (name === 'vessel') renderVessel(id);
  else if (name === 'favorites') renderFavorites();
  else renderFeed(params);
  if (keepScroll) window.scrollTo(0, y);
  else restoreScroll();
  currentKey = location.hash;
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('hashchange', () => render());
window.addEventListener('scroll', () => saveScroll(), { passive: true });
render();

// 디버그·검토용: 피드에 노출되지 않는 글의 분류 결과(관리자 화면 대체)
window.__reviewQueue = () =>
  REPORTS.filter((r) => r.type !== 'catch').map((r) => ({ id: r.id, type: POST_TYPES[r.type], photoOnly: r.photoOnly, content: r.content }));
