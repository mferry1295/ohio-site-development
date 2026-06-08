# Project Lantern — Session Summary (June 2026)

**Dates:** June 3–8, 2026
**App:** Project Lantern · Ohio Site Development (Tuscarawas County behind‑the‑meter, gas‑fired data‑center thesis)
**Live site:** https://mferry1295.github.io/ohio-site-development/ (GitHub Pages, deploys from `main`)
**Repo:** https://github.com/mferry1295/ohio-site-development
**Stack:** static site — `index.html`, `app.js`, `styles.css`, data files; Leaflet for maps, Chart.js for charts.

> Companion to the earlier `SESSION_SUMMARY.md`. This file covers the June 3–8 work.

---

## At a glance

| # | Work | Tab | Status |
|---|------|-----|--------|
| 1 | Merge **Field Map → Productivity Map** (one tab, one filter set) | Productivity Map | ✅ Production |
| 2 | Productivity Map: popup MMcf/d, drop "Reading the map" essay | Productivity Map | ✅ Production |
| 3 | Productivity Map: remove stat cards; **table‑row → zoom + grey out** others | Productivity Map | ✅ Production |
| 4 | **Land Checklist overhaul** — plain milestones, per‑item expander, fewer tags | Land Checklist | ✅ Production |
| 5 | Land Checklist: remove TOC chips + "How to use this" footer; professionalize wording | Land Checklist | ✅ Production |
| 6 | **Go to Market tab** — dynamic buyer/lease/positioning canvas | Go to Market | ✅ Production |
| 7 | **EOG TWR units on the Parcel Map** — dots → footprint polygons → dissolved Ditka | Parcel Map | ✅ Production |
| 8 | Productivity Map: optional **EOG‑units overlay** | Productivity Map | ✅ Production |
| 9 | **GTM revamp** — approach → structures → buyer universe → comparables | Go to Market | ✅ Production |
| 10 | GTM visual rework — process funnel, cost‑of‑capital ladder, structure spectrum | Go to Market | ✅ Production |
| 11 | GTM buyer cards — **logos, location, website, conviction stats**; stars removed | Go to Market | ✅ Production |
| 12 | Parcel Map cleanups — remove appraised value, intro paragraph, subtitle | Parcel Map | ✅ Production |
| — | Strategy discussion: attractiveness of a 100 MW data center | — | 💬 Discussion |

---

## 1. Field Map → Productivity Map merge

Removed the standalone **Field Map** tab and folded it into the **Productivity Map**:
- The Field Map's **threshold filter bar** (County, Operator, first‑prod‑year, gas/day, oil/day, include‑unknown‑year, reset, live count) moved to the **top** of the Productivity tab.
- The sortable **wells detail table** moved **below** the productivity map.
- One filter set now drives **both** the productivity dots/grid and the detail table — `applyFieldFilters()` rebuilds `MAP_STATE.filteredItems`, then `buildProductivity()` re‑renders the dots and `renderWellsTable()` re‑renders the table.
- Deleted the choropleth‑only county view and its dispatch.

## 2–3. Productivity Map polish

- Well/area‑grid **popups show gas in MMcf/d** (not Mcf/d) for consistency.
- Removed the long **"Reading the map"** essay article.
- Removed the four **stat cards** (wells mapped / peak well / best counties / near‑site).
- **Table‑row → map:** clicking a wells‑table row zooms the map to that well, **greys out every other dot**, opens its popup, scrolls the map into view, and marks the row active. Clicking the active row again — or changing any filter/metric/view — clears the highlight. From the Area‑grid view it switches to Wells first. Built an API‑keyed marker registry (`wellKey()` → `a:API` or `c:lat_lon`) so a row maps to its dot.

## 4–5. Land Checklist overhaul

