/* =============================================================
 * Ohio Site Development — Financial model engine
 * Calibrated to EOG-comparable Tuscarawas Utica volatile-oil wells.
 *
 * Per-well IP30 baselines (year 0 peak):
 *   Oil: 922 bbl/d   Gas: 3,799 Mcf/d   NGLs: 190 bbl/d
 * Stabilized (year 2): gas ~1,900 Mcf/d (from primer)
 * Long-tail decline points (Mcf/d): yr3 1300, yr5 800, yr10 400, yr15 250, yr20 150
 * ============================================================= */

// Built-in constants — Apr 2026 Utica/Ohio basis differentials.
// Hidden from the UI for simplicity; embedded in realized-price calc.
const OIL_BASIS = 8;       // $/bbl below WTI (Utica condensate quality differential + transport)
const GAS_BASIS = 0.38;    // $/Mcf below HH (Ohio basis + gathering tariff)

const DEFAULTS = {
  // Pricing (user-facing) — all in $/bbl for consistency.
  // Natural gas is priced in $/bbl-oe (1 boe = 6 Mcf, 1 Mcf ≈ 1.024 MMBtu).
  // Default 16.47 $/bbl-oe = 2.68 $/MMBtu × 6.144 MMBtu/bbl-oe (Henry Hub Apr 2026).
  wti: 100, hh: 16.47, nglPct: 32,
  // Wells & drilling (user-facing)
  initWells: 7, replWells: 2, dnc: 11.4,
  // Per-well production (Year-1 average daily rates), all in bbl/d.
  // Gas input is in barrels-of-oil-equivalent (1 boe = 6 Mcf, energy basis).
  // Defaults are EOG-comparable Tuscarawas Utica volatile-oil-window wells:
  //   IP30 baseline 922 bbl/d oil, 3,799 Mcf/d gas (633 boe/d), 190 bbl/d NGLs;
  //   Year-1 average = ~60% of IP30 because IP30 only lasts 30 days.
  oilPerDay: 553,        // bbl per well per day, Year-1 avg
  gasPerDay: 380,        // bbl-equivalent per well per day (= 2,280 Mcf ÷ 6)
  nglPerDay: 114,        // bbl per well per day, Year-1 avg
  // Annual decline applied each subsequent year (geometric).
  // 25% per year roughly matches the multi-segment hyperbolic curve
  // calibrated to the primer's data points (yr 2 = 50% of IP30, etc.).
  declinePct: 25,
  // Single field-level operating cost as % of revenue.
  // 43% reproduces the primer's $30.28 / $70.39 cost stack
  // (royalty 20% of rev + LOE $4 + GP&T $8 + severance $4.20 per boe).
  opCostPct: 43,
  // Plant
  plantMW: 150, heatRate: 7000, plantCapex: 175, plantOM: 15, avail: 95, powerPrice: 65,
  // DC
  itLoad: 100, pue: 1.2, dcCapex: 1000, dcOpex: 30, leaseRate: 80, esc: 2.0,
  // Project
  years: 20, dda: 12, ga: 1.5,
  // Financing
  wacc: 10, tax: 22,
  debtPct: 50,           // share of Y1 capex raised as debt
  debtRate: 7.5,         // interest rate on debt (%)
  loanTerm: 20,          // amortization term (years)
  ownerEquityPct: 30,    // landowner's share of equity (rest = external)
};

// Per-well decline: Year-1 = input rate; subsequent years apply a constant
// geometric decline. multiplier(year) = (1 - declinePct/100)^(year-1).
function wellYearMult(yearOfLife, declinePct) {
  // yearOfLife: 1-indexed (year 1 = first year producing)
  const r = 1 - (declinePct || 0) / 100;
  return Math.pow(Math.max(0, r), Math.max(0, yearOfLife - 1));
}

// Build the drilling schedule: how many wells produce in each project year,
// each with a year-of-life so we can look up decline.
// Drilling cadence: all initial wells are drilled in year 0. Replacement wells
// are drilled at start of years 1..N according to replWells/yr.
function buildWellCohorts(initWells, replWells, years) {
  const cohorts = []; // each cohort: { startYear, count }
  cohorts.push({ startYear: 1, count: initWells });
  for (let y = 2; y <= years; y++) {
    if (replWells > 0) cohorts.push({ startYear: y, count: replWells });
  }
  return cohorts;
}

