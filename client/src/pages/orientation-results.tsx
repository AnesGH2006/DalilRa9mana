import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, GraduationCap, Users, BarChart3, FlaskConical, BookOpen, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrientationCaseCalculator from "@/components/orientation-case-calculator";
import { getFourAMScienceWeightedScore, rankFourAMArtsApplicants, rankFourAMScienceApplicants } from "@/lib/4am-stream-allocation";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";
import type { StudentResult } from "@shared/types";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const BASE = import.meta.env.BASE_URL;
const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const DEFAULT_YEAR = "2026-2027";

// Track-specific subjects (Algerian curriculum)
const SCIENCE_SUBJECTS = [
  { key: "maths",   label: "الرياضيات",                     color: "#3b82f6" },
  { key: "physique",label: "العلوم الفيزيائية والتكنولوجيا", color: "#8b5cf6" },
  { key: "svt",     label: "علوم الطبيعة والحياة",          color: "#10b981" },
];
const ARTS_SUBJECTS = [
  { key: "arabe",   label: "اللغة العربية",   color: "#f59e0b" },
  { key: "anglais", label: "اللغة الإنجليزية", color: "#ef4444" },
  { key: "francais",label: "اللغة الفرنسية",  color: "#ec4899" },
];

type TrackCapacity = "science" | "arts";
type TrackCapacities = Record<TrackCapacity, number>;
const DEFAULT_CAPACITIES: TrackCapacities = { science: 30, arts: 30 };
const CAPACITY_STORAGE_KEY = "orientation-track-capacities";

function splitName(nomPrenom: string) {
  const parts = nomPrenom.trim().split(/\s+/);
  if (parts.length === 1) return { nom: parts[0] ?? "", prenom: "" };
  return { nom: parts[0] ?? "", prenom: parts.slice(1).join(" ") };
}

function avgColor(v: number) {
  if (v >= 16) return "text-emerald-600 dark:text-emerald-400";
  if (v >= 14) return "text-blue-600 dark:text-blue-400";
  if (v >= 12) return "text-violet-600 dark:text-violet-400";
  if (v >= 10) return "text-orange-500 dark:text-orange-400";
  return "text-red-500";
}

