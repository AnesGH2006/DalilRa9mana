import { Router } from "express";
import { buildRgfReport } from "../services/rgfEngine.js";
import { officialReportToXlsx } from "../services/officialReports.js";
import { CURRENT_ACADEMIC_YEAR } from "../../shared/academic-year.js";

const router = Router();

function schoolId(req: any): string {
  return req.memberContext?.schoolUserId ?? req.user!.id;
}

function forbidParent(req: any, res: any): boolean {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Unauthorized" }); return true; }
  if (req.memberContext?.role === "parent") { res.status(403).json({ error: "Parents cannot access institutional reports" }); return true; }
  return false;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function reportToHtml(title: string, sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number | null>> }>): string {
  const body = sheets.map(sheet => `
    <section class="sheet">
      <h2>${escapeHtml(sheet.name)}</h2>
      <table>
        <thead><tr>${sheet.headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${sheet.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </section>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,Tahoma,sans-serif;margin:24px;color:#111;background:#fff}
h1{font-size:22px;text-align:center;margin-bottom:8px}.meta{text-align:center;color:#444;margin-bottom:24px}
.sheet{page-break-after:always;margin-bottom:32px}.sheet h2{font-size:16px;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 7px;text-align:right;vertical-align:top}
th{background:#eee}@media print{body{margin:0}.sheet{page-break-after:always}}
</style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">تاريخ الإصدار: ${escapeHtml(new Date().toISOString().slice(0, 10))}</div>${body}</body></html>`;
}

router.get("/reports/rgf", async (req, res): Promise<void> => {
  if (forbidParent(req, res)) return;
  try {
    const annee = typeof req.query.annee === "string" && req.query.annee.trim() ? req.query.annee.trim() : CURRENT_ACADEMIC_YEAR;
    const format = typeof req.query.format === "string" ? req.query.format : "json";
    const report = await buildRgfReport(schoolId(req), annee);

    if (format === "xlsx") {
      const buffer = officialReportToXlsx(report);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="rgf-${annee}.xlsx"`);
      res.send(buffer);
      return;
    }
    if (format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="rgf-${annee}.html"`);
      res.send(reportToHtml(report.title, report.sheets));
      return;
    }
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Failed to build RGF report" });
  }
});

export default router;
