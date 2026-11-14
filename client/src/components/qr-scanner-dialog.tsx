/**
 * QR Scanner Component
 * 
 * Integrates html5-qrcode for real-time QR scanning:
 *   1. Start/stop camera
 *   2. Scan QR codes
 *   3. Log attendance automatically
 *   4. Show recent scans and duplicate detection
 */

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Camera,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Import html5-qrcode - make sure it's installed: npm install html5-qrcode
import Html5QrcodePlugin from "html5-qrcode";

interface AttendanceLog {
  studentId: string;
  studentName: string;
  classe: string;
  scannedAt: string;
  duplicate: boolean;
}

export function QrScannerDialog() {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentLogs, setRecentLogs] = useState<AttendanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const qrScannerRef = useRef<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  // Fetch recent attendance logs
  const fetchRecentLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await fetch("/api/qr/attendance-logs?hours=24&limit=50");
      if (response.ok) {
        const data = await response.json();
        const logs: AttendanceLog[] = [];
        for (const student of data.students) {
          for (const scan of student.scans) {
            logs.push({
              studentId: student.studentId,
              studentName: student.studentName,
              classe: student.classe,
              scannedAt: scan.scannedAt,
              duplicate: false,
            });
          }
        }
        setRecentLogs(logs.sort((a, b) => 
          new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
        ));
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Initialize QR scanner
  const startScanning = async () => {
    if (!videoRef.current) return;

    try {
      setLoading(true);
      
      // Initialize html5-qrcode scanner
      qrScannerRef.current = new Html5QrcodePlugin.Html5Qrcode("qr-video");

      await qrScannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        onScanSuccess,
        onScanFailure,
      );

      setScanning(true);
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: "فشل بدء الكاميرا: " + err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const stopScanning = async () => {
    if (qrScannerRef.current && scanning) {
      try {
        await qrScannerRef.current.stop();
        setScanning(false);
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    // Parse QR code URL: /scan-qr?sid=<id>&sig=<hmac>
    try {
      const url = new URL(decodedText, window.location.origin);
      const studentId = url.searchParams.get("sid");
      const sig = url.searchParams.get("sig");

      if (!studentId || !sig) {
        return; // Not a valid scan
      }

      // Send to attendance logging API
      const response = await fetch(`/api/qr/scan?sid=${encodeURIComponent(studentId)}&sig=${encodeURIComponent(sig)}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success) {
          toast({
            title: data.duplicate ? "تنبيه" : "نجح",
            description: data.message,
          });

          // Refresh logs
          await fetchRecentLogs();

          // Visual feedback
          if (videoRef.current) {
            videoRef.current.style.borderColor = data.duplicate ? "orange" : "green";
            setTimeout(() => {
              if (videoRef.current) videoRef.current.style.borderColor = "";
            }, 1000);
          }
        }
      } else {
        const error = await response.json();
        toast({
          title: "خطأ",
          description: error.error || "فشل تسجيل الحضور",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error processing scan:", err);
    }
  };

  const onScanFailure = (error: any) => {
    // Silently fail - this is normal during normal video stream
    // Only log if it's an actual error, not a "no QR code found" message
  };

  useEffect(() => {
    if (open) {
      fetchRecentLogs();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (scanning) {
        stopScanning();
      }
    };
  }, [scanning]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-right">ماسح QR للحضور</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Scanner side */}
            <div className="space-y-4">
              {!scanning ? (
                <div
                  ref={videoRef}
                  className="w-full h-80 bg-gray-900 rounded-lg flex items-center justify-center"
                >
                  <Button onClick={startScanning} disabled={loading} size="lg">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        جاري التحضير...
                      </>
                    ) : (
                      <>
                        <Camera className="mr-2 h-4 w-4" />
                        تشغيل الكاميرا
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    ref={videoRef}
                    id="qr-video"
                    className="w-full h-80 bg-gray-900 rounded-lg border-2 border-green-400"
                  />
                  <Button onClick={stopScanning} variant="destructive" className="w-full">
                    <X className="mr-2 h-4 w-4" />
                    إيقاف
                  </Button>
                </>
              )}

              <div className="text-sm text-gray-600 text-center p-3 bg-blue-50 rounded">
                <p>وجّه الكاميرا نحو رمز QR للطالب</p>
              </div>
            </div>

            {/* Recent logs side */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  الحضور الحديث
                </h3>
                <button
                  onClick={fetchRecentLogs}
                  disabled={logsLoading}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {logsLoading ? "جاري التحديث..." : "تحديث"}
                </button>
              </div>

              <div className="max-h-80 overflow-auto space-y-2">
                {recentLogs.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>لا توجد تسجيلات حتى الآن</p>
                  </div>
                ) : (
                  recentLogs.map((log, i) => (
                    <div
                      key={i}
                      className="p-3 bg-gray-50 rounded-lg border-r-2 border-green-400"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 text-right">
                          <p className="font-medium text-sm">{log.studentName}</p>
                          <p className="text-xs text-gray-500">{log.classe}</p>
                          <p className="text-xs text-gray-400">
                            {new Date(log.scannedAt).toLocaleTimeString("ar-SA")}
                          </p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {recentLogs.length > 0 && (
                <div className="text-center text-sm text-gray-600">
                  إجمالي: {recentLogs.length} طالب
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Button onClick={() => setOpen(true)}>
        <Camera className="mr-2 h-4 w-4" />
        ماسح QR
      </Button>
    </>
  );
}
