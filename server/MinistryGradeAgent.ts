/**
 * Ministry Grade Automation Agent
 * Dalil Ra9mana Platform → Tharwa Integration
 * Status: Production-Ready
 */

import { chromium, type Browser, type Page } from "playwright";
import { db, studentsTable, gradesTable } from "../shared/db.js";
import { eq, and } from "drizzle-orm";

interface GradeRecord {
  matricule: string;
  student_name: string;
  subject_code: string;
  continuous_eval?: number;
  test_1?: number;
  test_2?: number;
  exam?: number;
  trimestre: number;
  annee: string;
}

interface ValidationError {
  matricule: string;
  student_name: string;
  error: string;
  grade_value?: string | number;
}

interface AgentResult {
  class_id: string;
  trimester: number;
  total_records: number;
  validated_records: GradeRecord[];
  flagged_errors: ValidationError[];
  sync_status: "pending" | "in_progress" | "completed" | "failed";
  timestamp: string;
}

/**
 * VALIDATION LAYER
 */
class GradeValidator {
  static isValidGrade(value: any): boolean {
    if (value === null || value === undefined) return false;
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0.0 && num <= 20.0;
  }

  static normalizeGrade(value: any): number | null {
    if (!this.isValidGrade(value)) return null;
    return parseFloat(parseFloat(value).toFixed(2));
  }

