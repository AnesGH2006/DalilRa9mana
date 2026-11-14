/**
 * Tool registry — definitions (for Groq function-calling) + dispatcher.
 */
import type OpenAI from "openai";
import { databaseQueryTool } from "./database-query.js";
import { documentDraftingTool } from "./document-drafting.js";
import { messagingDispatcherTool } from "./messaging.js";
import { calendarTaskTool } from "./calendar.js";
import { browserAutomationWebhook } from "./webhook.js";
import { desktopControlTool } from "./desktop-control.js";
import { fetchParentContactsTool } from "./fetch-parent-contacts.js";
import { SCHOOL_STAGE_LEVELS, type SchoolStage } from "../../../shared/school-stage.js";

export type ToolName =
  | "database_query_tool"
  | "document_drafting_tool"
  | "messaging_dispatcher_tool"
  | "calendar_task_tool"
  | "browser_automation_webhook"
  | "desktop_control_tool"
  | "fetch_parent_contacts_tool";

// ── OpenAI-compatible tool definitions (sent to Groq) ────────────────────────
export function getToolDefinitions(stage: SchoolStage): OpenAI.Chat.ChatCompletionTool[] {
  const schoolLevels = SCHOOL_STAGE_LEVELS[stage];
  const schoolTypeLabel = stage === "lycee" ? "الثانوية" : "المتوسطة";
  return [
  {
    type: "function",
    function: {
      name: "database_query_tool",
      description: "يبحث في سجلات التلاميذ، النتائج، الغيابات، والإحصائيات. استخدمه للحصول على بيانات حقيقية من قاعدة البيانات.",
      parameters: {
        type: "object",
        properties: {
          query_type: {
            type: "string",
            enum: ["students", "grades", "absences", "stats", "student_detail", "failing_students", "top_students", "absent_students"],
            description: "نوع الاستعلام: students=قائمة التلاميذ، stats=إحصائيات عامة، failing_students=الراسبون، top_students=المتفوقون، absent_students=الغائبون، student_detail=تفاصيل تلميذ معين",
          },
          filters: {
            type: "object",
            properties: {
              niveau: { type: "string", enum: [...schoolLevels], description: "المستوى الدراسي" },
              classe: { type: "string", description: "القسم مثل: أ، ب، 1" },
              annee: { type: "string", description: "السنة الدراسية مثل: 2026-2027" },
              name_search: { type: "string", description: "البحث عن تلميذ بالاسم" },
              resultat: { type: "string", enum: ["admis", "non_admis", "mustarrak"] },
              statut: { type: "string", enum: ["nouveau", "redoublant"] },
              min_absences: { type: "number", description: "الحد الأدنى من ساعات الغياب" },
              limit: { type: "number", description: "الحد الأقصى للنتائج (افتراضي 50)" },
            },
          },
        },
        required: ["query_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "document_drafting_tool",
      description: "ينشئ وثائق Word (.docx) رسمية: مراسلات إدارية، تقارير، إشعارات، محاضر اجتماعات، شهادات. يعيد رابط تحميل الوثيقة.",
      parameters: {
        type: "object",
        properties: {
          document_type: {
            type: "string",
            enum: ["letter", "report", "notice", "warning", "meeting_report", "certificate", "summary"],
            description: "نوع الوثيقة",
          },
          title: { type: "string", description: "عنوان الوثيقة" },
          body: { type: "string", description: "محتوى الوثيقة كاملاً (يمكن استخدام سطور جديدة)" },
          recipient: { type: "string", description: "المرسَل إليه (اسم أو منصب)" },
          sender: { type: "string", description: `الجهة المُرسِلة، افتراضياً: مدير ${schoolTypeLabel}` },
          date: { type: "string", description: "تاريخ الوثيقة" },
          school_name: { type: "string", description: `اسم ${schoolTypeLabel}` },
          reference_number: { type: "string", description: "رقم المرجع الإداري" },
          footer_note: { type: "string", description: "ملاحظة في نهاية الوثيقة" },
        },
        required: ["document_type", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "messaging_dispatcher_tool",
      description: "يرسل تنبيهات ورسائل عبر البريد الإلكتروني، واتساب، أو إشعارات داخلية في لوحة التحكم.",
      parameters: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            enum: ["email", "whatsapp", "dashboard", "all"],
            description: "قناة الإرسال",
          },
          recipient: { type: "string", description: "عنوان البريد أو رقم الهاتف" },
          subject: { type: "string", description: "موضوع الرسالة" },
          message: { type: "string", description: "محتوى الرسالة" },
          priority: { type: "string", enum: ["low", "normal", "urgent"], description: "أولوية الرسالة" },
        },
        required: ["channel", "subject", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_task_tool",
      description: "ينشئ تذكيرات ومهام، يعرضها، ويتتبع المواعيد والاجتماعات للمدير.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "list", "complete", "dismiss", "upcoming"],
            description: "create=إنشاء تذكير، list=عرض المهام، complete=إنجاز مهمة، dismiss=إلغاء، upcoming=المهام القادمة",
          },
          title: { type: "string", description: "عنوان المهمة أو التذكير" },
          description: { type: "string", description: "تفاصيل إضافية" },
          due_date: { type: "string", description: "تاريخ الاستحقاق بصيغة YYYY-MM-DD" },
          due_time: { type: "string", description: "وقت الاستحقاق بصيغة HH:MM" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          category: { type: "string", description: "التصنيف مثل: اجتماع، تقرير، غياب، امتحان" },
          task_id: { type: "string", description: "معرّف المهمة (للإنجاز أو الإلغاء)" },
          days_ahead: { type: "number", description: "عدد الأيام القادمة للبحث (للإجراء upcoming)" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_automation_webhook",
      description: "يُشغّل webhooks خارجية (n8n، Make، Zapier) لتنفيذ مهام خارج المنصة: نشر على وسائل التواصل، إرسال SMS، أتمتة إدارية.",
      parameters: {
        type: "object",
        properties: {
          webhook_url: { type: "string", description: "رابط الـ webhook (يجب أن يبدأ بـ https://)" },
          method: { type: "string", enum: ["GET", "POST", "PUT"], description: "طريقة HTTP (افتراضي: POST)" },
          payload: { type: "object", description: "البيانات المرسلة مع الطلب" },
          description: { type: "string", description: "وصف للأتمتة المُنفَّذة" },
        },
        required: ["webhook_url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "desktop_control_tool",
      description: "يتحكم في جهاز الحاسوب المحلي الخاص بالمدير عبر وكيل سطح المكتب المتصل. استخدمه للنقر على أزرار الشاشة، كتابة نص، الضغط على مفاتيح النظام، أو أخذ لقطة شاشة. يتطلب أن يكون وكيل سطح المكتب (Python/Electron) متصلاً.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["click", "type", "press", "hotkey", "screenshot"],
            description: "click=نقر بالماوس على إحداثيات، type=كتابة نص، press=ضغط مفتاح، hotkey=اختصار لوحة مفاتيح، screenshot=لقطة شاشة",
          },
          x: { type: "number", description: "الإحداثية الأفقية للنقر (مطلوب لـ click)" },
          y: { type: "number", description: "الإحداثية الرأسية للنقر (مطلوب لـ click)" },
          text: { type: "string", description: "النص المراد كتابته (مطلوب لـ type)" },
          key: { type: "string", description: "المفتاح المراد ضغطه مثل: enter, esc, tab, f5 (مطلوب لـ press)" },
          keys: {
            type: "array",
            items: { type: "string" },
            description: "مصفوفة مفاتيح الاختصار مثل: ['ctrl', 'c'] أو ['alt', 'f4'] (مطلوب لـ hotkey)",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_parent_contacts_tool",
      description: "يأمر وكيل سطح المكتب بالتنقل إلى منصة الرقمنة الجزائرية تلقائياً لاستخراج أرقام هواتف أولياء الأمور المفقودة وحفظها في قاعدة البيانات. إذا لم يكن الوكيل متصلاً، يُبلّغ عن قائمة التلاميذ الذين تنقصهم بيانات الاتصال.",
      parameters: {
        type: "object",
        properties: {
          niveau: { type: "string", enum: [...schoolLevels], description: "تصفية حسب المستوى (اختياري)" },
          classe: { type: "string", description: "تصفية حسب القسم مثل: A، B (اختياري)" },
          annee: { type: "string", description: "السنة الدراسية (افتراضي: 2026-2027)" },
          platform_url: { type: "string", description: "رابط منصة الرقمنة إذا كان مختلفاً عن الافتراضي" },
        },
        required: [],
      },
    },
  },
  ];
}

// ── Tool executor ─────────────────────────────────────────────────────────────
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  stage: SchoolStage,
): Promise<unknown> {
  switch (name as ToolName) {
    case "database_query_tool":
      return databaseQueryTool(input as any, userId, stage);
    case "document_drafting_tool":
      return documentDraftingTool(input as any, userId, stage);
    case "messaging_dispatcher_tool":
      return messagingDispatcherTool(input as any, userId, stage);
    case "calendar_task_tool":
      return calendarTaskTool(input as any, userId);
    case "browser_automation_webhook":
      return browserAutomationWebhook(input as any, userId);
    case "desktop_control_tool":
      return desktopControlTool(input as any, userId);
    case "fetch_parent_contacts_tool":
      return fetchParentContactsTool(input as any, userId, stage);
    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}
