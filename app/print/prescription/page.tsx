"use client";

import React, { useEffect, useMemo, useState } from "react";

type Electrolytes = {
  na: number;
  k: number;
  mg: number;
  ca: number;
  phos: number;
  acetate: number;
  chloride: number;
};

type PrintPayload = {
  createdAt: string;

  hospital: string;
  ward: string;
  dietitian: string;
  phone: string;

  catheterType:
    | "PICC"
    | "Hickman / Tunnelled"
    | "Port (Port-a-cath)"
    | "CVC (Temporary / Non-tunnelled)";

  weightKg: number;

  formulaName: string;
  route: "Central" | "Peripheral";
  variantLabel: string;

  caloriesKcal: number;
  proteinG: number;
  lipidsG: number;
  fluidMl: number;

  dextroseG: number;
  minHoursGIR: number | null;

  hoursUsed: number | null;
  hoursSource: "planned" | "min" | "none";
  rateMlH: number | null;
  girActual: number | null;

  npcKcal: number;
  nG: number;
  npcToN: number | null; // NPC:N
  nToNpc: number | null; // N:NPC

  electrolytes: Electrolytes | null;

  additives: {
    cernevitMl: 5 | 10;
    nutryeltMl: 10 | 20;
    vitaminK150?: boolean;
  };

  treatmentDaysPerWeek?: number;

  lineCare: {
    saline: { label: string; timesPerDay: number };
    heparin: { label: string; timesPerDay: number } | null;
    tauroLock: { label: string; ml: 2 } | null;
    taurolidine: { label: string; ml: number } | null;
  };

  pharmacistPhones: string[];
  customerServicePhone: string;
  sendToEmail: string;

  notes: string;
};

