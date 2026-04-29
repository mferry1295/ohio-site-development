/* ===========================================================
 *  Ohio Site Development — UI controller
 *  Wires inputs ↔ model, renders KPIs, charts, tables.
 * =========================================================== */

const M = window.OhioModel || {};

const COLORS = {
  derrick: '#8B1A1A',
  iron: '#3D3D3D',
  signal: '#C44040',
  clay: '#D46A6A',
  blush: '#F6E1E1',
  oil: '#3D3D3D',
  ngl: '#D46A6A',
  gas: '#C44040',
  power: '#8B1A1A',
  pos: '#2f7d32',
  neg: '#b00020',
};

if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = 'Montserrat, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#3D3D3D';
}

// ===== State =====
const state = { ...M.DEFAULTS, scenario: 'A' };

// ===== Number formatters =====
const fmt = {
  money0: v => {
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(0) + 'K';
    return sign + '$' + a.toFixed(0);
  },
  moneyM: v => '$' + (v / 1e6).toFixed(1) + 'M',
  pct: v => (v * 100).toFixed(1) + '%',
  pct0: v => v.toFixed(1) + '%',
  num: v => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
  num1: v => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
  yrs: v => v == null ? '—' : v.toFixed(1) + ' yr',
};

// ===== Bind inputs =====
function syncInputs() {
  document.querySelectorAll('input[data-input]').forEach(el => {
    const k = el.dataset.input;
    el.value = state[k];
  });
}

function bindInputs() {
  document.querySelectorAll('input[data-input]').forEach(el => {
    const k = el.dataset.input;
    el.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) {
        state[k] = v;
        // sync paired range/number
        document.querySelectorAll(`input[data-input="${k}"]`).forEach(other => {
          if (other !== e.target) other.value = v;
        });
        render();
      }
    });
  });
}

function bindScenarioToggle() {
  document.querySelectorAll('.scenario-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.scenario = btn.dataset.scenario;
      // toggle visibility of plant/dc input groups
      document.querySelectorAll('.scenarioBC').forEach(el => {
        el.classList.toggle('hidden', state.scenario === 'A');
      });
      document.querySelectorAll('.scenarioC').forEach(el => {
        el.classList.toggle('hidden', state.scenario !== 'C');
      });
      render();
    });
  });
}

function bindNav() {
  document.querySelectorAll('.navlink').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = a.dataset.target;
      document.querySelectorAll('.navlink').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      a.classList.add('active');
      document.getElementById(target).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // re-render charts (canvas needs to be visible to size correctly)
      render();
      // map needs explicit init / resize when its tab becomes visible
      if (target === 'fieldmap') renderFieldMap();
    });
  });
}

function bindReset() {
  document.getElementById('resetBtn').addEventListener('click', () => {
    Object.assign(state, M.DEFAULTS);
    syncInputs();
    render();
  });
}

// ===== Charts =====
const charts = {};
function makeOrUpdate(id, cfg) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  if (charts[id]) {
    charts[id].data = cfg.data;
    charts[id].options = cfg.options;
    charts[id].update();
  } else {
    charts[id] = new Chart(ctx, cfg);
  }
}

function renderKPIs(model) {
  const t = model.totals;
  document.getElementById('kpi-rev').textContent = fmt.money0(t.totalRev);
  document.getElementById('kpi-rev-sub').textContent = `Avg ${fmt.money0(t.totalRev / state.years)}/yr`;
  document.getElementById('kpi-ebitda').textContent = fmt.money0(t.totalEbitda);
  const margin = t.totalRev > 0 ? (t.totalEbitda / t.totalRev) : 0;
  document.getElementById('kpi-ebitda-sub').textContent = `${fmt.pct0(margin * 100)} margin`;
  document.getElementById('kpi-capex').textContent = fmt.money0(t.totalCapex);
  document.getElementById('kpi-capex-sub').textContent = `Across ${state.years} yrs`;

  const npvEl = document.getElementById('kpi-npv');
  npvEl.textContent = fmt.money0(model.npv);
  npvEl.classList.toggle('pos', model.npv > 0);
  npvEl.classList.toggle('neg', model.npv < 0);
  document.getElementById('kpi-npv-sub').textContent = `WACC ${state.wacc}%`;

  const irrEl = document.getElementById('kpi-irr');
  irrEl.textContent = model.irr == null ? '—' : fmt.pct(model.irr);
  irrEl.classList.toggle('pos', model.irr != null && model.irr > state.wacc / 100);
  irrEl.classList.toggle('neg', model.irr != null && model.irr < 0);
  document.getElementById('kpi-irr-sub').textContent = `vs ${state.wacc}% hurdle`;

  document.getElementById('kpi-payback').textContent = fmt.yrs(model.payback);
  document.getElementById('kpi-payback-sub').textContent = `Undiscounted`;
}

