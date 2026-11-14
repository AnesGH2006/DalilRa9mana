/**
 * fetch_parent_contacts_tool
 * ──────────────────────────
 * Instructs the connected Desktop Agent (via Socket.io) to navigate the
 * Algerian school digitalization platform (الرقمنة), locate students with
 * missing parent phone numbers, extract those numbers, and persist them
 * directly into studentsTable.parentPhone.
 *
 * If no agent is connected, falls back to reporting how many students are
 * missing contact info so the administrator can act manually.
 */

import { db, studentsTable } from "../../../shared/db.js";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { sendDesktopCommand } from "../../socket/agentHandler.js";
import { logger } from "../logger.js";
import { randomUUID } from "crypto";
import { SCHOOL_STAGE_LEVELS, type SchoolLevel, type SchoolStage } from "../../../shared/school-stage.js";

export interface FetchParentContactsInput {
  /** Optionally restrict to a specific grade level */
  niveau?: SchoolLevel;
  /** Optionally restrict to a specific class */
  classe?: string;
  /** School year, e.g. "2026-2027" */
  annee?: string;
  /** Digitalization platform URL — if provided, the agent will open it directly */
  platform_url?: string;
}

export async function fetchParentContactsTool(
  input: FetchParentContactsInput,
  userId: string,
  stage: SchoolStage,
): Promise<unknown> {
  const annee = input.annee ?? "2026-2027";

  // ── 1. Find students with no parentPhone ───────────────────────────────────
  const conds = [
    eq(studentsTable.userId, userId),
    eq(studentsTable.annee, annee),
    inArray(studentsTable.niveau, SCHOOL_STAGE_LEVELS[stage]),
    isNull(studentsTable.parentPhone),
  ];
  if (input.niveau) conds.push(eq(studentsTable.niveau, input.niveau));
  if (input.classe) conds.push(eq(studentsTable.classe, input.classe));

  const missing = await db
    .select({ id: studentsTable.id, nomPrenom: studentsTable.nomPrenom, niveau: studentsTable.niveau, classe: studentsTable.classe, raqm: studentsTable.raqm })
    .from(studentsTable)
    .where(and(...conds))
    .limit(200);

  if (missing.length === 0) {
    return {
      success: true,
      message: "✅ جميع التلاميذ لديهم رقم هاتف ولي الأمر مسجّل.",
      missing_count: 0,
    };
  }

  // ── 2. Attempt desktop agent scraping ─────────────────────────────────────
  let agentResult: unknown = null;
  let agentUsed = false;
  let agentError: string | null = null;

  try {
    const platformUrl = input.platform_url ?? "https://www.tarbiyatic.com/";

    // Command the agent to open the platform and scrape parent contacts.
    // The agent is expected to return an array of { raqm, phone } objects.
    const result = await sendDesktopCommand(
      userId,
      "scrape_parent_contacts",
      {
        url: platformUrl,
        students: missing.map(s => ({ id: s.id, name: s.nomPrenom, raqm: s.raqm, niveau: s.niveau, classe: s.classe })),
        instructions: [
          "افتح رابط منصة الرقمنة المحدد.",
          "ابحث عن كل تلميذ باستخدام رقم القيد أو الاسم.",
          "استخرج رقم هاتف الولي لكل تلميذ.",
          "أرسل النتائج بصيغة JSON: [{studentId, phone}]",
        ].join(" "),
      },
      60_000, // 60 seconds — scraping takes time
    ) as { contacts?: Array<{ studentId: string; phone: string }> };

    agentResult = result;
    agentUsed = true;

    // ── 3. Persist extracted numbers ─────────────────────────────────────────
    const contacts: Array<{ studentId: string; phone: string }> = result?.contacts ?? [];
    let saved = 0;
    const saveErrors: string[] = [];

    for (const c of contacts) {
      if (!c.studentId || !c.phone) continue;
      const clean = c.phone.replace(/\s+/g, "");
      if (!/^[+0-9()\-]{7,20}$/.test(clean)) continue;
      try {
        await db
          .update(studentsTable)
          .set({ parentPhone: clean })
          .where(and(eq(studentsTable.id, c.studentId), eq(studentsTable.userId, userId)));
        saved++;
      } catch (e: any) {
        saveErrors.push(`${c.studentId}: ${e.message}`);
      }
    }

    logger.info({ userId, saved, total: missing.length }, "fetch_parent_contacts: saved phone numbers");

    return {
      success: true,
      agent_used: true,
      missing_before: missing.length,
      contacts_extracted: contacts.length,
      saved_to_db: saved,
      save_errors: saveErrors.length > 0 ? saveErrors : undefined,
      message: `✅ تم استخراج ${contacts.length} رقم هاتف من منصة الرقمنة وحفظ ${saved} منها في قاعدة البيانات.`,
    };
  } catch (err: any) {
    agentError = err.message;
    // Agent not connected or scraping failed — report what we know
  }

  // ── 4. Fallback: report missing list without agent ─────────────────────────
  const sample = missing.slice(0, 20).map(s => `${s.raqm ?? "—"} | ${s.nomPrenom} (${s.niveau} ${s.classe})`);

  return {
    success: false,
    agent_used: agentUsed,
    agent_error: agentError,
    missing_count: missing.length,
    sample_missing: sample,
    message: agentError?.includes("لا يوجد وكيل")
      ? `⚠️ وكيل سطح المكتب غير متصل. يوجد ${missing.length} تلميذ بدون رقم هاتف ولي. قم بتوصيل الوكيل أولاً أو قم برفع ملف Excel يحتوي على عمود "رقم هاتف الولي".`
      : `⚠️ فشل استخراج الأرقام تلقائياً: ${agentError}. يوجد ${missing.length} تلميذ بدون رقم هاتف ولي الأمر.`,
  };
}
