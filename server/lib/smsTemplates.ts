/**
 * SMS Template placeholders and rendering
 *
 * Supported placeholders:
 *   {student_name}  — full student name
 *   {absence_date}  — date of absence (YYYY-MM-DD)
 *   {grade}         — grade value
 *   {class}         — class name
 *   {school_name}   — school name
 *   {niveau}        — academic level (1AM–3AS)
 *   {parent_name}   — parent/guardian name (optional)
 */

export interface TemplateVars {
  student_name?: string;
  absence_date?: string;
  grade?: string | number;
  class?: string;
  school_name?: string;
  niveau?: string;
  parent_name?: string;
  [key: string]: string | number | undefined;
}

export const SMS_TEMPLATES = {
  absence_alert: {
    id: "absence_alert",
    label: { ar: "تنبيه غياب", fr: "Alerte absence", en: "Absence alert" },
    body: "السيد/السيدة ولي أمر {student_name}: نُبلّغكم بغياب ابنكم/ابنتكم بتاريخ {absence_date}. يرجى التواصل مع إدارة {school_name}.",
  },
  grade_update: {
    id: "grade_update",
    label: { ar: "تحديث درجة", fr: "Mise à jour note", en: "Grade update" },
    body: "السيد/السيدة ولي أمر {student_name}: تم تسجيل درجة {grade}/20 في {class}. — {school_name}",
  },
  official_summons: {
    id: "official_summons",
    label: { ar: "استدعاء رسمي", fr: "Convocation", en: "Official summons" },
    body: "السيد/السيدة ولي أمر {student_name}: يُطلب منكم الحضور إلى {school_name} بخصوص {class}. يرجى التواصل مع الإدارة.",
  },
  congratulations: {
    id: "congratulations",
    label: { ar: "تهنئة بالنجاح", fr: "Félicitations", en: "Congratulations" },
    body: "السيد/السيدة ولي أمر {student_name}: يسرّنا إعلامكم بأن ابنكم/ابنتكم حقق معدّلاً {grade}/20. — {school_name}",
  },
} as const;

export type SmsTemplateId = keyof typeof SMS_TEMPLATES;

/** Replace {placeholder} tokens in a template string */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : `{${key}}`;
  });
}

/** List all available templates for the UI */
export function listTemplates() {
  return Object.values(SMS_TEMPLATES).map(t => ({
    id: t.id,
    label: t.label,
    body: t.body,
    placeholders: [...t.body.matchAll(/\{(\w+)\}/g)].map(m => m[1]),
  }));
}
