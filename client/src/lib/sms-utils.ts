/**
 * SMS Utilities
 * 
 * Helpers for:
 *   - Calculating SMS credits needed
 *   - Rendering message templates
 *   - Validating phone numbers
 */

const ARABIC_SEGMENT_SIZE = 70;
const ARABIC_MULTI_SEGMENT_SIZE = 67;
const ENGLISH_SEGMENT_SIZE = 160;

/**
 * Calculate how many SMS credits a message will consume
 * 
 * Arabic/Unicode:
 *   - First segment: 70 characters
 *   - Additional segments: 67 characters (UDH overhead)
 *   - Each segment = 1 credit
 * 
 * English/GSM:
 *   - First segment: 160 characters
 *   - Additional segments: 153 characters
 *   - Each segment = 1 credit
 */
export function calculateSmsCredits(message: string): number {
  const len = message.length;
  const isArabic = /[\u0600-\u06FF]/.test(message);

  if (!isArabic) {
    // English/GSM
    if (len <= ENGLISH_SEGMENT_SIZE) return 1;
    return 1 + Math.ceil((len - ENGLISH_SEGMENT_SIZE) / 153);
  }

  // Arabic/Unicode
  if (len <= ARABIC_SEGMENT_SIZE) return 1;
  return 1 + Math.ceil((len - ARABIC_SEGMENT_SIZE) / ARABIC_MULTI_SEGMENT_SIZE);
}

/**
 * Estimate how many segments (visual feedback)
 */
export function estimateSegments(message: string): number {
  return calculateSmsCredits(message);
}

/**
 * Render message template with variables
 * 
 * Example:
 *   template: "الطالب {student_name} غائب في {date}"
 *   variables: { student_name: "أحمد", date: "15/12/2024" }
 *   result: "الطالب أحمد غائب في 15/12/2024"
 */
export function renderTemplate(template: string, variables: Record<string, string> = {}): string {
  let message = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, "g");
    message = message.replace(regex, value);
  }
  return message;
}

/**
 * Common template placeholders with descriptions
 */
export const TEMPLATE_PLACEHOLDERS = [
  { key: "student_name", description: "اسم الطالب" },
  { key: "student_id", description: "رقم الطالب" },
  { key: "classe", description: "الفصل" },
  { key: "date", description: "التاريخ" },
  { key: "subject", description: "المادة" },
  { key: "grade", description: "الدرجة" },
  { key: "absence_hours", description: "ساعات الغياب" },
  { key: "parent_name", description: "اسم الولي" },
];

/**
 * Common SMS templates for different use cases
 */
export const SMS_TEMPLATES = {
  absence_alert: "الطالب/ة {student_name} من {classe} غائب عن الدوام في {date}",
  grade_alert: "الطالب/ة {student_name} حصل على {grade} في {subject}",
  borderline: "الطالب/ة {student_name} متقارب في المتوسط الموسمي",
  absence_high: "الطالب/ة {student_name} من {classe} لديه {absence_hours} ساعات غياب",
  summons: "الطالب/ة {student_name} مستدعى لمكتب الإدارة",
  congratulations: "تهانينا! الطالب/ة {student_name} تفوق في أدائه الدراسي",
};

/**
 * Validate phone number format
 * Accepts various formats: +213XXXXXXXXX, 0XXXXXXXXX, 213XXXXXXXXX
 */
export function validatePhoneNumber(phone: string): { valid: boolean; normalized?: string } {
  const cleaned = phone.replace(/\s+/g, "");

  // Check if it matches common formats
  if (/^(\+213|213|0)[567]\d{8}$/.test(cleaned)) {
    // Normalize to international format without +
    let normalized = cleaned;
    if (normalized.startsWith("+")) normalized = normalized.substring(1);
    if (normalized.startsWith("0")) normalized = "213" + normalized.substring(1);
    return { valid: true, normalized };
  }

  return { valid: false };
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 9 && cleaned.startsWith("5")) {
    return `213 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("213")) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}`;
  }
  return phone;
}

/**
 * Get SMS delivery status icon and color
 */
export function getSmsStatusInfo(status: "sent" | "failed" | "queued" | "no_phone") {
  const statusMap = {
    sent: { label: "مرسلة", color: "text-green-600", bg: "bg-green-50" },
    queued: { label: "قيد الانتظار", color: "text-yellow-600", bg: "bg-yellow-50" },
    failed: { label: "فشلت", color: "text-red-600", bg: "bg-red-50" },
    no_phone: { label: "بدون رقم", color: "text-gray-600", bg: "bg-gray-50" },
  };
  return statusMap[status] || statusMap.queued;
}
