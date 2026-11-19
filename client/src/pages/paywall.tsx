import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE } from "@/lib/deployment";
import { useSchoolStage } from "@/hooks/use-school-stage";
import { CCP_ACCOUNT } from "@shared/subscription";

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
type CcpRequest = { id: string; plan: string; amountDzd: number; status: string; reviewNote: string | null; createdAt: string; reviewedAt: string | null };

const COLORS = {
  free: "#64748b",
  parent: "#3b82f6",
  staff: "#10b981",
  school: "#7c3aed",
  groups: "#f97316",
} as const;

const SCHOOL_PLAN_LABEL: Record<string, string> = { basic: "الخطة القياسية", pro: "Pro" };

const FEATURES = {
  free: ["حتى 50 تلميذاً", "تسجيل الحضور والغياب الأساسي", "إدخال النقاط والنتائج", "لوحة التحكم المبسطة"],
  basic: [
    "كل ميزات الباقة المجانية بدون حدود عملية",
    "OCR للدرجات والغيابات + تصدير Excel",
    "لوحة القيادة والتحليلات المتقدمة",
    "إدارة التلاميذ والغيابات والاتصال",
    "الاشتراك والتفعيل لكل أعضاء المؤسسة",
  ],
  pro: [
    "كل ميزات الباقة الأساسية (2000 دج)",
    "الإحصاء الشامل للمؤسسة (Census)",
    "التقارير الرسمية للاختبارات وقوائم التفويج",
    "استيراد الجداول من FET",
    "التقرير العام للسير السنوي (RGF)",
  ],
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

const PERSONAS: Array<{ id: Persona; label: string; icon: IconName }> = [
  { id: "school", label: "صاحب مؤسسة", icon: "crown" },
  { id: "staff", label: "أستاذ / مشرف", icon: "book" },
  { id: "parent", label: "ولي أمر", icon: "users" },
];

const TRUST: Array<{ icon: IconName; text: string }> = [
  { icon: "lock", text: "دفع آمن عبر Chargily" },
  { icon: "bank", text: `أو حوالة CCP: ${CCP_ACCOUNT}` },
  { icon: "zap", text: "تفعيل بعد مراجعة الوصل" },
  { icon: "receipt", text: "سنة كاملة بدون تجديد تلقائي" },
];

const STEPS = [
  { n: "1", text: "اختر الباقة المناسبة لدورك في المؤسسة" },
  { n: "2", text: "ادفع بالبطاقة عبر Chargily أو حوّل إلى CCP وأرسل صورة الوصل" },
  { n: "3", text: "تُفعَّل ميزاتك بعد تأكيد الدفع" },
];

const FAQ = [
  { q: "كيف أدفع عبر CCP؟", a: `حوّل المبلغ إلى الحساب البريدي ${CCP_ACCOUNT}، ثم أرسل صورة الوصل مع بريدك الإلكتروني أو حسابك على فيسبوك من صفحة الدفع. سيفعّلها المشرف خلال مراجعة الطلب.` },
  { q: "متى يتفعّل اشتراكي؟", a: "فور تأكيد الدفع عبر Chargily، أو خلال مراجعة طلب CCP (عادة خلال 24 ساعة)." },
  { q: "خُصم المبلغ ولم يتفعّل اشتراكي، ماذا أفعل؟", a: "لا تدفع مرة ثانية. انتظر بضع دقائق ثم حدّث الصفحة، وإن استمر الأمر فتواصل مع الدعم وأرسل رقم العملية الظاهر في عنوان صفحة العودة." },
  { q: "هل يُجدَّد الاشتراك تلقائياً؟", a: "لا. الاشتراك لسنة واحدة، ولن يُخصم منك أي مبلغ آخر دون أن تدفع بنفسك." },
  { q: "ما الفرق بين Basic و Pro؟", a: "Basic (2000 دج) يشمل كل الميزات ما عدا: الإحصاء الشامل، التقارير الرسمية للاختبارات، FET، والتقرير العام RGF. Pro (3000 دج) يشملها جميعاً." },
];

/* Inline icons (no extra dependency). 24x24 stroke icons. */
const ICONS = {
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  crown: <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" />,
  sparkles: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  book: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5A2.5 2.5 0 0 1 4 18.5" />,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></>,
  bank: <path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M2 10l10-7 10 7z" />,
  receipt: <path d="M4 2v20l3-2 2.5 2L12 20l2.5 2L17 20l3 2V2l-3 2-2.5-2L12 4 9.5 2 7 4zM8 9h8M8 13h8" />,
  check: <polyline points="20 6 9 17 4 12" />,
};
type IconName = keyof typeof ICONS;

function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      {ICONS[name]}
    </svg>
  );
}