Reworked the 42‑item, 9‑category readiness checklist from dense technical prose into something scannable:
- Each item now has a **plain‑language title**, a one‑line **overview**, and a collapsed **"What it takes"** expander revealing the activity bullets + the original technical detail note + lead/timeline.
- **Removed the four‑color phase badges** (Foundational / Studies / Entitlements / Buyer) that tagged every row; kept a single **Critical path** flag on the 18 long‑lead items; simplified the legend.
- Removed the **category table‑of‑contents chips** and the **"How to use this"** footer article (and its planning‑aid disclaimer — see follow‑ups).
- **Professionalized** all 42 titles + casual overview openers + category blurbs (e.g., *Clear up the title → Clear and confirm title*, *Find out who owns the minerals below → Determine mineral ownership*, *Start the AEP Ohio power study → Initiate the AEP Ohio load study*).

## 6 / 9 / 10 / 11. Go to Market tab

Brand‑new tab, then iterated heavily. Final structure: **Our approach → Structure options → Buyer universe → Comparable plays.**

**Our approach (go‑to‑market process):** three detailed phases —
1. **Package & position** — data room contents + the selling‑point story + lock firm gas.
2. **Compete & capitalize** — *manufacture competition* (advisor‑led structured process, separate land vs. power JV bids, buyer classes against each other) shown as a **bid funnel** (40+ → 10–12 → 3–5 → 1–2), and *engineer the cost of capital* shown as a **ladder** (ground lease → project finance → JV equity → build‑alone, with an investment‑grade anchor pulling the stack down).
3. **Build & deliver** — behind‑the‑meter to skip the grid queue, secure turbines early, phase to ~1 GW.

**Structure options:** the four deal buckets as interactive cards, ordered on a risk/upside **spectrum**, with Krizman's **(2) JV/retain equity + (4) land lease/option** combo highlighted. Clicking a card filters the comparables.
- (1) Sell gas / long‑term supply — *Floor*
- (2) JV / retain equity in the power entity — *High fit ★*
- (3) Sell the whole platform — *Exit*
- (4) Monetize land via lease / option — *High fit ★*

**Buyer universe (dynamic dashboard):** four toggles — **size** (50 MW–1 GW), **product** (powered land / shell / turnkey / colo), **power model** (BTM gas / hybrid / grid+renewables), **build plan** (single / phased) — drive in real time:
- Headline metrics: facility load, on‑site gas burn (~0.175 MMcf/d per facility‑MW), wells to sustain, speed‑to‑power, lease term, indicative lease value, buyers‑in‑play.
- An 18‑name **ranked buyer shortlist**, scored by size range, gas tolerance vs. the power model, and a phased‑expansion path that surfaces megacaps on a small phase‑1.
- Buyer cards carry **company logos** (DuckDuckGo icon service + Google‑favicon fallback), **HQ location**, a **Website ↗** link, and a 3‑stat **conviction row — Operating / Pipeline / Capex** (researched mid‑2026 figures). The generic "On‑site gas is a selling point" note was replaced with "Behind‑the‑meter gas is their unlock, not a hurdle." The ★ star ratings were removed.

**Comparable plays:** a 14‑deal precedent gallery (MARA/Long Ridge, Williams "Socrates", Diversified Energy, New Era Helium, CNX/Zediker, LandBridge, Diamondback, EOG/Encino, EQT, Ascent, Crusoe, TPL, Fermi, SoftBank), tagged by deal structure + relevance to a single Tuscarawas operator and **filterable** (chips ↔ structure cards stay in sync).

> Buyer conviction figures (examples): hyperscaler **FY26 capex ≈ $725B combined** (MSFT ~$190B, Google ~$190B, AWS ~$200B, Meta ~$135–145B); Oracle ~$50B + 10 GW power secured; **QTS building a $10B campus in Van Wert, OH** (in‑state precedent); CoreWeave 43 DCs / 1+ GW live / 3.5+ GW contracted; TeraWulf/IREN/Cipher $25B+ combined HPC backlog.

## 7 / 8. EOG TWR units on the maps

Plotted **EOG Resources' newly unitized Utica "TWR" (Warren Township) drilling units** along the Tuscarawas–Carroll line, from the actual Chief's Orders:

| Unit | Order | Acres | Wells | Townships | Source of geometry |
|---|---|---|---|---|---|
| Shula TWR A | 2025‑123 | 1,688 | 4 | Union & Warren (Tusc) + Orange (Carroll) | ODNR Unitization GIS polygon |
| Shula TWR B | 2025‑425 | 1,241 | 3 | Warren (Tusc) | ODNR Unitization GIS polygon |
| Lambeau TWR A | 2026‑63 | 1,205 | 3 | Orange (Carroll) + Union & Warren (Tusc) | ODNR Unitization GIS polygon |
| Ditka TWR A | 2026‑82 | 1,412 | 3 | Warren (Tusc) + Orange (Carroll) | **89 order parcels, dissolved** |

Progression: (a) **dots** at unit centroids with a toggle + "Frame site ↔ EOG" zoom + rich popups; (b) **highlighted footprint polygons** — ODNR unit polygons for the three in‑GIS units, and **Ditka assembled from its 89 order parcels** pulled live from the Tuscarawas (`PAT_Parcels`) and Carroll (`Carroll_Parcels`) county auditor GIS; (c) **Ditka dissolved** into one clean unit outline (shapely `unary_union` + sliver‑close + simplify) matching the Exhibit B plat. Baked into committed `eog_units.geojson`.

Also added the units as an **optional overlay on the Productivity Map** (shared `ensureEogGeojson()` / `makeEogLayer()`), via an "EOG new units" toggle.

## 12. Parcel Map cleanups

- Removed the **appraised value** (popup row + summary stat card; stats now Parcels · Total acres · Land use).
- Removed the descriptive **intro paragraph**.
- Shortened the title to just **"Parcel Map"** (dropped the "· Krizman & Wilkshire Hills Holdings" subtitle).

---

## Strategy discussion — is a 100 MW data center attractive?

Summarized: 100 MW is "medium" by 2026 hyperscale standards (frontier campuses are 250 MW–1 GW+), but it **widens the buyer pool** (neoclouds, crypto→HPC, colo) and is arguably the **sweet spot for the behind‑the‑meter gas thesis** — ~22 MMcf/d burn (vs ~109 MMcf/d at 500 MW) is tractable from the local Utica position + Nexus firm transport, whereas 500 MW makes the drilling treadmill the whole project. Still over the 50 MW OPSB threshold either way. Recommendation: pitch 100 MW as **Phase 1 of a 300–500 MW master plan** — financeable and fuel‑tractable now, with a credible path to scale.

---

## Data sources / GIS endpoints used

