/**
 * OCR Service — Gemini Vision + Groq Vision + Tesseract.js (fallback)
 *
 * Supports:
 *  - grades            : printed/handwritten grade sheets (0-20 scores)
 *  - absences          : printed absence sheets (justified/unjustified hours, term totals)
 *  - daily_attendance   : weekly attendance grids (per-day symbols like ح/غ/غ‌م/ت)
 *  - daily_register     : dated per-student registers with an attendance mark
 *
 * Design note on daily_attendance: instead of forcing a fixed enum of symbols,
 * the model is asked to describe the table structure it sees (day column names)
 * and return the RAW symbol exactly as written for each cell. This keeps the
 * system usable across schools that use slightly different notations, and lets
 * a human reviewer catch anything unexpected in the results table before saving.
 */
import sharp from "sharp";
import Tesseract from "tesseract.js";
import { logger } from "../lib/logger.js";


export type OcrEngine = "gemini" | "vision" | "tesseract" | "auto";
export type OcrType = "grades" | "absences" | "daily_attendance" | "daily_register";

export interface OcrGradeRow {
  studentName: string;
  grade: number;
  confidence: number;
}

export interface OcrAbsenceRow {
  studentName: string;
  justifiedHours: number;
  unjustifiedHours: number;
  confidence: number;
}

export interface OcrDailyAttendanceRow {
  studentName: string;
  /** e.g. { "الاثنين": "ح", "الثلاثاء": "غ", "الأربعاء": "غ/م" } — raw symbols as read */
  days: Record<string, string>;
  notes?: string;
  confidence: number;
}

export interface OcrDailyRegisterRow {
  studentName: string;
  status: string;
  isAbsent: boolean | null;
  confidence: number;
  note?: string;
}

export interface OcrResult {
  engine: OcrEngine;
  type: OcrType;
  rows: Array<OcrGradeRow | OcrAbsenceRow | OcrDailyAttendanceRow | OcrDailyRegisterRow>;
  /** For daily_attendance: the day-column headers detected in the sheet, in order */
  dayColumns?: string[];
  reportDate?: string;
  rawText?: string;
  overallConfidence: number;
}

export interface ApiKeys {
  geminiApiKey?: string | null;
  groqApiKey?: string | null;
}

function isOcrRateLimitError(error: Error): boolean {
  return /(?:API\s+429|RESOURCE_EXHAUSTED|rate_limit_exceeded|tokens per minute|quota exceeded)/i.test(error.message);
}

const OCR_QUOTA_ERROR = "حصة خدمة OCR ممتلئة مؤقتًا. انتظر حتى تتجدد حصة Gemini أو Groq، أو أضف مفتاح API آخر من الإعدادات.";

// ── Image preprocessing ─────────────────────────────────────────────────────────

export async function prepareImage(buffer: Buffer): Promise<{ data: string; mimeType: string; tesseractBuffer: Buffer }> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 800;
  const targetWidth = Math.min(Math.max(w, 1600), 2400);

  const processed = await sharp(buffer)
    .autoOrient()
    .resize({ width: Math.min(Math.max(w, 1200), 1920), withoutEnlargement: false, kernel: "lanczos3" })
    .jpeg({ quality: 88 })
    .toBuffer();

  const tesseractBuffer = await sharp(buffer)
    .autoOrient()
    .resize({ width: targetWidth, withoutEnlargement: false, kernel: "lanczos3" })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    data: processed.toString("base64"),
    mimeType: "image/jpeg",
    tesseractBuffer,
  };
}

// ── Gemini Vision ─────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-3.8-flash";

