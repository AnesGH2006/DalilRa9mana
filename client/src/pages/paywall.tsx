import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE } from "@/lib/deployment";
import { useSchoolStage } from "@/hooks/use-school-stage";

const BASE: string = (import.meta as any).env?.BASE_URL ?? "/";

/** WhatsApp number for the "school groups" card, in international format without + (for example 213550123456). */
const CONTACT_PHONE = "";

type Option = { plan: string; amountDzd: number };
type Me = {
  role: string; // owner | admin | teacher | supervisor | counselor | parent
  options: Option[];
  trialAvailable: boolean;
  staffTrialAvailable?: boolean;
  prices: { school: Record<string, number>; staff: number; parent: number };
};
type Persona = "school" | "staff" | "parent";

const COLORS = {
  free: "#64748b",
  parent: "#3b82f6",
  staff: "#10b981",
  school: "#8b5cf6",
  groups: "#f59e0b",
} as const;

const SCHOOL_PLAN_LABEL: Record<string, string> = { basic: "الخطة القياسية", pro: "Pro" };

const FEATURES = {
  free: ["حتى 50 تلميذاً", "تسجيل الحضور والغياب الأساسي", "إدخال النقاط والنتائج", "لوحة التحكم المبسطة"],
  parent: [
    "متابعة علامات ونتائج الأبناء",
    "استعمال الزمن ومواعيد الانصراف اليومية",
    "تنبيهات الغياب والتأخر الفورية",
    "إشعارات المؤسسة والتواصل مع الإدارة",
  ],
  staff: [
    "توليد الملاحظات بالذكاء الاصطناعي (AI)",
    "مسح وقراءة الشهادات (OCR) الطبية",
    "تصدير ملفات Excel وحقنها تلقائياً",
    "تسجيل الغيابات بنقرة زر واحدة",
    "طباعة التقارير واستدعاءات الأولياء",
    "استعمال الزمن وتوزيع الحصص والقاعات",
  ],
  school: [
    "وصول كامل لجميع الأساتذة والمستشارين",
    "ربط غير محدود للحسابات الإدارية",
    "لوحة قيادة المدير الشامل (Head Admin)",
    "تكامل تام مع نظام الرقمنة الوزاري",
    "أولوية الدعم الفني والتفعيل الفوري",
  ],
  groups: [
    "عدد مدارس وتلاميذ غير محدود",
    "كل ميزات Pro والمؤسسة",
    "تقارير وإحصائيات مخصصة",
    "وكيل سطح المكتب وتكامل خاص",
    "مرافقة ودعم مخصص 24/7",
  ],
};

const PERSONAS: Array<{ id: Persona; label: string; icon: string }> = [
  { id: "school", label: "صاحب مؤسسة", icon: "🏫" },
  { id: "staff", label: "أستاذ / مشرف", icon: "🧑‍🏫" },
  { id: "parent", label: "ولي أمر", icon: "👪" },
];

const TRUST = [
  { icon: "🔒", text: "دفع آمن عبر Chargily" },
  { icon: "💳", text: "بطاقة CIB أو الذهبية" },
  { icon: "⚡", text: "تفعيل فوري بعد التأكيد" },
  { icon: "🧾", text: "سنة كاملة بدون تجديد تلقائي" },
];

const STEPS = [
  { n: "1", text: "اختر الباقة المناسبة لدورك في المؤسسة" },
  { n: "2", text: "أتمّ الدفع الآمن بالبطاقة الذهبية / CIB" },
  { n: "3", text: "تُفعَّل الميزات الاحترافية لحسابك فوراً" },
];

const FAQ = [
  { q: "متى يتفعّل اشتراكي؟", a: "فور تأكيد الدفع، وغالباً خلال ثوانٍ. ستنتقل تلقائياً إلى الصفحة المناسبة لحسابك." },
  { q: "خُصم المبلغ ولم يتفعّل اشتراكي، ماذا أفعل؟", a: "لا تدفع مرة ثانية. انتظر بضع دقائق ثم حدّث الصفحة، وإن استمر الأمر فتواصل مع الدعم وأرسل رقم العملية الظاهر في عنوان صفحة العودة." },
  { q: "هل يُجدَّد الاشتراك تلقائياً؟", a: "لا. الاشتراك لسنة واحدة، ولن يُخصم منك أي مبلغ آخر دون أن تدفع بنفسك." },
  { q: "هل تحفظون بيانات بطاقتي؟", a: "لا. تتم عملية الدفع كاملة على صفحة Chargily الآمنة، ولا تصلنا بيانات البطاقة." },
];