function niceCeil(v) {
  if (v <= 0) return 0;
  const log = Math.floor(Math.log10(v));
  const step = Math.pow(10, log) / 2;
  return Math.ceil(v / step) * step;
}
function niceFloor(v) {
  if (v >= 0) return 0;
  return -niceCeil(-v);
}
function renderFcfChart(model) {
  const labels = model.rows.map(r => 'Y' + r.year);
  const data = model.rows.map(r => r.fcf / 1e6);
  let cum = 0; const cumSeries = data.map(v => (cum += v));
  // Single y-axis sized to fit the cumulative trajectory (always the larger range).
  // Bars and line read off the same scale — no axis confusion.
  const allVals = [...data, ...cumSeries, 0];
  const yMax = niceCeil(Math.max(...allVals) * 1.05) || 100;
  const yMinRaw = Math.min(...allVals);
  const yMin = yMinRaw < 0 ? niceFloor(yMinRaw * 1.10) : -yMax * 0.05; // small negative band when always-positive
  makeOrUpdate('fcfChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Annual FCF',
          data,
          backgroundColor: data.map(v => v >= 0 ? COLORS.derrick : COLORS.clay),
          borderRadius: 3,
          order: 2,
        },
        {
          type: 'line',
          label: 'Cumulative FCF',
          data: cumSeries,
          borderColor: COLORS.iron,
          backgroundColor: 'rgba(61,61,61,0.05)',
          fill: true,
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: 2,
          pointBackgroundColor: COLORS.iron,
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10 } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt.moneyM(c.parsed.y * 1e6) } }
      },
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: { callback: v => '$' + v + 'M' },
          grid: {
            color: ctx => ctx.tick.value === 0 ? '#888' : '#eee',
            lineWidth: ctx => ctx.tick.value === 0 ? 1.5 : 1,
          },
        },
        x: { grid: { display: false } }
      }
    }
  });
  const finalCum = cumSeries[cumSeries.length - 1] * 1e6;
  const minCum = Math.min(...cumSeries) * 1e6;
  const minIdx = cumSeries.indexOf(Math.min(...cumSeries));
  const trough = minCum < 0 ? `, trough ${fmt.money0(minCum)} at Y${minIdx + 1}` : '';
  document.getElementById('fcf-sub').textContent = `Ends at ${fmt.money0(finalCum)}${trough}`;
}

function renderRevStackChart(model) {
  const labels = model.rows.map(r => 'Y' + r.year);
  const oil = model.rows.map(r => r.oilRev / 1e6);
  const ngl = model.rows.map(r => r.nglRev / 1e6);
  const gas = model.rows.map(r => r.gasMarketRev / 1e6);
  const pwr = model.rows.map(r => r.powerRev / 1e6);
  const datasets = [
    { label: 'Oil', data: oil, backgroundColor: COLORS.oil, stack: 'rev' },
    { label: 'NGLs', data: ngl, backgroundColor: COLORS.ngl, stack: 'rev' },
    { label: 'Pipeline gas', data: gas, backgroundColor: COLORS.gas, stack: 'rev' },
  ];
  if (state.scenario !== 'A') {
    datasets.push({
      label: state.scenario === 'B' ? 'Wholesale power' : 'Hyperscaler lease',
      data: pwr, backgroundColor: COLORS.derrick, stack: 'rev',
    });
  }
  makeOrUpdate('revStackChart', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10 } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt.moneyM(c.parsed.y * 1e6) } }
      },
      scales: {
        y: { stacked: true, ticks: { callback: v => '$' + v + 'M' }, grid: { color: '#eee' } },
        x: { stacked: true, grid: { display: false } }
      }
    }
  });
}

