/* =============================================================
 *  Ohio Utica counties — H2 2024 dataset
 *  Source: CSU Levin College Energy Policy Center,
 *          Shale Investment Dashboard (Q3/Q4 2024), Dec 2025.
 *          Built on Ohio Department of Natural Resources data.
 *
 *  Fields per county:
 *    name           : display name (Title Case)
 *    lat / lng      : approximate county centroid (decimal degrees)
 *    gasMcfe        : H2 2024 total gas-equivalent production (Mcfe)
 *    oilBbl         : H2 2024 oil production (bbl)
 *    gasMcf         : H2 2024 gas production (Mcf)
 *    prodWells      : avg producing wells in Q3/Q4 2024
 *    drilled        : wells drilled (awaiting production) Dec 2024
 *    drilling       : wells in active drilling Dec 2024
 *    producing      : producing wells Dec 2024
 *    totalWells     : drilled + drilling + producing
 *    newWells       : new wells in H2 2024 (drilled, drilling, or producing)
 *    investmentM    : H2 2024 upstream drilling+roads investment ($M)
 *    loeM           : H2 2024 lease operating expense ($M)
 *    cumulativeBcfe : total Utica production through Dec 2024 (Bcfe)
 *  ============================================================= */

const COUNTIES = [
  {
    name: 'Belmont', lat: 40.02, lng: -81.05,
    gasMcfe: 294347290, oilBbl: 279903, gasMcf: 292763319,
    prodWells: 695, drilled: 32, drilling: 5, producing: 700, totalWells: 737,
    newWells: 25, investmentM: 288.91, loeM: 43.61, cumulativeBcfe: 6900,
    note: 'Largest gas producer in Ohio. Dry-gas window. Led production for the third consecutive reporting period.'
  },
  {
    name: 'Carroll', lat: 40.58, lng: -81.10,
    gasMcfe: 89744133, oilBbl: 4960779, gasMcf: 61671085,
    prodWells: 578, drilled: 6, drilling: 28, producing: 572, totalWells: 606,
    newWells: 33, investmentM: 381.36, loeM: 13.30, cumulativeBcfe: 1820,
    note: 'Northern volatile-oil window. Many high-productivity oil wells (>1,000 bbl/d).'
  },
  {
    name: 'Columbiana', lat: 40.76, lng: -80.79,
    gasMcfe: 50203222, oilBbl: 678882, gasMcf: 46361429,
    prodWells: 177, drilled: 10, drilling: 2, producing: 176, totalWells: 188,
    newWells: 23, investmentM: 265.80, loeM: 7.44, cumulativeBcfe: 580,
    note: 'Northern volatile-oil window. New Bloom Compressor Station (21,900 hp) added in H2 2024.'
  },
  {
    name: 'Coshocton', lat: 40.30, lng: -81.92,
    gasMcfe: 12439, oilBbl: 115, gasMcf: 11788,
    prodWells: 1, drilled: 1, drilling: 0, producing: 1, totalWells: 2,
    newWells: 0, investmentM: 0, loeM: 0.00, cumulativeBcfe: 0.01,
    note: 'Marginal producer at western edge of the play.'
  },
  {
    name: 'Guernsey', lat: 40.06, lng: -81.49,
    gasMcfe: 75746412, oilBbl: 5839252, gasMcf: 42702085,
    prodWells: 322, drilled: 9, drilling: 44, producing: 316, totalWells: 369,
    newWells: 50, investmentM: 577.82, loeM: 11.22, cumulativeBcfe: 1180,
    note: 'Highest new-well count in H2 2024. Core volatile-oil window. Salt Fork State Park lease activity.'
  },
  {
    name: 'Harrison', lat: 40.30, lng: -81.10,
    gasMcfe: 194814093, oilBbl: 5424305, gasMcf: 164117951,
    prodWells: 563, drilled: 15, drilling: 34, producing: 537, totalWells: 586,
    newWells: 35, investmentM: 404.47, loeM: 28.86, cumulativeBcfe: 2780,
    note: 'Heart of the volatile-oil window. EOG Tuscarawas-comparable wells. MarkWest Harrison West compression expanded.'
  },
  {
    name: 'Jefferson', lat: 40.39, lng: -80.76,
    gasMcfe: 234778008, oilBbl: 62943, gasMcf: 234421814,
    prodWells: 382, drilled: 13, drilling: 7, producing: 395, totalWells: 415,
    newWells: 11, investmentM: 127.12, loeM: 34.78, cumulativeBcfe: 3680,
    note: 'Second-largest gas producer. Mostly dry-gas window. New $5K/acre county leases signed in Oct 2024.'
  },
  {
    name: 'Mahoning', lat: 41.01, lng: -80.78,
    gasMcfe: 400540, oilBbl: 1941, gasMcf: 389556,
    prodWells: 11, drilled: 1, drilling: 0, producing: 12, totalWells: 13,
    newWells: 0, investmentM: 0, loeM: 0.06, cumulativeBcfe: 6,
    note: 'Northern fringe. Limited recent activity.'
  },
  {
    name: 'Monroe', lat: 39.72, lng: -81.09,
    gasMcfe: 186279385, oilBbl: 262308, gasMcf: 184794984,
    prodWells: 471, drilled: 32, drilling: 9, producing: 474, totalWells: 515,
    newWells: 1, investmentM: 11.56, loeM: 27.60, cumulativeBcfe: 3920,
    note: 'Major dry-gas county at southern end. Appalachian Reliability Project will add 11,100 hp compression here.'
  },
  {
    name: 'Morgan', lat: 39.62, lng: -81.85,
    gasMcfe: 50501, oilBbl: 1554, gasMcf: 41707,
    prodWells: 3, drilled: 0, drilling: 0, producing: 2, totalWells: 2,
    newWells: 0, investmentM: 0, loeM: 0.01, cumulativeBcfe: 1,
    note: 'Western fringe of the play.'
  },
  {
    name: 'Muskingum', lat: 39.97, lng: -81.93,
    gasMcfe: 104203, oilBbl: 803, gasMcf: 99659,
    prodWells: 1, drilled: 0, drilling: 0, producing: 2, totalWells: 2,
    newWells: 0, investmentM: 0, loeM: 0.01, cumulativeBcfe: 1,
    note: 'Marginal western-edge producer.'
  },
  {
    name: 'Noble', lat: 39.77, lng: -81.46,
    gasMcfe: 34876506, oilBbl: 773084, gasMcf: 30501624,
    prodWells: 195, drilled: 1, drilling: 10, producing: 192, totalWells: 203,
    newWells: 6, investmentM: 69.34, loeM: 5.17, cumulativeBcfe: 1010,
    note: 'Southern volatile-oil/condensate window. High-productivity oil wells in western Noble.'
  },
  {
    name: 'Portage', lat: 41.17, lng: -81.20,
    gasMcfe: 107588, oilBbl: 154, gasMcf: 106717,
    prodWells: 3, drilled: 6, drilling: 0, producing: 3, totalWells: 9,
    newWells: 0, investmentM: 0, loeM: 0.02, cumulativeBcfe: 1,
    note: 'Northern fringe with limited recent activity.'
  },
  {
    name: 'Stark', lat: 40.81, lng: -81.36,
    gasMcfe: 26151, oilBbl: 236, gasMcf: 24815,
    prodWells: 1, drilled: 3, drilling: 0, producing: 3, totalWells: 6,
    newWells: 0, investmentM: 0, loeM: 0.00, cumulativeBcfe: 1,
    note: 'Limited Utica production; Canton metro area.'
  },
  {
    name: 'Trumbull', lat: 41.32, lng: -80.76,
    gasMcfe: 164052, oilBbl: 501, gasMcf: 161217,
    prodWells: 6, drilled: 4, drilling: 0, producing: 7, totalWells: 11,
    newWells: 0, investmentM: 0, loeM: 0.02, cumulativeBcfe: 4,
    note: 'Northern fringe. Lordstown 940 MW gas plant nearby.'
  },
  {
    name: 'Tuscarawas', lat: 40.44, lng: -81.47,
    gasMcfe: 12197024, oilBbl: 1029868, gasMcf: 6369001,
    prodWells: 17, drilled: 1, drilling: 7, producing: 16, totalWells: 24,
    newWells: 7, investmentM: 80.89, loeM: 1.81, cumulativeBcfe: 25,
    note: 'Volatile-oil window — emerging activity. Target geology for the integrated landowner thesis.'
  },
  {
    name: 'Washington', lat: 39.46, lng: -81.51,
    gasMcfe: 540638, oilBbl: 2853, gasMcf: 524493,
    prodWells: 11, drilled: 0, drilling: 0, producing: 11, totalWells: 11,
    newWells: 0, investmentM: 0, loeM: 0.08, cumulativeBcfe: 8,
    note: 'Southern fringe. Limited Utica activity.'
  },
  {
    name: 'Wayne', lat: 40.83, lng: -81.88,
    gasMcfe: 16174, oilBbl: 0, gasMcf: 16174,
    prodWells: 1, drilled: 0, drilling: 0, producing: 1, totalWells: 1,
    newWells: 0, investmentM: 0, loeM: 0.00, cumulativeBcfe: 0.5,
    note: 'Western edge. Single producing well.'
  },
];

// State-level totals (H2 2024)
const STATE_TOTALS = {
  prodWells: 3438,
  totalWells: 3703,
  newWells: 191,
  gasMcfe: 1174408361,
  oilBbl: 19319481,
  gasMcf: 1065079418,
  investmentM: 2207.27,
  loeM: 173.99,
  royaltiesM: 767.26,
  midstreamM: 280.10,
  cumulativeShaleM: 114600,    // total cumulative shale investment in Ohio ($M)
  highProdOilWells: 11,         // wells >1500 bbl/d in H2 2024
  highOilWells: 37,             // wells 1000-1500 bbl/d in H2 2024
};

window.OhioCounties = { COUNTIES, STATE_TOTALS };