const STYLE = `
.pw-root { min-height: 100vh; background: radial-gradient(ellipse 90% 60% at 50% -10%, #1a2250 0%, #0b1020 60%); color: #e6e9f2; padding: 28px 16px 56px; font-family: inherit; }
.pw-inner { max-width: 1260px; margin: 0 auto; }
.pw-hero { text-align: center; margin-bottom: 22px; }
.pw-hero h1 { font-size: clamp(24px, 4vw, 38px); font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px; }
.pw-hero p { color: #9aa6c4; margin: 0 auto; max-width: 620px; font-size: 15px; line-height: 1.7; }
.pw-trust { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; margin: 16px 0 6px; }
.pw-trust span { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; color: #cbd5e6; }
.pw-stage { max-width: 620px; margin: 18px auto 0; padding: 16px; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; background: rgba(255,255,255,0.04); text-align: right; }
.pw-stage-title { margin: 0 0 5px; font-size: 15px; font-weight: 750; color: #f1f5f9; }
.pw-stage-description, .pw-stage-status { margin: 0; color: #9aa6c4; font-size: 12.5px; line-height: 1.7; }
.pw-stage-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0 8px; }
.pw-stage-option { padding: 11px 12px; border: 1px solid rgba(255,255,255,0.14); border-radius: 11px; background: rgba(255,255,255,0.04); color: #cbd5e6; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.pw-stage-option[aria-pressed="true"] { border-color: #3b82f6; background: rgba(59,130,246,0.18); color: #fff; }
.pw-stage-option:disabled { cursor: wait; opacity: .6; }
.pw-persona { display: flex; justify-content: center; margin: 22px 0 30px; }
.pw-persona-inner { display: inline-flex; gap: 4px; padding: 4px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; max-width: 100%; overflow-x: auto; }
.pw-persona button { border: 0; background: transparent; color: #aab4cf; padding: 9px 16px; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
.pw-persona button[aria-pressed="true"] { background: #3b82f6; color: #fff; box-shadow: 0 4px 14px rgba(59,130,246,0.35); }
.pw-persona button:hover:not([aria-pressed="true"]) { background: rgba(255,255,255,0.07); color: #fff; }
.pw-grid { display: grid; gap: 18px; grid-template-columns: 1fr; align-items: stretch; }
@media (min-width: 640px) { .pw-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 960px) { .pw-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1240px) { .pw-grid { grid-template-columns: repeat(5, 1fr); } }
.pw-card { position: relative; display: flex; flex-direction: column; gap: 14px; padding: 22px 20px 20px; border-radius: 22px; background: linear-gradient(180deg, rgba(22,30,64,0.95), rgba(13,19,42,0.95)); border: 1.5px solid var(--accent-soft); transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease; overflow: hidden; }
.pw-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--accent); }
.pw-card:hover { transform: translateY(-4px); box-shadow: 0 14px 34px var(--accent-glow); }
.pw-card[data-active="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 16px 40px var(--accent-glow); }
.pw-card[data-active="false"] { opacity: .78; }
@media (max-width: 1239px) { .pw-card[data-active="true"] { order: -1; } }
.pw-tag { position: absolute; top: 12px; inset-inline-end: 12px; background: var(--accent); color: #06130d; border-radius: 999px; padding: 3px 11px; font-size: 11px; font-weight: 800; }
.pw-badge { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; background: var(--accent-soft); color: #fff; border: 1px solid var(--accent); border-radius: 12px; padding: 7px 12px; font-size: 13px; font-weight: 700; max-width: 100%; }
.pw-price { font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -1px; }
.pw-unit { color: #9aa6c4; font-size: 13px; margin-inline-start: 4px; }
.pw-sub { color: #9aa6c4; font-size: 13px; margin-top: 6px; }
.pw-month { color: var(--accent); font-size: 12px; font-weight: 700; margin-top: 4px; }
.pw-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 10px; font-size: 13.5px; line-height: 1.5; }
.pw-list li { display: flex; gap: 9px; align-items: flex-start; }
.pw-check { flex: 0 0 auto; width: 18px; height: 18px; border-radius: 50%; background: var(--accent-soft); border: 1.5px solid var(--accent); color: var(--accent); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; margin-top: 2px; }
.pw-foot { margin-top: auto; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); display: grid; gap: 8px; }
.pw-btn { border: 0; border-radius: 12px; padding: 12px 14px; font-size: 14px; font-weight: 700; cursor: pointer; color: #fff; background: linear-gradient(135deg, #059669, #10b981); transition: filter .15s, transform .1s; }
.pw-btn:hover:not(:disabled) { filter: brightness(1.08); }
.pw-btn:active:not(:disabled) { transform: scale(0.98); }
.pw-btn:disabled { background: #334155; color: #94a3b8; cursor: not-allowed; }
.pw-btn-outline { background: transparent; border: 1.5px solid var(--accent); color: var(--accent); }
.pw-btn-outline:hover:not(:disabled) { background: var(--accent-soft); filter: none; }
.pw-trial { background: transparent; border: 1px solid #10b981; color: #6ee7b7; }
.pw-trial:hover:not(:disabled) { background: rgba(16,185,129,0.12); filter: none; }
.pw-note { color: #7f8aa8; font-size: 12px; text-align: center; }
.pw-error { max-width: 760px; margin: 0 auto 18px; background: rgba(239,68,68,0.13); border: 1px solid #ef4444; border-radius: 12px; padding: 11px 15px; font-size: 14px; }
.pw-section { margin-top: 38px; }
.pw-section h2 { font-size: 18px; font-weight: 700; margin: 0 0 14px; }
.pw-steps { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.pw-step { display: flex; gap: 12px; align-items: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 14px 16px; font-size: 14px; }
.pw-step b { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #3b82f6; color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.pw-faq details { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 13px 16px; margin-bottom: 10px; }
.pw-faq summary { cursor: pointer; font-weight: 600; font-size: 14.5px; }
.pw-faq p { color: #9aa6c4; font-size: 13.5px; line-height: 1.8; margin: 10px 0 0; }
.pw-skel { height: 440px; border-radius: 22px; background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.09), rgba(255,255,255,0.04)); background-size: 200% 100%; animation: pw-shimmer 1.4s infinite; }
@keyframes pw-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.pw-link { color: #93c5fd; }
@media (prefers-reduced-motion: reduce) { .pw-card, .pw-btn, .pw-skel { transition: none; animation: none; } }
`;

