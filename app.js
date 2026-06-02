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
  grid: '#4F7799',   // steel blue — utility/grid supply, deliberately not red
  pos: '#2f7d32',
  neg: '#b00020',
};

if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = 'Montserrat, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#3D3D3D';
}

// ===== State =====
const state = { ...M.DEFAULTS, scenario: 'B' };

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

// Toggle sidebar / chart visibility based on which sections each scenario needs.
// Class semantics:
//   .scenarioA   — visible only on A (Land Sale inputs)
//   .scenarioBCD — visible on B/C/D (wells & drilling — every operating path)
//   .scenarioCD  — visible on C/D (power plant)
//   .scenarioD   — visible on D (data center / hyperscaler)
function applyScenarioVisibility() {
  const s = state.scenario;
  document.querySelectorAll('.scenarioA').forEach(el => el.classList.toggle('hidden', s !== 'A'));
  document.querySelectorAll('.scenarioBCD').forEach(el => el.classList.toggle('hidden', s === 'A'));
  document.querySelectorAll('.scenarioCD').forEach(el => el.classList.toggle('hidden', s !== 'C' && s !== 'D'));
  document.querySelectorAll('.scenarioD').forEach(el => el.classList.toggle('hidden', s !== 'D'));
}

function syncScenarioButtons() {
  document.querySelectorAll('.scenario-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.scenario === state.scenario));
  // Don't overwrite the "Evaluates all paths" placeholder when the picker
  // is disabled (Path Analysis view).
  document.querySelectorAll('.scenario-select').forEach(sel => {
    if (sel.disabled) return;
    if (sel.value !== state.scenario) sel.value = state.scenario;
  });
}

function bindScenarioToggle() {
  document.querySelectorAll('.scenario-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.scenario = btn.dataset.scenario;
      syncScenarioButtons();
      applyScenarioVisibility();
      render();
    });
  });
  document.querySelectorAll('.scenario-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const target = document.querySelector(`.scenario-btn[data-scenario="${sel.value}"]`);
      if (target) target.click();
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
      // Power Ramp charts need to be created/resized when their tab becomes visible
      if (target === 'powerramp') {
        renderPowerRamp();
        setTimeout(() => {
          ['rampDeclineChart', 'rampStackChart'].forEach(id => charts[id]?.resize?.());
        }, 0);
      }
      // Chart.js mis-sizes when canvases are created in a hidden parent (e.g. when
      // the user lands on the Project Overview tab first). Force a resize on
      // dashboard activation so canvases pick up their now-visible dimensions.
      if (target === 'dashboard') {
        setTimeout(() => Object.values(charts).forEach(c => c.resize?.()), 0);
      }
      // Close mobile menu after selection
      closeMobileMenu();
    });
  });
}

function closeMobileMenu() {
  const nav = document.getElementById('topnav');
  const btn = document.getElementById('mobileMenuToggle');
  if (nav) nav.classList.remove('open');
  if (btn) {
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function bindMobileMenu() {
  const btn = document.getElementById('mobileMenuToggle');
  const nav = document.getElementById('topnav');
  if (!btn || !nav) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = nav.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  // Close when clicking outside the nav
  document.addEventListener('click', e => {
    if (!nav.classList.contains('open')) return;
    if (e.target.closest('.topnav') || e.target.closest('.mobile-menu-toggle')) return;
    closeMobileMenu();
  });
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileMenu();
  });
}

// In-page jump links (e.g. "Dashboard tab" inside Project Overview) — proxy to the
// matching topnav link so a single navigation path runs (re-render + scroll + close mobile menu).
function bindJumpLinks() {
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[data-target]');
    if (!a || a.classList.contains('navlink')) return; // navlinks are handled by bindNav
    e.preventDefault();
    const link = document.querySelector(`.navlink[data-target="${a.dataset.target}"]`);
    if (link) link.click();
  });
}

function bindReset() {
  document.getElementById('resetBtn').addEventListener('click', () => {
    Object.assign(state, M.DEFAULTS);
    syncInputs();
    scenarioStore.setLoaded(null);
    render();
  });
}

// ===== Saved scenarios (Supabase-backed) =====
// Stores a named snapshot of every Dashboard input + the active scenario letter
// in a public `scenarios` table. Anyone visiting the site sees the same list.
const scenarioStore = (() => {
  const INPUT_KEYS = Object.keys(M.DEFAULTS || {});
  let client = null;
  let loadedId = null;
  let loadedName = null;

  const els = () => ({
    wrap: document.getElementById('scenarioStore'),
    select: document.getElementById('scenarioStoreSelect'),
    saveBtn: document.getElementById('scenarioSaveBtn'),
    updateBtn: document.getElementById('scenarioUpdateBtn'),
    deleteBtn: document.getElementById('scenarioDeleteBtn'),
    status: document.getElementById('scenarioStoreStatus'),
  });

  function setStatus(msg, tone) {
    const { status } = els();
    if (!status) return;
    status.textContent = msg || '';
    status.dataset.tone = tone || '';
  }

  function snapshot() {
    const inputs = {};
    INPUT_KEYS.forEach(k => { inputs[k] = state[k]; });
    inputs.scenario = state.scenario;
    return inputs;
  }

  function applySnapshot(inputs) {
    if (!inputs || typeof inputs !== 'object') return;
    INPUT_KEYS.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(inputs, k)) state[k] = inputs[k];
    });
    if (typeof inputs.scenario === 'string') state.scenario = inputs.scenario;
    syncInputs();
    syncScenarioButtons();
    applyScenarioVisibility();
    render();
  }

  function setLoaded(row) {
    loadedId = row ? row.id : null;
    loadedName = row ? row.name : null;
    const { select, updateBtn, deleteBtn } = els();
    if (select) select.value = loadedId || '';
    if (updateBtn) updateBtn.disabled = !loadedId;
    if (deleteBtn) deleteBtn.disabled = !loadedId;
  }

  function disableAll(disabled) {
    const { saveBtn, updateBtn, deleteBtn, select } = els();
    [saveBtn, updateBtn, deleteBtn, select].forEach(el => { if (el) el.disabled = !!disabled; });
    if (!disabled) {
      // re-derive update/delete from loaded state
      if (updateBtn) updateBtn.disabled = !loadedId;
      if (deleteBtn) deleteBtn.disabled = !loadedId;
    }
  }

  async function refreshList() {
    if (!client) return;
    const { select } = els();
    if (!select) return;
    const { data, error } = await client
      .from('scenarios')
      .select('id, name, updated_at')
      .order('name', { ascending: true });
    if (error) {
      setStatus('Could not load scenarios', 'error');
      console.error('scenarios list:', error);
      return;
    }
    const current = loadedId;
    select.innerHTML = '<option value="">Select existing scenario…</option>'
      + data.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
    if (current && data.some(r => r.id === current)) {
      select.value = current;
    }
  }

  async function loadById(id) {
    if (!client || !id) return;
    disableAll(true);
    setStatus('Loading…');
    const { data, error } = await client
      .from('scenarios')
      .select('id, name, inputs')
      .eq('id', id)
      .single();
    disableAll(false);
    if (error) {
      setStatus('Could not load scenario', 'error');
      console.error('scenario load:', error);
      return;
    }
    applySnapshot(data.inputs);
    setLoaded(data);
    setStatus(`Loaded "${data.name}"`, 'ok');
  }

  // Show / hide the inline name input. We can't use window.prompt because
  // the preview pane (and any other iframe-embedded view) silently blocks it.
  function showCreateForm() {
    const btn = document.getElementById('scenarioSaveBtn');
    const inline = document.getElementById('scenarioCreateInline');
    const input = document.getElementById('scenarioCreateName');
    if (!btn || !inline || !input) return;
    btn.hidden = true;
    inline.hidden = false;
    input.value = loadedName || '';
    input.focus();
    input.select();
  }
  function hideCreateForm() {
    const btn = document.getElementById('scenarioSaveBtn');
    const inline = document.getElementById('scenarioCreateInline');
    if (btn) btn.hidden = false;
    if (inline) inline.hidden = true;
  }
  async function commitCreate() {
    if (!client) return;
    const input = document.getElementById('scenarioCreateName');
    const name = (input?.value || '').trim();
    if (!name) {
      setStatus('Please enter a name', 'error');
      input?.focus();
      return;
    }
    hideCreateForm();
    disableAll(true);
    setStatus('Saving…');
    const { data, error } = await client
      .from('scenarios')
      .insert({ name, inputs: snapshot() })
      .select('id, name')
      .single();
    disableAll(false);
    if (error) {
      if (error.code === '23505') {
        setStatus(`A scenario named "${name}" already exists`, 'error');
      } else {
        setStatus('Save failed', 'error');
        console.error('scenario save:', error);
      }
      return;
    }
    await refreshList();
    setLoaded(data);
    setStatus(`Saved "${data.name}"`, 'ok');
  }
  async function saveAs() { showCreateForm(); }

  async function update() {
    if (!client || !loadedId) return;
    disableAll(true);
    setStatus('Updating…');
    const { data, error } = await client
      .from('scenarios')
      .update({ inputs: snapshot(), updated_at: new Date().toISOString() })
      .eq('id', loadedId)
      .select('id, name')
      .single();
    disableAll(false);
    if (error) {
      setStatus('Update failed', 'error');
      console.error('scenario update:', error);
      return;
    }
    setStatus(`Updated "${data.name}"`, 'ok');
  }

  // Two-click confirm: first click arms the button (label flips to "Confirm
   // delete?"), second click within 4s actually deletes. Avoids window.confirm
   // which is blocked in iframed/embedded contexts.
  let deleteArmed = false;
  let deleteArmTimer = null;
  function disarmDelete() {
    deleteArmed = false;
    if (deleteArmTimer) { clearTimeout(deleteArmTimer); deleteArmTimer = null; }
    const btn = els().deleteBtn;
    if (btn) {
      btn.textContent = 'Delete';
      btn.classList.remove('ghost-btn--armed');
    }
  }
  async function remove() {
    if (!client || !loadedId) return;
    const btn = els().deleteBtn;
    if (!deleteArmed) {
      deleteArmed = true;
      if (btn) {
        btn.textContent = 'Confirm delete?';
        btn.classList.add('ghost-btn--armed');
      }
      setStatus(`Click again to delete "${loadedName}"`, 'warn');
      deleteArmTimer = setTimeout(() => { disarmDelete(); setStatus('', ''); }, 4000);
      return;
    }
    disarmDelete();
    disableAll(true);
    setStatus('Deleting…');
    const { error } = await client
      .from('scenarios')
      .delete()
      .eq('id', loadedId);
    disableAll(false);
    if (error) {
      setStatus('Delete failed', 'error');
      console.error('scenario delete:', error);
      return;
    }
    const removedName = loadedName;
    setLoaded(null);
    await refreshList();
    setStatus(`Deleted "${removedName}"`, 'ok');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function init() {
    const { wrap, select, saveBtn, updateBtn, deleteBtn } = els();
    if (!wrap) return;
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      setStatus('Saved scenarios unavailable (no backend config)', 'error');
      [saveBtn, updateBtn, deleteBtn, select].forEach(el => { if (el) el.disabled = true; });
      return;
    }
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    select.addEventListener('change', () => {
      const id = select.value;
      if (id) loadById(id);
      else setLoaded(null);
    });
    saveBtn.addEventListener('click', saveAs);
    updateBtn.addEventListener('click', update);
    deleteBtn.addEventListener('click', remove);
    // Inline create form
    const createConfirm = document.getElementById('scenarioCreateConfirm');
    const createCancel = document.getElementById('scenarioCreateCancel');
    const createName = document.getElementById('scenarioCreateName');
    if (createConfirm) createConfirm.addEventListener('click', commitCreate);
    if (createCancel) createCancel.addEventListener('click', () => {
      hideCreateForm();
      setStatus('', '');
    });
    if (createName) createName.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitCreate(); }
      else if (e.key === 'Escape') { e.preventDefault(); hideCreateForm(); setStatus('', ''); }
    });
    refreshList();
  }

  return { init, setLoaded };
})();

