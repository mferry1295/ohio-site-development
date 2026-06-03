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
      // Parcel map (Krizman holdings) — init / resize Leaflet on activation
      if (target === 'parcelmap') renderParcelMap();
      // Productivity heatmap — init / resize Leaflet on activation
      if (target === 'productivity') renderProductivityMap();
      // Power Ramp charts need to be created/resized when their tab becomes visible
      if (target === 'powerramp') {
        renderPowerRamp();
        setTimeout(() => {
          ['rampDeclineChart', 'rampStackChart'].forEach(id => charts[id]?.resize?.());
        }, 0);
      }
      // Land Readiness Checklist builds once, then restores saved progress
      if (target === 'checklist') renderChecklist();
      // Go-to-Market canvas — builds once, then reacts to its own toggles
      if (target === 'gtm') renderGtm();
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

// Stable identity for a well — used to match a detail-table row to its map dot.
// Prefer the ODNR API number; fall back to coordinates when API is missing.
function wellKey(p) { return p.api ? 'a:' + p.api : 'c:' + p.lat + '_' + p.lon; }

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

// Main entry: recompute the matching set, refresh the productivity dots and
// the detail table, and update the filtered-count chip.
async function applyFieldFilters() {
  await ensureWellsLoaded();
  const data = MAP_STATE.wellsData;
  if (!data) return;
  readFieldFilters();
  const f = MAP_STATE.filters;
  const all = data.r || [];
  const items = [];
  for (const r of all) {
    const p = projectWell(r, data);
    if (wellPasses(p, f)) items.push(p);
  }
  MAP_STATE.filteredItems = items;
  // A changed filter set invalidates any well selection.
  if (PROD_STATE) PROD_STATE.selectedWell = null;
  // Productivity map respects the same filters — rebuild dots/grid from the
  // filtered set (no-op if the map isn't initialized yet).
  if (PROD_STATE && PROD_STATE.map) buildProductivity();
  renderWellsTable();
  updateFilterCount(items.length, all.length);
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
  document.getElementById('ffCounty')?.addEventListener('change', () => applyFieldFilters());
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
  bindWellsTableRows();
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
  const sel = PROD_STATE && PROD_STATE.selectedWell;
  tbody.innerHTML = shown.map(it => {
    const key = wellKey(it);
    return `<tr data-key="${escapeHtmlSimple(key)}" data-lat="${it.lat}" data-lon="${it.lon}"${key === sel ? ' class="row-active"' : ''} title="Zoom to this well on the map">
    <td>${escapeHtmlSimple(it.name) || '—'}</td>
    <td>${escapeHtmlSimple(it.operator) || '—'}</td>
    <td>${escapeHtmlSimple(it.county)}</td>
    <td>${escapeHtmlSimple(it.township) || '—'}</td>
    <td class="num">${it.firstProdYear || '—'}</td>
    <td class="num">${f0(it.oilPerDay)}</td>
    <td class="num">${f2(it.gasPerDayMMcf)}</td>
    <td class="num">${f1(it.gasMMcf)}</td>
    <td class="num">${f0(it.oilBbl)}</td>
  </tr>`;
  }).join('');
}

// Delegated click handler so it survives every tbody re-render. Bound once.
function bindWellsTableRows() {
  if (MAP_STATE.wellsRowsBound) return;
  const tbody = document.getElementById('wellsTableBody');
  if (!tbody) return;
  tbody.addEventListener('click', ev => {
    const tr = ev.target.closest('tr');
    if (tr && tbody.contains(tr)) onWellRowClick(tr);
  });
  MAP_STATE.wellsRowsBound = true;
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

// ===========================================================
// Productivity Map — Utica well heatmap (ODNR 2025 production)
// Reuses the Field Map's wells.json; weights a heat layer by per-well rate.
// ===========================================================
const PROD_STATE = { map: null, canvas: null, wellLayer: null, gridLayer: null, site: null, baseLayers: {}, basemap: 'street', metric: 'gas', view: 'wells', built: false, items: null, wellMarkers: null, selectedWell: null };
const PROD_METRICS = {
  gas:  { label: 'Gas rate', unit: 'Mcf/d', short: 'gas', val: (oil, gas, days) => days > 0 ? gas / days : 0 },
  oil:  { label: 'Oil rate', unit: 'bbl/d', short: 'oil', val: (oil, gas, days) => days > 0 ? oil / days : 0 },
  mcfe: { label: 'Gas-equivalent', unit: 'Mcfe/d', short: 'gas-equiv', val: (oil, gas, days) => days > 0 ? (gas + oil * 5.659) / days : 0 },
};
// Sequential productivity ramp: light orange (low) → deep red (high).
const PROD_RAMP = [[253, 219, 160], [245, 178, 95], [233, 120, 55], [199, 55, 38], [120, 14, 18]];
function prodColor(t) {
  t = Math.max(0, Math.min(1, t || 0));
  const x = t * (PROD_RAMP.length - 1), i = Math.floor(x), f = x - i;
  const a = PROD_RAMP[i], b = PROD_RAMP[Math.min(PROD_RAMP.length - 1, i + 1)];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
const PROD_SITE = [40.6299, -81.4312]; // Project Lantern site, Bolivar

function renderProductivityMap() {
  if (typeof L === 'undefined') return;
  initProductivityMap();
  setTimeout(() => PROD_STATE.map && PROD_STATE.map.invalidateSize(), 60);
  if (PROD_STATE.built) return;
  const loadEl = document.getElementById('prodLoading');
  if (loadEl) loadEl.hidden = false;
  (async () => {
    await ensureWellsLoaded();
    // ensureWellsLoaded can return before an in-flight load resolves — poll briefly.
    for (let i = 0; i < 120 && !MAP_STATE.wellsData; i++) await new Promise(r => setTimeout(r, 100));
    if (loadEl) loadEl.hidden = true;
    if (!MAP_STATE.wellsData) return;
    // Wire the filter bar (above the map) and seed the filtered set — the dots
    // and the detail table both render off MAP_STATE.filteredItems.
    populateFieldFilterDropdowns();
    bindFieldFilters();
    PROD_STATE.built = true;
    await applyFieldFilters();
  })();
}

function initProductivityMap() {
  if (PROD_STATE.map) return;
  const el = document.getElementById('prodMap');
  if (!el) return;
  const map = L.map('prodMap', { center: [40.05, -81.05], zoom: 8, minZoom: 7, maxZoom: 14, scrollWheelZoom: false });
  PROD_STATE.map = map;
  PROD_STATE.canvas = L.canvas({ padding: 0.5 }); // GPU-light rendering for thousands of markers
  PROD_STATE.baseLayers.street = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);
  PROD_STATE.baseLayers.aerial = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imagery &copy; Esri', maxZoom: 19,
  });
  const icon = L.divIcon({ className: 'prod-site-icon', html: '★', iconSize: [26, 26], iconAnchor: [13, 13] });
  PROD_STATE.site = L.marker(PROD_SITE, { icon, zIndexOffset: 1000 })
    .bindTooltip('Project Lantern site · Bolivar', { direction: 'top', offset: [0, -10] })
    .addTo(map);
  bindProdControls();
}

// Source wells from the active filter set so the dots, the grid, and the
// detail table all stay in lockstep. No cache — applyFieldFilters runs on
// every change and we want the next buildProductivity to see the new set.
function prodWellItems() {
  const items = MAP_STATE.filteredItems || [];
  const out = [];
  for (const p of items) {
    if (!p.days || p.days <= 0) continue;
    out.push({ key: wellKey(p), api: p.api || '', lat: p.lat, lon: p.lon, county: p.countyRaw || '', operator: p.operator || '', name: p.name || '', oil: p.oilBbl || 0, gas: p.gasMcf || 0, days: p.days });
  }
  return out;
}

function prodPercentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))];
}

function buildProductivity() {
  const map = PROD_STATE.map;
  if (!map) return;
  const m = PROD_METRICS[PROD_STATE.metric];
  const items = prodWellItems();
  if (PROD_STATE.wellLayer) { map.removeLayer(PROD_STATE.wellLayer); PROD_STATE.wellLayer = null; }
  if (PROD_STATE.gridLayer) { map.removeLayer(PROD_STATE.gridLayer); PROD_STATE.gridLayer = null; }
  const vals = [];
  for (const it of items) { const v = m.val(it.oil, it.gas, it.days); if (v > 0) vals.push(v); }
  vals.sort((a, b) => a - b);
  const legendMax = PROD_STATE.view === 'grid' ? renderGridView(items, m) : renderWellsView(items, m, vals);
  renderProdLegend(m, legendMax);
}

// Graduated symbols: every well a dot, sized + colored by its own rate.
function renderWellsView(items, m, vals) {
  const colorMax = prodPercentile(vals, 0.95) || 1;
  const sizeMax = prodPercentile(vals, 0.90) || 1;
  const e = escapeHtmlSimple;
  const tc = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const group = L.layerGroup();
  // Registry so the detail table can find a well's dot by its stable key.
  const registry = new Map();
  // Draw lowest-rate wells first so the big producers sit on top.
  const scored = items.map(it => ({ it, v: m.val(it.oil, it.gas, it.days) })).filter(x => x.v > 0).sort((a, b) => a.v - b.v);
  scored.forEach(({ it, v }) => {
    const radius = 2.5 + Math.sqrt(Math.min(1, v / sizeMax)) * 8.5;
    const base = { radius, color: 'rgba(45,20,20,0.4)', weight: 0.5, fillColor: prodColor(v / colorMax), fillOpacity: 0.82 };
    const mk = L.circleMarker([it.lat, it.lon], { renderer: PROD_STATE.canvas, ...base });
    mk.bindPopup(`<div class="well-popup">
      <div class="well-popup-name">${e(it.name) || '—'}</div>
      <div class="well-popup-row"><span>Operator</span><strong>${e(tc(it.operator))}</strong></div>
      <div class="well-popup-row"><span>County</span><strong>${e(tc(it.county))}</strong></div>
      <div class="well-popup-section">2025 rate</div>
      <div class="well-popup-row"><span>Gas</span><strong>${((it.gas / it.days) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MMcf/d</strong></div>
      <div class="well-popup-row"><span>Oil</span><strong>${Math.round(it.oil / it.days).toLocaleString()} bbl/d</strong></div>
    </div>`, { maxWidth: 240 });
    group.addLayer(mk);
    if (it.key) registry.set(it.key, { marker: mk, lat: it.lat, lon: it.lon, base });
  });
  PROD_STATE.wellLayer = group.addTo(PROD_STATE.map);
  PROD_STATE.wellMarkers = registry;
  return colorMax;
}

