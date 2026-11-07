# 📱 Dalil Ra9mana - Advanced Features Implementation Guide

Historical implementation notes for OCR, SMS notifications, and student QR codes.

> SMS notifications and student QR features have been removed from the active application. Their routes and UI are disabled; legacy database fields and implementation notes are retained for compatibility/reference.

## 🎯 Features Implemented

### 1. 📸 OCR Grade & Attendance Scanner

**Objective:** Automatically extract student data from scanned grade sheets and attendance lists.

#### Components & Routes:
- **Frontend Component:** `client/src/components/ocr-review-dialog.tsx`
- **Backend Routes:** 
  - `server/routes/ocr.ts` - Parse images with Tesseract.js + Groq Vision
  - `server/routes/ocrReview.ts` - Review and commit extracted data
- **Services:** `server/services/ocrService.ts`

#### API Endpoints:
```
POST /api/ocr/parse-grades?type=grades|absences&engine=auto|vision|tesseract
  - Upload image and extract student data
  - Returns rows with confidence scores

POST /api/ocr/match-students
  - Match extracted names to actual students
  - Payload: { names: string[], annee: string }
  - Returns: { matches: Array<{ name, studentId, matched }> }

POST /api/ocr/review-commit
  - Commit reviewed/edited OCR data to database
  - Payload: { type, trimestre?, subject?, rows, annee? }
  - Inserts to grades_table or absences_table
```

#### Usage Example:
```tsx
import { OcrReviewDialog } from "@/components/ocr-review-dialog";

export function GradeManagementPage() {
  return (
    <div>
      <h1>إدارة الدرجات</h1>
      <OcrReviewDialog />
    </div>
  );
}
```

#### Key Features:
- ✅ Dual-engine OCR (Groq Vision primary, Tesseract.js fallback)
- ✅ Side-by-side image preview during review
- ✅ Auto-match student names to database
- ✅ Inline editing of extracted values
- ✅ Confidence scoring (low confidence values flagged)
- ✅ Arabic/French text support

---

### 2. 💬 SMS Notification Service

**Objective:** Send automated SMS alerts to parents about absences, grades, and official summons.

#### Components & Routes:
- **Frontend Component:** `client/src/components/sms-broadcast-dialog.tsx`
- **Backend Routes:**
  - `server/routes/sms.ts` - Individual SMS sending
  - `server/routes/smsBroadcast.ts` - Bulk broadcast with credit tracking
- **Services:** 
  - `server/services/smsService.ts` - Twilio + gateway integration
  - `server/services/smsCreditsService.ts` - Credit management

#### API Endpoints:
```
GET /api/sms/credits
  - Get current SMS credits status
  - Returns: { creditsRemaining, subscriptionStatus, active }

GET /api/sms/broadcast/preview?template=...&recipients=N
  - Preview credit calculation
  - Returns: { preview, recipients, creditsPerMessage, totalCreditsNeeded }

POST /api/sms/broadcast
  - Send bulk SMS to parents
  - Payload: { type, messageTemplate, studentIds?, phoneNumbers?, variables? }
  - Returns: { success, sent, failed, total, creditsDeducted, creditsRemaining }

POST /api/sms/send
  - Send single SMS (existing endpoint)
  - Payload: { studentId, message, phone? }
```

#### Usage Example:
```tsx
import { SmsBroadcastDialog } from "@/components/sms-broadcast-dialog";

const students = [
  { id: "s1", name: "أحمد علي", phone: "213771234567" },
  { id: "s2", name: "فاطمة محمد", phone: "213771234568" },
];

export function NotificationsPage() {
  return (
    <div>
      <h1>إرسال الرسائل</h1>
      <SmsBroadcastDialog students={students} />
    </div>
  );
}
```

#### Key Features:
- ✅ Multiple SMS provider support (Twilio + custom gateways)
- ✅ Template rendering with {placeholder} support
- ✅ Credit system: 1 credit per SMS segment
- ✅ Arabic text optimization (70 chars/segment instead of 160)
- ✅ Multi-segment message handling (UDH overhead)
- ✅ SMS delivery logging to database
- ✅ Failed send credit refunding
- ✅ Broadcast to multiple parents simultaneously

#### Template Variables:
```javascript
// Available placeholders in message templates
{student_name}     // اسم الطالب
{student_id}       // رقم الطالب
{classe}          // الفصل
{date}            // التاريخ
{subject}         // المادة
{grade}           // الدرجة
{absence_hours}   // ساعات الغياب
{parent_name}     // اسم الولي
```

#### Example Templates:
```
// Absence Alert
"الطالب/ة {student_name} من {classe} غائب عن الدوام في {date}"

// Grade Alert
"الطالب/ة {student_name} حصل على {grade} في {subject}"

// High Absence Warning
"الطالب/ة {student_name} لديه {absence_hours} ساعات غياب"

// Summons
"الطالب/ة {student_name} مستدعى لمكتب الإدارة"
```

