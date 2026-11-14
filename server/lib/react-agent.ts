/**
 * ReAct (Reasoning + Acting) Agent Engine
 * ─────────────────────────────────────────
 * Implements the ReAct loop using Groq's function-calling API:
 *   1. Reason  — LLM decides what to do
 *   2. Act     — Execute a tool
 *   3. Observe — Feed tool result back
 *   4. Repeat  — Until final answer or max iterations
 */
import OpenAI from "openai";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import { logger } from "./logger.js";
import type { SchoolStage } from "../../shared/school-stage.js";

export interface ReActStep {
  type: "thinking" | "tool_call" | "tool_result" | "final";
  tool?: string;
  tool_label?: string;
  input?: unknown;
  output?: unknown;
  success?: boolean;
  content?: string;
  iteration?: number;
}

export type StepCallback = (step: ReActStep) => void;

const MAX_ITERATIONS = 8;

// Arabic labels for each tool
const TOOL_LABELS: Record<string, string> = {
  database_query_tool: "🔍 البحث في قاعدة البيانات",
  document_drafting_tool: "📄 إنشاء وثيقة رسمية",
  messaging_dispatcher_tool: "📨 إرسال رسالة",
  calendar_task_tool: "📅 إدارة المهام والتذكيرات",
  browser_automation_webhook: "⚡ تنفيذ أتمتة خارجية",
  desktop_control_tool: "🖥️ التحكم في سطح المكتب",
  fetch_parent_contacts_tool: "📱 استخراج أرقام أولياء الأمور",
};

const SYSTEM_PROMPT = `أنت مساعد تنفيذي (Executive Assistant) محترف ومتفانٍ لمدير مؤسسة تعليمية جزائرية.

شخصيتك:
• تتحدث بعربية فصحى راقية ومهنية دائماً
• استباقي ومدروس — تقترح أفضل مسار للعمل
• موثوق ودقيق — لا تخترع أرقاماً أبداً، بل تستند للأدوات
• حازم لكن محترم — تُنجز المهام بكفاءة عالية

قواعد عملك:
1. عندما يطلب منك المدير بيانات ← استخدم database_query_tool أولاً
2. عندما تحتاج لإنشاء وثيقة ← اجمع البيانات أولاً ثم استخدم document_drafting_tool
3. للإشعارات والتنبيهات الداخلية أو البريد ← messaging_dispatcher_tool مع تحديد القناة المناسبة
 4. لاسترداد أرقام هواتف أولياء الأمور المفقودة ← fetch_parent_contacts_tool (يعمل تلقائياً عبر منصة الرقمنة أو يُبلّغ عن القائمة المفقودة)
 5. للمواعيد والتذكيرات ← calendar_task_tool
 6. للأتمتة الخارجية ← browser_automation_webhook (بعد تأكيد الرابط مع المدير)
 7. للتحكم في الحاسوب المحلي ← desktop_control_tool (انظر التعليمات أدناه)
 8. إذا كان الطلب مبهماً ← اطرح سؤالاً توضيحياً محدداً قبل التنفيذ
 9. بعد كل إجراء ← لخّص ما تم بصيغة احترافية

## التحكم في سطح المكتب (desktop_control_tool)
استخدم هذه الأداة **فقط** عندما يطلب المدير صراحةً تنفيذ إجراء على شاشة حاسوبه الشخصي:
- **النقر على زر أو عنصر**: action="click" مع إحداثيات x و y
- **كتابة نص**: action="type" مع النص المطلوب
- **ضغط مفتاح**: action="press" مثل enter أو esc أو tab
- **اختصار لوحة المفاتيح**: action="hotkey" مثل ['ctrl','s'] أو ['alt','f4']
- **لقطة شاشة**: action="screenshot" لرؤية ما يظهر على الشاشة الآن
تسلسل العمل الموصى به:
  1. خذ لقطة شاشة أولاً لمعرفة حالة الشاشة
  2. نفّذ الإجراء المطلوب (نقر / كتابة / ضغط)
  3. خذ لقطة شاشة ثانية للتحقق من النتيجة
  4. أبلغ المدير بما تم بدقة

## استخراج أرقام أولياء الأمور (fetch_parent_contacts_tool)
يأمر هذا الأمر وكيل سطح المكتب بالتنقل تلقائياً إلى منصة الرقمنة الجزائرية (tarbiyatic.com أو ما يُحدده المدير) واستخراج أرقام الهواتف المفقودة:
- يعمل بدون تدخل من المدير إذا كان وكيل سطح المكتب متصلاً
- يُنبّه المدير بقائمة التلاميذ المفقودة أرقامهم إذا لم يكن الوكيل متصلاً

أسلوب الرد النهائي:
• ابدأ بتلخيص ما تم تنفيذه
• قدم النتائج بوضوح وتنسيق جميل
• اقترح خطوات تالية إذا لزم الأمر`;