async function callGeminiVision(
  imageB64: string,
  mimeType: string,
  prompt: string,
  apiKey: string | null,
  retries = 3,
): Promise<string> {
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data: imageB64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          // Gemini 3.x models default to "high" thinking level, which adds
          // significant latency for a simple extraction task like this one
          // and was causing 30s timeouts. "low" is fast and sufficient here.
          thinkingConfig: { thinkingLevel: "low" },
        },
      });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(60000),
        },
      );

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        lastError = new Error(`Gemini API ${res.status}: ${err}`);

        if (res.status >= 500) {
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        throw lastError;
      }

      const json = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const content = json.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content || content.trim().length === 0) {
        lastError = new Error("Gemini Vision returned empty response");
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw lastError;
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ attempt, error: lastError.message }, "Gemini Vision attempt failed");

      if (attempt < retries && !isOcrRateLimitError(lastError)) {
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 5000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("Gemini Vision failed after retries");
}

// ── Groq Vision ─────────────────────────────────────────────────────────────────

async function callGroqVision(imageB64: string, mimeType: string, prompt: string, apiKey: string | null, retries = 3): Promise<string> {
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageB64}` } },
            { type: "text", text: prompt },
          ],
        }],
        max_tokens: 4096,
        temperature: 0,
      });

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        lastError = new Error(`Groq API ${res.status}: ${err}`);

        if (res.status >= 500) {
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        throw lastError;
      }

      const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;

      if (!content || content.trim().length === 0) {
        lastError = new Error("Groq Vision returned empty response");
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw lastError;
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ attempt, error: lastError.message }, "Groq Vision attempt failed");

      if (attempt < retries && !isOcrRateLimitError(lastError)) {
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 5000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("Groq Vision failed after retries");
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const GRADES_PROMPT = `هذه صورة "كشف نقاط جماعي" مدرسي جزائري رسمي، على شكل جدول قد يحتوي عدة أعمدة: رقم تسلسلي، رمز الجنس (ذكر/أنثى)، الاسم الكامل، القسم، تاريخ الميلاد، والدرجة من 20 (غالبًا آخر عمود على اليمين بعنوان "الدرجة / 20" أو "المعدل").

استخرج فقط عمودين: الاسم الكامل للتلميذ، ودرجته من 20. تجاهل تمامًا أي أعمدة أخرى (الرقم التسلسلي، الجنس، القسم، تاريخ الميلاد) ولا تدمجها مع اسم التلميذ بأي شكل.

أعد مصفوفة JSON فقط بالشكل التالي — لا تضف أي نص قبلها أو بعدها:
[{"studentName": "الاسم الكامل", "grade": 14.5}, ...]

قواعد صارمة:
- الصف الأول أو الثاني من الصورة عادة عنوان (اسم المدرسة، "كشف نقاط جماعي"، السنة الدراسية) — هذا ليس صف بيانات تلميذ، تجاهله تمامًا ولا تُدرجه كصف بالمصفوفة.
- آخر صف أو صفين قد يكونان "توقيع المدير" أو "توقيع الولي" — هذه ليست بيانات تلميذ، تجاهلها.
- اقرأ كل صف بيانات فعلي في الجدول من الأعلى للأسفل بدون استثناء أي صف، حتى لو كان الجدول طويلاً (10 صفوف أو أكثر).
- الدرجات من 0 إلى 20، أرقام عشرية أو صحيحة مسموحة.
- استخرج الاسم الكامل للتلميذ فقط من عمود الاسم (عادة معنون "الاسم الكامل" أو "اللقب والاسم")، كاملاً كما هو مكتوب بالعربية.
- إذا وُجد عمود منفصل للرقم التسلسلي أو تاريخ الميلاد أو رمز الجنس، تجاهله تمامًا ولا تخلطه مع الاسم أو الدرجة.
- اقرأ الصفوف حتى لو كانت الكتابة اليدوية أو الصورة مائلة أو الأعمدة غير منتظمة.
- ميّز عمود الدرجة عن أي أرقام أخرى بالجدول (مثل جزء من تاريخ الميلاد) — الدرجة تكون بعمود مستقل بعنوان يحتوي "الدرجة" أو "/20" أو "المعدل".
- إذا كانت الخانة غير مقروءة، لا تخمّنها وأعد الصف بدونها.
- لا تخترع بيانات، استخرج ما هو موجود فقط.`;

const ABSENCES_PROMPT = `هذه صورة كشف غياب مدرسي جزائري تجميعي (إجمالي ساعات لفصل دراسي كامل، وليس سجلاً يوميًا)، وقد تكون مطبوعة أو مكتوبة بخط اليد، بالعربية أو الفرنسية.
استخرج جدول التلاميذ وساعات الغياب بدقة تامة.
أعد مصفوفة JSON فقط بالشكل التالي — لا تضف أي نص قبلها أو بعدها:
[{"studentName": "لقب الاسم", "justifiedHours": 2, "unjustifiedHours": 5}, ...]