// Accordion: opening one sidebar section collapses the others.
// `toggle` doesn't bubble, so listen on each <details> directly.
function bindSidebarAccordion() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  // Collapse all but the first open section so we start in a single-open state
  const initiallyOpen = [...sidebar.querySelectorAll('details[open]')];
  initiallyOpen.slice(1).forEach(d => { d.open = false; });
  sidebar.querySelectorAll('details').forEach(d => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      sidebar.querySelectorAll('details[open]').forEach(other => {
        if (other !== d) other.open = false;
      });
    });
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
  if (state.scenario === 'C' || state.scenario === 'D') {
    datasets.push({
      label: state.scenario === 'C' ? 'Wholesale power' : 'Hyperscaler lease',
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
  const r = 1 - (state.declinePct || 0) / 100;
  // Input is in boe/d; chart shows Mcf/d (industry convention).
  for (let y = 1; y <= state.years; y++) {
    yrs.push('Y' + y);
    gas.push(state.gasPerDay * 6 * Math.pow(Math.max(0, r), y - 1));
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
  const hasPlant = state.scenario === 'C' || state.scenario === 'D';
  const demand = hasPlant ? labels.map(() => model.plantDailyGasMcf / 1000) : null;
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
              if (it.label === 'Revenue') {
                return [
                  `$${it.val.toFixed(2)}/boe (weighted avg)`,
                  `  Crude oil: $${w.oilPerBoe.toFixed(2)}/boe`,
                  `  Natural gas: $${w.gasPerBoe.toFixed(2)}/boe`,
                  `  NGLs: $${w.nglPerBoe.toFixed(2)}/boe`,
                ];
              }
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

// ===========================================================
// Power Ramp / Well Curve
// Stand-alone tab: sizes plant burn, drills wells on Arps hyperbolic decline,
// and holds plateau deliverability over the project horizon. Decoupled from
// the dashboard model so users can flex it independently.
// ===========================================================
const rampState = {
  plantMW: 500,
  heatRate: 7000,     // Btu/kWh — CCGT default; bump to 9500 for simple-cycle
  cf: 90,             // capacity factor %
  horizon: 20,        // years
  ip30: 12,           // MMcf/d — peak 30-day rate (representative gassy Utica)
  bExp: 1.1,          // Arps hyperbolic exponent
  diNominal: 1.5,     // initial nominal annual decline (1/yr)
  dnc: 11.4,          // $M per well, mirrors dashboard default
  // --- Optional grid-electricity blend ---
  // A slice of the data-center load can be served from the utility grid instead
  // of the behind-the-meter gas plant. That offsets the MW the plant must
  // generate, lowers the gas the wells must hold, and thins the drilling program
  // during the grid window. Outside the window the plant carries the full load.
  gridEnabled: false, // toggle the blend on/off
  gridMW: 150,        // MW served from the grid during the window
  gridStart: 1,       // first year the grid supplies
  gridEnd: 3,         // last year the grid supplies
  gridProfile: 'flat',// 'flat' = constant MW; 'taper' = fades to 0 across the window as wells ramp
};

// Plant burn in MMcf/day:
//   MW × 24 h = MWh/day; × 1000 → kWh/day; × Btu/kWh = Btu/day
//   ÷ 1.024e6 → Mcf/day (since 1 Mcf ≈ 1.024 MMBtu = 1,024,000 Btu)
//   ÷ 1000 → MMcf/day
function rampPlantBurnMMcfd(p) {
  return (p.plantMW * 24 * 1000 * (p.cf / 100) * p.heatRate) / 1_024_000 / 1000;
}

// MW served from the utility grid in project year y (1-indexed).
// Zero unless the blend is enabled and y falls inside [gridStart, gridEnd].
//   flat  → constant gridMW across the window
//   taper → full gridMW at the start year, fading linearly to 0 at the end year
//           (models the grid bridging the load while the wells ramp up)
function rampGridMWForYear(p, y, horizon) {
  if (!p.gridEnabled || p.gridMW <= 0) return 0;
  const hi = horizon || Math.round(p.horizon);
  const s = Math.min(Math.max(1, Math.round(p.gridStart)), hi);
  const e = Math.min(Math.max(s, Math.round(p.gridEnd)), hi); // force end ≥ start
  if (y < s || y > e) return 0;
  const cap = Math.min(p.gridMW, p.plantMW); // can't grid-supply more than the load
  if (p.gridProfile === 'taper' && e > s) {
    return cap * (e - y) / (e - s); // gridMW at s, 0 at e
  }
  return cap;
}

// Arps hyperbolic instantaneous rate at time t (years from IP).
function rampInstRate(p, t) {
  const denom = Math.pow(1 + p.bExp * p.diNominal * Math.max(0, t), 1 / p.bExp);
  return p.ip30 / denom;
}

// Per-well average daily rate over year-of-life y (1-indexed), sampled monthly.
function rampPerWellYearAvg(p, yearOfLife) {
  const tStart = yearOfLife - 1;
  let sum = 0;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    sum += rampInstRate(p, tStart + (i + 0.5) / steps);
  }
  return sum / steps;
}

// Builds the full ramp: decline table, cohorts, and year-by-year rollup.
function buildWellRamp(p) {
  const horizon = Math.max(1, Math.round(p.horizon));
  const fullBurn = rampPlantBurnMMcfd(p); // gas the wells hold when no grid blend is active

  // Precompute per-well year-of-life rates (MMcf/d), one extra year for safety.
  const declineTable = [];
  for (let yol = 1; yol <= horizon + 1; yol++) {
    declineTable.push(rampPerWellYearAvg(p, yol));
  }
  const yearOneAvg = declineTable[0] || 0.0001;

  const cohorts = []; // { startYear, count }
  const rampRows = [];

  for (let y = 1; y <= horizon; y++) {
    // Grid offset this year → the gas plant only generates the remaining MW,
    // so the gas the wells must hold scales down linearly (burn ∝ MW).
    const gridMW = rampGridMWForYear(p, y, horizon);
    const gasMW = Math.max(0, p.plantMW - gridMW);
    const targetY = p.plantMW > 0 ? fullBurn * (gasMW / p.plantMW) : 0;
    const gridGas = Math.max(0, fullBurn - targetY); // gas-equivalent the grid covers

    // Contribution from previously-drilled wells in their current year-of-life
    let fromExisting = 0;
    const perCohortContrib = []; // for stacked-area chart
    for (const c of cohorts) {
      const yol = y - c.startYear + 1;
      const rate = yol >= 1 && yol <= declineTable.length ? declineTable[yol - 1] : 0;
      const contrib = c.count * rate;
      fromExisting += contrib;
      perCohortContrib.push({ startYear: c.startYear, contrib });
    }

    const shortfall = Math.max(0, targetY - fromExisting);
    const newWells = yearOneAvg > 0 ? Math.ceil(shortfall / yearOneAvg) : 0;
    if (newWells > 0) {
      cohorts.push({ startYear: y, count: newWells });
      perCohortContrib.push({ startYear: y, contrib: newWells * yearOneAvg });
    }

    const totalDeliverable = fromExisting + newWells * yearOneAvg;
    const cumulative = cohorts.reduce((s, c) => s + c.count, 0);

    rampRows.push({
      year: y,
      newWells,
      cumulative,
      fromExisting,
      totalDeliverable,
      target: targetY,   // gas the wells must hold this year (post-grid)
      fullBurn,          // full plant appetite (flat plateau line)
      gridMW,
      gridGas,
      perCohortContrib,
    });
  }

  // Lifetime aggregates
  const totalWells = cohorts.reduce((s, c) => s + c.count, 0);
  const totalBcf = rampRows.reduce((s, r) => s + r.totalDeliverable, 0) * 365 / 1000;
  const gridBcf = rampRows.reduce((s, r) => s + r.gridGas, 0) * 365 / 1000;
  const peakWellTarget = rampRows.reduce((m, r) => Math.max(m, r.target), 0);
  // Deepest the well plateau dips while the grid is carrying load — captures the
  // offset for both a permanent slice and an early bridge window.
  const minWellTarget = rampRows.reduce((m, r) => Math.min(m, r.target), fullBurn);

  // Sustaining cadence — average wells/yr from year 8 onward (or last third of horizon, whichever is later)
  const sustStart = Math.min(horizon - 1, Math.max(8, Math.floor(horizon * 0.4)));
  const sustainRows = rampRows.slice(sustStart - 1);
  const sustainCadence = sustainRows.length
    ? sustainRows.reduce((s, r) => s + r.newWells, 0) / sustainRows.length
    : 0;

  const totalDnc = totalWells * p.dnc; // $M

  return {
    target: fullBurn, fullBurn, peakWellTarget, minWellTarget, yearOneAvg, declineTable,
    cohorts, rampRows,
    totalWells, totalBcf, gridBcf, sustainCadence, sustStart,
    totalDnc,
    gridActive: p.gridEnabled && p.gridMW > 0,
  };
}

// Group cohort vintages into ~5 buckets for the stacked chart legend.
// Returns an array of { label, color, range:[startYear,endYear] }.
function rampVintageBuckets(horizon) {
  // Buckets adapt to horizon length. Aim for 5 buckets that read naturally.
  const buckets = [];
  if (horizon <= 12) {
    buckets.push({ label: 'Year 1', range: [1, 1] });
    buckets.push({ label: 'Yrs 2–3', range: [2, 3] });
    buckets.push({ label: 'Yrs 4–6', range: [4, 6] });
    buckets.push({ label: 'Yrs 7–9', range: [7, 9] });
    buckets.push({ label: `Yrs 10–${horizon}`, range: [10, horizon] });
  } else {
    buckets.push({ label: 'Year 1', range: [1, 1] });
    buckets.push({ label: 'Yrs 2–5', range: [2, 5] });
    buckets.push({ label: 'Yrs 6–10', range: [6, 10] });
    buckets.push({ label: 'Yrs 11–15', range: [11, 15] });
    buckets.push({ label: `Yrs 16–${horizon}`, range: [16, horizon] });
  }
  // Wells-themed palette — strongest red for the original cohort, fading to clay/blush for newer vintages
  const palette = [COLORS.derrick, COLORS.signal, COLORS.clay, '#E29A9A', COLORS.blush];
  buckets.forEach((b, i) => { b.color = palette[i]; });
  return buckets.filter(b => b.range[0] <= horizon);
}

function renderPowerRamp() {
  if (typeof Chart === 'undefined') return;
  const ramp = buildWellRamp(rampState);
  renderRampKpis(ramp);
  renderRampDeclineChart(ramp);
  renderRampStackChart(ramp);
  renderRampTable(ramp);
}

function renderRampKpis(ramp) {
  const p = rampState;
  const burn = ramp.fullBurn;
  const burnBcfYr = burn * 365 / 1000;
  const burnEl = document.getElementById('rampKpiBurn');
  if (burnEl) burnEl.textContent = burn.toFixed(0) + ' MMcf/d';
  const burnSub = document.getElementById('rampKpiBurnSub');
  if (burnSub) {
    burnSub.textContent = ramp.gridActive
      ? `grid −${Math.round(p.gridMW)} MW · Yr ${Math.round(p.gridStart)}–${Math.round(p.gridEnd)} → well plateau dips to ${ramp.minWellTarget.toFixed(0)} MMcf/d`
      : `${p.heatRate.toLocaleString()} Btu/kWh · ${p.cf}% CF · ${burnBcfYr.toFixed(1)} Bcf/yr`;
  }

  const y1 = ramp.rampRows[0]?.newWells ?? 0;
  const y1El = document.getElementById('rampKpiY1');
  if (y1El) y1El.textContent = y1.toLocaleString();

  const sustEl = document.getElementById('rampKpiSust');
  if (sustEl) sustEl.textContent = ramp.sustainCadence.toFixed(1) + ' / yr';

  const totEl = document.getElementById('rampKpiTotal');
  if (totEl) totEl.textContent = ramp.totalWells.toLocaleString();
  const totSub = document.getElementById('rampKpiTotalSub');
  if (totSub) totSub.textContent = ramp.gridActive ? `over ${p.horizon} yrs · grid-blended` : `over ${p.horizon} years`;

  const bcfEl = document.getElementById('rampKpiBcf');
  if (bcfEl) bcfEl.textContent = ramp.totalBcf.toFixed(0) + ' Bcf';
  const bcfSub = document.getElementById('rampKpiBcfSub');
  if (bcfSub) bcfSub.textContent = ramp.gridActive
    ? `by wells · grid covers ${ramp.gridBcf.toFixed(0)} Bcf`
    : 'Bcf cumulative';

  const capexEl = document.getElementById('rampKpiCapex');
  if (capexEl) capexEl.textContent = fmt.money0(ramp.totalDnc * 1e6);
}

function renderRampDeclineChart(ramp) {
  const labels = ramp.declineTable.map((_, i) => 'Y' + (i + 1));
  makeOrUpdate('rampDeclineChart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'MMcf/d (year avg)',
        data: ramp.declineTable,
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
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.parsed.y.toFixed(2) + ' MMcf/d' } },
      },
      scales: {
        y: { ticks: { callback: v => v + ' MMcf/d' }, grid: { color: '#eee' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderRampStackChart(ramp) {
  const horizon = rampState.horizon;
  const labels = ramp.rampRows.map(r => 'Y' + r.year);
  const buckets = rampVintageBuckets(horizon);

  // For each bucket, build a year-by-year contribution series (MMcf/d)
  const datasets = buckets.map(b => {
    const data = ramp.rampRows.map(r => {
      let v = 0;
      for (const c of r.perCohortContrib) {
        if (c.startYear >= b.range[0] && c.startYear <= b.range[1]) v += c.contrib;
      }
      return v;
    });
    return {
      label: `Wells drilled · ${b.label}`,
      data,
      backgroundColor: b.color,
      borderColor: '#fff',
      borderWidth: 1,
      stack: 'gas',
    };
  });

  // Grid-supply band — stacked on top of the well cohorts, filling the gap up to
  // the full plant burn. Shrinks as wells take over / the grid window closes.
  if (ramp.gridActive) {
    datasets.push({
      label: 'Grid supply (gas-equiv)',
      data: ramp.rampRows.map(r => r.gridGas),
      backgroundColor: COLORS.grid,
      borderColor: '#fff',
      borderWidth: 1,
      stack: 'gas',
    });
  }

  // Plateau line — the full plant gas appetite (flat). Wells + grid fill up to it.
  datasets.push({
    type: 'line',
    label: 'Full plant gas burn',
    data: ramp.rampRows.map(r => r.fullBurn),
    borderColor: COLORS.iron,
    borderDash: [6, 4],
    borderWidth: 2,
    pointRadius: 0,
    fill: false,
  });

  makeOrUpdate('rampStackChart', {
    type: 'bar',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10, font: { size: 10 } } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y.toFixed(1) + ' MMcf/d' } },
      },
      scales: {
        y: {
          stacked: true,
          ticks: { callback: v => v + ' MMcf/d' },
          grid: { color: '#eee' },
        },
        x: { stacked: true, grid: { display: false } },
      },
    },
  });
}

