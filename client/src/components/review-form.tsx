import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, MessageSquareQuote, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

const AUDIENCES = [
  { value: "school", label: "مدير مؤسسة" },
  { value: "teacher", label: "أستاذ / مشرف" },
  { value: "parent", label: "ولي أمر" },
];

interface MyReview {
  rating: number;
  comment: string;
  audience: string;
  status: string;
  createdAt: string;
}

interface ReviewMeResponse {
  eligible: boolean;
  minAgeDays: number;
  accountAgeDays: number;
  daysUntilEligible: number;
  review: MyReview | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "قيد المراجعة", className: "text-amber-600" },
  approved: { label: "منشور", className: "text-emerald-600" },
  rejected: { label: "مرفوض", className: "text-red-500" },
};

export function ReviewForm() {
  const { toast } = useToast();
  const [data, setData] = useState<ReviewMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState(5);
  const [audience, setAudience] = useState("school");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/reviews/me`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (data?.review && !editing) {
      setRating(data.review.rating);
      setAudience(data.review.audience);
      setComment(data.review.comment);
    }
  }, [data, editing]);

  const submit = async () => {
    if (comment.trim().length < 10) {
      toast({ title: "اكتب تعليقاً واضحاً (10 أحرف على الأقل)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim(), audience }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "تعذر إرسال التقييم");
      toast({ title: "شكراً لك! سيتم نشر تقييمك بعد مراجعته" });
      setEditing(false);
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "تعذر إرسال التقييم", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const review = data.review;
  const showForm = data.eligible && (!review || editing);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <MessageSquareQuote className="w-4 h-4 text-white" />
          </div>
          قيّم المنصة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {review && !editing && (
          <div className="rounded-xl border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5" dir="ltr">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`w-4 h-4 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                ))}
              </div>
              <span className={`text-xs font-bold ${STATUS_LABELS[review.status]?.className ?? ""}`}>
                {STATUS_LABELS[review.status]?.label ?? review.status}
              </span>
            </div>
            <p className="text-sm text-foreground/85 leading-relaxed">"{review.comment}"</p>
            <p className="text-[11px] text-muted-foreground">
              {AUDIENCES.find(a => a.value === review.audience)?.label ?? review.audience} ·{" "}
              {new Date(review.createdAt).toLocaleDateString("ar-DZ")}
            </p>
            {data.eligible && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>تعديل التقييم</Button>
            )}
          </div>
        )}

        {showForm && (
          <>
            <p className="text-xs text-muted-foreground">
              رأيك يساعد مؤسسات وأولياء أمثالكم على اكتشاف المنصة. يُنشر بعد مراجعته من الإدارة.
            </p>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">تقييمك</p>
              <div className="flex items-center gap-1" dir="ltr">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button key={i} type="button" onClick={() => setRating(i + 1)} className="p-0.5">
                    <Star className={`w-7 h-7 transition-colors ${i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">أنت</p>
              <div className="flex flex-wrap gap-2">
                {AUDIENCES.map(a => (
                  <button key={a.value} type="button" onClick={() => setAudience(a.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${audience === a.value ? "bg-blue-600 text-white border-blue-600" : "bg-background border-border hover:bg-muted"}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">تعليقك</p>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="ماذا أعجبك أو ما الذي يمكن تحسينه؟"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-start">{comment.trim().length}/1000 — 10 أحرف على الأقل</p>
            </div>
            <div className="flex gap-2">
              {editing && <Button variant="outline" size="sm" onClick={() => setEditing(false)}>إلغاء</Button>}
              <Button size="sm" onClick={submit} disabled={saving || comment.trim().length < 10} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {review ? "حفظ التعديل" : "إرسال التقييم"}
              </Button>
            </div>
          </>
        )}

        {review?.status === "rejected" && (
          <p className="text-xs text-red-500">تم رفض تقييمك السابق — يمكنك تعديله وإرساله مجدداً.</p>
        )}
      </CardContent>
    </Card>
  );
}