// Area grid: bin wells into ~2.5 mi cells, color by AVERAGE rate (well quality,
// not well density) — the legible "best areas to drill" heatmap.
function renderGridView(items, m) {
  const CELL = 0.035;
  const cells = {};
  items.forEach(it => {
    const v = m.val(it.oil, it.gas, it.days);
    if (v <= 0) return;
    const gx = Math.floor(it.lon / CELL), gy = Math.floor(it.lat / CELL), key = gx + '_' + gy;
    const c = cells[key] || (cells[key] = { gx, gy, sum: 0, n: 0, gas: 0, oil: 0, days: 0 });
    c.sum += v; c.n++; c.gas += it.gas; c.oil += it.oil; c.days += it.days;
  });
  const list = Object.values(cells).filter(c => c.n >= 2);
  const avgs = list.map(c => c.sum / c.n).sort((a, b) => a - b);
  const colorMax = prodPercentile(avgs, 0.92) || 1;
  const group = L.layerGroup();
  list.forEach(c => {
    const avg = c.sum / c.n;
    const bounds = [[c.gy * CELL, c.gx * CELL], [(c.gy + 1) * CELL, (c.gx + 1) * CELL]];
    const rect = L.rectangle(bounds, {
      renderer: PROD_STATE.canvas, color: 'rgba(255,255,255,0.2)', weight: 0.4,
      fillColor: prodColor(avg / colorMax), fillOpacity: 0.66,
    });
    rect.bindPopup(`<div class="well-popup">
      <div class="well-popup-name">${c.n} wells · this area</div>
      <div class="well-popup-row"><span>Avg ${m.short}</span><strong>${Math.round(avg).toLocaleString()} ${m.unit}</strong></div>
      <div class="well-popup-row"><span>Avg gas</span><strong>${c.days > 0 ? ((c.gas / c.days) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' MMcf/d' : '—'}</strong></div>
      <div class="well-popup-row"><span>Avg oil</span><strong>${c.days > 0 ? Math.round(c.oil / c.days).toLocaleString() : '—'} bbl/d</strong></div>
    </div>`, { maxWidth: 220 });
    group.addLayer(rect);
  });
  PROD_STATE.gridLayer = group.addTo(PROD_STATE.map);
  return colorMax;
}

function renderProdLegend(m, max) {
  const el = document.getElementById('prodLegend');
  if (!el) return;
  el.innerHTML = `<div class="prod-legend-title">${m.label} <span>(${m.unit})</span></div>
    <div class="prod-legend-bar"></div>
    <div class="prod-legend-scale"><span>low</span><span>&ge; ${Math.round(max).toLocaleString()}</span></div>`;
}

function bindProdControls() {
  document.querySelectorAll('.prod-metric-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.addEventListener('click', () => {
      PROD_STATE.metric = btn.dataset.metric;
      document.querySelectorAll('.prod-metric-btn').forEach(b => b.classList.toggle('active', b === btn));
      clearProdSelection();        // recolored dots — drop any stale highlight
      buildProductivity();
    });
    btn.dataset.bound = '1';
  });
  document.querySelectorAll('.prod-base-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.addEventListener('click', () => {
      const base = btn.dataset.base;
      if (base === PROD_STATE.basemap) return;
      const map = PROD_STATE.map;
      map.removeLayer(PROD_STATE.baseLayers[PROD_STATE.basemap]);
      PROD_STATE.baseLayers[base].addTo(map);
      PROD_STATE.baseLayers[base].bringToBack();
      PROD_STATE.basemap = base;
      document.querySelectorAll('.prod-base-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
    btn.dataset.bound = '1';
  });
  document.querySelectorAll('.prod-view-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.addEventListener('click', () => {
      PROD_STATE.view = btn.dataset.view;
      document.querySelectorAll('.prod-view-btn').forEach(b => b.classList.toggle('active', b === btn));
      clearProdSelection();        // metric/view changes rebuild fresh dots
      buildProductivity();
    });
    btn.dataset.bound = '1';
  });
}

// ===== Detail-table → map selection =====
// Clicking a table row zooms the map to that well and greys out the rest.
function highlightProdWell(key, opts = {}) {
  const reg = PROD_STATE.wellMarkers;
  if (!reg) return;
  const rec = reg.get(key);
  PROD_STATE.selectedWell = key;
  reg.forEach((r, k) => {
    if (k === key) {
      r.marker.setStyle({ fillColor: r.base.fillColor, fillOpacity: 1, color: '#1B1B1B', weight: 2 });
      r.marker.setRadius(Math.max(7, r.base.radius + 2));
      r.marker.bringToFront();
    } else {
      r.marker.setStyle({ fillColor: '#c2c2c2', fillOpacity: 0.16, color: 'rgba(120,120,120,0.22)', weight: 0.5 });
    }
  });
  if (rec) {
    if (opts.zoom) PROD_STATE.map.setView([rec.lat, rec.lon], 13, { animate: true });
    rec.marker.openPopup();
  }
}

function clearProdSelection() {
  PROD_STATE.selectedWell = null;
  document.querySelectorAll('#wellsTable tbody tr.row-active').forEach(r => r.classList.remove('row-active'));
  if (PROD_STATE.map) PROD_STATE.map.closePopup();
  const reg = PROD_STATE.wellMarkers;
  if (!reg) return;
  reg.forEach(r => {
    r.marker.setStyle({ fillColor: r.base.fillColor, fillOpacity: r.base.fillOpacity, color: r.base.color, weight: r.base.weight });
    r.marker.setRadius(r.base.radius);
  });
}

function onWellRowClick(tr) {
  if (!PROD_STATE || !PROD_STATE.map) return;
  const key = tr.dataset.key;
  if (!key) return;
  // Click the already-selected row → toggle the highlight back off.
  if (PROD_STATE.selectedWell === key) { clearProdSelection(); return; }
  // Dots only exist in the Wells view — switch into it first if needed.
  if (PROD_STATE.view !== 'wells') {
    PROD_STATE.view = 'wells';
    document.querySelectorAll('.prod-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'wells'));
    buildProductivity();
  }
  document.querySelectorAll('#wellsTable tbody tr.row-active').forEach(r => r.classList.remove('row-active'));
  tr.classList.add('row-active');
  const reg = PROD_STATE.wellMarkers;
  if (reg && reg.has(key)) {
    highlightProdWell(key, { zoom: true });
  } else {
    // No 2025-producing dot for this well — just pan to its coordinates.
    const lat = parseFloat(tr.dataset.lat), lon = parseFloat(tr.dataset.lon);
    if (isFinite(lat) && isFinite(lon)) PROD_STATE.map.setView([lat, lon], 13, { animate: true });
  }
  // The table sits below the map — bring the map back into view to show the zoom.
  document.getElementById('prodMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===========================================================
// Parcel Map — Krizman land holdings (Tuscarawas County)
// Polygons sourced from the county Auditor GIS, bundled as a local GeoJSON.
// ===========================================================
const PARCEL_STATE = { map: null, layer: null, data: null, byId: {}, baseLayers: {}, basemap: 'street', selected: null, loaded: false, loading: false, sort: 'acres', filter: '', wells: null, wellsData: null, wellsShown: true };

// Dark dot with a white halo — reads as a point well over the red/teal parcels.
const WELL_MARKER_STYLE = { radius: 5, color: '#fff', weight: 1.5, fillColor: '#1B1B1B', fillOpacity: 1 };

// Parcels are colored by ownership umbrella — Krizman entities vs the related
// Wilkshire Hills Holdings (same owner-of-record address).
const OWNER_GROUPS = {
  krizman:   { label: 'Krizman', color: '#8B1A1A', fill: '#C44040' },
  wilkshire: { label: 'Wilkshire Hills', color: '#1F6F78', fill: '#4FA3AD' },
  other:     { label: 'Other', color: '#6B6B6B', fill: '#A8A8A8' },
};
function ownerGroup(p) { return OWNER_GROUPS[p && p.owner_group] ? p.owner_group : 'other'; }
function parcelStyleFor(p, mode) {
  const g = OWNER_GROUPS[ownerGroup(p)];
  if (mode === 'selected') return { color: '#2B2B2B', weight: 3, opacity: 1, fillColor: g.fill, fillOpacity: 0.7 };
  if (mode === 'hover')    return { color: g.color, weight: 2.6, opacity: 1, fillColor: g.color, fillOpacity: 0.55 };
  return { color: g.color, weight: 1.4, opacity: 0.9, fillColor: g.fill, fillOpacity: 0.34 };
}

const LU_COLORS = { ag: '#8B1A1A', commercial: '#4F7799', residential: '#C99A4E', other: '#9A9A9A' };
const LU_LABELS = { ag: 'Agricultural', commercial: 'Commercial / office', residential: 'Residential', other: 'Other' };

function luBucket(lu) {
  const s = (lu || '').toUpperCase();
  if (s.includes('AGRICULTURAL')) return 'ag';
  if (s.includes('COMMERCIAL') || s.includes('OFFICE') || s.includes('BUILDING') || s.includes('STRUCTURE')) return 'commercial';
  if (s.includes('RESIDENTIAL')) return 'residential';
  return 'other';
}
function cleanLandUse(lu) {
  if (!lu) return '—';
  return lu.replace(/^\d+\s*-\s*/, '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function renderParcelMap() {
  if (typeof L === 'undefined') return;
  initParcelMap();
  setTimeout(() => PARCEL_STATE.map && PARCEL_STATE.map.invalidateSize(), 60);
  if (!PARCEL_STATE.loaded && !PARCEL_STATE.loading) loadParcels();
}

function initParcelMap() {
  if (PARCEL_STATE.map) return;
  const el = document.getElementById('parcelMapCanvas');
  if (!el) return;
  const map = L.map('parcelMapCanvas', { center: [40.6299, -81.4312], zoom: 13, minZoom: 9, maxZoom: 18, scrollWheelZoom: false });
  PARCEL_STATE.map = map;
  PARCEL_STATE.baseLayers.street = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: 'abcd', maxZoom: 19,
  });
  PARCEL_STATE.baseLayers.aerial = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imagery &copy; Esri', maxZoom: 19,
  });
  PARCEL_STATE.baseLayers.street.addTo(map);
  bindParcelControls();
}