function renderRampTable(ramp) {
  const tbl = document.getElementById('rampTable');
  if (!tbl) return;
  const rows = ramp.rampRows;
  const grid = ramp.gridActive;
  const fmt1 = v => v.toFixed(1);
  let html = '';
  html += '<thead><tr>';
  html += '<th>Year</th>';
  if (grid) html += '<th class="num grid-col">Grid supply<br><span class="sub">MW</span></th>';
  html += '<th class="num">New wells</th>';
  html += '<th class="num">Cumulative wells</th>';
  html += '<th class="num">From existing fleet<br><span class="sub">MMcf/d</span></th>';
  html += '<th class="num">From new cohort<br><span class="sub">MMcf/d</span></th>';
  html += '<th class="num">Total deliverable<br><span class="sub">MMcf/d</span></th>';
  html += `<th class="num">${grid ? 'Well target' : 'Plateau target'}<br><span class="sub">MMcf/d</span></th>`;
  html += '<th class="num">Drilling capex<br><span class="sub">$M</span></th>';
  html += '</tr></thead>';
  html += '<tbody>';
  for (const r of rows) {
    const fromNew = r.newWells * ramp.yearOneAvg;
    const drillCapex = r.newWells * rampState.dnc;
    html += '<tr>';
    html += `<td class="rowhead">Y${r.year}</td>`;
    if (grid) html += `<td class="num grid-col">${r.gridMW > 0 ? Math.round(r.gridMW) : '—'}</td>`;
    html += `<td class="num">${r.newWells}</td>`;
    html += `<td class="num">${r.cumulative}</td>`;
    html += `<td class="num">${fmt1(r.fromExisting)}</td>`;
    html += `<td class="num">${fmt1(fromNew)}</td>`;
    html += `<td class="num bold">${fmt1(r.totalDeliverable)}</td>`;
    html += `<td class="num sub">${fmt1(r.target)}</td>`;
    html += `<td class="num">${drillCapex.toFixed(1)}</td>`;
    html += '</tr>';
  }
  // Totals row
  const totalNew = rows.reduce((s, r) => s + r.newWells, 0);
  const totalCapex = totalNew * rampState.dnc;
  html += '<tr class="total"><td class="rowhead">Total</td>';
  if (grid) html += `<td class="num grid-col">${ramp.gridBcf.toFixed(0)} Bcf</td>`;
  html += `<td class="num">${totalNew}</td>`;
  html += `<td class="num">${rows[rows.length - 1]?.cumulative ?? 0}</td>`;
  html += '<td class="num">—</td>';
  html += '<td class="num">—</td>';
  html += `<td class="num">${ramp.totalBcf.toFixed(0)} Bcf life</td>`;
  html += '<td class="num">—</td>';
  html += `<td class="num bold">${totalCapex.toFixed(0)}</td>`;
  html += '</tr>';
  html += '</tbody>';
  tbl.innerHTML = html;
}

// Reflect the grid-blend toggle/select into the UI and show or hide the
// grid input row to match rampState.gridEnabled.
function applyGridUiState() {
  const chk = document.getElementById('rampGridEnable');
  if (chk) chk.checked = !!rampState.gridEnabled;
  const sel = document.getElementById('rampGridProfile');
  if (sel) sel.value = rampState.gridProfile;
  const panel = document.getElementById('rampGridInputs');
  if (panel) panel.hidden = !rampState.gridEnabled;
}

function syncRampInputs() {
  document.querySelectorAll('input[data-ramp]').forEach(el => {
    const k = el.dataset.ramp;
    if (k in rampState) el.value = rampState[k];
  });
  applyGridUiState();
}

function bindRampInputs() {
  document.querySelectorAll('input[data-ramp]').forEach(el => {
    const k = el.dataset.ramp;
    el.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) {
        rampState[k] = v;
        document.querySelectorAll(`input[data-ramp="${k}"]`).forEach(other => {
          if (other !== e.target) other.value = v;
        });
        renderPowerRamp();
      }
    });
  });

  // Grid-blend toggle
  const chk = document.getElementById('rampGridEnable');
  if (chk) chk.addEventListener('change', e => {
    rampState.gridEnabled = e.target.checked;
    applyGridUiState();
    renderPowerRamp();
  });

  // Grid profile (flat / taper)
  const sel = document.getElementById('rampGridProfile');
  if (sel) sel.addEventListener('change', e => {
    rampState.gridProfile = e.target.value;
    renderPowerRamp();
  });
}

// ===== Dashboard sub-view toggle =====
function applyScenarioPickerDisabled(view) {
  // Scenario Analysis aggregates all four scenarios, so picking one is moot.
  const disabled = view === 'analysis';
  document.querySelectorAll('.bar-with-label--scenario').forEach(el =>
    el.classList.toggle('is-disabled', disabled));
  document.querySelectorAll('.scenario-btn').forEach(b => { b.disabled = disabled; });
  document.querySelectorAll('.scenario-select').forEach(s => {
    s.disabled = disabled;
    s.value = disabled ? 'all' : state.scenario;
  });
}

function bindDashboardViews() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view-select').forEach(sel => {
        if (sel.value !== v) sel.value = v;
      });
      document.querySelectorAll('.dash-view').forEach(el => {
        el.hidden = el.dataset.view !== v;
      });
      applyScenarioPickerDisabled(v);
      // Charts need a fresh sizing pass when their container becomes visible
      if (v === 'charts') Object.values(charts).forEach(c => c.resize?.());
    });
  });
  document.querySelectorAll('.view-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const target = document.querySelector(`.view-btn[data-view="${sel.value}"]`);
      if (target) target.click();
    });
  });
  // Initial pass: default view is "pnl", which is a per-scenario view, so the
  // scenario picker starts enabled. (Path Analysis is the only view that
  // forces the picker disabled, since it shows all four paths simultaneously.)
  const initial = document.querySelector('.view-btn.active')?.dataset.view || 'pnl';
  applyScenarioPickerDisabled(initial);
}

// ===== P&L Forecast table (years across top, metrics down) =====
// Structure (top to bottom):
//   Total Revenue            ← bold parent, click to collapse/expand sub-streams
//     Crude Oil              ← sub-row (only if not Land Sale)
//     Natural Gas (pipeline)
//     NGLs
//     Power Sold to Grid     ← scenario C only
//     Hyperscaler Lease      ← scenario D only
//   Cost of Sales
//   Gross Profit             ← subtotal, divider above, bold
//   Operating Expenses
//   Income Tax
//   Net Income               ← subtotal, divider above, bold (levered: deducts interest, smaller tax)
//   ┄ Add-backs to EBITDA ┄
//     + Interest Expense
//     + Depreciation & Amortization
//     + Income Tax
//   EBITDA                   ← final total (bold, derrick row, reconciles cleanly)
const uiState = { pnlRevExpanded: true };