function renderDeclineChart() {
  const yrs = [];
  const gas = [];
  const { WELL } = window;
  for (let y = 1; y <= 20; y++) {
    yrs.push('Y' + y);
    let m;
    if (y === 1) m = 0.60;
    else {
      const declineTable = [1.00, 0.50, 0.342, 0.260, 0.211, 0.176, 0.149, 0.130, 0.116, 0.105, 0.094, 0.085, 0.078, 0.072, 0.066, 0.060, 0.055, 0.050, 0.046, 0.039];
      m = declineTable[y - 1] || 0.039;
    }
    gas.push(3799 * m);
  }
  makeOrUpdate('declineChart', {
    type: 'line',
    data: {
      labels: yrs,
      datasets: [{
        label: 'Gas Mcf/d (avg)',
        data: gas,
        borderColor: COLORS.derrick,
        backgroundColor: 'rgba(139,26,26,0.10)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: COLORS.derrick,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => fmt.num(v) + ' Mcf/d' }, grid: { color: '#eee' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderGasSupplyChart(model) {
  const labels = model.rows.map(r => 'Y' + r.year);
  const supply = model.rows.map(r => (r.gasToPlantMcf + r.gasToMarketMcf) / 365 / 1000); // MMcf/d
  const demand = (state.scenario === 'A') ? null : labels.map(() => model.plantDailyGasMcf / 1000);
  const datasets = [{
    label: 'Total well gas (MMcf/d)',
    data: supply,
    backgroundColor: COLORS.clay,
    borderColor: COLORS.derrick,
    borderWidth: 1,
    borderRadius: 3,
  }];
  if (demand) {
    datasets.push({
      type: 'line',
      label: 'Plant demand (MMcf/d)',
      data: demand,
      borderColor: COLORS.iron,
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: 0,
    });
  }
  makeOrUpdate('gasSupplyChart', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10 } } },
      scales: {
        y: { ticks: { callback: v => v.toFixed(0) + ' MMcf/d' }, grid: { color: '#eee' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderWaterfall() {
  const w = M.singleWellMarginPerBoe(state);
  // Bridge waterfall: rev → minus op-cost → field margin → minus DD&A → minus G&A → minus tax → net
  const items = [
    { label: 'Revenue', val: w.revPerBoe, type: 'pos' },
    { label: 'Op. cost', val: -w.opCostPerBoe, type: 'neg' },
    { label: 'Field margin', val: w.grossPerBoe, type: 'total' },
    { label: 'DD&A', val: -w.dda, type: 'neg' },
    { label: 'G&A', val: -w.ga, type: 'neg' },
    { label: 'Taxes', val: -w.taxPerBoe, type: 'neg' },
    { label: 'Net', val: w.netPerBoe, type: 'total' },
  ];
  let running = 0;
  const bases = [], deltas = [], colors = [];
  items.forEach(it => {
    if (it.type === 'pos' || it.type === 'total') {
      bases.push(0);
      deltas.push(it.val);
      colors.push(it.type === 'total' ? COLORS.iron : COLORS.derrick);
      running = it.val;
    } else {
      const newRun = running + it.val; // val is negative
      bases.push(newRun);
      deltas.push(-it.val);
      colors.push(COLORS.clay);
      running = newRun;
    }
  });
  makeOrUpdate('waterfallChart', {
    type: 'bar',
    data: {
      labels: items.map(i => i.label),
      datasets: [
        { label: 'base', data: bases, backgroundColor: 'rgba(0,0,0,0)', stack: 'w' },
        { label: '$/boe', data: deltas, backgroundColor: colors, stack: 'w', borderRadius: 3 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: ctx => ctx.dataset.label !== 'base',
          callbacks: {
            label: ctx => {
              const it = items[ctx.dataIndex];
              return `$${(it.val).toFixed(2)}/boe`;
            }
          }
        },
      },
      scales: {
        y: { ticks: { callback: v => '$' + v }, grid: { color: '#eee' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ===== Financial-model table =====
function renderModelTable(model) {
  const headers = ['Year', 'Wells', 'Oil bbl/d', 'Gas Mcf/d', 'NGL bbl/d',
    'Oil $M', 'NGL $M', 'Gas $M', 'Power $M', 'Total Rev $M',
    'Cash Cost $M', 'EBITDA $M', 'CapEx $M', 'FCF $M'];
  let html = '<thead><tr>' + headers.map(h => '<th class="num">' + h + '</th>').join('') + '</tr></thead><tbody>';
  let totalRev = 0, totalCC = 0, totalE = 0, totalC = 0, totalF = 0;
  model.rows.forEach(r => {
    totalRev += r.totalRev; totalCC += r.totalCashCost; totalE += r.ebitda; totalC += r.capex; totalF += r.fcf;
    html += '<tr>' +
      `<td class="num">${r.year}</td>` +
      `<td class="num">${r.wells}</td>` +
      `<td class="num">${fmt.num(r.oilDaily)}</td>` +
      `<td class="num">${fmt.num(r.gasDaily)}</td>` +
      `<td class="num">${fmt.num(r.nglDaily)}</td>` +
      `<td class="num">${(r.oilRev / 1e6).toFixed(1)}</td>` +
      `<td class="num">${(r.nglRev / 1e6).toFixed(1)}</td>` +
      `<td class="num">${(r.gasMarketRev / 1e6).toFixed(1)}</td>` +
      `<td class="num">${(r.powerRev / 1e6).toFixed(1)}</td>` +
      `<td class="num">${(r.totalRev / 1e6).toFixed(1)}</td>` +
      `<td class="num">${(r.totalCashCost / 1e6).toFixed(1)}</td>` +
      `<td class="num ${r.ebitda < 0 ? 'neg' : ''}">${(r.ebitda / 1e6).toFixed(1)}</td>` +
      `<td class="num">${(r.capex / 1e6).toFixed(1)}</td>` +
      `<td class="num ${r.fcf < 0 ? 'neg' : 'pos'}">${(r.fcf / 1e6).toFixed(1)}</td>` +
      '</tr>';
  });
  html += `<tr class="total">
      <td class="num">Total</td><td></td><td></td><td></td><td></td>
      <td class="num">${(model.rows.reduce((s,r)=>s+r.oilRev,0)/1e6).toFixed(1)}</td>
      <td class="num">${(model.rows.reduce((s,r)=>s+r.nglRev,0)/1e6).toFixed(1)}</td>
      <td class="num">${(model.rows.reduce((s,r)=>s+r.gasMarketRev,0)/1e6).toFixed(1)}</td>
      <td class="num">${(model.rows.reduce((s,r)=>s+r.powerRev,0)/1e6).toFixed(1)}</td>
      <td class="num">${(totalRev/1e6).toFixed(1)}</td>
      <td class="num">${(totalCC/1e6).toFixed(1)}</td>
      <td class="num">${(totalE/1e6).toFixed(1)}</td>
      <td class="num">${(totalC/1e6).toFixed(1)}</td>
      <td class="num">${(totalF/1e6).toFixed(1)}</td>
    </tr>`;
  html += '</tbody>';
  document.getElementById('modelTable').innerHTML = html;
}

// ===== Scenario comparison =====
function renderCompare() {
  const scenarios = ['A', 'B', 'C'];
  const labels = { A: 'A · Wells Only', B: 'B · Wells + Power', C: 'C · Full Integration' };
  const results = scenarios.map(s => ({ s, m: M.runModel(state, s) }));

  // KPI strip — cumulative side-by-side
  const kpiHtml = results.map(({ s, m }) => `
    <div class="kpi" style="border-top-color:${s==='A'?COLORS.iron:s==='B'?COLORS.signal:COLORS.derrick}">
      <div class="kpi-label">${labels[s]}</div>
      <div class="kpi-value">${fmt.money0(m.npv)}</div>
      <div class="kpi-sub">NPV · IRR ${m.irr==null?'—':fmt.pct(m.irr)} · Payback ${fmt.yrs(m.payback)}</div>
    </div>
  `).join('');
  document.getElementById('compareKpis').innerHTML = kpiHtml;

  // Cumulative FCF chart
  const yrLabels = ['Y0', ...results[0].m.rows.map(r => 'Y' + r.year)];
  const cumSeries = results.map(({ s, m }) => {
    let cum = 0;
    const series = [0];
    m.rows.forEach(r => { cum += r.fcf / 1e6; series.push(cum); });
    return {
      label: labels[s],
      data: series,
      borderColor: s==='A'?COLORS.iron:s==='B'?COLORS.signal:COLORS.derrick,
      backgroundColor: 'transparent',
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2.5,
    };
  });
  makeOrUpdate('cumChart', {
    type: 'line',
    data: { labels: yrLabels, datasets: cumSeries },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt.moneyM(c.parsed.y * 1e6) } }
      },
      scales: {
        y: { ticks: { callback: v => '$' + v + 'M' }, grid: { color: '#eee' } },
        x: { grid: { display: false } }
      }
    }
  });

  // NPV vs WACC sensitivity
  const waccs = [4, 6, 8, 10, 12, 14, 16, 18, 20];
  const npvDatasets = results.map(({ s, m }) => {
    const fcfs = [0, ...m.rows.map(r => r.fcf)];
    return {
      label: labels[s],
      data: waccs.map(w => window.OhioModel.npv(w/100, fcfs) / 1e6),
      borderColor: s==='A'?COLORS.iron:s==='B'?COLORS.signal:COLORS.derrick,
      backgroundColor: 'transparent',
      pointRadius: 3,
      pointBackgroundColor: s==='A'?COLORS.iron:s==='B'?COLORS.signal:COLORS.derrick,
      tension: 0.2,
      borderWidth: 2,
    };
  });
  makeOrUpdate('npvSensChart', {
    type: 'line',
    data: { labels: waccs.map(w => w + '%'), datasets: npvDatasets },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt.moneyM(c.parsed.y * 1e6) } }
      },
      scales: {
        y: { ticks: { callback: v => '$' + v + 'M' }, grid: { color: '#eee' } },
        x: {
          title: { display: true, text: 'Discount rate (WACC)', font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });

  // Sensitivity heat-map: WTI × leaseRate (or × HH for scenario A)
  renderSensTable();
}

function renderSensTable() {
  const wtis = [60, 70, 80, 90, 100, 110, 120, 130];
  const colsLabel = state.scenario === 'A' ? 'Henry Hub ($/MMBtu)' : (state.scenario === 'B' ? 'Power Price ($/MWh)' : 'Lease Rate ($/MWh)');
  const colVals = state.scenario === 'A' ? [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5]
    : state.scenario === 'B' ? [40, 50, 60, 70, 80, 90, 100]
    : [50, 60, 70, 80, 90, 100, 110];
  let grid = wtis.map(wti => colVals.map(cv => {
    const p = { ...state, wti };
    if (state.scenario === 'A') p.hh = cv;
    else if (state.scenario === 'B') p.powerPrice = cv;
    else p.leaseRate = cv;
    const m = M.runModel(p, state.scenario);
    return m.npv / 1e6;
  }));
  // Find min/max to color
  const flat = grid.flat();
  const min = Math.min(...flat), max = Math.max(...flat);
  function color(v) {
    if (max === min) return '#fff';
    const t = (v - min) / (max - min);
    if (v >= 0) {
      // ramp: blush → derrick
      const r = Math.round(246 + (139 - 246) * t);
      const g = Math.round(225 + (26 - 225) * t);
      const b = Math.round(225 + (26 - 225) * t);
      return `rgb(${r},${g},${b})`;
    } else {
      // negative: white → grey
      const t2 = Math.min(1, Math.abs(v) / Math.max(1, Math.abs(min)));
      const r = Math.round(255 - 50 * t2);
      const g = Math.round(255 - 50 * t2);
      const b = Math.round(255 - 50 * t2);
      return `rgb(${r},${g},${b})`;
    }
  }
  function textColor(v) { return v > (min + (max-min)*0.55) ? '#fff' : '#1a1a1a'; }
  let html = `<thead><tr><th>WTI ↓ \\ ${colsLabel} →</th>` + colVals.map(cv => `<th class="num">${cv}</th>`).join('') + '</tr></thead><tbody>';
  wtis.forEach((wti, i) => {
    html += `<tr><td><strong>$${wti}</strong></td>` + grid[i].map(v => {
      return `<td class="heat" style="background:${color(v)};color:${textColor(v)}">${v >= 0 ? '$' : '−$'}${Math.abs(v).toFixed(0)}M</td>`;
    }).join('') + '</tr>';
  });
  html += '</tbody>';
  document.getElementById('sensTable').innerHTML = html;
}

function renderRealizedChips() {
  const r = M.realizedPrices(state);
  const oilEl = document.getElementById('oilRealized');
  if (oilEl) oilEl.textContent = '$' + r.oil.toFixed(2) + '/bbl';
  const gasEl = document.getElementById('gasRealized');
  if (gasEl) gasEl.textContent = '$' + r.gas.toFixed(2) + '/Mcf';
  const nglEl = document.getElementById('nglRealized');
  if (nglEl) nglEl.textContent = '$' + r.ngl.toFixed(2) + '/bbl';
}

// ===========================================================
// Ohio Field Map (Leaflet)
// ===========================================================
const MAP_STATE = {
  map: null,
  markerLayer: null,
  metric: 'gasMcfe',
  metricLabel: 'Gas-equivalent production (Mcfe)',
  selectedCounty: null,
};

// metric configuration
const MAP_METRICS = {
  gasMcfe:     { label: 'Gas-equivalent production (Mcfe)', short: 'Production',  fmt: v => fmtBcfe(v) },
  oilBbl:      { label: 'Oil production (bbl)',             short: 'Oil',          fmt: v => fmt.num(v) + ' bbl' },
  totalWells:  { label: 'Total wells (drilled+drilling+producing)', short: 'Wells', fmt: v => fmt.num(v) + ' wells' },
  newWells:    { label: 'New wells in H2 2024',             short: 'New Wells',    fmt: v => fmt.num(v) + ' new' },
  investmentM: { label: 'H2 2024 upstream investment ($M)', short: 'Investment',   fmt: v => '$' + v.toFixed(1) + 'M' },
};

function fmtBcfe(mcfe) {
  // Mcfe → Bcfe (1 Bcfe = 1,000,000 Mcfe)
  if (mcfe >= 1_000_000) return (mcfe / 1_000_000).toFixed(1) + ' Bcfe';
  if (mcfe >= 1_000) return (mcfe / 1_000).toFixed(1) + ' MMcfe';
  return fmt.num(mcfe) + ' Mcfe';
}

function radiusForMetric(value, maxValue) {
  // Square-root scaling so markers' AREA is proportional to value
  if (maxValue <= 0 || value <= 0) return 4;
  const r = 6 + 28 * Math.sqrt(value / maxValue);
  return Math.max(4, r);
}

function colorForMetric(value, maxValue) {
  if (maxValue <= 0 || value <= 0) return '#e0e0e0';
  const t = Math.sqrt(value / maxValue); // ramp by sqrt to spread mid-tier
  // Clay → Derrick gradient
  // Clay: 212,106,106 (D46A6A)  Derrick: 139,26,26 (8B1A1A)
  const r = Math.round(212 + (139 - 212) * t);
  const g = Math.round(106 + (26 - 106) * t);
  const b = Math.round(106 + (26 - 106) * t);
  return `rgb(${r},${g},${b})`;
}

function initMap() {
  if (MAP_STATE.map) return;
  if (typeof L === 'undefined') return;
  const C = window.OhioCounties;
  if (!C) return;

  // Center on the heart of the Utica play
  MAP_STATE.map = L.map('ohioMap', {
    center: [40.20, -81.30],
    zoom: 8,
    minZoom: 6,
    maxZoom: 12,
    scrollWheelZoom: false,
  });
  // Subtle, light basemap
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(MAP_STATE.map);

  MAP_STATE.markerLayer = L.layerGroup().addTo(MAP_STATE.map);
  refreshMapMarkers();
  populateCountyDropdown();

  // Bind metric toggle
  document.querySelectorAll('.map-metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-metric-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MAP_STATE.metric = btn.dataset.metric;
      MAP_STATE.metricLabel = MAP_METRICS[btn.dataset.metric].label;
      refreshMapMarkers();
    });
  });
}

function populateCountyDropdown() {
  const sel = document.getElementById('countySelect');
  if (!sel || sel.dataset.bound === '1') return;
  const { COUNTIES } = window.OhioCounties;
  const sorted = [...COUNTIES].sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = '<option value="">— Select a county —</option>' +
    sorted.map(c => `<option value="${c.name}">${c.name} County · ${c.producing} wells · ${(c.gasMcfe / 1e6).toFixed(1)} Bcfe</option>`).join('');
  sel.addEventListener('change', e => {
    const name = e.target.value;
    if (!name) return;
    const c = COUNTIES.find(x => x.name === name);
    if (c && MAP_STATE.map) {
      MAP_STATE.map.flyTo([c.lat, c.lng], 10, { duration: 0.7 });
      showCountyDetail(c);
    }
  });
  sel.dataset.bound = '1';
  // Reset button
  const reset = document.getElementById('countyClearBtn');
  if (reset && reset.dataset.bound !== '1') {
    reset.addEventListener('click', () => {
      sel.value = '';
      MAP_STATE.selectedCounty = null;
      MAP_STATE.map.flyTo([40.20, -81.30], 8, { duration: 0.7 });
      showEmptyDetail();
    });
    reset.dataset.bound = '1';
  }
}

function showEmptyDetail() {
  const det = document.getElementById('mapDetail');
  if (!det) return;
  det.innerHTML = `
    <div class="map-detail-header">
      <div class="map-detail-tag">SELECT A COUNTY</div>
      <h3>Click a marker</h3>
      <div class="map-detail-sub">Each circle's size scales with the metric selected above.</div>
    </div>
    <div class="map-detail-body">
      <div class="map-empty">
        <p>Eight counties — Belmont, Carroll, Columbiana, Guernsey, Harrison, Jefferson, Monroe, and Noble — account for more than 98% of producing Utica wells in Ohio.</p>
        <p>Tuscarawas County is the volatile-oil window emerging play that the financial model is calibrated to.</p>
      </div>
    </div>
  `;
}

function refreshMapMarkers() {
  const { COUNTIES } = window.OhioCounties;
  const metric = MAP_STATE.metric;
  const values = COUNTIES.map(c => c[metric] || 0);
  const maxV = Math.max(...values);
  MAP_STATE.markerLayer.clearLayers();

  COUNTIES.forEach(c => {
    const v = c[metric] || 0;
    const radius = radiusForMetric(v, maxV);
    const color = colorForMetric(v, maxV);
    const marker = L.circleMarker([c.lat, c.lng], {
      radius,
      fillColor: color,
      color: '#8B1A1A',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.65,
    });
    marker.bindTooltip(`<strong>${c.name}</strong><br>${MAP_METRICS[metric].short}: ${MAP_METRICS[metric].fmt(v)}`, {
      direction: 'top',
      offset: [0, -radius],
    });
    marker.on('click', () => showCountyDetail(c));
    marker.addTo(MAP_STATE.markerLayer);
  });
}

function showCountyDetail(c) {
  MAP_STATE.selectedCounty = c.name;
  // Sync the dropdown
  const sel = document.getElementById('countySelect');
  if (sel && sel.value !== c.name) sel.value = c.name;
  const det = document.getElementById('mapDetail');
  if (!det) return;
  const cumBcfe = c.cumulativeBcfe;
  const oilShare = c.gasMcfe > 0 ? (c.oilBbl * 5.659 / c.gasMcfe * 100) : 0;
  // H2 2024 = July through December = 184 days
  const H2_DAYS = 184;
  const oilPerDay = c.oilBbl / H2_DAYS;
  const gasPerDay = c.gasMcf / H2_DAYS;
  det.innerHTML = `
    <div class="map-detail-header">
      <div class="map-detail-tag">${c.name.toUpperCase()} COUNTY · OHIO</div>
      <h3>${c.name}</h3>
      <div class="map-detail-sub">${c.note}</div>
    </div>
    <div class="map-detail-body">
      <div class="map-detail-section-title">H2 2024 Production</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Gas-equivalent</span><span class="map-detail-stat-value">${fmtBcfe(c.gasMcfe)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Natural gas</span><span class="map-detail-stat-value">${fmtBcfe(c.gasMcf)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Oil (total)</span><span class="map-detail-stat-value">${fmt.num(c.oilBbl)} bbl</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Oil per day</span><span class="map-detail-stat-value">${fmt.num(oilPerDay)} bbl/d</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Gas per day</span><span class="map-detail-stat-value">${(gasPerDay / 1000).toFixed(1)} MMcf/d</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Oil share of boe</span><span class="map-detail-stat-value">${oilShare.toFixed(1)}%</span></div>

      <div class="map-detail-section-title">Wells (Dec 2024)</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Producing</span><span class="map-detail-stat-value">${fmt.num(c.producing)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Drilling</span><span class="map-detail-stat-value">${fmt.num(c.drilling)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Drilled (awaiting)</span><span class="map-detail-stat-value">${fmt.num(c.drilled)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total</span><span class="map-detail-stat-value">${fmt.num(c.totalWells)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">New in H2 2024</span><span class="map-detail-stat-value">${fmt.num(c.newWells)}</span></div>

      <div class="map-detail-section-title">Per Producing Well · H2 2024 Avg</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Gas-equiv production</span><span class="map-detail-stat-value">${c.prodWells > 0 ? fmtBcfe(c.gasMcfe / c.prodWells) : '—'}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Oil production</span><span class="map-detail-stat-value">${c.prodWells > 0 ? fmt.num(c.oilBbl / c.prodWells) + ' bbl' : '—'}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Oil per well per day</span><span class="map-detail-stat-value">${c.prodWells > 0 ? fmt.num(c.oilBbl / c.prodWells / H2_DAYS) + ' bbl/d' : '—'}</span></div>

      <div class="map-detail-section-title">Investment · H2 2024</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Drilling + roads</span><span class="map-detail-stat-value">$${c.investmentM.toFixed(1)}M</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Lease operating expense</span><span class="map-detail-stat-value">$${c.loeM.toFixed(2)}M</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total upstream</span><span class="map-detail-stat-value">$${(c.investmentM + c.loeM).toFixed(1)}M</span></div>

      <div class="map-detail-section-title">Cumulative</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total Utica production</span><span class="map-detail-stat-value">${cumBcfe.toLocaleString()} Bcfe</span></div>

      <div class="map-detail-note">${c.note}</div>
    </div>
  `;
}

function renderMapKPIs() {
  const T = window.OhioCounties.STATE_TOTALS;
  const html = `
    <div class="kpi"><div class="kpi-label">Producing Wells</div><div class="kpi-value">${T.prodWells.toLocaleString()}</div><div class="kpi-sub">As of Dec 2024</div></div>
    <div class="kpi"><div class="kpi-label">New Wells (H2 '24)</div><div class="kpi-value">${T.newWells}</div><div class="kpi-sub">+34% vs H1 2024</div></div>
    <div class="kpi"><div class="kpi-label">Gas Equivalent</div><div class="kpi-value">${(T.gasMcfe / 1e9).toFixed(1)} Tcfe</div><div class="kpi-sub">H2 2024 total</div></div>
    <div class="kpi"><div class="kpi-label">Oil Production</div><div class="kpi-value">${(T.oilBbl / 1e6).toFixed(1)}M bbl</div><div class="kpi-sub">H2 2024 · +27% YoY</div></div>
    <div class="kpi"><div class="kpi-label">Upstream Invested</div><div class="kpi-value">$${(T.investmentM / 1e3).toFixed(2)}B</div><div class="kpi-sub">H2 2024 drilling+roads</div></div>
    <div class="kpi"><div class="kpi-label">Cumulative Shale $</div><div class="kpi-value">$${(T.cumulativeShaleM / 1e3).toFixed(1)}B</div><div class="kpi-sub">2011–2024 all-stream</div></div>
  `;
  document.getElementById('mapKpis').innerHTML = html;
}

function renderCountyTable() {
  const { COUNTIES } = window.OhioCounties;
  const top = [...COUNTIES].sort((a, b) => b.gasMcfe - a.gasMcfe).slice(0, 10);
  let html = `<thead><tr>
    <th>County</th>
    <th class="num">Gas Equiv (Bcfe)</th>
    <th class="num">Oil (bbl)</th>
    <th class="num">Producing</th>
    <th class="num">Total Wells</th>
    <th class="num">New (H2 '24)</th>
    <th class="num">Investment $M</th>
    <th class="num">LOE $M</th>
  </tr></thead><tbody>`;
  top.forEach(c => {
    html += `<tr data-county="${c.name}">
      <td><strong>${c.name}</strong></td>
      <td class="num">${(c.gasMcfe / 1e6).toFixed(1)}</td>
      <td class="num">${c.oilBbl.toLocaleString()}</td>
      <td class="num">${c.producing}</td>
      <td class="num">${c.totalWells}</td>
      <td class="num">${c.newWells}</td>
      <td class="num">${c.investmentM.toFixed(1)}</td>
      <td class="num">${c.loeM.toFixed(2)}</td>
    </tr>`;
  });
  html += '</tbody>';
  const t = document.getElementById('countyTable');
  if (!t) return;
  t.innerHTML = html;
  // Click a row → focus the map and show detail
  t.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const name = tr.dataset.county;
      const c = COUNTIES.find(x => x.name === name);
      if (c && MAP_STATE.map) {
        MAP_STATE.map.flyTo([c.lat, c.lng], 10, { duration: 0.8 });
        showCountyDetail(c);
      }
    });
  });
}

function renderFieldMap() {
  if (typeof L === 'undefined' || !window.OhioCounties) return;
  renderMapKPIs();
  renderCountyTable();
  initMap();
  // Leaflet sometimes mis-sizes when initialized in a hidden tab; nudge it
  setTimeout(() => MAP_STATE.map && MAP_STATE.map.invalidateSize(), 50);
}

// ===== Master render =====
function render() {
  const model = M.runModel(state, state.scenario);
  renderRealizedChips();
  renderKPIs(model);
  renderFcfChart(model);
  renderRevStackChart(model);
  renderDeclineChart();
  renderGasSupplyChart(model);
  renderWaterfall();
  renderModelTable(model);
  renderCompare();
}

// ===== Boot =====
function boot() {
  try {
    syncInputs();
    bindInputs();
    bindScenarioToggle();
    bindNav();
    bindReset();
    // initial visibility for Scenario A (hide BC/C panels)
    document.querySelectorAll('.scenarioBC').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.scenarioC').forEach(el => el.classList.add('hidden'));
    render();
  } catch (e) {
    console.error('Boot failed:', e);
  }
}
window.render = render;
window.boot = boot;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