قواعد:
- ساعات الغياب أرقام صحيحة من 0 إلى 500.
- إذا وجدت عمود واحد للغياب فقط (بدون تمييز)، ضع القيمة في "unjustifiedHours" و 0 في "justifiedHours".
- استخرج أسماء التلاميذ كاملة كما تظهر في الجدول (عربي).
- اقرأ الجدول حتى لو كانت الكتابة اليدوية أو الصورة مائلة أو الأعمدة غير منتظمة.
- اربط كل رقم بالاسم في الصف نفسه، ولا تعتبر رقم التسلسل ساعة غياب.
- إذا كانت خانة غير مقروءة، لا تخمّنها واستخدم 0 فقط عندما يكون العمود غير موجود أصلاً.
- تجاهل أرقام التسلسل والعناوين والخانات الفارغة.
- لا تخترع بيانات، استخرج ما هو موجود فقط.
- ملاحظة مهمة: لو كانت هذه الصورة فعليًا جدولاً أسبوعيًا يوميًا (بأعمدة أيام الأسبوع ورموز مثل ح/غ/ت في كل خانة)، فهذا نوع مختلف من الكشوف — أعد مصفوفة فارغة [] فقط، لأن هذا النوع من الصور يُعالَج بطريقة أخرى.`;

const DAILY_ATTENDANCE_PROMPT = `هذه صورة سجل حضور وغياب مدرسي أسبوعي جزائري. الجدول فيه عمود لكل يوم من أيام الأسبوع الدراسي (عادة من الاثنين إلى الجمعة)، وفي كل خانة تقاطع بين تلميذ ويوم يوجد رمز مكتوب يدل على حالته في ذلك اليوم (مثل ح، غ، غ/م، ت، أو رموز أخرى قد تستخدمها المدرسة).

اقرأ عناوين الأعمدة (أسماء الأيام) بالضبط كما هي مكتوبة في رأس الجدول، من اليمين لليسار أو حسب الترتيب الظاهر في الصورة.

أعد كائن JSON واحد فقط بهذا الشكل الدقيق — لا تضف أي نص قبله أو بعده:
{
  "dayColumns": ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"],
  "rows": [
    {
      "studentName": "لقب الاسم",
      "days": {"الاثنين": "ح", "الثلاثاء": "غ", "الأربعاء": "ح", "الخميس": "ح", "الجمعة": "ح"},
      "notes": "ورود الولي"
    }
  ]
}

قواعد مهمة:
- "dayColumns" يجب أن تحتوي على أسماء الأيام بالضبط كما ظهرت في رأس الجدول، بنفس الترتيب من اليسار لليمين كما في الصورة.
- انسخ الرمز الموجود في كل خانة كما هو مكتوب حرفيًا، بدون تفسيره أو تحويله (مثلاً لا تحوّل "ح" إلى "حاضر" أو "present" — اكتبه "ح" فقط كما رأيته).
- إذا كانت الخانة فارغة تمامًا في الصورة (لم يُكتب فيها شيء)، لا تُدرجها في "days" لهذا اليوم أصلاً — لا تفترض "حاضر" ولا أي قيمة افتراضية.
- عمود "ملاحظات" إن وُجد هو ملاحظة واحدة لكامل الأسبوع لكل تلميذ، ضعه في حقل "notes" (احذفه من الكائن إذا كان فارغًا).
- استخرج أسماء التلاميذ كاملة كما تظهر في الجدول (عربي)، وتجاهل عمود رقم التسلسل.
- اقرأ الجدول حتى لو كانت الكتابة اليدوية أو الصورة مائلة أو فيها بقع أو إضاءة غير متساوية — ابذل قصارى جهدك، ولا تتجاهل صفاً كاملاً لمجرد صعوبة جزء منه.
- لا تخترع بيانات لم تُكتب في الصورة.`;

const DAILY_REGISTER_PROMPT = `اقرأ صورة ورقة غياب أو حضور مدرسية جزائرية (قد تكون "قائمة الغائبين" أو سجل حضور كاملاً). قد تحتوي أعمدة لا علاقة لها بالحضور مثل الجنس، تاريخ الميلاد، القسم، والرقم التسلسلي.