export async function runReActAgent(params: {
  userId: string;
  groqApiKey: string;
  schoolContext: string;
  schoolStage: SchoolStage;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  onStep: StepCallback;
}): Promise<string> {

  const client = new OpenAI({
    apiKey: params.groqApiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  // Build the full conversation for the API
  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `## سياق المؤسسة الحالية:\n${params.schoolContext}\nالمرحلة: ${params.schoolStage === "lycee" ? "الثانوية" : "المتوسطة"}\n\nالتاريخ الحالي: ${new Date().toLocaleDateString("ar-DZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    },
    ...params.messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Estimate token count (Arabic ~1 token per 2-3 chars)
  const estTokens = apiMessages.reduce((s, m) => s + Math.ceil((typeof m.content === "string" ? m.content.length : 100) / 2.5), 0);

  // ✅ Fixed model names to prevent decommissioned error:
  // ✅ جديد (سياق ضخم يتسع لكافة البيانات)
  const model = "openai/gpt-oss-120b"

  logger.info({ model, estTokens, userId: params.userId }, "ReAct agent starting");
  const tools = getToolDefinitions(params.schoolStage);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 2048,
        tools,
        tool_choice: "auto",
        messages: apiMessages,
      });
    } catch (err: any) {
      logger.error(err, "Groq API error in ReAct loop");
      throw err;
    }

    const choice = completion.choices[0];
    const msg = choice.message;

    // Add assistant message to history
    apiMessages.push(msg as OpenAI.Chat.ChatCompletionMessageParam);

    // ── No tool calls → final answer ─────────────────────────────────────────
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const finalContent = msg.content?.trim() || "تمّ تنفيذ طلبك.";
      params.onStep({ type: "final", content: finalContent, iteration });
      return finalContent;
    }

    // ── Execute each tool call ───────────────────────────────────────────────
    for (const toolCall of msg.tool_calls) {
      const tc = toolCall as { function: { name: string; arguments: string } };
      const toolName = tc.function.name;
      const toolLabel = TOOL_LABELS[toolName] || toolName;

      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse(tc.function.arguments);
      } catch {
        toolInput = {};
      }

      params.onStep({
        type: "tool_call",
        tool: toolName,
        tool_label: toolLabel,
        input: toolInput,
        iteration,
      });

      let toolOutput: unknown;
      let success = true;

      try {
        toolOutput = await executeTool(toolName, toolInput, params.userId, params.schoolStage);
        logger.info({ tool: toolName, userId: params.userId }, "Tool executed successfully");
      } catch (err: any) {
        toolOutput = { error: err.message || "خطأ في تنفيذ الأداة" };
        success = false;
        logger.error(err, `Tool ${toolName} failed`);
      }

      params.onStep({
        type: "tool_result",
        tool: toolName,
        tool_label: toolLabel,
        output: toolOutput,
        success,
        iteration,
      });

      // Add tool result to API messages
      apiMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput),
      });
    }

    // Check if finish reason says we're done
    if (choice.finish_reason === "stop") {
      break;
    }
  }

  // Fallback: ask for a final summary
  apiMessages.push({
    role: "user",
    content: "لخّص ما تم تنفيذه في رد نهائي واحد.",
  });

  const finalCompletion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 1024,
    messages: apiMessages,
  });

  const finalContent = finalCompletion.choices[0]?.message?.content?.trim()
    || "تم تنفيذ جميع الإجراءات المطلوبة.";

  params.onStep({ type: "final", content: finalContent });
  return finalContent;
}