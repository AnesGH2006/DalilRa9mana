import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen, School, Users, FileSpreadsheet, GraduationCap, CalendarOff,
  Calendar, Shield, FileText, MessageCircle, CreditCard, UserCheck,
  BarChart3, ClipboardList, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

interface GuideSection {
  icon: React.ElementType;
  title: string;
  gradient: string;
  steps: string[];
}

const SECTIONS: GuideSection[] = [
  {
    icon: School,
    title: "1. إعداد المؤسسة",
    gradient: "from-emerald-500 to-teal-600",
    steps: [
      "من لوحة التحكم اضغط زر «إعدادات المؤسسة» أو البطاقة الخاصة بها.",
      "أدخل: اسم المؤسسة، الولاية، البلدية، السنة الدراسية، المدير، الهاتف، وهاتف الدعم/واتساب.",
      "اضغط «حفظ» — تُنشأ المؤسسة تلقائياً ويُولَّد رمز انضمام (Join Code) لدعوة الأولياء والأساتذة.",
    ],
  },
  {
    icon: Users,
    title: "2. إضافة التلاميذ والاستيراد",
    gradient: "from-blue-500 to-indigo-600",
    steps: [
      "من صفحة «التلاميذ» يمكنك الإضافة اليدوية أو البحث والفلترة حسب المستوى/القسم/الجنس/الحالة/النتيجة.",
      "من «الاستيراد» ارفع ملف Excel/CSV بقائمة التلاميذ — الأعمدة المطلوبة: الاسم، المستوى، القسم، الجنس.",
      "يمكن استيراد الدرجات والغيابات من ملفات Excel بنفس الطريقة.",
    ],
  },
  {
    icon: GraduationCap,
    title: "3. الدرجات والنتائج",
    gradient: "from-violet-500 to-purple-600",
    steps: [
      "أدخل نقاط الفروض والاختبارات من صفحة النتائج أو عبر الاستيراد.",
      "عند رصد نقاط من نوع فرض أو اختبار، يصل تنبيه فوري لولي الأمر عبر واتساب/SMS.",
      "صفحة «النتائج» و«الموضوعات» تعرضون المجاميع والمعدلات لكل تلميذ وقسم.",
    ],
  },
  {
    icon: CalendarOff,
    title: "4. الغيابات",
    gradient: "from-rose-500 to-red-600",
    steps: [
      "سجّل الغيابات من صفحة «الغيابات» بالساعات المبررة وغير المبررة.",
      "عند تسجيل غياب يصل تنبيه فوري لولي الأمر.",
      "صدّر «قائمة الغيابات الشهرية» بصيغة Excel المطابقة لنموذج الوزارة.",
    ],
  },
  {
    icon: Calendar,
    title: "5. الجداول الزمنية (FET)",
    gradient: "from-teal-500 to-cyan-600",
    steps: [
      "من «FET & RGF» ارفع ملف FET/ XML الخاص ببرنامج التوقيت.",
      "اختر «معاينة» أولاً للتأكد من الأساتذة والأقسام والحصص ثم «استيراد».",
      "كل الحصص المستوردة تصبح المصدر الأساسي للجداول وتُستخدم لتفادي التعارض عند جدولة الاختبارات.",
      "من صفحة «الجداول» يمكنك الاستعلام عن جدول أستاذ/قسم/يوم.",
    ],
  },
  {
    icon: Shield,
    title: "6. الاختبارات والحراسة والتفويج",
    gradient: "from-indigo-500 to-blue-700",
    steps: [
      "من «تنظيم الاختبارات»: أنشئ جلسات الاختبارات وقاعات الامتحانات بسعتها.",
      "«جدول الحراسة»: التوزيع تلقائي وعادل — يتجنب حصص الأساتذة ويوازن عبء العمل ويمنع التعارض الزمني.",
      "«تفويج التلاميذ»: توزيع آلي على القاعات مع خيار منع تجاور تلاميذ نفس القسم، وتوليد الأرقام التنظيمية.",
      "من «تقارير الاختبارات» صدّر القوائم الرسمية Excel.",
    ],
  },
  {
    icon: ClipboardList,
    title: "7. الإحصاء الشامل (Census)",
    gradient: "from-emerald-500 to-green-700",
    steps: [
      "صفحة «الإحصاء» تولّد الجداول الرسمية 01-10: المجاميع حسب المستوى، الجنس، العمر، الوضعية، النتيجة، وشعب الثانوي.",
      "الأسماء لا تظهر إلا داخل نافذة منبثقة عند الحاجة للتحقق أو الطباعة.",
      "صدّر Excel أو نسخة جاهزة للطباعة PDF لكل صفحة أو للمؤسسة كاملة.",
    ],
  },
  {
    icon: BarChart3,
    title: "8. التحليلات والتقارير",
    gradient: "from-cyan-500 to-blue-600",
    steps: [
      "لوحة التحكم تعرض: الإجمالي، الذكور/الإناث، نسبة النجاح، المعدل العام، ساعات الغياب، ومخططات المستويات والمواد.",
      "صفحة «التحليلات»: مقارنة بين سنتين، تفصيل حسب القسم، متوسط الدرجة حسب الجنس، ونسبة الإعادة.",
      "صفحة «التقارير»: تقارير رسمية شاملة قابلة للطباعة والتصدير.",
      "«RGF» يولّد التقرير العام لسير المؤسسة بصيغة Excel و HTML جاهزة للمديرية.",
    ],
  },
  {
    icon: MessageCircle,
    title: "9. واتساب وأولياء الأمور",
    gradient: "from-green-500 to-emerald-600",
    steps: [
      "من «واتساب وأولياء الأمور» أرسل رسائل يدوية أو دعوات جماعية للأولياء غير المسجلين.",
      "الدعوة تتضمن رابط تسجيل واشتراك ولي الأمر (500 دج/سنة).",
      "يتطلب تفعيل WhatsApp ضبط مفاتيح API في إعدادات الخادم — بدونها يعمل البديل SMS تلقائياً.",
    ],
  },
  {
    icon: CreditCard,
    title: "10. الاشتراكات والأعضاء",
    gradient: "from-amber-500 to-orange-600",
    steps: [
      "الأسعار: ولي الأمر 500 دج/سنة، الأستاذ/الموظف 1000 دج/سنة (مع شهر تجريبي)، المؤسسة 1500 دج أساسية أو 3000 دج برو.",
      "من «الأعضاء» أضف أساتذة وأولياء أمور بصلاحيات محددة.",
      "من «الاشتراك» تابع حالة الخطة وتاريخ الانتهاء.",
    ],
  },
];

