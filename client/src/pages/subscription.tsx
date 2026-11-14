import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Zap, Star, Crown, Calendar, Leaf, Building2, GraduationCap, HeartHandshake } from "lucide-react";
import { FREE_STUDENT_LIMIT, PAID_PLAN_PRICES_DZD, STAFF_PLAN, STAFF_PLAN_PRICE_DZD, PARENT_PLAN, PARENT_PLAN_PRICE_DZD } from "@shared/subscription";
import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE } from "@/lib/deployment";
import { useSchoolStage } from "@/hooks/use-school-stage";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export default function SubscriptionPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [trialBusy, setTrialBusy] = useState<string | null>(null);
  const [trialError, setTrialError] = useState("");
  const [trialMessage, setTrialMessage] = useState("");
  const { stage, stageConfigured, stageLoading, stageSaving, stageError, chooseStage } = useSchoolStage();
  const [paymentInfo, setPaymentInfo] = useState<{
    role: string;
    plan: string;
    status: string;
    active: boolean;
    trialAvailable: boolean;
    staffTrialAvailable?: boolean;
    expiresAt: string | null;
    prices?: { staff: number; parent: number };
    options?: { plan: string; amountDzd: number }[];
  } | null>(null);

  async function loadPaymentInfo() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/payments/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("تعذر تحميل حالة الاشتراك");
      setPaymentInfo(await response.json());
    } catch (error) {
      setTrialError(error instanceof Error ? error.message : "تعذر تحميل حالة الاشتراك");
    }
  }

  useEffect(() => { void loadPaymentInfo(); }, []);

  async function chooseInstitutionStage(nextStage: SchoolStage) {
    if (await chooseStage(nextStage)) await loadPaymentInfo();
  }

  function isCurrentPlan(plan: string): boolean {
    if (paymentInfo) {
      if (plan === "free") return paymentInfo.plan === "free" && paymentInfo.status === "active";
      return paymentInfo.plan === plan && paymentInfo.active;
    }
    return (user?.subscriptionPlan ?? (user?.subscriptionStatus === "active" ? "pro" : "free")) === plan;
  }

  async function startTrial(plan: "basic" | "pro" | "staff") {
    setTrialBusy(plan);
    setTrialError("");
    setTrialMessage("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/payments/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = await response.json() as { error?: string; expiresAt?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تفعيل التجربة المجانية");
      const planName = plan === "basic" ? "أساسي" : plan === "pro" ? "Pro" : "الأستاذ";
      setTrialMessage(`تم تفعيل باقة ${planName} مجاناً لمدة 30 يوماً.`);
      await loadPaymentInfo();
    } catch (error) {
      setTrialError(error instanceof Error ? error.message : "تعذر تفعيل التجربة المجانية");
    } finally {
      setTrialBusy(null);
    }
  }

  async function startCheckout(planKey: string, amountDzd: number) {
    if (planKey === "institution") {
      setCheckoutError("للاشتراك المؤسسي، تواصل مع الدعم التقني من داخل تطبيق دليل الرقمنة.");
      return;
    }

    setCheckoutBusy(planKey);
    setCheckoutError("");

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/payments/chargily/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}${user?.memberContext?.role === "parent" ? "/my-child" : "/"}`,
          amountDzd,
        }),
      });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "تعذر بدء عملية الدفع");
      }
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "تعذر بدء عملية الدفع");
    } finally {
      setCheckoutBusy(null);
    }
  }

  const formatDzd = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const staffPrice = paymentInfo?.prices?.staff ?? STAFF_PLAN_PRICE_DZD;
  const parentPrice = paymentInfo?.prices?.parent ?? PARENT_PLAN_PRICE_DZD;
  const staffOption = paymentInfo?.options?.find(option => option.plan === STAFF_PLAN);
  const parentOption = paymentInfo?.options?.find(option => option.plan === PARENT_PLAN);

  const plans = [
    {
      key: "free",
      name: "مجاني",
      price: "0",
      priceNote: null,
      period: null,
      icon: Leaf,
      gradient: "from-slate-500 to-slate-700",
      shadow: "shadow-slate-400/20",
      glow: "hover:shadow-slate-400/30",
      features: [
        `حتى ${FREE_STUDENT_LIMIT} تلميذاً`,
        "إدارة التلاميذ والنتائج الأساسية",
        "لوحة التحكم الأساسية",
        "إحصائيات محدودة",
      ],
      cta: "الخطة الحالية",
      ctaVariant: "outline" as const,
      current: isCurrentPlan("free"),
      popular: false,
    },
    {
      key: "basic",
      name: "قياسي",
      price: "1 500",
      priceNote: null,
      period: "سنة",
      icon: Star,
      gradient: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-400/20",
      glow: "hover:shadow-emerald-400/40",
      features: [
        "300 تلميذ",
        "كل ميزات المجاني",
        "طباعة القوائم PDF",
        "أعمال نهاية السنة",
      ],
      cta: "ترقية إلى أساسي",
      ctaVariant: "default" as const,
      current: isCurrentPlan("basic"),
      popular: false,
    },
    {
      key: "pro",
      name: "Pro",
      price: "3 000",
      priceNote: null,
      period: "سنة",
      icon: Zap,
      gradient: "from-violet-600 to-indigo-700",
      shadow: "shadow-violet-500/30",
      glow: "hover:shadow-violet-500/50",
      features: [
        "1 000 تلميذ",
        "كل ميزات الأساسي",
        "تحليلات وإحصائيات متقدمة",
        "رفع درجات بالـ OCR",
        ...(SCHOOL_STAGE === "moyen" ? ["نتائج شهادة BEM"] : ["تحليل نتائج البكالوريا من Excel"]),
        "التوجيه المسبق",
        "المساعد الذكي",
      ],
      cta: "ترقية إلى Pro",
      ctaVariant: "default" as const,
      current: isCurrentPlan("pro"),
      popular: true,
    },
    {
      key: STAFF_PLAN,
      name: "باقة الأستاذ",
      price: formatDzd(staffPrice),
      priceNote: null,
      period: "سنة",
      icon: GraduationCap,
      gradient: "from-cyan-500 to-blue-600",
      shadow: "shadow-cyan-400/20",
      glow: "hover:shadow-cyan-400/40",
      features: [
        "OCR رفع الدرجات والغيابات",
        "تصدير Excel وحقن النتائج",
        "آلة حاسبة المعدلات",
        "استعمال الزمن وتوزيع الحصص",
        ...(paymentInfo?.staffTrialAvailable ? ["تجربة مجانية لمدة شهر"] : []),
      ],
      cta: isCurrentPlan(STAFF_PLAN) ? "اشتراكك فعال" : "اشترك الآن",
      ctaVariant: "default" as const,
      current: isCurrentPlan(STAFF_PLAN),
      popular: false,
    },
    {
      key: PARENT_PLAN,
      name: "باقة ولي الأمر",
      price: formatDzd(parentPrice),
      priceNote: null,
      period: "سنة",
      icon: HeartHandshake,
      gradient: "from-rose-500 to-pink-600",
      shadow: "shadow-rose-400/20",
      glow: "hover:shadow-rose-400/40",
      features: [
        "متابعة علامات ونتائج الأبناء",
        "استعمال الزمن ومواعيد الانصراف",
        "تنبيهات الغياب والتأخر",
        "إشعارات المؤسسة",
      ],
      cta: isCurrentPlan(PARENT_PLAN) ? "اشتراكك فعال" : "اشترك الآن",
      ctaVariant: "default" as const,
      current: isCurrentPlan(PARENT_PLAN),
      popular: false,
    },
    {
      key: "institution",
      name: "مؤسسي",
      price: "تواصل",
      priceNote: "للمدارس المتعددة",
      period: null,
      icon: Crown,
      gradient: "from-amber-500 to-orange-600",
      shadow: "shadow-amber-500/30",
      glow: "hover:shadow-amber-500/50",
      features: [
        "تلاميذ غير محدود",
        "كل ميزات Pro",
        "إدارة متعدد المدارس",
        "تقارير مخصصة كاملة",
        "وكيل سطح المكتب (Windows)",
        "دعم أولوية 24/7",
      ],
      cta: "تواصل معنا",
      ctaVariant: "default" as const,
      current: false,
      popular: false,
    },
  ];

  const visiblePlans = plans.filter(plan => {
    if (!paymentInfo) return true;
    const options = paymentInfo.options ?? [];
    if (paymentInfo.role === "parent") return plan.key === PARENT_PLAN;
    if (paymentInfo.role === "teacher" || paymentInfo.role === "supervisor") return plan.key === STAFF_PLAN;
    if (paymentInfo.role === "owner") {
      return ["free", "basic", "pro", "institution"].includes(plan.key) || options.some(option => option.plan === plan.key);
    }
    return ["free", "institution"].includes(plan.key) || options.some(option => option.plan === plan.key);
  });

  const stageRequired = paymentInfo?.role === "owner";
  const stageReady = !stageRequired || stageConfigured;
  const showSchoolComparison = !paymentInfo || paymentInfo.role === "owner";

  return (
    <motion.div
      variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 max-w-6xl mx-auto space-y-8"
    >
      {/* Header */}
      <motion.div
        className="text-center space-y-3"
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 text-xs font-bold mb-2">
          <Zap className="w-3.5 h-3.5" />
          باقات الاشتراك
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
          اختر الباقة المناسبة
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto">كل باقة مصممة لاحتياجات مختلفة — من مؤسسة صغيرة إلى شبكة مؤسسات</p>
        <p className="mx-auto max-w-xl rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          جرّب باقتي أساسي وPro مجاناً لمدة 30 يوماً، مرة واحدة لكل حساب وبدون إدخال بيانات الدفع.
        </p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm font-semibold"
        >
          <Calendar className="w-4 h-4" />
          اشتراك سنوي — وفّر أكثر مع الدفع السنوي
        </motion.div>
      </motion.div>

      {paymentInfo?.role === "owner" ? (
        <Card className="mx-auto max-w-2xl border-blue-500/30">
          <CardContent className="space-y-3 p-5 text-right">
            <h2 className="font-bold">ما مرحلة مؤسستك؟</h2>
            <p className="text-sm text-muted-foreground">اختر المتوسطة (CEM) أو الثانوية (Lycée) قبل اعتماد الباقة. لا يمكن تغييرها بعد إضافة التلاميذ.</p>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="اختر مرحلة المؤسسة">
              <Button type="button" variant={stage === "moyen" ? "default" : "outline"} disabled={stageLoading || stageSaving} aria-pressed={stage === "moyen"} onClick={() => void chooseInstitutionStage("moyen")}>
                المتوسطة (CEM)
              </Button>
              <Button type="button" variant={stage === "lycee" ? "default" : "outline"} disabled={stageLoading || stageSaving} aria-pressed={stage === "lycee"} onClick={() => void chooseInstitutionStage("lycee")}>
                الثانوية (Lycée)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground" role="status">
              {stageLoading ? "جارٍ تحميل مرحلة المؤسسة…" : stageSaving ? "جارٍ حفظ الاختيار…" : stageConfigured ? `المرحلة المعتمدة: ${stage === "lycee" ? "الثانوية (Lycée)" : "المتوسطة (CEM)"}` : "احفظ المرحلة للمتابعة إلى الباقات."}
            </p>
            {stageError && <p className="text-sm text-red-600" role="alert">{stageError}</p>}
          </CardContent>
        </Card>
      ) : paymentInfo && !stageLoading ? (
        <p className="mx-auto max-w-2xl text-center text-sm text-muted-foreground">
          مرحلة المؤسسة: {stage === "lycee" ? "الثانوية (Lycée)" : "المتوسطة (CEM)"} · يحددها صاحب المؤسسة.
        </p>
      ) : null}

      {/* Plans */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {visiblePlans.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            لا توجد باقات متاحة لهذا الحساب حالياً.
          </div>
        ) : visiblePlans.map((plan, i) => (
          <motion.div
            key={plan.key}
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.08, duration: 0.45, type: "spring", stiffness: 240, damping: 22 }}
            whileHover={{ y: -6, scale: 1.02 }}
            className="relative"
          >
            {plan.popular && (
              <motion.div
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="absolute -top-3.5 inset-x-0 flex justify-center z-10"
              >
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-lg">
                  <Star className="w-3 h-3 fill-white" />
                  الأكثر طلبًا
                </span>
              </motion.div>
            )}

            <Card className={`relative overflow-hidden border-0 h-full shadow-xl ${plan.shadow} transition-shadow duration-300 ${plan.glow} ${plan.popular ? "ring-2 ring-violet-500/60" : ""}`}>
              {/* Gradient header */}
              <div className={`bg-gradient-to-br ${plan.gradient} p-5 relative overflow-hidden`}>
                <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-white/10 blur-xl" />
                <div className="absolute -bottom-6 -left-6 w-16 h-16 rounded-full bg-white/10 blur-xl" />

                <motion.div
                  className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-3 relative"
                  whileHover={{ rotate: 12, scale: 1.1 }} transition={{ type: "spring", stiffness: 300 }}
                >
                  <plan.icon className="w-5 h-5 text-white" />
                </motion.div>

                <h2 className="text-lg font-extrabold text-white mb-1">{plan.name}</h2>
                {(plan.key === "basic" || plan.key === "pro") && paymentInfo?.trialAvailable && !plan.current && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold text-white ring-1 ring-white/40">
                    <Calendar className="h-3 w-3" />
                    تجربة مجانية 30 يوماً
                  </span>
                )}
                {plan.key === STAFF_PLAN && paymentInfo?.staffTrialAvailable && !plan.current && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold text-white ring-1 ring-white/40">
                    <Calendar className="h-3 w-3" />
                    تجربة مجانية 30 يوماً
                  </span>
                )}

                {/* Price */}
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-black text-white">{plan.price}</span>
                  {plan.price !== "0" && plan.period ? (
                    <div className="mb-1">
                      <span className="text-white/70 text-xs"> دج</span>
                      <span className="text-white/70 text-[11px] block leading-none">/{plan.period}</span>
                    </div>
                  ) : plan.price === "0" ? (
                    <span className="text-white/70 text-sm mb-1"> دج</span>
                  ) : null}
                </div>

                {plan.priceNote && (
                  <p className="text-white/70 text-[11px] mt-0.5">{plan.priceNote}</p>
                )}

                {plan.price !== "0" && plan.period && (
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-white/90 text-[10px] font-semibold">
                    <Calendar className="w-3 h-3" />
                    سنوي
                  </div>
                )}
              </div>

              <CardContent className="p-4 space-y-4 flex flex-col">
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f, j) => (
                    <motion.li
                      key={j}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 + j * 0.04 + 0.3 }}
                      className="flex items-start gap-2 text-xs text-foreground"
                    >
                      <span className={`mt-0.5 w-4 h-4 rounded-full bg-gradient-to-br ${plan.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                        <Check className="w-2.5 h-2.5 text-white" />
                      </span>
                      {f}
                    </motion.li>
                  ))}
                </ul>

                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                  <Button
                    variant={plan.ctaVariant}
                    disabled={plan.current || checkoutBusy === plan.key || stageSaving || stageLoading || (stageRequired && !stageReady)}
                    onClick={() => {
                      if (plan.current) return;
                      if (plan.key === "basic") return startCheckout(plan.key, PAID_PLAN_PRICES_DZD.basic);
                      if (plan.key === "pro") return startCheckout(plan.key, PAID_PLAN_PRICES_DZD.pro);
                      if (plan.key === STAFF_PLAN) return startCheckout(plan.key, staffOption?.amountDzd ?? STAFF_PLAN_PRICE_DZD);
                      if (plan.key === PARENT_PLAN) return startCheckout(plan.key, parentOption?.amountDzd ?? PARENT_PLAN_PRICE_DZD);
                      if (plan.key === "institution") return startCheckout(plan.key, 0);
                    }}
                    className={`w-full py-4 font-bold text-xs rounded-xl shadow-md transition-all ${
                      plan.current
                        ? "opacity-70 cursor-default"
                        : plan.key === "basic"
                          ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
                          : plan.key === "pro"
                            ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-lg shadow-violet-500/30"
                            : plan.key === "institution"
                              ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 shadow-lg shadow-amber-500/30"
                              : plan.key === STAFF_PLAN
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white border-0 shadow-lg shadow-cyan-500/30"
                                : plan.key === PARENT_PLAN
                                  ? "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white border-0 shadow-lg shadow-rose-500/30"
                                  : ""
                    }`}
                  >
                    {plan.current ? `✓ ${plan.cta}` : stageRequired && !stageReady ? "اختر المرحلة أولاً" : checkoutBusy === plan.key ? "جارٍ التحضير…" : plan.cta}
                  </Button>
                </motion.div>
                {(plan.key === "basic" || plan.key === "pro") && paymentInfo?.trialAvailable && !plan.current && (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-emerald-600 font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    disabled={trialBusy !== null || stageSaving || stageLoading || (stageRequired && !stageReady)}
                    onClick={() => void startTrial(plan.key === "basic" ? "basic" : "pro")}
                  >
                    {trialBusy === plan.key ? "جارٍ تفعيل التجربة..." : "ابدأ تجربة مجانية لمدة شهر"}
                  </Button>
                )}
                {plan.key === STAFF_PLAN && paymentInfo?.staffTrialAvailable && !plan.current && (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-cyan-600 font-bold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
                    disabled={trialBusy !== null || stageSaving || stageLoading || (stageRequired && !stageReady)}
                    onClick={() => void startTrial("staff")}
                  >
                    {trialBusy === plan.key ? "جارٍ تفعيل التجربة..." : "ابدأ تجربة مجانية لمدة شهر"}
                  </Button>
                )}
                {(plan.key === "basic" || plan.key === "pro") && paymentInfo && !paymentInfo.trialAvailable && !plan.current && (
                  <p className="text-center text-[11px] text-muted-foreground">التجربة المجانية متاحة مرة واحدة لكل حساب.</p>
                )}
                {plan.key === STAFF_PLAN && paymentInfo && !paymentInfo.staffTrialAvailable && !plan.current && (
                  <p className="text-center text-[11px] text-muted-foreground">التجربة المجانية متاحة مرة واحدة لكل حساب.</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {checkoutError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {checkoutError}
        </div>
      )}
      {trialError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {trialError}
        </div>
      )}
      {trialMessage && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          {trialMessage}{paymentInfo?.expiresAt ? ` تنتهي في ${new Date(paymentInfo.expiresAt).toLocaleDateString("ar-DZ")}.` : ""}
        </div>
      )}

      {showSchoolComparison && (<>
      {/* Comparison table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        className="rounded-2xl border overflow-hidden shadow-sm"
      >
        <div className="bg-muted/50 px-5 py-3 grid grid-cols-5 text-xs font-bold text-muted-foreground">
          <span>الميزة</span>
          <span className="text-center">مجاني</span>
          <span className="text-center text-emerald-600">أساسي</span>
          <span className="text-center text-violet-600">Pro</span>
          <span className="text-center text-amber-600">مؤسسي</span>
        </div>
        <div className="divide-y">
          {[
            { label: "عدد التلاميذ",        free: "50",         bas: "300",        pro: "1 000",     inst: "∞"         },
            { label: "استيراد Excel",        free: "✓",          bas: "✓",          pro: "✓",         inst: "✓"         },
            { label: "طباعة PDF",            free: "—",          bas: "✓",          pro: "✓",         inst: "✓"         },
            { label: "تحليلات متقدمة",       free: "—",          bas: "—",          pro: "✓",         inst: "✓"         },
            { label: "OCR رفع الدرجات",      free: "—",          bas: "—",          pro: "✓",         inst: "✓"         },
            ...(SCHOOL_STAGE === "moyen" ? [
              ...(SCHOOL_STAGE === "moyen" ? [
                { label: SCHOOL_STAGE === "moyen" ? "نتائج BEM" : "تحليل نتائج البكالوريا", free: "—", bas: "—", pro: "✓", inst: "✓" },
              ] : []),
            ] : []),
            { label: "المساعد الذكي",        free: "—",          bas: "—",          pro: "✓",         inst: "✓"         },
            { label: "متعدد المدارس",        free: "—",          bas: "—",          pro: "—",         inst: "✓"         },
            { label: "وكيل سطح المكتب",      free: "—",          bas: "—",          pro: "—",         inst: "✓"         },
            { label: "دعم أولوية 24/7",      free: "—",          bas: "—",          pro: "—",         inst: "✓"         },
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-5 px-5 py-2.5 text-sm hover:bg-muted/20 transition-colors">
              <span className="text-muted-foreground font-medium text-xs">{row.label}</span>
              <span className={`text-center font-semibold text-xs ${row.free === "✓" ? "text-emerald-600" : row.free === "—" ? "text-muted-foreground/40" : "text-foreground"}`}>{row.free}</span>
              <span className={`text-center font-semibold text-xs ${row.bas  === "✓" ? "text-emerald-600"  : row.bas  === "—" ? "text-muted-foreground/40" : "text-emerald-600"}`}>{row.bas}</span>
              <span className={`text-center font-semibold text-xs ${row.pro  === "✓" ? "text-violet-600"   : row.pro  === "—" ? "text-muted-foreground/40" : "text-violet-600"}`}>{row.pro}</span>
              <span className={`text-center font-semibold text-xs ${row.inst === "✓" ? "text-amber-600"    : row.inst === "—" ? "text-muted-foreground/40" : "text-amber-600"}`}>{row.inst}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Price summary row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/50 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
            <Star className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">قياسي — 1 500 دج / سنة</p>
            <p className="text-xs text-muted-foreground">125 دج / شهر</p>
          </div>
        </div>
        <div className="rounded-xl border bg-violet-50/50 dark:bg-violet-950/20 border-violet-200/50 dark:border-violet-800/50 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-violet-700 dark:text-violet-300">Pro — 3 000 دج / سنة</p>
            <p className="text-xs text-muted-foreground">250 دج / شهر — الأنسب للمؤسسات التعليمية</p>
          </div>
        </div>
        <div className="rounded-xl border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/50 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">مؤسسي — تواصل معنا</p>
            <p className="text-xs text-muted-foreground">للشبكات والمديريات التربوية</p>
          </div>
        </div>
      </motion.div>
      </>)}

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
        className="rounded-2xl bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 border border-blue-200/50 dark:border-blue-800/50 p-5 text-center"
      >
        <p className="text-sm text-muted-foreground">
          📧 &nbsp;
          <span className="font-semibold text-foreground">contact@rafiq-raqamna.dz</span>
          &nbsp; — &nbsp; للاستفسارات والاشتراكات تواصل معنا عبر البريد الإلكتروني
        </p>
      </motion.div>
    </motion.div>
  );
}