- **ODNR Div. of Oil & Gas — Unitization / Drilling Units:** `https://gis2.ohiodnr.gov/arcgis/rest/services/DOG_Services/Unitization_DrillingUnits/MapServer` (layer 0 "Unitizations", `OrderNo`; queried via the `/find` op — direct `/0/query` is blocked).
- **ODNR Wells / WellPads:** `…/DOG_Services/Oilgas_Wells_10_JS_TEST/MapServer/0` and `…/DOG_Services/WellPads/MapServer/1` (Well Pad Boundaries; located EOG's active Carroll pads).
- **Tuscarawas County Auditor parcels:** `https://gis.co.tuscarawas.oh.us/arcgis/rest/services/PAT_Parcels/MapServer/0` (field `PARCEL_ID`; geometry only via `f=geojson&outSR=4326` per‑parcel — `f=json` + outSR fails).
- **Carroll County Auditor parcels:** `https://services8.arcgis.com/dZSJY7MSQPhysZUz/arcgis/rest/services/Carroll_Parcels/FeatureServer/0` (field `Parcel_Number`, dotted format).
- **EOG Chief's Orders** (Shula TWR B, Lambeau TWR A, Ditka TWR A) — provided PDFs, used for acreage / well counts / townships and the Ditka parcel list.
- **Buyer figures** — hyperscaler FY26 capex guidance, CoreWeave/Oracle/TeraWulf SEC 8‑Ks, OpenAI Stargate announcements, Data Center Dynamics / Data Center Frontier / trade press (mid‑2026).
- **Logos** — DuckDuckGo icon service (`icons.duckduckgo.com/ip3/{domain}.ico`) with Google favicon fallback.

## Files created / changed this session

| File | Change |
|---|---|
| `index.html` | Field Map removed; Productivity filters/table; Land Checklist markup; Go to Market section; Parcel Map EOG controls + cleanups; nav/cache‑tag bumps |
| `app.js` | Filter→productivity rewire; table‑row zoom; checklist data + render; GTM module (state, buyers, structures, comparables, render); EOG geojson loader/layer; Ditka/parcel logic; appraised removal |
| `styles.css` | Productivity/checklist/GTM/EOG/buyer‑card styles |
| `eog_units.geojson` | **New** — 4 EOG unit footprints (3 ODNR polygons + dissolved Ditka) |
| `/tmp/build_eog.py` | Local build script (parcel fetch + shapely dissolve) — not committed |

## Cache‑tag progression

`2026-06-02f → 06-03a … 06-03n → 06-04a → 06-04b → 06-04c → 06-04d`
(Reminder: bump `?v=` on any deploy that changes `app.js`/`styles.css`.)

---

## Deployment / commit log — this session (newest → oldest)

| Commit | Summary |
|---|---|
| `11d9df3` | Parcel Map: shorten page title to "Parcel Map" |
| `180c65b` | Parcel Map: remove the page‑lead intro paragraph |
| `f830574` | Parcel Map: remove appraised value |
| `ef82709` | GTM: operating/pipeline/capex conviction stats on buyers |
| `fa77496` | GTM: buyer cards get logos, location, website; drop stars |
| `5b24808` | GTM: drop the context stat‑strip and flow stepper |
| `fb633d9` | GTM: visual rework + process‑driven "Our approach" |
| `45dcaef` | GTM: revamp into approach → structures → buyers → comparables |
| `1035287` | Productivity Map: optional EOG‑units overlay |
| `0d2689d` | Parcel Map: render Ditka as one dissolved unit outline |
| `7bcae19` | Parcel Map: highlight EOG units as footprint polygons |
| `2a0f06c` | Parcel Map: plot EOG's new TWR drilling units |
| `3223542` | Add Go to Market tab — dynamic buyer/lease/positioning canvas |
| `8b40b97` | Land Checklist: professionalize milestone wording |
| `05c7b42` | Land Checklist: remove the "How to use this" footer article |
| `34b67b9` | Land Checklist: remove the category TOC chips |
| `fc20d65` | Land Checklist: plainer milestones with per‑item expander |
| `0a6db0f` | Productivity Map: drop stat cards, table rows zoom to a well |
| `9a41707` | Productivity Map: popup gas in MMcf/d, drop "Reading the map" essay |
| `08a9f32` | Merge Field Map into Productivity Map (one tab, one filter set) |

### Parallel work observed (not authored in this chat)

While this session ran, the repo also picked up commits from another session/worktree (linear, my work preserved): a richer GTM "Our approach" with a **CIM "sample deliverable"** mock and a **250 MW economics exhibit**, a 6‑step competitive‑process strip, **removal of the Oil & Gas Primer tab**, **hiding Project Overview & Dashboard** (site lands on Go to Market), a Dashboard remodel into the four GTM structures, and numbered structure cards — commits `6475ff0`, `60197d6`, `55189b5`, `7b288f4`, `8cd01d1`, `73f69f0`, `86058e6`, `913cc9e`, `d18cd6a`.

---

## Notes & follow‑ups

- **GitHub "unreachable" / stale site:** verified the push path and live deploy are healthy (server serves the latest `app.js?v=…` with the new code); "not seeing updates" traced to **browser cache** — hard‑refresh (`⌘+Shift+R`) or use incognito.
- **Open:** the checklist **planning‑aid disclaimer** was removed with the footer — re‑add as a small one‑liner if wanted.
- **Open:** logos are fetched at runtime from a third‑party icon service — could be self‑hosted if external calls are undesirable.
- **Open:** `Field_Map_Wells_2025.xlsx` remains a local‑only artifact (untracked).

---

*Generated as a session record for Project Lantern. Planning aid only — not legal, engineering, financial, or permitting advice.*