function renderPnlTable(model) {
  const fmtM = v => (v / 1e6).toFixed(1);
  const rows = model.rows;
  const sched = model.financing.debtSchedule;
  const taxRate = (state.tax || 0) / 100;
  const sign = v => v < 0 ? 'neg' : '';
  const signed = v => v < 0 ? 'neg' : 'pos';

  const scenario = state.scenario;
  const isLandSale = scenario === 'A';
  const showPower = scenario === 'C';   // wholesale to PJM
  const showLease = scenario === 'D';   // hyperscaler lease

  // Build per-period bridge that reconciles to model.ebitda (now G&A-inclusive).
  // EBITDA = Revenue − COGS − OpEx; OpEx = G&A + dcOpex (both are cash).
  // Bridge from NI: NI + Tax + Interest + D&A = EBITDA (G&A is already in OpEx, no add-back).
  const periods = rows.map((r, i) => {
    const interest = sched[i]?.interestPaid || 0;
    const cogs = r.fieldOpCost + r.plantOM;
    const grossProfit = r.totalRev - cogs;
    const opex = r.ga + r.dcOpex;
    const ebit = grossProfit - opex - r.dda;       // operating income after D&A
    const pretax = ebit - interest;
    const cashTax = Math.max(0, pretax) * taxRate; // levered cash tax (interest is deductible)
    const netIncome = pretax - cashTax;
    return {
      year: r.year,
      oilRev: r.oilRev, gasRev: r.gasMarketRev, nglRev: r.nglRev, powerRev: r.powerRev,
      totalRev: r.totalRev,
      cogs, grossProfit, opex, dda: r.dda, interest, cashTax, netIncome,
      ebitda: r.ebitda,                            // model.ebitda — same as Distributions
    };
  });

  const expanded = uiState.pnlRevExpanded;
  const subHidden = expanded ? '' : ' style="display:none"';
  const chevron = expanded ? '▼' : '▶';

  const html = [];
  html.push('<thead><tr><th class="rowhead">Metric</th>');
  periods.forEach(p => html.push(`<th class="num">Y${p.year}</th>`));
  html.push('<th class="num total-col">Total</th></tr></thead><tbody>');

  // Helper: render one metric row across all year columns + Total
  const row = (label, getCell, opts = {}) => {
    const { rowClass = '', cellMod = '', cls = () => '', extraAttr = '' } = opts;
    let total = 0;
    let s = `<tr${rowClass ? ` class="${rowClass}"` : ''}${extraAttr}>` +
      `<td class="rowhead${cellMod.includes('bold') ? ' bold' : ''}${cellMod.includes('sub') ? ' sub' : ''}">${label}</td>`;
    periods.forEach(p => {
      const v = getCell(p);
      total += v;
      s += `<td class="num ${cls(v)}${cellMod.includes('bold') ? ' bold' : ''}${cellMod.includes('sub') ? ' sub' : ''}">${fmtM(v)}</td>`;
    });
    s += `<td class="num ${cls(total)}${cellMod.includes('bold') ? ' bold' : ''}${cellMod.includes('sub') ? ' sub' : ''} total-col">${fmtM(total)}</td></tr>`;
    return s;
  };

  // Total Revenue (bold parent — click chevron to collapse sub-streams)
  html.push(row(
    `<button class="pnl-toggle" data-toggle="rev" type="button">${chevron}</button> Total Revenue`,
    p => p.totalRev,
    { rowClass: 'pnl-parent', cellMod: 'bold' }
  ));

  // Sub-streams (skip for Land Sale — single sale event, no breakdown)
  if (!isLandSale) {
    html.push(row('Crude Oil', p => p.oilRev,
      { rowClass: 'pnl-rev-sub', cellMod: 'sub', extraAttr: subHidden }));
    html.push(row('Natural Gas (pipeline)', p => p.gasRev,
      { rowClass: 'pnl-rev-sub', cellMod: 'sub', extraAttr: subHidden }));
    html.push(row('NGLs', p => p.nglRev,
      { rowClass: 'pnl-rev-sub', cellMod: 'sub', extraAttr: subHidden }));
    if (showPower) {
      html.push(row('Power Sold to Grid', p => p.powerRev,
        { rowClass: 'pnl-rev-sub', cellMod: 'sub', extraAttr: subHidden }));
    }
    if (showLease) {
      html.push(row('Hyperscaler Lease', p => p.powerRev,
        { rowClass: 'pnl-rev-sub', cellMod: 'sub', extraAttr: subHidden }));
    }
  }

  // Cost of Sales → Gross Profit → OpEx → Tax → Net Income
  html.push(row('Cost of Sales', p => p.cogs));
  html.push(row('Gross Profit', p => p.grossProfit,
    { rowClass: 'pnl-subtotal divider', cellMod: 'bold', cls: sign }));
  html.push(row('Operating Expenses', p => p.opex));
  html.push(row('Income Tax', p => p.cashTax));
  html.push(row('Net Income', p => p.netIncome,
    { rowClass: 'pnl-subtotal divider', cellMod: 'bold', cls: signed }));

  // Add-backs section header (full-width separator)
  html.push(`<tr class="pnl-section-header"><td class="rowhead" colspan="${periods.length + 2}">Add-backs to EBITDA</td></tr>`);
  html.push(row('+ Interest Expense', p => p.interest, { rowClass: 'pnl-addback', cellMod: 'sub' }));
  html.push(row('+ Depreciation & Amortization', p => p.dda, { rowClass: 'pnl-addback', cellMod: 'sub' }));
  html.push(row('+ Income Tax', p => p.cashTax, { rowClass: 'pnl-addback', cellMod: 'sub' }));

  // EBITDA (final total — derrick-bordered)
  html.push(row('EBITDA', p => p.ebitda,
    { rowClass: 'total', cellMod: 'bold', cls: sign }));

  html.push('</tbody>');
  document.getElementById('pnlTable').innerHTML = html.join('');
  const yEl = document.getElementById('pnlYears');
  if (yEl) yEl.textContent = state.years;
}

// Toggle revenue sub-streams. Persists state across re-renders via uiState.
function bindPnlToggle() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pnl-toggle');
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.toggle === 'rev') {
      uiState.pnlRevExpanded = !uiState.pnlRevExpanded;
      render();
    }
  });
}

// ===== Annual Distribution Waterfall table (years across top, metrics down) =====
// Bridge: EBITDA − CapEx + Debt Drawn − Interest − Principal − Cash Tax = Cash to Equity
// Then the three-tier waterfall:
//   T1 Return of Capital → T2 8% Pref → T3 Residual (advisor promote / equity)
function renderDistribTable(model) {
  const fmtM = v => (v / 1e6).toFixed(1);
  const f = model.financing;
  const taxRate = (state.tax || 0) / 100;
  // For Land Sale (no equity at risk), the waterfall uses 0% pref and 0% promote
  // so the advisor isn't double-charged on top of the success fee.
  const promotePct = model.isLandSale ? 0 : (state.promotePct || 0);
  const equityPct = 100 - promotePct;
  const prefPct = model.isLandSale ? 0 : (state.promotePref || 0);
  const sign = v => v < 0 ? 'neg' : '';
  const signed = v => v < 0 ? 'neg' : 'pos';
  const tier = f.tierSchedule || [];

  // Pre-compute per-year derived series
  const series = model.rows.map((r, i) => {
    const sched = f.debtSchedule[i] || { interestPaid: 0, principalPaid: 0 };
    const t = tier[i] || {
      beginUC: 0, distT1: 0, endUC: 0,
      beginPB: 0, prefAccrued: 0, distT2: 0, endPB: 0,
      residual: 0, advisorPromote: 0, equityResidual: 0,
    };
    const debtDrawn = i === 0 ? f.debtAmount : 0;
    const cashTax = r.taxes - sched.interestPaid * taxRate;
    const cfe = f.leveredCF[i + 1] ?? 0;
    return {
      year: r.year,
      ebitda: r.ebitda, capex: r.capex, debtDrawn,
      interest: sched.interestPaid, principal: sched.principalPaid,
      cashTax, cfe,
      beginUC: t.beginUC, distT1: t.distT1, endUC: t.endUC,
      beginPB: t.beginPB, prefAccrued: t.prefAccrued, distT2: t.distT2, endPB: t.endPB,
      residual: t.residual, advisorPromote: t.advisorPromote, equityResidual: t.equityResidual,
    };
  });

  const metrics = [
    { label: 'EBITDA',           get: s => s.ebitda,    cls: sign,   bold: true },
    { label: '− CapEx',          get: s => s.capex },
    { label: '+ Debt Drawn',     get: s => s.debtDrawn },
    { label: '− Interest',       get: s => s.interest },
    { label: '− Principal',      get: s => s.principal },
    { label: '− Cash Tax',       get: s => s.cashTax },
    { label: '= Cash to Equity', get: s => s.cfe, cls: signed, bold: true, divider: true },

    { section: 'Tier 1 — Return of Capital (to equity holders)' },
    { label: 'Beginning unreturned capital', get: s => s.beginUC },
    { label: 'Distribution (Tier 1)',        get: s => s.distT1, cls: () => 'pos' },
    { label: 'Ending unreturned capital',    get: s => s.endUC },

    { section: `Tier 2 — ${prefPct}% Pref on unreturned capital` },
    { label: 'Beginning pref balance',       get: s => s.beginPB },
    { label: 'Pref accrued this year',       get: s => s.prefAccrued },
    { label: 'Distribution (Tier 2)',        get: s => s.distT2, cls: () => 'pos' },
    { label: 'Ending pref balance',          get: s => s.endPB },

    { section: `Tier 3 — Residual: Advisor promote ${promotePct}% / Equity ${equityPct}%` },
    { label: 'Residual pool (after Tiers 1+2)', get: s => s.residual },
    { label: `Advisor promote (${promotePct}%)`, get: s => s.advisorPromote, cls: v => v > 0 ? 'neg' : '' },
    { label: `Equity (${equityPct}%)`,           get: s => s.equityResidual, cls: () => 'pos', bold: true },
  ];

  let html = '<thead><tr><th class="rowhead">Metric</th>';
  series.forEach(s => { html += `<th class="num">Y${s.year}</th>`; });
  html += '<th class="num total-col">Total</th></tr></thead><tbody>';

  metrics.forEach(m => {
    if (m.section) {
      html += `<tr class="tier-section"><td colspan="${series.length + 2}">${m.section}</td></tr>`;
      return;
    }
    let total = 0;
    const cls = m.cls || (() => '');
    const cellClass = v => `num ${cls(v)}${m.bold ? ' bold' : ''}`;
    const rowClass = m.divider ? ' class="divider"' : '';
    html += `<tr${rowClass}><td class="rowhead${m.bold ? ' bold' : ''}">${m.label}</td>`;
    series.forEach(s => {
      const v = m.get(s);
      total += v;
      html += `<td class="${cellClass(v)}">${fmtM(v)}</td>`;
    });
    html += `<td class="${cellClass(total)} total-col">${fmtM(total)}</td></tr>`;
  });

  // Equity IRR row at the very bottom — only fills the Total column
  const ownerIrrTxt = f.ownerIrr == null ? '—' : fmt.pct(f.ownerIrr);
  const extIrrTxt = f.externalIrr == null ? '—' : fmt.pct(f.externalIrr);
  html += `<tr class="total"><td class="rowhead bold">Equity IRR (Owner / External)</td>` +
    `<td class="num" colspan="${series.length}"></td>` +
    `<td class="num total-col bold">${ownerIrrTxt} / ${extIrrTxt}</td></tr></tbody>`;

  document.getElementById('distribTable').innerHTML = html;
}

// ===== Scenario Analysis (decision support) =====
// Runs all 4 scenarios through the model with current inputs and recommends one
// based on owner economics, gated by a positive-NPV requirement.
const SCEN_META = {
  A: { label: 'Land Sale', desc: 'Sell the asset outright; no development, no operations.' },
  B: { label: 'Wells Only', desc: 'Drill, produce, sell oil/gas/NGLs at market prices.' },
  C: { label: 'Wells + Power Plant', desc: 'Burn gas on-site; sell electricity to PJM grid.' },
  D: { label: 'Full Integration', desc: 'Wells + 150 MW CCGT + 100 MW data center on a hyperscaler lease.' },
};

