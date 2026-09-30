/* TLT educational UI. Snapshot values are user-provided; models are assumptions. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var all = function (s) { return Array.from(document.querySelectorAll(s)); };
  function showError(error) { var box = $('#app-error'); if (box) box.hidden = false; console.error(error); }
  window.addEventListener('error', function (e) { showError(e.error || e.message); });
  var M = window.TLTModel;
  if (!M) { showError('Calculation module unavailable'); return; }
  var root = document.documentElement;
  function readPreference(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function savePreference(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* storage can be unavailable offline */ } }
  var systemTheme = matchMedia('(prefers-color-scheme: dark)');
  var systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  var theme = readPreference('tlt-theme') || 'system';
  if (!['light', 'dark', 'system'].includes(theme)) theme = 'system';
  var motionChoice = readPreference('tlt-motion');
  var reducedMotion = motionChoice ? motionChoice === 'reduced' : systemMotion.matches;
  var P = {};
  function refreshPalette() {
    var css = getComputedStyle(root), read = function (n) { return css.getPropertyValue(n).trim(); };
    P = { ink: read('--text'), axis: read('--c-axis'), grid: read('--c-grid'), scan: read('--c-scan'), ring: read('--c-dotring'), gold: read('--gold'), positive: read('--green'), negative: read('--red'), scenarios: {} };
    M.SCENARIOS.forEach(function (s) { P.scenarios[s.key] = read('--scenario-' + s.key); });
  }
  function applyTheme() {
    root.dataset.theme = theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme;
    root.dataset.themePreference = theme;
    all('.tbtn').forEach(function (b) { var active = b.dataset.t === theme; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    refreshPalette();
    document.dispatchEvent(new Event('themechange'));
  }
  function applyMotion() {
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
    $('#optMotion').checked = reducedMotion;
    document.dispatchEvent(new Event('motionchange'));
  }
  function watchMedia(media, listener) { if (media.addEventListener) media.addEventListener('change', listener); else media.addListener(listener); }
  all('.tbtn').forEach(function (b) { b.addEventListener('click', function () { theme = b.dataset.t; savePreference('tlt-theme', theme); applyTheme(); }); });
  $('#optMotion').addEventListener('change', function () { reducedMotion = this.checked; motionChoice = reducedMotion ? 'reduced' : 'full'; savePreference('tlt-motion', motionChoice); applyMotion(); });
  watchMedia(systemTheme, function () { if (theme === 'system') applyTheme(); });
  watchMedia(systemMotion, function () { if (!motionChoice) { reducedMotion = systemMotion.matches; applyMotion(); } });
  applyTheme(); applyMotion();

  function money(value, currency, compact) {
    var prefix = currency === 'HKD' ? 'HK$' : 'US$';
    if (compact && Math.abs(value) >= 1000000) return prefix + (value / 1000000).toFixed(2) + 'M';
    return prefix + Math.round(value).toLocaleString('en-US');
  }
  function pct(value, digits, signed) { return (signed ? (value >= 0 ? '+' : '−') : '') + (Math.abs(value) * 100).toFixed(digits === undefined ? 1 : digits) + '%'; }
  function signedMoney(value, currency, compact) { return (value >= 0 ? '+\u00a0' : '−\u00a0') + money(Math.abs(value), currency, compact); }
  function numberInRange(input, low, high, fallback) {
    var n = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(n)) n = fallback;
    n = M.clamp(n, low, high); input.value = n; return n;
  }
  function setMoney(id, value, color) {
    var node = $(id); node.textContent = money(value, state.currency, true); node.title = money(value, state.currency); node.setAttribute('aria-label', node.title); if (color) node.style.color = color;
  }
  function setSignedMoney(id, value, color, suffix) {
    var node = $(id); node.textContent = signedMoney(value, state.currency, true) + (suffix || ''); node.title = signedMoney(value, state.currency) + (suffix || ''); node.setAttribute('aria-label', node.title); if (color) node.style.color = color;
  }
  function svgNode(tag, attributes, parent) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attributes || {}).forEach(function (k) { node.setAttribute(k, attributes[k]); });
    if (parent) parent.appendChild(node); return node;
  }

  /* Seesaw and duration readouts are re-rendered on EVERY theme change. */
  function renderSeesaw() {
    var y = Number($('#rate').value) / 100, delta = y - M.DEFAULTS.grossYield;
    var priceChange = M.durationChange(M.DEFAULTS.duration, delta);
    var approximatePrice = M.DEFAULTS.price * (1 + priceChange);
    $('#rateVal').textContent = pct(y, 2);
    $('#rate').setAttribute('aria-valuetext', pct(y, 2));
    $('#plank').setAttribute('transform', 'rotate(' + M.clamp(delta * 100 * 4, -14, 14) + ' 380 218)');
    $('#sw-rate').textContent = pct(y, 2); $('#sw-price').textContent = approximatePrice.toFixed(2);
    $('#sw-arrow-l').textContent = delta > 0.0001 ? '↑' : delta < -0.0001 ? '↓' : '•';
    $('#sw-arrow-r').textContent = delta > 0.0001 ? '↓' : delta < -0.0001 ? '↑' : '•';
    $('#ro-delta').textContent = (delta >= 0 ? '+' : '−') + Math.abs(delta * 100).toFixed(2) + ' 個百分點';
    $('#ro-delta').style.color = Math.abs(delta) < 0.0001 ? P.ink : delta > 0 ? P.negative : P.positive;
    $('#ro-tlt').textContent = 'US$' + approximatePrice.toFixed(2) + '（' + pct(priceChange, 1, true) + '）';
    $('#ro-tlt').style.color = Math.abs(priceChange) < 0.0001 ? P.ink : priceChange > 0 ? P.positive : P.negative;
    var pv = M.bondPrice(1000, 0.045, y, 30);
    $('#ro-bond').textContent = 'US$' + pv.toFixed(0) + '（' + pct(pv / 1000 - 1, 1, true) + ' vs 面值）';
    $('#ro-bond').style.color = pv >= 1000 ? P.positive : P.negative;
  }
  function renderDuration() {
    var delta = Number($('#dRate').value) / 100;
    $('#dRateVal').textContent = (delta >= 0 ? '+' : '−') + Math.abs(delta * 100).toFixed(2) + ' 個百分點';
    $('#dRate').setAttribute('aria-valuetext', $('#dRateVal').textContent);
    Object.entries({ shy: 2, ief: 7.4, tlt: 16.5 }).forEach(function (pair) {
      var change = M.durationChange(pair[1], delta), bar = $('#bar-' + pair[0]);
      bar.style.width = M.durationBarWidth(change) + '%';
      bar.classList.toggle('neg', change < 0);
      $('#pc-' + pair[0]).textContent = pct(change, 1, true);
      $('#pc-' + pair[0]).style.color = change >= 0 ? P.positive : P.negative;
    });
  }
  $('#rate').addEventListener('input', renderSeesaw); $('#dRate').addEventListener('input', renderDuration);

  var state = { scenario: 'cut', currency: 'HKD', principal: 100000, grossYield: M.DEFAULTS.grossYield, reinvest: true, inflation: false, sensitivity: true, showShock: false, target: 0.03, targetYears: 8, frame: 20, playing: false };
  var cache = {}, bandCache = null, raf = 0, autoDone = false, autoObserver = null;
  function modelOptions() { return { grossYield: state.grossYield, target: state.target, targetYears: state.targetYears, years: 30 }; }
  function rowsFor(key) { if (!cache[key]) cache[key] = M.computeRows(M.scenarioPath(key, modelOptions())); return cache[key]; }
  function bandForCurrent() {
    if (!bandCache) bandCache = M.sensitivity(M.scenarioPath(state.scenario, Object.assign({}, modelOptions(), { years: 20 })), {}, state.reinvest);
    return bandCache;
  }
  function invalidate() { cache = {}; bandCache = null; }
  function scenarioDescription() {
    var start = pct(state.grossYield, 1);
    if (state.scenario === 'cut') return '純假設：長債息由 ' + start + '，5 年內去到 3.0%，之後保持不變。';
    if (state.scenario === 'flat') return '純假設：長債息 20 年保持 ' + start + '，用嚟示範累積收入。';
    if (state.scenario === 'infl') return '純假設：長債息由 ' + start + '，10 年內去到 6.5%，之後保持不變。';
    if (state.scenario === 'shock') return '壓力情境（唔係 2022 歷史重播）：兩年內升 2 個百分點，再用 13 年回落至 ' + pct(state.grossYield - 0.005, 1) + '。唔代表最壞可能情況。';
    return '自訂假設：由 ' + start + '，用 ' + state.targetYears + ' 年去到 ' + pct(state.target, 1) + '，之後保持不變。';
  }
  function visibleScenario(key) { return key !== 'shock' || state.showShock || state.scenario === 'shock'; }

  var svg = $('#simsvg'), wrap = $('.chartwrap'), tip = $('#simtip');
  var W = 900, H = 540, left = 76, right = 24, top = 20, bottom = 40, plotW = W - left - right, plotH = H - top - bottom, maxY = 1;
  var grid = svgNode('g', {}, svg), band = svgNode('polygon', { 'aria-hidden': 'true', stroke: 'none' }, svg), comparisons = svgNode('g', { 'aria-hidden': 'true' }, svg), paths = {};
  M.SCENARIOS.forEach(function (s) { paths[s.key] = svgNode('path', { id: 'path-' + s.key, fill: 'none', 'stroke-width': 2.4, 'stroke-dasharray': '0.5 9', 'stroke-linecap': 'round' }, comparisons); });
  var realPath = svgNode('path', { id: 'real-value-path', fill: 'none', 'stroke-width': 2, 'stroke-dasharray': '8 5', 'aria-hidden': 'true' }, svg);
  var selectedPath = svgNode('path', { id: 'selected-path', fill: 'none', 'stroke-width': 4.5, 'stroke-linecap': 'round', 'aria-hidden': 'true' }, svg);
  var axes = svgNode('g', {}, svg), scan = svgNode('line', { 'stroke-width': 1.2, 'stroke-dasharray': '4 4', 'aria-hidden': 'true' }, svg), dot = svgNode('circle', { r: 5.5, 'stroke-width': 2, 'aria-hidden': 'true' }, svg);
  function x(t) { return left + t / 20 * plotW; }
  function y(v) { return top + (1 - v / maxY) * plotH; }
  function niceTop(v) { var step = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))) / 4; return Math.ceil(v / step) * step; }
  function path(rows, frame, real) {
    var points = [], full = Math.floor(frame);
    for (var t = 0; t <= full; t++) points.push({ t: t, v: M.value(rows[t], state.reinvest) });
    if (frame > full) points.push({ t: frame, v: M.value(M.rowAt(rows, frame), state.reinvest) });
    return points.map(function (p, i) { var value = p.v * state.principal / (real ? Math.pow(1 + M.DEFAULTS.inflation, p.t) : 1); return (i ? 'L ' : 'M ') + x(p.t) + ' ' + y(value); }).join(' ');
  }
  function renderChartBase() {
    var maximum = 1;
    M.SCENARIOS.forEach(function (s) { if (visibleScenario(s.key)) rowsFor(s.key).slice(0, 21).forEach(function (r) { maximum = Math.max(maximum, M.value(r, state.reinvest)); }); });
    var range = state.sensitivity ? bandForCurrent() : null;
    if (range) range.forEach(function (p) { maximum = Math.max(maximum, p.high); });
    maxY = niceTop(maximum * state.principal * 1.08);
    grid.replaceChildren(); axes.replaceChildren();
    for (var i = 0; i <= 4; i++) {
      var amount = maxY * i / 4;
      svgNode('line', { x1: left, x2: W - right, y1: y(amount), y2: y(amount), stroke: P.grid }, grid);
      var label = svgNode('text', { x: left - 9, y: y(amount) + 5, fill: P.axis, 'font-size': 14, 'text-anchor': 'end' }, axes);
      label.textContent = money(amount, state.currency, true).replace(/,000$/, 'K');
    }
    [0, 5, 10, 15, 20].forEach(function (t) { var n = svgNode('text', { x: x(t), y: H - 12, fill: P.axis, 'font-size': 14, 'text-anchor': 'middle' }, axes); n.textContent = t + (t ? ' 年' : '（起點）'); });
    svgNode('line', { x1: left, x2: W - right, y1: y(state.principal), y2: y(state.principal), stroke: P.axis, 'stroke-width': 1.2, 'stroke-dasharray': '7 6' }, axes);
    var base = svgNode('text', { x: W - right - 5, y: y(state.principal) - 8, fill: P.axis, 'font-size': 13, 'text-anchor': 'end' }, axes); base.textContent = '本金 ' + money(state.principal, state.currency, true);
    M.SCENARIOS.forEach(function (s) {
      paths[s.key].setAttribute('stroke', P.scenarios[s.key]);
      paths[s.key].setAttribute('d', s.key === state.scenario || !visibleScenario(s.key) ? '' : path(rowsFor(s.key), 20));
    });
    band.hidden = !range;
    band.setAttribute('display', range ? 'inline' : 'none');
    if (range) {
      var points = range.map(function (p) { return x(p.t) + ',' + y(p.high * state.principal); }).concat(range.slice().reverse().map(function (p) { return x(p.t) + ',' + y(p.low * state.principal); }));
      band.setAttribute('points', points.join(' ')); band.setAttribute('fill', P.scenarios[state.scenario] + '18');
    }
    realPath.setAttribute('stroke', P.axis); realPath.setAttribute('display', state.inflation ? 'inline' : 'none');
  }
  function yearLabel(frame) {
    var text = frame.toFixed(2).replace(/\.?0+$/, '');
    return '第 ' + text + ' 年' + (Number.isInteger(frame) ? '' : '（插值）');
  }
  function renderFrame(frame, announce) {
    state.frame = M.clamp(frame, 0, 20);
    var row = M.rowAt(rowsFor(state.scenario), state.frame), a = M.attribution(row, state.reinvest), B = state.principal, frameText = yearLabel(state.frame), color = P.scenarios[state.scenario];
    selectedPath.setAttribute('stroke', color); selectedPath.dataset.scenario = state.scenario; selectedPath.setAttribute('d', path(rowsFor(state.scenario), state.frame));
    if (state.inflation) realPath.setAttribute('d', path(rowsFor(state.scenario), state.frame, true));
    scan.setAttribute('stroke', P.scan); scan.setAttribute('x1', x(state.frame)); scan.setAttribute('x2', x(state.frame)); scan.setAttribute('y1', top); scan.setAttribute('y2', H - bottom);
    dot.setAttribute('fill', color); dot.setAttribute('stroke', P.ring); dot.setAttribute('cx', x(state.frame)); dot.setAttribute('cy', y(a.total * B));
    $('#scrub').value = state.frame; $('#scrub').setAttribute('aria-valuetext', frameText);
    $('#frameYear').textContent = frameText;
    $('#cnt-year-t').textContent = frameText + ' · 總資產' + (state.reinvest ? '（再投資）' : '（包含現金）');
    $('#cnt-income-label').textContent = state.reinvest ? '累計模型派息（已再投資）' : '累計模型派息（保留現金）';
    setMoney('#cnt-total', a.total * B, a.total >= 1 ? P.gold : P.negative);
    var cagr = state.frame >= 1 ? Math.pow(a.total, 1 / state.frame) - 1 : null;
    $('#cnt-cagr').textContent = cagr === null ? '—' : pct(cagr, 2, true); $('#cnt-cagr').style.color = cagr === null || cagr >= 0 ? P.positive : P.negative;
    setSignedMoney('#cnt-income', a.income * B, P.positive); setSignedMoney('#cnt-price', a.market * B, a.market >= 0 ? P.positive : P.negative);
    setSignedMoney('#cnt-div', a.annualIncome * B, P.gold, '\u00a0/年');
    $('#cnt-real-box').hidden = !state.inflation; if (state.inflation) setMoney('#cnt-real', a.total * B / Math.pow(1 + M.DEFAULTS.inflation, state.frame));
    updateDetail(state.frame, '目前檢視');
    if (announce) $('#chart-status').textContent = $('#chart-detail').textContent;
  }
  function updateDetail(year, prefix) {
    var r = M.rowAt(rowsFor(state.scenario), year), a = M.attribution(r, state.reinvest);
    $('#chart-detail').textContent = prefix + '：' + yearLabel(year) + ' ｜ 假設長債息 ' + pct(r.y, 2) + ' ｜ 總資產 ' + money(a.total * state.principal, state.currency) + ' ｜ 本年度模型派息 ' + money(a.annualIncome * state.principal, state.currency) + (state.reinvest ? '（再投資）' : '（保留現金）');
  }
  function hideTooltip() { tip.hidden = true; }
  function renderTooltip(year, event) {
    var r = rowsFor(state.scenario)[year], a = M.attribution(r, state.reinvest), B = state.principal;
    tip.innerHTML = '<div class="yr">第 ' + year + ' 年 · 假設債息 ' + pct(r.y, 2) + '</div>' +
      '<div class="row"><span>總資產</span><b>' + money(a.total * B, state.currency) + '</b></div>' +
      '<div class="row"><span>累計模型派息</span><span class="green">' + signedMoney(a.income * B, state.currency) + '</span></div>' +
      '<div class="row"><span>市場價格影響</span><span style="color:' + (a.market >= 0 ? P.positive : P.negative) + '">' + signedMoney(a.market * B, state.currency) + '</span></div>' +
      '<div class="row"><span>該年模型派息</span><span class="gold">' + money(a.annualIncome * B, state.currency) + '</span></div>';
    tip.hidden = false;
    var bounds = wrap.getBoundingClientRect(), width = tip.offsetWidth, height = tip.offsetHeight;
    var tx = event.clientX - bounds.left + 15, ty = event.clientY - bounds.top - height - 10;
    if (tx + width > bounds.width - 8) tx = event.clientX - bounds.left - width - 15;
    tip.style.left = M.clamp(tx, 8, Math.max(8, bounds.width - width - 8)) + 'px';
    tip.style.top = M.clamp(ty, 8, Math.max(8, bounds.height - height - 8)) + 'px';
  }
  function yearFromPointer(event) {
    var bounds = svg.getBoundingClientRect(), xx = (event.clientX - bounds.left) / bounds.width * W;
    if (xx < left || xx > W - right) return null;
    return M.clamp(Math.round((xx - left) / plotW * 20), 0, 20);
  }
  svg.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') return; var year = yearFromPointer(e); if (year === null) { hideTooltip(); return; } renderTooltip(year, e); updateDetail(year, '滑鼠檢視'); });
  svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hideTooltip(); updateDetail(state.frame, '目前檢視'); } });
  var pointerStart = null;
  svg.addEventListener('pointerdown', function (e) { pointerStart = { x: e.clientX, y: e.clientY }; });
  svg.addEventListener('pointerup', function (e) {
    if (!pointerStart || Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 12) { pointerStart = null; return; }
    var year = yearFromPointer(e); pointerStart = null;
    if (year !== null) { stopAnimation(); autoDone = true; renderFrame(year, true); renderTooltip(year, e); }
  });
  svg.addEventListener('keydown', function (e) {
    var year = null;
    if (e.key === 'ArrowLeft') year = Math.round(state.frame) - 1;
    if (e.key === 'ArrowRight') year = Math.round(state.frame) + 1;
    if (e.key === 'Home') year = 0;
    if (e.key === 'End') year = 20;
    if (year !== null) { e.preventDefault(); stopAnimation(); autoDone = true; hideTooltip(); renderFrame(M.clamp(year, 0, 20), true); }
  });

  function stopAnimation() { cancelAnimationFrame(raf); state.playing = false; $('#btnPlay').textContent = reducedMotion ? '顯示完整結果' : state.frame >= 20 ? '重播動畫' : '繼續動畫'; }
  function animate(restart) {
    stopAnimation(); hideTooltip();
    if (reducedMotion) { renderFrame(20, true); stopAnimation(); return; }
    var from = restart || state.frame >= 20 ? 0 : state.frame, started = null;
    renderFrame(from); state.playing = true; $('#btnPlay').textContent = '暫停動畫';
    function step(ts) {
      if (!state.playing) return;
      if (started === null) started = ts;
      var p = M.clamp((ts - started) / 4000, 0, 1), eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      renderFrame(from + (20 - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else { renderFrame(20, true); stopAnimation(); }
    }
    raf = requestAnimationFrame(step);
  }
  $('#btnPlay').addEventListener('click', function () { autoDone = true; if (autoObserver) autoObserver.disconnect(); if (state.playing) stopAnimation(); else animate(false); });
  $('#scrub').addEventListener('input', function () { stopAnimation(); autoDone = true; hideTooltip(); renderFrame(Number(this.value)); });
  $('#scrub').addEventListener('change', function () { renderFrame(Number(this.value), true); });

  var legendButtons = {};
  M.SCENARIOS.forEach(function (s) {
    var b = document.createElement('button'); b.className = 'legend-item'; b.type = 'button'; b.dataset.scenario = s.key;
    var sw = document.createElement('span'); sw.className = 'sw'; sw.setAttribute('aria-hidden', 'true'); b.appendChild(sw);
    var text = document.createElement('span'); text.textContent = s.name; b.appendChild(text);
    var hidden = document.createElement('span'); hidden.className = 'hidden-note'; b.appendChild(hidden);
    b.addEventListener('click', function () { selectScenario(s.key); }); $('#simlegend').appendChild(b); legendButtons[s.key] = b;
  });
  function renderLegend() {
    M.SCENARIOS.forEach(function (s) {
      var active = s.key === state.scenario, b = legendButtons[s.key], sw = b.querySelector('.sw');
      b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
      sw.style.borderTop = (active ? '4px solid ' : '3px dotted ') + P.scenarios[s.key];
      b.querySelector('.hidden-note').textContent = !visibleScenario(s.key) ? '未顯示' : '';
    });
    all('.scen').forEach(function (b) { var active = b.dataset.scen === state.scenario; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  }
  function renderTable() {
    var rows = '', B = state.principal, mode = state.reinvest ? '再投資' : '收現金';
    M.SCENARIOS.forEach(function (s) {
      var data = rowsFor(s.key), stats = M.stats(data, state.reinvest, 20), income = M.attribution(data[20], state.reinvest).income;
      rows += '<tr' + (s.key === state.scenario ? ' class="cur"' : '') + '><th scope="row"><span class="dot" style="background:' + P.scenarios[s.key] + '"></span>' + s.name + '</th><td><b>' + money(stats.finalValue * B, state.currency) + '</b></td><td>' + pct(stats.cagr, 2, true) + '</td><td>' + money(stats.minValue * B, state.currency) + '（第 ' + stats.minYear + ' 年）</td><td>' + (stats.maxDrawdown === 0 ? '0.0%' : '−' + pct(stats.maxDrawdown, 1)) + '</td><td>' + money(income * B, state.currency) + '</td></tr>';
    });
    $('#tbl-compare').innerHTML = '<caption>20 年情境比較 · ' + mode + ' · 現金利息 0% · 非預測</caption><thead><tr><th scope="col">劇本</th><th scope="col">20 年總資產</th><th scope="col">年化總回報</th><th scope="col">年度點最低總值</th><th scope="col">年度點最大回撤</th><th scope="col">累計模型派息</th></tr></thead><tbody>' + rows + '</tbody>';
  }
  function renderBond() {
    var years = Number($('#bYears').value), ytm = Number($('#bRate').value) / 100, coupon = Number($('#bCoupon').value) / 100, reinvestRate = Number($('#bReinvest').value) / 100;
    var bond = M.couponBond({ investment: state.principal, years: years, couponRate: coupon, ytm: ytm, reinvestRate: reinvestRate, reinvest: state.reinvest });
    $('#bYearsVal').textContent = years + ' 年'; $('#bRateVal').textContent = pct(ytm, 2); $('#bCouponVal').textContent = pct(coupon, 2);
    $('#bReinvest').disabled = !state.reinvest; $('#bReinvestVal').textContent = state.reinvest ? pct(reinvestRate, 2) : '不適用（保留現金）';
    ['bYears', 'bRate', 'bCoupon', 'bReinvest'].forEach(function (id) { $('#' + id).setAttribute('aria-valuetext', $('#' + id + 'Val').textContent); });
    $('#ro-b-inc').innerHTML = money(bond.annualCoupon, state.currency, true) + '/年<span class="subvalue">每半年 ' + money(bond.semiannualCoupon, state.currency) + '</span>';
    setMoney('#ro-b-face', bond.face, P.ink); setMoney('#ro-b-final', bond.terminalValue, P.positive);
    $('#ro-b-final-label').textContent = '假設 ' + years + ' 年後總財富（非保證）';
    $('#bond-assumptions').textContent = '同上方一樣：' + (state.reinvest ? '票息再投資（直債另用 ' + pct(reinvestRate, 2) + ' 假設年率）' : '票息保留現金、利息 0%') + '。每 US$1,000 面值估算買入價 US$' + bond.pricePer1000.toFixed(2) + '；所選本金單位唔係實際匯率換算。';
    $('#bond-compare-title').textContent = '同本金、同 ' + years + ' 年、同' + (state.reinvest ? '再投資模式' : '收現金模式') + '比較（兩者都係假設）';
    $('#ro-b-vs').innerHTML = M.SCENARIOS.map(function (s) {
      var comparison = M.compareAtHorizon(rowsFor(s.key), bond, state.reinvest);
      return '<div class="bond-comparison-row"><span>' + s.name + '：' + money(comparison.tltValue, state.currency) + '</span><span style="color:' + (comparison.difference >= 0 ? P.positive : P.negative) + '">直債假設值' + (comparison.difference >= 0 ? '較高 ' : '較低 ') + pct(comparison.difference, 1) + '</span></div>';
    }).join('');
  }
  function refresh() {
    hideTooltip(); $('#scen-desc').textContent = scenarioDescription();
    $('#custom-panel').hidden = state.scenario !== 'custom';
    $('#cTargetVal').textContent = pct(state.target, 1); $('#cYearsVal').textContent = state.targetYears + ' 年';
    $('#cTarget').setAttribute('aria-valuetext', $('#cTargetVal').textContent); $('#cYears').setAttribute('aria-valuetext', $('#cYearsVal').textContent);
    renderChartBase(); renderFrame(state.frame); renderLegend(); renderTable(); renderBond();
  }
  function selectScenario(key) {
    stopAnimation(); autoDone = true; if (autoObserver) autoObserver.disconnect(); state.scenario = key; bandCache = null;
    state.frame = 20; refresh(); animate(true);
  }
  all('.scen').forEach(function (b) { b.addEventListener('click', function () { selectScenario(b.dataset.scen); }); });
  $('#principal').addEventListener('change', function () { state.principal = numberInRange(this, 1000, 1e8, 100000); refresh(); });
  $('#currency').addEventListener('change', function () { state.currency = this.value; refresh(); });
  $('#startYield').addEventListener('change', function () { stopAnimation(); state.grossYield = numberInRange(this, 1, 10, 5.5) / 100; invalidate(); state.frame = 20; refresh(); });
  $('#cTarget').addEventListener('input', function () { stopAnimation(); state.target = Number(this.value) / 100; invalidate(); state.frame = 20; refresh(); });
  $('#cYears').addEventListener('input', function () { stopAnimation(); state.targetYears = Number(this.value); invalidate(); state.frame = 20; refresh(); });
  ['cTarget', 'cYears'].forEach(function (id) { $('#' + id).addEventListener('change', function () { autoDone = true; animate(true); }); });
  $('#optReinvest').addEventListener('change', function () { state.reinvest = this.checked; bandCache = null; refresh(); });
  $('#optInflation').addEventListener('change', function () { state.inflation = this.checked; refresh(); });
  $('#optVol').addEventListener('change', function () { state.sensitivity = this.checked; refresh(); });
  $('#optShock').addEventListener('change', function () { state.showShock = this.checked; refresh(); });
  ['bYears', 'bRate', 'bCoupon', 'bReinvest'].forEach(function (id) { $('#' + id).addEventListener('input', renderBond); });
  document.addEventListener('themechange', function () { renderSeesaw(); renderDuration(); refresh(); });
  document.addEventListener('motionchange', function () { if (reducedMotion) { stopAnimation(); renderFrame(20); } else stopAnimation(); });
  renderSeesaw(); renderDuration(); refresh(); stopAnimation();
  autoObserver = new IntersectionObserver(function (entries) {
    if (!autoDone && entries.some(function (e) { return e.isIntersecting; })) {
      autoDone = true; autoObserver.disconnect(); if (!reducedMotion) animate(true);
    }
  }, { threshold: 0.15 });
  autoObserver.observe(wrap);
})();