const STYLE = `
.pw-root { min-height: 100vh; color: #0f172a; padding: 44px 16px 72px; font-family: inherit;
  background:
    radial-gradient(ellipse 60% 42% at 0% 0%, #ede9fe 0%, rgba(237,233,254,0) 70%),
    radial-gradient(ellipse 45% 35% at 100% 8%, #e0f2fe 0%, rgba(224,242,254,0) 70%),
    #f8fafc; }
.pw-inner { max-width: 1260px; margin: 0 auto; }

/* Hero */
.pw-hero { text-align: center; margin-bottom: 26px; }
.pw-lock { display: inline-flex; align-items: center; gap: 8px; padding: 9px 20px; border-radius: 999px; background: #fff1e0; color: #c2410c; border: 1px solid #fed7aa; font-size: 14px; font-weight: 700; box-shadow: 0 8px 22px rgba(249,115,22,0.16); margin-bottom: 22px; }
.pw-hero h1 { font-size: clamp(28px, 4.6vw, 46px); font-weight: 800; margin: 0 0 12px; letter-spacing: -0.5px; color: #0f172a; }
.pw-hero p { color: #64748b; margin: 0 auto; max-width: 640px; font-size: 15.5px; line-height: 1.8; }
.pw-trust { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; margin: 20px 0 6px; }
.pw-trust span { display: inline-flex; align-items: center; gap: 7px; background: #fff; border: 1px solid #e2e8f0; border-radius: 999px; padding: 7px 14px; font-size: 12.5px; color: #475569; box-shadow: 0 2px 8px rgba(15,23,42,0.04); }
.pw-trust svg { color: #7c3aed; }

/* Institution stage */
.pw-stage { max-width: 620px; margin: 22px auto 0; padding: 18px; border: 1px solid #e2e8f0; border-radius: 18px; background: #fff; text-align: right; box-shadow: 0 8px 24px rgba(15,23,42,0.05); }
.pw-stage-title { margin: 0 0 5px; font-size: 15px; font-weight: 750; color: #0f172a; }
.pw-stage-description, .pw-stage-status { margin: 0; color: #64748b; font-size: 12.5px; line-height: 1.7; }
.pw-stage-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0 8px; }
.pw-stage-option { padding: 11px 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; background: #f8fafc; color: #475569; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: border-color .15s, background .15s; }
.pw-stage-option:hover:not(:disabled) { border-color: #c4b5fd; }
.pw-stage-option[aria-pressed="true"] { border-color: #7c3aed; background: #f3efff; color: #5b21b6; }
.pw-stage-option:disabled { cursor: wait; opacity: .6; }

/* Persona switch */
.pw-persona { display: flex; justify-content: center; margin: 26px 0 40px; }
.pw-persona-inner { display: inline-flex; gap: 4px; padding: 5px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; max-width: 100%; overflow-x: auto; box-shadow: 0 6px 18px rgba(15,23,42,0.06); }
.pw-persona button { display: inline-flex; align-items: center; gap: 7px; border: 0; background: transparent; color: #64748b; padding: 9px 16px; border-radius: 11px; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
.pw-persona button[aria-pressed="true"] { background: #7c3aed; color: #fff; box-shadow: 0 6px 16px rgba(124,58,237,0.32); }
.pw-persona button:hover:not([aria-pressed="true"]) { background: #f1f5f9; color: #0f172a; }

/* Cards */
.pw-grid { display: grid; gap: 22px; grid-template-columns: 1fr; align-items: stretch; }
@media (min-width: 640px) { .pw-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 960px) { .pw-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1240px) { .pw-grid { grid-template-columns: repeat(5, 1fr); gap: 18px; } }
.pw-card { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 30px 22px 22px; border-radius: 24px; background: #fff; border: 2px solid var(--accent-line); box-shadow: 0 12px 30px var(--accent-soft); transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.pw-card:hover { transform: translateY(-4px); box-shadow: 0 18px 42px var(--accent-glow); }
.pw-card[data-active="true"] { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft), 0 20px 48px var(--accent-glow); }
@media (max-width: 1239px) { .pw-card[data-active="true"] { order: -1; } }
.pw-tag { position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 5px; background: var(--accent); color: #fff; border-radius: 999px; padding: 4px 13px; font-size: 11.5px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 12px var(--accent-glow); }
.pw-badge { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 72%, #000)); color: #fff; border-radius: 999px; padding: 8px 15px; font-size: 13.5px; font-weight: 800; max-width: 100%; box-shadow: 0 6px 14px var(--accent-glow); }
.pw-price { font-size: 42px; font-weight: 800; line-height: 1; letter-spacing: -1px; color: #0f172a; unicode-bidi: isolate; }
.pw-unit { color: #64748b; font-size: 13px; margin-inline-start: 6px; }
.pw-sub { color: #64748b; font-size: 13px; margin-top: 8px; }
.pw-month { color: color-mix(in srgb, var(--accent) 80%, #000); font-size: 12.5px; font-weight: 700; margin-top: 6px; }
.pw-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 12px; font-size: 13.5px; line-height: 1.55; color: #334155; }
.pw-list li { display: flex; gap: 10px; align-items: flex-start; }
.pw-check { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--accent); color: var(--accent); display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
.pw-foot { margin-top: auto; padding-top: 18px; border-top: 1px solid #eef2f7; display: grid; gap: 9px; }

/* Buttons */
.pw-btn { border: 0; border-radius: 14px; padding: 12px 14px; font-size: 14px; font-weight: 800; cursor: pointer; color: #fff; background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 78%, #000)); box-shadow: 0 8px 18px var(--accent-glow); transition: filter .15s, transform .1s; }
.pw-btn:hover:not(:disabled) { filter: brightness(1.07); }
.pw-btn:active:not(:disabled) { transform: scale(0.98); }
.pw-btn:disabled { background: #e2e8f0; color: #94a3b8; box-shadow: none; cursor: not-allowed; }
.pw-btn-outline { background: #fff; box-shadow: none; border: 1.5px solid var(--accent); color: color-mix(in srgb, var(--accent) 85%, #000); }
.pw-btn-outline:hover:not(:disabled) { background: var(--accent-soft); filter: none; }
.pw-btn-outline:disabled { background: #f8fafc; border-color: #e2e8f0; color: #94a3b8; }
.pw-trial { background: var(--accent-soft); box-shadow: none; border: 1px solid var(--accent-line); color: color-mix(in srgb, var(--accent) 75%, #000); }
.pw-trial:hover:not(:disabled) { background: var(--accent-glow); filter: none; }
.pw-note { color: #64748b; font-size: 12px; text-align: center; line-height: 1.6; }

/* Messages */
.pw-error { max-width: 760px; margin: 0 auto 20px; background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; border-radius: 14px; padding: 12px 16px; font-size: 14px; }
.pw-ok { background: #f0fdf4; border-color: #86efac; color: #166534; }

/* Sections */
.pw-section { margin-top: 44px; }
.pw-section h2 { font-size: 19px; font-weight: 800; margin: 0 0 16px; color: #0f172a; }
.pw-steps { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.pw-step { display: flex; gap: 12px; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; font-size: 14px; color: #334155; box-shadow: 0 4px 14px rgba(15,23,42,0.04); }
.pw-step b { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #7c3aed; color: #fff; display: inline-flex; align-items: center; justify-content: center; }
.pw-faq details { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 18px; margin-bottom: 10px; box-shadow: 0 3px 10px rgba(15,23,42,0.03); }
.pw-faq summary { cursor: pointer; font-weight: 700; font-size: 14.5px; color: #0f172a; }
.pw-faq p { color: #64748b; font-size: 13.5px; line-height: 1.85; margin: 10px 0 0; }
.pw-skel { height: 440px; border-radius: 24px; background: linear-gradient(90deg, #eef2f7, #f8fafc, #eef2f7); background-size: 200% 100%; animation: pw-shimmer 1.4s infinite; }
@keyframes pw-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.pw-link { color: #6d28d9; font-weight: 700; }
.pw-root button:focus-visible, .pw-root summary:focus-visible, .pw-root a:focus-visible { outline: 2px solid #7c3aed; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .pw-card, .pw-btn, .pw-skel { transition: none; animation: none; } }
`;