  static validateRecord(record: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Matricule validation
    if (!record.matricule || typeof record.matricule !== "string") {
      errors.push("Missing or invalid Matricule (National Student ID)");
    }

    // Student name validation
    if (!record.student_name || typeof record.student_name !== "string") {
      errors.push("Missing or invalid Student Name");
    }

    // At least one grade must exist
    const hasGrade =
      record.continuous_eval ||
      record.test_1 ||
      record.test_2 ||
      record.exam;
    if (!hasGrade) {
      errors.push("At least one grade field must be present");
    }

    // Grade range validation
    const gradeFields = ["continuous_eval", "test_1", "test_2", "exam"];
    for (const field of gradeFields) {
      if (record[field] !== undefined && record[field] !== null) {
        if (!this.isValidGrade(record[field])) {
          errors.push(`Invalid grade in ${field}: ${record[field]}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * DATABASE LAYER
 */
class GradeRepository {
  static async fetchGradesForClass(
    classId: string,
    trimestre: number,
    annee: string
  ): Promise<GradeRecord[]> {
    try {
      const records = await db
        .select({
          matricule: studentsTable.id,
          student_name: studentsTable.nomPrenom,
          subject_code: gradesTable.subject,
          exam: gradesTable.score,
          trimestre: gradesTable.trimestre,
          annee: gradesTable.annee,
        })
        .from(gradesTable)
        .leftJoin(
          studentsTable,
          eq(gradesTable.studentId, studentsTable.id)
        )
        .where(
          and(
            eq(studentsTable.classe, classId),
            eq(gradesTable.trimestre, trimestre),
            eq(gradesTable.annee, annee)
          )
        );

      return records.map((record): GradeRecord => ({
        matricule: record.matricule ?? "",
        student_name: record.student_name ?? "",
        subject_code: record.subject_code ?? "",
        exam: record.exam !== null && record.exam !== undefined ? Number(record.exam) : undefined,
        trimestre: record.trimestre,
        annee: record.annee,
      }));
    } catch (error) {
      console.error("Database fetch failed:", error);
      throw error;
    }
  }
}

/**
 * THARWA INTEGRATION LAYER
 */
class TharwaAutomation {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async login(username: string, password: string): Promise<void> {
    try {
      this.browser = await chromium.launch({ headless: true });
      this.page = await this.browser.newPage();

      console.log("[THARWA] Logging in...");
      await this.page.goto("https://tharwa.education.dz/login", {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      await this.page.fill('input[name="username"]', username);
      await this.page.fill('input[name="password"]', password);
      await this.page.click('button[type="submit"]');

      await this.page.waitForNavigation({
        waitUntil: "networkidle",
        timeout: 30000,
      });

      console.log("[THARWA] ✅ Login successful");
    } catch (error) {
      await this.close();
      throw new Error(`Tharwa login failed: ${error}`);
    }
  }

  async enterGrade(record: GradeRecord): Promise<boolean> {
    if (!this.page) throw new Error("Not logged in to Tharwa");

    try {
      console.log(
        `[THARWA] Processing: ${record.student_name} (${record.matricule})`
      );

      // Navigate to grades entry page
      await this.page.goto("https://tharwa.education.dz/grades", {
        waitUntil: "networkidle",
      });

      // Select subject
      await this.page.selectOption('select[name="subject"]', record.subject_code);

      // Select trimester
      await this.page.selectOption(
        'select[name="trimestre"]',
        record.trimestre.toString()
      );

      // Find student by Matricule and enter grades
      const studentRow = this.page.locator(`text=${record.matricule}`);

      if (await studentRow.count() > 0) {
        // Continuous evaluation
        if (record.continuous_eval !== undefined) {
          await studentRow
            .locator('input[name*="continuous"]')
            .fill(record.continuous_eval.toString());
        }

        // Test 1
        if (record.test_1 !== undefined) {
          await studentRow
            .locator('input[name*="test_1"]')
            .fill(record.test_1.toString());
        }

        // Test 2
        if (record.test_2 !== undefined) {
          await studentRow
            .locator('input[name*="test_2"]')
            .fill(record.test_2.toString());
        }

        // Exam
        if (record.exam !== undefined) {
          await studentRow
            .locator('input[name*="exam"]')
            .fill(record.exam.toString());
        }

        // Submit
        await this.page.click('button[type="submit"]');
        await this.page.waitForTimeout(1000);

        console.log(`[THARWA] ✅ Grade entered for ${record.student_name}`);
        return true;
      } else {
        console.warn(
          `[THARWA] ⚠️ Student not found: ${record.matricule}`
        );
        return false;
      }
    } catch (error) {
      console.error(
        `[THARWA] ❌ Failed to enter grade for ${record.student_name}:`,
        error
      );
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
  }
}

/**
 * MAIN AGENT
 */
export class MinistryGradeAgent {
  private validator = GradeValidator;
  private repository = GradeRepository;
  private tharwa: TharwaAutomation;

  constructor() {
    this.tharwa = new TharwaAutomation();
  }

  async processGrades(
    classId: string,
    trimestre: number,
    annee: string,
    tharwaUsername: string,
    tharwaPassword: string
  ): Promise<AgentResult> {
    const result: AgentResult = {
      class_id: classId,
      trimester: trimestre,
      total_records: 0,
      validated_records: [],
      flagged_errors: [],
      sync_status: "pending",
      timestamp: new Date().toISOString(),
    };

    try {
      result.sync_status = "in_progress";

      // 1. FETCH GRADES FROM DATABASE
      console.log("\n[AGENT] Phase 1: Fetching grades from database...");
      const rawGrades = await this.repository.fetchGradesForClass(
        classId,
        trimestre,
        annee
      );
      result.total_records = rawGrades.length;
      console.log(`[AGENT] ✅ Retrieved ${rawGrades.length} records`);

      // 2. VALIDATE ALL RECORDS
      console.log("\n[AGENT] Phase 2: Validating records...");
      for (const grade of rawGrades) {
        const validation = this.validator.validateRecord(grade);

        if (validation.valid) {
          // Normalize grades to 2 decimal places
          const normalizedGrade: GradeRecord = {
            matricule: grade.matricule,
            student_name: grade.student_name,
            subject_code: grade.subject_code,
            continuous_eval: grade.continuous_eval
              ? this.validator.normalizeGrade(grade.continuous_eval) || undefined
              : undefined,
            test_1: grade.test_1
              ? this.validator.normalizeGrade(grade.test_1) || undefined
              : undefined,
            test_2: grade.test_2
              ? this.validator.normalizeGrade(grade.test_2) || undefined
              : undefined,
            exam: grade.exam
              ? this.validator.normalizeGrade(grade.exam) || undefined
              : undefined,
            trimestre,
            annee,
          };

          result.validated_records.push(normalizedGrade);
        } else {
          result.flagged_errors.push({
            matricule: grade.matricule,
            student_name: grade.student_name,
            error: validation.errors.join("; "),
          });
        }
      }

      console.log(
        `[AGENT] ✅ Validation complete: ${result.validated_records.length} valid, ${result.flagged_errors.length} errors`
      );

      // 3. SYNC WITH THARWA
      console.log("\n[AGENT] Phase 3: Syncing with Tharwa...");
      await this.tharwa.login(tharwaUsername, tharwaPassword);

      let successCount = 0;
      for (const grade of result.validated_records) {
        const success = await this.tharwa.enterGrade(grade);
        if (success) successCount++;
      }

      console.log(
        `[AGENT] ✅ Tharwa sync complete: ${successCount}/${result.validated_records.length} grades entered`
      );

      result.sync_status = "completed";
    } catch (error) {
      console.error("[AGENT] ❌ Error:", error);
      result.sync_status = "failed";
      result.flagged_errors.push({
        matricule: "SYSTEM",
        student_name: "SYSTEM_ERROR",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      await this.tharwa.close();
    }

    console.log("\n[AGENT] 📊 FINAL REPORT:");
    console.log(JSON.stringify(result, null, 2));

    return result;
  }
}

// EXPORT FOR USE
export default MinistryGradeAgent;