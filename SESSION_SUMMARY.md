# Project Lantern — Session Summary

**Dates:** June 2–3, 2026
**App:** Project Lantern · Ohio Site Development (Tuscarawas County behind‑the‑meter, gas‑fired data‑center thesis)
**Live site:** https://mferry1295.github.io/ohio-site-development/
**Repo:** https://github.com/mferry1295/ohio-site-development (deploys from `main` via GitHub Pages)
**Stack:** static site — `index.html`, `app.js`, `styles.css`, plus data files; Leaflet for maps, Chart.js for charts.

---

## At a glance

| # | Work | Tab | Status |
|---|------|-----|--------|
| 1 | Power Ramp: input tooltips + optional grid‑supply blend | Power Ramp | ✅ Production |
| 2 | Field Map: top threshold filter bar → pins + detail table | Field Map | ✅ Production |
| 3 | Excel export of the Field Map well dataset | — (file) | 📄 Local file |
| 4 | Land Readiness Checklist (Tuscarawas‑specific) | Land Checklist | ✅ Production |
| 5 | Cache‑busting version fix (stale `app.js`) | — | ✅ Production |
| 6 | Parcel Map: Krizman + Wilkshire Hills holdings | Parcel Map | ✅ Production |
| 7 | Krizman vertical wells overlay on the Parcel Map | Parcel Map | ✅ Production |
| 8 | Productivity Map: well‑level productivity (dots + area grid) | Productivity Map | 🟡 Preview only |
| — | Research: data/seismic resources for siting drilling | — | 💬 Discussion |

Tabs now: **Project Overview · Dashboard · Field Map · Productivity Map · Parcel Map · Power Ramp · Land Checklist · Oil and Gas Primer**

---

## 1. Power Ramp — input tooltips + grid‑supply blend

**Tooltips.** Added an "i" info icon (hover/focus popover, reusing the dashboard tooltip system) to all 8 *Configure Scenario* inputs — plant capacity, heat rate, capacity factor, project horizon, per‑well IP30, hyperbolic b, initial decline Di, D&C cost/well — each explaining what it is and why it matters.

**Optional grid‑supply blend.** A toggle + inputs to model serving part of the data‑center load from the **utility grid** instead of the on‑site gas plant:
- Inputs: grid supply (MW), From year / To year window, profile (**Flat** = constant MW, or **Taper** = fades to zero across the window as wells ramp).
- Effect: each grid‑MW reduces the gas the wells must hold that year → thinner drilling program during the window, with a visible "hand‑back" drilling bump when the window closes.
- Visuals: a steel‑blue **grid band** stacked on the deliverability chart up to the flat full‑plant‑burn line; a **Grid supply (MW)** column in the cadence table; grid‑aware KPI sub‑lines. Off by default.

---

## 2. Field Map — threshold filter bar

Reworked the Field Map from a click‑a‑county‑first view into a **global, filter‑driven** view over all **3,798** producing horizontal Utica wells:
- **Filters:** County, Operator, First‑prod‑year (min/max), **Gas/day (MMcf/d)** min/max, **Oil/day (bbl/d)** min/max, include‑unknown‑year toggle, reset, and a live "*X of 3,798 wells*" count.
- **Map** pins reflect the active filters (clustered, across all counties); county click still zooms + scopes + shows operator detail.
- **Detail table** below: Well, Operator, County, Township, First Prod., Oil bbl/d, Gas MMcf/d, 2025 Gas (MMcf), 2025 Oil (bbl) — sortable on every column, capped at 500 rows with a refine‑to‑focus note.
- Right‑hand aside shows a live filtered‑results summary (totals, avg gas/day, top operators).

---

## 3. Excel export — `Field_Map_Wells_2025.xlsx`

A 3‑sheet workbook built from the Field Map dataset (ODNR 2025 horizontal‑well filings):
- **Wells** — all 3,798 wells with API, name, operator, county, township, first‑prod year, lat/long, 2025 oil/gas, days, and derived oil/day, gas/day, gas‑equivalent (Mcfe). Frozen header + autofilter.
- **County Summary** — 18 producing counties ranked by Mcfe (reconciles exactly to the choropleth totals).
- **Notes** — data dictionary, source, conventions (Mcfe = gas + oil × 5.659; per‑producing‑day rates).
- Headline: **48.1 MM bbl oil · 2.08 Tcf gas · 2.35 Bcfe**, 3,798 wells. Saved as a local file (not committed to the repo).

---

## 4. Land Readiness Checklist (Tuscarawas County)

