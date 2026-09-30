'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');
function near(actual, expected, tolerance = 1e-9) { assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`); }
function rows(key = 'flat', options = {}) { return M.computeRows(M.scenarioPath(key, { years: 30, ...options })); }

test('flat yield compounds only the explicitly assumed net annual income', () => {
  const r = rows('flat'), carry = M.DEFAULTS.grossYield - M.DEFAULTS.fee;
  near(r[20].nav, (1 + carry) ** 20);
  near(r[20].navNr, 1 + 20 * carry);
  near(r[20].price, 1);
});
test('cash-mode annual income is based on remaining ETF assets, not reinvested NAV', () => {
  const r = rows('cut'), cash = M.attribution(r[20], false), reinvest = M.attribution(r[20], true);
  near(cash.annualIncome, r[19].price * r[20].carry);
  near(reinvest.annualIncome, r[19].nav * r[20].carry);
  near(cash.annualIncome * 100000, 4236.27734429395);
  assert.ok(cash.annualIncome < reinvest.annualIncome);
});
test('attribution reconciles capital, estimated distributions and market impacts for every scenario and mode', () => {
  for (const s of M.SCENARIOS) for (const reinvest of [true, false]) {
    for (const r of rows(s.key)) {
      const a = M.attribution(r, reinvest);
      near(1 + a.income + a.market, a.total);
      assert.ok(a.annualIncome >= 0);
    }
  }
});
test('annual income is actual model cash-flow sum, not residual price/reinvestment attribution', () => {
  const r = rows('cut');
  near(r[20].incomeSum, r.slice(1, 21).reduce((sum, x) => sum + x.inc, 0));
  near(r[20].cash, r.slice(1, 21).reduce((sum, x) => sum + x.incNr, 0));
});
test('rowAt preserves both modes and clamps endpoints', () => {
  const r = rows('cut');
  assert.equal(M.rowAt(r, -1).t, 0);
  assert.equal(M.rowAt(r, 99).t, 30);
  near(M.rowAt(r, 4.5).navNr, (r[4].navNr + r[5].navNr) / 2);
  near(M.rowAt(r, 4.5).incNr, (r[4].incNr + r[5].incNr) / 2);
});
test('Duration changes use percentage-point decimal units; bars visibly separate', () => {
  near(M.durationChange(16.5, 0.01), -0.165);
  near(M.durationBarWidth(-0.02), 4);
  near(M.durationBarWidth(-0.074), 14.8);
  near(M.durationBarWidth(-0.165), 33);
  assert.equal(M.durationBarWidth(0), 0);
  assert.equal(M.durationBarWidth(0.6), 100);
});
test('scenario endpoints and extended years are explicit, not a 2022 historical replay', () => {
  assert.equal(M.scenarioPath('cut', { years: 30 })[30], 0.03);
  assert.equal(M.scenarioPath('infl', { years: 30 })[30], 0.065);
  near(M.scenarioPath('shock', { years: 30 })[30], 0.05);
  assert.equal(M.scenarioPath('custom', { target: 0.042, targetYears: 4, years: 30 })[30], 0.042);
});
test('stress scenario includes an initial loss and measured annual-point drawdown', () => {
  const s = M.stats(rows('shock'), true, 20);
  assert.ok(s.minValue < 1); assert.equal(s.minYear, 2); assert.ok(s.maxDrawdown > 0);
  assert.equal(s.years, 20);
});
test('sensitivity envelope is constructed from stated parameter cases for the chosen mode', () => {
  const ys = M.scenarioPath('cut');
  for (const reinvest of [true, false]) {
    const envelope = M.sensitivity(ys, {}, reinvest);
    const cases = [0.8, 1.2].flatMap(scale => [-0.005, 0.005].map(incomeShift => M.computeRows(ys, { duration: 16.5 * scale, incomeShift })));
    for (let t = 0; t <= 20; t++) {
      const values = cases.map(r => M.value(r[t], reinvest));
      near(envelope[t].low, Math.min(...values)); near(envelope[t].high, Math.max(...values));
    }
  }
});
test('low-yield sensitivity remains finite and nonnegative across allowed UI scenarios', () => {
  for (const s of M.SCENARIOS) {
    const envelope = M.sensitivity(M.scenarioPath(s.key, { grossYield: 0.01 }), {}, false);
    envelope.forEach(p => { assert.ok(Number.isFinite(p.low)); assert.ok(p.low > 0); });
  }
});
test('coupon price is par at coupon = nominal annual YTM', () => { near(M.bondPrice(1000, 0.0554, 0.0554, 20), 1000); });
test('premium and discount buyers redeem face, not purchase cost', () => {
  const premium = M.couponBond({ couponRate: 0.07, ytm: 0.04, reinvest: false });
  const discount = M.couponBond({ couponRate: 0.03, ytm: 0.06, reinvest: false });
  assert.ok(premium.pricePer1000 > 1000); assert.ok(premium.face < premium.investment);
  assert.ok(discount.pricePer1000 < 1000); assert.ok(discount.face > discount.investment);
});
test('semiannual coupon cash follows face and coupon, not purchase budget times YTM', () => {
  const b = M.couponBond({ investment: 100000, couponRate: 0.03, ytm: 0.0554, reinvest: false });
  near(b.semiannualCoupon, b.face * 0.03 / 2);
  near(b.annualCoupon, b.semiannualCoupon * 2);
  assert.notEqual(b.annualCoupon, 100000 * 0.0554);
});
test('same-YTM coupon reinvestment gives semiannual compound wealth only under that assumption', () => {
  const b = M.couponBond({ ytm: 0.0554, reinvestRate: 0.0554, years: 20 });
  near(b.terminalValue, b.investment * (1 + 0.0554 / 2) ** 40);
  assert.notEqual(b.terminalValue, b.investment * (1 + 0.0554) ** 20);
});
test('changing coupon reinvestment assumption changes terminal wealth', () => {
  const b0 = M.couponBond({ reinvestRate: 0 }), b3 = M.couponBond({ reinvestRate: 0.03 }), b6 = M.couponBond({ reinvestRate: 0.06 });
  assert.ok(b0.terminalValue < b3.terminalValue); assert.ok(b3.terminalValue < b6.terminalValue);
  near(b0.face, b6.face); near(b0.semiannualCoupon, b6.semiannualCoupon);
});
test('cash-mode coupon wealth equals face plus undiscounted coupons, ignoring reinvestment slider', () => {
  const b = M.couponBond({ reinvest: false, reinvestRate: 0.08, years: 5 });
  near(b.terminalValue, b.face + b.couponsPaid);
  near(b.couponsPaid, b.semiannualCoupon * 10);
});
test('bond comparison matches horizons 5, 20 and 30 and both modes', () => {
  const r = rows('cut');
  for (const years of [5, 20, 30]) for (const reinvest of [true, false]) {
    const b = M.couponBond({ years, reinvest }), c = M.compareAtHorizon(r, b, reinvest);
    assert.equal(c.years, years); near(c.tltValue, M.value(r[years], reinvest) * b.investment);
    near(c.difference, b.terminalValue / c.tltValue - 1);
  }
});
test('zero-coupon bonds contain no coupon reinvestment sensitivity', () => {
  const b0 = M.couponBond({ couponRate: 0, reinvestRate: 0 }), b8 = M.couponBond({ couponRate: 0, reinvestRate: 0.08 });
  near(b0.terminalValue, b0.face); near(b0.terminalValue, b8.terminalValue);
});
test('zero-rate price edge case and invalid inputs', () => {
  near(M.bondPrice(1000, 0.045, 0, 30), 2350);
  assert.throws(() => M.computeRows([NaN, 0.05]));
  assert.throws(() => M.computeRows([0.05, -0.01]));
  assert.throws(() => M.scenarioPath('missing'));
  assert.throws(() => M.stats(rows(), true, 31));
  assert.throws(() => M.couponBond({ years: 0 }));
});
