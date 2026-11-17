(function () {
  const config = window.ABIN_CONFIG;
  const logic = window.AbinLogic;
  const esc = logic.escapeHtml;
  let loadSerial = 0;
  const state = {
    token: localStorage.getItem(config.tokenKey) || '',
    login: '',
    sites: [],
    view: 'list',
    editing: null,
    sha: '',
    pathId: '',
    rawBroken: '',
    message: '',
    error: '',
    busy: false,
    dirty: false,
  };

  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function explainStatus(status, payload) {
    const message = payload && payload.message ? payload.message : '';
    if (status === 401) return '토큰이 맞지 않거나 만료되었습니다.';
    if (status === 403) return '이 저장소의 Contents 권한이 없습니다. Fine-grained 토큰에서 Contents 읽기와 쓰기를 허용해 주세요.';
    if (status === 404) return '파일 또는 저장소를 찾지 못했습니다. 토큰이 site-progress 저장소에만 허용됐는지 확인해 주세요.';
    if (status === 409) return '다른 저장과 겹쳤습니다. 현장을 다시 연 뒤 저장해 주세요.';
    return message || `GitHub 오류 (${status})`;
  }

  async function github(pathname, options) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${state.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (options && options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`https://api.github.com${pathname}`, {
      method: (options && options.method) || 'GET',
      headers,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch (error) { payload = { message: text }; }
    }
    if (!response.ok) {
      const failure = new Error(explainStatus(response.status, payload));
      failure.status = response.status;
      throw failure;
    }
    return payload;
  }

  async function getFile(path) {
    const payload = await github(`/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`);
    if (payload.content) {
      return { sha: payload.sha, text: logic.decodeBase64Utf8(payload.content) };
    }
    const response = await fetch(payload.download_url, {
      headers: { Authorization: `Bearer ${state.token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('파일 내용을 받지 못했습니다.');
    return { sha: payload.sha, text: await response.text() };
  }

  async function putFile(path, text, sha, message) {
    const body = {
      message,
      content: logic.encodeBase64Utf8(text),
      branch: config.branch,
    };
    if (sha) body.sha = sha;
    return github(`/repos/${config.owner}/${config.repo}/contents/${encodePath(path)}`, { method: 'PUT', body });
  }

  function customerLink(id) {
    return logic.customerPageUrl(config.pagesBase, id);
  }

  function localLink(id) {
    const url = new URL('site.html', window.location.href);
    url.search = `?id=${encodeURIComponent(id)}`;
    url.hash = '';
    return url.href;
  }

  function flash(message, isError) {
    state.message = isError ? '' : message;
    state.error = isError ? message : '';
    const node = document.querySelector('#flash');
    if (!node) {
      renderPanel();
      return;
    }
    node.className = isError ? 'flash error' : 'flash ok';
    node.hidden = !message;
    node.textContent = message || '';
  }

  function renderToken() {
    const slot = document.getElementById('token-slot');
    const saved = Boolean(state.token);
    slot.innerHTML = `<section class="token-card card">
      <h2>GitHub 토큰</h2>
      <p class="hint">Fine-grained personal access token을 이 브라우저의 localStorage에만 저장합니다. 저장소 서버나 현장 JSON에는 기록하지 않고, 요청은 api.github.com으로만 보냅니다.</p>
      <p class="hint">저장소 ${esc(config.owner)}/${esc(config.repo)} · 브랜치 ${esc(config.branch)} · 권한은 Contents 읽기/쓰기면 됩니다.</p>
      ${saved ? `<p>이 브라우저에 토큰이 있습니다.${state.login ? ` 계정 ${esc(state.login)}` : ''}</p>` : ''}
      <form id="token-form" class="field">
        <label for="token">토큰</label>
        <input id="token" name="token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="github_pat_...">
        <div class="actions">
          <button class="button" type="submit">${saved ? '토큰 바꾸기' : '토큰 저장 후 연결'}</button>
          ${saved ? '<button class="button secondary" type="button" data-action="clear-token">토큰 지우기</button>' : ''}
          ${saved ? '<button class="button secondary" type="button" data-action="reload">목록 새로고침</button>' : ''}
        </div>
      </form>
    </section>`;
  }

  function renderList() {
    const rows = state.sites.map((site) => `<article class="site-row">
      <h3>${esc(site.name || site.id)} ${site.sample ? '<span class="pill run">샘플</span>' : ''}</h3>
      <p class="hint">${esc(site.area || '지역 없음')} · ${esc(site.id)} · 기록 ${esc(logic.formatDateTime(site.updatedAt) || '없음')}</p>
      <p class="link-box">${esc(customerLink(site.id))}</p>
      <div class="row-actions">
        <button class="button" type="button" data-action="open" data-id="${esc(site.id)}">수정</button>
        <button class="button secondary" type="button" data-action="copy-link" data-id="${esc(site.id)}">고객 링크 복사</button>
        <a class="button secondary" href="${esc(localLink(site.id))}" target="_blank" rel="noopener">이 브라우저에서 보기</a>
      </div>
    </article>`).join('');
    return `<section class="panel card">
      <h2>현장</h2>
      <div id="flash" class="${state.error ? 'flash error' : 'flash ok'}" ${state.error || state.message ? '' : 'hidden'}>${esc(state.error || state.message || '')}</div>
      <div class="actions">
        <button class="button" type="button" data-action="new" ${state.token ? '' : 'disabled'}>템플릿으로 새 현장</button>
      </div>
      ${state.token ? '' : '<p class="hint">토큰을 저장하면 현장 목록을 불러옵니다. 고객용 첫 화면에는 목록을 올리지 않습니다.</p>'}
      ${rows || (state.token ? '<p>등록된 현장이 없습니다.</p>' : '')}
    </section>`;
  }

  function renderCreate() {
    const today = logic.formatISODate(new Date());
    const end = logic.formatISODate(logic.addDays(today, logic.STANDARD_SPAN));
    return `<section class="panel card">
      <h2>새 현장</h2>
      <div id="flash" class="${state.error ? 'flash error' : 'flash ok'}" ${state.error || state.message ? '' : 'hidden'}>${esc(state.error || state.message || '')}</div>
      <form id="create-form">
        <label class="field">현장 이름<input name="name" required maxlength="80" placeholder="예: 잠실 32평 리모델링"></label>
        <label class="field">고객 이름 <span class="hint">선택</span><input name="customerName" maxlength="40" placeholder="예: 홍길동"></label>
        <label class="field">지역 <span class="hint">구·동까지만. 상세 주소는 적지 않습니다.</span><input name="area" required maxlength="30" placeholder="서울 송파구"></label>
        <div class="date-grid">
          <label>착공<input name="startDate" type="date" required value="${today}"></label>
          <label>준공 예정<input name="expectedEndDate" type="date" required value="${end}"></label>
        </div>
        <label class="field">담당<input name="managerName" maxlength="40" value="아빈"></label>
        <label class="field">연락 안내 <span class="hint">전화번호는 적지 마세요. 카카오 채널명 정도만.</span><input name="managerContact" maxlength="80" placeholder="카카오톡 채널 안내"></label>
        <div class="actions">
          <button class="button" type="submit">현장 만들기</button>
          <button class="button secondary" type="button" data-action="back">목록</button>
        </div>
      </form>
    </section>`;
  }

  function checkRow(item) {
    return `<li class="check-row" data-check="${esc(item.id)}">
      <input name="checked" type="checkbox" ${item.checked ? 'checked' : ''} aria-label="확인">
      <div class="check-fields">
        <input name="label" value="${esc(item.label || '')}" placeholder="확인 항목" maxlength="80">
        <input name="checkedAt" type="date" value="${esc(item.checkedAt || '')}" aria-label="확인일">
        <input name="memo" value="${esc(item.memo || '')}" placeholder="메모" maxlength="200">
        <button class="button secondary" type="button" data-action="remove-check">삭제</button>
      </div>
    </li>`;
  }

  function renderEditor() {
    if (state.rawBroken) {
      return `<section class="panel card">
        <h2>JSON을 읽지 못했습니다</h2>
        <div id="flash" class="flash error">${esc(state.error || '형식을 고쳐 저장해 주세요.')}</div>
        <form id="raw-form">
          <label class="field">data/sites/${esc(state.pathId)}.json<textarea name="rawjson">${esc(state.rawBroken)}</textarea></label>
          <div class="actions">
            <button class="button" type="submit">JSON 저장</button>
            <button class="button secondary" type="button" data-action="back">목록</button>
          </div>
        </form>
      </section>`;
    }
    const site = state.editing;
    const link = customerLink(site.id);
    return `<section class="panel">
      <div class="card token-card">
        <p class="eyebrow">data/sites/${esc(site.id)}.json</p>
        <h2>${esc(site.name || '현장 수정')}</h2>
        <p class="link-box" id="share-link">${esc(link)}</p>
        <p class="hint" id="updated-at">현장 기록 ${esc(logic.formatDateTime(site.updatedAt) || '없음')}</p>
        <div id="flash" class="${state.error ? 'flash error' : 'flash ok'}" ${state.error || state.message ? '' : 'hidden'}>${esc(state.error || state.message || '')}</div>
        <div class="row-actions">
          <button class="button secondary" type="button" data-action="copy-link" data-id="${esc(site.id)}">고객 링크 복사</button>
          <a class="button secondary" href="${esc(localLink(site.id))}" target="_blank" rel="noopener">고객 화면</a>
          <button class="button secondary" type="button" data-action="preview-json">저장될 JSON</button>
          <button class="button secondary" type="button" data-action="back">목록</button>
        </div>
      </div>
      <form id="editor">
        <section class="card token-card">
          <label class="field">현장 이름<input name="name" required maxlength="80" value="${esc(site.name || '')}"></label>
          <label class="field">고객 이름<input name="customerName" maxlength="40" value="${esc(site.customerName || '')}"></label>
          <label class="field">지역<input name="area" required maxlength="30" value="${esc(site.area || '')}"></label>
          <div class="date-grid">
            <label>착공<input name="startDate" type="date" required value="${esc(site.startDate || '')}"></label>
            <label>준공 예정<input name="expectedEndDate" type="date" required value="${esc(site.expectedEndDate || '')}"></label>
          </div>
          <label class="field">담당<input name="managerName" maxlength="40" value="${esc((site.manager && site.manager.name) || '')}"></label>
          <label class="field">연락 안내<input name="managerContact" maxlength="80" value="${esc((site.manager && site.manager.contact) || '')}"></label>
          <label class="checkbox-line"><input name="sample" type="checkbox" ${site.sample ? 'checked' : ''}>샘플 현장으로 표시</label>
        </section>
        ${(site.processes || []).map((process, index) => `<article class="edit-process card" data-process="${esc(process.id)}">
          <h3>${index + 1}. ${esc(process.name)}</h3>
          <div class="segment" role="group" aria-label="${esc(process.name)} 상태">
            ${logic.STATUSES.map((status) => `<button type="button" data-action="status" data-status="${status}" class="${process.status === status ? 'is-selected' : ''}" aria-pressed="${process.status === status ? 'true' : 'false'}">${status}</button>`).join('')}
          </div>
          <div class="date-grid">
            <label><span>예정 시작</span><input name="plannedStart" type="date" value="${esc(process.plannedStart || '')}"></label>
            <label><span>예정 종료</span><input name="plannedEnd" type="date" value="${esc(process.plannedEnd || '')}"></label>
            <label><span>실제 시작</span><input name="actualStart" type="date" value="${esc(process.actualStart || '')}"></label>
            <label><span>실제 종료</span><input name="actualEnd" type="date" value="${esc(process.actualEnd || '')}"></label>
          </div>
          <label class="field">메모<textarea name="notes" maxlength="1000">${esc(process.notes || '')}</textarea></label>
          <label class="field">사진 주소 <span class="hint">한 줄에 하나. https 주소 또는 assets/파일명</span><textarea name="photos">${esc((process.photos || []).join('\n'))}</textarea></label>
          <ul class="check-edit">${(process.checklist || []).map(checkRow).join('')}</ul>
          <button class="button secondary" type="button" data-action="add-check">항목 추가</button>
        </article>`).join('')}
        <div class="savebar">
          <button class="button" type="submit">main에 저장</button>
          <button class="button danger" type="button" data-action="delete">현장 삭제</button>
        </div>
      </form>
    </section>`;
  }

  function renderPanel() {
    const panel = document.getElementById('panel');
    if (state.view === 'create') panel.innerHTML = renderCreate();
    else if (state.view === 'edit') panel.innerHTML = renderEditor();
    else panel.innerHTML = renderList();
  }

  function render() {
    renderToken();
    renderPanel();
  }

  async function copyLink(id) {
    const link = customerLink(id);
    try {
      await navigator.clipboard.writeText(link);
      flash('고객 링크를 복사했습니다.');
    } catch (error) {
      flash(link);
    }
  }

  async function loadSites() {
    if (!state.token) {
      state.sites = [];
      return;
    }
    const serial = ++loadSerial;
    const tokenAtStart = state.token;
    state.busy = true;
    flash('');
    try {
      let entries = [];
      try {
        entries = await github(`/repos/${config.owner}/${config.repo}/contents/data/sites?ref=${encodeURIComponent(config.branch)}`);
      } catch (error) {
        if (error.status !== 404) throw error;
      }
      if (!Array.isArray(entries)) entries = [];
      const files = entries.filter((entry) => entry.type === 'file' && /\.json$/i.test(entry.name));
      const sites = await Promise.all(files.map(async (file) => {
        const id = file.name.replace(/\.json$/i, '');
        try {
          const loaded = await getFile(file.path);
          const json = JSON.parse(loaded.text);
          return {
            id: json.id || id,
            name: json.name || id,
            area: json.area || '',
            updatedAt: json.updatedAt || '',
            sample: Boolean(json.sample),
          };
        } catch (error) {
          return { id, name: `${id} (읽기 오류)`, area: '', updatedAt: '', sample: false };
        }
      }));
      sites.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      if (serial !== loadSerial || state.token !== tokenAtStart) return;
      state.sites = sites;
      try {
        const user = await github('/user');
        if (serial === loadSerial && state.token === tokenAtStart) state.login = user.login || '';
      } catch (error) {
        if (serial === loadSerial) state.login = '';
      }
      state.error = '';
    } catch (error) {
      if (serial !== loadSerial || state.token !== tokenAtStart) return;
      state.error = error.message;
      state.sites = [];
    } finally {
      if (serial === loadSerial) {
        state.busy = false;
        render();
      }
    }
  }

  async function openSite(id) {
    state.busy = true;
    state.message = '';
    state.error = '';
    state.rawBroken = '';
    try {
      const loaded = await getFile(`data/sites/${id}.json`);
      state.sha = loaded.sha;
      state.pathId = id;
      try {
        const parsed = JSON.parse(loaded.text);
        parsed.id = id;
        state.editing = logic.prepareSite(parsed);
        state.view = 'edit';
        state.dirty = false;
      } catch (error) {
        state.rawBroken = loaded.text;
        state.view = 'edit';
        state.error = 'JSON 형식이 올바르지 않습니다.';
      }
    } catch (error) {
      state.view = 'list';
      state.error = error.message;
    } finally {
      state.busy = false;
      render();
    }
  }

  function readEditor() {
    const current = structuredClone(state.editing);
    const root = document.querySelector('#editor');
    current.name = root.querySelector('[name="name"]').value;
    current.customerName = root.querySelector('[name="customerName"]').value;
    current.area = root.querySelector('[name="area"]').value;
    current.startDate = root.querySelector('[name="startDate"]').value;
    current.expectedEndDate = root.querySelector('[name="expectedEndDate"]').value;
    current.sample = root.querySelector('[name="sample"]').checked;
    current.manager = current.manager || {};
    current.manager.name = root.querySelector('[name="managerName"]').value;
    current.manager.contact = root.querySelector('[name="managerContact"]').value;
    const byId = {};
    (current.processes || []).forEach((process) => { byId[process.id] = process; });
    current.processes = [...root.querySelectorAll('[data-process]')].map((card) => {
      const process = byId[card.dataset.process] || { id: card.dataset.process, name: card.dataset.process };
      const selected = card.querySelector('[data-action="status"].is-selected');
      process.name = process.name || card.querySelector('h3').textContent.replace(/^\d+\.\s*/, '');
      process.status = selected ? selected.dataset.status : '대기';
      process.plannedStart = card.querySelector('[name="plannedStart"]').value;
      process.plannedEnd = card.querySelector('[name="plannedEnd"]').value;
      process.actualStart = card.querySelector('[name="actualStart"]').value;
      process.actualEnd = card.querySelector('[name="actualEnd"]').value;
      process.notes = card.querySelector('[name="notes"]').value;
      process.photos = card.querySelector('[name="photos"]').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const items = {};
      (process.checklist || []).forEach((item) => { items[item.id] = item; });
      process.checklist = [...card.querySelectorAll('[data-check]')].map((row) => {
        const item = items[row.dataset.check] || { id: row.dataset.check };
        item.label = row.querySelector('[name="label"]').value;
        item.checked = row.querySelector('[name="checked"]').checked;
        item.checkedAt = row.querySelector('[name="checkedAt"]').value;
        item.memo = row.querySelector('[name="memo"]').value;
        return item;
      });
      return process;
    });
    return current;
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (state.busy) return;
    let prepared;
    try {
      prepared = logic.prepareSite(readEditor(), logic.nowISOWithOffset());
    } catch (error) {
      flash('화면의 값을 읽지 못했습니다. 새로고침 후 다시 시도해 주세요.', true);
      return;
    }
    const errors = logic.validateSite(prepared);
    if (errors.length) {
      flash(errors[0], true);
      return;
    }
    const warnings = logic.sensitiveWarnings(prepared);
    if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\n이대로 main에 저장할까요?`)) return;
    state.busy = true;
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const result = await putFile(
        `data/sites/${state.pathId}.json`,
        logic.serializeSite(prepared),
        state.sha,
        `현장 업데이트: ${prepared.name} (${prepared.id})`,
      );
      state.sha = result.content && result.content.sha ? result.content.sha : state.sha;
      state.editing = prepared;
      state.dirty = false;
      const stamp = document.querySelector('#updated-at');
      if (stamp) stamp.textContent = `현장 기록 ${logic.formatDateTime(prepared.updatedAt)}`;
      flash('저장했습니다. 고객 화면에는 GitHub Pages 배포 뒤 1분에서 몇 분 사이에 반영됩니다.');
    } catch (error) {
      flash(error.message, true);
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
    }
  }

  async function saveRaw(event) {
    event.preventDefault();
    const text = event.target.querySelector('[name="rawjson"]').value;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      flash('아직 JSON이 아닙니다.', true);
      return;
    }
    parsed.id = state.pathId;
    const prepared = logic.prepareSite(parsed, logic.nowISOWithOffset());
    const errors = logic.validateSite(prepared);
    if (errors.length) {
      flash(errors[0], true);
      return;
    }
    state.busy = true;
    try {
      const result = await putFile(
        `data/sites/${state.pathId}.json`,
        logic.serializeSite(prepared),
        state.sha,
        `현장 업데이트: ${prepared.name} (${prepared.id})`,
      );
      state.sha = result.content.sha;
      state.editing = prepared;
      state.rawBroken = '';
      state.dirty = false;
      state.message = 'JSON을 저장했습니다.';
      render();
    } catch (error) {
      flash(error.message, true);
    } finally {
      state.busy = false;
    }
  }

  async function createSite(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.target;
    const input = {
      id: logic.createSiteId(),
      name: form.name.value,
      customerName: form.customerName.value,
      area: form.area.value,
      startDate: form.startDate.value,
      expectedEndDate: form.expectedEndDate.value,
      managerName: form.managerName.value,
      managerContact: form.managerContact.value,
      updatedAt: logic.nowISOWithOffset(),
    };
    state.busy = true;
    try {
      const templateFile = await getFile('data/template.json');
      const template = JSON.parse(templateFile.text);
      const site = logic.buildSiteFromTemplate(template, input);
      const errors = logic.validateSite(site);
      if (errors.length) {
        flash(errors[0], true);
        return;
      }
      const warnings = logic.sensitiveWarnings(site);
      if (warnings.length && !window.confirm(`${warnings.join('\n')}\n\n이대로 만들까요?`)) return;
      const result = await putFile(
        `data/sites/${site.id}.json`,
        logic.serializeSite(site),
        '',
        `현장 추가: ${site.name} (${site.id})`,
      );
      state.sha = result.content.sha;
      state.pathId = site.id;
      state.editing = site;
      state.view = 'edit';
      state.dirty = false;
      state.message = `현장을 만들었습니다. 고객 링크를 전달해 주세요. ${customerLink(site.id)}`;
      render();
    } catch (error) {
      flash(error.message, true);
    } finally {
      state.busy = false;
    }
  }

  async function deleteSite() {
    const id = state.pathId;
    const typed = window.prompt(`이 현장을 삭제합니다. 현장 코드를 그대로 입력해 주세요.\n${id}`);
    if (!typed || typed.trim() !== id) return;
    state.busy = true;
    try {
      await github(`/repos/${config.owner}/${config.repo}/contents/${encodePath(`data/sites/${id}.json`)}`, {
        method: 'DELETE',
        body: {
          message: `현장 삭제: ${(state.editing && state.editing.name) || id} (${id})`,
          sha: state.sha,
          branch: config.branch,
        },
      });
      state.view = 'list';
      state.editing = null;
      state.dirty = false;
      state.message = '현장을 삭제했습니다.';
      await loadSites();
    } catch (error) {
      flash(error.message, true);
      state.busy = false;
    }
  }

  function leaveToList() {
    if (state.dirty && !window.confirm('저장하지 않은 수정이 있습니다. 목록으로 돌아갈까요?')) return;
    state.view = 'list';
    state.editing = null;
    state.rawBroken = '';
    state.dirty = false;
    state.message = '';
    state.error = '';
    renderPanel();
  }

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'token-form') {
      event.preventDefault();
      const value = event.target.token.value.trim();
      if (!value && state.token) {
        loadSites();
        return;
      }
      if (!value) {
        state.error = '토큰을 붙여 넣어 주세요.';
        renderPanel();
        return;
      }
      state.token = value.replace(/^Bearer\s+/i, '').trim();
      localStorage.setItem(config.tokenKey, value);
      event.target.token.value = '';
      loadSites();
      return;
    }
    if (event.target.id === 'create-form') createSite(event);
    if (event.target.id === 'editor') saveEditor(event);
    if (event.target.id === 'raw-form') saveRaw(event);
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    const name = action.dataset.action;
    if (name === 'clear-token') {
      loadSerial += 1;
      state.token = '';
      state.login = '';
      state.sites = [];
      localStorage.removeItem(config.tokenKey);
      state.message = '이 브라우저에서 토큰을 지웠습니다. GitHub에 있는 토큰은 직접 폐기해 주세요.';
      render();
      return;
    }
    if (name === 'reload') loadSites();
    if (name === 'new') {
      state.view = 'create';
      state.error = '';
      state.message = '';
      renderPanel();
    }
    if (name === 'back') leaveToList();
    if (name === 'open') openSite(action.dataset.id);
    if (name === 'copy-link') copyLink(action.dataset.id || state.pathId);
    if (name === 'delete') deleteSite();
    if (name === 'preview-json') {
      try {
        const preview = logic.serializeSite(logic.prepareSite(readEditor(), state.editing.updatedAt));
        document.getElementById('json-view').textContent = preview;
        document.getElementById('json-dialog').showModal();
      } catch (error) {
        flash('JSON을 만들지 못했습니다.', true);
      }
    }
    if (name === 'status') {
      const card = action.closest('[data-process]');
      card.querySelectorAll('[data-action="status"]').forEach((button) => {
        const selected = button === action;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      const today = logic.formatISODate(new Date());
      const actualStart = card.querySelector('[name="actualStart"]');
      const actualEnd = card.querySelector('[name="actualEnd"]');
      if (action.dataset.status === '진행중' && !actualStart.value) actualStart.value = today;
      if (action.dataset.status === '완료') {
        if (!actualStart.value) actualStart.value = today;
        if (!actualEnd.value) actualEnd.value = today;
      }
      state.dirty = true;
    }
    if (name === 'add-check') {
      const card = action.closest('[data-process]');
      const item = { id: logic.createChecklistId(), label: '', checked: false, checkedAt: '', memo: '' };
      card.querySelector('.check-edit').insertAdjacentHTML('beforeend', checkRow(item));
      const created = card.querySelector(`[data-check="${item.id}"] [name="label"]`);
      if (created) created.focus();
      state.dirty = true;
    }
    if (name === 'remove-check') {
      const row = action.closest('[data-check]');
      if (row) row.remove();
      state.dirty = true;
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.closest('#editor') || event.target.closest('#create-form') || event.target.closest('#raw-form')) {
      state.dirty = true;
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.name !== 'checked') return;
    const row = event.target.closest('[data-check]');
    if (!row) return;
    const date = row.querySelector('[name="checkedAt"]');
    if (event.target.checked && date && !date.value) date.value = logic.formatISODate(new Date());
    if (!event.target.checked && date) date.value = '';
    state.dirty = true;
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  render();
  if (state.token) loadSites();
})();
