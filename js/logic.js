(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.AbinLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATUSES = ['대기', '진행중', '완료'];
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const ID_RE = /^[a-z0-9][a-z0-9-]{4,40}$/;
  const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';
  const STANDARD_SPAN = 52;
  const PHONE_RE = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/;

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function formatISODate(date) {
    const parsed = parseDate(date);
    if (!parsed) return '';
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${parsed.getFullYear()}-${month}-${day}`;
  }

  function addDays(date, days) {
    const base = parseDate(date);
    if (!base) return null;
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    next.setDate(next.getDate() + days);
    return next;
  }

  function daysBetween(start, end) {
    const from = parseDate(start);
    const to = parseDate(end);
    if (!from || !to) return null;
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  function formatKoreanDate(value, withWeekday) {
    const date = parseDate(value);
    if (!date) return '';
    const text = `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
    if (!withWeekday) return text;
    return `${text} (${WEEKDAYS[date.getDay()]})`;
  }

  function formatShortDate(value) {
    const date = parseDate(value);
    if (!date) return '';
    return `${date.getMonth() + 1}. ${date.getDate()}.`;
  }

  function formatDateTime(value) {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(value).trim());
    if (match) {
      return `${Number(match[1])}. ${Number(match[2])}. ${Number(match[3])}. ${match[4]}:${match[5]}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatClock(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function nowISOWithOffset(date) {
    const current = date instanceof Date ? date : new Date();
    const offset = -current.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}T${pad(current.getHours())}:${pad(current.getMinutes())}:${pad(current.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  function checklistStats(process) {
    const items = Array.isArray(process && process.checklist) ? process.checklist : [];
    const done = items.filter((item) => item && item.checked).length;
    return { done, total: items.length };
  }

  function processProgress(process) {
    if (!process || STATUSES.indexOf(process.status) === -1) return 0;
    if (process.status === '완료') return 1;
    if (process.status === '대기') return 0;
    const stats = checklistStats(process);
    if (!stats.total) return 0.5;
    return stats.done / stats.total;
  }

  function overallProgress(processes) {
    const list = Array.isArray(processes) ? processes : [];
    if (!list.length) return 0;
    const sum = list.reduce((total, process) => total + processProgress(process), 0);
    return Math.round((sum / list.length) * 100);
  }

  function statusCounts(processes) {
    const counts = { 대기: 0, 진행중: 0, 완료: 0 };
    (processes || []).forEach((process) => {
      if (Object.prototype.hasOwnProperty.call(counts, process.status)) {
        counts[process.status] += 1;
      }
    });
    return counts;
  }

  function delayDays(process, today) {
    if (!process || process.status === '대기') return 0;
    if (process.status === '완료') {
      if (!process.actualEnd || !process.plannedEnd) return 0;
      return Math.max(0, daysBetween(process.plannedEnd, process.actualEnd) || 0);
    }
    if (!process.plannedEnd) return 0;
    const over = daysBetween(process.plannedEnd, today || new Date());
    return over && over > 0 ? over : 0;
  }

  function projectRange(site) {
    const dates = [];
    function push(value) {
      const date = parseDate(value);
      if (date) dates.push(date);
    }
    push(site && site.startDate);
    push(site && site.expectedEndDate);
    ((site && site.processes) || []).forEach((process) => {
      push(process.plannedStart);
      push(process.plannedEnd);
      push(process.actualStart);
      push(process.actualEnd);
    });
    if (!dates.length) {
      const today = parseDate(new Date());
      return { start: today, end: addDays(today, 1) };
    }
    let start = dates[0];
    let end = dates[0];
    dates.forEach((date) => {
      if (date < start) start = date;
      if (date > end) end = date;
    });
    if (start.getTime() === end.getTime()) end = addDays(start, 1);
    return { start, end };
  }

  function inclusiveDays(range) {
    return Math.max(1, (daysBetween(range.start, range.end) || 0) + 1);
  }

  function barPosition(start, end, range) {
    const from = parseDate(start);
    const to = parseDate(end);
    if (!from || !to || !range) return null;
    const drawStart = from <= to ? from : to;
    const drawEnd = from <= to ? to : from;
    const total = inclusiveDays(range);
    const left = ((daysBetween(range.start, drawStart) || 0) / total) * 100;
    const width = ((daysBetween(drawStart, drawEnd) + 1) / total) * 100;
    return { left, width };
  }

  function todayMarker(today, range) {
    const date = parseDate(today || new Date());
    if (!date || date < range.start || date > range.end) return null;
    const total = inclusiveDays(range);
    return ((daysBetween(range.start, date) + 0.5) / total) * 100;
  }

  function monthTicks(range) {
    const ticks = [{ date: range.start, label: `${range.start.getMonth() + 1}월` }];
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    if (cursor <= range.start) {
      cursor = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 1);
    }
    while (cursor <= range.end) {
      if ((daysBetween(range.start, cursor) || 0) > 4) {
        ticks.push({ date: new Date(cursor.getTime()), label: `${cursor.getMonth() + 1}월` });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    const total = inclusiveDays(range);
    return ticks.map((tick) => ({
      label: tick.label,
      left: ((daysBetween(range.start, tick.date) || 0) / total) * 100,
    }));
  }

  function actualSpan(process, today) {
    if (!process || !process.actualStart) return null;
    if (process.actualEnd) return { start: process.actualStart, end: process.actualEnd };
    if (process.status === '진행중') {
      const start = parseDate(process.actualStart);
      const current = parseDate(today || new Date());
      const end = current && start && current >= start ? current : start;
      return { start: process.actualStart, end: formatISODate(end) };
    }
    if (process.plannedEnd) return { start: process.actualStart, end: process.plannedEnd };
    return { start: process.actualStart, end: process.actualStart };
  }

  function asBool(value) {
    return value === true || value === 'true' || value === 1;
  }

  function startSlipDays(process) {
    if (!process || !process.actualStart || !process.plannedStart) return 0;
    return Math.max(0, daysBetween(process.plannedStart, process.actualStart) || 0);
  }

  function copyKnown(source, keys) {
    const out = {};
    keys.forEach((key) => {
      if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
    });
    Object.keys(source || {}).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = source[key];
    });
    return out;
  }

function orderedItem(item) {
  const checked = asBool(item && item.checked);
    const ordered = {
      id: (item && item.id) || '',
      label: item && item.label ? String(item.label).trim() : '',
      checked,
      checkedAt: checked && item.checkedAt ? String(item.checkedAt) : '',
      memo: item && item.memo ? String(item.memo).trim() : '',
    };
    return copyKnown(Object.assign({}, item, ordered), ['id', 'label', 'checked', 'checkedAt', 'memo']);
  }

  function orderedProcess(process) {
    const photos = Array.isArray(process && process.photos)
      ? process.photos.map((photo) => String(photo).trim()).filter(Boolean)
      : [];
    const ordered = {
      id: (process && process.id) || '',
      name: process && process.name ? String(process.name).trim() : '',
      status: process && process.status ? process.status : '대기',
      plannedStart: (process && process.plannedStart) || '',
      plannedEnd: (process && process.plannedEnd) || '',
      actualStart: (process && process.actualStart) || '',
      actualEnd: (process && process.actualEnd) || '',
      notes: process && process.notes ? String(process.notes).trim() : '',
      photos,
      checklist: ((process && process.checklist) || []).map(orderedItem),
    };
    return copyKnown(Object.assign({}, process, ordered), [
      'id', 'name', 'status', 'plannedStart', 'plannedEnd', 'actualStart', 'actualEnd', 'notes', 'photos', 'checklist',
    ]);
  }

  function orderedSite(site) {
    const manager = (site && site.manager) || {};
    const orderedManager = copyKnown(Object.assign({}, manager, {
      name: manager.name ? String(manager.name).trim() : '',
      contact: manager.contact ? String(manager.contact).trim() : '',
    }), ['name', 'contact']);
    const ordered = {
      id: (site && site.id) || '',
      sample: Boolean(site && site.sample),
      name: site && site.name ? String(site.name).trim() : '',
      customerName: site && site.customerName ? String(site.customerName).trim() : '',
      area: site && site.area ? String(site.area).trim() : '',
      startDate: (site && site.startDate) || '',
      expectedEndDate: (site && site.expectedEndDate) || '',
      manager: orderedManager,
      updatedAt: (site && site.updatedAt) || '',
      processes: ((site && site.processes) || []).map(orderedProcess),
    };
    return copyKnown(Object.assign({}, site, ordered), [
      'id', 'sample', 'name', 'customerName', 'area', 'startDate', 'expectedEndDate', 'manager', 'updatedAt', 'processes',
    ]);
  }

  function prepareSite(site, updatedAt) {
    const next = orderedSite(site || {});
    if (updatedAt) next.updatedAt = updatedAt;
    return next;
  }

  function serializeSite(site) {
    return `${JSON.stringify(prepareSite(site), null, 2)}\n`;
  }

  function isDateField(value) {
    return value === '' || value == null || Boolean(parseDate(value));
  }

  function validateSite(site) {
    const errors = [];
    if (!site || typeof site !== 'object') return ['현장 데이터가 비어 있습니다.'];
    if (!ID_RE.test(site.id || '')) errors.push('현장 ID는 소문자, 숫자, 하이픈으로 5자 이상이어야 합니다.');
    if (!site.name) errors.push('현장 이름을 입력해 주세요.');
    if (!site.area) errors.push('지역을 입력해 주세요. 구·동처럼 짧게 적습니다.');
    if (!parseDate(site.startDate)) errors.push('착공일을 입력해 주세요.');
    if (!parseDate(site.expectedEndDate)) errors.push('준공 예정일을 입력해 주세요.');
    if (parseDate(site.startDate) && parseDate(site.expectedEndDate) && parseDate(site.expectedEndDate) < parseDate(site.startDate)) {
      errors.push('준공 예정일은 착공일 이후여야 합니다.');
    }
    if (!Array.isArray(site.processes) || !site.processes.length) {
      errors.push('공정이 하나 이상 있어야 합니다.');
      return errors;
    }
    const processIds = {};
    site.processes.forEach((process, index) => {
      const label = process.name || `${index + 1}번 공정`;
      if (!process.id) errors.push(`${label}: 공정 ID가 없습니다.`);
      if (process.id && processIds[process.id]) errors.push(`${label}: 공정 ID가 중복입니다.`);
      processIds[process.id] = true;
      if (!process.name) errors.push(`${index + 1}번 공정의 이름이 비어 있습니다.`);
      if (STATUSES.indexOf(process.status) === -1) errors.push(`${label}: 상태는 대기, 진행중, 완료 중 하나여야 합니다.`);
      ['plannedStart', 'plannedEnd', 'actualStart', 'actualEnd'].forEach((field) => {
        if (!isDateField(process[field])) errors.push(`${label}: 날짜 형식이 올바르지 않습니다.`);
      });
      if (parseDate(process.plannedStart) && parseDate(process.plannedEnd) && parseDate(process.plannedEnd) < parseDate(process.plannedStart)) {
        errors.push(`${label}: 예정 종료가 예정 시작보다 빠릅니다.`);
      }
      if (parseDate(process.actualStart) && parseDate(process.actualEnd) && parseDate(process.actualEnd) < parseDate(process.actualStart)) {
        errors.push(`${label}: 실제 종료가 실제 시작보다 빠릅니다.`);
      }
      (process.photos || []).forEach((photo) => {
        if (/^(javascript|data):/i.test(photo) || String(photo).trim().startsWith('//')) {
          errors.push(`${label}: 사진 주소는 http(s) 또는 사이트 안 경로만 사용할 수 있습니다.`);
        }
      });
      const itemIds = {};
      (process.checklist || []).forEach((item, itemIndex) => {
        if (!item.label) errors.push(`${label}: ${itemIndex + 1}번 체크 항목 이름이 비어 있습니다.`);
        if (item.id && itemIds[item.id]) errors.push(`${label}: 체크 항목 ID가 중복입니다.`);
        if (item.id) itemIds[item.id] = true;
        if (item.checkedAt && !parseDate(item.checkedAt)) errors.push(`${label}: 체크 날짜 형식이 올바르지 않습니다.`);
      });
    });
    return errors;
  }

  function sensitiveWarnings(site) {
    const warnings = [];
    const blob = JSON.stringify(site || {});
    if (PHONE_RE.test(blob) || /\d{2,3}-\d{3,4}-\d{4}/.test(blob)) {
      warnings.push('전화번호로 보이는 숫자가 있습니다. 이 저장소는 공개라 그대로 올라갑니다.');
    }
    if (/[로길]\s*\d/.test((site && site.area) || '')) {
      warnings.push('지역란에 도로명·번지가 들어간 것 같습니다. 구 또는 동까지만 적어 주세요.');
    }
    return warnings;
  }

  function scheduleProcesses(templateProcesses, startDate, endDate) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end < start) return null;
    const span = daysBetween(start, end);
    const scale = span / STANDARD_SPAN;
    return (templateProcesses || []).map((process) => {
      const offset = Number(process.startOffset);
      const duration = Number(process.durationDays);
      const safeOffset = Number.isFinite(offset) ? offset : 0;
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
      let plannedStart = addDays(start, Math.round(safeOffset * scale));
      let plannedEnd = addDays(plannedStart, Math.max(1, Math.round(safeDuration * scale)) - 1);
      if (plannedStart > end) plannedStart = new Date(end.getTime());
      if (plannedEnd > end) plannedEnd = new Date(end.getTime());
      if (plannedEnd < plannedStart) plannedEnd = new Date(plannedStart.getTime());
      return {
        plannedStart: formatISODate(plannedStart),
        plannedEnd: formatISODate(plannedEnd),
      };
    });
  }

  function buildSiteFromTemplate(template, input) {
    const schedule = scheduleProcesses(template.processes || [], input.startDate, input.expectedEndDate);
    const processes = (template.processes || []).map((process, index) => ({
      id: process.id,
      name: process.name,
      status: '대기',
      plannedStart: schedule ? schedule[index].plannedStart : '',
      plannedEnd: schedule ? schedule[index].plannedEnd : '',
      actualStart: '',
      actualEnd: '',
      notes: '',
      photos: [],
      checklist: (process.checklist || []).map((item) => ({
        id: item.id,
        label: item.label,
        checked: false,
        checkedAt: '',
        memo: '',
      })),
    }));
    return prepareSite({
      id: input.id,
      sample: false,
      name: input.name,
      customerName: input.customerName || '',
      area: input.area || '',
      startDate: input.startDate,
      expectedEndDate: input.expectedEndDate,
      manager: {
        name: input.managerName || '',
        contact: input.managerContact || '',
      },
      updatedAt: input.updatedAt || '',
      processes,
    });
  }

  function createSiteId(randomFn) {
    const random = typeof randomFn === 'function' ? randomFn : Math.random;
    let id = '';
    for (let index = 0; index < 12; index += 1) {
      id += ID_ALPHABET.charAt(Math.floor(random() * ID_ALPHABET.length));
    }
    return id;
  }

  function createChecklistId(randomFn) {
    const random = typeof randomFn === 'function' ? randomFn : Math.random;
    return `c-${Date.now().toString(36)}-${Math.floor(random() * 36 ** 4).toString(36)}`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safePhotoUrl(url, baseHref) {
    const trimmed = String(url || '').trim();
    if (!trimmed || trimmed.indexOf('//') === 0) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) return '';
    try {
      const resolved = new URL(trimmed, baseHref || 'https://example.com/');
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
      return resolved.href;
    } catch (error) {
      return '';
    }
  }

  function customerPageUrl(pagesBase, id) {
    const base = pagesBase.endsWith('/') ? pagesBase : `${pagesBase}/`;
    return new URL(`site.html?id=${encodeURIComponent(id)}`, base).href;
  }

  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const size = 0x1000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + size)));
    }
    return btoa(binary);
  }

  function decodeBase64Utf8(encoded) {
    const binary = atob(String(encoded || '').replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }

  return {
    STATUSES,
    ID_RE,
    STANDARD_SPAN,
    parseDate,
    formatISODate,
    addDays,
    daysBetween,
    formatKoreanDate,
    formatShortDate,
    formatDateTime,
    formatClock,
    nowISOWithOffset,
    checklistStats,
    processProgress,
    overallProgress,
    statusCounts,
    delayDays,
    startSlipDays,
    projectRange,
    barPosition,
    todayMarker,
    monthTicks,
    actualSpan,
    prepareSite,
    serializeSite,
    validateSite,
    sensitiveWarnings,
    scheduleProcesses,
    buildSiteFromTemplate,
    createSiteId,
    createChecklistId,
    escapeHtml,
    safePhotoUrl,
    customerPageUrl,
    encodeBase64Utf8,
    decodeBase64Utf8,
  };
});
