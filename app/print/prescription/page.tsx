"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== types ===================== */
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

  homeStartDate?: string;
  prescriptionValidUntil?: string;

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
  npcToN: number | null;
  nToNpc: number | null;

  electrolytes: Electrolytes | null;

  exposureBag?: boolean;

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

/* ===================== helpers ===================== */
function fmt(n: number, digits = 0) {
  if (!isFinite(n)) return "—";
  return n.toFixed(digits);
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function shareBlobAsPdf(blob: Blob, filename = "prescription.pdf") {
  const file = new File([blob], filename, { type: "application/pdf" });

  // @ts-ignore
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({
      title: "מרשם הזנה",
      text: "מצורף PDF",
      files: [file],
    });
    return true;
  }
  return false;
}

/* ===================== component ===================== */
export default function PrintPrescriptionPage() {
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tpn_print_payload_v3");
      if (!raw) return;
      setPayload(JSON.parse(raw));
    } catch {
      setPayload(null);
    }
  }, []);

  async function makePdfBlob() {
    const el = pageRef.current;
    if (!el) throw new Error("page element not found");

    const mod: any = await import("html2pdf.js");
    const html2pdf = mod?.default ?? mod;

    const opt = {
      margin: 0,
      filename: "prescription.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      },
      // ✅ avoid-all לפעמים “חותך”/מבלבל; נשאיר css+legacy
      pagebreak: { mode: ["css", "legacy"] },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
    };

    const worker = html2pdf().set(opt).from(el).toPdf();
    const pdf = await worker.get("pdf");
    const blob: Blob = pdf.output("blob");
    return blob;
  }

  async function onDownloadPdf() {
    try {
      setPdfBusy(true);
      const blob = await makePdfBlob();
      downloadBlob(blob, "prescription.pdf");
    } finally {
      setPdfBusy(false);
    }
  }

  async function onSharePdf() {
    try {
      setPdfBusy(true);
      const blob = await makePdfBlob();
      const shared = await shareBlobAsPdf(blob, "prescription.pdf");
      if (!shared) {
        downloadBlob(blob, "prescription.pdf");
        alert("שיתוף לא נתמך בדפדפן הזה. הורדתי את ה-PDF כדי שתוכל לצרף למייל.");
      }
    } finally {
      setPdfBusy(false);
    }
  }

  const view = useMemo(() => {
    if (!payload) return null;
    const p = payload;

    const w = Math.max(1, Number(p.weightKg) || 1);

    const kcalPerKg = p.caloriesKcal / w;
    const protPerKg = p.proteinG / w;
    const mlPerKg = p.fluidMl / w;

    const treatDays = clamp(Math.round(p.treatmentDaysPerWeek ?? 7), 1, 7);
    const vitK = !!p.additives?.vitaminK150;

    const minHoursText = p.minHoursGIR ? `${fmt(p.minHoursGIR, 1)} שעות` : "—";

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
        ? "לפי שעות שהוזנו"
        : p.hoursSource === "min"
        ? "לפי שעות מינימום"
        : "—";

    const exposure =
      p.exposureBag === true ? "כן" : p.exposureBag === false ? "לא" : "—";

    const heparinLine = p.lineCare.heparin
      ? `${p.lineCare.heparin.label} • ${p.lineCare.heparin.timesPerDay}/יום`
      : "Heparin — ללא";

    const taurolidineLine = p.lineCare.taurolidine
      ? `Taurolidine 2% — ${fmt(p.lineCare.taurolidine.ml, 0)} mL`
      : "Taurolidine 2% — ללא";

    const tauroLockLine = p.lineCare.tauroLock ? `TauroLock — 2 mL` : "TauroLock — ללא";

    return (
      <div className="wrap" dir="rtl">
        {/* Top controls (hidden in print) */}
        <div className="topbar no-print">
          <div className="topbar-inner">
            <div className="topbar-left">
              <div className="logoBox">
                <img src="/remedix-logo.png" alt="Remedix Care" />
              </div>
              <div className="topbar-text">
                <div className="tb-title">מרשם הזנה (TPN/SPN)</div>
                <div className="tb-sub">
                  נוצר: <b>{p.createdAt}</b> • לשליחה: <b>{p.sendToEmail}</b>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={onDownloadPdf}
                disabled={pdfBusy}
              >
                {pdfBusy ? "⏳ יוצר PDF..." : "⬇️ הורד PDF"}
              </button>

              <button
                className="btn btn-secondary"
                onClick={onSharePdf}
                disabled={pdfBusy}
              >
                {pdfBusy ? "⏳ יוצר PDF..." : "📤 שתף"}
              </button>

              <button className="btn" onClick={() => window.print()}>
                🖨️ הדפסה
              </button>
            </div>
          </div>
        </div>

        {/* A4 page */}
        <div className="page" ref={pageRef}>
          <div className="wm" />

          <div className="head">
            <div className="head-left">
              <div className="headLogo">
                <img src="/remedix-logo.png" alt="Remedix Care" />
              </div>
              <div className="headText">
                <div className="h-title">
                  מרשם תזונה (SPN/TPN) – נוצר על ידי <span className="brand">parenta-cal</span>
                </div>
                <div className="h-sub">
                  יצירה: {p.createdAt} • לשליחת מרשם: <b>{p.sendToEmail}</b>
                </div>
              </div>
            </div>

            {/* Big sticker box in header */}
            <div className="head-sticker">
              <div className="headStickerTitle">הדבקת מדבקת מטופל</div>
              <div className="headStickerBox">
                <div className="headStickerHint">הדבק כאן מדבקה גדולה</div>
              </div>
              <div className="headStickerMeta">
                <span>
                  ימי טיפול: <b>{treatDays}/7</b>
                </span>
                <span>
                  שירות לקוחות: <b>{p.customerServicePhone}</b>
                </span>
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="card cardInst">
              <div className="cardTitle">פרטי מוסד / דיאטנית</div>
              <div className="kv">
                <div className="k">בית חולים</div>
                <div className="v">{p.hospital || "—"}</div>

                <div className="k">מחלקה</div>
                <div className="v">{p.ward || "—"}</div>

                <div className="k">דיאטנית</div>
                <div className="v">{p.dietitian || "—"}</div>

                <div className="k">טלפון</div>
                <div className="v">{p.phone || "—"}</div>
              </div>

              <div className="divider" />

              <div className="kv2">
                <div className="k2">תאריך התחלת טיפול בבית</div>
                <div className="v2">{p.homeStartDate || "—"}</div>

                <div className="k2">תוקף המרשם</div>
                <div className="v2">{p.prescriptionValidUntil || "—"}</div>

                <div className="k2">סוג צנתר</div>
                <div className="v2">{p.catheterType || "—"}</div>
              </div>
            </div>

            <div className="card cardFormula">
              <div className="cardTitle">תמיסה</div>

              <div className="bigLine hlText">{p.formulaName}</div>

              <div className="row3">
                <div className="box">
                  <div className="box-k">Route</div>
                  <div className="box-v">{p.route}</div>
                </div>

                <div className="box hlBox">
                  <div className="box-k">נפח</div>
                  <div className="box-v">
                    {p.fluidMl.toLocaleString("en-US")} <span className="u">mL</span>
                  </div>
                </div>

                <div className="box">
                  <div className="box-k">משקל</div>
                  <div className="box-v">
                    {fmt(w, 1)} <span className="u">kg</span>
                  </div>
                </div>
              </div>

              <div className="divider soft" />

              <div className="cardSubTitle">שעות הזנה / GIR</div>
              <div className="row3">
                <div className="box miniBox">
                  <div className="box-k">מינימום שעות</div>
                  <div className="box-v">{minHoursText}</div>
                </div>
                <div className="box miniBox">
                  <div className="box-k">שעות בפועל</div>
                  <div className="box-v">{usedHoursText}</div>
                </div>
                <div className="box miniBox">
                  <div className="box-k">קצב</div>
                  <div className="box-v">
                    {p.rateMlH ? (
                      <>
                        {p.rateMlH} <span className="u">mL/h</span>{" "}
                        <span className="muted">({rateNote})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              <div className="mini">
                GIR בפועל: <b>{p.girActual ? fmt(p.girActual, 2) : "—"}</b>
              </div>

              <div className="mini muted">
                Variant: <b>{p.variantLabel}</b>
              </div>
            </div>

            <div className="card cardMacro">
              <div className="cardTitle">מאקרו (ליום)</div>

              <div className="row4">
                <div className="metric hlMetric">
                  <div className="m-k">קלוריות</div>
                  <div className="m-v">
                    {p.caloriesKcal} <span className="u">kcal</span>
                  </div>
                </div>

                <div className="metric hlMetric">
                  <div className="m-k">חלבון</div>
                  <div className="m-v">
                    {fmt(p.proteinG, 1)} <span className="u">g</span>
                  </div>
                </div>

                <div className="metric">
                  <div className="m-k">דקסטרוז</div>
                  <div className="m-v">
                    {fmt(p.dextroseG, 1)} <span className="u">g</span>
                  </div>
                </div>

                <div className="metric">
                  <div className="m-k">שומן</div>
                  <div className="m-v">
                    {fmt(p.lipidsG, 1)} <span className="u">g</span>
                  </div>
                </div>
              </div>

              <div className="mini">
                לפי ק״ג: {fmt(kcalPerKg, 2)} kcal/kg • {fmt(protPerKg, 2)} g/kg •{" "}
                {fmt(mlPerKg, 0)} mL/kg
              </div>

              <div className="mini">
                NPC: <b>{p.npcKcal}</b> kcal • N: <b>{fmt(p.nG, 2)}</b> g • NPC:N:{" "}
                <b>{p.npcToN ? fmt(p.npcToN, 1) : "—"}</b> • N:NPC:{" "}
                <b>{p.nToNpc ? fmt(p.nToNpc, 4) : "—"}</b>
              </div>
            </div>

            <div className="card hl cardAdd">
              <div className="cardTitle">תוספים</div>
              <div className="kv">
                <div className="k">Cernevit</div>
                <div className="v">{p.additives.cernevitMl} mL</div>

                <div className="k">Nutryelt</div>
                <div className="v">{p.additives.nutryeltMl} mL</div>

                <div className="k">Vitamin K (150 mcg/day)</div>
                <div className="v">{vitK ? "כן" : "לא"}</div>
              </div>
            </div>

            <div className="card cardLock">
              <div className="cardTitle">שטיפות / Lock solution (אופציונאלי)</div>
              <div className="mini">
                {p.lineCare.saline.label} — <b>{p.lineCare.saline.timesPerDay}</b>{" "}
                פעמים ביום
              </div>

              <div className="lockBlock">
                <div className="lockLine">{heparinLine}</div>
                <div className="lockLine">{taurolidineLine}</div>
                <div className="lockLine">{tauroLockLine}</div>
              </div>
            </div>

            <div className="card cardElect">
              <div className="cardTitle">אלקטרוליטים / שקית חשיפה</div>

              <div className="mini">
                {p.electrolytes ? (
                  <>
                    <b>mmol/day:</b> Na {fmt(p.electrolytes.na, 1)} • K{" "}
                    {fmt(p.electrolytes.k, 1)} • Mg {fmt(p.electrolytes.mg, 1)} • Ca{" "}
                    {fmt(p.electrolytes.ca, 1)} • Phos {fmt(p.electrolytes.phos, 1)} • Cl{" "}
                    {fmt(p.electrolytes.chloride, 1)} • Acetate{" "}
                    {fmt(p.electrolytes.acetate, 1)}
                  </>
                ) : (
                  <>אלקטרוליטים: —</>
                )}
              </div>

              <div className="row2">
                <div className="box miniBox">
                  <div className="box-k">שקית חשיפה</div>
                  <div className="box-v">{exposure}</div>
                </div>
                <div className="box miniBox">
                  <div className="box-k">ימי טיפול</div>
                  <div className="box-v">{treatDays}/7</div>
                </div>
              </div>
            </div>

            {/* Notes + Signature side-by-side */}
            <div className="pairNotesSign span2">
              <div className="card cardNotes">
                <div className="cardTitle">הערות</div>
                <div className="notesBox">{p.notes?.trim() ? p.notes : "—"}</div>
              </div>

              <div className="card signCard cardSign">
                <div className="cardTitle red">חתימת רופא</div>

                <div className="signFill">
                  <div className="signGrid">
                    <div className="signCell">
                      <div className="signLabel">חתימה</div>
                      <div className="signBox" />
                    </div>
                    <div className="signCell">
                      <div className="signLabel">חותמת</div>
                      <div className="signBox" />
                    </div>
                  </div>

                  <div className="signHint">חותמת + חתימה ברורה</div>
                </div>
              </div>
            </div>

            <div className="card span2 foot cardFoot">
              <div className="footRow">
                <div>
                  <b>התייעצות רוקח:</b>{" "}
                  {p.pharmacistPhones?.length ? p.pharmacistPhones.join(" • ") : "—"}
                </div>
                <div className="muted">
                  שירות לקוחות: <b>{p.customerServicePhone}</b>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .wrap {
            padding: 12px;
            background: #f8fafc;
            font-family: Arial, sans-serif;
          }

          /* topbar */
          .topbar {
            max-width: 980px;
            margin: 0 auto 12px auto;
          }
          .topbar-inner {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }
          .topbar-left {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }
          .logoBox {
            width: 52px;
            height: 52px;
            border-radius: 16px;
            background: white;
            border: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex: 0 0 auto;
          }
          .logoBox img {
            width: 44px;
            height: 44px;
            object-fit: contain;
          }
          .topbar-text {
            min-width: 0;
          }
          .tb-title {
            font-weight: 900;
            font-size: 16px;
            color: #0f172a;
          }
          .tb-sub {
            font-size: 12px;
            color: #334155;
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 680px;
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
            flex: 0 0 auto;
          }
          .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .btn-secondary {
            border: 1px solid #0f172a;
            background: #0f172a;
          }

          /* ✅ IMPORTANT FIX:
             Do NOT force fixed height+hidden overflow for screen/PDF.
             This was cutting the PDF (only top part). */
          .page {
            position: relative;
            width: 210mm;
            min-height: 297mm; /* ✅ */
            height: auto; /* ✅ */
            margin: 0 auto;
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            overflow: visible; /* ✅ */
            box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
            padding: 14mm 12mm 12mm 12mm;
            box-sizing: border-box;
          }

          .wm {
            position: absolute;
            inset: 0;
            background-image: url("/prescription-form.png");
            background-size: cover;
            background-repeat: no-repeat;
            background-position: center;
            opacity: 0.06;
            pointer-events: none;
          }

          .head {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e2e8f0;
          }

          .head-left {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex: 1 1 auto;
          }
          .headLogo {
            width: 44px;
            height: 44px;
            border-radius: 14px;
            background: white;
            border: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex: 0 0 auto;
          }
          .headLogo img {
            width: 36px;
            height: 36px;
            object-fit: contain;
          }
          .headText {
            min-width: 0;
          }
          .h-title {
            font-weight: 900;
            font-size: 16px;
            color: #0f172a;
            line-height: 1.15;
          }
          .brand {
            letter-spacing: 0.2px;
          }
          .h-sub {
            font-size: 11px;
            color: #334155;
            margin-top: 3px;
          }

          .head-sticker {
            flex: 0 0 auto;
            width: 100%;
            max-width: 105mm;
            border: 1px solid #e2e8f0;
            background: rgba(255, 255, 255, 0.96);
            border-radius: 14px;
            padding: 10px 12px;
          }
          .headStickerTitle {
            font-weight: 900;
            font-size: 13px;
            color: #0f172a;
            margin-bottom: 8px;
          }
          .headStickerBox {
            height: 50mm;
            border: 2px dashed rgba(15, 23, 42, 0.55);
            border-radius: 12px;
            background: rgba(248, 250, 252, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .headStickerHint {
            font-size: 12px;
            font-weight: 900;
            color: rgba(15, 23, 42, 0.75);
            text-align: center;
          }
          .headStickerMeta {
            margin-top: 8px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
            opacity: 0.95;
          }

          /* grid */
          .grid {
            position: relative;
            z-index: 1;
            margin-top: 12px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .card {
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.96);
            padding: 10px 12px;
          }
          .cardTitle {
            font-weight: 900;
            font-size: 13px;
            color: #0f172a;
            margin-bottom: 8px;
          }
          .cardTitle.red {
            color: #9f1239;
          }
          .cardSubTitle {
            font-weight: 900;
            font-size: 12px;
            color: #0f172a;
            margin-top: 2px;
          }

          .span2 {
            grid-column: 1 / span 2;
          }

          .divider {
            height: 1px;
            background: #e2e8f0;
            margin: 10px 0;
          }
          .divider.soft {
            opacity: 0.6;
          }

          .kv {
            display: grid;
            grid-template-columns: 110px 1fr;
            gap: 6px 10px;
            align-items: baseline;
          }
          .k {
            font-size: 11px;
            color: #475569;
            font-weight: 900;
          }
          .v {
            font-size: 12px;
            color: #0f172a;
            font-weight: 800;
          }

          .kv2 {
            display: grid;
            grid-template-columns: 160px 1fr;
            gap: 6px 10px;
            align-items: baseline;
          }
          .k2 {
            font-size: 11px;
            color: #475569;
            font-weight: 900;
          }
          .v2 {
            font-size: 12px;
            color: #0f172a;
            font-weight: 900;
            background: rgba(254, 249, 195, 0.9);
            border: 1px solid rgba(245, 158, 11, 0.35);
            padding: 4px 8px;
            border-radius: 10px;
            display: inline-block;
          }

          .bigLine {
            font-size: 13px;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.25;
          }

          .row3 {
            margin-top: 8px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 8px;
          }
          .row2 {
            margin-top: 10px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .row4 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 8px;
          }

          .box {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 8px 10px;
            background: #f8fafc;
          }
          .miniBox {
            padding: 7px 9px;
          }
          .box-k {
            font-size: 10px;
            color: #475569;
            font-weight: 900;
          }
          .box-v {
            font-size: 12px;
            color: #0f172a;
            font-weight: 900;
            margin-top: 4px;
            line-height: 1.2;
          }

          .metric {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 8px 10px;
            background: #ffffff;
          }
          .m-k {
            font-size: 10px;
            color: #475569;
            font-weight: 900;
          }
          .m-v {
            font-size: 13px;
            color: #0f172a;
            font-weight: 900;
            margin-top: 4px;
          }

          .u {
            font-size: 10px;
            color: #475569;
            font-weight: 900;
          }
          .muted {
            font-size: 11px;
            color: #64748b;
            font-weight: 800;
          }
          .mini {
            margin-top: 8px;
            font-size: 11px;
            color: #0f172a;
            font-weight: 800;
            line-height: 1.35;
          }

          .lockBlock {
            margin-top: 10px;
            border: 1px dashed rgba(15, 23, 42, 0.25);
            border-radius: 12px;
            padding: 10px;
            background: rgba(248, 250, 252, 0.9);
          }
          .lockLine {
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.35;
          }

          /* yellow highlight */
          .hl {
            background: rgba(254, 249, 195, 0.72);
            border: 1px solid rgba(202, 138, 4, 0.28);
          }
          .hlMetric {
            background: rgba(254, 249, 195, 0.72);
            border: 1px solid rgba(202, 138, 4, 0.28);
          }
          .hlBox {
            background: rgba(254, 249, 195, 0.72);
            border: 1px solid rgba(202, 138, 4, 0.28);
          }
          .hlText {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            background: rgba(254, 249, 195, 0.72);
            border: 1px solid rgba(202, 138, 4, 0.28);
          }

          .notesBox {
            min-height: 56px;
            border: 1px solid rgba(15, 23, 42, 0.2);
            border-radius: 12px;
            padding: 8px;
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
            background: rgba(255, 255, 255, 0.95);
            white-space: pre-wrap;
          }

          .pairNotesSign {
            grid-column: 1 / span 2;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            align-items: stretch;
          }
          .cardNotes,
          .cardSign {
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .cardNotes .notesBox {
            flex: 1 1 auto;
          }

          .signCard {
            background: rgba(254, 226, 226, 0.65);
            border: 1px solid rgba(244, 63, 94, 0.35);
          }
          .signFill {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 8px;
          }
          .signGrid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 2px;
          }
          .signCell {
            display: flex;
            flex-direction: column;
            gap: 6px;
            align-items: flex-start;
          }
          .signLabel {
            font-size: 11px;
            font-weight: 900;
            color: #9f1239;
          }
          .signBox {
            height: 26px;
            width: 100%;
            border-radius: 10px;
            background: white;
            border: 1px solid rgba(244, 63, 94, 0.35);
          }
          .signHint {
            font-size: 10px;
            font-weight: 900;
            color: #9f1239;
            text-align: center;
          }

          .foot {
            background: rgba(248, 250, 252, 0.95);
          }
          .footRow {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
          }

          @page {
            size: A4;
            margin: 0;
          }

          /* ===================== PRINT OVERRIDES ===================== */
          @media print {
            html,
            body {
              width: 210mm;
              height: 297mm;
              margin: 0 !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background: white !important;
            }

            .no-print {
              display: none !important;
            }
            .wrap {
              padding: 0 !important;
              background: white !important;
            }

            /* ✅ In print, we DO enforce exact A4 and prevent a second page */
            .page {
              width: 210mm !important;
              height: 297mm !important;
              min-height: 297mm !important;
              overflow: hidden !important;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              margin: 0 !important;
              padding: 10mm 10mm 7mm 10mm !important;
              box-sizing: border-box !important;

              page-break-after: avoid !important;
              page-break-before: avoid !important;
              page-break-inside: avoid !important;
              break-after: avoid-page !important;
              break-before: avoid-page !important;
              break-inside: avoid-page !important;
            }

            .wm {
              opacity: 0.05 !important;
            }

            /* 3 columns in print to save height */
            .grid {
              margin-top: 8px !important;
              grid-template-columns: 1fr 1fr 1fr !important;
              gap: 6px !important;
            }
            .span2 {
              grid-column: auto !important;
            }
            .cardFoot {
              grid-column: 1 / span 3 !important;
            }
            .pairNotesSign {
              grid-column: 1 / span 3 !important;
              gap: 6px !important;
            }

            .card {
              padding: 8px 10px !important;
              border-radius: 12px !important;
            }
            .cardTitle {
              font-size: 12px !important;
              margin-bottom: 6px !important;
            }
            .mini {
              font-size: 10px !important;
              margin-top: 6px !important;
            }
            .muted {
              font-size: 10px !important;
            }

            .row3,
            .row4,
            .row2 {
              gap: 6px !important;
            }
            .box,
            .metric {
              padding: 6px 8px !important;
              border-radius: 10px !important;
            }
            .box-v {
              font-size: 11px !important;
            }
            .m-v {
              font-size: 12px !important;
            }

            .divider {
              margin: 8px 0 !important;
            }

            .head {
              padding-bottom: 6px !important;
              gap: 10px !important;
            }
            .h-title {
              font-size: 14px !important;
            }
            .h-sub {
              font-size: 10px !important;
            }

            .head-sticker {
              max-width: 105mm !important;
              padding: 8px 10px !important;
            }
            .headStickerBox {
              height: 50mm !important;
            }
            .headStickerMeta {
              font-size: 10px !important;
            }

            .lockBlock {
              padding: 8px !important;
              margin-top: 8px !important;
            }

            .notesBox {
              min-height: 44px !important;
              padding: 6px !important;
              font-size: 10px !important;
            }

            .signGrid {
              gap: 6px !important;
              margin-top: 0 !important;
            }
            .signBox {
              height: 18px !important;
            }
            .signHint {
              font-size: 9.5px !important;
            }

            * {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        `}</style>
      </div>
    );
  }, [payload, pdfBusy]);

  if (!payload) {
    return (
      <div style={{ padding: 16, fontFamily: "Arial" }} dir="rtl">
        לא נמצא מידע להדפסה. חזור לכלי, פתח תמיסה ולחץ "הדפסה על מרשם".
      </div>
    );
  }

  return view;
}