async function loadParcels() {
  PARCEL_STATE.loading = true;
  const loadEl = document.getElementById('pmLoading');
  if (loadEl) loadEl.hidden = false;
  try {
    const resp = await fetch('krizman_parcels.geojson?v=2026-06-02d');
    const gj = await resp.json();
    PARCEL_STATE.data = gj;
    PARCEL_STATE.byId = {};
    const layer = L.geoJSON(gj, {
      style: f => parcelStyleFor(f.properties, 'default'),
      onEachFeature: (feat, lyr) => {
        const p = feat.properties;
        PARCEL_STATE.byId[p.PARCEL_ID] = lyr;
        lyr.bindPopup(parcelPopup(p), { maxWidth: 260 });
        lyr.on('mouseover', () => { if (PARCEL_STATE.selected !== p.PARCEL_ID) lyr.setStyle(parcelStyleFor(p, 'hover')); });
        lyr.on('mouseout', () => { if (PARCEL_STATE.selected !== p.PARCEL_ID) lyr.setStyle(parcelStyleFor(p, 'default')); });
        lyr.on('click', () => selectParcel(p.PARCEL_ID, false));
      },
    }).addTo(PARCEL_STATE.map);
    PARCEL_STATE.layer = layer;
    try { PARCEL_STATE.map.fitBounds(layer.getBounds(), { padding: [24, 24] }); } catch (e) {}
    renderParcelStats(gj);
    renderParcelList();
    PARCEL_STATE.loaded = true;
    loadWells();
  } catch (e) {
    console.error('Failed to load parcels:', e);
    const list = document.getElementById('pmList');
    if (list) list.innerHTML = '<li class="pm-empty">Could not load parcel data.</li>';
  } finally {
    PARCEL_STATE.loading = false;
    if (loadEl) loadEl.hidden = true;
  }
}

async function loadWells() {
  if (PARCEL_STATE.wells) return;
  try {
    const resp = await fetch('krizman_wells.geojson?v=2026-06-02d');
    const gj = await resp.json();
    PARCEL_STATE.wellsData = gj;
    const group = L.layerGroup();
    (gj.features || []).forEach(f => {
      const p = f.properties;
      const c = f.geometry && f.geometry.coordinates;
      if (!c) return;
      const m = L.circleMarker([c[1], c[0]], WELL_MARKER_STYLE);
      m.bindPopup(wellPopup(p), { maxWidth: 240 });
      group.addLayer(m);
    });
    PARCEL_STATE.wells = group;
    if (PARCEL_STATE.wellsShown && PARCEL_STATE.map) group.addTo(PARCEL_STATE.map);
    const cntEl = document.querySelector('#pmWellsToggle .pm-wells-count');
    if (cntEl) cntEl.textContent = (gj.features || []).length;
  } catch (e) {
    console.error('Failed to load wells:', e);
  }
}

function wellPopup(p) {
  const e = escapeHtmlSimple;
  const slant = e(p.slant) === 'V' ? 'Vertical' : (e(p.slant) || '—');
  return `<div class="well-popup">
    <div class="well-popup-name">${e(p.name) || '—'}</div>
    <div class="well-popup-row"><span>API</span><strong>${e(p.api)}</strong></div>
    <div class="well-popup-row"><span>Status</span><strong>${e(p.status)}</strong></div>
    <div class="well-popup-row"><span>Type</span><strong>${e(p.type)}</strong></div>
    <div class="well-popup-row"><span>Slant</span><strong>${slant}</strong></div>
    <div class="well-popup-row"><span>Operator</span><strong>${e(p.operator)}</strong></div>
  </div>`;
}

function parcelPopup(p) {
  const e = escapeHtmlSimple;
  const val = (typeof p.appraised === 'number') ? fmt.money0(p.appraised) : '—';
  return `<div class="parcel-popup">
    <div class="parcel-popup-id">${e(p.PARCEL_ID)}</div>
    <div class="parcel-popup-owner">${e(p.owner || '')}</div>
    <div class="parcel-popup-row"><span>Address</span><strong>${e(p.address || '—')}</strong></div>
    <div class="parcel-popup-row"><span>Acres</span><strong>${(p.acres || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
    <div class="parcel-popup-row"><span>Land use</span><strong>${e(cleanLandUse(p.land_use))}</strong></div>
    <div class="parcel-popup-row"><span>Appraised</span><strong>${val}</strong></div>
  </div>`;
}

