import { Router } from "express";
import { and, count, eq, ilike } from "drizzle-orm";
import { db, studentsTable } from "../../shared/db.js";
import { buildCensusReport } from "../services/censusEngine.js";
import { officialReportToXlsx } from "../services/officialReports.js";
import { CURRENT_ACADEMIC_YEAR } from "../../shared/academic-year.js";

const router = Router();
function schoolId(req: any) { return req.memberContext?.schoolUserId ?? req.user!.id; }
function forbidParent(req: any, res: any) { if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return true; } if (req.memberContext?.role === "parent") { res.status(403).json({ error: "Parents cannot access census" }); return true; } return false; }
function escapeHtml(v: unknown) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function toHtml(title: string, sheets: any[]) { return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,Tahoma,sans-serif;margin:20px}h1{text-align:center}.sheet{page-break-after:always}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:4px 6px;text-align:right}th{background:#eee}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(title)}</h1>${sheets.map(s=>`<section class="sheet"><h2>${escapeHtml(s.name)}</h2><table><thead><tr>${s.headers.map((h:string)=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${s.rows.map((r:any[])=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`).join("")}</body></html>`; }

router.get("/reports/census", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  try {
    const annee = typeof req.query.annee === "string" && req.query.annee.trim() ? req.query.annee.trim() : CURRENT_ACADEMIC_YEAR;
    const format = typeof req.query.format === "string" ? req.query.format : "json";
    const report = await buildCensusReport(schoolId(req), annee);
    if (format === "xlsx") { const b = officialReportToXlsx(report); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", `attachment; filename="census-${annee}.xlsx"`); res.send(b); return; }
    if (format === "html") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="census-${annee}.html"`); res.send(toHtml(report.title, report.sheets)); return; }
    res.json(report);
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to build census" }); }
});

router.get("/reports/census/students", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  try {
    const userId = schoolId(req);
    const annee = typeof req.query.annee === "string" && req.query.annee.trim() ? req.query.annee.trim() : CURRENT_ACADEMIC_YEAR;
    const page = Math.max(1, Number(req.query.page) || 1); const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const conds = [eq(studentsTable.userId, userId), eq(studentsTable.annee, annee)];
    for (const key of ["niveau", "classe", "sexe", "statut", "resultat"] as const) { const v = req.query[key]; if (typeof v === "string" && v.trim()) conds.push(eq(studentsTable[key], v.trim() as any)); }
    if (typeof req.query.q === "string" && req.query.q.trim()) conds.push(ilike(studentsTable.nomPrenom, `%${req.query.q.trim()}%`));
    const where = and(...conds);
    const [totalRow] = await db.select({ value: count() }).from(studentsTable).where(where);
    const rows = await db.select({ id: studentsTable.id, raqm: studentsTable.raqm, nomPrenom: studentsTable.nomPrenom, dateNaissance: studentsTable.dateNaissance, niveau: studentsTable.niveau, classe: studentsTable.classe, filiere: studentsTable.filiere, sexe: studentsTable.sexe, statut: studentsTable.statut, resultat: studentsTable.resultat }).from(studentsTable).where(where).orderBy(studentsTable.classe, studentsTable.nomPrenom).limit(pageSize).offset((page - 1) * pageSize);
    res.json({ page, pageSize, total: Number(totalRow?.value ?? 0), items: rows });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load students" }); }
});

export default router;
