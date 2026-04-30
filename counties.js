/* =============================================================
 *  Ohio Utica counties — 2025 production dataset
 *  Source: 2025_AllQtrs_FINAL_04_20.xlsx (Ohio DNR horizontal-well
 *          quarterly production filings, all four quarters of 2025).
 *
 *  Fields per county:
 *    name       : display name (Title Case)
 *    lat / lng  : approximate county centroid (decimal degrees)
 *    oilBbl     : 2025 total oil production (bbl)
 *    gasMcf     : 2025 total gas production (Mcf)
 *    gasMcfe    : 2025 gas-equivalent production (Mcfe = gasMcf + oilBbl × 5.659)
 *    prodWells  : count of unique wells reporting any production in 2025
 *    wellDays   : total days-in-production summed across all wells × quarters.
 *                 Used as the denominator for true per-well-per-day averages.
 *  ============================================================= */

const COUNTIES = [
  {
    name: 'Belmont', lat: 40.02, lng: -81.05,
    oilBbl: 988121, gasMcf: 499926132, gasMcfe: 505517908,
    prodWells: 743, wellDays: 235339,
    note: 'Largest gas producer in Ohio. Dry-gas window. Led production for the third consecutive reporting period.'
  },
  {
    name: 'Harrison', lat: 40.3, lng: -81.1,
    oilBbl: 13094351, gasMcf: 374439897, gasMcfe: 448540829,
    prodWells: 630, wellDays: 203115,
    note: 'Heart of the volatile-oil window. EOG Tuscarawas-comparable wells. MarkWest Harrison West compression expanded.'
  },
  {
    name: 'Jefferson', lat: 40.39, lng: -80.76,
    oilBbl: 70852, gasMcf: 445093946, gasMcfe: 445494897,
    prodWells: 426, wellDays: 138220,
    note: 'Second-largest gas producer. Mostly dry-gas window. New $5K/acre county leases signed in Oct 2024.'
  },
  {
    name: 'Monroe', lat: 39.72, lng: -81.09,
    oilBbl: 339762, gasMcf: 339476585, gasMcfe: 341399298,
    prodWells: 504, wellDays: 164842,
    note: 'Major dry-gas county at southern end. Appalachian Reliability Project will add 11,100 hp compression here.'
  },
  {
    name: 'Carroll', lat: 40.58, lng: -81.1,
    oilBbl: 12342528, gasMcf: 140621688, gasMcfe: 210468053,
    prodWells: 631, wellDays: 207691,
    note: 'Northern volatile-oil window. Many high-productivity oil wells (>1,000 bbl/d).'
  },
  {
    name: 'Guernsey', lat: 40.06, lng: -81.49,
    oilBbl: 16225774, gasMcf: 107331716, gasMcfe: 199153371,
    prodWells: 377, wellDays: 122643,
    note: 'Highest new-well count in H2 2024. Core volatile-oil window. Salt Fork State Park lease activity.'
  },
  {
    name: 'Columbiana', lat: 40.76, lng: -80.79,
    oilBbl: 1431639, gasMcf: 84731031, gasMcfe: 92832676,
    prodWells: 199, wellDays: 64428,
    note: 'Northern volatile-oil window. New Bloom Compressor Station (21,900 hp) added in H2 2024.'
  },
  {
    name: 'Noble', lat: 39.77, lng: -81.46,
    oilBbl: 2022612, gasMcf: 69471766, gasMcfe: 80917727,
    prodWells: 217, wellDays: 70121,
    note: 'Southern volatile-oil/condensate window. High-productivity oil wells in western Noble.'
  },
  {
    name: 'Tuscarawas', lat: 40.44, lng: -81.47,
    oilBbl: 1490714, gasMcf: 10409980, gasMcfe: 18845930,
    prodWells: 27, wellDays: 6335,
    note: 'Volatile-oil window — emerging activity. Target geology for the integrated landowner thesis.'
  },
  {
    name: 'Washington', lat: 39.46, lng: -81.51,
    oilBbl: 5696, gasMcf: 1549147, gasMcfe: 1581380,
    prodWells: 11, wellDays: 3545,
    note: 'Southern fringe. Limited Utica activity.'
  },
  {
    name: 'Mahoning', lat: 41.01, lng: -80.78,
    oilBbl: 69660, gasMcf: 1096893, gasMcfe: 1491098,
    prodWells: 13, wellDays: 4150,
    note: 'Northern fringe. Limited recent activity.'
  },
  {
    name: 'Trumbull', lat: 41.32, lng: -80.76,
    oilBbl: 1106, gasMcf: 286601, gasMcfe: 292859,
    prodWells: 7, wellDays: 2160,
    note: 'Northern fringe. Lordstown 940 MW gas plant nearby.'
  },
  {
    name: 'Coshocton', lat: 40.3, lng: -81.92,
    oilBbl: 93, gasMcf: 261228, gasMcfe: 261754,
    prodWells: 1, wellDays: 365,
    note: 'Marginal producer at western edge of the play.'
  },
  {
    name: 'Muskingum', lat: 39.97, lng: -81.93,
    oilBbl: 1671, gasMcf: 230182, gasMcfe: 239638,
    prodWells: 2, wellDays: 286,
    note: 'Marginal western-edge producer.'
  },
  {
    name: 'Portage', lat: 41.17, lng: -81.2,
    oilBbl: 954, gasMcf: 156825, gasMcfe: 162223,
    prodWells: 3, wellDays: 1095,
    note: 'Northern fringe with limited recent activity.'
  },
  {
    name: 'Morgan', lat: 39.62, lng: -81.85,
    oilBbl: 3368, gasMcf: 104077, gasMcfe: 123136,
    prodWells: 3, wellDays: 813,
    note: 'Western fringe of the play.'
  },
  {
    name: 'Stark', lat: 40.81, lng: -81.36,
    oilBbl: 438, gasMcf: 46735, gasMcfe: 49213,
    prodWells: 3, wellDays: 365,
    note: 'Limited Utica production; Canton metro area.'
  },
  {
    name: 'Wayne', lat: 40.83, lng: -81.88,
    oilBbl: 0, gasMcf: 30829, gasMcfe: 30829,
    prodWells: 1, wellDays: 365,
    note: 'Western edge. Single producing well.'
  },
];

window.OhioCounties = { COUNTIES };
