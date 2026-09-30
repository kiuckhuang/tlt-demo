/* Pure educational calculations. Works in a browser and Node; no DOM or network. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TLTModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULTS = Object.freeze({ price: 79.32, grossYield: 0.055, fee: 0.0015, duration: 16.5, inflation: 0.025, years: 20 });
  var SCENARIOS = Object.freeze([
    { key: 'cut', name: '減息週期', icon: '📉' },
    { key: 'flat', name: '風平浪靜', icon: '→' },
    { key: 'infl', name: '通脹重燃', icon: '🔥' },
    { key: 'shock', name: '急升再回落', icon: '⚠️' },
    { key: 'custom', name: '自訂', icon: '🛠' }
  ]);
  function clamp(x, low, high) { return Math.max(low, Math.min(high, x)); }
  function finite(x, name) {
    if (!Number.isFinite(x)) throw new TypeError(name + ' must be finite');
    return x;
  }
  function scenarioPath(key, options) {
    var o = Object.assign({}, DEFAULTS, { target: 0.03, targetYears: 8 }, options);
    if (!SCENARIOS.some(function (s) { return s.key === key; })) throw new RangeError('Unknown scenario');
    if (!Number.isInteger(o.years) || o.years < 1 || o.years > 30) throw new RangeError('Horizon must be 1–30 years');
    finite(o.grossYield, 'Starting yield');
    var ys = [o.grossYield];
    for (var t = 1; t <= o.years; t++) {
      var y;
      if (key === 'cut') y = o.grossYield + (0.03 - o.grossYield) * Math.min(t / 5, 1);
      else if (key === 'flat') y = o.grossYield;
      else if (key === 'infl') y = o.grossYield + (0.065 - o.grossYield) * Math.min(t / 10, 1);
      else if (key === 'shock') {
        if (t <= 2) y = o.grossYield + 0.01 * t;
        else y = o.grossYield + 0.02 - 0.025 * Math.min((t - 2) / 13, 1);
      } else y = o.grossYield + (o.target - o.grossYield) * Math.min(t / o.targetYears, 1);
      ys.push(y);
    }
    return ys;
  }
  /* Annual, first-order attribution, not a pricing or distribution forecast.
     Start-of-year assets earn an assumed net income proxy plus -D*delta-y.
     Income is paid/reinvested at year end. Cash retained earns 0%.
     Gross yield is a MODELLING INPUT, not the issuer's SEC/distribution yield. */
  function computeRows(ys, options) {
    var o = Object.assign({}, DEFAULTS, { incomeShift: 0 }, options);
    if (!Array.isArray(ys) || ys.length < 2) throw new RangeError('A yield path is required');
    ys.forEach(function (yieldValue) { finite(yieldValue, 'Yield'); if (yieldValue < 0) throw new RangeError('Yield must be nonnegative'); });
    finite(o.duration, 'Duration'); finite(o.fee, 'Fee'); finite(o.incomeShift, 'Income shift');
    if (o.duration < 0 || o.fee < 0) throw new RangeError('Duration and fee must be nonnegative');
    var rows = [{ t: 0, y: ys[0], carry: 0, priceReturn: 0, price: 1, nav: 1, cash: 0, navNr: 1, inc: 0, incNr: 0, incomeSum: 0, marketGain: 0 }];
    for (var t = 1; t < ys.length; t++) {
      finite(ys[t], 'Yield');
      var p = rows[t - 1];
      var carry = ys[t - 1] - o.fee + o.incomeShift;
      var priceReturn = -o.duration * (ys[t] - ys[t - 1]);
      if (carry < 0 || 1 + priceReturn <= 0 || 1 + carry + priceReturn <= 0) throw new RangeError('Assumptions exceed the first-order model range');
      var inc = p.nav * carry, incNr = p.price * carry;
      var nav = p.nav * (1 + carry + priceReturn);
      var price = p.price * (1 + priceReturn);
      var cash = p.cash + incNr;
      var incomeSum = p.incomeSum + inc;
      rows.push({ t: t, y: ys[t], carry: carry, priceReturn: priceReturn, price: price, nav: nav, cash: cash, navNr: price + cash, inc: inc, incNr: incNr, incomeSum: incomeSum, marketGain: nav - 1 - incomeSum });
    }
    return rows;
  }
  function rowAt(rows, frame) {
    var f = clamp(finite(frame, 'Frame'), 0, rows.length - 1);
    if (Number.isInteger(f)) return Object.assign({}, rows[f]);
    var i = Math.floor(f), frac = f - i, r = { t: f };
    Object.keys(rows[i]).forEach(function (k) { if (k !== 't') r[k] = rows[i][k] + (rows[i + 1][k] - rows[i][k]) * frac; });
    return r;
  }
  function value(r, reinvest) { return reinvest ? r.nav : r.navNr; }
  function attribution(r, reinvest) {
    return { total: value(r, reinvest), income: reinvest ? r.incomeSum : r.cash, market: reinvest ? r.marketGain : r.price - 1, annualIncome: reinvest ? r.inc : r.incNr };
  }
  function stats(rows, reinvest, horizon) {
    var n = horizon === undefined ? rows.length - 1 : horizon;
    if (!Number.isInteger(n) || n < 1 || n >= rows.length) throw new RangeError('Horizon is outside the available path');
    var minValue = 1, minYear = 0, peak = 1, maxDrawdown = 0;
    for (var t = 1; t <= n; t++) {
      var v = value(rows[t], reinvest);
      if (v < minValue) { minValue = v; minYear = t; }
      peak = Math.max(peak, v);
      maxDrawdown = Math.max(maxDrawdown, 1 - v / peak);
    }
    var finalValue = value(rows[n], reinvest);
    return { years: n, finalValue: finalValue, cagr: Math.pow(finalValue, 1 / n) - 1, minValue: minValue, minYear: minYear, maxDrawdown: maxDrawdown };
  }
  /* Envelope of FOUR explicit parameter cases; no distribution/probability claim. */
  function sensitivity(ys, options, reinvest) {
    var o = Object.assign({}, DEFAULTS, options);
    var cases = [];
    // Keep the income proxy nonnegative in a near-zero-yield sensitivity case.
    var lowerShift = Math.max(-0.005, o.fee - Math.min.apply(null, ys));
    [0.8, 1.2].forEach(function (scale) {
      [lowerShift, 0.005].forEach(function (shift) {
        cases.push(computeRows(ys, Object.assign({}, o, { duration: o.duration * scale, incomeShift: shift })));
      });
    });
    return ys.map(function (_, t) {
      var values = cases.map(function (rows) { return value(rows[t], reinvest); });
      return { t: t, low: Math.min.apply(null, values), high: Math.max.apply(null, values) };
    });
  }
  function durationChange(duration, change) { return -duration * change; }
  function durationBarWidth(change) { return clamp(Math.abs(change) / 0.5 * 100, 0, 100); }
  /* Bond model: coupon-date purchase, nominal annual YTM, semiannual payments.
     Allows fractional face amounts for educational comparison, ignoring lots,
     accrued interest, fees, tax, default, FX, and reinvestment-rate changes. */
  function bondPrice(face, couponRate, ytm, years) {
    [face, couponRate, ytm, years].forEach(function (x) { finite(x, 'Bond input'); });
    if (face <= 0 || couponRate < 0 || ytm < 0 || years <= 0 || !Number.isInteger(years * 2)) throw new RangeError('Invalid bond inputs');
    var q = ytm / 2, periods = years * 2, coupon = face * couponRate / 2;
    if (q === 0) return face + coupon * periods;
    var discount = Math.pow(1 + q, -periods);
    return coupon * (1 - discount) / q + face * discount;
  }
  function couponBond(options) {
    var o = Object.assign({ investment: 100000, years: 20, couponRate: 0.055, ytm: 0.0554, reinvestRate: 0.0554, reinvest: true }, options);
    if (!Number.isInteger(o.years) || o.years < 1 || o.years > 30 || o.investment <= 0 || o.reinvestRate < 0) throw new RangeError('Invalid investment inputs');
    finite(o.investment, 'Investment'); finite(o.reinvestRate, 'Reinvestment rate');
    var pricePer1000 = bondPrice(1000, o.couponRate, o.ytm, o.years);
    var face = o.investment / pricePer1000 * 1000;
    var coupon = face * o.couponRate / 2;
    var periods = o.years * 2, couponWealth = 0;
    for (var k = 1; k <= periods; k++) couponWealth += coupon * (o.reinvest ? Math.pow(1 + o.reinvestRate / 2, periods - k) : 1);
    return { years: o.years, investment: o.investment, pricePer1000: pricePer1000, face: face, semiannualCoupon: coupon, annualCoupon: coupon * 2, couponsPaid: coupon * periods, couponWealth: couponWealth, terminalValue: face + couponWealth, effectiveYtm: Math.pow(1 + o.ytm / 2, 2) - 1 };
  }
  function compareAtHorizon(rows, bond, reinvest) {
    var s = stats(rows, reinvest, bond.years);
    return { years: bond.years, tltValue: s.finalValue * bond.investment, bondValue: bond.terminalValue, difference: bond.terminalValue / (s.finalValue * bond.investment) - 1 };
  }
  return Object.freeze({ DEFAULTS: DEFAULTS, SCENARIOS: SCENARIOS, clamp: clamp, scenarioPath: scenarioPath, computeRows: computeRows, rowAt: rowAt, value: value, attribution: attribution, stats: stats, sensitivity: sensitivity, durationChange: durationChange, durationBarWidth: durationBarWidth, bondPrice: bondPrice, couponBond: couponBond, compareAtHorizon: compareAtHorizon });
});
