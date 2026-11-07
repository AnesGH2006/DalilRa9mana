import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/language-provider";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserCheck, UserX, Pencil, School, MapPin, Calendar,
  GraduationCap, TrendingUp, BarChart3, Award, Baby, LayoutDashboard,
  ArrowUpLeft,
} from "lucide-react";
import { CountUp } from "@/components/count-up";
import { SCHOOL_STAGE } from "@/lib/deployment";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SchoolInfo, DashboardStats, Niveau } from "@shared/types";

const BASE = import.meta.env.BASE_URL;

const LEVEL_LABELS: Record<Niveau, string> = {
  "1AM": "1 AM", "2AM": "2 AM", "3AM": "3 AM", "4AM": "4 AM",
  "1AS": "1 AS", "2AS": "2 AS", "3AS": "3 AS",
};

function getAcademicYears(): string[] {
  const years: string[] = [];
  for (let start = 2018; start <= 2026; start++) {
    years.push(`${start}-${start + 1}`);
  }
  return years.reverse();
}

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
const containerVariants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.08 } },
};
const cardVariants = {
  initial: { opacity: 0, y: 24, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: "easeOut" as const } },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tableRowVariants: any = {
  initial: { opacity: 0, x: -16 },
  animate: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: "easeOut" },
  }),
};

