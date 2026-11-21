import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen, School, Users, GraduationCap, CalendarOff,
  Calendar, Shield, MessageCircle, CreditCard, UserCheck,
  BarChart3, ClipboardList, Printer, ScanLine, Activity,
  Compass, Settings, UserCog,
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
    title: "2. التلاميذ والاستيراد",
    gradient: "from-blue-500 to-indigo-600",
    steps: [
      "من صفحة «التلاميذ»: إضافة يدوية، بحث وفلترة حسب المستوى/القسم/الجنس/الحالة/النتيجة/نظام التمدرس (داخلي، نصف داخلي، خارجي).",
      "من «الاستيراد» ارفع ملف Excel/CSV — الأعمدة: الاسم، المستوى، القسم، الجنس، ورقم الترتيب Raqm.",
      "استورد الدرجات والغيابات من ملفات Excel بنفس الطريقة، وادعم ملفات Lycee (Eleve.xls) وقوائم الغيابات الرسمية.",
    ],
  },
  {
    icon: GraduationCap,
    title: "3. الدرجات والنتائج",
    gradient: "from-violet-500 to-purple-600",
    steps: [
      "أدخل نقاط الفروض والاختبارات من صفحة «النتائج» أو عبر الاستيراد أو OCR.",
      "عند رصد نقاط من نوع فرض أو اختبار، يصل تنبيه فوري لولي الأمر.",
      "«المواد» و«نتائج الامتحانات» و«مجالس التوجيه» تعرض المجاميع والمعدلات لكل تلميذ وقسم.",
      "«BEM» (متوسط) و«نتائج البكالوريا» (ثانوي) تحسب معدلات الشهادات النهائية.",
    ],
  },
  {
    icon: CalendarOff,
    title: "4. الغيابات",
    gradient: "from-rose-500 to-red-600",
    steps: [
      "سجّل الغيابات من صفحة «الغيابات» بالساعات المبررة وغير المبررة لكل تلميذ.",
      "عند تسجيل غياب يصل تنبيه فوري لولي الأمر عبر البوابة والإشعارات.",
      "صدّر «قائمة الغيابات الشهرية» بصيغة Excel المطابقة لنموذج الوزارة.",
    ],
  },
  {
    icon: Calendar,
    title: "5. الجداول الزمنية والتقييمات",
    gradient: "from-teal-500 to-cyan-600",
    steps: [
      "من «FET & RGF» ارفع ملف FET/XML — كل الحصص المستوردة تصبح المصدر الأساسي للجداول.",
      "«الجداول»: استعلام عن جدول أستاذ/قسم/يوم، و«موازن الأقسام» لتوزيع متوازن.",
      "«التقييمات والامتحانات» لجدولة الفروض والاختبارات مع تفادي التعارض مع حصص الأساتذة.",
    ],
  },
  {
    icon: Shield,
    title: "6. الاختبارات والحراسة والتفويج",
    gradient: "from-indigo-500 to-blue-700",
    steps: [
      "من «تنظيم الاختبارات»: أنشئ جلسات الاختبارات وقاعات الامتحانات بسعتها.",
      "«جدول الحراسة»: توزيع تلقائي وعادل يتجنب حصص الأساتذة ويوازن العبء ويمنع التعارض الزمني.",
      "«تفويج التلاميذ»: توزيع آلي على القاعات مع منع تجاور تلاميذ نفس القسم وتوليد الأرقام التنظيمية.",
      "من «تقارير الاختبارات» صدّر القوائم الرسمية Excel.",
    ],
  },
  {
    icon: ScanLine,
    title: "7. OCR — مسح الدرجات والغيابات",
    gradient: "from-fuchsia-500 to-purple-700",
    steps: [
      "من «مسح OCR» ارفع صورة كشف الدرجات أو الغيابات أو سجل الغياب اليومي — تُقرأ تلقائياً بالذكاء الاصطناعي.",
      "راجع الصفوف المصححة، طابق الأسماء مع التلاميذ، ثم «حفظ في قاعدة البيانات» أو «تصدير Excel».",
      "لدرجات: اختر نموذج «حجز النقاط» الرسمي (متوسطة/ثانوية) مع عمود التقييم — يُملأ تلقائياً مع التقدير البيداغوجي.",
      "تصدير الغيابات والسجل اليومي متاح أيضاً بصيغ Excel جاهزة.",
    ],
  },
  {
    icon: Activity,
    title: "8. المركز البيداغوجي",
    gradient: "from-emerald-500 to-green-700",
    steps: [
      "«ملاحظات التلاميذ»: أدخل معدلات المواد ونسبة الحضور والسلوك لتوليد ملاحظات تربوية جاهزة لكشف النقاط.",
      "«صانع الاختبارات»: ولّد ورقة اختبار كاملة بالذكاء الاصطناعي (أسئلة + تصحيح + سلم تنقيط) لأي مستوى ومادة.",
      "«متابعة التعثر»: تنبيهات آلية للتلاميذ الذين تراجعت معدلاتهم أو توالت غياباتهم — مع إشعار ولي الأمر.",
    ],
  },
  {
    icon: ClipboardList,
    title: "9. الإحصاء الشامل (Census)",
    gradient: "from-emerald-500 to-teal-700",
    steps: [
      "صفحة «الإحصاء» تولّد الجداول الرسمية: المجاميع حسب المستوى، الجنس، العمر، الوضعية، النتيجة، وشعب الثانوي.",
      "الأسماء لا تظهر إلا داخل نافذة منبثقة عند الحاجة للتحقق أو الطباعة.",
      "صدّر Excel أو نسخة جاهزة للطباعة PDF لكل صفحة أو للمؤسسة كاملة.",
    ],
  },
  {
    icon: BarChart3,
    title: "10. التحليلات والتقارير",
    gradient: "from-cyan-500 to-blue-600",
    steps: [
      "لوحة التحكم تعرض: الإجمالي، الذكور/الإناث، نسبة النجاح، المعدل العام، ساعات الغياب، ومخططات المستويات.",
      "«التحليلات»: مقارنة بين سنتين، تفصيل حسب القسم، متوسط الدرجة حسب الجنس، ونسبة الإعادة.",
      "«التقارير» و«RGF» تولّد تقارير رسمية شاملة بصيغة Excel وHTML جاهزة للمديرية.",
      "«الأرشيف» يحفظ البيانات والنتائج سنوياً للاسترجاع لاحقاً.",
    ],
  },
  {
    icon: Compass,
    title: "11. التوجيه والنتائج النهائية",
    gradient: "from-amber-500 to-orange-700",
    steps: [
      "«متابعة التوجيه»: تتبع مراحل توجيه الأقسام (الأول، الرغبات، الثاني، النهائي) حسب المرحلة.",
      "«دورة التوجيه» (ثانوي): سير كامل لتوجيه البكالوريا.",
      "«نهاية السنة»: قوائم الناجحين، الراسبين، المستدركين، وقوائم التوجيهات والنتائج النهائية.",
    ],
  },
  {
    icon: MessageCircle,
    title: "12. واتساب وأولياء الأمور",
    gradient: "from-green-500 to-emerald-600",
    steps: [
      "من «واتساب وأولياء الأمور» أرسل رسائل يدوية أو دعوات جماعية للأولياء غير المسجلين.",
      "الدعوة تتضمن رابط تسجيل واشتراك ولي الأمر (500 دج/سنة) عبر رمز انضمام المؤسسة.",
      "يتطلب تفعيل WhatsApp ضبط مفاتيح API في إعدادات الخادم — بدونها يعمل البديل SMS تلقائياً.",
    ],
  },
  {
    icon: UserCog,
    title: "13. الأعضاء والصلاحيات",
    gradient: "from-sky-500 to-blue-700",
    steps: [
      "من «الأعضاء» أضف أساتذة وأولياء أمور بدور وصلاحيات محددة (استيراد، درجات، غيابات، تصدير...).",
      "ولي الأمر يرى فقط أبنائه: نقاطهم، جداولهم الزمنية، أوقات الانتهاء المتوقعة، والتنبيهات.",
      "كل عملية حساسة تُسجّل في «سجل التدقيق» لمتابعة من فعل ماذا ومتى.",
    ],
  },
  {
    icon: CreditCard,
    title: "14. الاشتراكات والدفع",
    gradient: "from-amber-500 to-orange-600",
    steps: [
      "الأسعار: ولي الأمر 500 دج/سنة، الأستاذ/الموظف 1000 دج/سنة (مع شهر تجريبي)، المؤسسة 2000 دج أساسية أو 3000 دج برو.",
      "الدفع عبر Chargily بالبطاقة، أو عبر CCP: أدخل المبلغ وحمّل صورة الوصل + وسيلة تواصل — يُفعَّل الاشتراك بعد مراجعة الإدارة.",
      "من «الاشتراك» تابع نوع خطتك والحالة والأيام المتبقية وتاريخ الانتهاء.",
    ],
  },
  {
    icon: Settings,
    title: "15. حسابي والإعدادات",
    gradient: "from-slate-500 to-slate-700",
    steps: [
      "من «الإعدادات»: عدّل اسم المستخدم وكلمة المرور، واضبط تفضيلات الإشعارات واللغة.",
      "«معلومات الحساب» تعرض نوع الاشتراك والحالة والأيام المتبقية.",
      "هذا الدليل متاح دائماً من الزر العائم في كل الصفحات.",
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
            دليل الاستخدام — نظام التطبيق كامل
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">
            شرح خطوة بخطوة لكل أقسام منصة «دليل الرقمنة» — متاح دائماً من الزر العائم
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