---

### 3. 🔲 QR Code Generator & Scanner

**Objective:** Generate QR codes for student identification and attendance logging.

#### Components & Routes:
- **Frontend Components:** `client/src/components/qr-scanner-dialog.tsx`
- **Backend Routes:**
  - `server/routes/qr.ts` - QR generation (existing)
  - `server/routes/qrScanner.ts` - QR scanning & attendance logging
- **Controllers:** `server/controllers/qr.ts`

#### API Endpoints:
```
GET /api/qr/student/:studentId?format=png|svg|json&size=256
  - Generate QR code for a student
  - Returns PNG data URL, SVG, or JSON payload (existing)

POST /api/qr/students/batch
  - Generate multiple QR codes (existing)

GET /api/qr/scan?sid=<studentId>&sig=<hmac>
  - Verify QR signature and log attendance
  - Returns: { success, duplicate, message, student }
  - Automatically creates attendance_logs entry

GET /api/qr/attendance-logs?hours=24&limit=100
  - Get recent attendance logs
  - Returns: { period, total, students[].scans[] }

POST /api/qr/quick-attendance
  - Manual attendance entry without QR
  - Payload: { studentId }
```

#### Usage Example:
```tsx
import { QrScannerDialog } from "@/components/qr-scanner-dialog";

export function AttendancePage() {
  return (
    <div>
      <h1>تسجيل الحضور</h1>
      <QrScannerDialog />
    </div>
  );
}
```

#### QR Code Structure:
```
URL Format: https://example.com/scan-qr?sid=<studentId>&sig=<hmac>

Payload (if format=json):
{
  "sid": "student123",
  "name": "أحمد علي",
  "niveau": "1AM",
  "classe": "1AM-أ",
  "annee": "2025-2026",
  "iat": 1705000000,
  "sig": "abc123def456"
}
```

#### Key Features:
- ✅ HMAC-SHA256 signature verification
- ✅ Real-time camera QR scanning (html5-qrcode)
- ✅ Duplicate detection (2-minute cooldown)
- ✅ Automatic attendance logging
- ✅ Recent scans display with timestamps
- ✅ Manual attendance entry fallback
- ✅ Multi-format QR output (PNG, SVG, JSON)

---

## 🗄️ Database Schema

### New/Updated Tables:

