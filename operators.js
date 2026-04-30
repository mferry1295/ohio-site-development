/* =============================================================
 *  Per-county operator breakdown — 2025 production
 *  Source: 2025_AllQtrs_FINAL_04_20.xlsx (Ohio DNR horizontal-well
 *          quarterly production filings, summed Q1–Q4 2025).
 *
 *  Each entry: { op, wells, oil (bbl), gas (Mcf) } sorted by
 *  oil-equivalent volume (gas + oil × 5.659) descending.
 *  ============================================================= */

const COUNTY_OPERATORS_2025 = {
  "Belmont": [
    { op: "Ascent Resources Utica", wells: 295, oil: 504286, gas: 218143403 },
    { op: "Gulfport Appalachia", wells: 293, oil: 457676, gas: 213486869 },
    { op: "Rice Drilling D", wells: 147, oil: 0, gas: 66023989 },
    { op: "Expand Operating", wells: 4, oil: 12196, gas: 1040281 },
    { op: "Tiburon Oil & Gas Ohio", wells: 3, oil: 9422, gas: 859000 },
    { op: "SWN Production Company", wells: 4, oil: 4541, gas: 372590 },
    { op: "Eco Power Crypto", wells: 1, oil: 0, gas: 0 },
  ],
  "Carroll": [
    { op: "EOG Ohio", wells: 549, oil: 4933820, gas: 60341162 },
    { op: "EAP Ohio", wells: 529, oil: 4399546, gas: 51760256 },
    { op: "EOG Resources", wells: 24, oil: 2184885, gas: 15821877 },
    { op: "INR Ohio", wells: 58, oil: 824277, gas: 12698393 },
  ],
  "Columbiana": [
    { op: "Hilcorp Energy Company", wells: 89, oil: 0, gas: 50335965 },
    { op: "EAP Ohio", wells: 87, oil: 805948, gas: 17253854 },
    { op: "EOG Ohio", wells: 92, oil: 625691, gas: 15862531 },
    { op: "Geopetro", wells: 8, oil: 0, gas: 1214637 },
    { op: "Pin Oak Energy Partners", wells: 10, oil: 0, gas: 64044 },
  ],
  "Coshocton": [
    { op: "Diversified Production", wells: 1, oil: 93, gas: 261228 },
  ],
  "Guernsey": [
    { op: "Ascent Resources Utica", wells: 178, oil: 8144972, gas: 54338444 },
    { op: "INR Ohio", wells: 60, oil: 3315247, gas: 17435504 },
    { op: "EOG Ohio", wells: 39, oil: 2268023, gas: 12858383 },
    { op: "EAP Ohio", wells: 32, oil: 1731471, gas: 7427016 },
    { op: "Expand Operating", wells: 68, oil: 506022, gas: 9932687 },
    { op: "SWN Production Company", wells: 68, oil: 208932, gas: 3530932 },
    { op: "Gulfport Appalachia", wells: 12, oil: 42297, gas: 805202 },
    { op: "Antero Resources", wells: 11, oil: 2764, gas: 804611 },
    { op: "Pin Oak Energy Partners", wells: 6, oil: 4339, gas: 198937 },
    { op: "Geopetro", wells: 1, oil: 1707, gas: 0 },
    { op: "EOG Resources", wells: 2, oil: 0, gas: 0 },
  ],
  "Harrison": [
    { op: "Ascent Resources Utica", wells: 212, oil: 1118420, gas: 228618015 },
    { op: "EAP Ohio", wells: 307, oil: 4024355, gas: 59076716 },
    { op: "EOG Ohio", wells: 311, oil: 2884287, gas: 55752484 },
    { op: "EOG Resources", wells: 34, oil: 3318199, gas: 16880285 },
    { op: "Gulfport Appalachia", wells: 51, oil: 1707072, gas: 12448245 },
    { op: "Expand Operating", wells: 17, oil: 21569, gas: 1163622 },
    { op: "SWN Production Company", wells: 17, oil: 7845, gas: 390905 },
    { op: "Sound Energy Co", wells: 5, oil: 12604, gas: 109625 },
  ],
  "Jefferson": [
    { op: "Ascent Resources Utica", wells: 272, oil: 70852, gas: 327333541 },
    { op: "EOG Ohio", wells: 131, oil: 0, gas: 41424303 },
    { op: "EAP Ohio", wells: 128, oil: 0, gas: 40764606 },
    { op: "Gulfport Appalachia", wells: 23, oil: 0, gas: 35571496 },
  ],
  "Mahoning": [
    { op: "EOG Ohio", wells: 1, oil: 65469, gas: 367404 },
    { op: "Hilcorp Energy Company", wells: 7, oil: 0, gas: 576283 },
    { op: "Northwood Energy Corp", wells: 3, oil: 3417, gas: 84568 },
    { op: "Pin Oak Energy Partners", wells: 2, oil: 774, gas: 68638 },
  ],
  "Monroe": [
    { op: "Gulfport Appalachia", wells: 114, oil: 0, gas: 100896944 },
    { op: "Expand Operating", wells: 152, oil: 229661, gas: 90639910 },
    { op: "Rice Drilling D", wells: 58, oil: 9561, gas: 49603299 },
    { op: "Diversified Production", wells: 35, oil: 0, gas: 32365070 },
    { op: "SWN Production Company", wells: 147, oil: 85529, gas: 29604002 },
    { op: "Antero Resources", wells: 95, oil: 8222, gas: 20429613 },
    { op: "CNX Gas", wells: 47, oil: 2651, gas: 14316041 },
    { op: "Ascent Resources Utica", wells: 3, oil: 4138, gas: 1621706 },
  ],
  "Morgan": [
    { op: "INR Ohio", wells: 3, oil: 3368, gas: 104077 },
  ],
  "Muskingum": [
    { op: "EOG Resources", wells: 2, oil: 1671, gas: 230182 },
  ],
  "Noble": [
    { op: "Antero Resources", wells: 135, oil: 166076, gas: 34275631 },
    { op: "Ascent Resources Utica", wells: 40, oil: 376072, gas: 21005485 },
    { op: "EOG Resources", wells: 26, oil: 1322595, gas: 11104811 },
    { op: "EOG Ohio", wells: 4, oil: 145697, gas: 1063523 },
    { op: "Expand Operating", wells: 7, oil: 5189, gas: 1089103 },
    { op: "Gulfport Appalachia", wells: 3, oil: 0, gas: 525982 },
    { op: "SWN Production Company", wells: 7, oil: 1355, gas: 342556 },
    { op: "INR Ohio", wells: 2, oil: 5628, gas: 64675 },
  ],
  "Portage": [
    { op: "Holbrook", wells: 2, oil: 799, gas: 111634 },
    { op: "Northwood Energy Corp", wells: 1, oil: 155, gas: 45191 },
  ],
  "Stark": [
    { op: "EAP Ohio", wells: 2, oil: 237, gas: 23648 },
    { op: "EOG Ohio", wells: 2, oil: 201, gas: 23087 },
    { op: "EOG Resources", wells: 1, oil: 0, gas: 0 },
  ],
  "Trumbull": [
    { op: "Pin Oak Energy Partners", wells: 6, oil: 1106, gas: 286601 },
    { op: "EAP Ohio", wells: 1, oil: 0, gas: 0 },
    { op: "EOG Ohio", wells: 1, oil: 0, gas: 0 },
  ],
  "Tuscarawas": [
    { op: "EOG Ohio", wells: 25, oil: 835222, gas: 4823954 },
    { op: "EAP Ohio", wells: 18, oil: 654856, gas: 5504696 },
    { op: "Northwood Energy Corp", wells: 2, oil: 636, gas: 81330 },
  ],
  "Washington": [
    { op: "Diversified Production", wells: 1, oil: 117, gas: 679698 },
    { op: "Expand Operating", wells: 3, oil: 1473, gas: 299848 },
    { op: "INR Ohio", wells: 6, oil: 3430, gas: 265741 },
    { op: "Pin Oak Energy Partners", wells: 1, oil: 0, gas: 210338 },
    { op: "SWN Production Company", wells: 3, oil: 676, gas: 93522 },
  ],
  "Wayne": [
    { op: "Geopetro", wells: 1, oil: 0, gas: 30829 },
  ],
};

window.COUNTY_OPERATORS_2025 = COUNTY_OPERATORS_2025;