function accentVars(color: string): CSSProperties {
  return {
    ["--accent" as any]: color,
    ["--accent-soft" as any]: `${color}2e`,
    ["--accent-glow" as any]: `${color}40`,
  };
}

function Card(props: {
  accent: string;
  active: boolean;
  tag?: string;
  badge: ReactNode;
  price: ReactNode;
  features: string[];
  footer: ReactNode;
}) {
  return (
    <section className="pw-card" data-active={props.active} style={accentVars(props.accent)}>
      {props.tag && <span className="pw-tag">{props.tag}</span>}
      <span className="pw-badge">{props.badge}</span>
      <div>{props.price}</div>
      <ul className="pw-list">
        {props.features.map(text => (
          <li key={text}>
            <span className="pw-check" aria-hidden="true">✓</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <div className="pw-foot">{props.footer}</div>
    </section>
  );
}

function perMonth(amount: number): string {
  return `≈ ${Math.round(amount / 12).toLocaleString("en-US")} دج في الشهر`;
}

export default function PaywallScreen() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [persona, setPersona] = useState<Persona>("school");
  const { stage, stageConfigured, stageLoading, stageSaving, stageError, chooseStage } = useSchoolStage();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/payments/me`, { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل الباقات. حدّث الصفحة وحاول مرة أخرى.");
      const data = (await res.json()) as Me;
      setMe(data);
      if (data.role === "teacher" || data.role === "supervisor") setPersona("staff");
      else if (data.role === "parent") setPersona("parent");
    } catch (e: any) {
      setError(e?.message ?? "تعذر تحميل الباقات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function chooseInstitutionStage(nextStage: SchoolStage) {
    if (await chooseStage(nextStage)) await load();
  }

  async function pay(amountDzd: number) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BASE}api/payments/chargily/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountDzd }),
      });
      const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !data.checkoutUrl) throw new Error(data.error ?? "تعذر بدء عملية الدفع");
      window.location.href = data.checkoutUrl;
    } catch (e: any) {
      setError(e?.message ?? "تعذر بدء عملية الدفع");
      setBusy(false);
    }
  }

  async function startTrial(plan: "basic" | "pro" | "staff") {
    setTrialBusy(plan);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${BASE}api/payments/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "تعذر تفعيل التجربة المجانية");
      setNotice(`تم تفعيل التجربة المجانية لمدة 30 يوماً. جارٍ نقلك إلى التطبيق…`);
      window.setTimeout(() => window.location.replace(BASE), 900);
    } catch (e: any) {
      setError(e?.message ?? "تعذر تفعيل التجربة المجانية");
      setTrialBusy(null);
    }
  }

  async function startFree() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BASE}api/payments/free/activate`, { method: "POST", credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "تعذر تفعيل الباقة المجانية");
      setNotice("تم تفعيل الباقة المجانية. جارٍ نقلك إلى لوحة التحكم…");
      // Go to the dashboard (not whatever page the person was on) and replace the paywall in history,
      // so the Back button does not return to it.
      window.setTimeout(() => window.location.replace(BASE), 900);
    } catch (e: any) {
      setError(e?.message ?? "تعذر تفعيل الباقة المجانية");
      setBusy(false);
    }
  }

  function contactUs() {
    if (CONTACT_PHONE) {
      const text = encodeURIComponent("مرحباً، أريد معلومات عن باقة مجموعات المدارس في دليل الرقمنة");
      window.open(`https://wa.me/${CONTACT_PHONE}?text=${text}`, "_blank", "noopener,noreferrer");
    } else {
      setError("للتواصل بخصوص باقة مجموعات المدارس، راسل الدعم التقني لمنصة دليل الرقمنة.");
    }
  }

  const options = me?.options ?? [];
  const parentOption = options.find(o => o.plan === "parent");
  const staffOption = options.find(o => o.plan === "staff");
  const schoolOptions = options.filter(o => o.plan !== "parent" && o.plan !== "staff");
  const schoolPrices = useMemo(() => Object.entries(me?.prices.school ?? {}), [me]);
  const schoolShown: Array<readonly [string, number]> = schoolOptions.length
    ? schoolOptions.map(o => [o.plan, o.amountDzd] as const)
    : schoolPrices.map(([plan, amount]) => [plan, Number(amount)] as const);
  const canStartFree = me?.role === "owner";
  const stageRequired = me?.role === "owner";
  const stageReady = !stageRequired || stageConfigured;
  const parentPrice = me?.prices.parent ?? 500;
  const staffPrice = me?.prices.staff ?? 1000;

  return (
    <div dir="rtl" className="pw-root">
      <style>{STYLE}</style>
      <div className="pw-inner">
        <header className="pw-hero">
          <h1>اختر الباقة المناسبة لك</h1>
          <p>
            {me?.trialAvailable
              ? "باقات واضحة لكل دور في المؤسسة. جرّب باقتي المؤسسة الأساسية والمتقدمة مجاناً لمدة 30 يوماً، أو ادفع مرة واحدة في السنة."
              : "باقات واضحة لكل دور في المؤسسة. ادفع مرة واحدة في السنة، وتُفعَّل ميزاتك فور تأكيد الدفع."}
          </p>
          <div className="pw-trust">
            {TRUST.map(item => <span key={item.text}>{item.icon} {item.text}</span>)}
          </div>
        </header>

        {me?.role === "owner" && (
          <section className="pw-stage" aria-label="مرحلة المؤسسة">
            <h2 className="pw-stage-title">ما مرحلة مؤسستك؟</h2>
            <p className="pw-stage-description">اختر المتوسطة (CEM) أو الثانوية (Lycée). سيُطبّق الاختيار على المستويات والميزات والتقارير.</p>
            <div className="pw-stage-options" role="group" aria-label="اختر مرحلة المؤسسة">
              <button
                type="button"
                className="pw-stage-option"
                aria-pressed={stage === "moyen"}
                disabled={stageLoading || stageSaving}
                onClick={() => void chooseInstitutionStage("moyen")}
              >
                المتوسطة (CEM)
              </button>
              <button
                type="button"
                className="pw-stage-option"
                aria-pressed={stage === "lycee"}
                disabled={stageLoading || stageSaving}
                onClick={() => void chooseInstitutionStage("lycee")}
              >
                الثانوية (Lycée)
              </button>
            </div>
            <p className="pw-stage-status" role="status">
              {stageLoading
                ? "جارٍ تحميل مرحلة المؤسسة…"
                : stageSaving
                  ? "جارٍ حفظ الاختيار…"
                  : stageConfigured
                    ? `المرحلة المعتمدة: ${stage === "lycee" ? "الثانوية (Lycée)" : "المتوسطة (CEM)"}`
                    : "احفظ اختيار المرحلة للمتابعة إلى الباقات."}
            </p>
            {stageError && <p className="pw-stage-status" role="alert">{stageError}</p>}
          </section>
        )}
        {me && me.role !== "owner" && !stageLoading && (
          <section className="pw-stage" aria-label="مرحلة المؤسسة">
            <h2 className="pw-stage-title">مرحلة المؤسسة</h2>
            <p className="pw-stage-description">
              {stage === "lycee" ? "الثانوية (Lycée)" : "المتوسطة (CEM)"} · يحدد صاحب المؤسسة هذه المرحلة.
            </p>
          </section>
        )}

        <div className="pw-persona">
          <div className="pw-persona-inner" role="group" aria-label="اختر دورك">
            {PERSONAS.map(item => (
              <button key={item.id} type="button" aria-pressed={persona === item.id} onClick={() => setPersona(item.id)}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="pw-error" role="alert">{error}</div>}
        {notice && <div className="pw-error" style={{ background: "rgba(16,185,129,0.14)", borderColor: "#10b981" }} role="status">{notice}</div>}

        {loading ? (
          <div className="pw-grid">{[0, 1, 2, 3, 4].map(i => <div key={i} className="pw-skel" />)}</div>
        ) : (
          <div className="pw-grid">
            <Card
              accent={COLORS.free}
              active={false}
              badge="🆓 مجاني"
              price={<><div className="pw-price">0</div><div className="pw-sub">تجربة أساسية</div></>}
              features={FEATURES.free}
              footer={
                <button type="button" className="pw-btn pw-btn-outline" style={accentVars("#cbd5e1")} disabled={busy || !canStartFree || !stageReady || stageSaving} onClick={() => void startFree()}>
                  {stageRequired && !stageReady ? "اختر المرحلة أولاً" : "ابدأ مجاناً"}
                </button>
              }
            />

            <Card
              accent={COLORS.parent}
              active={persona === "parent"}
              tag={persona === "parent" ? "مناسبة لك" : undefined}
              badge="👪 ولي الأمر (Parent)"
              price={
                <>
                  <div><span className="pw-price">{parentPrice.toLocaleString("en-US")}</span><span className="pw-unit">دج / سنة</span></div>
                  <div className="pw-month">{perMonth(parentPrice)}</div>
                  <div className="pw-sub">متابعة مسار التلميذ</div>
                </>
              }
              features={FEATURES.parent}
              footer={
                <>
                  <button type="button" className="pw-btn" disabled={busy || !parentOption || !stageReady || stageSaving} onClick={() => parentOption && void pay(parentOption.amountDzd)}>
                    {stageRequired && !stageReady ? "اختر المرحلة أولاً" : busy ? "جارٍ التحويل…" : parentOption ? "الدفع عبر Chargily" : "غير متاحة لهذا الحساب"}
                  </button>
                  {!parentOption && <div className="pw-note">غير متاحة لحساب يدير مؤسسة. يشترك الولي بحسابه الشخصي.</div>}
                  <div className="pw-note">لديك رمز المدرسة؟ <a className="pw-link" href={`${BASE}parent-register`}>سجّل كولي أمر</a></div>
                </>
              }
            />

            <Card
              accent={COLORS.staff}
              active={persona === "staff"}
              tag={persona === "staff" ? "مناسبة لك" : "الأكثر طلباً"}
              badge="🧑‍🏫 الأستاذ / المستشار (Pro)"
              price={
                <>
                  <div><span className="pw-price">{staffPrice.toLocaleString("en-US")}</span><span className="pw-unit">دج / سنة</span></div>
                  <div className="pw-month">{perMonth(staffPrice)}</div>
                  <div className="pw-sub">اشتراك فردي احترافي</div>
                </>
              }
              features={FEATURES.staff}
              footer={
                <>
                  <button type="button" className="pw-btn" disabled={busy || !staffOption || !stageReady || stageSaving} onClick={() => staffOption && void pay(staffOption.amountDzd)}>
                    {stageRequired && !stageReady ? "اختر المرحلة أولاً" : busy ? "جارٍ التحويل…" : staffOption ? "الدفع عبر Chargily" : "غير متاحة لهذا الحساب"}
                  </button>
                  {me?.staffTrialAvailable && staffOption && (
                    <button
                      type="button"
                      className="pw-btn pw-trial"
                      disabled={busy || trialBusy !== null || !stageReady || stageSaving}
                      onClick={() => void startTrial("staff")}
                    >
                      {trialBusy === "staff" ? "جارٍ تفعيل التجربة…" : "جرّب باقة الأستاذ مجاناً لمدة شهر"}
                    </button>
                  )}
                  {!staffOption && <div className="pw-note">غير متاحة لحساب يدير مؤسسة. يشترك الأستاذ بحسابه الشخصي.</div>}
                </>
              }
            />

            <Card
              accent={COLORS.school}
              active={persona === "school"}
              tag={persona === "school" ? "مناسبة لك" : undefined}
              badge={`🏫 المؤسسة · ${stage === "lycee" ? "الثانوية (Lycée)" : "المتوسطة (CEM)"}`}
              price={
                <>
                  {schoolShown.map(([plan, amount]) => (
                    <div key={plan} style={{ marginBottom: 6 }}>
                      <span className="pw-price">{amount.toLocaleString("en-US")}</span>
                      <span className="pw-unit">دج / سنة{schoolShown.length > 1 ? ` · ${SCHOOL_PLAN_LABEL[plan] ?? plan}` : ""}</span>
                    </div>
                  ))}
                  <div className="pw-sub">ترخيص شامل للمؤسسة</div>
                </>
              }
              features={FEATURES.school}
              footer={
                schoolOptions.length > 0 ? (
                  schoolOptions.map(option => (
                    <div key={option.plan} style={{ display: "grid", gap: 8 }}>
                      <button type="button" className="pw-btn" disabled={busy || trialBusy !== null || !stageReady || stageSaving} onClick={() => void pay(option.amountDzd)}>
                        {stageRequired && !stageReady ? "اختر المرحلة أولاً" : busy ? "جارٍ التحويل…" : `الدفع عبر Chargily${schoolOptions.length > 1 ? ` · ${option.amountDzd.toLocaleString("en-US")} دج` : ""}`}
                      </button>
                      {me?.trialAvailable && (option.plan === "basic" || option.plan === "pro") && (
                        <button
                          type="button"
                          className="pw-btn pw-trial"
                          disabled={busy || trialBusy !== null || !stageReady || stageSaving}
                          onClick={() => void startTrial(option.plan === "basic" ? "basic" : "pro")}
                        >
                          {trialBusy === option.plan ? "جارٍ تفعيل التجربة…" : `جرّب ${option.plan === "basic" ? "الأساسية" : "المتقدمة"} مجاناً لمدة شهر`}
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <button type="button" className="pw-btn" disabled>غير متاحة لهذا الحساب</button>
                )
              }
            />

            <Card
              accent={COLORS.groups}
              active={false}
              badge="🏢 مجموعات مدارس"
              price={<><div className="pw-price" style={{ fontSize: 32 }}>تواصل</div><div className="pw-sub">للمجمعات المدرسية</div></>}
              features={FEATURES.groups}
              footer={<button type="button" className="pw-btn pw-btn-outline" onClick={contactUs}>تواصل معنا</button>}
            />
          </div>
        )}

        <section className="pw-section">
          <h2>خطوات الاشتراك الفوري</h2>
          <div className="pw-steps">
            {STEPS.map(step => (
              <div key={step.n} className="pw-step"><b>{step.n}</b><span>{step.text}</span></div>
            ))}
          </div>
        </section>

        <section className="pw-section pw-faq">
          <h2>أسئلة شائعة</h2>
          {FAQ.map(item => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}