const GENDER_COLORS = ["#3b82f6", "#ec4899"];
const LEVEL_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef"];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur border rounded-xl shadow-xl p-3 text-xs">
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, gradient, shadow, suffix = "",
}: {
  label: string; value: number; icon: React.ElementType;
  gradient: string; shadow: string; suffix?: string;
}) {
  return (
    <motion.div variants={cardVariants} whileHover={{ y: -5, scale: 1.03 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
      <div className={`rounded-2xl overflow-hidden shadow-lg ${shadow}`}>
        <div className={`bg-gradient-to-br ${gradient} p-5 relative overflow-hidden`}>
          {/* Radial glow at top-right */}
          <div className="absolute -top-8 -end-8 w-28 h-28 rounded-full bg-white/15 blur-2xl pointer-events-none" />
          {/* Shine streak */}
          <div className="absolute top-0 start-0 end-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
          {/* Bottom reflection */}
          <div className="absolute bottom-0 start-0 end-0 h-16 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
          <div className="flex items-start justify-between mb-3 relative">
            <p className="text-white/75 text-xs font-semibold leading-tight">{label}</p>
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-white/90" />
            </div>
          </div>
          <p className="text-[2.2rem] font-black text-white tracking-tight leading-none relative">
            <CountUp to={value} />{suffix}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
  gradient,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="surface-panel p-4 h-full cursor-pointer transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-md`}>
            <Icon className="h-4 w-4" />
          </div>
          <ArrowUpLeft className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-4 space-y-1">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </motion.div>
    </Link>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const years = getAcademicYears();

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewYear, setViewYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [form, setForm] = useState({ nom: "", wilaya: "", commune: "", annee: "2026-2027", directeur: "", phone: "" });

  const fetchSchool = useCallback(async () => {
    setLoadingSchool(true);
    try {
      const res = await fetch(`${BASE}api/school`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setSchool(d);
        if (d) setForm({ nom: d.nom, wilaya: d.wilaya, commune: d.commune, annee: d.annee, directeur: d.directeur || "", phone: d.phone || "" });
      }
    } finally { setLoadingSchool(false); }
  }, []);

  const fetchStats = useCallback(async (annee: string) => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${BASE}api/stats?annee=${annee}`, { credentials: "include" });
      if (res.ok) setStats(await res.json());
      else setStats(null);
    } finally { setLoadingStats(false); }
  }, []);

  useEffect(() => { fetchSchool(); }, [fetchSchool]);
  useEffect(() => {
    fetchStats(viewYear);
    localStorage.setItem("cem-selected-year", viewYear);
  }, [viewYear, fetchStats]);

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
      setSchool(data);
      setEditOpen(false);
      toast({ title: t("dashboard.save") });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "تعذر حفظ معلومات المؤسسة",
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  // Chart data
  const genderData = stats ? [
    { name: t("stats.boys"), value: stats.boys },
    { name: t("stats.girls"), value: stats.girls },
  ] : [];

  const levelData = stats?.byLevel.map((l, i) => ({
    name: LEVEL_LABELS[l.niveau as Niveau] || l.niveau,
    [t("stats.boys")]: l.boys,
    [t("stats.girls")]: l.girls,
    color: LEVEL_COLORS[i % LEVEL_COLORS.length],
  })) || [];

  const successRate = stats && (stats.admis + stats.nonAdmis + stats.mustarrak) > 0
    ? Math.round((stats.admis / (stats.admis + stats.nonAdmis + stats.mustarrak)) * 100)
    : null;

  return (
    <motion.div
      variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-6 max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center shadow-lg shadow-blue-500/30">
              <LayoutDashboard className="w-4.5 h-4.5 text-white" />
            </span>
            {t("dashboard.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">
            نظرة عامة على {SCHOOL_STAGE === "lycee" ? "الثانوية" : "المتوسطة"}
          </p>
        </motion.div>
        <motion.div className="flex items-center gap-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          {/* Year selector */}
          <Select value={viewYear} onValueChange={setViewYear}>
            <SelectTrigger className="w-38 bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-lg shadow-blue-500/25 font-semibold text-xs h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm"
            className="gap-2 hover:shadow-md transition-all border-blue-200 dark:border-blue-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-semibold"
            onClick={() => {
              setForm(school
                ? { nom: school.nom, wilaya: school.wilaya, commune: school.commune, annee: school.annee, directeur: school.directeur || "", phone: school.phone || "" }
                : { nom: "", wilaya: "", commune: "", annee: "2026-2027", directeur: "", phone: "" }
              );
              setEditOpen(true);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            {school ? t("dashboard.editInfo") : t("dashboard.setup")}
          </Button>
        </motion.div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QuickActionCard
          title="إدارة الطلبة"
          description="عرض، البحث، متابعة الحالة التعليمية لكل التلاميذ."
          href="/students"
          icon={Users}
          gradient="from-blue-500 to-indigo-600"
        />
        <QuickActionCard
          title="النتائج"
          description="مراجعة الدرجات، المعدلات، والوضعية العامة حسب السنة."
          href="/results"
          icon={BarChart3}
          gradient="from-violet-500 to-purple-600"
        />
        <QuickActionCard
          title="الاستيراد"
          description="رفع الملفات والنتائج بسرعة وبسيطة مع مراقبة كل خطوة."
          href="/import"
          icon={School}
          gradient="from-cyan-500 to-blue-600"
        />
        <QuickActionCard
          title="معلومات المؤسسة"
          description="تحديث اسم المؤسسة، الولاية، مدير المدرسة، وبيانات التواصل."
          href="#school-info"
          icon={Pencil}
          gradient="from-emerald-500 to-teal-600"
        />
      </div>

      {/* School Info Card */}
      <AnimatePresence mode="wait">
        {!loadingSchool && (
          <motion.div
            key={school ? "school" : "no-school"}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4 }}
          >
            {school ? (
              <Card id="school-info" className="border-0 overflow-hidden relative shadow-md"
                style={{
                  background: "linear-gradient(135deg, rgba(219,234,254,0.8) 0%, rgba(237,233,254,0.6) 50%, rgba(240,249,255,0.7) 100%)",
                  boxShadow: "0 4px 24px rgba(99,149,255,0.12), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.85)"
                }}>
                <div className="absolute -top-20 -end-20 w-56 h-56 rounded-full bg-blue-400/12 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -start-12 w-40 h-40 rounded-full bg-violet-400/10 blur-3xl pointer-events-none" />
                <div className="absolute top-0 start-0 end-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent pointer-events-none" />
                <CardContent className="pt-5 pb-4 relative">
                  <div className="flex flex-wrap gap-5">
                    {[
                      { label: t("dashboard.schoolName"), value: school.nom, icon: School, gradient: "from-blue-500 to-blue-700" },
                      { label: `${t("dashboard.wilaya")} / ${t("dashboard.commune")}`, value: `${school.wilaya} — ${school.commune}`, icon: MapPin, gradient: "from-indigo-500 to-violet-600" },
                      { label: t("dashboard.year"), value: school.annee, icon: Calendar, gradient: "from-violet-500 to-purple-700" },
                      ...(school.directeur ? [{ label: t("settings.director"), value: school.directeur, icon: GraduationCap, gradient: "from-cyan-500 to-blue-600" }] : []),
                    ].map((item, i) => (
                      <motion.div key={i} className="flex items-center gap-3"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}>
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shrink-0 shadow-md`}>
                          <item.icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">{item.label}</p>
                          <p className="font-bold text-foreground">{item.value}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-2">
                <CardContent className="py-10 text-center text-muted-foreground">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.1 }}>
                    <School className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  </motion.div>
                  <p className="mb-4">{t("dashboard.noSchool")}</p>
                  <Button
                    onClick={() => setEditOpen(true)}
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-lg shadow-blue-500/30 font-bold"
                  >
                    {t("dashboard.setup")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats & Charts */}
      <AnimatePresence mode="wait">
        {loadingStats ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <motion.div key={i} className="h-24 rounded-2xl bg-muted"
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </motion.div>
        ) : stats && stats.total > 0 ? (
          <motion.div key="stats" variants={containerVariants} initial="initial" animate="animate" className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label={t("stats.total")} value={stats.total} icon={Users}
                gradient="from-blue-500 to-blue-700" shadow="shadow-blue-500/25" />
              <StatCard label={t("stats.boys")} value={stats.boys} icon={Users}
                gradient="from-sky-500 to-cyan-600" shadow="shadow-sky-500/25" />
              <StatCard label={t("stats.girls")} value={stats.girls} icon={Users}
                gradient="from-pink-500 to-rose-600" shadow="shadow-pink-500/25" />
              {successRate !== null ? (
                <StatCard label={t("dashboard.successRate")} value={successRate} icon={Award}
                  gradient="from-emerald-500 to-green-600" shadow="shadow-emerald-500/25" suffix="%" />
              ) : (
                <StatCard label={t("stats.admis")} value={stats.admis} icon={UserCheck}
                  gradient="from-emerald-500 to-green-600" shadow="shadow-emerald-500/25" />
              )}
            </div>

            {/* Pass/fail bar */}
            {(stats.admis > 0 || stats.nonAdmis > 0 || stats.mustarrak > 0) && stats.total > 0 && (
              <motion.div variants={cardVariants}>
                <Card className="border-0 shadow-sm overflow-hidden">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2 text-sm flex-wrap gap-y-1">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" />{t("val.admis")} — <CountUp to={stats.admis} />
                      </span>
                      {stats.mustarrak > 0 && (
                        <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5" />{t("val.mustarrak")} — <CountUp to={stats.mustarrak} />
                        </span>
                      )}
                      <span className="font-bold text-red-500 flex items-center gap-1.5">
                        <UserX className="w-3.5 h-3.5" />{t("val.non_admis")} — <CountUp to={stats.nonAdmis} />
                      </span>
                    </div>
                    <div className="h-4 rounded-full bg-muted overflow-hidden flex gap-0.5">
                      <motion.div
                        className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-l-full"
                        initial={{ width: 0 }} animate={{ width: `${(stats.admis / stats.total) * 100}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" as any, delay: 0.3 }}
                      />
                      {stats.mustarrak > 0 && (
                        <motion.div
                          className="h-full bg-gradient-to-r from-amber-400 to-orange-400"
                          initial={{ width: 0 }} animate={{ width: `${(stats.mustarrak / stats.total) * 100}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" as any, delay: 0.35 }}
                        />
                      )}
                      <motion.div
                        className="h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-r-full"
                        initial={{ width: 0 }} animate={{ width: `${(stats.nonAdmis / stats.total) * 100}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" as any, delay: 0.4 }}
                      />
                    </div>
                    {successRate !== null && (
                      <p className="text-xs text-muted-foreground mt-1.5 text-end">
                        {t("dashboard.successRate")}: <span className="font-bold text-emerald-600">{successRate}%</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Gender pie chart */}
              {(stats.boys > 0 || stats.girls > 0) && (
                <motion.div variants={cardVariants} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
                  <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/20">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        {t("dashboard.genderDist")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                      <ResponsiveContainer width="100%" height={460}>
                        <PieChart>
                          <Pie
                            data={genderData} cx="50%" cy="50%"
                            innerRadius={100} outerRadius={145}
                            paddingAngle={4} dataKey="value" animationDuration={800}
                          >
                            {genderData.map((_, i) => (
                              <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Level bar chart */}
              {levelData.length > 0 && (
                <motion.div variants={cardVariants} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
                  <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/20">
                    <CardHeader className="pb-1">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500" />
                        {t("dashboard.levelDist")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={460}>
                        <BarChart data={levelData} barSize={40} barGap={6}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                          <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                          <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={34} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey={t("stats.boys")} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey={t("stats.girls")} fill="#ec4899" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </div>

            {/* Level breakdown table */}
            {stats.byLevel.length > 0 && (
              <motion.div variants={cardVariants}>
                <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-muted/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: "spring", delay: 0.4 }}>
                        <GraduationCap className="w-5 h-5 text-indigo-500" />
                      </motion.div>
                      {t("stats.byLevel")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs uppercase">
                            <th className="pb-2 text-start font-semibold">{t("stats.level")}</th>
                            <th className="pb-2 text-center font-semibold">{t("stats.total_col")}</th>
                            <th className="pb-2 text-center font-semibold text-blue-500">{t("stats.boys")}</th>
                            <th className="pb-2 text-center font-semibold text-pink-500">{t("stats.girls")}</th>
                            {stats.byLevel.some(l => l.admis > 0 || l.nonAdmis > 0) && (
                              <>
                                <th className="pb-2 text-center font-semibold text-emerald-600">{t("val.admis")}</th>
                                <th className="pb-2 text-center font-semibold text-red-500">{t("val.non_admis")}</th>
                              </>
                            )}
                            {stats.byLevel.some(l => l.avgAge !== null) && (
                              <>
                                <th className="pb-2 text-center font-semibold text-amber-600">متوسط العمر</th>
                                <th className="pb-2 text-center font-semibold text-muted-foreground">المدى</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {stats.byLevel.map((l, i) => (
                            <motion.tr key={l.niveau}
                              custom={i} variants={tableRowVariants}
                              className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                            >
                              <td className="py-3 font-semibold text-foreground">
                                <span className="inline-flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
                                  {LEVEL_LABELS[l.niveau as Niveau]}
                                </span>
                              </td>
                              <td className="py-3 text-center font-bold"><CountUp to={l.total} /></td>
                              <td className="py-3 text-center">
                                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                                  <CountUp to={l.boys} />
                                  <span className="text-xs text-muted-foreground">({l.total > 0 ? Math.round(l.boys / l.total * 100) : 0}%)</span>
                                </span>
                              </td>
                              <td className="py-3 text-center">
                                <span className="inline-flex items-center gap-1 text-pink-600 dark:text-pink-400 font-semibold">
                                  <CountUp to={l.girls} />
                                  <span className="text-xs text-muted-foreground">({l.total > 0 ? Math.round(l.girls / l.total * 100) : 0}%)</span>
                                </span>
                              </td>
                              {stats.byLevel.some(ll => ll.admis > 0 || ll.nonAdmis > 0) && (
                                <>
                                  <td className="py-3 text-center text-emerald-600 font-semibold">{l.admis ? <CountUp to={l.admis} /> : "—"}</td>
                                  <td className="py-3 text-center text-red-500 font-semibold">{l.nonAdmis ? <CountUp to={l.nonAdmis} /> : "—"}</td>
                                </>
                              )}
                              {stats.byLevel.some(ll => ll.avgAge !== null) && (
                                <>
                                  <td className="py-3 text-center">
                                    {l.avgAge !== null ? (
                                      <span className="inline-flex items-center gap-1 text-amber-600 font-bold">
                                        <Baby className="w-3 h-3" />{l.avgAge} سنة
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="py-3 text-center text-xs text-muted-foreground font-medium">
                                    {l.minAge !== null && l.maxAge !== null ? `${l.minAge}–${l.maxAge}` : "—"}
                                  </td>
                                </>
                              )}
                            </motion.tr>
                          ))}
                          <motion.tr
                            className="font-bold bg-gradient-to-r from-muted/60 to-muted/40"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: stats.byLevel.length * 0.05 + 0.2 }}
                          >
                            <td className="py-3">{t("stats.total_col")}</td>
                            <td className="py-3 text-center"><CountUp to={stats.total} /></td>
                            <td className="py-3 text-center text-blue-600 dark:text-blue-400"><CountUp to={stats.boys} /></td>
                            <td className="py-3 text-center text-pink-600 dark:text-pink-400"><CountUp to={stats.girls} /></td>
                            {stats.byLevel.some(l => l.admis > 0 || l.nonAdmis > 0) && (
                              <>
                                <td className="py-3 text-center text-emerald-600"><CountUp to={stats.admis} /></td>
                                <td className="py-3 text-center text-red-500"><CountUp to={stats.nonAdmis} /></td>
                              </>
                            )}
                            {stats.byLevel.some(l => l.avgAge !== null) && (
                              <><td /><td /></>
                            )}
                          </motion.tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Age distribution mini-cards */}
            {stats.byLevel.some(l => l.ageDist.length > 0) && (
              <motion.div variants={cardVariants}>
                <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-muted/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Baby className="w-4 h-4 text-amber-500" />
                      توزيع الأعمار حسب المستوى
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      {stats.byLevel.filter(l => l.ageDist.length > 0).map((l, i) => {
                        const maxCount = Math.max(...l.ageDist.map(a => a.count));
                        return (
                          <motion.div key={l.niveau}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className="rounded-xl border bg-muted/20 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold" style={{ color: LEVEL_COLORS[i % LEVEL_COLORS.length] }}>
                                {LEVEL_LABELS[l.niveau as Niveau]}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {l.minAge}–{l.maxAge} سنة
                              </span>
                            </div>
                            <div className="space-y-1">
                              {l.ageDist.map(({ age, count }) => (
                                <div key={age} className="flex items-center gap-2">
                                  <span className="text-xs w-14 text-muted-foreground shrink-0">{age} سنة</span>
                                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                    <motion.div
                                      className="h-full rounded-full"
                                      style={{ backgroundColor: LEVEL_COLORS[i % LEVEL_COLORS.length] }}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${(count / maxCount) * 100}%` }}
                                      transition={{ duration: 0.7, delay: i * 0.05 }}
                                    />
                                  </div>
                                  <span className="text-xs font-bold w-6 text-end shrink-0">{count}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        ) : (
          !loadingStats && (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
              <Card className="border-dashed border-2">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  </motion.div>
                  <p className="mb-3">{t("stats.noData")}</p>
                  <p className="text-xs opacity-60">{t("dashboard.viewYear")}: <strong>{viewYear}</strong></p>
                </CardContent>
              </Card>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <School className="w-4 h-4 text-blue-500" />
              {t("dashboard.schoolInfo")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { key: "nom", label: t("dashboard.schoolName") },
              { key: "wilaya", label: t("dashboard.wilaya") },
              { key: "commune", label: t("dashboard.commune") },
              { key: "annee", label: t("dashboard.year"), placeholder: "2026-2027" },
              { key: "directeur", label: t("settings.director") },
              { key: "phone", label: t("settings.phone") },
            ].map((f, i) => (
              <motion.div key={f.key} className="space-y-1.5"
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}>
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input id={f.key} value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={(f as any).placeholder || ""} />
              </motion.div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("dashboard.cancel")}</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-md"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <motion.div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                    animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                  ...
                </span>
              ) : t("dashboard.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