أعد كائن JSON فقط بهذا الشكل:
{"reportDate":"2024-03-15","rows":[{"studentName":"الاسم الكامل","status":"غائب","isAbsent":true,"note":""}]}

قواعد:
- اقرأ كل الأسطر المكتوبة في الصورة ولا تعتمد على أي قائمة تلاميذ مسبقة. انسخ كل اسم كما هو مكتوب دون تصحيح أو دمج أو حذف.
- لا تُرجع rows فارغة إذا كان هناك سطر مقروء واحد على الأقل. السطر غير الواضح أرجعه كما قرأته ولا تحذفه.
- استخرج التاريخ من عنوان الورقة وحوّله إلى YYYY-MM-DD. إذا لم يظهر تاريخ واضح، أعد reportDate بقيمة null.
- status قيمة من ثلاث فقط: "حاضر" أو "غائب" أو "معذور". اعتمد على علامة أو كلمة الحضور في الصف.
- إذا كان عنوان الورقة "قائمة الغائبين" أو ما يشبهه، فكل تلميذ مدرج فيها غائب: status="غائب" حتى لو لم تُكتب كلمة الغياب في الصف.
- isAbsent=true للحالتين "غائب" و"معذور"، وfalse للحالة "حاضر"، وnull فقط إذا كانت الحالة غير مقروءة إطلاقاً.
- note: أي ملاحظة جانبية مكتوبة في الصف (نص فارغ إن لم توجد). لا تضع كلمة الحالة نفسها ("غائب") في note.
- تجاهل أرقام التسلسل وتواريخ الميلاد والعناوين. لا تخترع أسماء أو علامات.`;

// ── JSON extraction helpers ────────────────────────────────────────────────────

function extractJsonArrayCandidate(raw: string): string | null {
  const candidates: string[] = [];

  const codeFence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (codeFence) candidates.push(codeFence);

  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(raw.slice(firstBracket, lastBracket + 1));
  }

  const fromObject = raw.match(/\[[\s\S]*\]/)?.[0];
  if (fromObject) candidates.push(fromObject);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function extractJsonObjectCandidate(raw: string): string | null {
  const candidates: string[] = [];

  const codeFence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (codeFence) candidates.push(codeFence);

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
}

// ── Confidence estimation ──────────────────────────────────────────────────────

export function estimateLineConfidence(
  studentName: string,
  value: number | { justifiedHours: number; unjustifiedHours: number } | Record<string, string>,
  type: OcrType,
): number {
  let score = 65;

  const cleanedName = String(studentName ?? "").replace(/\s+/g, " ").trim();
  const words = cleanedName.split(/\s+/).filter(Boolean);
  const alphabeticWords = words.filter(word => /[\p{L}]/u.test(word));

  if (alphabeticWords.length >= 2) score += 10;
  if (alphabeticWords.length >= 3) score += 5;
  if (cleanedName.length >= 6 && cleanedName.length <= 60) score += 8;
  if (alphabeticWords.some(word => word.length >= 3)) score += 5;

  if (type === "grades") {
    const grade = typeof value === "number" ? value : NaN;
    if (Number.isFinite(grade) && grade >= 0 && grade <= 20) {
      score += 15;
      if (Number.isInteger(grade * 4) || grade % 0.5 === 0) score += 5;
    }
  } else if (type === "absences") {
    const absence = typeof value === "object" && !Array.isArray(value) && "justifiedHours" in (value as object)
      ? value as { justifiedHours: number; unjustifiedHours: number }
      : null;
    if (absence) {
      const justified = Number(absence.justifiedHours ?? 0);
      const unjustified = Number(absence.unjustifiedHours ?? 0);
      if (justified >= 0 && unjustified >= 0 && (justified + unjustified) <= 100) {
        score += 15;
      }
      if (justified <= 30 && unjustified <= 30) score += 5;
    }
  } else if (type === "daily_attendance") {
    const days = typeof value === "object" ? value as Record<string, string> : null;
    if (days) {
      const filledCount = Object.values(days).filter(v => v && v.trim().length > 0).length;
      if (filledCount >= 1) score += 10;
      if (filledCount >= 3) score += 10;
      // Short symbols (1-3 chars) look like real attendance marks, not noise
      const plausible = Object.values(days).every(v => v.trim().length <= 4);
      if (plausible) score += 5;
    }
  } else if (type === "daily_register") {
    const registerRow = typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : null;
    if (registerRow?.status?.trim()) score += 15;
    if (registerRow?.status && registerRow.status.length <= 20) score += 5;
  }

  return Math.max(50, Math.min(96, Math.round(score)));
}

// ── Vision extraction (shared logic for both Gemini and Groq) ───────────────────

export async function callVisionEngine(
  engine: "gemini" | "vision",
  imageB64: string,
  mimeType: string,
  prompt: string,
  apiKeys: ApiKeys,
): Promise<string> {
  if (engine === "gemini") {
    return callGeminiVision(imageB64, mimeType, prompt, apiKeys.geminiApiKey ?? null);
  }
  return callGroqVision(imageB64, mimeType, prompt, apiKeys.groqApiKey ?? null);
}

export async function extractWithVision(
  engine: "gemini" | "vision",
  imageB64: string,
  mimeType: string,
  type: OcrType,
  apiKeys: ApiKeys,
): Promise<{ rows: Array<OcrGradeRow | OcrAbsenceRow | OcrDailyAttendanceRow | OcrDailyRegisterRow>; rawText: string; dayColumns?: string[]; reportDate?: string }> {

  if (type === "daily_register") {
    const content = await callVisionEngine(engine, imageB64, mimeType, DAILY_REGISTER_PROMPT, apiKeys);
    const jsonCandidate = extractJsonObjectCandidate(content);
    if (!jsonCandidate) return { rows: [], rawText: content };

    try {
      const parsed = JSON.parse(jsonCandidate) as { reportDate?: unknown; rows?: unknown[] };
      const reportDate = typeof parsed.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.reportDate)
        ? parsed.reportDate
        : undefined;
      const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
      const rows: OcrDailyRegisterRow[] = rawRows
        .filter((row: any) => row && typeof row === "object" && typeof row.studentName === "string" && row.studentName.trim())
        .map((row: any) => {
          const studentName = String(row.studentName).trim();
          const status = typeof row.status === "string" ? row.status.trim() : "";
let isAbsent: boolean | null = typeof row.isAbsent === "boolean" ? row.isAbsent : null;
if (isAbsent === null) {
  if (/غائب|غياب|معذور/.test(status)) isAbsent = true;
  else if (/حاضر/.test(status)) isAbsent = false;
}
const note = typeof row.note === "string" ? row.note.trim() : "";
return {
  studentName,
  status,
  isAbsent,
  note,
  confidence: estimateLineConfidence(studentName, { status }, "daily_register"),
};
        });
      return { rows, rawText: content, reportDate };
    } catch (err) {
      logger.warn({ err, type }, "Failed to parse daily_register JSON");
      return { rows: [], rawText: content };
    }
  }

  if (type === "daily_attendance") {
    const content = await callVisionEngine(engine, imageB64, mimeType, DAILY_ATTENDANCE_PROMPT, apiKeys);
    const jsonCandidate = extractJsonObjectCandidate(content);
    if (!jsonCandidate) return { rows: [], rawText: content };

    try {
      const parsed = JSON.parse(jsonCandidate) as { dayColumns?: string[]; rows?: unknown[] };
      const dayColumns = Array.isArray(parsed.dayColumns) ? parsed.dayColumns.map(String) : [];
      const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];

      const rows: OcrDailyAttendanceRow[] = rawRows
        .filter((r: any) => r && typeof r === "object" && typeof r.studentName === "string" && r.studentName.trim().length > 0)
        .map((r: any) => {
          const studentName = String(r.studentName).trim();
          const days: Record<string, string> = {};
          if (r.days && typeof r.days === "object") {
            for (const [day, symbol] of Object.entries(r.days)) {
              if (typeof symbol === "string" && symbol.trim().length > 0) {
                days[day] = symbol.trim();
              }
            }
          }
          const notes = typeof r.notes === "string" && r.notes.trim().length > 0 ? r.notes.trim() : undefined;

          return {
            studentName,
            days,
            notes,
            confidence: estimateLineConfidence(studentName, days, "daily_attendance"),
          };
        });

      return { rows, rawText: content, dayColumns };
    } catch (err) {
      logger.warn({ err, type }, "Failed to parse daily_attendance JSON");
      return { rows: [], rawText: content };
    }
  }

  const prompt = type === "absences" ? ABSENCES_PROMPT : GRADES_PROMPT;
  const content = await callVisionEngine(engine, imageB64, mimeType, prompt, apiKeys);
  const jsonCandidate = extractJsonArrayCandidate(content);
  if (!jsonCandidate) return { rows: [], rawText: content };

  try {
    const parsed = JSON.parse(jsonCandidate) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return { rows: [], rawText: content };

    if (type === "absences") {
      const rows = parsed
        .filter((r: any) =>
          r && typeof r === "object" &&
          typeof r.studentName === "string" &&
          String(r.studentName).trim().length > 0 &&
          Number.isFinite(Number(r.justifiedHours)) &&
          Number.isFinite(Number(r.unjustifiedHours)) &&
          Number(r.justifiedHours) >= 0 &&
          Number(r.unjustifiedHours) >= 0,
        )
        .map((r: any) => {
          const justifiedHours = Math.round(Number(r.justifiedHours));
          const unjustifiedHours = Math.round(Number(r.unjustifiedHours));
          const studentName = String(r.studentName).trim();
          return {
            studentName,
            justifiedHours,
            unjustifiedHours,
            confidence: estimateLineConfidence(studentName, { justifiedHours, unjustifiedHours }, "absences"),
          };
        });
      return { rows, rawText: content };
    }

    const rows = parsed
      .filter((r: any) =>
        r && typeof r === "object" &&
        typeof r.studentName === "string" &&
        String(r.studentName).trim().length > 0 &&
        Number.isFinite(Number(r.grade)) &&
        Number(r.grade) >= 0 &&
        Number(r.grade) <= 20,
      )
      .map((r: any) => ({
        studentName: String(r.studentName).trim(),
        grade: Number(r.grade),
        confidence: estimateLineConfidence(String(r.studentName).trim(), Number(r.grade), "grades"),
      }));
    return { rows, rawText: content };
  } catch (err) {
    logger.warn({ err, type }, "Failed to parse Vision OCR JSON");
    return { rows: [], rawText: content };
  }
}

// ── Tesseract.js (fallback — grades/absences only, no daily_attendance support) ─

function parseGradeLine(line: string): OcrGradeRow | null {
  const trimmed = line.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 3) return null;

  const candidates = [...trimmed.matchAll(/(?<!\d)(\d{1,2}(?:[.,]\d{1,2})?)(?!\d)/g)]
    .map(match => ({ value: parseFloat(match[1]!.replace(",", ".")), index: match.index!, length: match[0].length }))
    .filter(candidate => Number.isFinite(candidate.value) && candidate.value >= 0 && candidate.value <= 20);
  const gradeMatch = candidates.at(-1);
  if (!gradeMatch) return null;

  const grade = gradeMatch.value;

  const name = `${trimmed.slice(0, gradeMatch.index)} ${trimmed.slice(gradeMatch.index + gradeMatch.length)}`
    .replace(/^\s*\d+\s*/, "").replace(/\s*\d+\s*$/, "").trim();
  if (!name || name.length < 2) return null;

  return { studentName: name, grade, confidence: estimateLineConfidence(name, grade, "grades") };
}

function parseAbsenceLine(line: string): OcrAbsenceRow | null {
  const trimmed = line.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 3) return null;

  const numbers = [...trimmed.matchAll(/(\d{1,3})/g)].map(m => parseInt(m[1]!, 10));
  if (numbers.length === 0) return null;

  const namePart = trimmed.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (!namePart || namePart.length < 2) return null;

  const values = numbers.length > 2 ? numbers.slice(-2) : numbers;
  if (values.length >= 2) {
    const justified = values[0]!;
    const unjustified = values[1]!;
    return {
      studentName: namePart,
      justifiedHours: justified,
      unjustifiedHours: unjustified,
      confidence: estimateLineConfidence(namePart, { justifiedHours: justified, unjustifiedHours: unjustified }, "absences"),
    };
  }

  const uncovered = numbers[0]!;
  return {
    studentName: namePart,
    justifiedHours: 0,
    unjustifiedHours: uncovered,
    confidence: estimateLineConfidence(namePart, { justifiedHours: 0, unjustifiedHours: uncovered }, "absences"),
  };
}

async function extractWithTesseract(
  buffer: Buffer,
  type: OcrType,
): Promise<{ rows: Array<OcrGradeRow | OcrAbsenceRow>; rawText: string }> {
  if (type === "daily_attendance" || type === "daily_register") {
    logger.warn({ type }, "Tesseract fallback does not support daily attendance OCR — returning empty result");
    return { rows: [], rawText: "" };
  }

  logger.info("OCR: running Tesseract.js (ara+fra)");

  try {
    const { data } = await Tesseract.recognize(buffer, "ara+fra", {
      logger: m => {
        if (m.status === "recognizing text") {
          logger.debug({ progress: Math.round(m.progress * 100) }, "Tesseract progress");
        }
      },
    });

    const rawText = data.text ?? "";
    if (!rawText || rawText.trim().length === 0) {
      logger.warn("Tesseract returned empty text");
      return { rows: [], rawText };
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows: Array<OcrGradeRow | OcrAbsenceRow> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      if (/^(اسم|الاسم|اللقب|رقم|#|total|مجموع|nombre|note)/i.test(line)) continue;
      const parsed = type === "absences" ? parseAbsenceLine(line) : parseGradeLine(line);
      if (parsed) {
        const key = type === "grades"
          ? `${parsed.studentName}:${(parsed as OcrGradeRow).grade}`
          : `${parsed.studentName}:${(parsed as OcrAbsenceRow).justifiedHours}:${(parsed as OcrAbsenceRow).unjustifiedHours}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push(parsed);
        }
      }
    }

    logger.info({ rowCount: rows.length }, "Tesseract extraction complete");
    return { rows, rawText };
  } catch (err) {
    logger.error({ err }, "Tesseract recognition failed");
    return { rows: [], rawText: "" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────────

/**
 * Resolves which engine to actually use, given what the user/request asked for
 * and which API keys are actually available.
 *
 * Priority when "auto": Gemini > Groq > Tesseract (Gemini tends to read
 * handwritten Arabic tables more reliably, so it's preferred when available).
 */
export function resolveEngine(requested: OcrEngine, apiKeys: ApiKeys): OcrEngine {
  const hasGemini = Boolean(apiKeys.geminiApiKey);
  const hasGroq = Boolean(apiKeys.groqApiKey);

  if (requested === "auto") {
    if (hasGemini) return "gemini";
    if (hasGroq) return "vision";
    return "tesseract";
  }
  if (requested === "gemini" && !hasGemini) {
    return hasGroq ? "vision" : "tesseract";
  }
  if (requested === "vision" && !hasGroq) {
    return hasGemini ? "gemini" : "tesseract";
  }
  return requested;
}

export async function processOcr(
  buffer: Buffer,
  type: OcrType,
  engine: OcrEngine = "auto",
  apiKeys: ApiKeys = {},
): Promise<OcrResult> {
  const resolved = resolveEngine(engine, apiKeys);
  const { data, mimeType } = await prepareImage(buffer);

  let rows: Array<OcrGradeRow | OcrAbsenceRow | OcrDailyAttendanceRow | OcrDailyRegisterRow> = [];
  let rawText = "";
  let dayColumns: string[] | undefined;
  let reportDate: string | undefined;
  let usedEngine = resolved;

  const isVisionEngine = resolved === "gemini" || resolved === "vision";

  if (isVisionEngine) {
    // Vision-to-vision fallback: if the primary engine fails (network error,
    // transient overload like 503, etc.) or returns nothing, retry with the
    // other vision engine before giving up. This does NOT fall back to
    // Tesseract — both engines here are full Vision models, so the user
    // still gets a real, trustworthy extraction rather than garbled text.
    let primaryError: Error | null = null;

    try {
      const result = await extractWithVision(resolved, data, mimeType, type, apiKeys);
      rows = result.rows;
      rawText = result.rawText;
      dayColumns = result.dayColumns;
      reportDate = result.reportDate;
    } catch (err) {
      primaryError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ err: primaryError.message, engine: resolved }, "Primary vision engine failed — will try secondary engine if available");
    }

    if (rows.length === 0 || primaryError) {
      const otherEngine = resolved === "gemini" ? "vision" : "gemini";
      const otherKeyAvailable = otherEngine === "gemini" ? Boolean(apiKeys.geminiApiKey) : Boolean(apiKeys.groqApiKey);

      if (otherKeyAvailable) {
        logger.warn({ type, from: resolved, to: otherEngine }, "Trying secondary vision engine");
        try {
          const secondTry = await extractWithVision(otherEngine, data, mimeType, type, apiKeys);
          if (secondTry.rows.length > 0) {
            rows = secondTry.rows;
            rawText = secondTry.rawText || rawText;
            dayColumns = secondTry.dayColumns ?? dayColumns;
            reportDate = secondTry.reportDate ?? reportDate;
            usedEngine = otherEngine;
            primaryError = null; // secondary succeeded — the earlier failure no longer matters
          } else {
            rawText = secondTry.rawText || rawText;
            // Secondary ran but found nothing too. If the primary had thrown
            // a real error, that's still the more useful message to surface.
          }
        } catch (secondErr) {
          const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
          logger.warn({ err: secondMsg, engine: otherEngine }, "Secondary vision engine also failed");
          if (primaryError) {
            if (isOcrRateLimitError(primaryError) || isOcrRateLimitError(new Error(secondMsg))) {
              throw new Error(OCR_QUOTA_ERROR);
            }
            throw new Error(
              `فشل المحرك الأساسي (${resolved === "gemini" ? "Gemini" : "Groq"}): ${primaryError.message} — وفشل المحرك البديل (${otherEngine === "gemini" ? "Gemini" : "Groq"}) أيضًا: ${secondMsg}`
            );
          }
        }
      } else if (primaryError) {
        // No second key configured — nothing left to try, surface the real error.
        throw isOcrRateLimitError(primaryError) ? new Error(OCR_QUOTA_ERROR) : primaryError;
      }
    }
  } else if (resolved === "tesseract") {
    // Tesseract only runs when explicitly requested via engine=tesseract.
    const result = await extractWithTesseract(
      (await prepareImage(buffer)).tesseractBuffer,
      type,
    );
    rows = result.rows;
    rawText = result.rawText;
  }

  const confidences = rows.map(r => r.confidence);
  const overallConfidence = confidences.length
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 0;

  return {
    engine: usedEngine,
    type,
    rows,
    dayColumns,
    reportDate,
    rawText,
    overallConfidence,
  };
}

