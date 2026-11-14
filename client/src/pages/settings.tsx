import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { School, User, Save, KeyRound, Sparkles } from "lucide-react";
import { SCHOOL_STAGE } from "@/lib/deployment";
import type { SchoolInfo } from "@shared/types";

const BASE = import.meta.env.BASE_URL;

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

const fieldVariants = {
  initial: { opacity: 0, x: -10 },
  animate: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.06, duration: 0.35 } }),
};

export default function Settings() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  const [groqKey, setGroqKey] = useState("");
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [savingGroqKey, setSavingGroqKey] = useState(false);

  const [geminiKey, setGeminiKey] = useState("");
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  const [form, setForm] = useState({ nom: "", wilaya: "", commune: "", annee: "2026-2027", directeur: "", phone: "", supportPhone: "" });

  const fetchSchool = useCallback(async () => {
    const res = await fetch(`${BASE}api/school`, { credentials: "include" });
    if (res.ok) {
      const d: SchoolInfo = await res.json();
      if (d) setForm({ nom: d.nom, wilaya: d.wilaya, commune: d.commune, annee: d.annee, directeur: d.directeur ?? "", phone: d.phone ?? "", supportPhone: d.supportPhone ?? "" });
    }
  }, []);

  useEffect(() => { fetchSchool(); }, [fetchSchool]);

  useEffect(() => {
    if (user?.memberContext || user?.subscriptionPlan === "free" || (user?.role !== "admin" && user?.subscriptionStatus !== "active")) return;
    fetch(`${BASE}api/assistant/settings`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setHasGroqKey(Boolean(data.hasGroqApiKey));
          setHasGeminiKey(Boolean(data.hasGeminiApiKey));
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!form.nom.trim() || !form.wilaya.trim() || !form.commune.trim() || !form.annee.trim()) {
      toast({ title: "يرجى ملء اسم المؤسسة والولاية والبلدية والسنة الدراسية", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/school`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "تعذر حفظ معلومات المؤسسة");
      }
      toast({ title: t("settings.saved") });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "تعذر حفظ معلومات المؤسسة",
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  const schoolFields = [
    { key: "nom",      label: t("dashboard.schoolName"), placeholder: SCHOOL_STAGE === "lycee" ? "ثانوية..." : "متوسطة..." },
    { key: "wilaya",   label: t("dashboard.wilaya"),     placeholder: "ولاية..." },
    { key: "commune",  label: t("dashboard.commune"),    placeholder: "بلدية..." },
    { key: "annee",    label: t("dashboard.year"),       placeholder: "2026-2027" },
    { key: "directeur",label: t("settings.director"),   placeholder: "اسم المدير..." },
    { key: "phone",        label: t("settings.phone"),           placeholder: "0xxx..." },
    { key: "supportPhone", label: "رقم واتساب للدعم التقني",     placeholder: "213XXXXXXXXX (بدون +)" },
  ];

  const saveGroqKey = async () => {
    setSavingGroqKey(true);
    try {
      const res = await fetch(`${BASE}api/assistant/settings`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groqApiKey: groqKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر حفظ المفتاح");
      setHasGroqKey(Boolean(data.hasGroqApiKey));
      setGroqKey("");
      toast({ title: "تم حفظ مفتاح Groq بأمان" });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "تعذر حفظ المفتاح", variant: "destructive" }); }
    finally { setSavingGroqKey(false); }
  };

  const saveGeminiKey = async () => {
    setSavingGeminiKey(true);
    try {
      const res = await fetch(`${BASE}api/assistant/settings`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: geminiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر حفظ المفتاح");
      setHasGeminiKey(Boolean(data.hasGeminiApiKey));
      setGeminiKey("");
      toast({ title: "تم حفظ مفتاح Gemini بأمان" });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "تعذر حفظ المفتاح", variant: "destructive" }); }
    finally { setSavingGeminiKey(false); }
  };

  const canManageKeys = !user?.memberContext
    && (user?.role === "admin" || (user?.subscriptionPlan !== "free" && user?.subscriptionStatus === "active"));

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-6 max-w-2xl mx-auto">

      <motion.h1 className="text-2xl font-bold" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        {t("settings.title")}
      </motion.h1>

      {canManageKeys && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Groq key card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="w-5 h-5" /> مفتاح Groq
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">من console.groq.com. يُحفظ مشفراً ولا يظهر لأي مستخدم آخر.</p>
              <Label htmlFor="groq-api-key">مفتاح Groq {hasGroqKey ? "(محفوظ — أدخل مفتاحاً جديداً لتغييره)" : ""}</Label>
              <Input id="groq-api-key" type="password" autoComplete="off" placeholder="gsk_..." value={groqKey} onChange={e => setGroqKey(e.target.value)} dir="ltr" />
              <Button onClick={saveGroqKey} disabled={savingGroqKey || !groqKey.trim()} className="gap-2 w-full">
                <KeyRound className="w-4 h-4" /> {savingGroqKey ? "جارٍ الحفظ..." : "حفظ مفتاح Groq"}
              </Button>
            </CardContent>
          </Card>

          {/* Gemini key card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-5 h-5" /> مفتاح Gemini
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">من aistudio.google.com. يُستخدم لتحسين دقة استخراج البيانات بالـ OCR.</p>
              <Label htmlFor="gemini-api-key">مفتاح Gemini {hasGeminiKey ? "(محفوظ — أدخل مفتاحاً جديداً لتغييره)" : ""}</Label>
              <Input id="gemini-api-key" type="password" autoComplete="off" placeholder="AIza..." value={geminiKey} onChange={e => setGeminiKey(e.target.value)} dir="ltr" />
              <Button onClick={saveGeminiKey} disabled={savingGeminiKey || !geminiKey.trim()} className="gap-2 w-full">
                <Sparkles className="w-4 h-4" /> {savingGeminiKey ? "جارٍ الحفظ..." : "حفظ مفتاح Gemini"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* School info card */}
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.1 }}>
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <motion.div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center"
                whileHover={{ rotate: 8, scale: 1.1 }}>
                <School className="w-4 h-4 text-white" />
              </motion.div>
              {t("settings.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {schoolFields.map((f, i) => (
                <motion.div key={f.key} className="space-y-1.5" custom={i} variants={fieldVariants} initial="initial" animate="animate">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input id={f.key} placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="transition-shadow focus:shadow-md"
                  />
                </motion.div>
              ))}
            </div>
            <motion.div className="mt-6" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
                {saving ? (
                  <motion.div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                ) : <Save className="w-4 h-4" />}
                {saving ? "جارٍ الحفظ..." : t("dashboard.save")}
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account card */}
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.2 }}>
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              {t("settings.account")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user && (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
                {user.profileImageUrl ? (
                  <img src={user.profileImageUrl} className="w-12 h-12 rounded-full" alt="" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-violet-500 flex items-center justify-center text-xl font-bold text-white">
                    {(user.firstName?.[0] || user.email?.[0] || "?").toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold">
                    {user.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              تسجيل الدخول عبر Google. لتغيير البيانات الشخصية، قم بتعديل ملفك الشخصي على Google.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}