function selectParcel(id, fly) {
  const lyr = PARCEL_STATE.byId[id];
  if (!lyr) return;
  const prev = PARCEL_STATE.selected;
  if (prev && PARCEL_STATE.byId[prev]) {
    const pl = PARCEL_STATE.byId[prev];
    pl.setStyle(parcelStyleFor(pl.feature.properties, 'default'));
  }
  PARCEL_STATE.selected = id;
  lyr.setStyle(parcelStyleFor(lyr.feature.properties, 'selected'));
  lyr.bringToFront();
  if (fly) { try { PARCEL_STATE.map.fitBounds(lyr.getBounds(), { maxZoom: 17, padding: [50, 50] }); } catch (e) {} }
  lyr.openPopup();
  document.querySelectorAll('#pmList .pm-row').forEach(r => r.classList.toggle('is-active', r.dataset.id === id));
  const row = document.querySelector(`#pmList .pm-row[data-id="${id}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
}

function renderParcelStats(gj) {
  const feats = gj.features || [];
  let totalAcres = 0, appraised = 0;
  const buckets = { ag: 0, commercial: 0, residential: 0, other: 0 };
  const owners = {}; // group -> { count, acres }
  feats.forEach(f => {
    const p = f.properties;
    totalAcres += p.acres || 0;
    if (typeof p.appraised === 'number') appraised += p.appraised;
    buckets[luBucket(p.land_use)] += p.acres || 0;
    const g = ownerGroup(p);
    (owners[g] = owners[g] || { count: 0, acres: 0 }).count++;
    owners[g].acres += p.acres || 0;
  });
  // Owner legend (map color key)
  const legEl = document.getElementById('pmOwnerLegend');
  if (legEl) {
    legEl.innerHTML = Object.keys(owners)
      .sort((a, b) => owners[b].acres - owners[a].acres)
      .map(g => `<span class="pm-owner-leg"><span class="pm-dot" style="background:${OWNER_GROUPS[g].fill};border:1.5px solid ${OWNER_GROUPS[g].color}"></span>${OWNER_GROUPS[g].label} · ${owners[g].count} · ${owners[g].acres.toFixed(0)} ac</span>`)
      .join('');
  }
  const segs = Object.keys(buckets).filter(k => buckets[k] > 0).map(k => {
    const w = totalAcres ? (buckets[k] / totalAcres * 100) : 0;
    return `<span class="pm-lubar-seg" style="width:${w}%;background:${LU_COLORS[k]}" title="${LU_LABELS[k]}: ${buckets[k].toFixed(1)} ac"></span>`;
  }).join('');
  const legend = Object.keys(buckets).filter(k => buckets[k] > 0).map(k =>
    `<span class="pm-lu-leg"><span class="pm-dot" style="background:${LU_COLORS[k]}"></span>${LU_LABELS[k]} · ${buckets[k].toFixed(1)} ac</span>`).join('');
  const el = document.getElementById('pmStats');
  if (!el) return;
  el.innerHTML = `
    <div class="pm-stat"><div class="pm-stat-label">Parcels</div><div class="pm-stat-value">${feats.length}</div><div class="pm-stat-sub">Krizman + Wilkshire Hills</div></div>
    <div class="pm-stat"><div class="pm-stat-label">Total acres</div><div class="pm-stat-value">${totalAcres.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div><div class="pm-stat-sub">combined assemblage</div></div>
    <div class="pm-stat"><div class="pm-stat-label">Appraised value</div><div class="pm-stat-value">${fmt.money0(appraised)}</div><div class="pm-stat-sub">county auditor total</div></div>
    <div class="pm-stat pm-stat--wide">
      <div class="pm-stat-label">Land use by acreage</div>
      <div class="pm-lubar">${segs}</div>
      <div class="pm-lu-legend">${legend}</div>
    </div>`;
}

function renderParcelList() {
  const ul = document.getElementById('pmList');
  if (!ul || !PARCEL_STATE.data) return;
  const e = escapeHtmlSimple;
  const filter = PARCEL_STATE.filter.trim().toLowerCase();
  let items = (PARCEL_STATE.data.features || []).map(f => f.properties);
  if (filter) items = items.filter(p =>
    (p.PARCEL_ID || '').toLowerCase().includes(filter) || (p.address || '').toLowerCase().includes(filter));
  const sort = PARCEL_STATE.sort;
  items.sort((a, b) => {
    if (sort === 'acres') return (b.acres || 0) - (a.acres || 0);
    if (sort === 'id') return String(a.PARCEL_ID).localeCompare(String(b.PARCEL_ID));
    if (sort === 'owner') {
      const o = String(a.owner || '').localeCompare(String(b.owner || ''));
      return o !== 0 ? o : (b.acres || 0) - (a.acres || 0); // group by owner, biggest first within
    }
    return String(a.address || '').localeCompare(String(b.address || ''));
  });
  if (!items.length) { ul.innerHTML = '<li class="pm-empty">No parcels match.</li>'; return; }
  ul.innerHTML = items.map(p => {
    const b = luBucket(p.land_use);
    const og = OWNER_GROUPS[ownerGroup(p)];
    const active = PARCEL_STATE.selected === p.PARCEL_ID ? ' is-active' : '';
    return `<li class="pm-row${active}" data-id="${p.PARCEL_ID}">
      <div class="pm-row-top">
        <span class="pm-row-idwrap"><span class="pm-owner-dot" style="background:${og.fill};border-color:${og.color}" title="${e(p.owner || '')}"></span><span class="pm-row-id">${e(p.PARCEL_ID)}</span></span>
        <span class="pm-row-acres">${(p.acres || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ac</span>
      </div>
      <div class="pm-row-addr">${e(p.address || '—')}${sort === 'owner' ? ` · <span class="pm-row-owner">${e(og.label)}</span>` : ''}</div>
      <span class="pm-lu-chip" style="--lu:${LU_COLORS[b]}">${e(cleanLandUse(p.land_use))}</span>
    </li>`;
  }).join('');
  ul.querySelectorAll('.pm-row').forEach(row => {
    const id = row.dataset.id;
    row.addEventListener('click', () => selectParcel(id, true));
    row.addEventListener('mouseenter', () => { const l = PARCEL_STATE.byId[id]; if (l && PARCEL_STATE.selected !== id) l.setStyle(parcelStyleFor(l.feature.properties, 'hover')); });
    row.addEventListener('mouseleave', () => { const l = PARCEL_STATE.byId[id]; if (l && PARCEL_STATE.selected !== id) l.setStyle(parcelStyleFor(l.feature.properties, 'default')); });
  });
}

function bindParcelControls() {
  document.querySelectorAll('.pm-base-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.addEventListener('click', () => {
      const base = btn.dataset.base;
      if (base === PARCEL_STATE.basemap) return;
      const map = PARCEL_STATE.map;
      map.removeLayer(PARCEL_STATE.baseLayers[PARCEL_STATE.basemap]);
      PARCEL_STATE.baseLayers[base].addTo(map);
      PARCEL_STATE.baseLayers[base].bringToBack();
      PARCEL_STATE.basemap = base;
      document.querySelectorAll('.pm-base-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
    btn.dataset.bound = '1';
  });
  const search = document.getElementById('pmSearch');
  if (search && search.dataset.bound !== '1') {
    search.addEventListener('input', e => { PARCEL_STATE.filter = e.target.value; renderParcelList(); });
    search.dataset.bound = '1';
  }
  const wt = document.getElementById('pmWellsToggle');
  if (wt && wt.dataset.bound !== '1') {
    wt.addEventListener('click', () => {
      PARCEL_STATE.wellsShown = !PARCEL_STATE.wellsShown;
      wt.classList.toggle('active', PARCEL_STATE.wellsShown);
      wt.setAttribute('aria-pressed', String(PARCEL_STATE.wellsShown));
      if (!PARCEL_STATE.wells || !PARCEL_STATE.map) return;
      if (PARCEL_STATE.wellsShown) PARCEL_STATE.wells.addTo(PARCEL_STATE.map);
      else PARCEL_STATE.map.removeLayer(PARCEL_STATE.wells);
    });
    wt.dataset.bound = '1';
  }
  document.querySelectorAll('.pm-sort-btn').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.addEventListener('click', () => {
      PARCEL_STATE.sort = btn.dataset.sort;
      document.querySelectorAll('.pm-sort-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderParcelList();
    });
    btn.dataset.bound = '1';
  });
}

// ===========================================================
// Land Readiness Checklist (Tuscarawas County, Ohio)
// Content is specific to a behind-the-meter, gas-fired data-center campus
// in the Utica fairway. Progress persists in localStorage.
// ===========================================================
// Each item: a plain-language milestone (title + overview anyone can read),
// a few concrete activities (what it takes to finish it), and the original
// technical detail kept as a note revealed on expand. `critical` flags the
// longest-lead items that gate everything else.
const CHECKLIST = [
  {
    key: 'site', title: 'Site Control & Title',
    blurb: 'Establish clean, contiguous control of the land and a reliable base map.',
    items: [
      { id: 'site-option', title: 'Secure site control', critical: true, lead: 'Real-estate counsel', time: '1–3 months',
        overview: 'Place the entire assemblage under contract before committing to study spend.',
        activities: [
          'Sign option or purchase agreements covering the full ~2,800 acres',
          'Build in extension rights so you can hold control while studies run',
          'Keep the footprint contiguous so it can grow into a campus',
        ],
        detail: 'Tie up the full ~2,800-acre assemblage with option or purchase-and-sale agreements (with extension rights) before spending on studies. A hyperscaler will not engage until it sees clean, exclusive control of a contiguous footprint it can grow into.' },
      { id: 'site-alta', title: 'Commission a land survey', critical: false, lead: 'Ohio-licensed surveyor', time: '1–2 months',
        overview: 'Obtain one accurate survey that every later study, permit and buyer review relies on.',
        activities: [
          'Hire an Ohio-licensed surveyor for an ALTA/NSPS survey',
          'Map boundaries, acreage, easements, encroachments and setbacks',
          'Include the Table A items buyers and lenders expect',
        ],
        detail: 'Commission an ALTA/NSPS survey of the assemblage showing boundaries, acreage, easements, encroachments, setbacks and Table A items. It is the base map every downstream study, the OPSB application and the buyer diligence all build on.' },
      { id: 'site-title', title: 'Clear and confirm title', critical: true, lead: 'Title company / counsel', time: '1–2 months',
        overview: 'Identify everything recorded against the land and plan to resolve or price each item.',
        activities: [
          'Order a title commitment from a title company',
          'List every exception — easements, rights-of-way, oil & gas leases, liens',
          'Write a plan to cure or quantify each before you market the site',
        ],
        detail: 'Pull a title commitment and work every exception — easements, rights-of-way, oil & gas leases, restrictive covenants, liens. In the Utica fairway expect recorded leases and pipeline ROWs; build a plan to cure or quantify each before marketing.' },
      { id: 'site-access', title: 'Confirm legal road access', critical: false, lead: 'Surveyor / counsel', time: '2–4 weeks',
        overview: 'Verify the site has legal, all-weather access to a public road.',
        activities: [
          'Verify legal ingress/egress to a public road',
          'Document any access easements you rely on',
          'Confirm the site can be reached and built on year-round',
        ],
        detail: 'Confirm legal, all-weather ingress/egress to a public road and document any access easements. Both a buyer and the OPSB need certainty the site can be reached, served and constructed.' },
      { id: 'site-assemble', title: 'Reconcile parcels and farmland tax', critical: false, lead: 'Counsel / County Auditor', time: '2–4 weeks',
        overview: 'Match every parcel to county records and budget for the recoupment tax triggered when farmland is converted.',
        activities: [
          'Reconcile parcel IDs and acreage with the County Auditor',
          'Check CAUV (farmland tax) recoupment exposure',
          'Price the recoupment into the deal',
        ],
        detail: 'Reconcile every parcel ID and acreage with the Tuscarawas County Auditor and check Current Agricultural Use Value (CAUV) recoupment exposure — converting farmland out of CAUV triggers a tax recoupment that should be priced in.' },
    ],
  },
  {
    key: 'mineral', title: 'Mineral, Oil & Gas, and Coal Rights',
    blurb: 'The subsurface issue that most often surprises buyers — resolve what lies beneath.',
    items: [
      { id: 'min-sever', title: 'Determine mineral ownership', critical: true, lead: 'Title / mineral counsel', time: '1–3 months',
        overview: 'Trace title to establish whether oil, gas and coal were severed from the surface — here, they usually were.',
        activities: [
          'Run the chain of title for the oil, gas and coal estates',
          'Identify who holds any severed mineral rights',
          'Understand their right to use the surface above',
        ],
        detail: 'Run the chain of title to determine whether oil & gas and coal are severed from the surface — across the fairway most are. A severed mineral owner generally holds the dominant right to use the surface, so a buyer must know exactly who controls what is beneath the campus.' },
      { id: 'min-leases', title: 'Review existing oil & gas leases', critical: true, lead: 'Landman / counsel', time: '1–3 months',
        overview: 'Identify which Utica leases and drilling units already cover the land and whether they commit the surface.',
        activities: [
          'Identify active leases, drilling units and pooled acreage',
          'Read their terms and held-by-production status',
          'Flag where leases limit where you can build',
        ],
        detail: 'Identify active Utica leases, drilling units and pooling on the acreage, their terms, and whether the surface is committed to drilling. Held-by-production leases and pooled acreage can dictate where you may and may not build.' },
      { id: 'min-wells', title: 'Inventory existing wells and pipelines', critical: false, lead: 'Landman / ODNR', time: '1–2 months',
        overview: 'Locate every well and pipeline on the site — each reduces the buildable area and may require work.',
        activities: [
          'Map active, idle, plugged and orphaned wells (ODNR locator)',
          'Map gathering and transmission lines crossing the site',
          'Apply setbacks; flag wells to plug or lines to relocate',
        ],
        detail: 'Map every active, idle, plugged and orphaned well (ODNR Division of Oil & Gas Resources well locator) and all gathering/transmission lines crossing the site, with setbacks. Legacy wellbores and lines shrink the buildable area and may need plugging or relocation.' },
      { id: 'min-coal', title: 'Assess abandoned coal mines beneath the site', critical: true, lead: 'Geotech / ODNR Geological Survey', time: '1–2 months',
        overview: 'Much of this area was deep-mined for coal; underground voids create subsidence risk that drives foundation design.',
        activities: [
          'Pull ODNR abandoned-underground-mine maps',
          'Identify any mined-out seams beneath the footprint',
          'Factor subsidence into foundation design and insurance',
        ],
        detail: 'Pull ODNR Division of Geological Survey abandoned-underground-mine maps — much of eastern Ohio and Tuscarawas County was deep-mined for coal, creating subsidence risk that drives foundation design, mine-subsidence insurance and buildable-area decisions.' },
      { id: 'min-sua', title: 'Negotiate a surface use agreement', critical: true, lead: 'Mineral counsel', time: '2–6 months',
        overview: 'Where others own or lease the minerals, establish how the campus and the drilling program will coexist.',
        activities: [
          'Define no-build / no-drill zones',
          'Agree on well relocation and consolidated pipeline corridors',
          'Document it so the campus and mineral program don’t conflict',
        ],
        detail: 'Where minerals are severed or leased, negotiate a surface use agreement — no-build/no-drill zones, well relocation, consolidated pipeline corridors — so the campus and the mineral program coexist. This is frequently the single biggest land-side de-risking step a buyer looks for.' },
    ],
  },
  {
    key: 'zoning', title: 'Zoning & Local Land Use',
    blurb: 'Establish what the land is entitled for today and the path to the use you need.',
    items: [
      { id: 'zone-determine', title: 'Determine township zoning', critical: true, lead: 'Land-use counsel / township zoning inspector', time: '2–4 weeks',
        overview: 'Establish whether the township has adopted zoning, and the land’s current permitted uses.',
        activities: [
          'Confirm if the township adopted zoning (ORC Ch. 519)',
          'Identify the current district and permitted uses',
          'Note that an unzoned township can speed things up',
        ],
        detail: 'Determine whether the parcels lie in a township that has adopted zoning under Ohio Revised Code Chapter 519 (several Tuscarawas townships such as Sandy and Lawrence are zoned; some have none) and the current district and permitted uses. An unzoned township can be a speed advantage.' },
      { id: 'zone-rezone', title: 'Define the rezoning path, if required', critical: false, lead: 'Land-use counsel', time: '3–6 months',
        overview: 'If a data center is not already permitted, define the approval steps and schedule.',
        activities: [
          'Map the rezoning or conditional-use process',
          'Identify hearings before the Zoning Commission, BZA and Trustees',
          'Build in public notice periods',
        ],
        detail: 'If the data-center use is not already permitted, map the rezoning or conditional-use-permit process through the township Zoning Commission, Board of Zoning Appeals and Trustees, including public hearings and notice periods.' },
      { id: 'zone-county', title: 'Coordinate county planning review', critical: false, lead: 'Tuscarawas County Regional Planning Commission', time: '1–2 months',
        overview: 'Process the lot-split and comprehensive-plan review through the county planning commission.',
        activities: [
          'Coordinate subdivision / lot-split review',
          'Get address assignments',
          'Confirm consistency with the county comprehensive plan',
        ],
        detail: 'Coordinate lot-split/subdivision review, address assignment and consistency with the comprehensive plan through the Tuscarawas County Regional Planning Commission.' },
      { id: 'zone-opsb', title: 'Clarify state vs. local jurisdiction', critical: false, lead: 'Siting counsel', time: '2–4 weeks',
        overview: 'The power plant is approved by the state — which preempts local zoning — while the buildings remain under township rules; sequence both.',
        activities: [
          'Confirm the ≥50 MW plant falls under the state siting board',
          'Confirm buildings stay under township zoning and county codes',
          'Sequence the two approval tracks accordingly',
        ],
        detail: 'Document the split: a ≥50 MW generating facility is sited by the Ohio Power Siting Board, which preempts local zoning for that facility — but the data-center buildings themselves stay under township zoning and county building codes. Sequence approvals accordingly.' },
      { id: 'zone-setbacks', title: 'Confirm setbacks and height limits', critical: false, lead: 'Land-use counsel / civil', time: '2–4 weeks',
        overview: 'Confirm the rules that shape the building envelope and the placement of turbines and stacks.',
        activities: [
          'Confirm setbacks and height limits',
          'Check FAA airspace surfaces near any airport',
          'Check floodplain or scenic overlays',
        ],
        detail: 'Confirm setbacks, height limits, any FAA Part 77 airspace surfaces near airports, and floodplain or scenic overlays that shape the building envelope and turbine/stack placement.' },
    ],
  },
  {
    key: 'opsb', title: 'State Power-Plant Siting (OPSB)',
    blurb: 'The on-site power plant is the longest approval — begin it first.',
    items: [
      { id: 'opsb-applic', title: 'Confirm state siting (OPSB) applicability', critical: true, lead: 'OPSB counsel', time: '1 month',
        overview: 'An on-site plant this large requires an Ohio Power Siting Board certificate, which sets the project’s critical path.',
        activities: [
          'Confirm the ~500 MW plant exceeds the 50 MW threshold',
          'Confirm an OPSB certificate (ORC Ch. 4906) is required',
          'Treat this certificate as the schedule driver',
        ],
        detail: 'A ~500 MW on-site gas plant exceeds the 50 MW threshold and requires an Ohio Power Siting Board Certificate of Environmental Compatibility and Public Need (ORC Ch. 4906). Confirm scope early — this certificate sets the project critical path.' },
      { id: 'opsb-preapp', title: 'Complete the pre-application and public meeting', critical: false, lead: 'OPSB counsel', time: '2–3 months',
        overview: 'Complete the required early filing and community meeting — engaging early lowers approval risk.',
        activities: [
          'File the pre-application notification with OPSB',
          'Hold the required public informational meeting',
          'Engage the community and agency early',
        ],
        detail: 'File the required pre-application notification and hold the public informational meeting. Early agency and community engagement materially reduces certificate risk and opposition later.' },
      { id: 'opsb-app', title: 'Assemble the certificate application', critical: true, lead: 'OPSB counsel / consultants', time: '4–8 months to file',
        overview: 'Compile the studies the state requires for the plant, reusing the environmental fieldwork so it is performed once.',
        activities: [
          'Prepare socioeconomic, ecological, water, air, noise, visual and cultural studies',
          'Cover the generation site and laydown areas',
          'Coordinate with the environmental work to avoid duplicate fieldwork',
        ],
        detail: 'Assemble the application — socioeconomic, ecological, surface-water, air, noise, visual and cultural studies for the generation site and laydown. Much overlaps the environmental workstream; coordinate fieldwork so studies are done once.' },
      { id: 'opsb-schedule', title: 'Plan for the review timeline and conditions', critical: false, lead: 'OPSB counsel', time: '9–12+ months review',
        overview: 'Build the lengthy state review window into the schedule and anticipate conditions that feed back into the layout.',
        activities: [
          'Add the 9–12+ month review window to the master schedule',
          'Anticipate conditions on setbacks, hours, noise and monitoring',
          'Feed likely conditions back into site design',
        ],
        detail: 'Build the OPSB review window into the master schedule and anticipate likely certificate conditions (setbacks, operating hours, noise and monitoring) that feed back into site layout.' },
    ],
  },
  {
    key: 'env', title: 'Environmental Clearance & Cultural Resources',
    blurb: 'Prove the land is clean and buildable — the heart of buyer due diligence.',
    items: [
      { id: 'env-phase1', title: 'Phase I environmental assessment', critical: true, lead: 'Environmental consultant', time: '4–8 weeks',
        overview: 'A standard records-and-site review to identify any contamination from prior farming, oil & gas or industrial use.',
        activities: [
          'Commission a Phase I ESA (ASTM E1527-21)',
          'Review prior agricultural, oil & gas and industrial use',
          'Deliver a clean report or a clear path to resolve findings',
        ],
        detail: 'Complete a Phase I ESA (ASTM E1527-21) to surface recognized environmental conditions from prior agricultural, oil & gas or industrial use. Buyers and lenders require a clean Phase I or a clear path to resolve findings.' },
      { id: 'env-phase2', title: 'Phase II testing (if warranted)', critical: false, lead: 'Environmental consultant / Ohio EPA VAP', time: '2–4 months',
        overview: 'If Phase I identifies concerns, conduct sampling and a cleanup plan — potentially through Ohio EPA’s voluntary program.',
        activities: [
          'Sample where Phase I flags tanks, pits, brine or dumping',
          'Develop a closure / cleanup plan',
          'Consider Ohio EPA’s Voluntary Action Program for a covenant-not-to-sue',
        ],
        detail: 'If the Phase I flags conditions (old tanks, pits, brine, dumping), perform Phase II sampling and a closure plan — potentially through Ohio EPA’s Voluntary Action Program to obtain a covenant-not-to-sue.' },
      { id: 'env-wetlands', title: 'Delineate streams and wetlands', critical: true, lead: 'Env. consultant / USACE Huntington / Ohio EPA', time: '2–4 months (seasonal)',
        overview: 'Identify regulated waters on the site — they can sterilize large areas and reshape the layout.',
        activities: [
          'Delineate streams and wetlands',
          'Coordinate Clean Water Act §404 jurisdiction with USACE Huntington',
          'Get §401 / isolated-wetland coverage from Ohio EPA',
        ],
        detail: 'Delineate streams and wetlands and coordinate Clean Water Act §404 jurisdiction with the USACE Huntington District plus §401 water-quality certification and isolated-wetland permits with Ohio EPA. Wetlands can sterilize large areas, so this reshapes the site plan.' },
      { id: 'env-species', title: 'Threatened & endangered species clearance', critical: true, lead: 'Ecologist / USFWS', time: '1–3 months + clearing window',
        overview: 'Listed bats restrict tree clearing to roughly October–March, which often governs the construction schedule.',
        activities: [
          'Run a USFWS IPaC review and habitat assessment',
          'Check for Indiana, northern long-eared and tricolored bats',
          'Schedule tree clearing to the ~Oct 1–Mar 31 window',
        ],
        detail: 'Run a USFWS IPaC review and habitat assessment for listed bats — Indiana bat, northern long-eared bat (endangered) and tricolored bat (proposed) — which limit tree clearing to roughly Oct 1–Mar 31. Bat windows routinely govern the construction schedule.' },
      { id: 'env-flood', title: 'Assess floodplain exposure', critical: false, lead: 'Civil engineer / floodplain admin', time: '2–4 weeks',
        overview: 'Keep the data halls and power island out of the 100-year floodplain, or design for it.',
        activities: [
          'Overlay FEMA flood maps and the watershed floodplain',
          'Locate critical buildings out of the 100-year floodplain',
          'Design for flooding where it can’t be avoided',
        ],
        detail: 'Overlay FEMA FIRM panels and the Tuscarawas River / Muskingum Watershed Conservancy District floodplain; keep data halls and the power island out of the 100-year floodplain or design for it.' },
      { id: 'env-cultural', title: 'Archaeological & historic survey', critical: false, lead: 'Cultural-resources consultant / Ohio SHPO', time: '2–4 months',
        overview: 'A cultural-resources survey coordinated with the state, triggered when federal permits or OPSB review apply.',
        activities: [
          'Commission a Phase I archaeological / historic survey',
          'Coordinate with the Ohio SHPO',
          'Trigger Section 106 review where §404 permits or OPSB apply',
        ],
        detail: 'Commission a Phase I archaeological and historic-resources survey coordinated with the Ohio History Connection State Historic Preservation Office (SHPO), triggered under Section 106 where federal permits (§404) or OPSB review apply.' },
    ],
  },
  {
    key: 'geo', title: 'Geotechnical & Site Conditions',
    blurb: 'Confirm the site can support heavy structures.',
    items: [
      { id: 'geo-borings', title: 'Conduct a geotechnical investigation', critical: true, lead: 'Geotechnical engineer', time: '1–2 months',
        overview: 'Test the subsurface to confirm it can support heavy data-hall and turbine foundations.',
        activities: [
          'Drill soil borings across the footprint',
          'Test bearing capacity for heavy foundations',
          'Use results to size and price foundations',
        ],
        detail: 'Drill soil borings and test bearing capacity for heavy data-hall and turbine foundations. Glaciated and Appalachian-plateau soils, fill and shallow bedrock vary widely across eastern Ohio and drive foundation cost.' },
      { id: 'geo-mine', title: 'Assess mine-subsidence and karst risk', critical: false, lead: 'Geotech / ODNR', time: '1–2 months',
        overview: 'Combine the mine maps with borings to evaluate subsidence risk and price any mitigation.',
        activities: [
          'Overlay abandoned-mine maps with boring data',
          'Assess undermining, subsidence and karst risk',
          'Price mitigation (grouting, deep foundations)',
        ],
        detail: 'Pair the abandoned-mine maps with borings to assess undermining, subsidence and any karst, then price mitigation (grouting, deep foundations) before a buyer’s engineers raise it.' },
      { id: 'geo-topo', title: 'Topographic survey and grading concept', critical: false, lead: 'Civil engineer / surveyor', time: '1–2 months',
        overview: 'Map the terrain and estimate the earthwork required to create large, level pads.',
        activities: [
          'Produce a topo / LiDAR base map',
          'Develop a cut-and-fill mass-grading concept',
          'Estimate earthwork volume for flat pads',
        ],
        detail: 'Produce a topo/LiDAR base and a cut-and-fill mass-grading concept for large, flat pads on rolling terrain. Earthwork volume is one of the first questions a buyer’s site team will ask.' },
    ],
  },
  {
    key: 'water', title: 'Water, Wastewater & Stormwater',
    blurb: 'Secure cooling water and a way to discharge it — increasingly the gating utility.',
    items: [
      { id: 'water-supply', title: 'Secure a water supply', critical: true, lead: 'Water engineer / ODNR', time: '2–4 months',
        overview: 'Quantify cooling-water demand and secure both a source and the permit to withdraw it.',
        activities: [
          'Quantify cooling and make-up water demand',
          'Secure a source (municipal, river intake or wells)',
          'Register/permit withdrawals over 100,000 gpd (ORC Ch. 1521)',
        ],
        detail: 'Quantify cooling and make-up water demand and secure a source (municipal, Tuscarawas River intake, or wells). A withdrawal over 100,000 gpd requires Ohio water-withdrawal registration/permitting (ORC Ch. 1521); the site sits in the Ohio River / Muskingum basin, outside the Great Lakes Compact.' },
      { id: 'water-discharge', title: 'Plan wastewater discharge', critical: false, lead: 'Env. engineer / Ohio EPA', time: '3–6 months',
        overview: 'Establish a permitted route for cooling blowdown and process water.',
        activities: [
          'Determine if blowdown / process water is discharged',
          'Get an Ohio EPA NPDES permit, or',
          'Negotiate sewer service and pretreatment with a local plant',
        ],
        detail: 'If cooling blowdown or process water is discharged, obtain an Ohio EPA NPDES permit, or negotiate sewer service and industrial pretreatment with a local POTW.' },
      { id: 'water-sanitary', title: 'Plan potable water and sewer service', critical: false, lead: 'Civil engineer', time: '1–2 months',
        overview: 'Plan drinking water and sanitary sewer sized for the full campus.',
        activities: [
          'Extend service from Bolivar/Strasburg or the county, or design on-site systems',
          'Size for full campus build-out',
        ],
        detail: 'Plan potable supply and sanitary sewer — extend service from Bolivar/Strasburg or the county, or design on-site systems — sized for the full campus build-out.' },
      { id: 'water-storm', title: 'Stormwater plan and construction permit', critical: false, lead: 'Civil engineer / Ohio EPA', time: '1–2 months',
        overview: 'Obtain the construction stormwater permit and plan for runoff from large paved areas.',
        activities: [
          'Obtain Ohio EPA’s NPDES Construction General Permit (>1 acre disturbed)',
          'Prepare a SWPPP',
          'Add post-construction controls and detention for paved areas',
        ],
        detail: 'For more than one acre of disturbance, obtain Ohio EPA’s NPDES Construction General Permit and prepare a SWPPP plus post-construction stormwater controls; large impervious areas require detention.' },
    ],
  },
  {
    key: 'util', title: 'Utility Interconnection & Air',
    blurb: 'Power, gas and air permits — the longest outside lead times after OPSB.',
    items: [
      { id: 'util-load', title: 'Initiate the AEP Ohio load study', critical: true, lead: 'AEP Ohio (Ohio Power) / power consultant', time: '3–9 months',
        overview: 'Enter the utility’s queue early for large-load and standby service — queue position can make or break the timeline.',
        activities: [
          'Engage AEP Ohio on a large-load and standby-service study',
          'Lock in a queue position',
          'Get a credible utility letter for buyers',
        ],
        detail: 'Engage AEP Ohio early on a large-load and standby/backup service study. Queue position and timeline for a campus of this size are make-or-break, and a credible utility letter is exactly what a hyperscaler wants to see.' },
      { id: 'util-pjm', title: 'File the grid interconnection request (if applicable)', critical: false, lead: 'Interconnection counsel / PJM', time: '12+ months',
        overview: 'If tying to the grid for backup or export, file with PJM and track the study queue.',
        activities: [
          'File the PJM interconnection request',
          'Track the study queue',
          'Plan around a 12+ month timeline',
        ],
        detail: 'If interconnecting to PJM for backup, standby or export, file the interconnection request and track the study queue — a major schedule driver even for a behind-the-meter plant.' },
      { id: 'util-gas', title: 'Establish the Nexus gas interconnect', critical: true, lead: 'Midstream counsel / Nexus', time: '3–9 months',
        overview: 'Negotiate a tap and firm gas transportation on the adjacent Nexus pipeline to fuel the plant.',
        activities: [
          'Negotiate a tap/interconnect and firm transportation',
          'Confirm pressure, volume and metering',
          'Document deliverability as a selling point',
        ],
        detail: 'Negotiate a tap/interconnect and firm transportation with the adjacent Nexus pipeline (and any gathering) for the on-site plant; confirm pressure, volume and metering. The pipeline adjacency is a headline selling point — document deliverability.' },
      { id: 'util-air', title: 'Obtain the turbine air permit', critical: true, lead: 'Air consultant / Ohio EPA DAPC', time: '9–12+ months',
        overview: 'Secure the Ohio EPA permit to construct the gas turbines — a long-lead item that moves alongside OPSB.',
        activities: [
          'Apply for an Ohio EPA Permit-to-Install',
          'Plan for PSD review and Best Available Control Technology',
          'Expect Title V; keep it in lockstep with OPSB',
        ],
        detail: 'Obtain an Ohio EPA Permit-to-Install for the turbines. A ~500 MW combined-cycle plant is a PSD major source requiring Best Available Control Technology and likely Title V — a long-lead item that must move in lockstep with OPSB.' },
      { id: 'util-fiber', title: 'Confirm fiber connectivity', critical: false, lead: 'Telecom broker', time: '1–2 months',
        overview: 'Confirm that redundant, diverse fiber can reach the site — a firm requirement for any hyperscaler.',
        activities: [
          'Map long-haul and dark-fiber routes',
          'Confirm carrier access to the site',
          'Ensure redundant, diverse paths',
        ],
        detail: 'Map long-haul and dark-fiber routes and carrier access to the site. Redundant, diverse fiber is a hard requirement for any hyperscaler and a fast disqualifier if absent.' },
    ],
  },
  {
    key: 'pkg', title: 'Incentives & Buyer Diligence Package',
    blurb: 'Package the de-risked site so a buyer can underwrite it in weeks.',
    items: [
      { id: 'pkg-tax', title: 'Pursue the data-center tax exemption', critical: false, lead: 'Incentives counsel / JobsOhio', time: '2–4 months',
        overview: 'Secure Ohio’s sales-tax exemption on data-center equipment — a headline incentive buyers expect.',
        activities: [
          'Apply for the Ohio data-center sales-and-use tax exemption',
          'Work through the Ohio Tax Credit Authority / Development',
          'Have it on the table for buyers',
        ],
        detail: 'Pursue the Ohio data-center sales-and-use tax exemption on qualifying equipment (Ohio Tax Credit Authority / Development) — a headline incentive hyperscalers expect to be on the table.' },
      { id: 'pkg-local', title: 'Structure local tax abatements', critical: false, lead: 'Counsel / County Economic Development', time: '3–6 months',
        overview: 'Establish local property-tax incentives with the county, township and school districts.',
        activities: [
          'Structure a CRA, Enterprise Zone, TIF or PILOT',
          'Engage the county and township',
          'Bring the school districts in early — essential in Ohio',
        ],
        detail: 'Structure local property-tax tools — Community Reinvestment Area, Enterprise Zone, TIF or a PILOT — with the county, township and school districts. School-board engagement is essential in Ohio for any meaningful abatement.' },
      { id: 'pkg-jobsohio', title: 'Engage JobsOhio and Team NEO', critical: false, lead: 'Developer / JobsOhio', time: 'Ongoing',
        overview: 'Engage the state and regional economic-development partners for support and buyer introductions.',
        activities: [
          'Engage JobsOhio and Team NEO',
          'Pursue site-readiness grants and infrastructure support',
          'Get warm introductions to end users and site selectors',
        ],
        detail: 'Engage JobsOhio and the regional partner Team NEO for site-readiness grants, infrastructure support and warm introductions to end users and their site-selection consultants.' },
      { id: 'pkg-siteready', title: 'Pursue shovel-ready site certification', critical: false, lead: 'Developer / JobsOhio', time: '3–6 months',
        overview: 'Obtain a third-party authenticated-site certification that signals to buyers diligence is complete.',
        activities: [
          'Pursue SiteOhio (or similar) certification',
          'Complete the required diligence package',
          'Use the stamp to compress buyer evaluation time',
        ],
        detail: 'Pursue authenticated-site certification (e.g., SiteOhio) — a third-party stamp that diligence is complete and the site is shovel-ready is exactly what compresses a buyer’s evaluation timeline.' },
      { id: 'pkg-dataroom', title: 'Assemble the buyer data room', critical: true, lead: 'Developer', time: '1–2 months',
        overview: 'Compile everything above into one organized data room and site book a buyer can underwrite quickly.',
        activities: [
          'Compile survey, title, mineral, environmental, geotech, utility and zoning records',
          'Organize a clean data room',
          'Write a one-stop site book / offering memorandum',
        ],
        detail: 'Compile everything above — survey, title, mineral resolution, environmental, geotech, utility and gas letters, zoning and OPSB status — into an organized data room and a one-stop site book / offering memorandum a hyperscaler’s real-estate team can underwrite.' },
    ],
  },
];

const CHECKLIST_KEY = 'lantern.checklist.v1';
let checklistBuilt = false;

function loadChecklistState() {
  try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveChecklistState(state) {
  try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

function renderChecklist() {
  if (checklistBuilt) return;
  const root = document.getElementById('clCategories');
  if (!root) return;
  const state = loadChecklistState();
  const esc = escapeHtmlSimple;

  // Legend — just the one flag we still use.
  const legendEl = document.getElementById('clLegend');
  if (legendEl) {
    legendEl.innerHTML = `<span class="cl-legend-item"><span class="cl-dot cl-dot--crit"></span>Critical path — longest lead time, start these first</span>`;
  }

  // Categories
  root.innerHTML = CHECKLIST.map((cat, i) => {
    const items = cat.items.map(it => {
      const checked = state[it.id] ? 'checked' : '';
      const doneCls = state[it.id] ? ' is-done' : '';
      const crit = it.critical ? `<span class="cl-flag">Critical path</span>` : '';
      const acts = (it.activities || []).map(a => `<li>${esc(a)}</li>`).join('');
      return `
        <li class="cl-item${doneCls}" data-id="${it.id}">
          <label class="cl-check">
            <input type="checkbox" data-cl="${it.id}" ${checked} aria-label="${esc(it.title)}" />
            <span class="cl-check-box" aria-hidden="true"></span>
          </label>
          <div class="cl-item-body">
            <div class="cl-item-head">
              <span class="cl-item-title">${esc(it.title)}</span>
              ${crit}
            </div>
            <p class="cl-item-overview">${esc(it.overview)}</p>
            <button class="cl-item-toggle" type="button" aria-expanded="false">
              <span class="cl-item-toggle-caret" aria-hidden="true">▾</span>What it takes
            </button>
            <div class="cl-item-detail" hidden>
              <ul class="cl-activities">${acts}</ul>
              ${it.detail ? `<p class="cl-item-note">${esc(it.detail)}</p>` : ''}
              <div class="cl-item-meta"><span><strong>Lead:</strong> ${esc(it.lead)}</span><span><strong>Typical timeline:</strong> ${esc(it.time)}</span></div>
            </div>
          </div>
        </li>`;
    }).join('');
    return `
      <section class="cl-cat" id="cl-cat-${cat.key}">
        <button class="cl-cat-head" type="button" aria-expanded="true" data-key="${cat.key}">
          <span class="cl-cat-index">${String(i + 1).padStart(2, '0')}</span>
          <span class="cl-cat-titles">
            <span class="cl-cat-title">${esc(cat.title)}</span>
            <span class="cl-cat-blurb">${esc(cat.blurb)}</span>
          </span>
          <span class="cl-cat-progress">
            <span class="cl-cat-count" id="cl-cat-count-${cat.key}">0/${cat.items.length}</span>
            <span class="cl-catbar"><span class="cl-catbar-fill" id="cl-catbar-${cat.key}"></span></span>
          </span>
          <span class="cl-cat-caret" aria-hidden="true">▾</span>
        </button>
        <ul class="cl-item-list">${items}</ul>
      </section>`;
  }).join('');

  // Checkbox changes
  root.querySelectorAll('input[data-cl]').forEach(box => {
    box.addEventListener('change', e => {
      const id = e.target.dataset.cl;
      const st = loadChecklistState();
      if (e.target.checked) st[id] = true; else delete st[id];
      saveChecklistState(st);
      e.target.closest('.cl-item')?.classList.toggle('is-done', e.target.checked);
      updateChecklistProgress();
    });
  });

  // Category collapse/expand
  root.querySelectorAll('.cl-cat-head').forEach(head => {
    head.addEventListener('click', () => {
      const cat = head.closest('.cl-cat');
      const collapsed = cat.classList.toggle('is-collapsed');
      head.setAttribute('aria-expanded', String(!collapsed));
      syncExpandAllLabel();
    });
  });

  // Per-item "What it takes" detail expander
  root.querySelectorAll('.cl-item-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.cl-item');
      const detail = item?.querySelector('.cl-item-detail');
      const open = item.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      if (detail) detail.hidden = !open;
    });
  });

  bindChecklistControls();
  updateChecklistProgress();
  checklistBuilt = true;
}

function updateChecklistProgress() {
  const state = loadChecklistState();
  let total = 0, done = 0, critTotal = 0, critDone = 0;
  CHECKLIST.forEach(cat => {
    let cDone = 0;
    cat.items.forEach(it => {
      total++;
      if (it.critical) critTotal++;
      if (state[it.id]) { done++; cDone++; if (it.critical) critDone++; }
    });
    const pct = cat.items.length ? Math.round(cDone / cat.items.length * 100) : 0;
    const countEl = document.getElementById('cl-cat-count-' + cat.key);
    if (countEl) countEl.textContent = `${cDone}/${cat.items.length}`;
    const barEl = document.getElementById('cl-catbar-' + cat.key);
    if (barEl) barEl.style.width = pct + '%';
  });
  const pct = total ? Math.round(done / total * 100) : 0;
  const pctEl = document.getElementById('clPct'); if (pctEl) pctEl.textContent = pct + '%';
  const fillEl = document.getElementById('clOverallFill'); if (fillEl) fillEl.style.width = pct + '%';
  const doneEl = document.getElementById('clDoneCount'); if (doneEl) doneEl.textContent = `${done} of ${total}`;
  const critEl = document.getElementById('clCritCount'); if (critEl) critEl.textContent = `${critDone} of ${critTotal}`;
}

function syncExpandAllLabel() {
  const btn = document.getElementById('clExpandAll');
  if (!btn) return;
  const anyOpen = [...document.querySelectorAll('.cl-cat')].some(c => !c.classList.contains('is-collapsed'));
  btn.textContent = anyOpen ? 'Collapse all' : 'Expand all';
}

function bindChecklistControls() {
  const expandBtn = document.getElementById('clExpandAll');
  if (expandBtn && expandBtn.dataset.bound !== '1') {
    expandBtn.addEventListener('click', () => {
      const cats = [...document.querySelectorAll('.cl-cat')];
      const anyOpen = cats.some(c => !c.classList.contains('is-collapsed'));
      cats.forEach(c => {
        c.classList.toggle('is-collapsed', anyOpen);
        c.querySelector('.cl-cat-head')?.setAttribute('aria-expanded', String(!anyOpen));
      });
      syncExpandAllLabel();
    });
    expandBtn.dataset.bound = '1';
  }
  const resetBtn = document.getElementById('clReset');
  if (resetBtn && resetBtn.dataset.bound !== '1') {
    resetBtn.addEventListener('click', () => {
      saveChecklistState({});
      document.querySelectorAll('#clCategories input[data-cl]').forEach(b => { b.checked = false; });
      document.querySelectorAll('#clCategories .cl-item').forEach(li => li.classList.remove('is-done'));
      updateChecklistProgress();
    });
    resetBtn.dataset.bound = '1';
  }
}

// ===========================================================
// Go-to-Market canvas — dynamic buyer / lease / positioning tool.
// Four toggles (campus size, product, power model, build plan) drive
// everything downstream: the pitch, the headline metrics, the ranked
// buyer shortlist, and the channel call.
// ===========================================================
const GTM_STATE = { size: 100, product: 'shell', power: 'btm-gas', phasing: 'single', built: false };

// Buyer universe. min/max = the single-deal MW range a buyer realistically
// engages on; gas = tolerance for an on-site gas power island
// (high = a selling point, low = carbon-sensitive). 2025–26 market read.
const GTM_BUYERS = [
  { name: 'Microsoft (Azure)', tier: 'Hyperscaler', min: 250, max: 1000, gas: 'med',
    wants: 'Scale and expandability; pragmatic on gas with a carbon-offset or CCS path.' },
  { name: 'Amazon (AWS)', tier: 'Hyperscaler', min: 250, max: 1000, gas: 'med',
    wants: 'Multi-hundred-MW phases; nuclear- and gas-pragmatic when speed demands it.' },
  { name: 'Google Cloud', tier: 'Hyperscaler', min: 250, max: 1000, gas: 'low',
    wants: '24/7 carbon-free-energy goal — gas is a hard sell without clean firming.' },
  { name: 'Meta', tier: 'Hyperscaler', min: 500, max: 1000, gas: 'high',
    wants: 'GW-scale AI buildout; has embraced on-site gas to move fast.' },
  { name: 'Oracle (OCI / Stargate)', tier: 'Hyperscaler', min: 250, max: 1000, gas: 'high',
    wants: 'Aggressive and speed-first; highly gas-tolerant for AI capacity.' },
  { name: 'OpenAI / Stargate', tier: 'Hyperscaler', min: 500, max: 1000, gas: 'high',
    wants: 'GW-scale and speed-obsessed; fuel-agnostic if it powers up fast.' },
  { name: 'Crusoe', tier: 'Neocloud', min: 100, max: 500, gas: 'high',
    wants: 'Built on behind-the-meter gas — your fuel story is their entire model.' },
  { name: 'CoreWeave', tier: 'Neocloud', min: 50, max: 500, gas: 'high',
    wants: 'Speed-to-power above all; takes whatever energizes GPUs first.' },
  { name: 'Nebius', tier: 'Neocloud', min: 50, max: 300, gas: 'high',
    wants: 'Rapid GPU-cloud expansion; flexible on power source.' },
  { name: 'Lambda', tier: 'Neocloud', min: 20, max: 150, gas: 'high',
    wants: 'GPU cloud; smaller, fast deployments and gas-friendly.' },
  { name: 'Nscale', tier: 'Neocloud', min: 50, max: 250, gas: 'high',
    wants: 'AI-native, power-hungry and speed-driven.' },
  { name: 'QTS (Blackstone)', tier: 'Hyperscale colo', min: 100, max: 500, gas: 'med',
    wants: 'Builds large shells and leases to the megacaps; power-led siting.' },
  { name: 'Vantage', tier: 'Hyperscale colo', min: 100, max: 500, gas: 'med',
    wants: 'Large campuses for hyperscale tenants; follows the power.' },
  { name: 'Switch', tier: 'Hyperscale colo', min: 100, max: 300, gas: 'med',
    wants: 'Big campuses; sustainability brand but pragmatic on firm power.' },
  { name: 'Digital Realty', tier: 'Colocation', min: 50, max: 250, gas: 'med',
    wants: 'Global colo platform; carbon goals but takes firm power.' },
  { name: 'Equinix', tier: 'Colocation', min: 20, max: 150, gas: 'low',
    wants: 'Interconnection-led with a strong sustainability posture.' },
  { name: 'TeraWulf / IREN / Cipher', tier: 'Crypto → HPC', min: 50, max: 250, gas: 'high',
    wants: 'Power-first miners pivoting to AI hosting — love cheap on-site gas.' },
  { name: 'Enterprise / regional cloud', tier: 'Enterprise', min: 10, max: 50, gas: 'med',
    wants: 'Single-tenant enterprise AI or regional colo; smaller footprints.' },
];

const GTM_PRODUCTS = {
  land:    { label: 'Powered land',  short: 'powered-land',           term: '20–50 yrs', leasePerMW: 0.18 },
  shell:   { label: 'Powered shell', short: 'powered-shell',          term: '15–20 yrs', leasePerMW: 0.85 },
  turnkey: { label: 'Turnkey lease', short: 'turnkey build-to-suit',  term: '15–20 yrs', leasePerMW: 1.45 },
  colo:    { label: 'Colocation',    short: 'colocation',             term: '3–10 yrs',  leasePerMW: 1.90 },
};
const GTM_POWER = {
  'btm-gas':    { label: 'Behind-the-meter gas', speed: '18–30 mo', value: 'speed-to-power and fuel security' },
  'hybrid':     { label: 'Grid + gas hybrid',    speed: '24–42 mo', value: 'resilience and a credible carbon path' },
  'grid-renew': { label: 'Grid + renewables',    speed: '48–84 mo', value: 'clean, firm power and ESG fit' },
};
const GTM_PHASED_CEILING = 1000; // master-plan scale the assemblage can carry

function gtmSizeLabel(mw) { return mw >= 1000 ? (mw / 1000) + ' GW' : mw + ' MW'; }
function gtmFacilityMW(mw) { return Math.round(mw * 1.25); }            // PUE ~1.25
function gtmGasMMcfd(mw) { return mw * 1.25 * 0.1748; }                 // ~0.175 MMcf/d per facility-MW
function gtmWells(mw) { return Math.ceil(gtmGasMMcfd(mw) / 0.9); }      // ~0.9 MMcf/d/well near site

// Fit for one buyer at the current state. Returns null if not a target.
function gtmFit(b, s) {
  const inRange = s.size >= b.min && s.size <= b.max;
  const phaseFit = s.phasing === 'phased' && b.min > s.size && b.min <= GTM_PHASED_CEILING && b.max >= s.size;
  if (!inRange && !phaseFit) return null;
  let score = inRange ? 2 : 1;
  const notes = [];
  if (phaseFit) notes.push('Engages via the phased master plan');
  if (s.power === 'btm-gas') {
    if (b.gas === 'high') { score += 1; notes.push('On-site gas is a selling point'); }
    else if (b.gas === 'low') { score -= 1; notes.push('Carbon-sensitive — needs a CCS / offset story'); }
  } else if (s.power === 'grid-renew') {
    if (b.gas === 'low') { score += 1; notes.push('Clean-power posture fits their carbon goals'); }
    else notes.push('Gas speed advantage is muted in this model');
  } else if (b.gas === 'low') {
    notes.push('Cleaner blend softens the carbon objection');
  }
  return { stars: Math.max(1, Math.min(3, score)), raw: score, notes };
}

function renderGtm() {
  if (!document.getElementById('gtmControls')) return;
  if (!GTM_STATE.built) { bindGtmControls(); GTM_STATE.built = true; }
  gtmRender();
}

function bindGtmControls() {
  document.querySelectorAll('#gtmControls .gtm-seg').forEach(seg => {
    const group = seg.dataset.group;
    seg.querySelectorAll('.gtm-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        seg.querySelectorAll('.gtm-seg-btn').forEach(x => x.classList.toggle('active', x === btn));
        GTM_STATE[group] = (group === 'size') ? Number(btn.dataset.val) : btn.dataset.val;
        gtmRender();
      });
    });
  });
}

function gtmRender() {
  gtmRenderPitch();
  gtmRenderMetrics();
  gtmRenderBuyers();
  gtmRenderApproach();
}

function gtmMatches(s) {
  return GTM_BUYERS.map(b => ({ b, f: gtmFit(b, s) })).filter(x => x.f);
}

function gtmRenderPitch() {
  const el = document.getElementById('gtmPitch');
  if (!el) return;
  const s = GTM_STATE, prod = GTM_PRODUCTS[s.product], pow = GTM_POWER[s.power];
  const matches = gtmMatches(s);
  const tierCount = {};
  matches.forEach(m => { tierCount[m.b.tier] = (tierCount[m.b.tier] || 0) + 1; });
  const topTiers = Object.entries(tierCount).sort((a, b) => b[1] - a[1]).slice(0, 2).map(t => t[0]);
  el.innerHTML = `
    <div class="gtm-pitch-tag">The pitch</div>
    <p class="gtm-pitch-line">A <strong>${gtmSizeLabel(s.size)}</strong> ${escapeHtmlSimple(prod.short)} campus on the Bolivar site${s.phasing === 'phased' ? ', master-planned to ~1 GW,' : ''} powered by <strong>${escapeHtmlSimple(pow.label.toLowerCase())}</strong> and deliverable in <strong>~${pow.speed}</strong> — taken to ${topTiers.length ? escapeHtmlSimple(topTiers.join(' and ').toLowerCase()) + ' buyers' : 'the buyers'} who prize <strong>${escapeHtmlSimple(pow.value)}</strong>.</p>`;
}

function gtmRenderMetrics() {
  const el = document.getElementById('gtmMetrics');
  if (!el) return;
  const s = GTM_STATE, prod = GTM_PRODUCTS[s.product], pow = GTM_POWER[s.power];
  const gas = gtmGasMMcfd(s.size);
  const leaseLo = s.size * prod.leasePerMW * 0.8, leaseHi = s.size * prod.leasePerMW * 1.25;
  const fmtM = v => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'B' : '$' + Math.round(v) + 'M';
  const cards = [
    { label: 'IT load', value: gtmSizeLabel(s.size), sub: `~${gtmFacilityMW(s.size)} MW total facility (PUE 1.25)` },
    { label: 'On-site gas burn', value: gas.toFixed(0) + ' MMcf/d', sub: `~${(gas * 365 / 1000).toFixed(1)} Bcf/yr at full load` },
    { label: 'Wells to sustain', value: '~' + gtmWells(s.size), sub: 'producing near site, before decline + infill' },
    { label: 'Speed to power', value: pow.speed, sub: pow.label },
    { label: 'Lease term', value: prod.term, sub: prod.label },
    { label: 'Indicative lease value', value: `${fmtM(leaseLo)}–${fmtM(leaseHi)}/yr`, sub: 'stabilized · illustrative only' },
    { label: 'Buyers in play', value: String(gtmMatches(s).length), sub: 'matching the current filters' },
  ];
  el.innerHTML = cards.map(c => `
    <div class="gtm-metric">
      <div class="gtm-metric-label">${c.label}</div>
      <div class="gtm-metric-value">${c.value}</div>
      <div class="gtm-metric-sub">${c.sub}</div>
    </div>`).join('');
}

function gtmRenderBuyers() {
  const el = document.getElementById('gtmBuyers');
  const countEl = document.getElementById('gtmBuyerCount');
  if (!el) return;
  const scored = gtmMatches(GTM_STATE).sort((a, b) => b.f.raw - a.f.raw || a.b.min - b.b.min);
  if (countEl) countEl.textContent = `· ${scored.length} target${scored.length === 1 ? '' : 's'}`;
  if (!scored.length) {
    el.innerHTML = `<div class="gtm-buyer-empty">No clean buyer match at this configuration — widen the size or switch to a phased master plan to reach the larger players.</div>`;
    return;
  }
  const star = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  el.innerHTML = scored.map(({ b, f }) => {
    const deal = gtmSizeLabel(b.min) + '–' + gtmSizeLabel(b.max);
    const notes = f.notes.map(n => `<li>${escapeHtmlSimple(n)}</li>`).join('');
    return `
      <div class="gtm-buyer gtm-buyer--s${f.stars}">
        <div class="gtm-buyer-top">
          <span class="gtm-buyer-name">${escapeHtmlSimple(b.name)}</span>
          <span class="gtm-buyer-stars" title="${f.stars} of 3 fit">${star(f.stars)}</span>
        </div>
        <div class="gtm-buyer-meta"><span class="gtm-buyer-tier">${escapeHtmlSimple(b.tier)}</span><span class="gtm-buyer-deal">${deal}</span></div>
        <p class="gtm-buyer-wants">${escapeHtmlSimple(b.wants)}</p>
        ${notes ? `<ul class="gtm-buyer-notes">${notes}</ul>` : ''}
      </div>`;
  }).join('');
}

function gtmRenderApproach() {
  const el = document.getElementById('gtmApproach');
  if (!el) return;
  const s = GTM_STATE;
  const tiers = new Set(gtmMatches(s).map(m => m.b.tier));
  let channel;
  if (tiers.has('Hyperscaler') || tiers.has('Hyperscale colo')) {
    channel = 'Data-center site-selection advisors (JLL, CBRE, Cushman, Newmark) plus hyperscaler land + energy teams direct.';
  } else if (tiers.has('Neocloud') || tiers.has('Crypto → HPC')) {
    channel = 'Direct to neocloud and crypto-to-HPC real-estate teams, plus power-developer / IPP partners who can co-bid the gas plant.';
  } else {
    channel = 'Regional brokers, JobsOhio / Team NEO, and direct enterprise outreach.';
  }
  const pillars = [
    { h: 'Speed to power', p: `Behind-the-meter gas skips the multi-year interconnection queue — energized in ~${GTM_POWER[s.power].speed}, the scarcest commodity in the AI buildout.` },
    { h: 'Shovel-ready & de-risked', p: 'The Land Readiness Checklist and data room show clean control, a buildable footprint and entitlements already in motion.' },
    { h: 'Fuel-secure', p: 'A captive Utica position plus the adjacent Nexus pipeline back the gas thesis with both on-site wells and firm transport.' },
    { h: 'Scalable', p: 'A ~3,000-acre assemblage supports phasing from a first 100 MW to a ~1 GW master plan without re-siting.' },
    { h: 'Incentive-rich', p: 'Ohio’s data-center sales-tax exemption plus local abatements and JobsOhio support sharpen the all-in cost.' },
  ];
  const steps = [
    { n: '01', h: 'Package', p: 'Finish the site book, data room and this model into one underwriteable story (ties to the Land Checklist).' },
    { n: '02', h: 'Tease', p: 'Anonymous one-page teaser to the advisor channel and target tenants — power, speed, acreage, fuel.' },
    { n: '03', h: 'Target', p: 'Matched outreach to the shortlist above, sequenced by fit and the active power model.' },
    { n: '04', h: 'Convert', p: 'LOI → diligence against the data room → lease, ground lease or JV with a power partner.' },
  ];
  el.innerHTML = `
    <div class="gtm-pillars">
      ${pillars.map(p => `<div class="gtm-pillar"><div class="gtm-pillar-h">${escapeHtmlSimple(p.h)}</div><p>${escapeHtmlSimple(p.p)}</p></div>`).join('')}
    </div>
    <div class="gtm-channel"><span class="gtm-channel-tag">Primary channel now</span><p>${escapeHtmlSimple(channel)}</p></div>
    <div class="gtm-steps">
      ${steps.map(st => `<div class="gtm-step"><span class="gtm-step-n">${st.n}</span><div class="gtm-step-body"><div class="gtm-step-h">${escapeHtmlSimple(st.h)}</div><p>${escapeHtmlSimple(st.p)}</p></div></div>`).join('')}
    </div>`;
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