function rankScenarios() {
  const results = ['A','B','C','D'].map(s => {
    const m = M.runModel(state, s);
    return {
      scenario: s,
      ...SCEN_META[s],
      npv: m.npv,
      irr: m.irr,
      payback: m.payback,
      capex: m.totals.totalCapex,
      ebitda: m.totals.totalEbitda,
      ownerEquity: m.financing.ownerEquity,
      ownerNpv: m.financing.ownerNpv,
      ownerIrr: m.financing.ownerIrr,
      ownerMoic: m.financing.ownerMoic,
      ownerPayback: m.financing.ownerPayback,
      advisorTotal: m.advisor.total,
      isLandSale: !!m.isLandSale,
    };
  });
  // Recommendation: highest Owner NPV (works for Land Sale and operating scenarios alike).
  // Tiebreaker: higher Owner Equity IRR; then shorter Owner Payback.
  const viable = results.filter(r => (r.ownerNpv || 0) > 0);
  let recommended = null;
  if (viable.length === 1) recommended = viable[0];
  else if (viable.length > 1) {
    recommended = viable.slice().sort((a, b) => {
      const npvDiff = (b.ownerNpv || 0) - (a.ownerNpv || 0);
      if (Math.abs(npvDiff) > 1) return npvDiff;
      return (b.ownerIrr || 0) - (a.ownerIrr || 0);
    })[0];
  }
  return { results, recommended };
}

function renderScenarioAnalysis() {
  const { results, recommended } = rankScenarios();
  renderRecBanner(results, recommended);
  renderScoreTable(results, recommended);
  renderDecisionGrid(results, recommended);
}

function renderRecBanner(results, rec) {
  const el = document.getElementById('recBanner');
  if (!el) return;
  if (!rec) {
    el.className = 'rec-banner none';
    el.innerHTML = `
      <div class="rec-tag">No clear winner</div>
      <div class="rec-headline">No path clears a positive Owner NPV at current inputs.</div>
      <div class="rec-why">Even Land Sale comes up short — try raising the land sale price, WTI, or lease rate, or lower WACC.</div>
    `;
    return;
  }
  const ownerIrrPct = (v) => v == null ? '—' : (v * 100).toFixed(1) + '%';
  const moneyM = (v) => v == null ? '—' : '$' + (v / 1e6).toFixed(1) + 'M';
  const others = results.filter(r => r.scenario !== rec.scenario && (r.ownerNpv || 0) > 0);
  let why;
  if (others.length === 0) {
    why = `Only Path ${rec.scenario} produces a positive Owner NPV (${moneyM(rec.ownerNpv)}) at the current price deck.`;
  } else {
    const next = others.slice().sort((a, b) => (b.ownerNpv || 0) - (a.ownerNpv || 0))[0];
    const npvSpread = (rec.ownerNpv || 0) - (next.ownerNpv || 0);
    why = `Path ${rec.scenario} maximizes Owner NPV (${moneyM(rec.ownerNpv)}) — ` +
          `${moneyM(npvSpread)} above Path ${next.scenario} (${moneyM(next.ownerNpv)}). ` +
          (rec.isLandSale
            ? `Operating returns don't beat what you'd clear by selling outright at the current price.`
            : `Owner check-write: ${moneyM(rec.ownerEquity)}; Owner IRR ${ownerIrrPct(rec.ownerIrr)}.`);
  }
  el.className = 'rec-banner';
  el.innerHTML = `
    <div class="rec-tag">Recommended</div>
    <div class="rec-headline">Path ${rec.scenario} · ${rec.label}</div>
    <div class="rec-desc">${rec.desc}</div>
    <div class="rec-why">${why}</div>
    <div class="rec-stats">
      <div class="rec-stat"><span class="rec-stat-label">Owner NPV</span><span class="rec-stat-value">${moneyM(rec.ownerNpv)}</span></div>
      <div class="rec-stat"><span class="rec-stat-label">Owner IRR</span><span class="rec-stat-value">${rec.isLandSale ? 'N/A' : ownerIrrPct(rec.ownerIrr)}</span></div>
      <div class="rec-stat"><span class="rec-stat-label">Owner Cash Multiple</span><span class="rec-stat-value">${rec.ownerMoic == null ? '—' : rec.ownerMoic.toFixed(2) + 'x'}</span></div>
      <div class="rec-stat"><span class="rec-stat-label">Owner Payback</span><span class="rec-stat-value">${fmt.yrs(rec.ownerPayback)}</span></div>
    </div>
  `;
}

function renderScoreTable(results, rec) {
  // Metric rows. `direction: 'high'` = bigger is better; 'low' = smaller is better.
  const metrics = [
    { key: 'capex',         label: 'Total CapEx',          direction: 'low',  fmt: v => fmt.money0(v) },
    { key: 'ownerEquity',   label: 'Owner Check-Write',    direction: 'low',  fmt: v => fmt.money0(v) },
    { key: 'ownerNpv',      label: 'Owner NPV',            direction: 'high', fmt: v => fmt.money0(v) },
    { key: 'npv',           label: 'Project NPV',          direction: 'high', fmt: v => fmt.money0(v) },
    { key: 'irr',           label: 'Project IRR',          direction: 'high', fmt: v => v == null ? '—' : fmt.pct(v) },
    { key: 'payback',       label: 'Project Payback',      direction: 'low',  fmt: v => fmt.yrs(v) },
    { key: 'ownerIrr',      label: 'Owner Equity IRR',     direction: 'high', fmt: v => v == null ? '—' : fmt.pct(v) },
    { key: 'ownerMoic',     label: 'Owner Cash Multiple',  direction: 'high', fmt: v => v == null ? '—' : v.toFixed(2) + 'x' },
    { key: 'ownerPayback',  label: 'Owner Payback',        direction: 'low',  fmt: v => fmt.yrs(v) },
    { key: 'ebitda',        label: `${state.years}-Yr EBITDA`, direction: 'high', fmt: v => fmt.money0(v) },
    { key: 'advisorTotal',  label: 'Total Advisor Fees',   direction: 'low',  fmt: v => fmt.money0(v) },
  ];
  const headers = ['Metric', ...results.map(r => `${r.scenario} · ${r.label}`)];
  let html = '<thead><tr>' + headers.map((h, i) => {
    const isRec = i > 0 && rec && results[i - 1].scenario === rec.scenario;
    return `<th class="${i === 0 ? '' : 'num'}${isRec ? ' rec-col' : ''}">${h}</th>`;
  }).join('') + '</tr></thead><tbody>';
  metrics.forEach(m => {
    const vals = results.map(r => r[m.key]);
    // Pick "leader" — best valid value in the desired direction, ignoring nulls
    const valid = vals.map((v, i) => ({ v, i })).filter(x => x.v != null && Number.isFinite(x.v));
    let leaderIdx = -1;
    if (valid.length) {
      const sorted = valid.slice().sort((a, b) => m.direction === 'high' ? b.v - a.v : a.v - b.v);
      leaderIdx = sorted[0].i;
    }
    html += `<tr><td>${m.label}</td>` + vals.map((v, i) => {
      const isLeader = i === leaderIdx;
      const isRec = rec && results[i].scenario === rec.scenario;
      return `<td class="num${isLeader ? ' leader' : ''}${isRec ? ' rec-col' : ''}">${m.fmt(v)}</td>`;
    }).join('') + '</tr>';
  });
  html += '</tbody>';
  document.getElementById('scenarioScoreTable').innerHTML = html;
}

function renderDecisionGrid(results) {
  // Quick-read framing cards covering land sale vs. each operating tier.
  const [a, b, c, d] = results; // A=Land Sale, B=Wells Only, C=Wells+Plant, D=Full Integration
  const moneyM = v => '$' + (v / 1e6).toFixed(0) + 'M';
  const cards = [
    {
      title: 'Sell or develop',
      body: `Path A clears ${moneyM(a.ownerNpv)} for the owner at the current land sale price (${moneyM(a.npv)} NPV after tax + advisor fee). Drilling wells only (B) puts ${moneyM(b.ownerNpv)} of Owner NPV on the table for a ${moneyM(b.ownerEquity)} check-write — develop only if you believe in that spread holding up.`,
    },
    {
      title: 'Capital intensity',
      body: `Land Sale needs zero capital. Wells Only requires ${moneyM(b.capex)} of CapEx (~half debt). Full Integration takes total CapEx to ${moneyM(d.capex)} — roughly ${(d.capex / Math.max(b.capex, 1)).toFixed(1)}× the wells-only path. The owner check-write swings ${moneyM(a.ownerEquity)} → ${moneyM(d.ownerEquity)} across the four paths.`,
    },
    {
      title: 'Time to cash',
      body: `Land Sale is immediate — proceeds in Y1. Wells Only starts producing in Y1 with payback ${fmt.yrs(b.payback)}. Paths C and D add a 36–60 month build before lease revenue clears; paybacks ${fmt.yrs(c.payback)} and ${fmt.yrs(d.payback)} respectively.`,
    },
    {
      title: 'Operational complexity',
      body: `A is one transaction and you're done. B is a pure E&P operation — known playbook, rigs, midstream gas takeaway. C layers in CCGT operations and a PJM interconnect. D adds a behind-the-meter data center and long-dated lease to a single hyperscaler — concentrated counterparty risk in exchange for the 4× pricing premium on methane.`,
    },
  ];
  document.getElementById('decisionGrid').innerHTML = cards.map(c => `
    <div class="decision-card">
      <div class="decision-title">${c.title}</div>
      <div class="decision-body">${c.body}</div>
    </div>
  `).join('');
}

