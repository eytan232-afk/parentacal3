"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { formulas, STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5 } from "./data/formulas";

/* ---------------- helpers ---------------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function fmt(n: number, digits = 0) {
  if (!isFinite(n)) return "—";
  return n.toFixed(digits);
}
function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
function pctDiff(actual: number, target: number) {
  if (!isFinite(actual) || !isFinite(target) || target === 0) return null;
  return ((actual - target) / target) * 100;
}
function pillClass(p: number | null) {
  if (p === null) return "bg-slate-100 text-slate-600 ring-slate-200";
  const a = Math.abs(p);
  if (a <= 5) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (a <= 10) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-rose-50 text-rose-700 ring-rose-200";
}
function normKey(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/* --------- nutrition helpers (NPC/N) --------- */
function npcKcal(totalKcal: number, proteinG: number) {
  const pc = proteinG * 4;
  return Math.max(0, totalKcal - pc);
}
function nitrogenG(proteinG: number) {
  return proteinG / 6.25;
}
function npcToN(totalKcal: number, proteinG: number) {
  const npc = npcKcal(totalKcal, proteinG);
  const n = nitrogenG(proteinG);
  if (!(n > 0)) return null;
  return npc / n;
}
function nToNpc(totalKcal: number, proteinG: number) {
  const npc = npcKcal(totalKcal, proteinG);
  const n = nitrogenG(proteinG);
  if (!(npc > 0)) return null;
  return n / npc;
}

/* ---------------- GIR ---------------- */
const GIR_MAX = 5; // mg/kg/min
function maxGlucosePerDayG(weightKg: number, girMax = GIR_MAX) {
  return (girMax * weightKg * 1440) / 1000;
}
function minHoursByDex(glucoseG: number, weightKg: number, girMax = GIR_MAX) {
  const maxG = maxGlucosePerDayG(weightKg, girMax);
  if (!(maxG > 0) || !(glucoseG >= 0) || !(weightKg > 0)) return null;
  return 24 * (glucoseG / maxG);
}

/* ---------------- types ---------------- */
type LimitingFactor = "none" | "fluids" | "kcal" | "protein";

type CatheterType =
  | "PICC"
  | "Hickman / Tunnelled"
  | "Port (Port-a-cath)"
  | "CVC (Temporary / Non-tunnelled)";

type Inputs = {
  weightKg: number;
  kcalPerKg: number;
  proteinPerKg: number;
  fluidMlPerKg: number;
  hoursPlanned?: number;

  limitingFactor: LimitingFactor;

  // institution fields (print)
  hospital: string;
  ward: string;
  dietitian: string;
  phone: string;

  catheterType: CatheterType;

  // additives
  cernevitMl: 5 | 10;
  nutryeltMl: 10 | 20;

  // vitamin K
  vitaminK150: boolean;

  // line care
  salineTimesPerDay: 2; // fixed
  // exclusivity group: Heparin / Taurolock / Taurolidine
  wantHeparin: boolean;
  heparinDose: "HEPARIN 10u/cc - 5cc" | "HEPARIN 100u/cc - 5cc";
  heparinTimesPerDay: 1; // fixed 1/day

  wantTauroLock: boolean; // 2 mL only
  wantTaurolidine: boolean;
  taurolidineMl: number;

  // treatment days
  treatmentDaysPerWeek: number; // 1..7

  notes: string;
};

type Candidate = {
  key: string;
  groupKey: string;
  groupTitle: string;

  formula: any;
  variant: any;

  volMl: number;
  preferredVolMl: number;
  ratio: number;

  delivered: {
    kcal: number;
    proteinG: number;
    fluidMl: number;
    dextroseG: number;
    lipidsG: number;

    npcKcal: number;
    npcToN: number | null;
    nToNpc: number | null;

    npcPerN?: number;
    electrolytes?: any;
  };

  diffs: {
    kcalPct: number | null;
    proteinPct: number | null;
    fluidPct: number | null;
  };

  score: number;
  minHours: number | null;
};

/* -------------- pharmacist phones -------------- */
const PHARM_LINES = [
  { label: "ייעוץ רוקחי 1", phone: "08-6919320" },
  { label: "ייעוץ רוקחי 2", phone: "08-6919322" },
  { label: "ייעוץ רוקחי 3", phone: "08-6919327" },
  { label: "ייעוץ רוקחי 4", phone: "08-6919340" },
];

function computeHoursRateGIR(args: {
  weightKg: number;
  dextroseG: number;
  fluidMl: number;
  hoursPlanned?: number;
}) {
  const w = Math.max(1, args.weightKg);
  const minH = minHoursByDex(args.dextroseG, w, GIR_MAX);

  const planned =
    args.hoursPlanned && args.hoursPlanned > 0 ? args.hoursPlanned : null;
  const usedHours = planned ?? minH;
  const source: "planned" | "min" | "none" = planned
    ? "planned"
    : minH
    ? "min"
    : "none";

  const rate = usedHours ? args.fluidMl / usedHours : null;
  const girActual = usedHours
    ? (args.dextroseG * 1000) / (w * (usedHours * 60))
    : null;

  return { minH, usedHours, source, rate, girActual };
}