Interactive site/land‑readiness checklist to de‑risk the Bolivar site before a hyperscaler will engage — **42 items across 9 categories, 18 flagged critical‑path**, each with a phase badge, description (what / why‑it‑matters / agency of record), lead, and timeline. Browser‑persisted progress (localStorage), overall + per‑category + critical‑path progress bars, jump‑to‑category TOC, collapse/expand, reset, and a planning‑aid disclaimer.

Categories: Site Control & Title · Mineral/Oil‑Gas/Coal Rights · Zoning & Local Land Use · State Power‑Plant Siting (OPSB) · Environmental & Cultural Clearance · Geotechnical · Water/Wastewater/Stormwater · Utility (AEP Ohio + Nexus) & Air · Incentives & Buyer Package.

Grounded in verified specifics: **township zoning (ORC Ch. 519)**, Tuscarawas County Regional Planning Commission, **OPSB certificate (ORC Ch. 4906, ≥50 MW, preempts local zoning)**, ODNR abandoned‑mine maps, USACE Huntington / Ohio EPA wetlands, USFWS bat windows, SHPO Section 106, Ohio water‑withdrawal permit (ORC 1521), **AEP Ohio** load study + **Nexus** gas, PSD/Title V air, and the Ohio data‑center sales‑tax exemption / JobsOhio.

---

## 5. Cache‑busting fix

The site versions its assets with a shared `?v=` query tag, but it had never been bumped across deploys — so browsers kept serving a **stale cached `app.js`** (new `index.html` sections rendered, but their JS never ran). Fixed by bumping the tag (`2026-05-01l → 2026-06-02a`) and re‑bumping on every subsequent deploy. **Going forward, the `?v=` tag must be bumped on any deploy that changes `app.js`/`styles.css`.**

Cache‑tag progression this session: `2026-05-01l → a → b → c → d → e → f`.

---

## 6. Parcel Map — Krizman + Wilkshire Hills holdings

New tab plotting the family land assemblage in Lawrence Twp (Bolivar / Wilkshire Hills), with real parcel **boundaries** pulled from the Tuscarawas County Auditor GIS:

| Owner umbrella | Parcels | Acres | Appraised |
|---|---|---|---|
| Krizman (entities + David Krizman) | 47 | 222.8 | $2.33M |
| Wilkshire Hills Holdings LLC* | 19 | 299.2 | $1.95M |
| **Combined** | **66** | **521.9** | **$4.28M** |

\* Same owner‑of‑record address as Krizman (310 Michigan St, Plymouth, IN) → treated as the same ownership umbrella.

Features: parcels **colored by owner** (Krizman red / Wilkshire teal) with an owner legend; Map/Aerial basemaps; click popups (ID, owner, address, acres, land use, appraised value); a synced sidebar list with **search** and **sort by Acres / Owner / Parcel ID / Address** plus a per‑row owner dot; summary stat cards + a land‑use‑by‑acreage bar (mostly agricultural).

---

## 7. Krizman vertical wells overlay

Overlaid the **10 vertical (producing) oil & gas wells** from the user's ODNR "Wells by Status" view (Company = Krizman Enterprises) as black dots on the Parcel Map, with a show/hide toggle and click popups (name, API, status, type, slant, operator). Coordinates pulled from ODNR by exact API number (matched the screenshot to 5 decimals).

