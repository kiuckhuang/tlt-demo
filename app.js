'use strict';
/* TLT interactive explainer — data as of 2026-09-25 (Yahoo Finance) */
window.addEventListener('error', function (e) { document.title = 'JSERROR: ' + (e.message || 'unknown'); });

/* ---------- helpers ---------- */
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
var NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  var el = document.createElementNS(NS, tag);
  for (var k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtMoney(v, cur) {
  var sym = cur === 'HKD' ? 'HK$' : 'US$';
  return sym + Math.round(v).toLocaleString('en-US');
}
function fmtCompact(v, cur) {
  var sym = cur === 'HKD' ? 'HK$' : '$';
  if (v >= 1e6) return sym + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return sym + Math.round(v / 1e3) + 'K';
  return sym + Math.round(v);
}
function fmtPct(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + '%'; }
function signPct(v, d) { return (v >= 0 ? '+' : '−') + fmtPct(Math.abs(v), d); }

/* ---------- theme palette (read from CSS variables, refreshed on theme change) ---------- */
var PALETTE = {};
function refreshPalette() {
  var cs = getComputedStyle(document.documentElement);
  PALETTE = {
    grid: cs.getPropertyValue('--c-grid').trim() || '#26335a',
    axis: cs.getPropertyValue('--c-axis').trim() || '#9fb0d8',
    scan: cs.getPropertyValue('--c-scan').trim() || 'rgba(255,255,255,.35)',
    dotring: cs.getPropertyValue('--c-dotring').trim() || '#0b1220',
    dotfill: cs.getPropertyValue('--c-dotfill').trim() || '#1a2748',
    tipbg: cs.getPropertyValue('--c-tipbg').trim(),
    ink: cs.getPropertyValue('--c-ink').trim() || '#e8eefc'
  };
}
refreshPalette();

/* ---------- constants (2026-09-25) ---------- */
var P0 = 79.32;        // TLT close
var Y0 = 0.055;        // forward portfolio yield ≈ market 20Y yield 5.54% (2026-09-25); Yahoo's 4.73% is trailing distributions
var FEE = 0.0015;      // expense ratio
var DUR = 16.5;        // effective duration (approx)
var VOL = 0.15;        // annualised vol for band
var INF = 0.025;       // inflation assumption
var YEARS = 20;

function bondFinal(B, r, n) { return B * Math.pow(1 + r, n); }  // hold-to-maturity, coupons reinvested at YTM

/* ---------- scenario yield paths ---------- */
function linPath(y0, y1, until) {
  var ys = [y0];
  for (var t = 1; t <= YEARS; t++) {
    if (t <= until) ys.push(y0 + (y1 - y0) * t / until);
    else ys.push(y1);
  }
  return ys;
}
function shockPath() {
  var ys = [Y0];
  for (var t = 1; t <= YEARS; t++) {
    var y;
    if (t === 1) y = Y0 + 0.010;
    else if (t === 2) y = Y0 + 0.020;
    else if (t <= 15) y = Y0 + 0.020 - (0.025) * (t - 2) / 13;   // back to 5.0% by yr15
    else y = Y0 - 0.005;
    ys.push(y);
  }
  return ys;
}
var SCENARIOS = {
  cut:   { name: '減息週期', color: '#22c55e', desc: '經濟放緩，聯儲局減息：20 年債息 5 年內 5.5% → 3.0%，之後橫行。', ys: linPath(Y0, 0.030, 5) },
  flat:  { name: '風平浪靜', color: '#3b82f6', desc: '債息 20 年都喺 5.5% 附近——純收息劇本。', ys: (function () { var a = []; for (var i = 0; i <= YEARS; i++) a.push(Y0); return a; })() },
  infl:  { name: '通脹重燃', color: '#ca8a04', desc: '通脹回歸，債息 10 年內 5.5% → 6.5%，之後橫行。', ys: linPath(Y0, 0.065, 10) },
  shock: { name: '2022 重演', color: '#ef4444', desc: '兩年內債息急升 2 厘（似 2022 年劇本），之後 13 年慢慢回落至 5.0%。', ys: shockPath() },
  custom:{ name: '自訂', color: '#9333ea', desc: '', ys: null }
};
function customYs(target, years) { return linPath(Y0, target, years); }

/* ---------- simulation ---------- */
function computeRows(ys) {
  var rows = [{ t: 0, y: ys[0], carry: ys[0] - FEE, pRet: 0, nav: 1, price: 1, cash: 0, inc: 0, navNr: 1 }];
  for (var t = 1; t <= YEARS; t++) {
    var prev = rows[t - 1];
    var carry = ys[t - 1] - FEE;                 // distribution yield during year t
    var pRet = -DUR * (ys[t] - ys[t - 1]);       // price return from rate move
    var price = prev.price * (1 + pRet);
    var nav = prev.nav * (1 + carry) * (1 + pRet);        // reinvested
    var cash = prev.cash + carry * prev.price;            // dividends kept as cash (no reinvest)
    var navNr = price + cash;                             // total value if NOT reinvested
    var inc = carry * prev.nav;                           // this year's dividend (per initial unit)
    rows.push({ t: t, y: ys[t], carry: carry, pRet: pRet, nav: nav, price: price, cash: cash, inc: inc, navNr: navNr });
  }
  return rows;
}
function rowAt(rows, f) {
  var i = Math.floor(f), frac = f - i;
  if (i >= YEARS) i = YEARS - 1, frac = 1;
  var a = rows[i], b = rows[i + 1];
  function l(k) { return a[k] + (b[k] - a[k]) * frac; }
  return { t: f, y: l('y'), carry: l('carry'), nav: l('nav'), price: l('price'), cash: l('cash'), inc: l('inc'), navNr: l('navNr') };
}
function stats(ys) {
  var rows = computeRows(ys);
  var nav20 = rows[YEARS].nav, cagr = Math.pow(nav20, 1 / YEARS) - 1;
  var minNav = 1, minYr = 0, peak = 1, maxDD = 0;
  for (var t = 1; t <= YEARS; t++) {
    var v = rows[t].nav;
    if (v < minNav) { minNav = v; minYr = t; }
    peak = Math.max(peak, v);
    maxDD = Math.max(maxDD, 1 - v / peak);
  }
  var noRe = computeRows(ys);
  return { rows: rows, nav20: nav20, cagr: cagr, minNav: minNav, minYr: minYr, maxDD: maxDD, incomeTotal: noRe[YEARS].cash, navNr20: noRe[YEARS].navNr };
}

/* ================= S1 count-up ================= */
(function () {
  var done = false;
  function run() {
    if (done) return; done = true;
    $all('.fact .v').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
      var pre = el.getAttribute('data-prefix') || '';
      var suf = el.getAttribute('data-suffix') || '';
      var t0 = null, dur = 1200;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = clamp((ts - t0) / dur, 0, 1);
        p = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + (target * p).toFixed(dec) + suf;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }
  var obs = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) run(); }); }, { threshold: 0.3 });
  var facts = $('#sec-what'); if (facts) obs.observe(facts);
  setTimeout(run, 3000); // fallback
})();