function fmt(n: number, digits = 0) {
  if (!isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function PrintPrescriptionPage() {
  const [payload, setPayload] = useState<PrintPayload | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tpn_print_payload_v3");
      if (!raw) return;
      setPayload(JSON.parse(raw));
    } catch {
      setPayload(null);
    }
  }, []);

  const content = useMemo(() => {
    if (!payload) return null;
    const p = payload;

    const minHoursText = p.minHoursGIR
      ? `${fmt(p.minHoursGIR, 1)} שעות (מחושב לפי GIR)`
      : "—";

    const usedHoursText = p.hoursUsed
      ? `${fmt(p.hoursUsed, 1)} שעות ${
          p.hoursSource === "planned"
            ? "(הוזנו)"
            : p.hoursSource === "min"
            ? "(מינימום)"
            : ""
        }`
      : "—";

    const rateNote =
      p.hoursSource === "planned"
        ? "(הקצב נקבע לפי השעות שהוזנו)"
        : p.hoursSource === "min"
        ? "(הקצב נקבע לפי שעות המינימום)"
        : "";

    const kcalPerKg = p.weightKg > 0 ? p.caloriesKcal / p.weightKg : 0;
    const protPerKg = p.weightKg > 0 ? p.proteinG / p.weightKg : 0;
    const mlPerKg = p.weightKg > 0 ? p.fluidMl / p.weightKg : 0;

    const heparinLine = p.lineCare.heparin
      ? `${p.lineCare.heparin.label} — ${p.lineCare.heparin.timesPerDay} שטיפות/יום`
      : "Heparin — ללא";

    const tauroLockLine = p.lineCare.tauroLock
      ? `TauroLock - 2 mL`
      : "TauroLock - 2 mL — ללא";

    const taurolidineLine = p.lineCare.taurolidine
      ? `Taurolidine 2% — ${fmt(p.lineCare.taurolidine.ml, 0)} mL`
      : "Taurolidine 2% — ללא";

    const treatDays = Math.max(
      1,
      Math.min(7, Math.round(p.treatmentDaysPerWeek ?? 7))
    );
    const vitKChecked = !!p.additives?.vitaminK150;

    return (
      <div className="print-wrap" dir="rtl">
        {/* header */}
        <div className="print-head">
          <div className="logo">
            <img src="/remedix-logo.png" alt="Remedix Care" />
          </div>
          <div className="head-text">
            <div className="title">מרשם הזנה (TPN/SPN)</div>
            <div className="sub">
              יצירה: {p.createdAt} • לשליחת מרשם: <b>{p.sendToEmail}</b>
            </div>
          </div>
        </div>

        {/* form sheet */}
        <div className="sheet">
          <div className="bg" />

          <div className="sticker">
            <div className="sticker-title">הדבקת מדבקה</div>
          </div>

          {/* Institution fields */}
          <div className="f hospital">{p.hospital || "—"}</div>
          <div className="f ward">{p.ward || "—"}</div>
          <div className="f dietitian">{p.dietitian || "—"}</div>
          <div className="f phone">{p.phone || "—"}</div>

          {/* Formula */}
          <div className="f formula">{p.formulaName}</div>
          <div className="f route">{p.route}</div>
          <div className="f catheter">צנתר: {p.catheterType}</div>
          <div className="f vol">
            {p.fluidMl.toLocaleString("en-US")} <span className="u">mL</span>
          </div>

          {/* Main numbers */}
          <div className="f kcal">
            קלוריות: {p.caloriesKcal} <span className="u">kcal</span>
          </div>
          <div className="f protein">
            חלבון: {fmt(p.proteinG, 1)} <span className="u">g</span>
          </div>
          <div className="f lipids">
            שומן: {fmt(p.lipidsG, 1)} <span className="u">g</span>
          </div>
          <div className="f dex">
            דקסטרוז: {fmt(p.dextroseG, 1)} <span className="u">g</span>
          </div>

          {/* Hours / rate */}
          <div className="f minhours">{minHoursText}</div>
          <div className="f usedhours">{usedHoursText}</div>
          <div className="f rate">
            {p.rateMlH ? (
              <>
                קצב: {p.rateMlH} <span className="u">mL/h</span> {rateNote}
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="f gir">
            {p.girActual ? <>GIR: {fmt(p.girActual, 2)}</> : "GIR: —"}
          </div>

          {/* NPC / N */}
          <div className="f npc">
            NPC: {p.npcKcal} <span className="u">kcal</span> • N:{" "}
            {fmt(p.nG, 2)} <span className="u">g</span> • NPC:N:{" "}
            {p.npcToN ? fmt(p.npcToN, 1) : "—"} • N:NPC:{" "}
            {p.nToNpc ? fmt(p.nToNpc, 4) : "—"}
          </div>

          <div className="f perkg">
            לפי ק״ג: {fmt(kcalPerKg, 2)} <span className="u">kcal/kg</span> •{" "}
            {fmt(protPerKg, 2)} <span className="u">g/kg</span> •{" "}
            {fmt(mlPerKg, 0)} <span className="u">mL/kg</span>
          </div>

          {/* additives */}
          <div className="f additives">
            Cernevit: {p.additives.cernevitMl} <span className="u">mL</span>{" "}
            (מנה סטנדרטית יומית: 5 mL) • Nutryelt: {p.additives.nutryeltMl}{" "}
            <span className="u">mL</span> (מנה סטנדרטית יומית: 10 mL)
            <div style={{ marginTop: 6 }}>
              ויטמין K (150 mcg/day):{" "}
              <span className="box">{vitKChecked ? "☑" : "□"}</span>
            </div>
          </div>

          {/* line care */}
          <div className="f linecare">
            {p.lineCare.saline.label} — מס׳ שטיפות/יום:{" "}
            {p.lineCare.saline.timesPerDay}
            <br />
            {heparinLine}
            <br />
            {taurolidineLine}
            <br />
            {tauroLockLine}
          </div>

          {/* electrolytes + exposure bag + treatment days */}
          <div className="f elec">
            <div>
              {p.electrolytes ? (
                <>
                  אלקטרוליטים (mmol/day): Na {fmt(p.electrolytes.na, 1)} • K{" "}
                  {fmt(p.electrolytes.k, 1)} • Mg {fmt(p.electrolytes.mg, 1)} •
                  Ca {fmt(p.electrolytes.ca, 1)} • Phos{" "}
                  {fmt(p.electrolytes.phos, 1)} • Cl{" "}
                  {fmt(p.electrolytes.chloride, 1)} • Acetate{" "}
                  {fmt(p.electrolytes.acetate, 1)}
                </>
              ) : (
                <>אלקטרוליטים: —</>
              )}
            </div>

            <div style={{ marginTop: 6 }}>
              האם לשלוח שקית חשיפה לתמיסה? <span className="box">□</span> כן{" "}
              <span className="box" style={{ marginRight: 10 }}>
                □
              </span>{" "}
              לא
            </div>

            <div style={{ marginTop: 6 }}>
              ימי טיפול בשבוע (עד 7): <b>{treatDays}</b>/7
            </div>
          </div>

          {/* notes */}
          <div className="f notes">{p.notes || "—"}</div>

          {/* footer */}
          <div className="f release">תאריך תחילת טיפול בבית: ____________</div>
          <div className="f validity">תוקף מרשם: ____________</div>
          <div className="f sign">חתימת רופא: ___________________________</div>
        </div>

        {/* actions */}
        <div className="no-print actions">
          <button className="btn" onClick={() => window.print()}>
            🖨️ הדפסה
          </button>

          <a
            className="btn btn2"
            href={`mailto:${payload.sendToEmail}?subject=${encodeURIComponent(
              "מרשם הזנה - TPN/SPN"
            )}&body=${encodeURIComponent(
              "נשלח מהמערכת. ניתן להדפיס/לשמור PDF מהדפדפן."
            )}`}
          >
            ✉️ שליחה למייל
          </a>
        </div>

        <style jsx>{`
          .print-wrap {
            padding: 16px;
            background: #f8fafc;
          }

          .print-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 0 auto 12px auto;
            max-width: 900px;
          }
          .logo {
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: white;
            border: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .logo img {
            width: 46px;
            height: 46px;
            object-fit: contain;
          }
          .head-text {
            flex: 1;
            text-align: right;
          }
          .title {
            font-weight: 900;
            font-size: 18px;
            color: #0f172a;
          }
          .sub {
            font-size: 12px;
            color: #334155;
            margin-top: 2px;
          }

          .sheet {
            position: relative;
            width: 210mm;
            height: 297mm;
            margin: 0 auto;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
          }

          .bg {
            position: absolute;
            inset: 0;
            background-image: url("/prescription-form.png");
            background-size: cover;
            background-repeat: no-repeat;
            background-position: center;
            opacity: 0.25;
          }

          .sticker {
            position: absolute;
            left: 6%;
            top: 10%;
            width: 34%;
            height: 10%;
            border: 2px solid #0f172a;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.75);
            display: flex;
            align-items: flex-start;
            padding: 10px;
          }
          .sticker-title {
            font-weight: 900;
            font-size: 13px;
            color: #0f172a;
          }

          .f {
            position: absolute;
            font-family: Arial, sans-serif;
            color: #0f172a;
            font-size: 13px;
            font-weight: 700;
            background: rgba(255, 255, 255, 0.78);
            padding: 4px 6px;
            border-radius: 8px;
            border: 1px solid rgba(15, 23, 42, 0.15);
            max-width: 88%;
            white-space: nowrap;
          }

          .u {
            font-size: 11px;
            color: #334155;
            font-weight: 800;
            margin-right: 3px;
          }

          .box {
            display: inline-block;
            width: 18px;
            text-align: center;
            font-weight: 900;
          }

          .npc,
          .perkg,
          .additives,
          .linecare,
          .elec,
          .notes {
            white-space: normal;
          }

          .hospital {
            right: 6%;
            top: 8%;
            width: 26%;
          }
          .ward {
            right: 6%;
            top: 12%;
            width: 26%;
          }
          .dietitian {
            right: 6%;
            top: 16%;
            width: 26%;
          }
          .phone {
            right: 6%;
            top: 20%;
            width: 26%;
          }

          .formula {
            left: 6%;
            top: 22%;
            width: 46%;
            text-align: right;
          }
          .route {
            left: 6%;
            top: 26%;
            width: 20%;
          }
          .catheter {
            left: 6%;
            top: 30%;
            width: 32%;
          }
          .vol {
            left: 6%;
            top: 34%;
            width: 20%;
          }

          .kcal {
            right: 6%;
            top: 34%;
            width: 30%;
          }
          .protein {
            right: 6%;
            top: 38%;
            width: 30%;
          }
          .lipids {
            right: 6%;
            top: 42%;
            width: 30%;
          }
          .dex {
            right: 6%;
            top: 46%;
            width: 30%;
          }

          .minhours {
            left: 6%;
            top: 40%;
            width: 46%;
          }
          .usedhours {
            left: 6%;
            top: 44%;
            width: 46%;
          }
          .rate {
            left: 6%;
            top: 48%;
            width: 46%;
            font-size: 12px;
          }
          .gir {
            left: 6%;
            top: 52%;
            width: 22%;
          }

          .npc {
            right: 6%;
            top: 56%;
            width: 88%;
            font-size: 12px;
          }
          .perkg {
            right: 6%;
            top: 60%;
            width: 88%;
            font-size: 12px;
          }

          .additives {
            right: 6%;
            top: 64%;
            width: 88%;
            font-size: 12px;
            line-height: 1.35;
          }
          .linecare {
            right: 6%;
            top: 71%;
            width: 88%;
            font-size: 12px;
            line-height: 1.35;
          }

          .elec {
            right: 6%;
            top: 81%;
            width: 88%;
            font-size: 12px;
            line-height: 1.35;
          }
          .notes {
            right: 6%;
            top: 88%;
            width: 88%;
            min-height: 34px;
            white-space: pre-wrap;
          }

          .release {
            right: 6%;
            bottom: 10%;
            width: 32%;
            font-size: 12px;
          }
          .validity {
            right: 40%;
            bottom: 10%;
            width: 24%;
            font-size: 12px;
          }

          .sign {
            right: 6%;
            bottom: 6%;
            width: 88%;
            font-size: 12px;
            white-space: nowrap;
          }

          .actions {
            max-width: 900px;
            margin: 12px auto 0 auto;
            display: flex;
            gap: 8px;
            justify-content: flex-end;
          }
          .btn {
            border: 1px solid #1d4ed8;
            background: #1d4ed8;
            color: white;
            padding: 10px 14px;
            border-radius: 12px;
            font-weight: 900;
            font-size: 12px;
            cursor: pointer;
          }
          .btn2 {
            background: #eff6ff;
            border-color: #bfdbfe;
            color: #1e40af;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
          }

          @media print {
            .no-print {
              display: none !important;
            }
            .print-wrap {
              padding: 0;
              background: white;
            }
            .sheet {
              box-shadow: none;
              border: none;
              border-radius: 0;
            }
            .bg {
              opacity: 0.35;
            }
          }
        `}</style>
      </div>
    );
  }, [payload]);

  if (!payload) {
    return (
      <div style={{ padding: 16, fontFamily: "Arial" }} dir="rtl">
        לא נמצא מידע להדפסה. חזור לכלי, פתח תמיסה ולחץ "הדפסה על מרשם".
      </div>
    );
  }

  return content;
}
