import { and, eq } from "drizzle-orm";
import { db, studentsTable } from "../../shared/db.js";
import type { OfficialReport, ReportSheet } from "./officialReports.js";

function safeCell(value: string | number | null | undefined): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
function sheet(name: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): ReportSheet {
  return { name: name.slice(0, 31), headers, rows: rows.map(row => row.map(safeCell)) };
}
function bump(map: Map<string, number>, key: string, by = 1) { map.set(key, (map.get(key) ?? 0) + by); }
function rowsFromMap(map: Map<string, number>, label = "البند", value = "العدد") {
  return [...map.entries()].map(([key, count]) => [key, count] as Array<string | number>);
}
function ageFromDate(value: string | null | undefined, anneeStart: number): number | null {
  if (!value) return null;
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  const fr = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const year = iso ? Number(iso[1]) : fr ? Number(fr[3]) : null;
  return year ? anneeStart - year : null;
}
function ageBand(age: number | null): string {
  if (age === null) return "غير محدد";
  if (age < 12) return "أقل من 12";
  if (age <= 14) return "12-14";
  if (age <= 17) return "15-17";
  return "18 فأكثر";
}
function previousAnnee(annee: string): string {
  const start = Number(annee.slice(0, 4));
  return Number.isFinite(start) ? `${start - 1}-${start}` : annee;
}
const MOYEN = ["1AM", "2AM", "3AM", "4AM"];
const LYCEE = ["1AS", "2AS", "3AS"];

export async function buildCensusReport(userId: string, annee: string) {
  const [current, previous] = await Promise.all([
    db.select().from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, annee))),
    db.select({ niveau: studentsTable.niveau }).from(studentsTable).where(and(eq(studentsTable.userId, userId), eq(studentsTable.annee, previousAnnee(annee)))),
  ]);
  const startYear = Number(annee.slice(0, 4)) || new Date().getFullYear();
  const total = current.length;
  const boys = current.filter(s => s.sexe === "M").length;
  const girls = current.filter(s => s.sexe === "F").length;

  const byNiveau = new Map<string, number>(); const byClasse = new Map<string, number>(); const bySexe = new Map<string, number>();
  const byAge = new Map<string, number>(); const byStatut = new Map<string, number>(); const byResultat = new Map<string, number>();
  const byFiliere = new Map<string, number>(); const byNiveauSexe = new Map<string, number>(); const byNiveauStatut = new Map<string, number>();
  for (const s of current) {
    bump(byNiveau, s.niveau); bump(byClasse, s.classe || "بدون قسم"); bump(bySexe, s.sexe === "M" ? "ذكور" : "إناث");
    bump(byAge, ageBand(ageFromDate(s.dateNaissance, startYear))); bump(byStatut, s.statut || "غير محدد"); bump(byResultat, s.resultat || "بدون نتيجة");
    if (s.filiere) bump(byFiliere, s.filiere);
    bump(byNiveauSexe, `${s.niveau}|${s.sexe === "M" ? "ذكور" : "إناث"}`); bump(byNiveauStatut, `${s.niveau}|${s.statut || "غير محدد"}`);
  }
  const prevByNiveau = new Map<string, number>(); for (const s of previous) bump(prevByNiveau, s.niveau);
  const allNiveaux = [...new Set([...MOYEN, ...LYCEE, ...byNiveau.keys()])];
  const sheets: ReportSheet[] = [
    sheet("01 ملخص عام", ["البند", "القيمة"], [
      ["السنة الدراسية", annee], ["إجمالي التلاميذ", total], ["ذكور", boys], ["إناث", girls],
      ["نسبة الذكور %", total ? Math.round(boys / total * 1000) / 10 : null], ["نسبة الإناث %", total ? Math.round(girls / total * 1000) / 10 : null],
      ["متوسط", current.filter(s => MOYEN.includes(s.niveau)).length], ["ثانوي", current.filter(s => LYCEE.includes(s.niveau)).length],
    ]),
    sheet("02 حسب المستوى", ["المستوى", "العدد", "السنة الماضية", "الفرق"], allNiveaux.map(n => [n, byNiveau.get(n) ?? 0, prevByNiveau.get(n) ?? 0, (byNiveau.get(n) ?? 0) - (prevByNiveau.get(n) ?? 0)])),
    sheet("03 حسب القسم", ["القسم", "العدد"], rowsFromMap(byClasse).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 120)),
    sheet("04 حسب الجنس", ["الجنس", "العدد", "النسبة %"], [["ذكور", boys, total ? Math.round(boys / total * 1000) / 10 : null], ["إناث", girls, total ? Math.round(girls / total * 1000) / 10 : null]]),
    sheet("05 الفئة العمرية", ["الفئة", "العدد"], ["أقل من 12", "12-14", "15-17", "18 فأكثر", "غير محدد"].map(b => [b, byAge.get(b) ?? 0])),
    sheet("06 الوضعية", ["البند", "القيمة", "العدد"], [
      ...rowsFromMap(byStatut, "الوضعية").map(r => ["statut", r[0], r[1]] as Array<string | number>),
      ...rowsFromMap(byResultat, "النتيجة").map(r => ["resultat", r[0], r[1]] as Array<string | number>),
    ]),
    sheet("07 شعب الثانوي", ["الشعبة", "العدد"], rowsFromMap(byFiliere)),
    sheet("08 مستوى × جنس", ["المستوى", "الجنس", "العدد"], [...byNiveauSexe.entries()].map(([k, c]) => { const [n, g] = k.split("|"); return [n, g, c] as Array<string | number>; })),
    sheet("09 مستوى × وضعية", ["المستوى", "الوضعية", "العدد"], [...byNiveauStatut.entries()].map(([k, c]) => { const [n, s] = k.split("|"); return [n, s, c] as Array<string | number>; })),
    sheet("10 مقارنة السنوات", ["المستوى", "الحالية", "السابقة", "الداخلون الجدد", "المغادرون"], allNiveaux.map(n => [n, byNiveau.get(n) ?? 0, prevByNiveau.get(n) ?? 0, Math.max(0, (byNiveau.get(n) ?? 0) - (prevByNiveau.get(n) ?? 0)), Math.max(0, (prevByNiveau.get(n) ?? 0) - (byNiveau.get(n) ?? 0))])),
  ];
  return { type: "census", title: `الإحصاء الشامل — ${annee}`, generatedAt: new Date().toISOString(), params: { annee }, sheets } as OfficialReport;
}
