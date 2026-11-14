/**
 * OCR Review Component
 * 
 * Allows admins to:
 *   1. Upload grade sheets or absence lists
 *   2. Review OCR-extracted data side-by-side with image
 *   3. Match student names to actual students
 *   4. Edit extracted values before committing
 *   5. Commit to database
 */

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OcrRow {
  rowNumber: number;
  studentName: string;
  confidence: number;
  lowConfidence: boolean;
  grade?: number;
  justifiedHours?: number;
  unjustifiedHours?: number;
  matched?: boolean;
  studentId?: string;
}

export function OcrReviewDialog() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [open, setOpen] = useState(false);
  const [ocrType, setOcrType] = useState<"grades" | "absences">("grades");
  const [imageBuffer, setImageBuffer] = useState<string | null>(null);
  const [rows, setRows] = useState<OcrRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  
  // Form fields for grades
  const [trimestre, setTrimestre] = useState<number>(1);
  const [subject, setSubject] = useState<string>("");
  const [annee, setAnnee] = useState("2026-2027");

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // Convert file to data URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBuffer(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Send to OCR API
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(`/api/ocr/parse-grades?type=${ocrType}&engine=auto`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: "خطأ في المعالجة",
          description: error.error || "فشل معالجة الصورة",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      if (data.rows) {
        setRows(data.rows);
        
        if (data.rows.length > 0) {
          // Auto-match students
          const names = data.rows.map((r: OcrRow) => r.studentName);
          const matchResponse = await fetch("/api/ocr/match-students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names, annee }),
          });

          if (matchResponse.ok) {
            const matchData = await matchResponse.json();
            const updatedRows = data.rows.map((r: OcrRow, i: number) => ({
              ...r,
              matched: matchData.matches[i]?.matched || false,
              studentId: matchData.matches[i]?.studentId || undefined,
            }));
            setRows(updatedRows);
          }
        }
      }
    } catch (err) {
      toast({
        title: "خطأ",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (index: number, updates: Partial<OcrRow>) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], ...updates };
    setRows(updated);
  };

  const handleCommit = async () => {
    if (!rows.length) {
      toast({ title: "خطأ", description: "لا توجد بيانات لحفظ", variant: "destructive" });
      return;
    }

    if (ocrType === "grades" && (!trimestre || !subject)) {
      toast({ title: "خطأ", description: "يرجى ملء الفصل والمادة", variant: "destructive" });
      return;
    }

    setCommitLoading(true);
    try {
      const response = await fetch("/api/ocr/review-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: ocrType,
          trimestre,
          subject,
          rows,
          annee,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "فشل الحفظ");
      }

      const result = await response.json();
      toast({
        title: "نجح",
        description: result.message || "تم حفظ البيانات بنجاح",
      });

      // Reset
      setRows([]);
      setImageBuffer(null);
      setOpen(false);
    } catch (err) {
      toast({
        title: "خطأ",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-right">استخراج البيانات من الصور</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="upload">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">رفع الصورة</TabsTrigger>
              <TabsTrigger value="review">المراجعة</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4">
              <div className="space-y-2">
                <Label>نوع البيانات</Label>
                <Select value={ocrType} onValueChange={(v) => setOcrType(v as "grades" | "absences")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grades">درجات</SelectItem>
                    <SelectItem value="absences">غياب</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>السنة الدراسية</Label>
                <Input value={annee} onChange={(e) => setAnnee(e.target.value)} />
              </div>

              {ocrType === "grades" && (
                <>
                  <div className="space-y-2">
                    <Label>الفصل</Label>
                    <Select value={String(trimestre)} onValueChange={(v) => setTrimestre(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">الفصل الأول</SelectItem>
                        <SelectItem value="2">الفصل الثاني</SelectItem>
                        <SelectItem value="3">الفصل الثالث</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>المادة</Label>
                    <Input
                      placeholder="مثلاً: العربية"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      جارٍ المعالجة...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      اختر صورة الكشف
                    </>
                  )}
                </Button>
              </div>

              {imageBuffer && (
                <div className="mt-4">
                  <img src={imageBuffer} alt="المعاينة" className="max-w-full h-auto rounded-lg" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="review" className="space-y-4">
              {rows.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  يرجى رفع صورة أولاً
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <h3 className="font-semibold">المستخرجة ({rows.length}) الصفوف </h3>
                    <div className="max-h-96 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-right p-2">اسم الطالب</th>
                            {ocrType === "grades" ? (
                              <th className="text-right p-2">الدرجة</th>
                            ) : (
                              <>
                                <th className="text-right p-2">غياب مبرر</th>
                                <th className="text-right p-2">غياب غير مبرر</th>
                              </>
                            )}
                            <th className="text-right p-2">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={i} className="border-b">
                              <td className="p-2">
                                <Input
                                  value={row.studentName}
                                  onChange={(e) => updateRow(i, { studentName: e.target.value })}
                                  className="text-sm"
                                />
                              </td>
                              {ocrType === "grades" ? (
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="20"
                                    step="0.5"
                                    value={row.grade || ""}
                                    onChange={(e) =>
                                      updateRow(i, { grade: parseFloat(e.target.value) || 0 })
                                    }
                                    className="text-sm"
                                  />
                                </td>
                              ) : (
                                <>
                                  <td className="p-2">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={row.justifiedHours || ""}
                                      onChange={(e) =>
                                        updateRow(i, { justifiedHours: parseInt(e.target.value) || 0 })
                                      }
                                      className="text-sm"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <Input
                                      type="number"
                                      min="0"
                                      value={row.unjustifiedHours || ""}
                                      onChange={(e) =>
                                        updateRow(i, {
                                          unjustifiedHours: parseInt(e.target.value) || 0,
                                        })
                                      }
                                      className="text-sm"
                                    />
                                  </td>
                                </>
                              )}
                              <td className="p-2 text-center">
                                {row.matched ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      إلغاء
                    </Button>
                    <Button onClick={handleCommit} disabled={commitLoading}>
                      {commitLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      حفظ البيانات
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Button onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        استخراج من صورة
      </Button>
    </>
  );
}