/* ================= S3 seesaw ================= */
(function () {
  var slider = $('#rate');
  function bondPV(y) { // 30y, 4.5% coupon, face 1000
    var pv = 0;
    for (var k = 1; k <= 30; k++) pv += 45 / Math.pow(1 + y, k);
    pv += 1000 / Math.pow(1 + y, 30);
    return pv;
  }
  function upd() {
    var y = parseFloat(slider.value) / 100;
    var dy = y - 0.055;
    $('#rateVal').textContent = fmtPct(y, 2);
    var ang = clamp(dy * 100 * 1.4, -18, 18);
    $('#plank').setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' 380 218)');
    var tlt = P0 * (1 - DUR * dy);
    var tltPct = -DUR * dy;
    $('#sw-rate').textContent = fmtPct(y, 2);
    $('#sw-price').textContent = tlt.toFixed(2);
    $('#sw-arrow-l').textContent = dy > 0.001 ? '↑' : (dy < -0.001 ? '↓' : '•');
    $('#sw-arrow-r').textContent = dy > 0.001 ? '↓' : (dy < -0.001 ? '↑' : '•');
    $('#ro-delta').textContent = signPct(dy, 2) + ' pp';
    $('#ro-delta').style.color = dy > 0.001 ? '#f87171' : (dy < -0.001 ? '#4ade80' : '#e8eefc');
    $('#ro-tlt').textContent = 'US$' + tlt.toFixed(2) + '（' + signPct(tltPct, 1) + '）';
    $('#ro-tlt').style.color = tltPct > 0.001 ? '#4ade80' : (tltPct < -0.001 ? '#f87171' : '#e8eefc');
    var pv = bondPV(y);
    $('#ro-bond').textContent = 'US$' + pv.toFixed(0) + '（' + signPct(pv / 1000 - 1, 1) + ' vs 面值）';
    $('#ro-bond').style.color = pv >= 1000 ? '#4ade80' : '#f87171';
  }
  slider.addEventListener('input', upd); upd();
})();

/* ================= S4 duration bars ================= */
(function () {
  var D = { shy: 2, ief: 7.4, tlt: 16.5 };
  var slider = $('#dRate');
  function upd() {
    var dr = parseFloat(slider.value) / 100;
    $('#dRateVal').textContent = signPct(dr, 2);
    ['shy', 'ief', 'tlt'].forEach(function (k) {
      var chg = -D[k] * dr;
      var w = clamp(Math.abs(chg) / 50 * 100, 0.5, 100);
      var bar = $('#bar-' + k);
      bar.style.width = w + '%';
      bar.className = 'barfill ' + (chg >= 0 ? 'pos' : 'neg');
      var pc = $('#pc-' + k);
      pc.textContent = signPct(chg, 1);
      pc.style.color = chg >= 0 ? '#4ade80' : '#f87171';
    });
  }
  slider.addEventListener('input', upd); upd();
})();