const TIPS = [
  "اختر السنة الدراسية من القائمة العلوية في لوحة التحكم — كل الإحصائيات تتبع السنة المختارة.",
  "نسبة النجاح تُحسب على المقيّمين فقط: ناجح + راسب + مستدرك.",
  "للأولوية في الأداء: استورد جدول FET أولاً، ثم التلاميذ، ثم الدرجات.",
];

export default function GuidePage() {
  return (
    <motion.div
      variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-6 max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center shadow-lg shadow-blue-500/30">
              <BookOpen className="w-4.5 h-4.5 text-white" />
            </span>
            دليل الاستخدام
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">
            شرح خطوة بخطوة لكل أقسام منصة «دليل الرقمنة»
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 no-print" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5" />
          طباعة الدليل
        </Button>
      </div>

      {/* Quick tips */}
      <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2">نصائح سريعة</p>
          <ul className="space-y-1.5">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="grid gap-5 md:grid-cols-2">
        {SECTIONS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4 }}
          >
            <Card className="border-0 shadow-md h-full overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className={`inline-flex w-8 h-8 rounded-lg bg-gradient-to-br ${s.gradient} items-center justify-center shadow`}>
                    <s.icon className="w-4 h-4 text-white" />
                  </span>
                  {s.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {s.steps.map((step, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                      <span className="mt-0.5 inline-flex w-5 h-5 rounded-full bg-muted text-[10px] font-bold items-center justify-center shrink-0 text-foreground">
                        {j + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Footer note */}
      <Card className="border-dashed border-2">
        <CardContent className="py-6 text-center">
          <UserCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            للاستفسار أو الدعم، تواصل مع مدير المؤسسة أو راجع قسم «الاشتراك» لخطط الأسعار.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
