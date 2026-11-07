import { useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const BASE = import.meta.env.BASE_URL;
const SUGGESTIONS = [
  "لم أجد اسم ابني في الحساب",
  "كيف أقدّم تبريراً للغياب؟",
  "كيف أدفع الاشتراك بالبطاقة الذهبية؟",
];

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ParentAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, error]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading || content.length > 2000) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${BASE}api/parent/assistant`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-11) }),
      });
      const payload = await response.json() as { answer?: string; error?: string; supportPhone?: string | null };
      if (payload.supportPhone) setSupportPhone(payload.supportPhone);
      if (!response.ok || !payload.answer) throw new Error(payload.error || "تعذر إرسال رسالتك");
      setMessages(current => [...current, { role: "assistant", content: payload.answer! }]);
    } catch (sendError) {
      setMessages(messages);
      setDraft(content);
      setError(sendError instanceof Error ? sendError.message : "تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  const supportUrl = supportPhone ? `https://wa.me/${supportPhone}` : "";

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col px-4 py-5 sm:px-6">
      <header className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <Bot className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">مساعد الأولياء</h1>
            <p className="text-sm text-muted-foreground">دليل معك لمتابعة شؤون طفلك</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {supportUrl && (
            <Button asChild variant="ghost" size="icon" title="تواصل مع الدعم عبر واتساب">
              <a href={supportUrl} target="_blank" rel="noreferrer" aria-label="تواصل مع الدعم عبر واتساب">
                <MessageCircle className="size-4" />
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="محادثة جديدة"
            aria-label="محادثة جديدة"
            onClick={() => { setMessages([]); setError(""); }}
            disabled={loading || messages.length === 0}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      </header>

      <section aria-label="المحادثة" className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
        {messages.length === 0 ? (
          <div className="m-auto w-full max-w-2xl py-8">
            <div className="mb-7 text-center">
              <p className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">السلام عليكم، أنا دليل</p>
              <h2 className="text-2xl font-bold">كيف نقدر نعاونك؟</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SUGGESTIONS.map(suggestion => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  className="min-h-16 rounded-md border border-border bg-card px-4 py-3 text-start text-sm transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 disabled:opacity-50"
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            {messages.map((message, index) => (
              <article key={`${index}-${message.role}`} className={`flex items-start gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${message.role === "assistant" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  {message.role === "assistant" ? <Bot className="size-4" aria-hidden="true" /> : <UserRound className="size-4" aria-hidden="true" />}
                </span>
                <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-6 ${message.role === "assistant" ? "bg-muted" : "bg-emerald-700 text-white dark:bg-emerald-800"}`}>
                  {message.content}
                </p>
              </article>
            ))}
            {loading && (
              <div role="status" className="flex items-center gap-2 ps-11 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                <span>دليل يكتب…</span>
              </div>
            )}
            {error && (
              <div role="alert" className="ms-11 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                <p>{error}</p>
                {supportUrl && <a className="mt-2 inline-block font-semibold text-emerald-700 underline dark:text-emerald-400" href={supportUrl} target="_blank" rel="noreferrer">التواصل مع الدعم عبر واتساب</a>}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </section>

      {messages.length === 0 && error && (
        <p role="alert" className="mx-auto mb-3 w-full max-w-2xl rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {error}{supportUrl && <a className="ms-2 font-semibold text-emerald-700 underline dark:text-emerald-400" href={supportUrl} target="_blank" rel="noreferrer">الدعم الفني</a>}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mx-auto mt-3 flex w-full max-w-2xl items-end gap-2 border-t border-border pt-3">
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={event => setDraft(event.target.value.slice(0, 2000))}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(draft);
            }
          }}
          placeholder="اكتب رسالتك…"
          aria-label="اكتب رسالتك"
          rows={1}
          className="max-h-32 min-h-11 resize-y text-sm"
          disabled={loading}
        />
        <Button type="submit" size="icon" aria-label="إرسال الرسالة" disabled={loading || !draft.trim()} className="size-11 shrink-0 bg-emerald-700 hover:bg-emerald-800">
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </main>
  );
}