/* ================= S5 simulator ================= */
(function () {
  var state = { scen: 'cut', cur: 'HKD', B: 100000, reinvest: true, inflation: false, vol: true, showShock: false, f: 0, playing: false };
  var custom = { target: 0.03, years: 8 };
  var rowsCache = {};
  function getRows(key) {
    if (!rowsCache[key]) {
      var ys = key === 'custom' ? customYs(custom.target, custom.years) : SCENARIOS[key].ys;
      rowsCache[key] = computeRows(ys);
    }
    return rowsCache[key];
  }
  function getYs(key) {
    return key === 'custom' ? customYs(custom.target, custom.years) : SCENARIOS[key].ys;
  }

  /* ----- chart scaffolding ----- */
  var W = 900, H = 540, PL = 74, PR = 16, PT = 14, PB = 34;
  var plotW = W - PL - PR, plotH = H - PT - PB;
  var svg = $('#simsvg');
  function xS(t) { return PL + t / YEARS * plotW; }
  function yMax() {
    var m = 0;
    Object.keys(SCENARIOS).forEach(function (k) {
      var ys = getYs(k); var rows = getRows(k);
      rows.forEach(function (r) { m = Math.max(m, r.nav); });
    });
    var top = state.vol ? m * (1 + Math.min(0.40, VOL * Math.sqrt(YEARS))) : m * 1.12;
    var v = top * state.B;
    var pow = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / (pow / 4)) * (pow / 4);
  }
  var yM = 1;
  function yS(v) { return PT + (1 - v / yM) * plotH; }

  var gGrid, gBand, gLines, gAxes, gScan, tip = $('#simtip');
  var navPath, realPath, bandPoly, scanLine, scanDot;
  var otherPaths = {};

  function build() {
    gGrid = svgEl('g', {}, svg);
    gBand = svgEl('g', {}, svg);
    gLines = svgEl('g', {}, svg);
    gAxes = svgEl('g', {}, svg);
    bandPoly = svgEl('polygon', { fill: 'rgba(255,255,255,0.05)', stroke: 'none' }, gBand);
    realPath = svgEl('path', { fill: 'none', stroke: PALETTE.axis, 'stroke-width': 2, 'stroke-dasharray': '7 5', opacity: 0.9 }, gLines);
    // other scenarios: dotted lines, clearly different from the selected bold solid line
    Object.keys(SCENARIOS).forEach(function (k) {
      otherPaths[k] = svgEl('path', { fill: 'none', stroke: SCENARIOS[k].color, 'stroke-width': 2.4, opacity: 0.85, 'stroke-dasharray': '0.5 9', 'stroke-linecap': 'round' }, gLines);
    });
    navPath = svgEl('path', { fill: 'none', stroke: PALETTE.ink, 'stroke-width': 4, 'stroke-linecap': 'round' }, gLines);
    scanLine = svgEl('line', { stroke: PALETTE.scan, 'stroke-width': 1, 'stroke-dasharray': '4 4' }, svg);
    scanDot = svgEl('circle', { r: 5.5, fill: '#f5c542', stroke: PALETTE.dotring, 'stroke-width': 2 }, svg);
  }
  function drawStatic() {
    gGrid.innerHTML = ''; gAxes.innerHTML = '';
    var cur = state.cur;
    for (var i = 0; i <= 4; i++) {
      var v = yM * i / 4, yy = yS(v);
      svgEl('line', { x1: PL, y1: yy, x2: W - PR, y2: yy, stroke: PALETTE.grid, 'stroke-width': 1, opacity: i === 0 ? 0.9 : 0.6 }, gGrid);
      var tx = svgEl('text', { x: PL - 8, y: yy + 4, 'text-anchor': 'end', fill: PALETTE.axis, 'font-size': 12 }, gAxes);
      tx.textContent = fmtCompact(v, cur);
    }
    for (var t = 0; t <= YEARS; t += 5) {
      var xx = xS(t);
      var tx2 = svgEl('text', { x: xx, y: H - 10, 'text-anchor': 'middle', fill: PALETTE.axis, 'font-size': 12.5 }, gAxes);
      tx2.textContent = t + (t === 0 ? '（而家）' : ' 年');
    }
    // principal baseline
    svgEl('line', { x1: PL, y1: yS(state.B), x2: W - PR, y2: yS(state.B), stroke: PALETTE.axis, 'stroke-width': 1.2, 'stroke-dasharray': '7 6', opacity: 0.8 }, gAxes);
    var bl = svgEl('text', { x: W - PR - 4, y: yS(state.B) - 7, 'text-anchor': 'end', fill: PALETTE.axis, 'font-size': 12 }, gAxes);
    bl.textContent = '本金 ' + fmtCompact(state.B, cur);
  }
  function pathFor(rows, f, key, B) {
    var d = 'M ' + xS(0) + ' ' + yS(B);
    var full = Math.floor(f);
    for (var t = 1; t <= full; t++) d += ' L ' + xS(t) + ' ' + yS(rows[t][key] * B);
    if (full < f && f > 0) {
      var fr = f - full;
      var v = rows[full][key] + (rows[full + 1][key] - rows[full][key]) * fr;
      d += ' L ' + xS(f) + ' ' + yS(v * B);
    }
    return d;
  }
  function drawFrame(f) {
    state.f = f;
    yM = yMax(); drawStatic();
    var rows = getRows(state.scen), B = state.B;
    var col = state.scen === 'custom' ? SCENARIOS.custom.color : SCENARIOS[state.scen].color;
    navPath.setAttribute('stroke', col);
    var key = state.reinvest ? 'nav' : 'navNr';
    navPath.setAttribute('d', pathFor(rows, f, key, B));
    // others dotted (extreme 2022 scenario hidden unless enabled or selected)
    Object.keys(SCENARIOS).forEach(function (k) {
      if (k === state.scen || (k === 'shock' && !state.showShock)) { otherPaths[k].setAttribute('d', ''); return; }
      otherPaths[k].setAttribute('d', pathFor(getRows(k), YEARS, 'nav', B));
    });
    // band
    if (state.vol) {
      var pts = xS(0) + ',' + yS(B);
      for (var t = 1; t <= YEARS; t++) {
        var w = Math.min(0.40, VOL * Math.sqrt(t));
        pts += ' ' + xS(t) + ',' + yS(rows[t].nav * (1 + w) * B);
      }
      for (var u = YEARS; u >= 1; u--) {
        var w2 = Math.min(0.40, VOL * Math.sqrt(u));
        pts += ' ' + xS(u) + ',' + yS(Math.max(0, rows[u].nav * (1 - w2)) * B);
      }
      bandPoly.setAttribute('points', pts);
      bandPoly.setAttribute('fill', col + '18');
      bandPoly.setAttribute('display', '');
    } else bandPoly.setAttribute('display', 'none');
    // real line
    if (state.inflation) {
      var d = 'M ' + xS(0) + ' ' + yS(B);
      var full2 = Math.floor(f);
      for (var t2 = 1; t2 <= full2; t2++) d += ' L ' + xS(t2) + ' ' + yS(rows[t2][key] / Math.pow(1 + INF, t2) * B);
      if (full2 < f && f > 0) {
        var fr2 = f - full2;
        var v2 = rows[full2][key] + (rows[full2 + 1][key] - rows[full2][key]) * fr2;
        d += ' L ' + xS(f) + ' ' + yS(v2 / Math.pow(1 + INF, f) * B);
      }
      realPath.setAttribute('d', d); realPath.setAttribute('display', '');
    } else realPath.setAttribute('display', 'none');
    // scan
    var r = rowAt(rows, f);
    var vNow = r[key] * B;
    scanLine.setAttribute('stroke', PALETTE.scan);
    scanLine.setAttribute('x1', xS(f)); scanLine.setAttribute('x2', xS(f));
    scanLine.setAttribute('y1', PT); scanLine.setAttribute('y2', H - PB);
    scanLine.setAttribute('display', f > 0 ? '' : 'none');
    scanDot.setAttribute('cx', xS(f)); scanDot.setAttribute('cy', yS(vNow));
    scanDot.setAttribute('display', f > 0 ? '' : 'none');
    scanDot.setAttribute('fill', col);
    scanDot.setAttribute('stroke', PALETTE.dotring);
    updCounters(f, r, key, B);
  }
  function updCounters(f, r, key, B) {
    var vNow = r[key] * B;
    var yr = Math.round(f);
    $('#frameYear').textContent = '第 ' + yr + ' 年';
    $('#cnt-year-t').textContent = '第 ' + yr + ' 年 · 總資產' + (state.reinvest ? '（收息再投資）' : '（利息收現金）');
    $('#cnt-total').textContent = fmtMoney(vNow, state.cur);
    $('#cnt-total').style.color = vNow >= B ? '#f5c542' : '#f87171';
    var cagr = f > 0.5 ? Math.pow(vNow / B, 1 / f) - 1 : 0;
    var cg = $('#cnt-cagr');
    cg.textContent = f > 0.5 ? signPct(cagr, 2) : '—';
    cg.style.color = cagr >= 0 ? '#4ade80' : '#f87171';
    var incPart = state.reinvest ? (r.nav - r.price) * B : r.cash * B;
    var prPart = (r.price - 1) * B;
    $('#cnt-income').textContent = '+ ' + fmtMoney(Math.max(0, incPart), state.cur);
    var cp = $('#cnt-price');
    cp.textContent = (prPart >= 0 ? '+ ' : '− ') + fmtMoney(Math.abs(prPart), state.cur);
    cp.style.color = prPart >= 0 ? '#4ade80' : '#f87171';
    $('#cnt-div').textContent = (f > 0 ? '+ ' : '') + fmtMoney(Math.max(0, r.inc) * B / 1, state.cur) + ' /年';
    if (state.inflation) {
      $('#cnt-real-box').style.display = '';
      $('#cnt-real').textContent = fmtMoney(vNow / Math.pow(1 + INF, f), state.cur);
    } else $('#cnt-real-box').style.display = 'none';
  }

  /* ----- interaction ----- */
  var btnPlay = $('#btnPlay'), scrub = $('#scrub'), raf = null;
  function play() {
    if (state.playing) return;
    state.playing = true;
    btnPlay.textContent = '⏸ 暫停';
    var from = state.f >= YEARS - 0.01 ? 0 : state.f;
    var t0 = null, durMs = 4000;
    function step(ts) {
      if (!state.playing) return;
      if (!t0) t0 = ts;
      var p = clamp((ts - t0) / durMs, 0, 1);
      var ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var f = from + (YEARS - from) * ease;
      scrub.value = f;
      drawFrame(f);
      if (p < 1) raf = requestAnimationFrame(step);
      else { state.playing = false; btnPlay.textContent = '↺ 再播一次'; }
    }
    raf = requestAnimationFrame(step);
  }
  function pause() {
    state.playing = false; cancelAnimationFrame(raf);
    btnPlay.textContent = state.f >= YEARS - 0.01 ? '↺ 再播一次' : '▶ 繼續播放';
  }
  btnPlay.addEventListener('click', function () { state.playing ? pause() : play(); });
  scrub.addEventListener('input', function () { if (state.playing) pause(); drawFrame(parseFloat(scrub.value)); });

  /* ----- direct bond lock-in calculator ----- */
  function renderBond() {
    var n = parseInt($('#bYears').value, 10);
    var r = parseFloat($('#bRate').value) / 100;
    var cur = state.cur, B = state.B;
    $('#bYearsVal').textContent = n + ' 年';
    $('#bRateVal').textContent = (r * 100).toFixed(2) + '%';
    $('#ro-b-inc').textContent = '+ ' + fmtMoney(B * r, cur) + ' /年（半年派 ' + fmtMoney(B * r / 2, cur) + '）';
    var fin = bondFinal(B, r, n);
    var rf = $('#ro-b-final');
    rf.textContent = fmtMoney(fin, cur) + '（' + n + ' 年後・保證）';
    var lines = [];
    Object.keys(SCENARIOS).forEach(function (k) {
      if (k === 'custom') return;
      var s = stats(getYs(k));
      var v20 = s.nav20 * B;
      var diff = (fin / v20 - 1) * 100;
      lines.push('<div style="display:flex;justify-content:space-between;gap:10px;"><span>' + SCENARIOS[k].name + '</span><span style="color:' + (diff >= 0 ? '#4ade80' : '#f87171') + '">' + (diff >= 0 ? '贏 +' : '輸 −') + Math.abs(diff).toFixed(1) + '%</span></div>');
    });
    $('#ro-b-vs').innerHTML = lines.join('');
  }
  $('#bYears').addEventListener('input', renderBond);
  $('#bRate').addEventListener('input', renderBond);

  /* ----- legend ----- */
  var legendBox = $('#simlegend');
  function renderLegend() {
    var html = '';
    Object.keys(SCENARIOS).forEach(function (k) {
      var sw = k === state.scen
        ? '<span class="sw" style="background:' + SCENARIOS[k].color + ';width:22px;height:4px"></span>'
        : '<span class="sw" style="width:18px;height:0;border-radius:0;border-top:3px dotted ' + SCENARIOS[k].color + '"></span>';
      html += '<button class="legend-item' + (k === state.scen ? ' active' : '') + '" data-k="' + k + '" type="button">' +
        sw + SCENARIOS[k].name + '</button>';
    });
    html += '<span class="hint">虛點線＝其他劇本 · 粗實線＝現時劇本 · 撳一下切換</span>';
    legendBox.innerHTML = html;
  }
  legendBox.addEventListener('click', function (ev) {
    var it = ev.target.closest('.legend-item');
    if (!it) return;
    var btn = document.querySelector('.scen[data-scen="' + it.getAttribute('data-k') + '"]');
    if (btn) btn.click();
  });

  function refreshAll(resetFrame) {
    yM = yMax();
    // switching scenario/settings shows the full 20-year path immediately
    // (press play to watch it animate from year 0)
    drawFrame(resetFrame ? YEARS : state.f);
    renderTable();
    renderBond();
    renderLegend();
  }
  $all('.scen').forEach(function (b) {
    b.addEventListener('click', function () {
      $all('.scen').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      state.scen = b.getAttribute('data-scen');
      $('#custom-panel').style.display = state.scen === 'custom' ? '' : 'none';
      $('#scen-desc').textContent = state.scen === 'custom'
        ? '自訂：由 5.5% 開始，用 ' + custom.years + ' 年去到 ' + fmtPct(custom.target, 1) + '，之後橫行。'
        : SCENARIOS[state.scen].desc;
      refreshAll(true);
      if (state.playing) pause();
      play(); // auto-draw the selected scenario
    });
  });
  $('#cTarget').addEventListener('input', function () {
    custom.target = parseFloat(this.value) / 100;
    $('#cTargetVal').textContent = fmtPct(custom.target, 1);
    rowsCache.custom = null; refreshAll(true);
  });
  $('#cTarget').addEventListener('change', function () { play(); });
  $('#cYears').addEventListener('input', function () {
    custom.years = parseInt(this.value, 10);
    $('#cYearsVal').textContent = custom.years;
    rowsCache.custom = null; refreshAll(true);
  });
  $('#cYears').addEventListener('change', function () { play(); });
  $('#principal').addEventListener('change', function () {
    var v = parseFloat(this.value);
    if (isNaN(v)) v = 100000;
    state.B = clamp(v, 1000, 1e8);
    this.value = state.B;
    refreshAll(false);
  });
  $('#currency').addEventListener('change', function () { state.cur = this.value; refreshAll(false); });
  $('#optReinvest').addEventListener('change', function () { state.reinvest = this.checked; drawFrame(state.f); renderTable(); });
  $('#optInflation').addEventListener('change', function () { state.inflation = this.checked; drawFrame(state.f); });
  $('#optVol').addEventListener('change', function () { state.vol = this.checked; drawFrame(state.f); });
  $('#optShock').addEventListener('change', function () { state.showShock = this.checked; drawFrame(state.f); });

  /* ----- tooltip ----- */
  var chartwrap = $('.chartwrap');
  chartwrap.addEventListener('mousemove', function (ev) {
    var rect = svg.getBoundingClientRect();
    var px = (ev.clientX - rect.left) / rect.width * W;
    if (px < PL || px > W - PR) { tip.style.display = 'none'; return; }
    var t = clamp(Math.round((px - PL) / plotW * YEARS), 0, YEARS);
    var rows = getRows(state.scen), r = rows[t], B = state.B;
    var key = state.reinvest ? 'nav' : 'navNr';
    var col = state.scen === 'custom' ? SCENARIOS.custom.color : SCENARIOS[state.scen].color;
    var incPart = state.reinvest ? (r.nav - r.price) * B : r.cash * B;
    var prPart = (r.price - 1) * B;
    tip.innerHTML =
      '<div class="yr">第 ' + t + ' 年' + (t > 0 ? ' · 債息 ' + fmtPct(r.y, 2) : '') + '</div>' +
      '<div class="row"><span>總資產</span><b>' + fmtMoney(r[key] * B, state.cur) + '</b></div>' +
      '<div class="row"><span>累積收息</span><span class="green">+' + fmtMoney(Math.max(0, incPart), state.cur) + '</span></div>' +
      '<div class="row"><span>價格損益</span><span style="color:' + (prPart >= 0 ? '#4ade80' : '#f87171') + '">' + (prPart >= 0 ? '+' : '−') + fmtMoney(Math.abs(prPart), state.cur) + '</span></div>' +
      (t > 0 ? '<div class="row"><span>該年派息</span><span class="gold">+' + fmtMoney(r.inc * B, state.cur) + '</span></div>' : '') +
      (state.inflation && t > 0 ? '<div class="row"><span>通脹後實值</span><span class="orange">' + fmtMoney(r[key] / Math.pow(1 + INF, t) * B, state.cur) + '</span></div>' : '');
    tip.style.display = 'block';
    var tw = tip.offsetWidth, left = (ev.clientX - rect.left) + 16;
    if (left + tw > rect.width - 8) left = (ev.clientX - rect.left) - tw - 16;
    tip.style.left = left + 'px';
    tip.style.top = clamp((ev.clientY - chartwrap.getBoundingClientRect().top) - 30, 6, rect.height - 130) + 'px';
  });
  chartwrap.addEventListener('mouseleave', function () { tip.style.display = 'none'; });

  /* ----- compare table ----- */
  function renderTable() {
    var cur = state.cur, B = state.B;
    var html = '<tr><th>利率劇本</th><th>20 年後總值<br>（收息再投資）</th><th>年化回報</th><th>期內最低點</th><th>最大回撤*</th><th>唔再投資：<br>20 年總收息</th><th>唔再投資：<br>20 年後總值</th></tr>';
    Object.keys(SCENARIOS).forEach(function (k) {
      if (k === 'custom') return;
      var s = stats(getYs(k));
      html += '<tr' + (k === state.scen ? ' class="cur"' : '') + '>' +
        '<td><span class="dot" style="background:' + SCENARIOS[k].color + '"></span>' + SCENARIOS[k].name + '</td>' +
        '<td><b>' + fmtMoney(s.nav20 * B, cur) + '</b></td>' +
        '<td>' + signPct(s.cagr, 2) + '</td>' +
        '<td>' + fmtMoney(s.minNav * B, cur) + '（第 ' + s.minYr + ' 年）</td>' +
        '<td>' + signPct(-s.maxDD, 1) + '</td>' +
        '<td>+' + fmtMoney(s.incomeTotal * B, cur) + '</td>' +
        '<td>' + fmtMoney(s.navNr20 * B, cur) + '</td></tr>';
    });
    html += '</table>';
    $('#tbl-compare').innerHTML = html;
  }

  build();
  refreshAll(true);
  // auto-draw once when the simulator first scrolls into view
  var autoPlayed = false;
  var autoObs = new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (en.isIntersecting && !autoPlayed) {
        autoPlayed = true;
        autoObs.disconnect();
        drawFrame(0);
        play();
      }
    });
  }, { threshold: 0.35 });
  autoObs.observe($('.chartwrap'));
  document.addEventListener('themechange', function () { refreshAll(false); });
  // diag (offscreen, for render verification)
  try {
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:8px;';
    d.id = 'diag';
    d.textContent = 'DIAG-OK ' + SCENARIOS.cut.name + ' nav20=' + stats(SCENARIOS.cut.ys).nav20.toFixed(3) +
      ' flat=' + stats(SCENARIOS.flat.ys).nav20.toFixed(3) + ' infl=' + stats(SCENARIOS.infl.ys).nav20.toFixed(3) +
      ' shock=' + stats(SCENARIOS.shock.ys).nav20.toFixed(3);
    document.body.appendChild(d);
  } catch (err) { /* noop */ }
})();