function accentVars(color: string): CSSProperties {
  return {
    ["--accent" as any]: color,
    ["--accent-line" as any]: `${color}80`,
    ["--accent-soft" as any]: `${color}1f`,
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
      {props.tag && <span className="pw-tag"><Icon name="sparkles" size={12} />{props.tag}</span>}
      <span className="pw-badge">{props.badge}</span>
      <div>{props.price}</div>
      <ul className="pw-list">
        {props.features.map(text => (
          <li key={text}>
            <span className="pw-check" aria-hidden="true"><Icon name="check" size={11} /></span>
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
  const [ccpOpen, setCcpOpen] = useState(false);
  const [ccpPlan, setCcpPlan] = useState("");
  const [ccpEmail, setCcpEmail] = useState("");
  const [ccpFacebook, setCcpFacebook] = useState("");
  const [ccpReceipt, setCcpReceipt] = useState<File | null>(null);
  const [ccpBusy, setCcpBusy] = useState(false);
  const [ccpDone, setCcpDone] = useState<CcpRequest[]>([]);
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
    void (async () => {
      try {
        const res = await fetch(`${BASE}api/payments/ccp/mine`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { requests?: CcpRequest[] };
          setCcpDone(data.requests ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [load]);

  function openCcp(plan: string) {
    setCcpPlan(plan);
    setCcpEmail("");
    setCcpFacebook("");
    setCcpReceipt(null);
    setError("");
    setCcpOpen(true);
  }

  async function submitCcpRequest() {
    if (!ccpPlan || (!ccpEmail.trim() && !ccpFacebook.trim()) || !ccpReceipt) {
      setError("اختر الباقة، أدخل بريدك أو فيسبوك، وأرفق صورة الوصل");
      return;
    }
    setCcpBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("plan", ccpPlan);
      if (ccpEmail.trim()) fd.set("contactEmail", ccpEmail.trim());
      if (ccpFacebook.trim()) fd.set("contactFacebook", ccpFacebook.trim());
      fd.set("receipt", ccpReceipt);
      const res = await fetch(`${BASE}api/payments/ccp/request`, {
        method: "POST", credentials: "include", body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "تعذر إرسال الطلب");
      setCcpOpen(false);
      setNotice(`تم إرسال طلب الدفع عبر CCP (${ccpPlan === "pro" ? "Pro" : "Basic"}) — ستتم مراجعته وتفعيل الباقة بعد التحقق من الوصل.`);
      void (async () => {
        try {
          const r = await fetch(`${BASE}api/payments/ccp/mine`, { credentials: "include" });
          if (r.ok) {
            const d = (await r.json()) as { requests?: CcpRequest[] };
            setCcpDone(d.requests ?? []);
          }
        } catch { /* ignore */ }
      })();
    } catch (e: any) {
      setError(e?.message ?? "تعذر إرسال الطلب");
    } finally {
      setCcpBusy(false);
    }
  }

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
          <div className="pw-lock"><Icon name="lock" size={16} />الوصول مقيّد – يتطلب اشتراكاً</div>
          <h1>اختر باقتك وابدأ الآن</h1>
          <p>
            {me?.trialAvailable
              ? "باقات واضحة لكل دور في المؤسسة. جرّب باقتي المؤسسة الأساسية والمتقدمة مجاناً لمدة 30 يوماً، أو ادفع مرة واحدة في السنة."
              : "باقات واضحة لكل دور في المؤسسة. ادفع مرة واحدة في السنة، وتُفعَّل ميزاتك فور تأكيد الدفع."}
          </p>
          <div className="pw-trust">
            {TRUST.map(item => <span key={item.text}><Icon name={item.icon} size={14} />{item.text}</span>)}
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
                <Icon name={item.icon} size={15} />{item.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="pw-error" role="alert">{error}</div>}
        {notice && <div className="pw-error pw-ok" role="status">{notice}</div>}

        {loading ? (
          <div className="pw-grid">{[0, 1, 2, 3, 4].map(i => <div key={i} className="pw-skel" />)}</div>
        ) : (
          <div className="pw-grid">
            <Card
              accent={COLORS.free}
              active={false}
              badge={<><Icon name="gift" />مجاني</>}
              price={<><div className="pw-price">0</div><div className="pw-sub">تجربة أساسية</div></>}
              features={FEATURES.free}
              footer={
                <button type="button" className="pw-btn pw-btn-outline" disabled={busy || !canStartFree || !stageReady || stageSaving} onClick={() => void startFree()}>
                  {stageRequired && !stageReady ? "اختر المرحلة أولاً" : "ابدأ مجاناً"}
                </button>
              }
            />

            <Card
              accent={COLORS.parent}
              active={persona === "parent"}
              tag={persona === "parent" ? "مناسبة لك" : undefined}
              badge={<><Icon name="users" />ولي الأمر (Parent)</>}
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
                  {parentOption && (
                    <button type="button" className="pw-btn pw-btn-outline" disabled={!stageReady || stageSaving} onClick={() => openCcp("parent")}>
                      دفع عبر CCP · {parentOption.amountDzd.toLocaleString("en-US")} دج
                    </button>
                  )}
                  {!parentOption && <div className="pw-note">غير متاحة لحساب يدير مؤسسة. يشترك الولي بحسابه الشخصي.</div>}
                  <div className="pw-note">لديك رمز المدرسة؟ <a className="pw-link" href={`${BASE}parent-register`}>سجّل كولي أمر</a></div>
                </>
              }
            />

            <Card
              accent={COLORS.staff}
              active={persona === "staff"}
              tag={persona === "staff" ? "مناسبة لك" : "الأكثر طلباً"}
              badge={<><Icon name="zap" />الأستاذ / المستشار (Pro)</>}
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
                  {staffOption && (
                    <button type="button" className="pw-btn pw-btn-outline" disabled={!stageReady || stageSaving} onClick={() => openCcp("staff")}>
                      دفع عبر CCP · {staffOption.amountDzd.toLocaleString("en-US")} دج
                    </button>
                  )}
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
              badge={<><Icon name="crown" />المؤسسة · {stage === "lycee" ? "الثانوية (Lycée)" : "المتوسطة (CEM)"}</>}
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
                  <>
                    <div className="pw-note" style={{ textAlign: "right" }}>
                      <b>Basic (2000 دج):</b> كل الميزات ما عدا الإحصاء الشامل، التقارير الرسمية للاختبارات، FET، RGF.
                      <br /><b>Pro (3000 دج):</b> كل شيء بدون استثناء.
                    </div>
                    {schoolOptions.map(option => (
                      <div key={option.plan} style={{ display: "grid", gap: 8 }}>
                        <button type="button" className="pw-btn" disabled={busy || trialBusy !== null || !stageReady || stageSaving} onClick={() => void pay(option.amountDzd)}>
                          {stageRequired && !stageReady ? "اختر المرحلة أولاً" : busy ? "جارٍ التحويل…" : `الدفع عبر Chargily${schoolOptions.length > 1 ? ` · ${option.amountDzd.toLocaleString("en-US")} دج` : ""}`}
                        </button>
                        <button
                          type="button"
                          className="pw-btn pw-btn-outline"
                          disabled={!stageReady || stageSaving}
                          onClick={() => openCcp(option.plan)}
                        >
                          دفع عبر CCP · {option.amountDzd.toLocaleString("en-US")} دج
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
                    ))}
                  </>
                ) : (
                  <button type="button" className="pw-btn" disabled>غير متاحة لهذا الحساب</button>
                )
              }
            />

            <Card
              accent={COLORS.groups}
              active={false}
              badge={<><Icon name="building" />مجموعات مدارس</>}
              price={<><div className="pw-price" style={{ fontSize: 34 }}>تواصل</div><div className="pw-sub">للمجمعات المدرسية</div></>}
              features={FEATURES.groups}
              footer={<button type="button" className="pw-btn" onClick={contactUs}>تواصل معنا</button>}
            />
          </div>
        )}

        {ccpDone.length > 0 && (
          <section className="pw-section">
            <h2>طلبات الدفع عبر CCP</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {ccpDone.map(r => (
                <div key={r.id} className="pw-step" style={{ justifyContent: "space-between" }}>
                  <span>
                    <b style={{ background: "none", color: "#0f172a", width: "auto", height: "auto" }}>{r.plan === "pro" ? "Pro" : r.plan === "basic" ? "Basic" : r.plan === "staff" ? "الأستاذ/المشرف" : r.plan === "parent" ? "ولي الأمر" : r.plan}</b>
                    {" · "}{r.amountDzd.toLocaleString("en-US")} دج
                    {" · "}{new Date(r.createdAt).toLocaleDateString("ar-DZ")}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "3px 10px",
                    background: r.status === "approved" ? "#dcfce7" : r.status === "rejected" ? "#fee2e2" : "#fef3c7",
                    color: r.status === "approved" ? "#15803d" : r.status === "rejected" ? "#b91c1c" : "#b45309",
                  }}>
                    {r.status === "approved" ? "مفعّلة" : r.status === "rejected" ? "مرفوضة" : "قيد المراجعة"}
                  </span>
                </div>
              ))}
            </div>
          </section>
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

      {ccpOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(15,23,42,.45)", backdropFilter: "blur(4px)", padding: 16,
        }} onClick={() => !ccpBusy && setCcpOpen(false)}>
          <div dir="rtl" onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 460, borderRadius: 22, padding: "26px 24px",
            background: "#fff", border: "1px solid #e2e8f0",
            color: "#0f172a", boxShadow: "0 24px 60px rgba(15,23,42,.25)",
          }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 800 }}>الدفع عبر الحساب البريدي CCP</h3>
            <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13.5, lineHeight: 1.7 }}>
              حوّل المبلغ إلى CCP: <b style={{ color: "#6d28d9", letterSpacing: 1 }}>{CCP_ACCOUNT}</b>،
              ثم أرسل صورة الوصل مع وسيلة تواصل ليتم تفعيل الباقة بعد المراجعة.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <span>الباقة</span>
                <select value={ccpPlan} onChange={e => setCcpPlan(e.target.value)} style={inputStyle}>
                  <option value="">اختر الباقة…</option>
                  {schoolOptions.map(o => (
                    <option key={o.plan} value={o.plan}>{o.plan === "pro" ? "Pro" : "Basic"} — {o.amountDzd.toLocaleString("en-US")} دج/سنة</option>
                  ))}
                  {staffOption && <option value="staff">الأستاذ/المشرف — {staffOption.amountDzd.toLocaleString("en-US")} دج/سنة</option>}
                  {parentOption && <option value="parent">ولي الأمر — {parentOption.amountDzd.toLocaleString("en-US")} دج/سنة</option>}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <span>البريد الإلكتروني</span>
                <input type="email" value={ccpEmail} onChange={e => setCcpEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <span>أو حساب فيسبوك</span>
                <input value={ccpFacebook} onChange={e => setCcpFacebook(e.target.value)} placeholder="facebook.com/yourname" style={inputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <span>صورة وصل الدفع (CCP)</span>
                <input type="file" accept="image/*" onChange={e => setCcpReceipt(e.target.files?.[0] ?? null)} style={{ fontSize: 12.5, color: "#475569" }} />
              </label>
            </div>
            {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => void submitCcpRequest()} disabled={ccpBusy}
                style={{ flex: 1, border: 0, borderRadius: 14, padding: "12px 14px", fontWeight: 800, fontSize: 14, cursor: ccpBusy ? "wait" : "pointer", background: "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "#fff", boxShadow: "0 8px 18px rgba(124,58,237,.3)" }}>
                {ccpBusy ? "جارٍ الإرسال…" : "إرسال طلب الدفع"}
              </button>
              <button type="button" onClick={() => setCcpOpen(false)} disabled={ccpBusy}
                style={{ border: "1.5px solid #cbd5e1", borderRadius: 14, padding: "12px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", background: "#fff", color: "#475569" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: 12, border: "1.5px solid #e2e8f0", background: "#f8fafc",
  color: "#0f172a", padding: "10px 12px", fontSize: 13.5, fontFamily: "inherit", outline: "none",
};