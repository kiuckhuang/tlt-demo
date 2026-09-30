'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

test('markup IDs are unique and every input/select has an explicit or enclosing label', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  const labels = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)].map(m => m[0]);
  for (const m of html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    assert.ok(labels.some(l => l.includes(`for="${m[1]}"`) || l.includes(`id="${m[1]}"`)), `Unlabelled field ${m[1]}`);
  }
});
test('annual rate is not presented as monthly interest or guaranteed compounded wealth', () => {
  assert.doesNotMatch(html, /每月派息\s*[≈約]\s*5\.5|5\.5% 月息|到期保證總值|16\.5 倍槓桿/);
  assert.doesNotMatch(js, /年後[・·]保證|forward portfolio yield/);
  assert.match(html, /非保證/); assert.match(html, /未逐項獨立核實/);
});
test('unverified historical price curve is not deployed', () => {
  assert.doesNotMatch(js, /\[2002,\s*87|178\.7|年度收市價/);
  assert.match(html, /事件示意時間線/); assert.match(html, /唔係歷史價格/);
});
test('cash-flow direction and dividend wording are explicit', () => {
  assert.match(html, /M 426 168 C 490 214, 615 212, 652 145/);
  assert.match(html, /橙色現金分派箭嘴由 TLT 指向你/);
  assert.match(html, /每月派現金（非固定金額）/);
});
test('static assets are local, cache versioned together and defer model before UI', () => {
  const assets = [...html.matchAll(/(?:href|src)="((?:style\.css|model\.js|app\.js)\?v=(\d+))"/g)];
  assert.equal(assets.length, 3); assert.equal(new Set(assets.map(x => x[2])).size, 1);
  for (const m of assets) assert.ok(fs.existsSync(path.join(__dirname, '..', m[1].split('?')[0])));
  assert.ok(html.indexOf('src="model.js') < html.indexOf('src="app.js'));
  assert.match(html, /<script defer src="model.js/); assert.match(html, /<script defer src="app.js/);
});
test('mobile table and chart overflow are scoped to their own regions', () => {
  assert.match(html, /class="table-scroll"[^>]*tabindex="0"/);
  assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:auto/);
  assert.match(css, /\.chart-canvas\s*\{[^}]*overflow-x:auto/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:hidden/);
});
test('theme switching redraws all themed readouts, not only the graph', () => {
  assert.match(js, /themechange[^\n]*renderSeesaw\(\); renderDuration\(\); refresh\(\)/);
  assert.match(js, /realPath\.setAttribute\('stroke', P\.axis\)/);
});
test('reduced motion, keyboard year controls, touch selection and accessible summaries exist', () => {
  assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /data-motion="reduced"/);
  assert.match(js, /systemMotion/); assert.match(js, /if \(reducedMotion\)/);
  assert.match(js, /addEventListener\('pointerup'/); assert.match(js, /e\.key === 'ArrowLeft'/);
  assert.match(html, /aria-live="polite"/); assert.match(html, /aria-pressed="true"/);
});
function vars(block) { return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m => [m[1], m[2]])); }
function rgb(hex) { let s = hex.slice(1); if (s.length === 3) s = s.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255); }
function luminance(hex) { const c = rgb(hex).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; }
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); }
test('fractional stopped frames use the same row in the accessible summary as the counters', () => {
  const vm = require('node:vm');
  const M = require('../model.js');
  const data = M.computeRows(M.scenarioPath('flat'));
  const node = { textContent: '' };
  const state = { scenario: 'flat', principal: 100000, currency: 'HKD', reinvest: true };
  const context = { M, state, $: () => node, rowsFor: () => data, money: (v) => 'HK$' + Math.round(v).toLocaleString('en-US'), pct: (v) => (v * 100).toFixed(2) + '%' };
  const yearFunction = js.match(/function yearLabel\(frame\) \{[\s\S]*?\n  \}/)[0];
  const detailFunction = js.match(/function updateDetail\(year, prefix\) \{[\s\S]*?\n  \}/)[0];
  vm.createContext(context);
  vm.runInContext(yearFunction + '\n' + detailFunction, context);
  for (const reinvest of [true, false]) for (const frame of [0, 0.5, 19.5, 20]) {
    state.reinvest = reinvest;
    context.updateDetail(frame, '目前檢視');
    const a = M.attribution(M.rowAt(data, frame), reinvest);
    assert.ok(node.textContent.includes('HK$' + Math.round(a.total * state.principal).toLocaleString('en-US')));
    assert.ok(node.textContent.includes('HK$' + Math.round(a.annualIncome * state.principal).toLocaleString('en-US')));
    if (!Number.isInteger(frame)) assert.ok(node.textContent.includes('插值'));
  }
  assert.match(js, /updateDetail\(state\.frame, '目前檢視'\)/);
});
test('low-yield sensitivity floor is disclosed in the visible model explanation', () => {
  assert.match(html, /收入代理值下限為 0/);
  assert.match(html, /向下調整可能少於 0\.5 個百分點/);
});
test('both themes have readable normal text and selected-button text (WCAG 4.5:1)', () => {
  const dark = vars(css.match(/:root\s*\{([^}]+)\}/)[1]);
  const light = vars(css.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)[1]);
  for (const [name, v] of [['dark', dark], ['light', light]]) {
    for (const key of ['--text', '--muted', '--green', '--red']) assert.ok(contrast(v[key], v['--card']) >= 4.5, `${name} ${key} contrast`);
    assert.ok(contrast(v['--gold'], v['--gold-ink']) >= 4.5, `${name} selected-button contrast`);
    for (const key of ['--scenario-cut', '--scenario-flat', '--scenario-infl', '--scenario-shock', '--scenario-custom']) assert.ok(contrast(v[key], v['--card']) >= 3, `${name} ${key} line contrast`);
  }
});