> Caveat: ODNR's queryable layer still lists these under the *prior* operator (e.g., MKE Producing / Wayne Hammond), so filtering by "Krizman" wasn't possible there — the set is the 10 from the screenshot, and at least a few more exist (Krizman Enterprises #2, #3, #5). A full export would let us complete the set.

---

## 8. Productivity Map (🟡 preview only — not yet pushed)

A well‑level productivity map of all 3,798 ODNR wells (reuses the Field Map dataset). First built as a kernel‑density heatmap, then **reworked after feedback** that it looked like a blob:
- **Wells view (default):** graduated symbols — every well a dot **sized + colored by its rate**; big producers pop, no smearing; canvas‑rendered for smooth panning; clickable.
- **Area grid view:** ~2.5‑mile cells colored by **average** rate (well *quality*, not *density*) — the legible "best areas" heatmap.
- **Gas / Oil / Gas‑equivalent** toggle re‑weights both views; Map/Aerial basemaps; ★ marks the Project Lantern site; legend + stat cards (wells mapped, peak well, best counties by avg rate, near‑site window character).
- Removed the `leaflet-heat` dependency.

---

## Research — data/seismic resources for siting drilling (discussion)

Summarized where to find "best places to drill" data for Ohio:
- **Free:** ODNR Division of Geological Survey (Utica isopach/structure/thermal‑maturity maps, well locator, production DB); the **Utica "Geologic Play Book"** (WVGES/AONGRC — thermal maturity, TOC, thickness = the play windows); EIA Utica report.
- **Commercial analytics ("heatmaps"):** Enverus (DrillingInfo), Novi Labs (absorbed ShaleProfile — Q1 2026 report: "Utica becomes an oil play"), S&P Global, Rextag, TGS.
- **Seismic:** reflection 2D/3D is almost all proprietary (TGS, SEI, CGG, Fairfield, or the operator) — *ask Krizman/offset operators for logs or seismic on the acreage*; distinct from ODNR's OhioSeis induced‑seismicity (earthquake) monitoring, which matters for fault‑avoidance siting.

---

## Data files created this session

| File | Contents |
|---|---|
| `krizman_parcels.geojson` | 66 parcel polygons (Krizman + Wilkshire Hills), owner‑tagged, WGS84 |
| `krizman_wells.geojson` | 10 Krizman vertical wells (points), WGS84 |
| `Field_Map_Wells_2025.xlsx` | 3,798‑well dataset + county summary + notes (local file, not committed) |

## External data sources / GIS endpoints used

- **Tuscarawas County Auditor parcels:** `https://gis.co.tuscarawas.oh.us/arcgis/rest/services/PAT_Parcels/MapServer/0` (field `PARCEL_ID`, dashed format).
- **ODNR Div. of Oil & Gas wells:** `https://gis2.ohiodnr.gov/arcgis/rest/services/DOG_Services/Oilgas_Wells_10_JS_TEST/MapServer/0` (fields `API_WELLNO`, `CO_NAME`, `SLANT`, `WL_STATUS_DESC`, `WH_LAT/WH_LONG`).
- Field Map wells: existing `wells.json` (ODNR 2025 horizontal‑well quarterly filings).

---

## Deployment / commit log (this session, newest → oldest)

| Commit | Summary |
|---|---|
| _(uncommitted)_ | **Productivity Map** tab (in preview) |
| `a3811ff` | Parcel Map: overlay Krizman vertical wells as dots |
| `8e8680b` | Parcel Map: Krizman + Wilkshire Hills holdings, owner sort & coloring |
| `641154c` | Bump asset cache‑busting version (2026‑05‑01l → 2026‑06‑02a) |
| `fbf34a9` | Land Checklist: Tuscarawas County land‑readiness tab |
| `999ba95` | Field Map: threshold filter bar driving pins + detail table |
| `59435f7` | Power Ramp: behind‑the‑meter well‑curve tab with optional grid blend |

GitHub Pages auto‑builds from `main`; each push was verified built + live (cache‑busted) before moving on.

---

## Key analytical insights surfaced

- **The play windows, empirically:** best **gas** counties = Jefferson / Belmont / Harrison (eastern dry‑gas core); flip to **oil** and leaders become **Tuscarawas / Guernsey / Carroll** (western oil edge). Tuscarawas — the Lantern site county — is **#1 for oil**, not gas.
- **Near the site (~12 mi):** ~26 horizontal Utica wells averaging **~929 Mcf/d** gas at **~38% oil by BOE** vs the dry‑gas core's ~2,200–3,800 Mcf/d → the site sits on the **gas‑poor / oilier edge**. Peak gas well statewide ≈ **50,394 Mcf/d** (Jefferson).
- **Fuel thesis takeaway (recurring):** local wells make less gas per well, so the **Nexus firm‑transport blend** is what makes the behind‑the‑meter gas thesis robust — reflected in the Power Ramp grid‑blend lever and the Land Checklist critical path.
- **Land position:** the Krizman/Wilkshire umbrella controls ~522 surface acres; the longer pole for a captive‑fuel program is **net mineral acreage** (severed estates, existing leases), flagged in the checklist.

---

## Still open / follow‑ups

- **Push the Productivity Map** to production when ready (includes `app.js`/`index.html`/`styles.css`; cache tag already at `2026-06-02f`).
- **Complete the Krizman well set** if a full ODNR "Wells by Status" export (or layer URL) is available.
- Optional: track `Field_Map_Wells_2025.xlsx` in the repo if you want it versioned (currently a local artifact).
- Optional: automate the `?v=` cache‑tag bump on deploy so stale‑cache can't recur.
- Possible next builds discussed: well‑level type‑curve pull (Novi/Enverus) for the site radius to replace the Power Ramp gas‑per‑well assumption; thermal‑maturity overlay from the Play Book.

---

*Generated as a session record for Project Lantern. Planning aid only — not legal, engineering, or permitting advice.*
