import { useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, CreditCard, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentDemoPage() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paymentId = new URLSearchParams(window.location.search).get("paymentId") ?? "";

  async function completePayment() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/payments/demo/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const payload = await response.json() as { returnUrl?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تأكيد الدفع التجريبي");
      window.location.assign(payload.returnUrl ?? "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تأكيد الدفع التجريبي");
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-600 to-teal-700 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
            <CreditCard className="h-7 w-7" />
          </div>
          <div className="mb-2 inline-flex items-center rounded-full border border-amber-200/60 bg-amber-400/20 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-50">
            DEMO MODE • وضع تجريبي
          </div>
          <p className="text-xs text-emerald-100">بيئة دفع تجريبية</p>
          <h1 className="mt-1 text-2xl font-extrabold">تأكيد الاشتراك</h1>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">الخدمة</span>
              <span className="font-bold">خدمة ولي الأمر</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-slate-400">المبلغ</span>
              <span className="text-xl font-extrabold text-emerald-300">حسب الباقة</span>
            </div>
          </div>
          <div className="flex gap-3 text-sm text-slate-300">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
            <p>هذه محاكاة آمنة للدفع. لن يتم خصم أي مبلغ حقيقي.</p>
          </div>
          <Button onClick={completePayment} disabled={busy || !paymentId} className="w-full bg-emerald-600 py-6 text-base font-bold hover:bg-emerald-700">
            {busy ? <Loader2 className="ml-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="ml-2 h-5 w-5" />}
            {busy ? "جارٍ تأكيد العملية..." : "تأكيد الدفع التجريبي"}
          </Button>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          <button type="button" onClick={() => navigate("/")} className="w-full text-center text-sm text-slate-400 hover:text-white">
            إلغاء والعودة
          </button>
        </div>
      </section>
    </main>
  );
}