/** Compute average of a subject across trimesters from scores */
function subjectAvg(r: StudentResult, key: string): number | null {
  const vals: number[] = [];
  for (const t of [1, 2, 3] as const) {
    const v = (r.scores as any)?.[t]?.[key];
    if (typeof v === "number" && v >= 0) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Average of multiple subjects */
function trackSubjectAvg(r: StudentResult, keys: string[]): number | null {
  const avgs = keys.map(k => subjectAvg(r, k)).filter((v): v is number => v !== null);
  if (avgs.length === 0) return null;
  return avgs.reduce((a, b) => a + b, 0) / avgs.length;
}

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border rounded-xl shadow-xl p-2.5 text-xs">
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
}

function SubjectBar({ label, value, max = 20, color }: { label: string; value: number | null; max?: number; color: string }) {
  const pct = value !== null ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-bold ${value === null ? "text-muted-foreground" : value >= 10 ? "text-emerald-600" : "text-red-500"}`}>
          {value !== null ? value.toFixed(2) : "—"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div className="h-full rounded-full" style={{ background: color }}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }} />
      </div>
    </div>
  );
}

export default function OrientationResultsPage() {
  const [results, setResults]           = useState<StudentResult[]>([]);
  const [loading, setLoading]           = useState(true);
  const [annee, setAnnee]               = useState(DEFAULT_YEAR);
  const [filterClasse, setFilterClasse] = useState("");
  const [filterSexe, setFilterSexe]     = useState("");
  const [filterTrack, setFilterTrack]   = useState("");
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [capacitiesByYear, setCapacitiesByYear] = useState<Record<string, TrackCapacities>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(CAPACITY_STORAGE_KEY) ?? "{}") as Record<string, TrackCapacities>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(CAPACITY_STORAGE_KEY, JSON.stringify(capacitiesByYear));
  }, [capacitiesByYear]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ annee, niveau: "4AM" });
      const res = await fetch(`${BASE}api/results?${p}`, { credentials: "include" });
      if (res.ok) setResults(await res.json());
    } finally { setLoading(false); }
  }, [annee]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const wishes = useOrientationWishes(annee);

  // All eligible (passed) students sorted by avg descending
  const eligible = results
    .filter(r => r.passed && r.annualAvg !== null)
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  const capacities = capacitiesByYear[annee] ?? DEFAULT_CAPACITIES;
  const updateCapacity = (track: TrackCapacity, value: number) => {
    setCapacitiesByYear(current => ({
      ...current,
      [annee]: { ...(current[annee] ?? DEFAULT_CAPACITIES), [track]: Math.max(0, Math.min(500, value)) },
    }));
  };
  const scienceApplicants = rankFourAMScienceApplicants(eligible, wishes);
  const scienceWithinCapacity = new Set(scienceApplicants.slice(0, capacities.science).map(result => result.student.id));
  const artsApplicants = rankFourAMArtsApplicants(eligible, scienceWithinCapacity, wishes);
  const artsWithinCapacity = new Set(artsApplicants.slice(0, capacities.arts).map(result => result.student.id));
  const orientTrack = (result: StudentResult) => {
    if (scienceWithinCapacity.has(result.student.id)) {
      return {
        label: "جذع مشترك علوم وتكنولوجيا",
        color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
        borderColor: "border-blue-200 dark:border-blue-800",
        key: "science",
        icon: FlaskConical,
        iconColor: "text-blue-500",
        trackSubjects: SCIENCE_SUBJECTS,
        trackAvg: getFourAMScienceWeightedScore(result),
        qualifies: true,
      };
    }
    if (artsWithinCapacity.has(result.student.id)) {
      return {
        label: "جذع مشترك آداب",
        color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
        borderColor: "border-violet-200 dark:border-violet-800",
        key: "arts",
        icon: BookOpen,
        iconColor: "text-violet-500",
        trackSubjects: ARTS_SUBJECTS,
        trackAvg: trackSubjectAvg(result, ARTS_SUBJECTS.map(subject => subject.key)),
        qualifies: true,
      };
    }
    return {
      label: "غير مستوفٍ لسعة الجذعين أو شروط المواد",
      color: "bg-muted text-muted-foreground",
      borderColor: "border-border",
      key: "unassigned",
      icon: AlertCircle,
      iconColor: "text-muted-foreground",
      trackSubjects: [],
      trackAvg: null,
      qualifies: false,
    };
  };
  const estimatedCutoff = (applicants: StudentResult[], capacity: number) => {
    if (capacity <= 0 || applicants.length <= capacity) return null;
    const lastSeat = applicants[capacity - 1];
    return lastSeat ? orientTrack(lastSeat).trackAvg ?? lastSeat.annualAvg : null;
  };
  const scienceCutoff = estimatedCutoff(scienceApplicants, capacities.science);
  const artsCutoff = estimatedCutoff(artsApplicants, capacities.arts);

  const classes = [...new Set(eligible.map(r => r.student.classe))].sort();
  const filtered = eligible.filter(r =>
    (!filterClasse || r.student.classe === filterClasse) &&
    (!filterSexe   || r.student.sexe   === filterSexe) &&
    (!filterTrack  || orientTrack(r).key === filterTrack)
  );

  // KPI counts
  const scienceCount  = filtered.filter(r => orientTrack(r).key === "science").length;
  const artsCount     = filtered.filter(r => orientTrack(r).key === "arts").length;
  const unassignedCount = filtered.filter(r => orientTrack(r).key === "unassigned").length;

  // Subject averages for science students
  const scienceStudents = eligible.filter(r => orientTrack(r).key === "science");
  const artsStudents    = eligible.filter(r => orientTrack(r).key === "arts");

  const scienceSubjectData = SCIENCE_SUBJECTS.map(s => {
    const avgs = scienceStudents.map(r => subjectAvg(r, s.key)).filter((v): v is number => v !== null);
    return {
      subject: s.label,
      shortLabel: s.key === "maths" ? "رياضيات" : s.key === "physique" ? "فيزياء" : "علوم ط",
      avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0,
      fill: s.color,
    };
  });

  const artsSubjectData = ARTS_SUBJECTS.map(s => {
    const avgs = artsStudents.map(r => subjectAvg(r, s.key)).filter((v): v is number => v !== null);
    return {
      subject: s.label,
      shortLabel: s.key === "arabe" ? "عربية" : s.key === "anglais" ? "إنجليزية" : "فرنسية",
      avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0,
      fill: s.color,
    };
  });

  // Gender × track data
  const genderTrackData = [
    {
      track: "علوم",
      ذكور: eligible.filter(r => orientTrack(r).key === "science" && r.student.sexe === "M").length,
      إناث: eligible.filter(r => orientTrack(r).key === "science" && r.student.sexe === "F").length,
    },
    {
      track: "آداب",
      ذكور: eligible.filter(r => orientTrack(r).key === "arts" && r.student.sexe === "M").length,
      إناث: eligible.filter(r => orientTrack(r).key === "arts" && r.student.sexe === "F").length,
    },
  ].filter(d => d.ذكور + d.إناث > 0);

  // Average by class (all eligible)
  const avgByClass = classes.map(cls => {
    const inClass = eligible.filter(r => r.student.classe === cls);
    const avg = inClass.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / inClass.length;
    const sciInClass = inClass.filter(r => orientTrack(r).key === "science").length;
    const artInClass = inClass.filter(r => orientTrack(r).key === "arts").length;
    return { name: `قسم ${cls}`, avg: Math.round(avg * 100) / 100, علوم: sciInClass, آداب: artInClass };
  });

  // Grade distribution (all eligible)
  const gradeDistData = [
    { label: "10–12", min: 10, max: 12 },
    { label: "12–14", min: 12, max: 14 },
    { label: "14–16", min: 14, max: 16 },
    { label: "16–18", min: 16, max: 18 },
    { label: "18–20", min: 18, max: 20.1 },
  ].map(b => ({
    label: b.label,
    علوم: scienceStudents.filter(r => (r.annualAvg ?? 0) >= b.min && (r.annualAvg ?? 0) < b.max).length,
    آداب: artsStudents.filter(r => (r.annualAvg ?? 0) >= b.min && (r.annualAvg ?? 0) < b.max).length,
  }));

  // Radar: science vs arts average in all subjects
  const radarData = [...SCIENCE_SUBJECTS, ...ARTS_SUBJECTS].map(s => {
    const sciAvgs = scienceStudents.map(r => subjectAvg(r, s.key)).filter((v): v is number => v !== null);
    const artAvgs = artsStudents.map(r => subjectAvg(r, s.key)).filter((v): v is number => v !== null);
    return {
      subject: s.key === "maths" ? "رياضيات" : s.key === "physique" ? "فيزياء" : s.key === "svt" ? "علوم ط" :
               s.key === "arabe" ? "عربية" : s.key === "anglais" ? "إنجليزية" : "فرنسية",
      "جذع علوم": sciAvgs.length ? +(sciAvgs.reduce((a,b)=>a+b,0)/sciAvgs.length).toFixed(2) : 0,
      "جذع آداب": artAvgs.length ? +(artAvgs.reduce((a,b)=>a+b,0)/artAvgs.length).toFixed(2) : 0,
    };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 items-center justify-center shadow-lg shadow-amber-400/30">
            <Compass className="w-5 h-5 text-white" />
          </span>
          نتائج التوجيه — 4AM
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          تلاميذ السنة الرابعة الناجحون — مع نقاط مواد كل شعبة
        </p>
      </motion.div>

      <OrientationCaseCalculator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">شروط الانتقال والتوجيه الإلكتروني</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 text-sm lg:grid-cols-2">
          <div className="space-y-2">
            <h2 className="font-bold">الانتقال إلى السنة الأولى ثانوي</h2>
            <p className="text-muted-foreground">ينتقل التلميذ مباشرةً إذا كان معدل شهادة التعليم المتوسط 10/20 أو أكثر. إذا كان أقل من 10، يُعتمد متوسط معدل الشهادة والمعدل السنوي للسنة الرابعة؛ النجاح عند بلوغ 10/20.</p>
            <p className="text-xs text-muted-foreground">بعد استيفاء شرط الانتقال، يدرس مجلس القبول والتوجيه النتائج والقدرات في المواد، بطاقة الرغبات، وآراء الفريق التربوي مع مراعاة المقاعد المتاحة.</p>
          </div>
          <div className="space-y-2">
            <h2 className="font-bold">الخطوات داخل التطبيق</h2>
            <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
              <li>تأكد من إدخال نتائج السنة الرابعة ونتيجة BEM.</li>
              <li>استورد بطاقة الرغبات للسنة المحددة من <a href="/orientation-wishes" className="font-semibold text-blue-600 hover:underline">إدارة الرغبات</a>.</li>
              <li>راجع المعدل السنوي ومتوسط مواد كل جذع ومطابقة الرغبة الأولى.</li>
              <li>أدخل المقاعد المتاحة، ثم راجع ترتيب المؤهلين والعتبة التقديرية.</li>
              <li>يعتمد المجلس الترتيب النهائي ويُسجل القرار بعد مراجعة الرغبات وآراء الأساتذة.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {!loading && eligible.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">القدرات والمقاعد ومعدلات القبول التقديرية · {annee}</CardTitle>
            <p className="text-xs text-muted-foreground">يُرتب مترشحو العلوم حسب المعدل الموزون: (رياضيات×4 + فيزياء×3 + علوم طبيعية×3 + المعدل السنوي×2) ÷ 12، ثم تُطبق سعة المقاعد. معدل آخر مقعد ناتج عن الترتيب والسعة، وليس حدًا ثابتًا للمعدل السنوي. تُرتب الآداب حسب متوسط موادها ضمن سعتها.</p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {([
              { key: "science" as const, title: "جذع مشترك علوم وتكنولوجيا", applicants: scienceApplicants, cutoff: scienceCutoff, accepted: scienceWithinCapacity, color: "text-blue-600" },
              { key: "arts" as const, title: "جذع مشترك آداب", applicants: artsApplicants, cutoff: artsCutoff, accepted: artsWithinCapacity, color: "text-violet-600" },
            ]).map(track => (
              <div key={track.key} className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className={`font-bold ${track.color}`}>{track.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{track.applicants.length} مؤهل حسب المواد · {track.accepted.size} ضمن السعة</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    المقاعد
                    <input type="number" min={0} max={500} value={capacities[track.key]} onChange={event => updateCapacity(track.key, Number(event.target.value) || 0)} className="h-9 w-20 rounded-md border bg-background px-2 text-center font-bold text-foreground" aria-label={`سعة ${track.title}`} />
                  </label>
                </div>
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs text-muted-foreground">معدل آخر مقعد تقديري</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">{track.cutoff === null ? track.applicants.length <= capacities[track.key] ? "لا يوجد ضغط على المقاعد" : "لا توجد مقاعد" : `${track.cutoff.toFixed(2)} / 20`}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <motion.div className="flex flex-wrap gap-2"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Select value={annee} onValueChange={setAnnee}>
          <SelectTrigger className="w-36 font-semibold border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>

        <Select value={filterClasse || "__all__"} onValueChange={v => setFilterClasse(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الأقسام</SelectItem>
            {classes.map(c => <SelectItem key={c} value={c}>قسم {c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterSexe || "__all__"} onValueChange={v => setFilterSexe(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-32"><SelectValue placeholder="كل الجنسين" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الجنسين</SelectItem>
            <SelectItem value="M">ذكور</SelectItem>
            <SelectItem value="F">إناث</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterTrack || "__all__"} onValueChange={v => setFilterTrack(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="كل الشعب" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الشعب</SelectItem>
            <SelectItem value="science">جذع مشترك علوم</SelectItem>
            <SelectItem value="arts">جذع مشترك آداب</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* KPI Cards */}
      {!loading && eligible.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            whileHover={{ y: -3 }}
            className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-center text-white shadow-md shadow-amber-500/25">
            <p className="text-3xl font-extrabold">{eligible.length}</p>
            <p className="text-xs text-white/80 mt-0.5">إجمالي الناجحين</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.07 }} whileHover={{ y: -3 }}
            className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-center text-white shadow-md shadow-blue-500/25">
            <p className="text-3xl font-extrabold">{scienceCount}</p>
            <p className="text-xs text-white/80 mt-0.5">جذع مشترك علوم</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.14 }} whileHover={{ y: -3 }}
            className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-4 text-center text-white shadow-md shadow-violet-500/25">
            <p className="text-3xl font-extrabold">{artsCount}</p>
            <p className="text-xs text-white/80 mt-0.5">جذع مشترك آداب</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.21 }} whileHover={{ y: -3 }}
            className="rounded-xl bg-muted/60 border p-4 text-center">
            <p className="text-2xl font-extrabold text-blue-600">
              {eligible.filter(r => r.student.sexe === "M").length}
              <span className="text-pink-500 font-extrabold text-lg">/{eligible.filter(r => r.student.sexe === "F").length}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">ذكور / إناث</p>
          </motion.div>
        </div>
      )}

      {/* Analytics Charts */}
      {!loading && eligible.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Science subject averages */}
            {scienceStudents.length > 0 && (
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                    نقاط مواد جذع علوم (متوسط القسم)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={scienceSubjectData} barSize={36} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                      <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="avg" name="المتوسط" radius={[5, 5, 0, 0]}>
                        {scienceSubjectData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Arts subject averages */}
            {artsStudents.length > 0 && (
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                    نقاط مواد جذع آداب (متوسط القسم)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={artsSubjectData} barSize={36} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                      <XAxis dataKey="shortLabel" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="avg" name="المتوسط" radius={[5, 5, 0, 0]}>
                        {artsSubjectData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Average by class */}
            {avgByClass.length > 1 && (
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />التوجيه حسب القسم
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={avgByClass} barSize={16} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="علوم" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="آداب" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Gender × track */}
            {genderTrackData.length > 0 && (
              <Card className="rounded-2xl border shadow-sm">
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />الجنس حسب التوجيه
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={genderTrackData} barSize={18} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                      <XAxis dataKey="track" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="ذكور" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="إناث" fill="#ec4899" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Grade distribution by track */}
            <Card className="rounded-2xl border shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-bold text-muted-foreground">توزيع المعدلات حسب الشعبة</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={gradeDistData} barSize={14} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="علوم" fill="#3b82f6" radius={[3, 3, 0, 0]} stackId="a" />
                    <Bar dataKey="آداب" fill="#8b5cf6" radius={[3, 3, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Radar: علوم vs آداب subject comparison */}
          {scienceStudents.length > 0 && artsStudents.length > 0 && radarData.length > 0 && (
            <Card className="rounded-2xl border shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-bold text-muted-foreground">مقارنة نقاط المواد: علوم مقابل آداب</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={95}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 20]} tick={{ fontSize: 8 }} />
                    <Radar name="جذع علوم" dataKey="جذع علوم" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                    <Radar name="جذع آداب" dataKey="جذع آداب" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Student list section header */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="inline-flex w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 items-center justify-center shadow">
            <GraduationCap className="w-3.5 h-3.5 text-white" />
          </span>
          <span className="text-sm font-bold">قائمة التلاميذ</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">{filtered.length}</span>
          {scienceCount > 0 && <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">{scienceCount} علوم</Badge>}
          {artsCount > 0    && <Badge variant="secondary" className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{artsCount} آداب</Badge>}
          {unassignedCount > 0 && <Badge variant="secondary" className="text-[10px]">{unassignedCount} غير مستوفٍ للشروط</Badge>}
        </div>
      )}

      {/* Student list */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <motion.div key={i} className="h-16 rounded-xl bg-muted"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
            ))}
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div key="empty"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
              <Compass className="w-14 h-14 mx-auto mb-4 opacity-20" />
            </motion.div>
            <p className="font-semibold">لا توجد نتائج 4AM</p>
            <p className="text-sm mt-1">أضف نتائج تلاميذ السنة الرابعة أولاً</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2">
            {/* Top 3 spotlight */}
            {filtered.length >= 3 && (
              <motion.div className="grid grid-cols-3 gap-3 mb-4"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                {filtered.slice(0, 3).map((r, i) => {
                  const { nom, prenom } = splitName(r.student.nomPrenom);
                  const track = orientTrack(r);
                  return (
                    <motion.div key={r.student.id}
                      initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.1, type: "spring", stiffness: 260 }}
                      whileHover={{ y: -4 }}
                      className={`rounded-2xl border p-4 text-center ${
                        i === 0
                          ? "bg-gradient-to-b from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 border-amber-200 dark:border-amber-800"
                          : i === 1
                            ? "bg-gradient-to-b from-slate-50 to-zinc-50 dark:from-slate-900/40 dark:to-zinc-900/30"
                            : "bg-muted/30"
                      }`}>
                      <motion.div className="text-3xl mb-1"
                        animate={i === 0 ? { scale: [1, 1.1, 1] } : {}}
                        transition={{ duration: 2.5, repeat: Infinity }}>
                        {["🥇", "🥈", "🥉"][i]}
                      </motion.div>
                      <p className="font-black text-xs text-muted-foreground uppercase tracking-wide leading-none">{nom}</p>
                      <p className="font-bold text-sm mt-0.5">{prenom}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        قسم {r.student.classe} ·{" "}
                        <span className={r.student.sexe === "M" ? "text-blue-500" : "text-pink-500"}>
                          {r.student.sexe === "M" ? "♂" : "♀"}
                        </span>
                      </p>
                      <p className={`text-2xl font-extrabold mt-1.5 ${avgColor(r.annualAvg!)}`}>
                        {r.annualAvg!.toFixed(2)}
                      </p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full mt-2 inline-block font-semibold ${track.color}`}>
                        {track.label}
                      </span>
                      {/* Subject mini-bars for top students */}
                      {track.trackSubjects.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {track.trackSubjects.map(s => (
                            <SubjectBar key={s.key} label={s.label.split(" ").slice(-1)[0]!}
                              value={subjectAvg(r, s.key)} color={s.color} />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Full ranked list */}
            {filtered.map((r, i) => {
              const track = orientTrack(r);
              const { nom, prenom } = splitName(r.student.nomPrenom);
              const expanded = expandedId === r.student.id;
              const TrackIcon = track.icon;
              const capacityOutcome = track.key === "science"
                ? track.qualifies ? scienceWithinCapacity.has(r.student.id) ? "ضمن السعة التقديرية" : "يتجاوز السعة" : "راجع معدل المواد"
                : track.key === "arts"
                  ? track.qualifies ? artsWithinCapacity.has(r.student.id) ? "ضمن السعة التقديرية" : "يتجاوز السعة" : "راجع معدل المواد"
                  : null;
              return (
                <motion.div key={r.student.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.5) }}
                  className={`rounded-xl border transition-colors ${expanded ? track.borderColor : "border-transparent hover:border-muted"} bg-card`}>
                  {/* Main row */}
                  <div
                    className="flex items-center gap-3 p-3.5 cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : r.student.id)}>
                    {/* Rank */}
                    <span className="w-7 text-center font-black text-muted-foreground text-sm tabular-nums shrink-0">
                      {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                    </span>

                    <TrackIcon className={`w-4 h-4 shrink-0 ${track.iconColor}`} />

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="font-black text-xs text-muted-foreground uppercase tracking-wide">{nom}</span>
                        <span className="font-semibold text-sm">{prenom}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        قسم {r.student.classe} ·{" "}
                        <span className={r.student.sexe === "M" ? "text-blue-500 font-semibold" : "text-pink-500 font-semibold"}>
                          {r.student.sexe === "M" ? "♂ ذكر" : "♀ أنثى"}
                        </span>
                      </p>
                    </div>

                    {/* Track badge */}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${track.color}`}>
                      {track.label}
                    </span>
                    {capacityOutcome && <Badge variant={capacityOutcome === "ضمن السعة التقديرية" ? "secondary" : "outline"} className="shrink-0 text-[10px]">{capacityOutcome}</Badge>}

                    {/* Annual avg */}
                    <span className={`text-xl font-extrabold tabular-nums w-14 text-end shrink-0 ${avgColor(r.annualAvg!)}`}>
                      {r.annualAvg!.toFixed(2)}
                    </span>

                    {/* Expand toggle */}
                    <span className="text-muted-foreground shrink-0">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>

                  {/* Expanded subject scores */}
                  <AnimatePresence>
                    {expanded && track.trackSubjects.length > 0 && (
                      <motion.div
                        key="expanded"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden">
                        <div className="px-4 pb-4 pt-1 border-t">
                          <p className="text-[11px] text-muted-foreground font-semibold mb-3">
                            نقاط مواد الشعبة المقترحة · {track.label}
                          </p>
                          <div className="grid grid-cols-3 gap-4">
                            {track.trackSubjects.map(s => {
                              const avg = subjectAvg(r, s.key);
                              const scores = [1, 2, 3].map(t => ({ t, v: (r.scores as any)?.[t]?.[s.key] as number | undefined }));
                              return (
                                <div key={s.key} className="space-y-1.5">
                                  <div className="flex justify-between">
                                    <span className="text-xs font-semibold">{s.label}</span>
                                    <span className={`text-xs font-extrabold ${avg === null ? "text-muted-foreground" : avg >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                                      {avg !== null ? avg.toFixed(2) : "—"}
                                    </span>
                                  </div>
                                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <motion.div className="h-full rounded-full"
                                      style={{ background: s.color }}
                                      initial={{ width: 0 }}
                                      animate={{ width: avg !== null ? `${(avg / 20) * 100}%` : "0%" }}
                                      transition={{ duration: 0.5 }} />
                                  </div>
                                  <div className="flex gap-1 justify-between">
                                    {scores.map(({ t, v }) => (
                                      <span key={t} className={`text-[10px] font-mono ${v === undefined ? "text-muted-foreground" : v >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                                        ف{t}:{v !== undefined ? v.toFixed(1) : "—"}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {track.trackAvg !== null && (
                            <div className={`mt-3 text-xs font-semibold rounded-lg px-3 py-2 inline-flex items-center gap-2 ${
                              track.trackAvg >= 12 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" :
                              track.trackAvg >= 10 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" :
                              "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                            }`}>
                              معدل مواد الشعبة: <span className="font-extrabold">{track.trackAvg.toFixed(2)}/20</span>
                              {track.trackAvg >= 12 ? " ✓ ممتاز" : track.trackAvg >= 10 ? " ✓ مناسب" : " ✗ يحتاج تحسين"}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