// ===== Project Overview tab — Ohio map (decorative) =====
// Renders an actual outline of Ohio (all 88 counties from ohio_counties.geojson),
// shades the 18 Utica producing counties listed in window.OhioCounties.COUNTIES,
// highlights Tuscarawas County (the project's county), and drops a pin at its centroid.
// Runs once on boot — the map is static.
function renderOverviewMap() {
  const svg = document.querySelector('.ov-hero-map');
  if (!svg || svg.dataset.rendered === '1') return;
  fetch('ohio_counties.geojson')
    .then(r => r.json())
    .then(geo => {
      const PRODUCING = new Set((window.OhioCounties?.COUNTIES || []).map(c => c.name));

      // Compute lng/lat bounding box across all county polygons
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      const eachRing = (f, fn) => {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        polys.forEach(poly => poly.forEach(ring => fn(ring)));
      };
      geo.features.forEach(f => eachRing(f, ring => {
        ring.forEach(([x, y]) => {
          if (x < minLng) minLng = x;
          if (x > maxLng) maxLng = x;
          if (y < minLat) minLat = y;
          if (y > maxLat) maxLat = y;
        });
      }));

      // Project lng/lat → SVG x/y inside a 220×220 viewBox with padding.
      // Equirectangular projection — fine for a single state at this scale.
      const VB = 220, PAD = 14;
      const w = maxLng - minLng;
      const h = maxLat - minLat;
      const scale = Math.min((VB - 2 * PAD) / w, (VB - 2 * PAD) / h);
      const offX = (VB - w * scale) / 2;
      const offY = (VB - h * scale) / 2;
      const project = (lng, lat) => [
        (offX + (lng - minLng) * scale).toFixed(2),
        (offY + (maxLat - lat) * scale).toFixed(2),  // flip Y (lat is north-up)
      ];

      const featureToPath = f => {
        let d = '';
        eachRing(f, ring => {
          ring.forEach(([lng, lat], i) => {
            const [x, y] = project(lng, lat);
            d += (i === 0 ? 'M' : 'L') + x + ',' + y;
          });
          d += 'Z';
        });
        return d;
      };

      // Bucket features
      const otherFeats = [], producingFeats = [];
      let tuscarawas = null;
      geo.features.forEach(f => {
        const name = f.properties.name;
        if (name === 'Tuscarawas') tuscarawas = f;
        else if (PRODUCING.has(name)) producingFeats.push(f);
        else otherFeats.push(f);
      });

      const NS = 'http://www.w3.org/2000/svg';
      const create = (tag, attrs, parent) => {
        const el = document.createElementNS(NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        parent.appendChild(el);
        return el;
      };

      svg.innerHTML = '';

      // 1) Non-producing counties — faint base outlines (the rest of Ohio)
      const otherG = create('g', { class: 'ohm-other' }, svg);
      otherFeats.forEach(f => create('path', { d: featureToPath(f) }, otherG));

      // 2) Producing fairway — Utica producing counties shaded
      const fairG = create('g', { class: 'ohm-fairway' }, svg);
      producingFeats.forEach(f => create('path', { d: featureToPath(f) }, fairG));

      // 3) Tuscarawas — project county, drawn last so its border sits on top
      if (tuscarawas) {
        create('path', { d: featureToPath(tuscarawas), class: 'ohm-project' }, svg);
        const T = window.OhioCounties?.COUNTIES?.find(c => c.name === 'Tuscarawas');
        if (T) {
          const [px, py] = project(T.lng, T.lat);
          create('circle', { class: 'ohm-pin-halo', cx: px, cy: py, r: 11 }, svg);
          create('circle', { class: 'ohm-pin-ring', cx: px, cy: py, r: 6.5 }, svg);
          create('circle', { class: 'ohm-pin-dot',  cx: px, cy: py, r: 3 }, svg);
          const label = create('text', {
            class: 'ohm-label',
            x: px,
            y: (parseFloat(py) + 22).toFixed(2),
          }, svg);
          label.textContent = 'PROJECT SITE';
        }
      }

      svg.dataset.rendered = '1';
    })
    .catch(err => console.warn('Overview map: geojson load failed', err));
}

function renderRealizedChips() {
  const r = M.realizedPrices(state);
  const oilEl = document.getElementById('oilRealized');
  if (oilEl) oilEl.textContent = '$' + r.oil.toFixed(2) + '/bbl';
  const gasEl = document.getElementById('gasRealized');
  if (gasEl) gasEl.textContent = '$' + r.gas.toFixed(2) + '/bbl';
  const nglEl = document.getElementById('nglRealized');
  if (nglEl) nglEl.textContent = '$' + r.ngl.toFixed(2) + '/bbl';
  // Financing derived chips
  const eqEl = document.getElementById('equityPctDerived');
  if (eqEl) eqEl.textContent = (100 - state.debtPct).toFixed(0) + '%';
  const extEl = document.getElementById('externalEquityPctDerived');
  if (extEl) extEl.textContent = (100 - state.ownerEquityPct).toFixed(0) + '%';
  // Advisor retainer derived total
  const retEl = document.getElementById('siteRetainerDerived');
  if (retEl) retEl.textContent = fmt.money0((state.siteAdvisoryMonthly || 0) * 1e6 * (state.siteAdvisoryMonths || 0));
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
  wellsLayer: null,
  wellsLoading: false,
  wellsData: null,
  wellsYearBounds: null, // [minYear, maxYear] across loaded data
  // Threshold filters that drive both the pins and the detail table. Empty /
  // null fields mean "no constraint". County is stored uppercase to match the
  // raw names in wells.json.
  filters: {
    county: '', operator: '',
    yearMin: null, yearMax: null,
    gasMin: null, gasMax: null,   // MMcf/d
    oilMin: null, oilMax: null,   // bbl/d
    includeUnknownYear: true,
  },
  filteredItems: [],     // projected wells passing the current filters (cache for sort)
  filtersBound: false,
  // Sort for the wells detail table. Default to highest gas rate first —
  // the gas-richest wells surface at the top for the behind-the-meter thesis.
  wellsTableSort: { col: 'gasPerDayMMcf', dir: 'desc' },
  wellsTableBound: false, // header click handler attached only once
};

// Single fill color for every pin. All wells in this dataset are 2025
// horizontal-well producers, so there's nothing meaningful to differentiate
// by color — we let cluster size do that work.
const WELL_PIN_COLOR = '#8B1A1A';

// metric configuration
const MAP_METRICS = {
  gasMcfe:     { label: '2025 gas-equivalent production (Mcfe)', short: 'Production',  fmt: v => fmtBcfe(v) },
  oilBbl:      { label: '2025 oil production (bbl)',             short: 'Oil',          fmt: v => fmt.num(v) + ' bbl' },
  prodWells:   { label: '2025 producing wells',                  short: 'Wells',        fmt: v => fmt.num(v) + ' wells' },
};

function fmtBcfe(mcfe) {
  // Mcfe → Bcfe (1 Bcfe = 1,000,000 Mcfe)
  if (mcfe >= 1_000_000) return (mcfe / 1_000_000).toFixed(1) + ' Bcfe';
  if (mcfe >= 1_000) return (mcfe / 1_000).toFixed(1) + ' MMcfe';
  return fmt.num(mcfe) + ' Mcfe';
}

// Color ramp for choropleth: light blush → mid clay → dark derrick.
// Counties with no data (zero metric) get a very faint grey-pink so they're
// still visible as polygons but clearly distinct from the producing region.
function colorForMetric(value, maxValue) {
  if (maxValue <= 0 || value <= 0) return '#f5ecec';
  const t = Math.sqrt(value / maxValue); // sqrt ramp spreads mid-tier nicely
  // Three-stop gradient: blush #F6E1E1 → clay #D46A6A → derrick #8B1A1A
  const blush = [246, 225, 225];
  const clay = [212, 106, 106];
  const derrick = [139, 26, 26];
  let r, g, b;
  if (t < 0.5) {
    const k = t / 0.5;
    r = Math.round(blush[0] + (clay[0] - blush[0]) * k);
    g = Math.round(blush[1] + (clay[1] - blush[1]) * k);
    b = Math.round(blush[2] + (clay[2] - blush[2]) * k);
  } else {
    const k = (t - 0.5) / 0.5;
    r = Math.round(clay[0] + (derrick[0] - clay[0]) * k);
    g = Math.round(clay[1] + (derrick[1] - clay[1]) * k);
    b = Math.round(clay[2] + (derrick[2] - clay[2]) * k);
  }
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
    maxZoom: 16,
    scrollWheelZoom: false,
  });
  // Subtle, light basemap
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(MAP_STATE.map);

  // Load Ohio county polygons (choropleth)
  fetch('ohio_counties.geojson')
    .then(r => r.json())
    .then(geo => {
      MAP_STATE.geoLayer = L.geoJSON(geo, {
        style: feat => stylePolygon(feat),
        onEachFeature: (feat, layer) => {
          const name = feat.properties.name;
          const c = C.COUNTIES.find(x => x.name === name);
          layer.on('mouseover', e => {
            e.target.setStyle({ weight: 2.5, color: '#3D3D3D', fillOpacity: 0.85 });
            const v = c ? (c[MAP_STATE.metric] || 0) : 0;
            const txt = c
              ? `<strong>${name}</strong><br>${MAP_METRICS[MAP_STATE.metric].short}: ${MAP_METRICS[MAP_STATE.metric].fmt(v)}`
              : `<strong>${name}</strong><br><em>no Utica production</em>`;
            e.target.bindTooltip(txt, { direction: 'top', sticky: true }).openTooltip();
          });
          layer.on('mouseout', e => {
            MAP_STATE.geoLayer.resetStyle(e.target);
          });
          layer.on('click', () => {
            if (c) showCountyDetail(c);
          });
        },
      }).addTo(MAP_STATE.map);
      MAP_STATE.map.fitBounds(MAP_STATE.geoLayer.getBounds(), { padding: [10, 10] });
    });

  // Bind metric toggle
  document.querySelectorAll('.map-metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-metric-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MAP_STATE.metric = btn.dataset.metric;
      MAP_STATE.metricLabel = MAP_METRICS[btn.dataset.metric].label;
      restylePolygons();
    });
  });

}

// ===== Wells layer (per-county) =====
// Wells are the 3,798 horizontal wells that filed 2025 quarterly production
// reports with ODNR, cross-referenced by API number to the ODNR all-wells
// ArcGIS layer for coordinates. Schema:
//   data.c[]  county name lookup
//   data.o[]  operator name lookup (most-recent quarter's owner)
//   data.t[]  township name lookup
//   data.r[]  rows of [lat*1e5, lon*1e5, cIdx, oIdx, tIdx, api, name, oilBbl, gasMcf, daysProd, firstProdYear]
//             firstProdYear is 0 when ODNR has no first-production date for the well.
async function ensureWellsLoaded() {
  if (MAP_STATE.wellsData || MAP_STATE.wellsLoading) return;
  if (typeof L === 'undefined' || typeof L.markerClusterGroup !== 'function') {
    console.error('Leaflet.markercluster not loaded');
    return;
  }
  MAP_STATE.wellsLoading = true;
  const loadingEl = document.getElementById('wellsLoading');
  if (loadingEl) loadingEl.hidden = false;
  try {
    const resp = await fetch('wells.json?v=2026-05-05a');
    const data = await resp.json();
    // Pre-bucket rows by county uppercase name for fast filtering on selection.
    const byCounty = {};
    const counties = data.c || [];
    for (const r of (data.r || [])) {
      const co = counties[r[2]] || '';
      if (!byCounty[co]) byCounty[co] = [];
      byCounty[co].push(r);
    }
    MAP_STATE.wellsData = { ...data, byCounty };
    // Compute first-production-year bounds across all known wells (year=0
    // means ODNR has no first-prod date for that well; excluded from bounds).
    let yMin = Infinity, yMax = -Infinity;
    for (const r of (data.r || [])) {
      const y = r[10] || 0;
      if (y > 0) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
    }
    if (yMin !== Infinity) {
      MAP_STATE.wellsYearBounds = [yMin, yMax];
    }
  } catch (e) {
    console.error('Failed to load wells:', e);
  } finally {
    MAP_STATE.wellsLoading = false;
    if (loadingEl) loadingEl.hidden = true;
  }
}

