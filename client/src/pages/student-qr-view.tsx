/**
 * Student QR View — Public page (no auth required)
 * Accessible via: /schools/:schoolId/students/:studentId/qr?sig=<hmac>
 *
 * Shown when a parent/visitor scans a student's QR code with their phone camera.
 * Displays: student identity, trimester grades, averages, and absences.
 */
import { useState, useEffect } from "react";
import { useParams, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, User, BookOpen, Calendar,
  Award, AlertCircle, CheckCircle2, School,
} from "lucide-react";
import { getSubjectsForLevel, calcWeightedAvg } from "@shared/subjects";
import type { Niveau } from "@shared/types";

const BASE = import.meta.env.BASE_URL;

interface StudentPublicData {
  student: {
    id: string;
    nomPrenom: string;
    niveau: string;
    classe: string;
    filiere?: import("@shared/subjects").LyceeBacFiliere | null;
    annee: string;
    sexe: string;
  };
  grades: { subject: string; trimestre: number; score: number }[];
  absences: { trimestre: number; justifiedHours: number; unjustifiedHours: number }[];
}

function calcTrimAvg(grades: StudentPublicData["grades"], trimestre: number, niveau: string, filiere?: import("@shared/subjects").LyceeBacFiliere | null) {
  const subs = getSubjectsForLevel(niveau as Niveau, filiere ?? undefined);
  const scores: Record<string, number> = {};
  for (const g of grades) {
    if (g.trimestre === trimestre) scores[g.subject] = g.score;
  }
  return calcWeightedAvg(scores, subs);
}

function scoreColor(n: number) {
  if (n >= 16) return "#10b981";
  if (n >= 10) return "#3b82f6";
  if (n >= 7)  return "#f59e0b";
  return "#ef4444";
}

const TRIM_LABELS = ["الفصل الأول", "الفصل الثاني", "الفصل الثالث"];