// Daily-rate aggregator for a project year y (1-indexed)
// Gas input is in bbl-equivalent (boe); convert to Mcf via × 6 for downstream
// revenue calculations.
function productionForYear(cohorts, y, p) {
  let oil = 0, gas = 0, ngl = 0, wells = 0;
  for (const c of cohorts) {
    if (c.startYear > y) continue;
    const yearOfLife = y - c.startYear + 1;
    const m = wellYearMult(yearOfLife, p.declinePct);
    oil += c.count * p.oilPerDay * m;
    gas += c.count * p.gasPerDay * 6 * m;   // boe → Mcf (×6)
    ngl += c.count * p.nglPerDay * m;
    wells += c.count;
  }
  return { oilDaily: oil, gasDaily: gas, nglDaily: ngl, wells };
}

function npv(rate, cashflows) {
  // cashflows[0] is year 0
  let v = 0;
  for (let t = 0; t < cashflows.length; t++) v += cashflows[t] / Math.pow(1 + rate, t);
  return v;
}

function irr(cashflows) {
  // Bisect on [-0.99, 5]
  let lo = -0.99, hi = 5.0;
  const f = r => npv(r, cashflows);
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function paybackYear(cashflows) {
  // returns fractional year of project where cumulative >= 0, or null
  let cum = 0;
  for (let t = 0; t < cashflows.length; t++) {
    const next = cum + cashflows[t];
    if (next >= 0 && cum < 0) {
      const frac = -cum / cashflows[t];
      return t - 1 + frac;
    }
    cum = next;
  }
  return null;
}

/* =============================================================
 *  Core scenario runner
 *  scenario: 'A' wells only, 'B' wells+plant, 'C' wells+plant+DC
 * ============================================================= */
function runModel(p, scenario = 'A') {
  const Y = p.years;
  const cohorts = buildWellCohorts(p.initWells, p.replWells, Y);

  // Realized prices — basis discounts baked in as constants.
  // Gas input is in $/bbl-oe; convert to $/Mcf via /6 (energy basis), then
  // subtract Ohio basis discount.
  const oilPrice = Math.max(0, p.wti - OIL_BASIS);                  // $/bbl
  const gasPriceMcf = Math.max(0, p.hh / 6 - GAS_BASIS);            // $/Mcf
  const nglPrice = Math.max(0, p.wti * (p.nglPct / 100));           // $/bbl

  // Power-plant gas demand (constant): plantMW * avail * 24 * heatRate
  // = MW × 1000 kW × 24 h × Btu/kWh = Btu/day  → ÷ 1.024e6 = Mcf/day (since 1 Mcf ≈ 1.024 MMBtu)
  const plantMW = (scenario === 'A') ? 0 : p.plantMW;
  const plantDailyMWh = plantMW * 24 * (p.avail / 100);             // MWh/day at availability
  const plantDailyGasMcf = plantDailyMWh * 1000 * p.heatRate / 1_024_000; // Mcf/day

  // Hyperscaler revenue path (only Scenario C uses lease; Scenario B uses wholesale grid PPA)
  const dcDailyMWh = (scenario === 'C') ? p.itLoad * p.pue * 24 : 0; // 100 MW IT × 1.2 PUE × 24h = 2880 MWh/d demand

  // Build year-by-year roll-up
  const rows = [];
  for (let y = 1; y <= Y; y++) {
    const prod = productionForYear(cohorts, y, p);

    // Daily volumes
    const oilDaily = prod.oilDaily, gasDaily = prod.gasDaily, nglDaily = prod.nglDaily;
    const oilAnnual = oilDaily * 365;
    const gasAnnual = gasDaily * 365;
    const nglAnnual = nglDaily * 365;
    const boeAnnual = oilAnnual + nglAnnual + gasAnnual / 6;

    // Gas allocation: serve plant first, sell rest at wellhead
    let gasToPlantMcf = 0, gasToMarketMcf = gasAnnual;
    if (plantMW > 0) {
      const gasNeeded = plantDailyGasMcf * 365;
      gasToPlantMcf = Math.min(gasAnnual, gasNeeded);
      gasToMarketMcf = gasAnnual - gasToPlantMcf;
    }
    const gasShortMcf = Math.max(0, plantDailyGasMcf * 365 - gasToPlantMcf);

    // Power plant output is limited by gas supplied AND nameplate availability
    const plantMaxMWhFromGas = gasToPlantMcf * 1_024_000 / (p.heatRate * 1000); // MWh/yr deliverable from supplied gas
    const plantMaxMWhFromCap = plantDailyMWh * 365;
    const powerMWh = Math.min(plantMaxMWhFromGas, plantMaxMWhFromCap);

    // Revenues
    const oilRev = oilAnnual * oilPrice;
    const nglRev = nglAnnual * nglPrice;
    const gasMarketRev = gasToMarketMcf * gasPriceMcf;

    let powerRev = 0;
    if (scenario === 'B') {
      powerRev = powerMWh * p.powerPrice;
    } else if (scenario === 'C') {
      // Hyperscaler pays for IT-load MWh leased; capped by what plant actually produced.
      const dcAnnualMWh = Math.min(powerMWh, dcDailyMWh * 365);
      const escMult = Math.pow(1 + p.esc / 100, y - 1);
      powerRev = dcAnnualMWh * p.leaseRate * escMult;
    }

    const totalRev = oilRev + nglRev + gasMarketRev + powerRev;

    // Field operating cost — single % of revenue (royalty + LOE + GP&T + severance).
    // Apply only to the upstream portion of revenue (oil + NGLs + gas at market).
    // Power/lease revenue carries plant + DC opex separately.
    const upstreamRev = oilRev + nglRev + gasMarketRev;
    const fieldOpCost = upstreamRev * (p.opCostPct / 100);

    // Plant non-fuel O&M
    const plantOM = (scenario === 'A') ? 0 : powerMWh * p.plantOM;
    // DC fixed opex (only in scenario C)
    const dcOpex = (scenario === 'C') ? p.dcOpex * 1_000_000 : 0;

    const totalCashCost = fieldOpCost + plantOM + dcOpex;
    const ebitda = totalRev - totalCashCost;

    // CapEx schedule
    let capex = 0;
    // Drilling capex this year
    if (y === 1) capex += p.initWells * p.dnc * 1_000_000;
    if (y >= 2 && p.replWells > 0) capex += p.replWells * p.dnc * 1_000_000;
    // Power plant (built year 1) — for scenarios B/C
    if ((scenario === 'B' || scenario === 'C') && y === 1) capex += p.plantCapex * 1_000_000;
    // Data center (built year 1) — scenario C
    if (scenario === 'C' && y === 1) capex += p.dcCapex * 1_000_000;

    // DD&A and G&A (book-only — used for tax shield and reported income)
    const dda = boeAnnual * p.dda;
    const ga = boeAnnual * p.ga;
    const ebit = ebitda - dda - ga;
    const taxes = Math.max(0, ebit) * (p.tax / 100);
    const netIncome = ebit - taxes;
    // Unlevered free cash flow (after-tax EBITDA minus capex)
    const fcf = ebitda - taxes - capex;

    rows.push({
      year: y,
      wells: prod.wells,
      oilDaily, gasDaily, nglDaily, boeAnnual,
      gasToPlantMcf, gasToMarketMcf, gasShortMcf,
      powerMWh,
      oilRev, nglRev, gasMarketRev, powerRev, totalRev,
      fieldOpCost, plantOM, dcOpex, totalCashCost,
      ebitda, dda, ga, ebit, taxes, netIncome,
      capex, fcf,
    });
  }

  // Headline metrics (unlevered project)
  const totalRev = rows.reduce((s, r) => s + r.totalRev, 0);
  const totalEbitda = rows.reduce((s, r) => s + r.ebitda, 0);
  const totalCapex = rows.reduce((s, r) => s + r.capex, 0);
  const fcfSeries = [0, ...rows.map(r => r.fcf)];
  const projNpv = npv(p.wacc / 100, fcfSeries);
  const projIrr = irr(fcfSeries);
  const projPayback = paybackYear(fcfSeries);

  // ===== Capital structure: financing applied to Year-1 (initial) capex only.
  // Replacement-drilling capex in years 2+ is paid from operating cash flows.
  const initialCapex = rows[0]?.capex || 0;
  const debtPct = (p.debtPct || 0) / 100;
  const equityPct = 1 - debtPct;
  const ownerEquityPct = (p.ownerEquityPct || 100) / 100;
  const externalEquityPct = 1 - ownerEquityPct;

  const debtAmount = initialCapex * debtPct;
  const equityAmount = initialCapex * equityPct;
  const ownerEquity = equityAmount * ownerEquityPct;
  const externalEquity = equityAmount * externalEquityPct;

  // Annual level-payment debt service over loanTerm years
  const r = p.debtRate / 100;
  const n = Math.max(1, Math.round(p.loanTerm));
  const annualDebtService = debtAmount > 0 && r > 0
    ? debtAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    : (debtAmount > 0 ? debtAmount / n : 0);

  // Track interest portion each year for tax shield (declining balance)
  let principalRemaining = debtAmount;
  const taxRate = p.tax / 100;

  // Build levered (after-debt) cash flow stream
  // Year 0: equity contribution outflow
  // Year y: unlevered FCF + (interest tax shield) - debt service (during loanTerm only)
  const leveredCF = [0]; // year 0 placeholder; no cash flow yet for project
  for (let y = 1; y <= Y; y++) {
    const unleveredFcf = rows[y - 1].fcf;
    let debtService = 0, interestPaid = 0, principalPaid = 0;
    if (y <= n && debtAmount > 0) {
      interestPaid = principalRemaining * r;
      principalPaid = annualDebtService - interestPaid;
      principalRemaining = Math.max(0, principalRemaining - principalPaid);
      debtService = annualDebtService;
    }
    const interestTaxShield = interestPaid * taxRate;
    // Note: unlevered FCF already includes Y1 capex outflow. To compute cash flow
    // to all-equity holders in a levered scenario, we add back the debt-funded
    // capex (because debt covers it) and subtract debt service.
    const cashToAllEquity = unleveredFcf
      + (y === 1 ? debtAmount : 0)   // Y1: debt cash inflow
      - debtService
      + interestTaxShield;
    leveredCF.push(cashToAllEquity);
  }

  // Owner cash flow = ownerEquityPct of all-equity cash flows minus owner's Y0 contribution
  const ownerCF = [-ownerEquity, ...leveredCF.slice(1).map(v => v * ownerEquityPct)];
  const externalCF = [-externalEquity, ...leveredCF.slice(1).map(v => v * externalEquityPct)];

  const ownerIrr = irr(ownerCF);
  const ownerNpv = npv(p.wacc / 100, ownerCF);
  const ownerPayback = paybackYear(ownerCF);
  const ownerCashIn = ownerCF.slice(1).filter(v => v > 0).reduce((s, v) => s + v, 0);
  const ownerMoic = ownerEquity > 0 ? ownerCashIn / ownerEquity : null;

  const externalIrr = irr(externalCF);

  return {
    rows, totals: { totalRev, totalEbitda, totalCapex },
    npv: projNpv, irr: projIrr, payback: projPayback,
    realized: { oilPrice, gasPriceMcf, nglPrice },
    plantDailyGasMcf, dcDailyMWh,
    financing: {
      initialCapex, debtAmount, equityAmount, ownerEquity, externalEquity,
      annualDebtService, loanTerm: n,
      ownerIrr, ownerNpv, ownerPayback, ownerMoic,
      externalIrr,
      ownerCF, leveredCF,
    },
  };
}

/* Single-well year-1 cash margin in $/boe — used for waterfall */
function singleWellMarginPerBoe(p) {
  // year-1 averaged production from user inputs (gas input is in bbl-equiv, ×6 → Mcf)
  const oilDaily = p.oilPerDay;
  const gasDaily = p.gasPerDay * 6;          // boe → Mcf
  const nglDaily = p.nglPerDay;
  const oilAnnual = oilDaily * 365, gasAnnual = gasDaily * 365, nglAnnual = nglDaily * 365;
  const boeAnnual = oilAnnual + nglAnnual + gasAnnual / 6;

  const oilPrice = Math.max(0, p.wti - OIL_BASIS);
  const gasPriceMcf = Math.max(0, p.hh / 6 - GAS_BASIS);
  const nglPrice = Math.max(0, p.wti * (p.nglPct / 100));

  const totalRev = oilAnnual * oilPrice + nglAnnual * nglPrice + gasAnnual * gasPriceMcf;
  const revPerBoe = totalRev / boeAnnual;
  const opCostPerBoe = revPerBoe * (p.opCostPct / 100);
  const grossPerBoe = revPerBoe - opCostPerBoe;
  const ebitPerBoe = grossPerBoe - p.dda - p.ga;
  const taxPerBoe = Math.max(0, ebitPerBoe) * (p.tax / 100);
  const netPerBoe = ebitPerBoe - taxPerBoe;

  return {
    revPerBoe, opCostPerBoe,
    dda: p.dda, ga: p.ga,
    grossPerBoe, ebitPerBoe, taxPerBoe, netPerBoe,
  };
}

// Helper: realized prices given inputs, for UI display.
// Gas is returned in $/bbl-oe to match the input unit.
function realizedPrices(p) {
  const gasMcf = Math.max(0, p.hh / 6 - GAS_BASIS);
  return {
    oil: Math.max(0, p.wti - OIL_BASIS),
    gas: gasMcf * 6,                                  // $/bbl-oe
    gasMcf: gasMcf,                                   // $/Mcf (for any consumer that wants it)
    ngl: Math.max(0, p.wti * (p.nglPct / 100)),
    oilBasis: OIL_BASIS,
    gasBasis: GAS_BASIS,
  };
}

window.OhioModel = { DEFAULTS, runModel, singleWellMarginPerBoe, realizedPrices, npv, irr, paybackYear, OIL_BASIS, GAS_BASIS };
