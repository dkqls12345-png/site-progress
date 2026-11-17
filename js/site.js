(function () {
  const config = window.ABIN_CONFIG;
  const logic = window.AbinLogic;
  const app = document.getElementById('app');
  const ui = {
    id: '',
    site: null,
    raw: '',
    error: '',
    liveError: '',
    checkedAt: null,
    open: new Set(),
    loading: false,
  };
  let requestSerial = 0;
  let timer = 0;

  function readId() {
    const value = new URLSearchParams(window.location.search).get('id') || '';
    return value.trim().toLowerCase();
  }

  function styleOf(position) {
    if (!position) return '';
    return `left:${position.left.toFixed(3)}%;width:${Math.max(position.width, 0.8).toFixed(3)}%`;
  }

  function markerStyle(left) {
    if (left == null) return '';
    return `left:${left.toFixed(3)}%`;
  }

  function dateRange(start, end) {
    if (!start && !end) return '미정';
    return `${logic.formatShortDate(start) || '미정'} – ${logic.formatShortDate(end) || '진행 중'}`;
  }

  function statusClass(status) {
    if (status === '완료') return 'done';
    if (status === '진행중') return 'run';
    return 'wait';
  }

  function headline(processes) {
    if (!processes.length) {
      return { kicker: '지금 이 현장', title: '등록된 공정이 없습니다', detail: '' };
    }
    const active = processes.filter((process) => process.status === '진행중');
    if (active.length) {
      return {
        kicker: '지금 이 현장',
        title: `${active.map((process) => process.name).join(', ')} 진행 중`,
        detail: active.map((process) => {
          const stats = logic.checklistStats(process);
          return `${process.name} 체크 ${stats.done}/${stats.total}`;
        }).join(' · '),
      };
    }
    const counts = logic.statusCounts(processes);
    if (counts['완료'] === processes.length && processes.length) {
      return { kicker: '지금 이 현장', title: '모든 공정을 마쳤습니다', detail: '인수인계 내용을 한번 더 확인해 주세요.' };
    }
    const next = processes.find((process) => process.status === '대기');
    if (counts['완료'] === 0) {
      return { kicker: '지금 이 현장', title: '아직 착공 전입니다', detail: next ? `첫 공정은 ${next.name}입니다.` : '' };
    }
    return {
      kicker: '지금 이 현장',
      title: next ? `다음은 ${next.name}입니다` : '일정을 확인해 주세요',
      detail: `완료 ${counts['완료']} · 대기 ${counts['대기']}`,
    };
  }

  function renderChecklist(process) {
    return (process.checklist || []).map((item) => {
      const meta = [];
      if (item.checked) meta.push(logic.formatKoreanDate(item.checkedAt) || '확인됨');
      if (item.memo) meta.push(item.memo);
      return `<li class="check${item.checked ? ' is-done' : ''}">
        <span class="box" aria-hidden="true"></span>
        <div>
          <p class="check-label">${logic.escapeHtml(item.label)}</p>
          <p class="sr">${item.checked ? '확인됨' : '아직 확인 전'}</p>
          ${meta.length ? `<p class="check-meta">${logic.escapeHtml(meta.join(' · '))}</p>` : ''}
        </div>
      </li>`;
    }).join('');
  }

  function renderPhotos(process) {
    const photos = (process.photos || [])
      .map((url) => logic.safePhotoUrl(url, window.location.href))
      .filter(Boolean);
    if (!photos.length) return '';
    return `<div class="photos">${photos.map((url, index) => `
      <button class="photo" type="button" data-photo="${logic.escapeHtml(url)}">
        <img src="${logic.escapeHtml(url)}" alt="${logic.escapeHtml(process.name)} 사진 ${index + 1}">
      </button>`).join('')}</div>`;
  }

  function renderProcess(process, index, range, todayLeft, today) {
    const planned = logic.barPosition(process.plannedStart, process.plannedEnd, range);
    const actualRange = logic.actualSpan(process, today);
    const actual = actualRange ? logic.barPosition(actualRange.start, actualRange.end, range) : null;
    const stats = logic.checklistStats(process);
    const open = ui.open.has(process.id);
    const delay = logic.delayDays(process, today);
    const slip = logic.startSlipDays(process);
    const notes = [];
    if (delay > 0 && process.status === '완료') notes.push(`예정보다 ${delay}일 늦게 마쳤습니다`);
    if (delay > 0 && process.status === '진행중') notes.push(`예정 종료가 ${delay}일 지났습니다`);
    if (slip > 0) notes.push(`예정 시작보다 ${slip}일 늦게 시작했습니다`);
    const stateClass = process.status === '완료' ? 'is-done' : process.status === '진행중' ? 'is-current is-run' : 'is-wait';
    return `<article class="process card ${stateClass}${open ? ' is-open' : ''}" data-id="${logic.escapeHtml(process.id)}">
      <button class="process-toggle" type="button" data-toggle="${logic.escapeHtml(process.id)}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="process-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="process-name">${logic.escapeHtml(process.name)}</span>
        <span class="pill ${statusClass(process.status)}">${logic.escapeHtml(process.status)}</span>
        <span class="chevron" aria-hidden="true"></span>
      </button>
      <div class="process-meta">
        <p>예정 ${dateRange(process.plannedStart, process.plannedEnd)}</p>
        <p>실제 ${process.actualStart ? dateRange(process.actualStart, process.actualEnd) : '기록 없음'}</p>
        ${notes.length ? `<p class="slip">${logic.escapeHtml(notes.join(' · '))}</p>` : ''}
      </div>
      <div class="track" aria-hidden="true">
        ${planned ? `<span class="bar planned" style="${styleOf(planned)}"></span>` : ''}
        ${actual ? `<span class="bar actual" style="${styleOf(actual)}"></span>` : ''}
        ${todayLeft != null ? `<span class="today-line" style="${markerStyle(todayLeft)}"></span>` : ''}
      </div>
      <p class="check-count">체크 ${stats.done}/${stats.total}</p>
      <div class="process-body"${open ? '' : ' hidden'}>
        ${process.notes ? `<p class="notes">${logic.escapeHtml(process.notes)}</p>` : ''}
        ${renderPhotos(process)}
        <ul class="checks">${renderChecklist(process)}</ul>
      </div>
    </article>`;
  }

  function renderGate(title, body, withForm) {
    app.innerHTML = `<section class="empty card">
      <p class="eyebrow">현장 진행</p>
      <h1>${logic.escapeHtml(title)}</h1>
      <p>${logic.escapeHtml(body)}</p>
      ${withForm ? `<form class="lookup" action="site.html" method="get">
        <label for="site-id">현장 코드</label>
        <div class="lookup-row">
          <input id="site-id" name="id" required autocapitalize="none" autocomplete="off" pattern="[A-Za-z0-9][A-Za-z0-9-]{4,40}">
          <button class="button" type="submit">열기</button>
        </div>
      </form>` : `<p><a class="button secondary" href="index.html">처음 화면으로</a></p>`}
    </section>`;
  }

  function render() {
    const site = ui.site;
    if (!site) return;
    const processes = Array.isArray(site.processes) ? site.processes : [];
    const today = new Date();
    const range = logic.projectRange(site);
    const todayLeft = logic.todayMarker(today, range);
    const percent = logic.overallProgress(processes);
    const counts = logic.statusCounts(processes);
    const ring = 2 * Math.PI * 52;
    const now = headline(processes);
    const manager = site.manager || {};
    document.title = `${site.name || '현장'} — 아빈 인테리어`;
    const scroll = window.scrollY;
    app.innerHTML = `
      ${site.sample ? '<p class="banner" role="status">샘플 데이터입니다. 실제 현장이 아닙니다.</p>' : ''}
      ${ui.liveError ? `<p class="banner" role="status">${logic.escapeHtml(ui.liveError)}</p>` : ''}
      <section class="summary card">
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="진행률 ${percent}%">
            <circle class="ring-track" cx="60" cy="60" r="52"></circle>
            <circle class="ring-value" cx="60" cy="60" r="52" stroke-dasharray="${ring.toFixed(3)}" stroke-dashoffset="${(ring * (1 - percent / 100)).toFixed(3)}"></circle>
          </svg>
          <div class="ring-label"><strong>${percent}%</strong><span>진행률</span></div>
        </div>
        <div>
          <p class="eyebrow">${logic.escapeHtml(site.area || '현장')}</p>
          <h1 class="site-title">${logic.escapeHtml(site.name || '이름 없는 현장')}</h1>
          <div class="chips">
            ${site.customerName ? `<span class="chip">${logic.escapeHtml(site.customerName)}</span>` : ''}
            <span class="chip">완료 ${counts['완료']}</span>
            <span class="chip">진행 ${counts['진행중']}</span>
            <span class="chip">대기 ${counts['대기']}</span>
          </div>
          <p class="counts">진행 중인 공정의 체크리스트를 포함해 계산합니다. 완료 ${counts['완료']} / 전체 ${processes.length} 공정</p>
        </div>
      </section>
      <section class="now card">
        <p class="eyebrow">${logic.escapeHtml(now.kicker)}</p>
        <h2>${logic.escapeHtml(now.title)}</h2>
        ${now.detail ? `<p>${logic.escapeHtml(now.detail)}</p>` : ''}
      </section>
      <dl class="meta-grid">
        <div><dt>착공</dt><dd>${logic.escapeHtml(logic.formatKoreanDate(site.startDate, true) || '미정')}</dd></div>
        <div><dt>준공 예정</dt><dd>${logic.escapeHtml(logic.formatKoreanDate(site.expectedEndDate, true) || '미정')}</dd></div>
        <div><dt>담당</dt><dd>${logic.escapeHtml(manager.name || '아빈 인테리어')}</dd></div>
        <div><dt>연락</dt><dd>${logic.escapeHtml(manager.contact || '담당자에게 문의해 주세요')}</dd></div>
      </dl>
      <div class="section-head">
        <h2>공정 일정</h2>
        <ul class="legend">
          <li><i class="swatch planned"></i>예정</li>
          <li><i class="swatch actual"></i>실제</li>
          <li><i class="swatch today"></i>오늘</li>
        </ul>
      </div>
      <div class="scale card">
        <div class="scale-labels">
          ${logic.monthTicks(range).map((tick) => `<span style="left:${tick.left.toFixed(2)}%">${logic.escapeHtml(tick.label)}</span>`).join('')}
        </div>
        <div class="track" aria-hidden="true">
          ${todayLeft != null ? `<span class="today-line" style="${markerStyle(todayLeft)}"></span>` : ''}
        </div>
      </div>
      ${processes.map((process, index) => renderProcess(process, index, range, todayLeft, today)).join('')}
      <div class="live">
        <div>
          <p>현장 기록 ${logic.escapeHtml(logic.formatDateTime(site.updatedAt) || '시각 없음')}</p>
          <p data-last-check>이 화면 확인 ${logic.escapeHtml(logic.formatClock(ui.checkedAt || new Date()))}</p>
          <p>약 1분마다 자동으로 다시 확인합니다.</p>
        </div>
        <button class="button secondary" type="button" id="refresh-now">지금 다시 확인</button>
      </div>`;
    window.scrollTo(0, scroll);
  }

  function stamp() {
    const node = document.querySelector('[data-last-check]');
    if (node && ui.checkedAt) node.textContent = `이 화면 확인 ${logic.formatClock(ui.checkedAt)}`;
    const button = document.getElementById('refresh-now');
    if (button) {
      button.disabled = ui.loading;
      button.textContent = ui.loading ? '확인 중…' : '지금 다시 확인';
    }
  }

  async function load(options) {
    const quiet = options && options.quiet;
    const id = ui.id;
    if (!logic.ID_RE.test(id)) {
      ui.error = 'missing';
      renderGate('코드를 확인해 주세요', '현장 코드는 영문 소문자, 숫자, 하이픈으로 이루어져 있습니다.', true);
      return;
    }
    const serial = ++requestSerial;
    ui.loading = true;
    if (!quiet) stamp();
    const url = new URL(`data/sites/${encodeURIComponent(id)}.json`, window.location.href);
    url.searchParams.set('t', String(Date.now()));
    try {
      const response = await fetch(url.href, { cache: 'no-store' });
      if (serial !== requestSerial) return;
      if (response.status === 404) {
        ui.site = null;
        ui.raw = '';
        ui.error = 'missing';
        renderGate('현장을 찾을 수 없습니다', '전달받은 링크의 현장 코드를 다시 확인해 주세요.', true);
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const raw = await response.text();
      if (serial !== requestSerial) return;
      const site = JSON.parse(raw);
      if (!site || typeof site !== 'object' || Array.isArray(site)) throw new Error('json');
      ui.error = '';
      ui.checkedAt = new Date();
      ui.liveError = '';
      ui.loading = false;
      if (raw !== ui.raw || !quiet) {
        ui.raw = raw;
        ui.site = site;
        render();
      } else {
        stamp();
      }
    } catch (error) {
      if (serial !== requestSerial) return;
      ui.loading = false;
      ui.checkedAt = new Date();
      ui.error = 'network';
      if (!ui.site) {
        renderGate('기록을 불러오지 못했습니다', '네트워크를 확인한 뒤 잠시 후 다시 열어 주세요.', true);
      } else {
        ui.liveError = '최신 기록을 확인하지 못했습니다. 이전 화면을 유지합니다.';
        render();
      }
    }
  }

  function arm() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden && ui.id && ui.error !== 'missing') load({ quiet: Boolean(ui.site) });
    }, config.refreshMs);
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.getAttribute('data-toggle');
      if (ui.open.has(id)) ui.open.delete(id);
      else ui.open.add(id);
      render();
      const button = app.querySelector(`[data-toggle="${CSS.escape(id)}"]`);
      if (button) button.focus({ preventScroll: true });
      return;
    }
    const photo = event.target.closest('[data-photo]');
    if (photo) {
      const dialog = document.getElementById('lightbox');
      const image = dialog.querySelector('img');
      image.src = photo.getAttribute('data-photo');
      image.alt = photo.querySelector('img') ? photo.querySelector('img').alt : '공정 사진';
      dialog.showModal();
      return;
    }
    if (event.target.closest('#refresh-now')) load({ quiet: true });
  });

  document.getElementById('lightbox').addEventListener('click', (event) => {
    if (event.target.id === 'lightbox') event.target.close();
  });

  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!image || image.tagName !== 'IMG' || !image.closest('.photo')) return;
    const missing = document.createElement('span');
    missing.className = 'photo-missing';
    missing.textContent = '사진을 불러오지 못했습니다';
    image.replaceWith(missing);
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ui.id && ui.error !== 'missing') load({ quiet: Boolean(ui.site) });
  });

  ui.id = readId();
  if (!ui.id) {
    renderGate('현장 코드가 필요합니다', '담당자에게 받은 링크를 열거나, 코드로 현장을 찾아 주세요.', true);
  } else {
    load({ quiet: false });
    arm();
  }
})();