export default function StudentQrViewPage() {
  const params = useParams<{ schoolId: string; studentId: string }>();
  const search = useSearch();
  const sp = new URLSearchParams(search);
  const sig = sp.get("sig") ?? "";

  const [data, setData] = useState<StudentPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!params.schoolId || !params.studentId) { setLoading(false); return; }
    fetch(
      `${BASE}api/public/schools/${encodeURIComponent(params.schoolId)}/students/${encodeURIComponent(params.studentId)}?sig=${encodeURIComponent(sig)}`,
    )
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error ?? "خطأ")))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setErr(String(e)); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-start p-4">
      {/* School badge */}
      <div className="w-full max-w-md mt-4 mb-6 flex items-center gap-2 justify-center">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-lg">
          <School className="w-5 h-5 text-white" />
        </div>
        <span className="font-bold text-lg bg-gradient-to-r from-violet-700 to-purple-600 bg-clip-text text-transparent">
          دليل الرقمنة
        </span>
      </div>

      <div className="w-full max-w-md space-y-4">
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 py-16 text-muted-foreground"
            >
              <GraduationCap className="w-10 h-10 animate-pulse opacity-50" />
              <span className="text-sm">جارٍ التحميل…</span>
            </motion.div>
          )}

          {!loading && err && (
            <motion.div key="error"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800/30 p-6 flex flex-col items-center gap-3 shadow text-center"
            >
              <AlertCircle className="w-12 h-12 text-red-500" />
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{err}</p>
              <p className="text-xs text-muted-foreground">تأكد من صحة رمز QR أو تواصل مع إدارة المدرسة</p>
            </motion.div>
          )}

          {!loading && !err && data && (
            <motion.div key="content"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Identity card */}
              <div className="rounded-2xl bg-white dark:bg-gray-900 border border-violet-100 dark:border-violet-900/30 shadow-lg p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold leading-tight">{data.student.nomPrenom}</h1>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full px-2 py-0.5 font-medium">{data.student.niveau}</span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full px-2 py-0.5">قسم {data.student.classe}</span>
                      <span className="text-xs text-muted-foreground">{data.student.annee}</span>
                    </div>
                  </div>
                </div>

                {/* Trimester averages */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[1, 2, 3].map(tr => {
                    const avg = calcTrimAvg(data.grades, tr, data.student.niveau, data.student.filiere);
                    return (
                      <div key={tr} className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-2 text-center">
                        <p className="text-xs text-muted-foreground">ف{tr}</p>
                        <p className="text-xl font-bold mt-0.5" style={{ color: avg !== null ? scoreColor(avg) : undefined }}>
                          {avg !== null ? avg.toFixed(2) : "—"}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Annual average */}
                {(() => {
                  const avgs = [1, 2, 3]
                    .map(tr => calcTrimAvg(data.grades, tr, data.student.niveau, data.student.filiere))
                    .filter(v => v !== null) as number[];
                  if (!avgs.length) return null;
                  const annual = avgs.reduce((a, b) => a + b, 0) / avgs.length;
                  const passed = annual >= 10;
                  return (
                    <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-2.5 ${passed ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/20"}`}>
                      <div className="flex items-center gap-2">
                        <Award className={`w-4 h-4 ${passed ? "text-emerald-600" : "text-red-500"}`} />
                        <span className="text-sm font-medium">المعدل السنوي</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {annual.toFixed(2)}
                        </span>
                        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${passed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                          {passed ? "ناجح" : "راسب"}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Grades by trimester */}
              {[1, 2, 3].map(tr => {
                const trimGrades = data.grades.filter(g => g.trimestre === tr);
                if (!trimGrades.length) return null;
                const subs = getSubjectsForLevel(data.student.niveau as Niveau, data.student.filiere ?? undefined);
                const avg = calcTrimAvg(data.grades, tr, data.student.niveau, data.student.filiere);
                return (
                  <div key={tr} className="rounded-2xl bg-white dark:bg-gray-900 border border-border/50 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-sm font-bold flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-violet-500" />
                        {TRIM_LABELS[tr - 1]}
                      </h2>
                      {avg !== null && (
                        <span className="text-base font-bold" style={{ color: scoreColor(avg) }}>{avg.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {subs.map(sub => {
                        const g = trimGrades.find(gr => gr.subject === sub.key);
                        return (
                          <div key={sub.key} className="flex items-center justify-between text-sm border-b last:border-0 border-gray-100 dark:border-gray-800 pb-1.5 last:pb-0">
                            <span className="text-gray-600 dark:text-gray-400 text-xs">
                              {sub.arLabel}
                              <span className="opacity-50 mr-1">×{sub.coef}</span>
                            </span>
                            <span className="font-bold tabular-nums text-sm" style={{ color: g ? scoreColor(g.score) : undefined }}>
                              {g ? g.score.toFixed(2) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Absences */}
              {data.absences.length > 0 && (
                <div className="rounded-2xl bg-white dark:bg-gray-900 border border-border/50 shadow-sm p-4">
                  <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    الغيابات
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-green-50 dark:bg-green-950/20 p-3 text-center">
                      <p className="text-xs text-muted-foreground">مبررة</p>
                      <p className="text-xl font-bold text-green-600 dark:text-green-400">
                        {data.absences.reduce((s, a) => s + (a.justifiedHours ?? 0), 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">ساعة</p>
                    </div>
                    <div className="rounded-xl bg-red-50 dark:bg-red-950/20 p-3 text-center">
                      <p className="text-xs text-muted-foreground">غير مبررة</p>
                      <p className="text-xl font-bold text-red-600 dark:text-red-400">
                        {data.absences.reduce((s, a) => s + (a.unjustifiedHours ?? 0), 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">ساعة</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <p className="text-center text-xs text-muted-foreground pb-6">
                دليل الرقمنة · منظومة إدارة المؤسسات التعليمية
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