function nearestPreferredVolume(volMl: number, baseVolumes: number[]) {
  if (!baseVolumes.length) return volMl;
  let best = baseVolumes[0];
  let bestD = Math.abs(volMl - best);
  for (const v of baseVolumes) {
    const d = Math.abs(volMl - v);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  const pct = best > 0 ? bestD / best : 1;
  return bestD <= 80 || pct <= 0.05 ? best : volMl;
}

function computeCandidate(
  inp: Inputs,
  f: any,
  v: any,
  targets: { kcal: number; protein: number; fluid: number }
): Candidate {
  const w = Math.max(1, inp.weightKg);

  const targetKcal = targets.kcal;
  const targetProtein = targets.protein;
  const targetFluid = targets.fluid;

  const groupTitle = `${f.brand} ${f.name}`.replace(/\s+/g, " ").trim();
  const groupKey = normKey(groupTitle);

  const fK = targetKcal > 0 ? targetKcal / v.caloriesKcal : 1;
  const fP = targetProtein > 0 ? targetProtein / v.aminoAcidsG : 1;
  const fF = targetFluid > 0 ? targetFluid / v.volumeMl : 1;

  let factor = clamp(0.62 * fK + 0.28 * fP + 0.10 * fF, 0.4, 1.6);
  let volMl = clamp(Math.round(v.volumeMl * factor), 500, 2500);

  if (inp.limitingFactor === "fluids" && targetFluid > 0) {
    volMl = clamp(Math.round(targetFluid), 500, 2500);
  }

  const ratio = volMl / v.volumeMl;

  const eBase = f.isStandard
    ? STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5
    : v.electrolytes;

  const kcal = v.caloriesKcal * ratio;
  const proteinG = v.aminoAcidsG * ratio;

  const npc = npcKcal(kcal, proteinG);
  const npcN = npcToN(kcal, proteinG);
  const nNpc = nToNpc(kcal, proteinG);

  const delivered = {
    kcal,
    proteinG,
    fluidMl: volMl,
    dextroseG: v.glucoseG * ratio,
    lipidsG: v.lipidsG * ratio,

    npcKcal: npc,
    npcToN: npcN,
    nToNpc: nNpc,

    npcPerN: v.npcPerN,
    electrolytes: eBase
      ? {
          na: eBase.na * ratio,
          k: eBase.k * ratio,
          mg: eBase.mg * ratio,
          ca: eBase.ca * ratio,
          phos: eBase.phos * ratio,
          acetate: eBase.acetate * ratio,
          chloride: eBase.chloride * ratio,
          acetate2: eBase.acetate * ratio,
        }
      : undefined,
  };

  if (delivered.electrolytes) {
    delivered.electrolytes.acetate =
      delivered.electrolytes.acetate2 ??
      delivered.electrolytes.acetate ??
      0;
    delivered.electrolytes.acetate2 = 0; // במקום delete
  }

  const diffs = {
    kcalPct: pctDiff(delivered.kcal, targetKcal),
    proteinPct: pctDiff(delivered.proteinG, targetProtein),
    fluidPct: pctDiff(delivered.fluidMl, targetFluid),
  };

  const aK = diffs.kcalPct == null ? 999 : Math.abs(diffs.kcalPct);
  const aP = diffs.proteinPct == null ? 999 : Math.abs(diffs.proteinPct);
  const aF = diffs.fluidPct == null ? 999 : Math.abs(diffs.fluidPct);

  let wK = 1000,
    wP = 40,
    wF = 5;

  if (inp.limitingFactor === "fluids") {
    wF = 1400;
    wK = 70;
    wP = 25;
  } else if (inp.limitingFactor === "kcal") {
    wK = 1400;
    wP = 25;
    wF = 10;
  } else if (inp.limitingFactor === "protein") {
    wP = 1400;
    wK = 40;
    wF = 10;
  }

  const score = aF * wF + aK * wK + aP * wP;
  const minH = minHoursByDex(delivered.dextroseG, w, GIR_MAX);

  const baseVolumes = (f.variants ?? [])
    .map((x: any) => x.volumeMl)
    .filter(Boolean);
  const preferredVolMl = nearestPreferredVolume(volMl, baseVolumes);

  return {
    key: `${f.id}__${v.label}`,
    groupKey,
    groupTitle,
    formula: f,
    variant: v,
    volMl,
    preferredVolMl,
    ratio,
    delivered,
    diffs,
    score,
    minHours: minH,
  };
}

function MetricRow({
  label,
  value,
  unit,
  pct,
}: {
  label: string;
  value: string;
  unit: string;
  pct?: number | null;
}) {
  const show = pct !== undefined;
  const txt = pct == null ? "—" : `${pct >= 0 ? "+" : ""}${fmt(pct, 1)}%`;

  return (
    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {show ? (
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[11px] font-extrabold ring-1",
              pillClass(pct ?? null)
            )}
            title="אחוז סטייה מהיעד"
          >
            {txt}
          </span>
        ) : null}
        <div className="text-xs font-semibold text-slate-700">{label}</div>
      </div>

      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <span className="font-extrabold text-slate-900">{value}</span>
        <span className="text-xs font-semibold text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function BottomLine({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="text-[11px] text-slate-600 flex flex-wrap gap-x-3 gap-y-1 justify-center">
      {items.map((it, idx) => (
        <span
          key={idx}
          className="inline-flex items-baseline gap-1 whitespace-nowrap"
        >
          <span className="text-slate-600">{it.label}</span>
          <span className="font-semibold text-slate-800">{it.value}</span>
        </span>
      ))}
    </div>
  );
}

