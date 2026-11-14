/**
 * SMS Broadcast Component
 * 
 * Allows admins to:
 *   1. Compose SMS messages with template placeholders
 *   2. Preview message rendering
 *   3. Check available SMS credits
 *   4. Select recipient type (students/parents, specific numbers)
 *   5. Send broadcast with credit deduction tracking
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface Recipient {
  id: string;
  name: string;
  phone: string;
  selected: boolean;
}

export function SmsBroadcastDialog({ students }: { students: Recipient[] }) {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [messageType, setMessageType] = useState<"custom" | "absence_alert" | "grade_alert">("custom");
  const [template, setTemplate] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [previewCount, setPreviewCount] = useState(1);
  const [creditsNeeded, setCreditsNeeded] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  // Fetch SMS credits on dialog open
  useEffect(() => {
    if (!open) return;

    const fetchCredits = async () => {
      setCreditsLoading(true);
      try {
        const response = await fetch("/api/sms/credits");
        if (response.ok) {
          const data = await response.json();
          setCredits(data.creditsRemaining);
        }
      } catch (err) {
        console.error("Failed to fetch credits:", err);
      } finally {
        setCreditsLoading(false);
      }
    };

    fetchCredits();
  }, [open]);

  // Calculate credits needed when template changes
  useEffect(() => {
    if (!template) {
      setCreditsNeeded(0);
      return;
    }

    const calculateCredits = async () => {
      try {
        const response = await fetch(
          `/api/sms/broadcast/preview?template=${encodeURIComponent(template)}&recipients=${previewCount}`,
        );
        if (response.ok) {
          const data = await response.json();
          setCreditsNeeded(data.totalCreditsNeeded || 0);
        }
      } catch (err) {
        console.error("Failed to calculate credits:", err);
      }
    };

    calculateCredits();
  }, [template, previewCount]);

  const canSend = credits !== null && creditsNeeded > 0 && creditsNeeded <= credits && selectedRecipients.length > 0;

  const handleSend = async () => {
    if (!template || selectedRecipients.length === 0) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Map selected recipients to student IDs
      const studentIds = selectedRecipients.filter(id => students.find(s => s.id === id)).map(id => id);
      const directPhones = selectedRecipients.filter(p => !students.find(s => s.id === p));

      const response = await fetch("/api/sms/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: messageType,
          messageTemplate: template,
          studentIds: studentIds.length > 0 ? studentIds : undefined,
          phoneNumbers: directPhones.length > 0 ? directPhones : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 402) {
          toast({
            title: "رصيد غير كافٍ",
            description: `المطلوب: ${error.required}، المتاح: ${error.available}`,
            variant: "destructive",
          });
        } else {
          throw new Error(error.error || "فشل الإرسال");
        }
        return;
      }

      const result = await response.json();
      setSendResult(result);
      setCredits((prev) => (prev ? prev - result.creditsDeducted : 0));

      toast({
        title: "نجح الإرسال",
        description: `تم إرسال ${result.sent} من ${result.total} رسالة`,
      });

      // Reset form
      setTimeout(() => {
        setTemplate("");
        setSelectedRecipients([]);
        setSendResult(null);
        setOpen(false);
      }, 2000);
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "فشل إرسال الرسائل",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const messageTemplates = {
    absence_alert: "الطالب/ة {student_name} غائب عن الدوام في {date}",
    grade_alert: "الطالب/ة {student_name} حصل على درجة {grade} في {subject}",
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-right">بث رسائل SMS</DialogTitle>
          </DialogHeader>

          {sendResult ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <div>
                <h3 className="font-semibold">تم الإرسال بنجاح</h3>
                <p className="text-sm text-gray-600">
                  تم إرسال {sendResult.sent} من {sendResult.total} رسالة
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  الرصيد المتبقي: {sendResult.creditsRemaining} رسالة
                </p>
              </div>
              <Button onClick={() => { setOpen(false); setSendResult(null); }}>
                إغلاق
              </Button>
            </div>
          ) : (
            <>
              <Tabs defaultValue="compose">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="compose">الرسالة</TabsTrigger>
                  <TabsTrigger value="recipients">المستقبلون</TabsTrigger>
                  <TabsTrigger value="review">المراجعة</TabsTrigger>
                </TabsList>

                <TabsContent value="compose" className="space-y-4">
                  <div className="space-y-2">
                    <Label>نوع الرسالة</Label>
                    <select
                      value={messageType}
                      onChange={(e) => {
                        setMessageType(e.target.value as any);
                        if (e.target.value !== "custom") {
                          setTemplate(messageTemplates[e.target.value as keyof typeof messageTemplates] || "");
                        }
                      }}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="custom">مخصصة</option>
                      <option value="absence_alert">تنبيه غياب</option>
                      <option value="grade_alert">تنبيه درجات</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>نص الرسالة</Label>
                    <Textarea
                      placeholder="اكتب نص الرسالة (يمكنك استخدام {student_name}, {date}, {subject}, {grade})"
                      value={template}
                      onChange={(e) => setTemplate(e.target.value)}
                      className="min-h-24"
                    />
                    <p className="text-xs text-gray-500 text-right">
                      المحارف المتبقية: {70 - (template.length % 70)} / 70
                    </p>
                  </div>

                  {creditsLoading ? (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">جاري تحميل الرصيد...</span>
                    </div>
                  ) : credits !== null ? (
                    <div className="p-3 bg-blue-50 rounded">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold">الرصيد المتاح</span>
                        <span className="text-lg font-bold text-blue-600">{credits}</span>
                      </div>
                      <Progress value={(creditsNeeded / credits) * 100} className="mt-2" />
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="recipients" className="space-y-4">
                  <Label>اختر المستقبلين</Label>
                  <div className="max-h-64 overflow-auto space-y-2">
                    {students.map((student) => (
                      <label
                        key={student.id}
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRecipients.includes(student.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRecipients([...selectedRecipients, student.id]);
                              setPreviewCount(selectedRecipients.length + 1);
                            } else {
                              setSelectedRecipients(selectedRecipients.filter((id) => id !== student.id));
                              setPreviewCount(Math.max(1, selectedRecipients.length - 1));
                            }
                          }}
                        />
                        <div className="flex-1 text-right">
                          <div className="text-sm font-medium">{student.name}</div>
                          <div className="text-xs text-gray-500">{student.phone}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="text-sm text-gray-600">
                    المختار: {selectedRecipients.length} من {students.length}
                  </div>
                </TabsContent>

                <TabsContent value="review" className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold">معاينة</h3>
                    <div className="p-4 bg-gray-100 rounded-lg text-right">
                      <p className="text-sm">{template || "لم يتم كتابة الرسالة"}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>عدد الرسائل:</span>
                      <span className="font-bold">{selectedRecipients.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>الرصيد المطلوب:</span>
                      <span className={creditsNeeded > (credits || 0) ? "font-bold text-red-600" : "font-bold"}>
                        {creditsNeeded}
                      </span>
                    </div>
                    {creditsNeeded > (credits || 0) && (
                      <div className="flex gap-2 p-2 bg-red-50 text-red-600 rounded text-sm">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <span>الرصيد غير كافٍ</span>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 justify-end mt-6">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleSend} disabled={!canSend || sending}>
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      إرسال الرسائل
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Button onClick={() => setOpen(true)}>
        <Send className="mr-2 h-4 w-4" />
        بث SMS
      </Button>
    </>
  );
}
