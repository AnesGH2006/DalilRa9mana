/**
 * database_query_tool — searches student records, grades, absences, and stats.
 * Returns structured data directly from the DB for the requesting user only.
 */
import { db, studentsTable, gradesTable, absencesTable, schoolInfoTable } from "../../../shared/db.js";
import { eq, and, like, or } from "drizzle-orm";
import { SCHOOL_STAGE_LEVELS, type SchoolStage } from "../../../shared/school-stage.js";

export interface DatabaseQueryInput {
  query_type: "students" | "grades" | "absences" | "stats" | "student_detail" | "failing_students" | "top_students" | "absent_students";
  filters?: {
    niveau?: string;
    classe?: string;
    annee?: string;
    name_search?: string;
    resultat?: "admis" | "non_admis" | "mustarrak";
    statut?: "nouveau" | "redoublant";
    min_absences?: number;
    limit?: number;
  };
}

export async function databaseQueryTool(input: DatabaseQueryInput, userId: string, stage: SchoolStage): Promise<unknown> {
  const filters = input.filters ?? {};
  const annee = filters.annee ?? "2026-2027";
  const limit = Math.min(filters.limit ?? 50, 200);

  // Fetch all data for user (already filtered by userId)
  const [allStudents, allGrades, allAbsences, schoolRows] = await Promise.all([
    db.select().from(studentsTable).where(eq(studentsTable.userId, userId)),
    db.select().from(gradesTable).where(eq(gradesTable.userId, userId)),
    db.select().from(absencesTable).where(eq(absencesTable.userId, userId)),
    db.select().from(schoolInfoTable).where(eq(schoolInfoTable.userId, userId)),
  ]);

  // Build grade averages map
  const triAvg = new Map<string, Map<number, number>>();
  for (const g of allGrades) {
    const score = parseFloat(String(g.score));
    if (isNaN(score) || g.subject !== "__avg__") continue;
    if (!triAvg.has(g.studentId)) triAvg.set(g.studentId, new Map());
    triAvg.get(g.studentId)!.set(g.trimestre, score);
  }

  // Subject scores per student
  const subjAcc = new Map<string, Map<string, number[]>>();
  for (const g of allGrades) {
    const score = parseFloat(String(g.score));
    if (isNaN(score) || g.subject === "__avg__") continue;
    if (!subjAcc.has(g.studentId)) subjAcc.set(g.studentId, new Map());
    const sm = subjAcc.get(g.studentId)!;
    if (!sm.has(g.subject)) sm.set(g.subject, []);
    sm.get(g.subject)!.push(score);
  }

  // Absence map
  const absMap = new Map<string, { total: number; justified: number; unjustified: number }>();
  for (const a of allAbsences) {
    const cur = absMap.get(a.studentId) ?? { total: 0, justified: 0, unjustified: 0 };
    cur.total += a.justifiedHours + a.unjustifiedHours;
    cur.justified += a.justifiedHours;
    cur.unjustified += a.unjustifiedHours;
    absMap.set(a.studentId, cur);
  }

  // Enrich students
  const enriched = allStudents.map(s => {
    const tri = triAvg.get(s.id);
    const vals = [tri?.get(1), tri?.get(2), tri?.get(3)].filter((v): v is number => v !== null && v !== undefined);
    const avg = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    const abs = absMap.get(s.id) ?? { total: 0, justified: 0, unjustified: 0 };
    const subjectAvgs: Record<string, number> = {};
    for (const [subj, scores] of (subjAcc.get(s.id) ?? new Map()).entries()) {
      subjectAvgs[subj] = +(scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2);
    }
    return { ...s, avg, absences: abs, subjectAvgs };
  });

  // Apply filters
  const allowedLevels = new Set<string>(SCHOOL_STAGE_LEVELS[stage]);
  let filtered = enriched.filter(s => s.annee === annee && allowedLevels.has(s.niveau));
  if (filters.niveau) filtered = filtered.filter(s => s.niveau === filters.niveau);
  if (filters.classe) filtered = filtered.filter(s => s.classe === filters.classe);
  if (filters.resultat) filtered = filtered.filter(s => s.resultat === filters.resultat);
  if (filters.statut) filtered = filtered.filter(s => s.statut === filters.statut);
  if (filters.name_search) {
    const q = filters.name_search.toLowerCase();
    filtered = filtered.filter(s => s.nomPrenom.toLowerCase().includes(q));
  }
  if (filters.min_absences !== undefined) {
    filtered = filtered.filter(s => s.absences.total >= filters.min_absences!);
  }

  switch (input.query_type) {
    case "stats": {
      const school = schoolRows[0];
      const total = filtered.length;
      const admis = filtered.filter(s => s.resultat === "admis").length;
      const nonAdmis = filtered.filter(s => s.resultat === "non_admis").length;
      const mustarrak = filtered.filter(s => s.resultat === "mustarrak").length;
      const byLevel: Record<string, { total: number; admis: number; nonAdmis: number; avgMoyenne: number | null }> = {};
      for (const s of filtered) {
        if (!byLevel[s.niveau]) byLevel[s.niveau] = { total: 0, admis: 0, nonAdmis: 0, avgMoyenne: null };
        byLevel[s.niveau].total++;
        if (s.resultat === "admis") byLevel[s.niveau].admis++;
        if (s.resultat === "non_admis") byLevel[s.niveau].nonAdmis++;
      }
      for (const niv of Object.keys(byLevel)) {
        const nivStudents = filtered.filter(s => s.niveau === niv && s.avg !== null);
        if (nivStudents.length) {
          byLevel[niv].avgMoyenne = +(nivStudents.reduce((a, s) => a + s.avg!, 0) / nivStudents.length).toFixed(2);
        }
      }
      return {
        school: school ? { nom: school.nom, wilaya: school.wilaya, commune: school.commune, annee } : null,
        annee,
        total,
        admis,
        nonAdmis,
        mustarrak,
        successRate: total > 0 ? Math.round(admis / total * 100) : 0,
        byLevel,
      };
    }
    case "failing_students": {
      const failing = filtered
        .filter(s => s.resultat === "non_admis")
        .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
        .slice(0, limit);
      return { count: failing.length, students: failing.map(s => ({ id: s.id, name: s.nomPrenom, niveau: s.niveau, classe: s.classe, avg: s.avg, absences: s.absences.total, weakSubjects: Object.entries(s.subjectAvgs).filter(([, v]) => v < 10).sort(([, a], [, b]) => a - b).map(([k, v]) => `${k}: ${v}`).slice(0, 3) })) };
    }
    case "top_students": {
      const top = filtered
        .filter(s => s.avg !== null)
        .sort((a, b) => b.avg! - a.avg!)
        .slice(0, limit);
      return { count: top.length, students: top.map(s => ({ id: s.id, name: s.nomPrenom, niveau: s.niveau, classe: s.classe, avg: s.avg, resultat: s.resultat })) };
    }
    case "absent_students": {
      const absent = filtered
        .filter(s => s.absences.total > 0)
        .sort((a, b) => b.absences.total - a.absences.total)
        .slice(0, limit);
      return { count: absent.length, students: absent.map(s => ({ id: s.id, name: s.nomPrenom, niveau: s.niveau, classe: s.classe, totalAbsences: s.absences.total, unjustified: s.absences.unjustified, resultat: s.resultat })) };
    }
    case "student_detail": {
      const match = filtered.slice(0, 1)[0];
      if (!match) return { found: false, message: "لم يُعثر على التلميذ" };
      return { found: true, student: { ...match } };
    }
    default: {
      return { count: filtered.length, students: filtered.slice(0, limit).map(s => ({ id: s.id, name: s.nomPrenom, niveau: s.niveau, classe: s.classe, sexe: s.sexe, avg: s.avg, resultat: s.resultat, statut: s.statut, absences: s.absences.total })) };
    }
  }
}
