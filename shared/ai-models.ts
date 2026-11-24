/**
 * Gemini models available for OCR (photo → structured data).
 * Shared between the server (model resolution) and the settings UI (selector).
 */
export interface GeminiModelOption {
  id: string;
  label: string;
  hint: string;
}

export const GEMINI_OCR_MODELS: GeminiModelOption[] = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "الأدق — للجداول الكثيفة والصور الضعيفة" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "توازن ممتاز بين الدقة والسرعة والتكلفة" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", hint: "أسرع وأرخص — دقة جيدة" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", hint: "النموذج القديم — احتياطي" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "الأحدث — إن كان متاحاً في حسابك" },
];

export const DEFAULT_GEMINI_OCR_MODEL = "gemini-2.5-flash";

export const GEMINI_OCR_MODEL_IDS = new Set(GEMINI_OCR_MODELS.map(m => m.id));

export function isGeminiOcrModel(id: string): boolean {
  return GEMINI_OCR_MODEL_IDS.has(id);
}
