const assert = require('assert');
const fs = require('fs');
const path = require('path');
const logic = require('../js/logic.js');

const root = path.join(__dirname, '..');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'data/sites/k7m2q9xp4nwb.json'), 'utf8'));
const template = JSON.parse(fs.readFileSync(path.join(root, 'data/template.json'), 'utf8'));
const sampleRaw = fs.readFileSync(path.join(root, 'data/sites/k7m2q9xp4nwb.json'), 'utf8');

assert.strictEqual(sample.sample, true);
assert.strictEqual(sample.id, 'k7m2q9xp4nwb');
assert.ok(logic.ID_RE.test(sample.id));
assert.deepStrictEqual(sample.processes.map((process) => process.name), [
  '철거', '설비/배관', '전기', '목공', '타일', '도장', '도배', '바닥', '가구/주방', '조명/마감', '입주청소',
]);
assert.strictEqual(sample.processes.filter((process) => process.status === '완료').length, 3);
assert.strictEqual(logic.checklistStats(sample.processes.find((process) => process.id === 'carpentry')).done, 3);
assert.strictEqual(logic.checklistStats(sample.processes.find((process) => process.id === 'tile')).done, 2);
assert.strictEqual(logic.overallProgress(sample.processes), 36);
assert.strictEqual(logic.delayDays(sample.processes.find((process) => process.id === 'plumbing'), '2026-11-17'), 1);
assert.strictEqual(logic.startSlipDays(sample.processes.find((process) => process.id === 'tile')), 2);
assert.strictEqual(logic.validateSite(logic.prepareSite(sample)).length, 0);
assert.deepStrictEqual(logic.sensitiveWarnings(sample), []);
assert.doesNotMatch(sampleRaw, /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/);
assert.doesNotMatch(sampleRaw, /\d{2,3}-\d{3,4}-\d{4}/);
assert.ok(sample.processes.find((process) => process.id === 'tile').checklist.some((item) => item.label.includes('방수')));
assert.ok(sample.processes.find((process) => process.id === 'tile').checklist.some((item) => item.label.includes('구배')));
assert.ok(sample.processes.find((process) => process.id === 'tile').checklist.some((item) => item.label.includes('줄눈')));

assert.strictEqual(logic.formatDateTime('2026-11-17T08:40:00+09:00'), '2026. 11. 17. 08:40');
assert.strictEqual(logic.formatKoreanDate('2026-11-17', true).includes('화'), true);
assert.strictEqual(logic.formatKoreanDate('2026-10-20', true).includes('화'), true);

const end = logic.formatISODate(logic.addDays('2026-03-02', logic.STANDARD_SPAN));
const built = logic.buildSiteFromTemplate(template, {
  id: 'abcde12345',
  name: '테스트 현장',
  customerName: '',
  area: '서울 마포구',
  startDate: '2026-03-02',
  expectedEndDate: end,
  managerName: '아빈',
  managerContact: '카카오 채널',
  updatedAt: '2026-03-02T09:00:00+09:00',
});
assert.strictEqual(logic.validateSite(built).length, 0);
assert.strictEqual(built.processes[0].plannedStart, '2026-03-02');
assert.strictEqual(built.processes[built.processes.length - 1].plannedEnd, end);
assert.ok(built.processes.every((process) => process.status === '대기' && process.checklist.every((item) => item.checked === false)));
assert.strictEqual(Object.prototype.hasOwnProperty.call(built.processes[0], 'startOffset'), false);
assert.strictEqual(built.processes.find((process) => process.id === 'tile').checklist.length, 5);

const range = { start: logic.parseDate('2026-10-20'), end: logic.parseDate('2026-12-12') };
const full = logic.barPosition('2026-10-20', '2026-12-12', range);
assert.ok(Math.abs(full.left) < 0.001);
assert.ok(Math.abs(full.width - 100) < 0.001);
const marker = logic.todayMarker('2026-12-12', range);
assert.ok(marker > 90 && marker < 100);
assert.strictEqual(logic.todayMarker('2026-01-01', range), null);

assert.strictEqual(logic.createSiteId(() => 0), 'aaaaaaaaaaaa');
assert.ok(logic.ID_RE.test(logic.createSiteId()));
assert.deepStrictEqual(logic.sensitiveWarnings({ area: '서울 송파구', manager: { contact: '010-1234-5678' } }).length, 1);
assert.strictEqual(logic.safePhotoUrl('javascript:alert(1)', 'https://dkqls12345-png.github.io/site-progress/site.html'), '');
assert.strictEqual(
  logic.safePhotoUrl('assets/sample-tile.svg', 'https://dkqls12345-png.github.io/site-progress/site.html'),
  'https://dkqls12345-png.github.io/site-progress/assets/sample-tile.svg',
);
assert.strictEqual(
  logic.customerPageUrl('https://dkqls12345-png.github.io/site-progress/', sample.id),
  'https://dkqls12345-png.github.io/site-progress/site.html?id=k7m2q9xp4nwb',
);

const roundTrip = logic.decodeBase64Utf8(logic.encodeBase64Utf8('타일 방수 확인'));
assert.strictEqual(roundTrip, '타일 방수 확인');
assert.strictEqual(logic.escapeHtml('<b>"&'), '&lt;b&gt;&quot;&amp;');

const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const siteJs = fs.readFileSync(path.join(root, 'js/site.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
assert.strictEqual(index.includes('data/sites'), false);
assert.strictEqual(index.includes('api.github.com'), false);
assert.ok(index.includes('site.html?id=k7m2q9xp4nwb'));
assert.ok(admin.includes('noindex'));
assert.ok(adminJs.includes('localStorage'));
assert.ok(adminJs.includes('api.github.com'));
assert.ok(siteJs.includes('refreshMs'));
assert.ok(config.includes('60000'));
assert.ok(fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8').includes('deploy-pages'));

console.log('logic tests passed');