/* ================= S6 history ================= */
(function () {
  var data = [
    [2002, 87.0], [2003, 88.4], [2004, 88.7], [2005, 87.7], [2006, 89.9], [2007, 101.5],
    [2008, 121.6], [2009, 106.8], [2010, 116.9], [2011, 122.6], [2012, 121.5], [2013, 103.1],
    [2014, 126.6], [2015, 125.5], [2016, 117.6], [2017, 123.4], [2018, 116.6], [2019, 145.7],
    [2020, 167.5], [2021, 137.5], [2022, 105.7], [2023, 100.4], [2024, 88.5], [2025, 89.0], [2026.7, 79.32]
  ];
  var MS = {
    2002: { t: '2002 · 上市', d: '7 月 22 日上市，嗰陣 20 年美債息大約 5.5%。之後美國進入長達 40 年嘅利率下行週期尾聲，長債一路有得賺。' },
    2008: { t: '2008 · 金融海嘯', d: '雷曼爆煲，資金瘋狂湧入美國國債避險，TLT 全年價格升約 34%——長債係股市大災難時嘅「避風港」。' },
    2011: { t: '2011 · 歐債危機', d: '希臘違約恐慌，美債息低見 2% 以下，TLT 升上約 $122。' },
    2013: { t: '2013 · 縮減恐慌（Taper Tantrum）', d: '聯儲局暗示收水，債息由 1.9% 抽上 3%，TLT 全年價格跌約 15%——第一次令好多人知長債都會好痛。' },
    2020: { t: '2020 · 疫情減息', d: '疫情爆發，聯儲局減息到零，8 月 TLT 見歷史高位 US$178.7。喺高位追入嘅人，之後經歷咗……（撳 2022）' },
    2022: { t: '2021–22 · 加息週期', d: '通脹 9%，聯儲局一年加息 4.25 厘，TLT 2022 年單年跌 31%，由高位計跌超過一半——債券史上最慘一年，比大部分股票仲傷。' },
    2026: { t: '2026 · 而家', d: '息率 5.5% 企喺高位，TLT 收市 US$79.32，過去 5 年價格累跌約 46%（未計收息）。高位嘅息，就係你而家嘅補償。' }
  };
  var svg = $('#histsvg');
  var chipBox = $('#hist-chips');
  var drawn = false, ioAdded = false, pathRef = null;
  function setCard(m) { $('#hist-card').innerHTML = '<b class="gold">' + m.t + '</b> — ' + m.d; }
  function buildHist() {
    svg.innerHTML = '';
    var W = 900, H = 380, PL = 60, PR = 20, PT = 18, PB = 34;
    var plotW = W - PL - PR, plotH = H - PT - PB;
    var ymin = 70, ymax = 185;
    function xS(yr) { return PL + (yr - 2002) / (2026.7 - 2002) * plotW; }
    function yS(v) { return PT + (1 - (v - ymin) / (ymax - ymin)) * plotH; }
    // grid
    [80, 100, 120, 140, 160, 180].forEach(function (v) {
      svgEl('line', { x1: PL, y1: yS(v), x2: W - PR, y2: yS(v), stroke: PALETTE.grid, opacity: .7 }, svg);
      var tx = svgEl('text', { x: PL - 8, y: yS(v) + 4, 'text-anchor': 'end', fill: PALETTE.axis, 'font-size': 11.5 }, svg);
      tx.textContent = '$' + v;
    });
    [2005, 2010, 2015, 2020, 2025].forEach(function (yr) {
      var tx = svgEl('text', { x: xS(yr), y: H - 8, 'text-anchor': 'middle', fill: PALETTE.axis, 'font-size': 12 }, svg);
      tx.textContent = yr;
    });
    var d = 'M ' + xS(data[0][0]) + ' ' + yS(data[0][1]);
    for (var i = 1; i < data.length; i++) d += ' L ' + xS(data[i][0]) + ' ' + yS(data[i][1]);
    // area under curve (drawn first, under the line)
    svgEl('path', { d: d + ' L ' + xS(2026.7) + ' ' + yS(ymin) + ' L ' + xS(2002) + ' ' + yS(ymin) + ' Z', fill: 'rgba(245,197,66,0.10)', stroke: 'none' }, svg);
    var path = svgEl('path', { d: d, fill: 'none', stroke: '#f5c542', 'stroke-width': 2.6 }, svg);
    pathRef = path;
    if (drawn) {
      path.style.strokeDasharray = 'none';
    } else {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      if (!ioAdded) {
        ioAdded = true;
        var io = new IntersectionObserver(function (ents) {
          ents.forEach(function (en) {
            if (en.isIntersecting && !drawn) {
              drawn = true;
              pathRef.style.transition = 'stroke-dashoffset 2.4s ease';
              pathRef.style.strokeDashoffset = 0;
            }
          });
        }, { threshold: 0.25 });
        io.observe(svg);
      }
    }
    // current point
    svgEl('circle', { cx: xS(2026.7), cy: yS(79.32), r: 5, fill: '#ef4444' }, svg);
    var nowTx = svgEl('text', { x: xS(2026.7) - 6, y: yS(79.32) - 12, 'text-anchor': 'end', fill: '#ef4444', 'font-size': 12.5, 'font-weight': 700 }, svg);
    nowTx.textContent = '而家 $79.32';
    var peakTx = svgEl('text', { x: xS(2020.6), y: yS(178.7) - 12, 'text-anchor': 'middle', fill: '#22c55e', 'font-size': 12.5, 'font-weight': 700 }, svg);
    peakTx.textContent = '2020 高位 $178.7';
    svgEl('circle', { cx: xS(2020.6), cy: yS(178.7), r: 4, fill: '#22c55e' }, svg);
    // milestone dots
    Object.keys(MS).forEach(function (yr) {
      var y = parseFloat(yr);
      var pt = data.filter(function (p) { return Math.floor(p[0]) === Math.round(y); })[0] || [y, 100];
      var g = svgEl('g', { class: 'milestone-dot' }, svg);
      svgEl('circle', { class: 'dotc', cx: xS(pt[0]), cy: yS(pt[1]), r: 6, fill: PALETTE.dotfill, stroke: '#3b82f6', 'stroke-width': 2 }, g);
      var lb = svgEl('text', { x: xS(pt[0]), y: yS(pt[1]) + 22, 'text-anchor': 'middle', fill: PALETTE.axis, 'font-size': 11.5 }, g);
      lb.textContent = yr;
      g.addEventListener('click', function () { setCard(MS[yr]); });
      g.addEventListener('mouseenter', function () { setCard(MS[yr]); });
    });
    var note = svgEl('text', { x: PL + 6, y: PT + 14, fill: PALETTE.axis, 'font-size': 12 }, svg);
    note.textContent = 'TLT 年度收市價（美元，約數）· 價格未計收息';
  }
  buildHist();
  document.addEventListener('themechange', function () { buildHist(); });
  // chips
  Object.keys(MS).forEach(function (yr) {
    var b = document.createElement('button');
    b.className = 'chip';
    b.textContent = MS[yr].t;
    b.addEventListener('click', function () { setCard(MS[yr]); });
    chipBox.appendChild(b);
  });
})();

/* ================= theme switcher (light / dark / system, default system) ================= */
(function () {
  var KEY = 'tlt-theme';
  var seg = $('#themeSeg');
  var saved = 'system';
  try { saved = localStorage.getItem(KEY) || 'system'; } catch (e) { /* noop */ }
  function apply(t) {
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch (e) { /* noop */ }
    refreshPalette();
    document.dispatchEvent(new CustomEvent('themechange'));
    $all('#themeSeg .tbtn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-t') === t); });
  }
  seg.addEventListener('click', function (ev) {
    var b = ev.target.closest('.tbtn');
    if (b) apply(b.getAttribute('data-t'));
  });
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  var onSys = function () {
    if (!document.documentElement.dataset.theme) {
      refreshPalette();
      document.dispatchEvent(new CustomEvent('themechange'));
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', onSys);
  else if (mq.addListener) mq.addListener(onSys);
  apply(saved);
})();