#### sms_logs
```sql
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  student_id VARCHAR,
  phone VARCHAR(30),
  message VARCHAR(1000),
  status ENUM('sent', 'failed', 'queued', 'no_phone'),
  channel ENUM('gateway', 'modem', 'socket'),
  gateway_ref VARCHAR(255),
  error_msg VARCHAR(500),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### school_subscriptions
```sql
CREATE TABLE school_subscriptions (
  id UUID PRIMARY KEY,
  school_id UUID UNIQUE NOT NULL,
  sms_credits_remaining INTEGER DEFAULT 100,
  subscription_status ENUM('pending', 'active', 'suspended'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### attendance_logs
```sql
CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  scanned_at TIMESTAMP DEFAULT NOW(),
  source VARCHAR(20) DEFAULT 'qr',
  sig VARCHAR(32)
);
```

#### ocr_uploads
```sql
CREATE TABLE ocr_uploads (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  type VARCHAR(20),
  engine VARCHAR(20),
  file_name VARCHAR(255),
  rows JSONB,
  row_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
# Frontend
npm install html5-qrcode qrcode tesseract.js sharp

# Backend
npm install sharp tesseract.js qrcode twilio
```

### 2. Environment Variables

```env
# Groq Vision API: each active subscriber adds their personal key
# from the Settings page; do not add GROQ_API_KEY to the server environment.

# Twilio (for SMS)
TWILIO_ACCOUNT_SID=your_twilio_sid
SMS_API_KEY=your_twilio_auth_token
SMS_SENDER_ID=your_twilio_phone

# Session Secret (for QR signatures)
SESSION_SECRET=your_session_secret

# Optional: School SMS Gateway
SMS_GATEWAY_URL=https://your-sms-gateway.com/send
SMS_GATEWAY_API_KEY=your_gateway_key
```

### 3. Database Migration

```bash
pnpm db:push
```

### 4. Register Routes

Routes are automatically registered in `server/routes/index.ts`:
- `ocrReviewRouter`
- `smsBroadcastRouter`
- `qrScannerRouter`

---

## 📝 TypeScript Utilities

### SMS Utils (`client/src/lib/sms-utils.ts`)

```typescript
import {
  calculateSmsCredits,
  renderTemplate,
  validatePhoneNumber,
  SMS_TEMPLATES,
} from "@/lib/sms-utils";

// Calculate credits needed
const credits = calculateSmsCredits("الطالب أحمد غائب");  // 1 credit

// Render template
const message = renderTemplate(
  "الطالب {student_name} حصل على {grade}",
  { student_name: "أحمد", grade: "18" }
);

// Validate phone
const { valid, normalized } = validatePhoneNumber("0771234567");
```

### QR Utils (`client/src/lib/qr-utils.ts`)

```typescript
import {
  buildQrPayload,
  buildQrUrl,
  verifyQrSignature,
  isQrExpired,
} from "@/lib/qr-utils";

// Build payload for student
const payload = buildQrPayload({
  id: "stu123",
  nomPrenom: "أحمد علي",
  niveau: "1AM",
  classe: "1AM-أ",
  annee: "2025-2026"
});

// Build scannable URL
const qrUrl = buildQrUrl({ id: "stu123" }, "https://example.com");

// Verify signature
const isValid = verifyQrSignature("stu123", "abc123def456");
```

---

## 🎨 Integration Examples

### Complete Grade Management Page

```tsx
import React from "react";
import { OcrReviewDialog } from "@/components/ocr-review-dialog";
import { SmsBroadcastDialog } from "@/components/sms-broadcast-dialog";
import { Button } from "@/components/ui/button";

export function GradeManagementPage() {
  const [students, setStudents] = React.useState([]);

  React.useEffect(() => {
    // Fetch students
    fetch("/api/students")
      .then(r => r.json())
      .then(data => setStudents(data));
  }, []);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">إدارة الدرجات والتنبيهات</h1>

      <div className="flex gap-4">
        <OcrReviewDialog />
        <SmsBroadcastDialog students={students} />
      </div>

      {/* Rest of page */}
    </div>
  );
}
```

### Complete Attendance Page

```tsx
import React from "react";
import { QrScannerDialog } from "@/components/qr-scanner-dialog";
import { Button } from "@/components/ui/button";

export function AttendancePage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold">تسجيل الحضور</h1>
      <QrScannerDialog />
    </div>
  );
}
```

---

## 🧪 Testing

### OCR Testing
```bash
# Test Groq Vision
curl -X POST http://localhost:5000/api/ocr/parse-grades \
  -F "image=@grade_sheet.jpg" \
  -H "Authorization: Bearer token"

# Test matching
curl -X POST http://localhost:5000/api/ocr/match-students \
  -H "Content-Type: application/json" \
  -d '{"names": ["أحمد علي", "فاطمة محمد"], "annee": "2025-2026"}'
```

### SMS Testing
```bash
# Check credits
curl http://localhost:5000/api/sms/credits

# Send broadcast
curl -X POST http://localhost:5000/api/sms/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "type": "absence_alert",
    "messageTemplate": "الطالب {student_name} غائب",
    "studentIds": ["stu1", "stu2"]
  }'
```

### QR Testing
```bash
# Generate QR for student
curl http://localhost:5000/api/qr/student/stu123?format=png

# Verify scan
curl "http://localhost:5000/api/qr/scan?sid=stu123&sig=abc123"

# Get attendance logs
curl http://localhost:5000/api/qr/attendance-logs?hours=24
```

---

## 📋 Checklist

- ✅ Schema tables created (SMS, QR, OCR, Subscriptions)
- ✅ OCR service with Groq Vision + Tesseract fallback
- ✅ SMS service with Twilio + gateway support
- ✅ Credit tracking system
- ✅ QR generation and scanning
- ✅ Attendance logging
- ✅ React UI components (OCR, SMS, QR)
- ✅ API routes and validation
- ✅ TypeScript utilities
- ✅ Arabic/French language support
- ✅ Error handling and logging
- ✅ Database audit trails (sms_logs, ocr_uploads, attendance_logs)

---

## 🔐 Security Notes

1. **QR Signatures:** All QR codes are HMAC-SHA256 signed to prevent forgery
2. **SMS Logging:** All SMS sent/failed attempts are logged with phone numbers
3. **Credit Deduction:** Credits are deducted atomically to prevent oversending
4. **Authentication:** All endpoints require user authentication except public QR scan
5. **Audit Trail:** All OCR, SMS, and attendance events logged for compliance

---

## 🐛 Troubleshooting

### OCR Not Working
- تأكد أن صاحب الاشتراك أضاف مفتاح Groq من صفحة الإعدادات
- Verify image quality and format (JPEG, PNG, WebP)
- Check Tesseract.js is installed

### SMS Not Sending
- Verify TWILIO_ACCOUNT_SID and SMS_API_KEY
- Check school has active subscription
- Confirm SMS credits remaining > 0
- Validate phone numbers format

### QR Not Scanning
- Ensure camera permissions granted in browser
- Check SESSION_SECRET is set
- Verify QR code format matches expected URL structure
- Test with known good QR code

---

## 📞 Support

For issues or questions, refer to the inline code comments in:
- `server/services/ocrService.ts`
- `server/services/smsService.ts`
- `server/routes/qrScanner.ts`
- Component files for UI usage

---

**Version:** 1.0.0  
**Last Updated:** 2026-08-18  
**Language:** TypeScript + React  
**Database:** PostgreSQL + Drizzle ORM  
