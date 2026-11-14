/**
 * SmsNoticeModal
 * ──────────────
 * Reusable modal for composing and sending a bulk SMS notice to a list of
 * parent phone numbers. Used from both the absences page and the results page.
 *
 * Features:
 *  • Arabic character counter with segment count (70 chars/segment)
 *  • Phone list with missing-phone warnings
 *  • Server-side send via POST /api/notifications/send-sms
 *  • Immediate send feedback (sent / failed counts)
 */
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Send, CheckCheck, AlertCircle, Phone, PhoneOff,
  Loader2, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const ARABIC_SEGMENT = 70;
const ARABIC_MULTI   = 67;

function segmentCount(msg: string): number {
  if (msg.length <= ARABIC_SEGMENT) return 1;
  return Math.ceil(msg.length / ARABIC_MULTI);
}

export interface SmsRecipient {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected recipients */
  recipients: SmsRecipient[];
  /** Pre-filled message template */
  defaultMessage?: string;
  title?: string;
}

type SendPhase = "idle" | "sending" | "done" | "error";

export function SmsNoticeModal({
  open, onOpenChange, recipients, defaultMessage = "", title = "إرسال إشعار SMS",
}: Props) {
  const [message, setMessage]   = useState(defaultMessage);
  const [phase,   setPhase]     = useState<SendPhase>("idle");
  const [result,  setResult]    = useState<{ sent: number; failed: number; channel: string } | null>(null);
  const [errMsg,  setErrMsg]    = useState<string | null>(null);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setMessage(defaultMessage);
      setPhase("idle");
      setResult(null);
      setErrMsg(null);
    }
  }, [open, defaultMessage]);

  const withPhone    = recipients.filter(r => r.phone);
  const withoutPhone = recipients.filter(r => !r.phone);
  const segments     = segmentCount(message.trim());
  const charCount    = message.trim().length;
  const tooLong      = segments > 4;
  const canSend      = withPhone.length > 0 && message.trim().length > 0 && !tooLong && phase !== "sending";

  const handleSend = async () => {
    if (!canSend) return;
    setPhase("sending");
    setResult(null);
    setErrMsg(null);
    try {
      const res = await fetch(`${BASE}api/notifications/send-sms`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumbers: withPhone.map(r => r.phone!),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrMsg(data.error ?? "فشل الإرسال");
        setPhase("error");
        return;
      }
      setResult({ sent: data.sent, failed: data.failed, channel: data.channel });
      setPhase("done");
    } catch (e: any) {
      setErrMsg(e?.message ?? "تعذّر الاتصال بالخادم");
      setPhase("error");
    }
  };

  const segColor =
    segments === 1 ? "text-emerald-500" :
    segments === 2 ? "text-amber-500"   :
    segments <= 4  ? "text-orange-500"  : "text-red-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Recipient summary */}
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Phone className="w-4 h-4 text-emerald-500" />
              <span>{withPhone.length} مستلم بهاتف صالح</span>
              {withoutPhone.length > 0 && (
                <span className="text-amber-500 text-xs font-normal flex items-center gap-1 ms-auto">
                  <PhoneOff className="w-3 h-3" />
                  {withoutPhone.length} بدون هاتف
                </span>
              )}
            </div>

            {/* Recipient pills */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {recipients.slice(0, 40).map(r => (
                <span
                  key={r.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                    r.phone
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {r.phone ? <Phone className="w-2.5 h-2.5" /> : <PhoneOff className="w-2.5 h-2.5" />}
                  {r.name}
                </span>
              ))}
              {recipients.length > 40 && (
                <span className="text-xs text-muted-foreground self-center">+{recipients.length - 40} آخرون</span>
              )}
            </div>
          </div>

          {/* Message composer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">نص الرسالة</label>
              <div className={`flex items-center gap-2 text-xs ${segColor} font-mono`}>
                <span>{charCount} حرف</span>
                <span className="text-muted-foreground">|</span>
                <span className={tooLong ? "text-red-500 font-bold" : ""}>
                  {segments} وحدة SMS
                </span>
              </div>
            </div>

            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="اكتب رسالتك هنا…"
              className="min-h-[120px] font-arabic text-sm resize-none leading-relaxed"
              dir="rtl"
              disabled={phase === "sending" || phase === "done"}
            />

            {/* Segment guide */}
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    segments >= s
                      ? s === 1 ? "bg-emerald-500" : s === 2 ? "bg-amber-500" : s === 3 ? "bg-orange-500" : "bg-red-500"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              الرسائل العربية: 70 حرف = وحدة واحدة · الحد الأقصى 4 وحدات
            </p>

            {tooLong && (
              <p className="text-xs text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                الرسالة طويلة جدًا — اختصرها لتصل إلى 4 وحدات SMS
              </p>
            )}
          </div>

          {/* Result feedback */}
          <AnimatePresence>
            {phase === "done" && result && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-center gap-3"
              >
                <CheckCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    تم الإرسال عبر {result.channel === "twilio" ? "Twilio" : result.channel === "gateway" ? "البوابة" : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    نجح: <span className="font-bold text-emerald-600">{result.sent}</span>
                    {result.failed > 0 && (
                      <> · فشل: <span className="font-bold text-red-500">{result.failed}</span></>
                    )}
                  </p>
                </div>
                <Button
                  size="sm" variant="ghost" className="ms-auto text-xs h-7 gap-1"
                  onClick={() => { setPhase("idle"); setResult(null); }}
                >
                  <RefreshCw className="w-3 h-3" /> رسالة جديدة
                </Button>
              </motion.div>
            )}

            {phase === "error" && errMsg && (
              <motion.div
                key="err"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/30 p-3 flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400 flex-1">{errMsg}</p>
                <Button
                  size="sm" variant="ghost" className="text-xs h-7 gap-1"
                  onClick={() => { setPhase("idle"); setErrMsg(null); }}
                >
                  <RefreshCw className="w-3 h-3" /> إعادة
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={phase === "sending"}>
            إغلاق
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-sm min-w-[120px]"
          >
            {phase === "sending" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال…</>
            ) : (
              <><Send className="w-4 h-4" /> إرسال ({withPhone.length})</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
