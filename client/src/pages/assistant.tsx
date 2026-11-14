import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Bot, Send, User, Sparkles, AlertCircle, Database, FileText,
  Mail, Calendar, Zap, ChevronDown, ChevronRight, Download,
  CheckCircle2, XCircle, Loader2, Cpu,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.2 } },
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface ReActStep {
  type: "thinking" | "tool_call" | "tool_result" | "final";
  tool?: string;
  tool_label?: string;
  input?: unknown;
  output?: unknown;
  success?: boolean;
  content?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ReActStep[];
  isStreaming?: boolean;
}

// ── Tool metadata ──────────────────────────────────────────────────────────────
type ToolCfg = { icon: React.ElementType; color: string; bg: string; label: string };
const TOOL_CONFIG: Record<string, ToolCfg> = {
  database_query_tool:        { icon: Database, color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/25",       label: "البحث في البيانات"    },
  document_drafting_tool:     { icon: FileText, color: "text-violet-400",  bg: "bg-violet-500/15 border-violet-500/25",   label: "إنشاء وثيقة رسمية"   },
  messaging_dispatcher_tool:  { icon: Mail,     color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", label: "إرسال رسالة"         },
  calendar_task_tool:         { icon: Calendar, color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",     label: "إدارة المواعيد"      },
  browser_automation_webhook: { icon: Zap,      color: "text-fuchsia-400", bg: "bg-fuchsia-500/15 border-fuchsia-500/25", label: "أتمتة خارجية"        },
};

const SUGGESTIONS = [
  "من هم أكثر 10 تلاميذ غياباً؟",
  "اكتب مراسلة رسمية لأولياء الراسبين في 3AM",
  "أنشئ تذكيراً باجتماع مجلس الأقسام غداً الساعة 10:00",
  "أرسل إشعاراً داخلياً: اجتماع عاجل للأساتذة",
  "من هم الراسبون القريبون من النجاح؟",
  "أنشئ تقريراً إحصائياً شاملاً لنتائج المؤسسة",
];

// ── Tool step card ─────────────────────────────────────────────────────────────
function ToolStepCard({ step }: { step: ReActStep }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TOOL_CONFIG[step.tool ?? ""] ?? { icon: Cpu, color: "text-slate-400", bg: "bg-slate-500/15 border-slate-500/25", label: step.tool ?? "" };
  const Icon = cfg.icon;
  const label = step.tool_label ?? cfg.label;

  if (step.type === "tool_call") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border px-3 py-2 text-xs ${cfg.bg} cursor-pointer select-none`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className={`inline-flex w-5 h-5 rounded-md items-center justify-center shrink-0 ${cfg.bg} border ${cfg.color}`}>
            <Icon className="w-3 h-3" />
          </span>
          <span className={`font-semibold ${cfg.color} truncate`}>{label}</span>
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ms-auto shrink-0" />
          {expanded
            ? <ChevronDown  className="w-3 h-3 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
        </div>
        <AnimatePresence>
          {expanded && step.input != null && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="mt-2 text-[10px] bg-black/20 rounded-lg p-2 overflow-x-auto text-muted-foreground max-h-40"
            >
              {JSON.stringify(step.input, null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (step.type === "tool_result") {
    const out = step.output as Record<string, unknown> | undefined;
    const downloadUrl = out?.download_url as string | undefined;
    const message     = out?.message as string | undefined;
    const count       = out?.count as number | undefined;

    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border px-3 py-2 text-xs ${cfg.bg} cursor-pointer select-none`}
        onClick={() => !downloadUrl && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          {step.success
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            : <XCircle      className="w-3.5 h-3.5 text-red-400    shrink-0" />}
          <span className={`font-semibold truncate ${step.success ? cfg.color : "text-red-400"}`}>
            {label}
          </span>

          {/* Download button for documents */}
          {downloadUrl && (
            <a
              href={`${BASE}${downloadUrl.replace(/^\//, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="ms-auto flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-500/25 text-violet-300 hover:bg-violet-500/40 transition-colors whitespace-nowrap"
            >
              <Download className="w-3 h-3" />
              <span>تحميل</span>
            </a>
          )}

          {!downloadUrl && (
            expanded
              ? <ChevronDown  className="w-3 h-3 text-muted-foreground ms-auto shrink-0" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground ms-auto shrink-0" />
          )}
        </div>

        {/* Quick summary line */}
        {message && <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{message}</p>}
        {count !== undefined && !message && (
          <p className="mt-1 text-[11px] text-muted-foreground">عدد النتائج: {count}</p>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="mt-2 text-[10px] bg-black/20 rounded-lg p-2 overflow-x-auto text-muted-foreground max-h-44"
            >
              {JSON.stringify(step.output, null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return null;
}

// ── Message component ─────────────────────────────────────────────────────────
function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const toolSteps = (msg.steps ?? []).filter(s => s.type === "tool_call" || s.type === "tool_result");

  return (
    <div className="flex items-start gap-2.5 justify-start">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        {msg.isStreaming && !msg.content
          ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
          : <Bot     className="w-3.5 h-3.5 text-white" />}
      </div>

      <div className="max-w-[80%] flex flex-col gap-1.5">
        {/* Tool step cards */}
        {toolSteps.length > 0 && (
          <div className="space-y-1.5 w-full">
            {toolSteps.map((step, i) => <ToolStepCard key={i} step={step} />)}
          </div>
        )}

        {/* Text bubble */}
        {(msg.content || msg.isStreaming) && (
          <div className="rounded-2xl rounded-ss-sm bg-card border shadow-sm px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed text-foreground">
            {msg.content || (
              <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                {toolSteps.length > 0
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> جارٍ صياغة الرد...</>
                  : <>
                      {[0, 1, 2].map(j => (
                        <motion.span key={j} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: j * 0.2 }} />
                      ))}
                    </>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);

    const userMsg: ChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMsg];
    const assistantIdx = nextMessages.length;

    setMessages([...nextMessages, { role: "assistant", content: "", steps: [], isStreaming: true }]);
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) => {
      setMessages(prev => {
        const next = [...prev];
        if (next[assistantIdx]) next[assistantIdx] = fn(next[assistantIdx]);
        return next;
      });
    };

    try {
      const res = await fetch(`${BASE}api/assistant/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: nextMessages.slice(-16).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE chunks are separated by double newlines
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          let evtName = "";
          let dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event: ")) evtName = line.slice(7).trim();
            if (line.startsWith("data: "))  dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;

          let data: unknown;
          try { data = JSON.parse(dataStr); } catch { continue; }

          if (evtName === "step") {
            const step = data as ReActStep;
            if (step.type === "final") {
              patchAssistant(m => ({ ...m, content: step.content ?? "", isStreaming: false }));
            } else {
              patchAssistant(m => ({ ...m, steps: [...(m.steps ?? []), step] }));
            }
          } else if (evtName === "error") {
            const errData = data as { message?: string };
            setError(errData.message ?? "حدث خطأ غير متوقع");
            patchAssistant(m => ({ ...m, isStreaming: false }));
          } else if (evtName === "done") {
            patchAssistant(m => ({ ...m, isStreaming: false }));
          }
        }
      }

      patchAssistant(m => ({ ...m, isStreaming: false }));
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "تعذّر الاتصال بالخادم");
      patchAssistant(m => ({ ...m, isStreaming: false }));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    setLoading(false);
    setMessages(prev => {
      const next = [...prev];
      const last = next.at(-1);
      if (last?.isStreaming) next[next.length - 1] = { ...last, isStreaming: false };
      return next;
    });
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-4 md:p-6 max-w-4xl mx-auto h-full flex flex-col gap-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="inline-flex w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 items-center justify-center shadow-lg shadow-fuchsia-500/30">
              <Bot className="w-5 h-5 text-white" />
            </span>
            <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">المساعد التنفيذي</h1>
            <p className="text-xs text-muted-foreground">يفكّر، يبحث، ويُنجز — بصلاحية الوصول الكاملة لبيانات المؤسسة</p>
          </div>
        </div>

        {/* Tool capability pills */}
        <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
          {Object.entries(TOOL_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            return (
              <div key={key} title={cfg.label}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border ${cfg.bg} ${cfg.color}`}>
                <Icon className="w-3 h-3" />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chat card ──────────────────────────────────────────────────────── */}
      <Card className="flex-1 border-0 shadow-lg flex flex-col overflow-hidden"
        style={{ minHeight: "60vh", background: "linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--muted)/0.3) 100%)" }}>
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">

          {/* Scroll area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

            {/* ── Empty / welcome state ─── */}
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center text-center gap-5 py-10">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-100 to-indigo-100 dark:from-fuchsia-950/40 dark:to-indigo-950/40 flex items-center justify-center shadow-lg"
                >
                  <Sparkles className="w-8 h-8 text-fuchsia-500" />
                </motion.div>

                <div>
                  <p className="font-bold text-foreground">مساعدك التنفيذي جاهز</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    يبحث في قاعدة البيانات، يُنشئ وثائق رسمية، يُرسل رسائل، ويُدير مواعيدك — كلّ ذلك بأمر واحد
                  </p>
                </div>

                {/* Capability grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-md w-full">
                  {Object.entries(TOOL_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <div key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${cfg.bg}`}>
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                        <span className="text-muted-foreground">{cfg.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Suggestion pills */}
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {SUGGESTIONS.map(s => (
                    <motion.button key={s} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full border bg-background text-muted-foreground hover:border-fuchsia-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-400 transition-colors">
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Messages ─── */}
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className={`flex items-start gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" ? (
                    <AssistantMessage msg={m} />
                  ) : (
                    <>
                      <div className="max-w-[78%] rounded-2xl rounded-se-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-4 py-2.5 text-sm shadow-md shadow-blue-500/20 whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2.5 border border-red-200 dark:border-red-900">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)} className="hover:opacity-70 transition-opacity">✕</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Input bar ───────────────────────────────────────────────────── */}
          <div className="border-t bg-card/60 backdrop-blur-sm p-3">
            <form
              onSubmit={e => { e.preventDefault(); sendMessage(input); }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="اكتب طلبك للمساعد التنفيذي... (Enter للإرسال)"
                disabled={loading}
                rows={1}
                className="flex-1 px-3.5 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40 disabled:opacity-60 resize-none leading-relaxed transition-shadow"
                style={{ minHeight: "42px", maxHeight: "120px" }}
              />

              {loading ? (
                <motion.button
                  type="button" onClick={stopGeneration}
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="h-[42px] w-[42px] rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center hover:bg-red-500/20 transition-colors shrink-0"
                >
                  <XCircle className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="shrink-0">
                  <Button type="submit" size="icon"
                    disabled={!input.trim()}
                    className="h-[42px] w-[42px] rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 hover:from-fuchsia-600 hover:to-indigo-700 text-white border-0 shadow-md shadow-fuchsia-500/25 disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </form>

            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              يعمل بنموذج Llama 3.3 70B عبر Groq · يطّلع على بيانات مؤسستك حصراً
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