export default function Page() {
  const [inp, setInp] = useState<Inputs>({
    weightKg: 70,
    kcalPerKg: 30,
    proteinPerKg: 1.2,
    fluidMlPerKg: 30,
    hoursPlanned: undefined,

    limitingFactor: "none",

    hospital: "",
    ward: "",
    dietitian: "",
    phone: "",

    catheterType: "PICC",

    cernevitMl: 5,
    nutryeltMl: 10,

    vitaminK150: false,

    salineTimesPerDay: 2,

    wantHeparin: false,
    heparinDose: "HEPARIN 10u/cc - 5cc",
    heparinTimesPerDay: 1,

    wantTauroLock: false,
    wantTaurolidine: false,
    taurolidineMl: 0,

    treatmentDaysPerWeek: 7,

    notes: "",
  });

  const w = Math.max(1, inp.weightKg);

  const targets = useMemo(
    () => ({
      kcal: inp.kcalPerKg * w,
      protein: inp.proteinPerKg * w,
      fluid: inp.fluidMlPerKg * w,
    }),
    [inp.kcalPerKg, inp.proteinPerKg, inp.fluidMlPerKg, w]
  );

  const all = useMemo(() => {
    const list: Candidate[] = [];
    for (const f of formulas as any[]) {
      for (const v of f.variants as any[])
        list.push(computeCandidate(inp, f, v, targets));
    }
    list.sort((a, b) => a.score - b.score);

    const bestByGroup = new Map<string, Candidate>();
    for (const c of list) {
      const prev = bestByGroup.get(c.groupKey);
      if (!prev || c.score < prev.score) bestByGroup.set(c.groupKey, c);
    }
    const top3 = Array.from(bestByGroup.values())
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    return { list, top3 };
  }, [inp, targets]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const selected = useMemo(
    () => all.list.find((x) => x.key === openKey) ?? null,
    [all.list, openKey]
  );

  const sameGroup = useMemo(() => {
    if (!selected) return [];
    return all.list
      .filter((x) => x.groupKey === selected.groupKey)
      .sort((a, b) => a.variant.volumeMl - b.variant.volumeMl);
  }, [all.list, selected]);

  const [modalVariantKey, setModalVariantKey] = useState<string>("");
  const modalBase = useMemo(() => {
    if (!selected) return null;
    const found = all.list.find((x) => x.key === modalVariantKey);
    return found ?? selected;
  }, [selected, modalVariantKey, all.list]);

  const [modalVol, setModalVol] = useState<number>(0);

  function openModal(c: Candidate) {
    setOpenKey(c.key);
    setModalVariantKey(c.key);
    setModalVol(c.volMl);
  }

  const modalCalc = useMemo(() => {
    if (!modalBase) return null;

    const base = modalBase.variant;
    const volMl = clamp(modalVol || modalBase.volMl, 500, 2500);
    const ratio = volMl / base.volumeMl;

    const eBase = modalBase.formula.isStandard
      ? STD_ELECTROLYTES_FROM_TRIOMEL_N7E_1P5
      : base.electrolytes;

    const kcal = base.caloriesKcal * ratio;
    const proteinG = base.aminoAcidsG * ratio;

    const delivered = {
      kcal,
      proteinG,
      fluidMl: volMl,
      dextroseG: base.glucoseG * ratio,
      lipidsG: base.lipidsG * ratio,

      npcKcal: npcKcal(kcal, proteinG),
      npcToN: npcToN(kcal, proteinG),
      nToNpc: nToNpc(kcal, proteinG),

      electrolytes: eBase
        ? {
            na: eBase.na * ratio,
            k: eBase.k * ratio,
            mg: eBase.mg * ratio,
            ca: eBase.ca * ratio,
            phos: eBase.phos * ratio,
            acetate: eBase.acetate * ratio,
            chloride: eBase.chloride * ratio,
          }
        : undefined,
    };

    const diffs = {
      kcalPct: pctDiff(delivered.kcal, targets.kcal),
      proteinPct: pctDiff(delivered.proteinG, targets.protein),
      fluidPct: pctDiff(delivered.fluidMl, targets.fluid),
    };

    const hrs = computeHoursRateGIR({
      weightKg: w,
      dextroseG: delivered.dextroseG,
      fluidMl: delivered.fluidMl,
      hoursPlanned: inp.hoursPlanned,
    });

    const nG = nitrogenG(delivered.proteinG);

    return { delivered, diffs, hrs, nG };
  }, [
    modalBase,
    modalVol,
    targets.kcal,
    targets.protein,
    targets.fluid,
    inp.hoursPlanned,
    w,
  ]);

  const [pharmOpen, setPharmOpen] = useState(false);

  function buildMailtoForSelf(payloadText: string) {
    const to = "remedix.beity@remedix-care.co.il";
    const subject = encodeURIComponent("מרשם הזנה - TPN/SPN");
    const body = encodeURIComponent(payloadText);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function printPrescription() {
    if (!modalBase || !modalCalc) return;

    const payload = {
      createdAt: new Date().toLocaleString("he-IL"),

      hospital: inp.hospital,
      ward: inp.ward,
      dietitian: inp.dietitian,
      phone: inp.phone,

      catheterType: inp.catheterType,

      weightKg: w,

      formulaName: `${modalBase.groupTitle} • ${modalBase.variant.label}`,
      route: modalBase.formula.route,
      variantLabel: modalBase.variant.label,

      caloriesKcal: Math.round(modalCalc.delivered.kcal),
      proteinG: Number(modalCalc.delivered.proteinG.toFixed(1)),
      fluidMl: Math.round(modalCalc.delivered.fluidMl),

      dextroseG: Number(modalCalc.delivered.dextroseG.toFixed(1)),
      lipidsG: Number(modalCalc.delivered.lipidsG.toFixed(1)),
      minHoursGIR: modalCalc.hrs.minH
        ? Number(modalCalc.hrs.minH.toFixed(1))
        : null,

      hoursUsed: modalCalc.hrs.usedHours
        ? Number(modalCalc.hrs.usedHours.toFixed(1))
        : null,
      hoursSource: modalCalc.hrs.source,
      rateMlH: modalCalc.hrs.rate ? Math.round(modalCalc.hrs.rate) : null,
      girActual: modalCalc.hrs.girActual
        ? Number(modalCalc.hrs.girActual.toFixed(2))
        : null,

      npcKcal: Math.round(modalCalc.delivered.npcKcal),
      nG: Number(modalCalc.nG.toFixed(2)),
      npcToN: modalCalc.delivered.npcToN
        ? Number(modalCalc.delivered.npcToN.toFixed(1))
        : null,
      nToNpc: modalCalc.delivered.nToNpc
        ? Number(modalCalc.delivered.nToNpc.toFixed(4))
        : null,

      electrolytes: modalCalc.delivered.electrolytes ?? null,

      additives: {
        cernevitMl: inp.cernevitMl,
        nutryeltMl: inp.nutryeltMl,
        vitaminK150: inp.vitaminK150,
      },

      treatmentDaysPerWeek: clamp(Math.round(inp.treatmentDaysPerWeek), 1, 7),

      lineCare: {
        saline: { label: "NaCl 0.9% 10cc", timesPerDay: 2 },
        heparin: inp.wantHeparin
          ? { label: inp.heparinDose, timesPerDay: 1 }
          : null,
        tauroLock: inp.wantTauroLock ? { label: "TauroLock", ml: 2 } : null,
        taurolidine: inp.wantTaurolidine
          ? {
              label: "Taurolidine 2%",
              ml: Math.max(0, Number(inp.taurolidineMl) || 0),
            }
          : null,
      },

      pharmacistPhones: PHARM_LINES.map((x) => x.phone),
      customerServicePhone: "1-800-600-700",
      sendToEmail: "remedix.beity@remedix-care.co.il",

      notes: inp.notes,
    };

    localStorage.setItem("tpn_print_payload_v3", JSON.stringify(payload));
    window.open("/print/prescription", "_blank", "noopener,noreferrer");
  }

  function emailToSelfFromSummary() {
    if (!modalBase || !modalCalc) return;

    const treatDays = clamp(Math.round(inp.treatmentDaysPerWeek), 1, 7);
    const vitK = inp.vitaminK150 ? "כן" : "לא";

    const lockLine = inp.wantHeparin
      ? `Heparin: ${inp.heparinDose} (1/יום)`
      : inp.wantTauroLock
      ? `TauroLock: כן (2 mL)`
      : inp.wantTaurolidine
      ? `Taurolidine 2%: כן (${Math.max(0, Number(inp.taurolidineMl) || 0)} mL)`
      : `Lock: ללא`;

    const text =
      `מרשם מה-TPN/SPN Tool\n\n` +
      `מוסד:\n` +
      `בית חולים: ${inp.hospital || "—"}\nמחלקה: ${inp.ward || "—"}\nדיאטנית: ${inp.dietitian || "—"}\nטלפון: ${inp.phone || "—"}\n` +
      `סוג צנתר: ${inp.catheterType || "—"}\n` +
      `ימי טיפול בשבוע: ${treatDays}/7\n` +
      `Vitamin K 150 mcg/day: ${vitK}\n` +
      `האם יש צורך בשקית חשיפה? □ כן  □ לא\n\n` +
      `תמיסה: ${modalBase.groupTitle} • ${modalBase.variant.label}\n` +
      `נפח: ${Math.round(modalCalc.delivered.fluidMl)} mL\n` +
      `קילו-קלוריות: ${Math.round(modalCalc.delivered.kcal)} kcal\n` +
      `חלבון: ${fmt(modalCalc.delivered.proteinG, 1)} g\n` +
      `שומן: ${fmt(modalCalc.delivered.lipidsG, 1)} g\n` +
      `דקסטרוז: ${fmt(modalCalc.delivered.dextroseG, 1)} g\n\n` +
      `NPC: ${Math.round(modalCalc.delivered.npcKcal)} kcal\n` +
      `N: ${fmt(modalCalc.nG, 2)} g\n` +
      `NPC:N: ${
        modalCalc.delivered.npcToN ? fmt(modalCalc.delivered.npcToN, 1) : "—"
      }\n` +
      `N:NPC: ${
        modalCalc.delivered.nToNpc ? fmt(modalCalc.delivered.nToNpc, 4) : "—"
      }\n\n` +
      `Line care:\n` +
      `NaCl 0.9% 10cc — 2/יום\n` +
      `${lockLine}\n`;

    window.location.href = buildMailtoForSelf(text);
  }

  // ✅ בלעדיות בין Heparin / Taurolock / Taurolidine
  const heparinDisabled =
    !inp.wantHeparin && (inp.wantTauroLock || inp.wantTaurolidine);
  const tauroLockDisabled =
    !inp.wantTauroLock && (inp.wantHeparin || inp.wantTaurolidine);
  const taurolidineDisabled =
    !inp.wantTaurolidine && (inp.wantHeparin || inp.wantTauroLock);

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white text-slate-900"
      dir="rtl"
    >
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden flex items-center justify-center">
                <Image
                  src="/remedix-logo.png"
                  alt="Remedix Care"
                  width={140}
                  height={140}
                  className="h-11 w-11 object-contain"
                  priority
                />
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-extrabold text-slate-900">
                  TPN / SPN
                </div>
                <div className="text-[11px] text-slate-500">
                  כלי לחישוב הזנה פרה אנטרלית
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="tel:1800600700"
                className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm active:scale-[0.99]"
              >
                שירות לקוחות • 1-800-600-700
              </a>
              <button
                onClick={() => setPharmOpen(true)}
                className="rounded-2xl bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 ring-1 ring-blue-200 active:scale-[0.99]"
              >
                להתייעצות עם רוקח
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 space-y-4">
        {/* Targets + Inputs (גורם מגביל נשאר למעלה) */}
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <div className="text-base font-extrabold">יעדים לפי ק״ג</div>
            <div className="text-xs text-slate-500">
              סה״כ: {Math.round(targets.kcal)} kcal •{" "}
              {targets.protein.toFixed(1)} g • {Math.round(targets.fluid)} mL
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-slate-600">
                משקל (kg)
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={inp.weightKg}
                onChange={(e) =>
                  setInp((s) => ({ ...s, weightKg: Number(e.target.value) }))
                }
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-slate-600">
                קילו-קלוריות (kcal/kg/day)
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={inp.kcalPerKg}
                step={0.5}
                onChange={(e) =>
                  setInp((s) => ({ ...s, kcalPerKg: Number(e.target.value) }))
                }
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-slate-600">
                חלבון (g/kg/day)
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={inp.proteinPerKg}
                step={0.05}
                onChange={(e) =>
                  setInp((s) => ({
                    ...s,
                    proteinPerKg: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-slate-600">
                נוזלים (mL/kg/day)
              </label>
              <input
                className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                type="number"
                value={inp.fluidMlPerKg}
                step={1}
                onChange={(e) =>
                  setInp((s) => ({
                    ...s,
                    fluidMlPerKg: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>

          {/* ✅ גורם מגביל נשאר למעלה */}
          <div className="mt-3 rounded-3xl bg-blue-50 p-3 ring-1 ring-blue-200">
            <div className="text-[11px] font-extrabold text-blue-900">
              גורם מגביל (TOP 3)
            </div>
            <select
              className="mt-2 w-full rounded-2xl border border-blue-200 px-3 py-2 text-sm bg-white"
              value={inp.limitingFactor}
              onChange={(e) =>
                setInp((s) => ({
                  ...s,
                  limitingFactor: e.target.value as LimitingFactor,
                }))
              }
            >
              <option value="none">ללא (מאוזן)</option>
              <option value="fluids">נוזלים</option>
              <option value="kcal">קילו-קלוריות</option>
              <option value="protein">חלבון</option>
            </select>
            <div className="mt-2 text-[10px] text-blue-900/70">
              משפיע על סדר העדיפות.
            </div>
          </div>
        </section>

        {/* ✅ שעות הזנה ירדו למטה – מעל ההמלצות */}
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-base font-extrabold">שעות הזנה</div>
          <div className="text-xs text-slate-500 mt-1">
            אם ריק → מחושב לפי GIR (דקסטרוז בלבד)
          </div>

          <input
            className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            type="number"
            placeholder="לדוגמה: 12 / 16 / 24"
            value={inp.hoursPlanned ?? ""}
            onChange={(e) =>
              setInp((s) => ({
                ...s,
                hoursPlanned:
                  e.target.value === "" ? undefined : Number(e.target.value),
              }))
            }
          />
          <div className="mt-2 text-[10px] text-slate-600">GIRmax={GIR_MAX}</div>
        </section>

        {/* Top3 */}
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-base font-extrabold">הכי מותאמות (TOP 3)</h2>
              <div className="text-xs text-slate-500">
                מוצג סוג אחד לכל תמיסה (ללא כפילויות בנפחים שונים)
              </div>
            </div>
            <div className="text-xs text-slate-600">
              מסודר לפי:{" "}
              <b>{inp.limitingFactor === "none" ? "מאוזן" : inp.limitingFactor}</b>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {all.top3.map((c, idx) => {
              const rank = idx + 1;

              const kcalKg = c.delivered.kcal / w;
              const protKg = c.delivered.proteinG / w;
              const fluidKg = c.delivered.fluidMl / w;

              const hrs = computeHoursRateGIR({
                weightKg: w,
                dextroseG: c.delivered.dextroseG,
                fluidMl: c.delivered.fluidMl,
                hoursPlanned: inp.hoursPlanned,
              });
              const fullTitle = `${c.groupTitle} • ${c.variant.label} (מומלץ ${c.preferredVolMl.toLocaleString(
                "en-US"
              )} mL)`;

              const rateTxt = hrs.rate ? fmt(hrs.rate, 0) : "—";

              return (
                <button
                  key={c.key}
                  onClick={() => openModal(c)}
                  className="rounded-3xl bg-white p-4 text-right shadow-sm ring-1 ring-slate-200 hover:ring-blue-200 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold break-words">
                        {fullTitle}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        נפח מומלץ:{" "}
                        <b>{c.preferredVolMl.toLocaleString("en-US")} mL</b>
                      </div>
                    </div>
                    <div className="h-9 w-9 shrink-0 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
                      {rank}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <MetricRow
                      label="קילו-קלוריות"
                      value={`${Math.round(c.delivered.kcal)}`}
                      unit="kcal"
                      pct={c.diffs.kcalPct}
                    />
                    <MetricRow
                      label="חלבון"
                      value={fmt(c.delivered.proteinG, 1)}
                      unit="g"
                      pct={c.diffs.proteinPct}
                    />
                    <MetricRow
                      label="נוזלים"
                      value={`${Math.round(c.delivered.fluidMl).toLocaleString(
                        "en-US"
                      )}`}
                      unit="mL"
                      pct={c.diffs.fluidPct}
                    />

                    <div className="rounded-2xl bg-blue-50 px-3 py-3 ring-1 ring-blue-200 text-xs text-slate-800">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center justify-center">
                        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                          <span>מינימום שעות הזנה:</span>
                          <b>{hrs.minH ? fmt(hrs.minH, 1) : "—"}</b>
                          <span className="text-slate-600">(מחושב לפי GIR)</span>
                        </span>

                        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                          <span>קצב הזנה:</span>
                          <b>{rateTxt}</b>
                          <span className="text-slate-600">mL/h</span>
                          <span className="text-slate-600">
                            ({hrs.source === "planned"
                              ? "לפי שעות שהוזנו"
                              : hrs.source === "min"
                              ? "לפי שעות מינימום"
                              : "—"})
                          </span>
                        </span>
                      </div>

                      <div className="mt-2">
                        <BottomLine
                          items={[
                            { label: "קילו-קלוריות/ק״ג:", value: fmt(kcalKg, 2) },
                            {
                              label: "חלבון/ק״ג:",
                              value: fmt(protKg, 2) + " g/kg",
                            },
                            {
                              label: "נוזלים/ק״ג:",
                              value: fmt(fluidKg, 0) + " mL/kg",
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* פרטי הדפסה למטה */}
        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-base font-extrabold">פרטי הדפסה</div>
          <div className="text-xs text-slate-500 mt-1">
            פרטי מוסד/תוספים/שטיפות — יופיעו בהדפסה
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
            {/* Institution */}
            <div className="md:col-span-6 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-xs font-semibold text-slate-700">
                פרטי דיאטנית / מוסד
              </div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="בית חולים"
                  value={inp.hospital}
                  onChange={(e) =>
                    setInp((s) => ({ ...s, hospital: e.target.value }))
                  }
                />
                <input
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="מחלקה"
                  value={inp.ward}
                  onChange={(e) =>
                    setInp((s) => ({ ...s, ward: e.target.value }))
                  }
                />
                <input
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="דיאטנית"
                  value={inp.dietitian}
                  onChange={(e) =>
                    setInp((s) => ({ ...s, dietitian: e.target.value }))
                  }
                />
                <input
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="טלפון"
                  value={inp.phone}
                  onChange={(e) =>
                    setInp((s) => ({ ...s, phone: e.target.value }))
                  }
                />

                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600">
                    סוג צנתר
                  </label>
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                    value={inp.catheterType}
                    onChange={(e) =>
                      setInp((s) => ({
                        ...s,
                        catheterType: e.target.value as CatheterType,
                      }))
                    }
                  >
                    <option value="PICC">PICC</option>
                    <option value="Hickman / Tunnelled">
                      Hickman / Tunnelled
                    </option>
                    <option value="Port (Port-a-cath)">Port (Port-a-cath)</option>
                    <option value="CVC (Temporary / Non-tunnelled)">
                      CVC (Temporary / Non-tunnelled)
                    </option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600">
                    מספר ימי טיפול בשבוע (עד 7)
                  </label>
                  <select
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm bg-white"
                    value={clamp(Math.round(inp.treatmentDaysPerWeek), 1, 7)}
                    onChange={(e) =>
                      setInp((s) => ({
                        ...s,
                        treatmentDaysPerWeek: Number(e.target.value),
                      }))
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Additives + Vitamin K + Line care */}
            <div className="md:col-span-6 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-xs font-semibold text-slate-700">תוספים</div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      Cernevit{" "}
                      <span className="text-[11px] text-slate-500">
                        (ויטמינים • מנה יומית סטנדרטית)
                      </span>
                    </div>
                    <select
                      className="rounded-xl border border-slate-200 px-2 py-1 text-sm"
                      value={inp.cernevitMl}
                      onChange={(e) =>
                        setInp((s) => ({
                          ...s,
                          cernevitMl: Number(e.target.value) as 5 | 10,
                        }))
                      }
                    >
                      <option value={5}>5 mL</option>
                      <option value={10}>10 mL</option>
                    </select>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    מנה סטנדרטית יומית: <b>5 mL</b>
                  </div>
                </div>

                <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      Nutryelt{" "}
                      <span className="text-[11px] text-slate-500">
                        (יסודות קורט • מנה יומית סטנדרטית)
                      </span>
                    </div>

                    <select
                      className="rounded-xl border border-slate-200 px-2 py-1 text-sm"
                      value={inp.nutryeltMl}
                      onChange={(e) =>
                        setInp((s) => ({
                          ...s,
                          nutryeltMl: Number(e.target.value) as 10 | 20,
                        }))
                      }
                    >
                      <option value={10}>10 mL</option>
                      <option value={20}>20 mL</option>
                    </select>
                  </div>

                  <div className="mt-1 text-[11px] text-slate-500">
                    מנה סטנדרטית יומית: <b>10 mL</b>
                  </div>
                </div>

                <div className="md:col-span-2 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200">
                  <label className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      Vitamin K{" "}
                      <span className="text-[11px] text-slate-500">
                        (150 mcg/day)
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={inp.vitaminK150}
                      onChange={(e) =>
                        setInp((s) => ({ ...s, vitaminK150: e.target.checked }))
                      }
                      className="h-5 w-5"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold text-slate-700">
                    NaCl 0.9% 10cc
                  </div>
                  <div className="mt-1 text-sm font-extrabold">2 שטיפות ביום</div>
                  <div className="text-[11px] text-slate-500">קבוע</div>
                </div>

                <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-700">
                      Heparin
                    </div>
                    <button
                      disabled={heparinDisabled}
                      onClick={() =>
                        setInp((s) => {
                          const v = !s.wantHeparin;
                          return {
                            ...s,
                            wantHeparin: v,
                            wantTauroLock: v ? false : s.wantTauroLock,
                            wantTaurolidine: v ? false : s.wantTaurolidine,
                            taurolidineMl: v ? 0 : s.taurolidineMl,
                          };
                        })
                      }
                      className={cn(
                        "rounded-2xl px-3 py-1.5 text-xs font-extrabold ring-1",
                        heparinDisabled
                          ? "bg-slate-100 text-slate-400 ring-slate-200 cursor-not-allowed"
                          : inp.wantHeparin
                          ? "bg-blue-600 text-white ring-blue-600"
                          : "bg-slate-100 text-slate-700 ring-slate-200"
                      )}
                      title={
                        heparinDisabled
                          ? "כבה Taurolock/Taurolidine כדי לבחור הפרין"
                          : ""
                      }
                    >
                      {inp.wantHeparin ? "כולל הפרין" : "ללא הפרין"}
                    </button>
                  </div>

                  <div
                    className={cn(
                      "mt-2 space-y-2",
                      !inp.wantHeparin && "opacity-50 pointer-events-none"
                    )}
                  >
                    <select
                      className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm"
                      value={inp.heparinDose}
                      onChange={(e) =>
                        setInp((s) => ({
                          ...s,
                          heparinDose: e.target.value as any,
                        }))
                      }
                    >
                      <option value="HEPARIN 10u/cc - 5cc">
                        HEPARIN 10u/cc - 5cc
                      </option>
                      <option value="HEPARIN 100u/cc - 5cc">
                        HEPARIN 100u/cc - 5cc
                      </option>
                    </select>

                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-600">
                        מס׳ שטיפות/יום
                      </div>
                      <div className="w-20 rounded-xl border border-slate-200 px-2 py-1 text-sm text-center bg-slate-50">
                        1
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-700">
                      TauroLock - 2 mL
                    </div>
                    <button
                      disabled={tauroLockDisabled}
                      onClick={() =>
                        setInp((s) => {
                          const v = !s.wantTauroLock;
                          return {
                            ...s,
                            wantTauroLock: v,
                            wantHeparin: v ? false : s.wantHeparin,
                            wantTaurolidine: v ? false : s.wantTaurolidine,
                            taurolidineMl: v ? 0 : s.taurolidineMl,
                          };
                        })
                      }
                      className={cn(
                        "rounded-2xl px-3 py-1.5 text-xs font-extrabold ring-1",
                        tauroLockDisabled
                          ? "bg-slate-100 text-slate-400 ring-slate-200 cursor-not-allowed"
                          : inp.wantTauroLock
                          ? "bg-blue-600 text-white ring-blue-600"
                          : "bg-slate-100 text-slate-700 ring-slate-200"
                      )}
                      title={
                        tauroLockDisabled
                          ? "כבה Heparin/Taurolidine כדי לבחור TauroLock"
                          : ""
                      }
                    >
                      {inp.wantTauroLock ? "כן" : "לא"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-700">
                      Taurolidine 2%
                    </div>
                    <button
                      disabled={taurolidineDisabled}
                      onClick={() =>
                        setInp((s) => {
                          const v = !s.wantTaurolidine;
                          return {
                            ...s,
                            wantTaurolidine: v,
                            wantHeparin: v ? false : s.wantHeparin,
                            wantTauroLock: v ? false : s.wantTauroLock,
                            taurolidineMl: v ? Math.max(0, s.taurolidineMl || 2) : 0,
                          };
                        })
                      }
                      className={cn(
                        "rounded-2xl px-3 py-1.5 text-xs font-extrabold ring-1",
                        taurolidineDisabled
                          ? "bg-slate-100 text-slate-400 ring-slate-200 cursor-not-allowed"
                          : inp.wantTaurolidine
                          ? "bg-blue-600 text-white ring-blue-600"
                          : "bg-slate-100 text-slate-700 ring-slate-200"
                      )}
                      title={
                        taurolidineDisabled
                          ? "כבה Heparin/TauroLock כדי לבחור Taurolidine"
                          : ""
                      }
                    >
                      {inp.wantTaurolidine ? "כן" : "לא"}
                    </button>
                  </div>

                  <div
                    className={cn(
                      "flex items-center justify-between gap-2",
                      !inp.wantTaurolidine && "opacity-50 pointer-events-none"
                    )}
                  >
                    <div className="text-[11px] text-slate-600">mL</div>
                    <input
                      className="w-20 rounded-xl border border-slate-200 px-2 py-1 text-sm text-center"
                      type="number"
                      min={0}
                      value={inp.wantTaurolidine ? inp.taurolidineMl : 0}
                      onChange={(e) =>
                        setInp((s) => ({
                          ...s,
                          taurolidineMl: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <textarea
                className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm min-h-[80px]"
                placeholder="הערות (להדפסה)"
                value={inp.notes}
                onChange={(e) => setInp((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {/* Modal */}
        {selected && modalBase && modalCalc ? (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpenKey(null)}
            />
            <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center">
              <div className="w-full max-w-5xl rounded-t-3xl bg-white shadow-xl ring-1 ring-slate-200 sm:rounded-3xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="text-sm font-extrabold">
                    {modalBase.groupTitle} • {modalBase.variant.label}
                  </div>
                  <button
                    onClick={() => setOpenKey(null)}
                    className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                  >
                    סגור
                  </button>
                </div>

                <div className="p-4 space-y-4 max-h-[82vh] overflow-auto">
                  <div className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-extrabold">בחירת נפח</div>
                      <div className="text-xs text-slate-500">
                        מובנה לפי התמיסה + אפשרות נפח חלקי
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {sameGroup.map((v) => (
                        <button
                          key={v.key}
                          onClick={() => {
                            setModalVariantKey(v.key);
                            setModalVol(v.volMl);
                          }}
                          className={cn(
                            "rounded-2xl px-3 py-2 text-xs font-extrabold ring-1",
                            v.key === modalVariantKey
                              ? "bg-blue-600 text-white ring-blue-600"
                              : "bg-white text-slate-700 ring-slate-200"
                          )}
                        >
                          {v.variant.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3">
                      <div className="text-xs font-semibold text-slate-700">
                        נפח (mL)
                      </div>
                      <input
                        type="range"
                        min={500}
                        max={2500}
                        step={50}
                        value={modalVol}
                        onChange={(e) => setModalVol(Number(e.target.value))}
                        className="mt-2 w-full"
                      />
                      <div className="mt-2 flex justify-between text-sm">
                        <span className="text-slate-600">500</span>
                        <div className="rounded-2xl bg-white px-3 py-1.5 font-extrabold ring-1 ring-slate-200">
                          {Math.round(modalVol).toLocaleString("en-US")} mL
                        </div>
                        <span className="text-slate-600">2500</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-extrabold">סיכום לפני הדפסה</div>
                      <div className="text-xs text-slate-600">
                        NPC: <b>{Math.round(modalCalc.delivered.npcKcal)} kcal</b>{" "}
                        • N: <b>{fmt(modalCalc.nG, 2)} g</b>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <MetricRow
                        label="קילו-קלוריות"
                        value={`${Math.round(modalCalc.delivered.kcal)}`}
                        unit="kcal"
                        pct={modalCalc.diffs.kcalPct}
                      />
                      <MetricRow
                        label="חלבון"
                        value={fmt(modalCalc.delivered.proteinG, 1)}
                        unit="g"
                        pct={modalCalc.diffs.proteinPct}
                      />
                      <MetricRow
                        label="נוזלים"
                        value={Math.round(modalCalc.delivered.fluidMl).toLocaleString(
                          "en-US"
                        )}
                        unit="mL"
                        pct={modalCalc.diffs.fluidPct}
                      />
                    </div>

                    <div className="mt-3 rounded-2xl bg-blue-50 p-3 ring-1 ring-blue-200 text-sm">
                      <BottomLine
                        items={[
                          {
                            label: "קילו-קלוריות/ק״ג:",
                            value: fmt(modalCalc.delivered.kcal / w, 2),
                          },
                          {
                            label: "חלבון/ק״ג:",
                            value:
                              fmt(modalCalc.delivered.proteinG / w, 2) + " g/kg",
                          },
                          {
                            label: "נוזלים/ק״ג:",
                            value: fmt(modalCalc.delivered.fluidMl / w, 0) + " mL/kg",
                          },
                        ]}
                      />

                      <div className="mt-2 text-[11px] text-slate-700 text-center">
                        NPC:N:{" "}
                        <b>
                          {modalCalc.delivered.npcToN
                            ? fmt(modalCalc.delivered.npcToN, 1)
                            : "—"}
                        </b>
                        <span className="mx-2">•</span>
                        N:NPC:{" "}
                        <b>
                          {modalCalc.delivered.nToNpc
                            ? fmt(modalCalc.delivered.nToNpc, 4)
                            : "—"}
                        </b>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-700 text-center">
                        קצב הזנה:{" "}
                        <b>{modalCalc.hrs.rate ? fmt(modalCalc.hrs.rate, 0) : "—"}</b>{" "}
                        <span className="text-slate-600">mL/h</span>{" "}
                        <span className="text-slate-600">
                          ({modalCalc.hrs.source === "planned"
                            ? "לפי שעות שהוזנו"
                            : modalCalc.hrs.source === "min"
                            ? "לפי שעות מינימום"
                            : "—"})
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 justify-between border-t border-slate-200 pt-3">
                      <button
                        onClick={printPrescription}
                        className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white"
                      >
                        🖨️ הדפסה על מרשם
                      </button>

                      <button
                        onClick={emailToSelfFromSummary}
                        className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-800 ring-1 ring-blue-200"
                      >
                        ✉️ שליחה למייל עצמי
                      </button>

                      <button
                        onClick={() => setOpenKey(null)}
                        className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200"
                      >
                        סגור
                      </button>
                    </div>
                  </div>

                  {/* Electrolytes */}
                  <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-sm font-extrabold">אלקטרוליטים</div>

                    {modalCalc.delivered.electrolytes ? (
                      <>
                        <div className="mt-2 text-xs text-slate-700">
                          <b>mmol/day:</b>{" "}
                          Na {fmt(modalCalc.delivered.electrolytes.na, 1)} • K{" "}
                          {fmt(modalCalc.delivered.electrolytes.k, 1)} • Mg{" "}
                          {fmt(modalCalc.delivered.electrolytes.mg, 1)} • Ca{" "}
                          {fmt(modalCalc.delivered.electrolytes.ca, 1)} • Phos{" "}
                          {fmt(modalCalc.delivered.electrolytes.phos, 1)} • Cl{" "}
                          {fmt(modalCalc.delivered.electrolytes.chloride, 1)} •
                          Acetate {fmt(modalCalc.delivered.electrolytes.acetate, 1)}
                        </div>

                        <div className="mt-2 text-[11px] text-slate-600">
                          <b>mmol/kg:</b>{" "}
                          Na {fmt(modalCalc.delivered.electrolytes.na / w, 2)} • K{" "}
                          {fmt(modalCalc.delivered.electrolytes.k / w, 2)} • Mg{" "}
                          {fmt(modalCalc.delivered.electrolytes.mg / w, 2)} • Ca{" "}
                          {fmt(modalCalc.delivered.electrolytes.ca / w, 2)} • Phos{" "}
                          {fmt(modalCalc.delivered.electrolytes.phos / w, 2)} • Cl{" "}
                          {fmt(modalCalc.delivered.electrolytes.chloride / w, 2)} •
                          Acetate{" "}
                          {fmt(modalCalc.delivered.electrolytes.acetate / w, 2)}
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Pharmacist modal */}
        {pharmOpen ? (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setPharmOpen(false)}
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div className="text-sm font-extrabold">התייעצות עם רוקח</div>
                  <button
                    onClick={() => setPharmOpen(false)}
                    className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                  >
                    סגור
                  </button>
                </div>

                <div className="p-4 space-y-2">
                  {PHARM_LINES.map((x) => (
                    <a
                      key={x.phone}
                      href={`tel:${x.phone.replace(/-/g, "")}`}
                      className="flex items-center justify-between rounded-2xl bg-blue-50 px-3 py-3 ring-1 ring-blue-200 active:scale-[0.99]"
                    >
                      <div className="text-sm font-extrabold text-blue-800">
                        {x.label}
                      </div>
                      <div className="text-sm font-black text-blue-900">
                        {x.phone}
                      </div>
                    </a>
                  ))}
                  <div className="pt-2 text-[11px] text-slate-500">
                    שירות לקוחות: <b>1-800-600-700</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