// ===== Field Map filters =====
// One global filter set drives both the pins and the detail table. Every well
// is projected once, tested against the active thresholds, then rendered.
const mapTitleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function fieldDebounce(fn, ms = 160) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function parseFilterNum(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = el.value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readFieldFilters() {
  const f = MAP_STATE.filters;
  f.county = (document.getElementById('ffCounty')?.value || '').toUpperCase();
  f.operator = document.getElementById('ffOperator')?.value || '';
  f.yearMin = parseFilterNum('ffYearMin');
  f.yearMax = parseFilterNum('ffYearMax');
  f.gasMin = parseFilterNum('ffGasMin');
  f.gasMax = parseFilterNum('ffGasMax');
  f.oilMin = parseFilterNum('ffOilMin');
  f.oilMax = parseFilterNum('ffOilMax');
  f.includeUnknownYear = document.getElementById('ffUnknownYear')?.checked ?? true;
}

// Decode one raw wells.json record into a labelled object with derived rates.
function projectWell(r, data) {
  const days = r[9] || 0, oil = r[7] || 0, gas = r[8] || 0;
  return {
    lat: r[0] / 1e5, lon: r[1] / 1e5,
    countyRaw: data.c[r[2]] || '',
    county: mapTitleCase(data.c[r[2]] || ''),
    operator: data.o[r[3]] || '',
    township: mapTitleCase(data.t[r[4]] || ''),
    api: r[5] || '',
    name: r[6] || '',
    oilBbl: oil,
    gasMcf: gas,
    gasMMcf: gas / 1000,
    days,
    firstProdYear: r[10] || 0,
    oilPerDay: days > 0 ? oil / days : 0,
    gasPerDayMMcf: days > 0 ? (gas / days) / 1000 : 0,
  };
}

function wellPasses(p, f) {
  if (f.county && p.countyRaw.toUpperCase() !== f.county) return false;
  if (f.operator && p.operator !== f.operator) return false;
  if (p.firstProdYear > 0) {
    if (f.yearMin != null && p.firstProdYear < f.yearMin) return false;
    if (f.yearMax != null && p.firstProdYear > f.yearMax) return false;
  } else if (!f.includeUnknownYear) {
    return false; // unknown first-prod year, and the user opted them out
  }
  if (f.gasMin != null && p.gasPerDayMMcf < f.gasMin) return false;
  if (f.gasMax != null && p.gasPerDayMMcf > f.gasMax) return false;
  if (f.oilMin != null && p.oilPerDay < f.oilMin) return false;
  if (f.oilMax != null && p.oilPerDay > f.oilMax) return false;
  return true;
}

function buildWellMarker(p) {
  const fmtNum = v => Number(v || 0).toLocaleString();
  const m = L.circleMarker([p.lat, p.lon], {
    radius: 6, color: '#fff', weight: 1.5, fillColor: WELL_PIN_COLOR, fillOpacity: 1,
  });
  m.bindPopup(`<div class="well-popup">
    <div class="well-popup-name">${escapeHtmlSimple(p.name) || '—'}</div>
    <div class="well-popup-row"><span>Operator</span><strong>${escapeHtmlSimple(p.operator) || '—'}</strong></div>
    <div class="well-popup-row"><span>County</span><strong>${escapeHtmlSimple(p.county)}${p.township ? ' · ' + escapeHtmlSimple(p.township) : ''}</strong></div>
    <div class="well-popup-row"><span>API</span><strong>${escapeHtmlSimple(p.api)}</strong></div>
    <div class="well-popup-row"><span>First prod.</span><strong>${p.firstProdYear ? p.firstProdYear : '—'}</strong></div>
    <div class="well-popup-section">2025 production</div>
    <div class="well-popup-row"><span>Oil</span><strong>${fmtNum(p.oilBbl)} bbl</strong></div>
    <div class="well-popup-row"><span>Gas</span><strong>${fmtNum(p.gasMcf)} Mcf</strong></div>
    <div class="well-popup-row"><span>Gas / day</span><strong>${p.gasPerDayMMcf.toLocaleString(undefined, { maximumFractionDigits: 2 })} MMcf/d</strong></div>
    <div class="well-popup-row"><span>Days</span><strong>${fmtNum(p.days)}</strong></div>
  </div>`);
  return m;
}

function renderWellPins(items) {
  if (!MAP_STATE.map) return;
  if (!MAP_STATE.wellsLayer) {
    MAP_STATE.wellsLayer = L.markerClusterGroup({
      maxClusterRadius: 40, spiderfyOnMaxZoom: true,
      showCoverageOnHover: false, zoomToBoundsOnClick: true,
    });
    MAP_STATE.map.addLayer(MAP_STATE.wellsLayer);
  } else {
    MAP_STATE.wellsLayer.clearLayers();
    if (!MAP_STATE.map.hasLayer(MAP_STATE.wellsLayer)) MAP_STATE.map.addLayer(MAP_STATE.wellsLayer);
  }
  MAP_STATE.wellsLayer.addLayers(items.map(buildWellMarker));
}

// Main entry: recompute the matching set and refresh pins, table, and count.
async function applyFieldFilters() {
  await ensureWellsLoaded();
  const data = MAP_STATE.wellsData;
  if (!data || !MAP_STATE.map) return;
  readFieldFilters();
  const f = MAP_STATE.filters;
  const all = data.r || [];
  const items = [];
  for (const r of all) {
    const p = projectWell(r, data);
    if (wellPasses(p, f)) items.push(p);
  }
  MAP_STATE.filteredItems = items;
  renderWellPins(items);
  renderWellsTable();
  updateFilterCount(items.length, all.length);
  if (!f.county) renderFilterSummary(items); // county view keeps its own detail aside
}

function updateFilterCount(matched, total) {
  const el = document.getElementById('ffCount');
  if (el) el.innerHTML = `<strong>${matched.toLocaleString()}</strong> of ${total.toLocaleString()} wells`;
}

function populateFieldFilterDropdowns() {
  const data = MAP_STATE.wellsData;
  if (!data) return;
  const cSel = document.getElementById('ffCounty');
  if (cSel && cSel.dataset.bound !== '1') {
    const counties = [...(data.c || [])]
      .map(c => ({ raw: c, disp: mapTitleCase(c) }))
      .sort((a, b) => a.disp.localeCompare(b.disp));
    cSel.innerHTML = '<option value="">All counties</option>' +
      counties.map(c => `<option value="${escapeHtmlSimple(c.raw)}">${escapeHtmlSimple(c.disp)}</option>`).join('');
    cSel.dataset.bound = '1';
  }
  const oSel = document.getElementById('ffOperator');
  if (oSel && oSel.dataset.bound !== '1') {
    const ops = [...(data.o || [])].sort((a, b) => a.localeCompare(b));
    oSel.innerHTML = '<option value="">All operators</option>' +
      ops.map(o => `<option value="${escapeHtmlSimple(o)}">${escapeHtmlSimple(o)}</option>`).join('');
    oSel.dataset.bound = '1';
  }
  const b = MAP_STATE.wellsYearBounds;
  if (b) {
    const yMin = document.getElementById('ffYearMin'), yMax = document.getElementById('ffYearMax');
    if (yMin && !yMin.placeholder) { yMin.placeholder = b[0]; yMin.min = b[0]; yMin.max = b[1]; }
    if (yMax && !yMax.placeholder) { yMax.placeholder = b[1]; yMax.min = b[0]; yMax.max = b[1]; }
  }
}

function bindFieldFilters() {
  if (MAP_STATE.filtersBound) return;
  const apply = fieldDebounce(() => applyFieldFilters(), 160);
  const onCounty = () => {
    const v = document.getElementById('ffCounty')?.value || '';
    if (v) {
      const c = window.OhioCounties.COUNTIES.find(x => x.name.toUpperCase() === v.toUpperCase());
      if (c) { showCountyDetail(c); return; } // zooms + applies the county filter
    }
    MAP_STATE.selectedCounty = null;
    restylePolygons();
    applyFieldFilters();
  };
  document.getElementById('ffCounty')?.addEventListener('change', onCounty);
  document.getElementById('ffOperator')?.addEventListener('change', () => applyFieldFilters());
  document.getElementById('ffUnknownYear')?.addEventListener('change', () => applyFieldFilters());
  ['ffYearMin', 'ffYearMax', 'ffGasMin', 'ffGasMax', 'ffOilMin', 'ffOilMax'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', apply);
  });
  document.getElementById('ffReset')?.addEventListener('click', () => {
    ['ffYearMin', 'ffYearMax', 'ffGasMin', 'ffGasMax', 'ffOilMin', 'ffOilMax'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const cc = document.getElementById('ffCounty'); if (cc) cc.value = '';
    const oo = document.getElementById('ffOperator'); if (oo) oo.value = '';
    const uk = document.getElementById('ffUnknownYear'); if (uk) uk.checked = true;
    MAP_STATE.selectedCounty = null;
    restylePolygons();
    if (MAP_STATE.map) MAP_STATE.map.flyTo([40.20, -81.30], 8, { duration: 0.6 });
    applyFieldFilters();
  });
  MAP_STATE.filtersBound = true;
}

// Aggregate snapshot shown in the right-hand aside when no single county is
// selected (i.e. a cross-county filtered view).
function renderFilterSummary(items) {
  const det = document.getElementById('mapDetail');
  if (!det) return;
  const n = items.length;
  let totGas = 0, totOil = 0, totGasPerDay = 0;
  const opWells = {};
  for (const p of items) {
    totGas += p.gasMcf; totOil += p.oilBbl; totGasPerDay += p.gasPerDayMMcf;
    opWells[p.operator] = (opWells[p.operator] || 0) + 1;
  }
  const topOps = Object.entries(opWells).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgGas = n ? totGasPerDay / n : 0;
  const opRows = topOps.map(([op, w]) => `
    <div class="map-op-row">
      <div class="map-op-name">${escapeHtmlSimple(op) || '—'}</div>
      <div class="map-op-stats"><span><strong>${w.toLocaleString()}</strong> wells</span></div>
    </div>`).join('');
  det.innerHTML = `
    <div class="map-detail-header">
      <div class="map-detail-tag">FILTERED RESULTS</div>
      <h3>${n.toLocaleString()} well${n === 1 ? '' : 's'}</h3>
      <div class="map-detail-sub">Across all producing counties matching the active filters.</div>
    </div>
    <div class="map-detail-body">
      ${n ? `<div class="map-detail-section-title">2025 production · selection</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total gas</span><span class="map-detail-stat-value">${(totGas / 1e6).toFixed(2)} Bcf</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total oil</span><span class="map-detail-stat-value">${fmt.num(Math.round(totOil))} bbl</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Avg. gas / day per well</span><span class="map-detail-stat-value">${avgGas.toLocaleString(undefined, { maximumFractionDigits: 2 })} MMcf/d</span></div>
      ${topOps.length ? `<div class="map-detail-section-title">Top operators by well count</div><div class="map-op-list">${opRows}</div>` : ''}`
      : `<div class="map-empty"><p>No wells match the current filters. Loosen a threshold or reset.</p></div>`}
    </div>`;
}

function escapeHtmlSimple(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ===== Wells detail table =====
// Renders the filtered wells (MAP_STATE.filteredItems) beneath the map.
// Sortable on every column; capped for snappy rendering on broad queries.
const WELLS_TABLE_CAP = 500;
function renderWellsTable() {
  const section = document.getElementById('wellsTableSection');
  const tbody = document.getElementById('wellsTableBody');
  const countyEl = document.getElementById('wellsTableCounty');
  const metaEl = document.getElementById('wellsTableMeta');
  if (!section || !tbody) return;

  bindWellsTableHeaders();
  section.hidden = false;

  const items = (MAP_STATE.filteredItems || []).slice();
  const { col, dir } = MAP_STATE.wellsTableSort;
  items.sort((a, b) => {
    const av = a[col], bv = b[col];
    let cmp;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
    return dir === 'asc' ? cmp : -cmp;
  });
  const shown = items.slice(0, WELLS_TABLE_CAP);

  if (countyEl) {
    countyEl.textContent = MAP_STATE.filters.county
      ? mapTitleCase(MAP_STATE.filters.county) + ' County'
      : 'All counties';
  }
  if (metaEl) {
    metaEl.textContent = items.length > WELLS_TABLE_CAP
      ? `Showing top ${WELLS_TABLE_CAP} of ${items.length.toLocaleString()} matching wells — refine filters or sort to focus`
      : `${items.length.toLocaleString()} matching well${items.length === 1 ? '' : 's'}`;
  }

  // Sort indicators
  document.querySelectorAll('#wellsTable th.sortable').forEach(th => {
    const isActive = th.dataset.sort === col;
    th.classList.toggle('sort-active', isActive);
    th.classList.toggle('sort-asc', isActive && dir === 'asc');
    th.classList.toggle('sort-desc', isActive && dir === 'desc');
    th.setAttribute('aria-sort', isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });

  const f0 = v => Math.round(v).toLocaleString();
  const f1 = v => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const f2 = v => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  tbody.innerHTML = shown.map(it => `<tr>
    <td>${escapeHtmlSimple(it.name) || '—'}</td>
    <td>${escapeHtmlSimple(it.operator) || '—'}</td>
    <td>${escapeHtmlSimple(it.county)}</td>
    <td>${escapeHtmlSimple(it.township) || '—'}</td>
    <td class="num">${it.firstProdYear || '—'}</td>
    <td class="num">${f0(it.oilPerDay)}</td>
    <td class="num">${f2(it.gasPerDayMMcf)}</td>
    <td class="num">${f1(it.gasMMcf)}</td>
    <td class="num">${f0(it.oilBbl)}</td>
  </tr>`).join('');
}

function bindWellsTableHeaders() {
  if (MAP_STATE.wellsTableBound) return;
  const headers = document.querySelectorAll('#wellsTable th.sortable');
  if (headers.length === 0) return;
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (!col) return;
      const cur = MAP_STATE.wellsTableSort;
      // Click same column → toggle direction. Click new column → use the
      // sensible default for that data type (numeric desc, text asc).
      if (cur.col === col) {
        cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
      } else {
        cur.col = col;
        cur.dir = th.classList.contains('num') ? 'desc' : 'asc';
      }
      renderWellsTable(); // re-render from the cached filtered set
    });
  });
  MAP_STATE.wellsTableBound = true;
}

