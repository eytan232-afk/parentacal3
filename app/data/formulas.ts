// app/data/formulas.ts

export type Electrolytes = {
  na: number;
  k: number;
  mg: number;
  ca: number;
  phos: number;
  acetate: number;
  chloride: number;
};

export type BagVariant = {
  label: string;
  volumeMl: number;
  caloriesKcal: number;
  aminoAcidsG: number;
  glucoseG: number;
  lipidsG: number;
  npcPerN?: number;
  electrolytes?: Electrolytes;
};

export type Route = "Central" | "Peripheral";

export type Formula = {
  id: string;
  brand: string;
  name: string;
  route: Route;
  isStandard?: boolean;
  variants: BagVariant[];
};

/**
 * Electrolytes – reference (Triomel N7E 1.5L)
 */
export const STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5: Electrolytes = {
  na: 52.5,
  k: 45.0,
  mg: 6.0,
  ca: 5.3,
  phos: 21.9,
  acetate: 105,
  chloride: 68,
};

export const formulas: Formula[] = [
  /**
   * Standard C (ClinOleic)
   */
  {
    id: "std-clinoleic",
    brand: "Standard",
    name: "C (ClinOleic)",
    route: "Central",
    isStandard: true,
    variants: [
      {
        label: "1.5L",
        volumeMl: 1500,
        caloriesKcal: 1442,
        aminoAcidsG: 58,
        glucoseG: 165,
        lipidsG: 55,
        npcPerN: 130,
        electrolytes: STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5,
      },
    ],
  },

  /**
   * Standard S (SMOFlipid)
   */
  {
    id: "std-smoflipid",
    brand: "Standard",
    name: "S (SMOFlipid)",
    route: "Central",
    isStandard: true,
    variants: [
      {
        label: "1.5L",
        volumeMl: 1500,
        caloriesKcal: 1312,
        aminoAcidsG: 63,
        glucoseG: 140,
        lipidsG: 50,
        npcPerN: 115,
        electrolytes: STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5,
      },
    ],
  },

  /**
   * TRIOMEL N7E – Central
   */
  {
    id: "triomel-n7e",
    brand: "TRIOMEL",
    name: "N7E (with electrolytes)",
    route: "Central",
    variants: [
      {
        label: "1.5L",
        volumeMl: 1500,
        caloriesKcal: 1710,
        aminoAcidsG: 66.4,
        glucoseG: 210,
        lipidsG: 60,
        npcPerN: 137,
        electrolytes: { ...STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5 },
      },
      {
        label: "2L",
        volumeMl: 2000,
        caloriesKcal: 2270,
        aminoAcidsG: 88.6,
        glucoseG: 280,
        lipidsG: 80,
        npcPerN: 137,
        electrolytes: {
          na: 70,
          k: 60,
          mg: 8,
          ca: 7,
          phos: 29.2,
          acetate: 140,
          chloride: 90,
        },
      },
    ],
  },

  /**
   * TRIOMEL N9E – Central
   */
  {
    id: "triomel-n9e",
    brand: "TRIOMEL",
    name: "N9E (with electrolytes)",
    route: "Central",
    variants: [
      {
        label: "1.5L",
        volumeMl: 1500,
        caloriesKcal: 1600,
        aminoAcidsG: 85.4,
        glucoseG: 165,
        lipidsG: 60,
        npcPerN: 93,
        electrolytes: {
          na: 52.5,
          k: 45,
          mg: 6,
          ca: 5.3,
          phos: 22.5,
          acetate: 105,
          chloride: 68,
        },
      },
      {
        label: "2L",
        volumeMl: 2000,
        caloriesKcal: 2140,
        aminoAcidsG: 113.9,
        glucoseG: 220,
        lipidsG: 80,
        npcPerN: 93,
        electrolytes: {
          na: 70,
          k: 60,
          mg: 8,
          ca: 7,
          phos: 30,
          acetate: 140,
          chloride: 90,
        },
      },
    ],
  },

  /**
   * TRIOMEL N12E – Central
   */
  {
    id: "triomel-n12e",
    brand: "TRIOMEL",
    name: "N12E (with electrolytes)",
    route: "Central",
    variants: [
      {
        label: "1.5L",
        volumeMl: 1500,
        caloriesKcal: 1420,
        aminoAcidsG: 113.9,
        glucoseG: 110,
        lipidsG: 52.5,
        npcPerN: 53,
        electrolytes: { ...STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5 },
      },
    ],
  },

  /**
   * TRIOMEL N9E – Peripheral 1L
   */
  {
    id: "triomel-n9e-1l-periph",
    brand: "TRIOMEL",
    name: "N9E (with electrolytes)",
    route: "Peripheral",
    variants: [
      {
        label: "1L",
        volumeMl: 1000,
        caloriesKcal: 1070,
        aminoAcidsG: 56.9,
        glucoseG: 110,
        lipidsG: 40,
        npcPerN: 93,
        electrolytes: {
          na: 35,
          k: 30,
          mg: 4,
          ca: 3.5,
          phos: 15,
          acetate: 70,
          chloride: 45,
        },
      },
    ],
  },

  /**
   * TRIOMEL N4E – Peripheral
   * Electrolytes לפי המניפה
   */
  {
    id: "triomel-n4e-periph",
    brand: "TRIOMEL",
    name: "N4E",
    route: "Peripheral",
    variants: [
      {
        label: "2L",
        volumeMl: 2000,
        caloriesKcal: 1400,
        aminoAcidsG: 50.6,
        glucoseG: 150,
        lipidsG: 60,
        npcPerN: 150,
        electrolytes: {
          na: 42,
          k: 32,
          mg: 4.4,
          ca: 4,
          phos: 17,
          acetate: 55,
          chloride: 49,
        },
      },
      {
        label: "2.5L",
        volumeMl: 2500,
        caloriesKcal: 1750,
        aminoAcidsG: 63.25,
        glucoseG: 187.5,
        lipidsG: 75,
        npcPerN: 150,
        electrolytes: {
          na: 52.5,
          k: 40,
          mg: 5.5,
          ca: 5,
          phos: 21.2,
          acetate: 69,
          chloride: 61,
        },
      },
    ],
  },
];
