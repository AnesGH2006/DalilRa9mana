import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Send, UserPlus, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}api${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`);
  return data as T;
}

type Status = { whatsappConfigured: boolean; gatewayConfigured: boolean; channel: "whatsapp" | "sms" | "none" };
type InviteResult = { success: boolean; invited: number; failed: number; total: number; channel: string; joinCode?: string; inviteUrl?: string; message?: string };

export default function WhatsAppPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);

  const [sendForm, setSendForm] = useState({ studentId: "", phone: "", message: "" });
  const [inviteForm, setInviteForm] = useState({ annee: "2026-2027", classe: "", niveau: "", limit: "200" });
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await api<Status>("/whatsapp/status")); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  }, [toast]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const send = async () => {
    if (!sendForm.message.trim() || (!sendForm.studentId.trim() && !sendForm.phone.trim())) {
      toast({ title: "حقول ناقصة", description: "اكتب الرسالة وحدد تلميذاً أو رقماً", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const result = await api<any>("/whatsapp/send", { method: "POST", body: JSON.stringify({
        studentId: sendForm.studentId.trim() || undefined,
        phone: sendForm.phone.trim() || undefined,
        message: sendForm.message.trim(),
      }) });
      toast({ title: result.success ? "تم الإرسال" : "تعذر الإرسال", description: `القناة: ${result.channel} — ناجح: ${result.sent} / فاشل: ${result.failed}`, variant: result.success ? "default" : "destructive" });
      setSendForm(f => ({ ...f, message: "" }));
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const invite = async () => {
    setLoading(true);
    try {
      const result = await api<InviteResult>("/whatsapp/invite-parents", { method: "POST", body: JSON.stringify({
        annee: inviteForm.annee,
        classe: inviteForm.classe.trim() || undefined,
        niveau: inviteForm.niveau.trim() || undefined,
        limit: Number(inviteForm.limit) || 200,
      }) });
      setInviteResult(result);
      toast({ title: result.success ? "تمت الدعوات" : "تم الإرسال جزئياً", description: `${result.invited}/${result.total} عبر ${result.channel}` });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-full bg-dot-grid p-4 md:p-8" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">واتساب وأولياء الأمور</h1>
            <p className="text-muted-foreground">إشعارات فورية، دعوات التسجيل، واشتراك 500 دج</p>
          </div>
          <Button variant="outline" onClick={loadStatus}><RefreshCw className="h-4 w-4" /> تحديث الحالة</Button>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">قناة الإرسال</CardTitle></CardHeader><CardContent>
            <div className="flex items-center gap-2 text-lg font-bold">
              {status?.channel === "whatsapp" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : status?.channel === "sms" ? <MessageCircle className="h-5 w-5 text-amber-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
              {status ? (status.channel === "whatsapp" ? "WhatsApp" : status.channel === "sms" ? "SMS احتياطي" : "غير مهيأ") : "…"}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{status?.whatsappConfigured ? "WhatsApp Cloud API / Gateway مضبوط" : "سيتم استخدام SMS إن توفر"}</p>
          </CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">تنبيهات تلقائية</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">غياب يومي، نقاط الفروض والاختبارات، ورسائل أولياء الأمور.</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">دعوة الاشتراك</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">رابط تسجيل ولي الأمر مع اشتراك 500 دج/سنة.</CardContent></Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>إرسال رسالة يدوية</CardTitle></CardHeader><CardContent className="space-y-3">
            <Input placeholder="معرّف التلميذ (اختياري)" value={sendForm.studentId} onChange={e => setSendForm(f => ({ ...f, studentId: e.target.value }))} />
            <Input placeholder="أو رقم الهاتف مباشرة" value={sendForm.phone} onChange={e => setSendForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" />
            <Textarea rows={5} placeholder="نص الرسالة" value={sendForm.message} onChange={e => setSendForm(f => ({ ...f, message: e.target.value }))} />
            <Button onClick={send} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} إرسال</Button>
          </CardContent></Card>

          <Card><CardHeader><CardTitle>دعوة أولياء غير المسجلين</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={inviteForm.annee} onChange={e => setInviteForm(f => ({ ...f, annee: e.target.value }))}>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select>
              <Input placeholder="القسم (اختياري)" value={inviteForm.classe} onChange={e => setInviteForm(f => ({ ...f, classe: e.target.value }))} />
              <Input placeholder="المستوى (اختياري)" value={inviteForm.niveau} onChange={e => setInviteForm(f => ({ ...f, niveau: e.target.value }))} />
              <Input type="number" placeholder="الحد الأقصى" value={inviteForm.limit} onChange={e => setInviteForm(f => ({ ...f, limit: e.target.value }))} />
            </div>
            <Button onClick={invite} disabled={loading}><UserPlus className="h-4 w-4" /> إرسال الدعوات</Button>
            {inviteResult && (
              <div className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={inviteResult.success ? "default" : "secondary"}>ناجح {inviteResult.invited}</Badge>
                  <Badge variant="outline">فاشل {inviteResult.failed}</Badge>
                  <Badge variant="outline">القناة {inviteResult.channel}</Badge>
                </div>
                {inviteResult.inviteUrl && <div className="mt-2 break-all font-mono text-xs text-muted-foreground" dir="ltr">{inviteResult.inviteUrl}</div>}
                {inviteResult.message && <div className="mt-2 text-muted-foreground">{inviteResult.message}</div>}
              </div>
            )}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