function stylePolygon(feat) {
  const name = feat.properties.name;
  const C = window.OhioCounties.COUNTIES.find(x => x.name === name);
  const metric = MAP_STATE.metric;
  const allValues = window.OhioCounties.COUNTIES.map(c => c[metric] || 0);
  const maxV = Math.max(...allValues);
  const v = C ? (C[metric] || 0) : 0;
  // When one county is selected, grey out the others
  const sel = MAP_STATE.selectedCounty;
  if (sel && name !== sel) {
    return {
      fillColor: '#d8d8d8',
      weight: 0.8,
      color: '#999',
      opacity: 0.5,
      fillOpacity: 0.45,
    };
  }
  if (sel && name === sel) {
    // Clear fill so the basemap (and well pins) read through; strong red border
    // marks the selected county.
    return {
      fillColor: '#ffffff',
      weight: 3,
      color: '#8B1A1A',
      opacity: 1,
      fillOpacity: 0,
    };
  }
  return {
    fillColor: colorForMetric(v, maxV),
    weight: 1,
    color: '#8B1A1A',
    opacity: 0.6,
    fillOpacity: v > 0 ? 0.78 : 0.35,
  };
}

function restylePolygons() {
  if (!MAP_STATE.geoLayer) return;
  MAP_STATE.geoLayer.eachLayer(layer => {
    layer.setStyle(stylePolygon(layer.feature));
  });
}

function zoomToCounty(name) {
  if (!MAP_STATE.geoLayer || !MAP_STATE.map) return;
  let bounds = null;
  MAP_STATE.geoLayer.eachLayer(layer => {
    if (layer.feature?.properties?.name === name) bounds = layer.getBounds();
  });
  if (bounds) MAP_STATE.map.flyToBounds(bounds, { padding: [24, 24], duration: 0.7, maxZoom: 12 });
}

function showCountyDetail(c) {
  MAP_STATE.selectedCounty = c.name;
  // Sync the county filter dropdown (option values are the raw uppercase names)
  const sel = document.getElementById('ffCounty');
  if (sel) {
    const want = c.name.toUpperCase();
    const opt = [...sel.options].find(o => o.value.toUpperCase() === want);
    if (opt) sel.value = opt.value;
  }
  // Grey out other counties on the map
  restylePolygons();
  // Zoom + center on the selected county's polygon bounds
  zoomToCounty(c.name);
  // Scope the pins + table to this county (reads the filter dropdown just set)
  applyFieldFilters();
  const det = document.getElementById('mapDetail');
  if (!det) return;
  // True per-well-per-day average uses total well-days as the denominator
  // (sum of "Days in Production" across every well × every quarter that
  // reported in 2025). This naturally handles wells that came online or
  // shut in mid-year.
  const oilPerWellPerDay = c.wellDays > 0 ? c.oilBbl / c.wellDays : 0;
  // Convert gas Mcf/d → bbl-oe/d using the 5.659 Mcf/boe factor.
  const gasPerWellPerDayBoe = c.wellDays > 0 ? (c.gasMcf / c.wellDays) / 5.659 : 0;
  det.innerHTML = `
    <div class="map-detail-header">
      <div class="map-detail-tag">${c.name.toUpperCase()} COUNTY · OHIO</div>
      <h3>${c.name}</h3>
      <div class="map-detail-sub">${c.note}</div>
    </div>
    <div class="map-detail-body">
      <div class="map-detail-section-title">Production · 2025</div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Avg. Oil per well per day</span><span class="map-detail-stat-value">${c.wellDays > 0 ? fmt.num(oilPerWellPerDay) + ' bbl/d' : '—'}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Avg. Gas per well per day</span><span class="map-detail-stat-value">${c.wellDays > 0 ? fmt.num(gasPerWellPerDayBoe) + ' bbl/d' : '—'}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Producing wells</span><span class="map-detail-stat-value">${fmt.num(c.prodWells)}</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total oil</span><span class="map-detail-stat-value">${fmt.num(c.oilBbl)} bbl</span></div>
      <div class="map-detail-stat"><span class="map-detail-stat-label">Total gas</span><span class="map-detail-stat-value">${fmtBcfe(c.gasMcf)}</span></div>

      ${renderOperatorBreakdown(c.name)}

      <div class="map-detail-note">${c.note}</div>
    </div>
  `;
}

function renderOperatorBreakdown(countyName) {
  const ops = window.COUNTY_OPERATORS_2025?.[countyName];
  if (!ops || ops.length === 0) return '';
  // Total wells across all operators in this county
  const totalWells = ops.reduce((s, o) => s + o.wells, 0);
  const totalGas = ops.reduce((s, o) => s + o.gas, 0);
  const totalOil = ops.reduce((s, o) => s + o.oil, 0);
  const rows = ops.map(o => {
    const sharePct = totalGas + totalOil * 5.659 > 0
      ? ((o.gas + o.oil * 5.659) / (totalGas + totalOil * 5.659) * 100).toFixed(1)
      : '0.0';
    const oilStr = o.oil > 0 ? fmt.num(o.oil) + ' bbl' : '—';
    const gasStr = o.gas > 0 ? (o.gas / 1e6).toFixed(2) + ' Bcf' : '—';
    return `
      <div class="map-op-row">
        <div class="map-op-name">${o.op}</div>
        <div class="map-op-stats">
          <span><strong>${o.wells}</strong> wells</span>
          <span>${oilStr} oil</span>
          <span>${gasStr} gas</span>
        </div>
        <div class="map-op-bar-row">
          <div class="map-op-bar"><div class="map-op-bar-fill" style="width:${sharePct}%"></div></div>
          <span class="map-op-bar-pct">${sharePct}%</span>
        </div>
      </div>
    `;
  }).join('');
  return `
    <div class="map-detail-section-title">Operators · 2025 Production</div>
    <div class="map-op-summary">${ops.length} operator${ops.length === 1 ? '' : 's'} · ${fmt.num(totalWells)} wells · ${(totalGas / 1e6).toFixed(1)} Bcf gas · ${fmt.num(totalOil)} bbl oil</div>
    <div class="map-op-list">${rows}</div>
  `;
}

function renderFieldMap() {
  if (typeof L === 'undefined' || !window.OhioCounties) return;
  initMap();
  // Leaflet sometimes mis-sizes when initialized in a hidden tab; nudge it
  setTimeout(() => MAP_STATE.map && MAP_STATE.map.invalidateSize(), 50);
  // Load wells, then wire the filter bar + render the initial (unfiltered) set.
  ensureWellsLoaded().then(() => {
    populateFieldFilterDropdowns();
    bindFieldFilters();
    applyFieldFilters();
  });
  window.MAP_STATE = MAP_STATE;
}

// ===== Master render =====
function render() {
  const model = M.runModel(state, state.scenario);
  renderRealizedChips();
  renderFcfChart(model);
  renderRevStackChart(model);
  renderDeclineChart();
  renderGasSupplyChart(model);
  renderWaterfall();
  renderPnlTable(model);
  renderDistribTable(model);
  renderScenarioAnalysis();
}

// ===========================================================
// Info-icon tooltip popover
// ===========================================================
let _tooltipEl = null;
function initTooltips() {
  if (_tooltipEl) return;
  _tooltipEl = document.createElement('div');
  _tooltipEl.className = 'tooltip-popover';
  document.body.appendChild(_tooltipEl);

  const show = (icon) => {
    const tip = icon.dataset.tip;
    if (!tip) return;
    _tooltipEl.textContent = tip;
    _tooltipEl.classList.remove('visible', 'below');
    _tooltipEl.style.left = '0px';
    _tooltipEl.style.top = '0px';
    // Force layout to measure
    const tipRect = _tooltipEl.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const margin = 8;
    let placeBelow = false;
    let top = iconRect.top - tipRect.height - margin;
    if (top < 8) {  // not enough room above — flip below
      top = iconRect.bottom + margin;
      placeBelow = true;
    }
    let left = iconRect.left + iconRect.width / 2 - tipRect.width / 2;
    // Clamp horizontally to viewport
    const minLeft = 8;
    const maxLeft = window.innerWidth - tipRect.width - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    _tooltipEl.style.left = left + 'px';
    _tooltipEl.style.top = top + 'px';
    _tooltipEl.classList.toggle('below', placeBelow);
    requestAnimationFrame(() => _tooltipEl.classList.add('visible'));
  };
  const hide = () => {
    _tooltipEl.classList.remove('visible');
  };

  // Event delegation
  document.addEventListener('mouseover', e => {
    const icon = e.target.closest && e.target.closest('.info[data-tip]');
    if (icon) show(icon);
  });
  document.addEventListener('mouseout', e => {
    const icon = e.target.closest && e.target.closest('.info[data-tip]');
    if (icon) hide();
  });
  document.addEventListener('focusin', e => {
    if (e.target.matches && e.target.matches('.info[data-tip]')) show(e.target);
  });
  document.addEventListener('focusout', e => {
    if (e.target.matches && e.target.matches('.info[data-tip]')) hide();
  });
  // Hide on scroll within sidebar (tooltip would otherwise stay anchored to old position)
  document.addEventListener('scroll', hide, true);
}

// ===== Boot =====
function boot() {
  try {
    syncInputs();
    bindInputs();
    syncRampInputs();
    bindRampInputs();
    bindScenarioToggle();
    bindNav();
    bindJumpLinks();
    bindMobileMenu();
    bindReset();
    scenarioStore.init();
    bindSidebarAccordion();
    bindDashboardViews();
    bindPnlToggle();
    initTooltips();
    // initial visibility — sidebar/chart sections gated to active scenario
    applyScenarioVisibility();
    syncScenarioButtons();
    render();
    renderOverviewMap();
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
