import { Switch, Route, Link, useLocation } from "wouter";
import { ThemeProvider, useTheme } from "@/contexts/theme-provider";
import { LanguageProvider, useLanguage } from "@/contexts/language-provider";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Moon, Sun, LogOut, BookOpen, Menu, X,
  ClipboardList, GraduationCap, Compass, Database, Settings,
  ChevronDown, FileSpreadsheet, BarChart3, UserX, List, CheckSquare,
  User, BarChart2, CalendarOff, UserCheck, RefreshCw, AlertCircle,
  TrendingUp, Star, CreditCard, Upload, FileText, Archive,
  CircleArrowRight, MessageSquare, CircleDot, Trophy, FileBarChart, Bot, Download, Send,
  ScanLine, Shield, Calendar, Shuffle,
} from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { QuickImportDialog } from "@/components/quick-import";
import AiChatWidget from "@/components/ai-chat-widget";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Dashboard from "@/pages/dashboard";
import Students from "@/pages/students";
import Results from "@/pages/results";
import SubjectsPage from "@/pages/subjects";
import YearEnd from "@/pages/yearend";
import YearEndPassed from "@/pages/yearend-passed";
import YearEndFailed from "@/pages/yearend-failed";
import YearEndMustarrak from "@/pages/yearend-mustarrak";
import YearEndRecovery from "@/pages/yearend-recovery";
import YearEndGuides from "@/pages/yearend-guides";
import YearEndFinal from "@/pages/yearend-final";
import ImportPage from "@/pages/import";
import ArchivePage from "@/pages/archive";
import SettingsPage from "@/pages/settings";
import BEMPage from "@/pages/bem";
import ExamResultsPage from "@/pages/exam-results";
import AbsencesPage from "@/pages/absences-page";
import RepeatersPage from "@/pages/repeaters";
import OrientationResultsPage from "@/pages/orientation-results";
import PreOrientTrackingPage from "@/pages/preorient-tracking";
import PreOrientFirstPage from "@/pages/preorient-first";
import PreOrientSecondPage from "@/pages/preorient-second";
import PreOrientFinalPage from "@/pages/preorient-final";
import PreOrientReportsPage from "@/pages/preorient-reports";
import OrientationWishesPage from "@/pages/orientation-wishes";
import OrientationWorkflowPage from "@/pages/orientation-workflow";
import TransferResultsPage from "@/pages/transfer-results";
import CouncilsPage from "@/pages/councils";
import AnalyticsPage from "@/pages/analytics";
import ReportsPage from "@/pages/reports";
import SubscriptionPage from "@/pages/subscription";
import AdminPage from "@/pages/admin";
import AssistantPage from "@/pages/assistant";
import PedagogyCenterPage from "@/pages/pedagogy-center";
import ParentAssistantPage from "@/pages/parent-assistant";
import AgentSetupPage from "@/pages/agent-setup";
import PaywallScreen from "@/pages/paywall";
import NotFound from "@/pages/not-found";
import UploadGradesOcrPage from "@/pages/upload-grades-ocr";
import MembersPage from "@/pages/members";
import MyChildPage from "@/pages/my-child";
import ParentRegisterPage from "@/pages/parent-register";
import SmsPage from "@/pages/sms";
import PaymentDemoPage from "@/pages/payment-demo";
import AuditLogPage from "@/pages/audit-log";
import ClassBalancerPage from "@/pages/class-balancer";
import TimetablePage from "@/pages/timetable";
import ExcelInjectionPage from "@/pages/excel-injection";
import {
  DEFAULT_STAFF_PERMISSIONS,
  appPathForPermission,
  permissionForAppPath,
  type StaffPermission,
} from "@shared/member-permissions";
import PaymentReturnPage from "@/pages/Payment-return";
// ── Types ─────────────────────────────────────────────────────────────────────
interface NavItemDef {
  href: string;
  icon: React.ElementType;
  labelKey: string;
  badge?: string;
  accent?: string;
  label?: string;
}
interface SectionDef {
  id: string;
  icon: React.ElementType;
  labelKey: string;
  color: string;
  gradient: string;
  items: NavItemDef[];
}

// ── Sidebar sections ──────────────────────────────────────────────────────────
const SECTIONS: SectionDef[] = [
  {
    id: "students", icon: Users, labelKey: "nav.students_section",
    color: "text-blue-400", gradient: "from-blue-500 to-blue-700",
    items: [
      { href: "/",         icon: LayoutDashboard, labelKey: "nav.dashboard" },
      { href: "/students", icon: List,            labelKey: "nav.students"  },
      { href: "/sms", icon: MessageSquare, labelKey: "nav.sms", label: "الرسائل SMS" },
    ],
  },
  {
    id: "results", icon: ClipboardList, labelKey: "nav.results_section",
    color: "text-violet-400", gradient: "from-violet-500 to-purple-700",
    items: [
      { href: "/results",              icon: ClipboardList,  labelKey: "nav.results"           },
      { href: "/subjects",             icon: BarChart3,      labelKey: "nav.subjects"          },
      { href: "/exam-results",         icon: BarChart2,      labelKey: "nav.exam_results"      },
      { href: "/absences",             icon: CalendarOff,    labelKey: "nav.absences"          },
      { href: "/repeaters",            icon: UserCheck,      labelKey: "nav.repeaters"         },
      { href: "/failed",               icon: AlertCircle,    labelKey: "nav.failed"            },
      { href: "/orientation-results",  icon: Compass,        labelKey: "nav.orient_results"   },
      { href: "/transfer-results",     icon: RefreshCw,      labelKey: "nav.transfer_results" },
      { href: "/councils",             icon: ClipboardList,  labelKey: "nav.councils"         },
      { href: "/bem",                  icon: GraduationCap,  labelKey: "nav.bem"              },
    ],
  },
  {
    id: "yearend", icon: GraduationCap, labelKey: "nav.yearend_section",
    color: "text-emerald-400", gradient: "from-emerald-500 to-green-700",
    items: [
      { href: "/yearend",              icon: CheckSquare,      labelKey: "nav.yearend"          },
      { href: "/yearend/passed",       icon: Users,            labelKey: "nav.passed_list"      },
      { href: "/yearend/failed",       icon: AlertCircle,      labelKey: "nav.failed_list"      },
      { href: "/yearend/mustarrak",    icon: RefreshCw,        labelKey: "nav.mustarrak_list"   },
      { href: "/yearend/recovery",     icon: BarChart2,        labelKey: "nav.recovery_results" },
      { href: "/yearend/guides",       icon: Compass,          labelKey: "nav.guides_list"      },
      { href: "/yearend/final",        icon: ClipboardList,    labelKey: "nav.final_list"       },
    ],
  },
  {
    id: "analytics", icon: TrendingUp, labelKey: "nav.analytics_section",
    color: "text-cyan-400", gradient: "from-cyan-500 to-blue-600",
    items: [
      { href: "/analytics", icon: BarChart3, labelKey: "nav.analytics", accent: "text-cyan-400" },
      { href: "/reports",   icon: FileText,  labelKey: "nav.reports",   accent: "text-cyan-400" },
    ],
  },
  {
    id: "orient", icon: Compass, labelKey: "nav.orient_section",
    color: "text-amber-400", gradient: "from-amber-500 to-orange-700",
    items: [
      { href: "/preorient/tracking", icon: ClipboardList, labelKey: "nav.orient_tracking" },
      { href: "/preorient/first",    icon: CircleArrowRight, labelKey: "nav.orient_first"    },
      { href: "/preorient/wishes",   icon: ClipboardList, labelKey: "nav.orient_wishes"   },
      { href: "/preorient/second",   icon: CircleDot,    labelKey: "nav.orient_second"   },
      { href: "/preorient/final",    icon: Trophy,       labelKey: "nav.orient_final"    },
      { href: "/preorient/reports",  icon: FileBarChart, labelKey: "nav.orient_reports"  },
      { href: "/orientation",       icon: Send,         labelKey: "nav.orient_final", label: "دورة التوجيه" },
    ],
  },
  {
    id: "planning", icon: Calendar, labelKey: "nav.planning_section",
    color: "text-teal-400", gradient: "from-teal-500 to-cyan-700",
    items: [
      { href: "/class-balancer", icon: Shuffle,  labelKey: "nav.class_balancer" },
      { href: "/timetable",      icon: Calendar, labelKey: "nav.timetable"      },
    ],
  },
  {
    id: "assistant", icon: Bot, labelKey: "nav.assistant_section",
    color: "text-fuchsia-400", gradient: "from-fuchsia-500 to-pink-700",
    items: [
      { href: "/assistant", icon: Bot, labelKey: "nav.assistant" },
      { href: "/pedagogy-center", icon: ClipboardList, labelKey: "nav.pedagogy" },
    ],
  },
  {
    id: "data", icon: Database, labelKey: "nav.data_section",
    color: "text-sky-400", gradient: "from-sky-500 to-cyan-700",
    items: [
      { href: "/import",            icon: FileSpreadsheet, labelKey: "nav.import"       },
      { href: "/excel-injection",   icon: FileSpreadsheet, labelKey: "nav.excel_injection" },
      { href: "/upload-grades-ocr", icon: ScanLine,        labelKey: "nav.ocr_upload"  },
      { href: "/archive",           icon: Archive,          labelKey: "nav.archive"     },
      { href: "/agent",    icon: Bot,              labelKey: "nav.agent"    },
    ],
  },
  {
    id: "more", icon: Settings, labelKey: "nav.more_section",
    color: "text-slate-400", gradient: "from-slate-500 to-slate-700",
    items: [
      { href: "/settings",      icon: Settings,    labelKey: "nav.settings"     },
      { href: "/account",       icon: User,        labelKey: "nav.account"      },
      { href: "/subscription",  icon: CreditCard,  labelKey: "nav.subscription", badge: "PRO" },
      { href: "/members",       icon: Users,       labelKey: "nav.members"      },
      { href: "/audit-log",     icon: Shield,      labelKey: "nav.audit_log"    },
      { href: "/admin",         icon: Star,        labelKey: "nav.admin"        },
    ],
  },
];

// Nav sections shown to PARENT sub-accounts (read-only child view)
const PARENT_SECTIONS: SectionDef[] = [
  {
    id: "child", icon: User, labelKey: "nav.my_child",
    color: "text-emerald-400", gradient: "from-emerald-500 to-green-700",
    items: [
      { href: "/my-child", icon: GraduationCap, labelKey: "nav.my_child" },
      { href: "/parent-assistant", icon: Bot, labelKey: "nav.parent_assistant" },
    ],
  },
];

/** Choose the nav sections to display based on the logged-in user's role. */
function getNavSections(user: import("@/hooks/use-auth").AuthUser | null): SectionDef[] {
  const role = user?.memberContext?.role;
  if (role === "parent")  return PARENT_SECTIONS;
  const isStandaloneStaffPlan = user?.subscriptionPlan === "staff"
    && user.subscriptionStatus === "active"
    && !user.memberContext
    && user.role !== "admin";
  if (isStandaloneStaffPlan) {
    const permissions = new Set<StaffPermission>(DEFAULT_STAFF_PERMISSIONS.teacher.filter(permission => permission !== "dashboard"));
    const allowedNonPermissionPaths = new Set(["/settings", "/account", "/subscription"]);
    return SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => {
        const permission = permissionForAppPath(item.href);
        return permission
          ? permissions.has(permission)
          : allowedNonPermissionPaths.has(item.href);
      }),
    })).filter(section => section.items.length > 0);
  }
  if (role === "teacher" || role === "supervisor" || role === "counselor") {
    const permissions = user?.memberContext?.permissions ?? [];
    const allowedNonPermissionPaths = new Set(["/settings", "/account", "/subscription"]);
    let sections = SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => {
        const permission = permissionForAppPath(item.href);
        return permission
          ? permissions.includes(permission)
          : allowedNonPermissionPaths.has(item.href);
      }),
    })).filter(section => section.items.length > 0);

    if (role !== "parent" && user?.memberContext?.schoolSubscriptionPlan === "free") {
      const freePaths = new Set(["/", "/results", "/subjects"]);
      sections = sections.map(section => ({
        ...section,
        items: section.items.filter(item => freePaths.has(item.href)),
      })).filter(section => section.items.length > 0);
    }
    return sections;
  }
  if (user?.subscriptionPlan === "free" && user.subscriptionStatus === "active" && user.role !== "admin") {
    const freePaths = new Set(["/", "/students", "/results", "/subjects", "/import", "/settings", "/account", "/subscription"]);
    return SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => freePaths.has(item.href)),
    })).filter(section => section.items.length > 0);
  }
  return SECTIONS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isActive(href: string, loc: string): boolean {
  if (href === "/") return loc === "/";
  return loc === href || loc.startsWith(href + "/");
}
function sectionHasActive(section: SectionDef, loc: string): boolean {
  return section.items.some(item => isActive(item.href, loc));
}

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ item, loc, onClick }: { item: NavItemDef; loc: string; onClick?: () => void }) {
  const { t } = useLanguage();
  const active = isActive(item.href, loc);
  return (
    <Link href={item.href} onClick={onClick}>
      <motion.div
        className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg cursor-pointer relative group
          ${active ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
        whileHover={{ x: active ? 0 : 3, backgroundColor: active ? undefined : "rgba(255,255,255,0.06)" }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
      >
        {active && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-gradient-to-r from-white/[0.13] to-white/[0.07]"
            layoutId="activeNavItem"
            transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)" }}
          />
        )}
        {active && (
          <motion.div
            className="absolute start-0 inset-y-[5px] w-[3px] bg-gradient-to-b from-blue-300 to-indigo-400 rounded-full"
            layoutId="activeNavBar"
            transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
            style={{ boxShadow: "0 0 8px 1px rgba(99,149,255,0.6)" }}
          />
        )}
        <item.icon className={`w-3.5 h-3.5 shrink-0 relative z-10 transition-colors duration-150 ${active ? "text-blue-200" : item.accent || "text-slate-500 group-hover:text-slate-300"}`} />
        <span className="text-[12px] relative z-10 flex-1 transition-colors duration-150 leading-none">{t(item.labelKey)}</span>
        {item.badge && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold relative z-10 ${
            item.badge === "PRO"
              ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm shadow-violet-500/30"
              : "bg-amber-500/20 text-amber-400"
          }`}>
            {item.badge}
          </span>
        )}
      </motion.div>
    </Link>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────
function SidebarSection({ section, loc, onItemClick }: {
  section: SectionDef; loc: string; onItemClick?: () => void;
}) {
  const { t } = useLanguage();
  const hasActive = sectionHasActive(section, loc);
  const [open, setOpen] = useState(hasActive);
  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);

  return (
    <div className="space-y-0.5">
      <motion.button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-start group"
        whileHover={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
      >
        <section.icon className={`w-3 h-3 shrink-0 transition-colors duration-150 ${hasActive ? section.color : "text-slate-600 group-hover:text-slate-400"}`} />
        <span className={`text-[10px] font-bold uppercase tracking-[0.08em] flex-1 transition-colors duration-150 ${hasActive ? "text-slate-300" : "text-slate-600 group-hover:text-slate-400"}`}>
          {t(section.labelKey)}
        </span>
        <motion.div
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <ChevronDown className="w-2.5 h-2.5 text-slate-700" />
        </motion.div>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.7 }}
            className="overflow-hidden ps-2 space-y-0.5"
          >
            {section.items.map((item, i) => (
              <motion.div key={item.href}
                initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 340, damping: 26, delay: i * 0.02 }}>
                <NavItem item={item} loc={loc} onClick={onItemClick} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Mobile Sidebar Content (drawer) ──────────────────────────────────────────
function MobileSidebarContent({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [loc] = useLocation();
  const [importOpen, setImportOpen] = useState(false);
  const isParent = user?.memberContext?.role === "parent";

  return (
    <div className="flex flex-col h-full sidebar-mesh text-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"
            style={{ boxShadow: "0 0 12px 2px rgba(79,120,255,0.4)" }}>
            <BookOpen className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-extrabold text-[13px] bg-gradient-to-r from-blue-300 via-indigo-200 to-sky-300 bg-clip-text text-transparent">
            {t("appName")}
          </span>
        </div>
        <motion.button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors" whileTap={{ scale: 0.9 }}>
          <X className="w-4 h-4" />
        </motion.button>
      </div>
      {!isParent && (
        <div className="px-3 py-2 border-b border-white/[0.06]">
          <Button size="sm" onClick={() => { setImportOpen(true); onClose(); }}
            className="w-full gap-1.5 h-8 text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white border-0">
            <Upload className="w-3.5 h-3.5" />
            استيراد
          </Button>
        </div>
      )}
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2.5 space-y-px scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {getNavSections(user).map((section, i) => (
          <motion.div key={section.id}
            initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}>
            <SidebarSection section={section} loc={loc} onItemClick={onClose} />
          </motion.div>
        ))}
      </nav>
      <PwaInstallButton />
      {/* WhatsApp Support Button */}
      <WhatsAppSupportButton />
      {!isParent && (
        <div className="mx-2 mb-2 rounded-xl overflow-hidden" style={{ boxShadow: "0 4px 20px rgba(109,40,217,0.30)" }}>
          <Link href="/subscription" onClick={onClose}>
            <motion.div
              className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 p-3 cursor-pointer relative overflow-hidden"
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            >
              <div className="absolute -top-6 -end-6 w-20 h-20 rounded-full bg-white/10 blur-2xl" />
              <div className="flex items-center gap-2.5 relative">
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <Star className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                </div>
                <div>
                  <p className="text-white text-[11px] font-bold leading-tight">{t("sub.upgrade")} → Pro</p>
                  <p className="text-white/55 text-[9px] mt-0.5">{t("sub.p2")}</p>
                </div>
              </div>
            </motion.div>
          </Link>
        </div>
      )}
      {/* User footer */}
      <div className="px-2 pb-3 pt-2 border-t border-white/[0.06] shrink-0">
        {user && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg bg-white/[0.04]">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} className="w-6 h-6 rounded-full ring-1 ring-white/20" alt="" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold">
                {(user.firstName?.[0] || user.email?.[0] || "?").toUpperCase()}
              </div>
            )}
            <p className="text-[11px] text-slate-400 truncate flex-1">
              {user.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user.email}
            </p>
          </div>
        )}
        <motion.button onClick={() => { logout(); onClose(); }} whileTap={{ scale: 0.97 }}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors text-[12px]">
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {t("nav.logout")}
        </motion.button>
      </div>
      <QuickImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

// ── WhatsApp Technical Support Button (sidebar) ──────────────────────────────
const WA_ICON = (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

function WhatsAppSupportButton() {
  const [phone, setPhone] = useState<string | null>(null);

  // Fetch support phone from school info once
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/school`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.supportPhone) setPhone(data.supportPhone);
      })
      .catch(() => {});
  }, []);

  // Don't show the button if no phone is configured
  if (!phone) return null;

  const message = encodeURIComponent("مرحباً، أحتاج إلى دعم تقني لمنصة رفيق الرقمنة 🎓");
  const href = `https://wa.me/${phone.replace(/\D/g, "")}?text=${message}`;

  return (
    <motion.div
      className="mx-2 mb-2"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
    >
      <motion.a
        href={href} target="_blank" rel="noopener noreferrer"
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        className="relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-600/15 border border-emerald-500/20 hover:bg-emerald-600/25 transition-all overflow-hidden"
      >
        {/* Pulse ring */}
        <motion.span
          className="absolute inset-0 rounded-xl border border-emerald-400/40"
          animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-[#25D366] relative z-10 shadow-sm shadow-emerald-500/40">
          {WA_ICON}
        </div>
        <div className="flex-1 min-w-0 relative z-10">
          <p className="text-[11px] font-bold leading-tight text-emerald-400">الدعم التقني</p>
          <p className="text-[9px] text-slate-500 mt-0.5">تواصل معنا عبر واتساب</p>
        </div>
        {/* Online dot */}
        <motion.span
          className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 relative z-10"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        />
      </motion.a>
    </motion.div>
  );
}

// ── PWA Install Button (sidebar) ─────────────────────────────────────────────
function PwaInstallButton() {
  const { canInstall, install, justInstalled } = usePwaInstall();
  if (!canInstall && !justInstalled) return null;
  return (
    <motion.div
      className="mx-2 mb-2"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
    >
      <motion.button
        onClick={install}
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-start transition-all
          ${justInstalled
            ? "bg-emerald-600/20 border border-emerald-500/30"
            : "bg-blue-600/15 border border-blue-500/20 hover:bg-blue-600/25"
          }`}
      >
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0
          ${justInstalled ? "bg-emerald-500" : "bg-gradient-to-br from-blue-500 to-indigo-600"}`}>
          <Download className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold leading-tight ${justInstalled ? "text-emerald-400" : "text-blue-300"}`}>
            {justInstalled ? "تم التثبيت ✓" : "تثبيت التطبيق"}
          </p>
          <p className="text-[9px] text-slate-500 mt-0.5">
            {justInstalled ? "يمكنك فتحه من سطح المكتب" : "اعمل بدون متصفح"}
          </p>
        </div>
      </motion.button>
    </motion.div>
  );
}

// ── Lang + Theme ──────────────────────────────────────────────────────────────
function LangButtons() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex items-center rounded-lg border bg-muted p-0.5 gap-0.5">
      {(["ar", "fr", "en"] as const).map(lang => (
        <motion.button key={lang} onClick={() => setLanguage(lang)} whileTap={{ scale: 0.92 }}
          className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
            language === lang
              ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}>{lang.toUpperCase()}</motion.button>
      ))}
    </div>
  );
}
function ThemeButton() {
  const { theme, setTheme } = useTheme();
  return (
    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}>
      <Button variant="ghost" size="icon" className="h-8 w-8"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        <AnimatePresence mode="wait">
          {theme === "dark"
            ? <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}><Sun className="h-4 w-4 text-amber-400" /></motion.div>
            : <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}><Moon className="h-4 w-4" /></motion.div>}
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}

// ── Top Navigation Bar ────────────────────────────────────────────────────────
function TopNav() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [loc] = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const isParent = user?.memberContext?.role === "parent";
  const isStandaloneStaffPlan = user?.subscriptionPlan === "staff"
    && user.subscriptionStatus === "active"
    && !user.memberContext
    && user.role !== "admin";
  const sections = getNavSections(user);

  // Auto-open section containing active route
  useEffect(() => {
    const active = sections.find(s => sectionHasActive(s, loc));
    if (active) setOpenSection(active.id);
  }, [loc]);

  const activeSection = sections.find(s => s.id === openSection);

  return (
    <>
      {/* Primary nav bar */}
      <motion.header
        className="h-12 border-b bg-background/95 backdrop-blur-xl flex items-center gap-0 px-3 shrink-0 z-30 relative"
        style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)" }}
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      >
        {/* Logo */}
        <Link href={isParent ? "/my-child" : isStandaloneStaffPlan ? "/upload-grades-ocr" : "/"}>
          <motion.div
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer shrink-0 me-2"
            whileTap={{ scale: 0.97 }}
          >
            <motion.div
              className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 0 12px 2px rgba(79,120,255,0.35)" }}
              whileHover={{ rotate: 8, scale: 1.08 }} transition={{ type: "spring", stiffness: 300 }}
            >
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </motion.div>
            <span className="font-extrabold text-[13px] bg-gradient-to-r from-blue-500 to-indigo-400 bg-clip-text text-transparent hidden sm:block whitespace-nowrap">
              {t("appName")}
            </span>
          </motion.div>
        </Link>

        {/* Section buttons — scrollable, desktop only */}
        <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto flex-1 scrollbar-none px-1 min-w-0">
          {sections.map(section => {
            const hasActive = sectionHasActive(section, loc);
            const isOpen = openSection === section.id;
            return (
              <motion.button
                key={section.id}
                onClick={() => setOpenSection(isOpen ? null : section.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
                  isOpen || hasActive
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
                whileTap={{ scale: 0.96 }}
              >
                <section.icon className={`w-3.5 h-3.5 ${hasActive || isOpen ? section.color : ""}`} />
                {t(section.labelKey)}
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </motion.div>
              </motion.button>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 ms-auto shrink-0">
          {!isParent && (
            <>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} className="hidden sm:block">
                <Button
                  size="sm"
                  onClick={() => setImportOpen(true)}
                  className="gap-1.5 h-7 text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 text-white border-0 shadow-sm shadow-sky-500/20 hover:from-sky-600 hover:to-blue-700"
                  data-testid="button-header-import"
                >
                  <Upload className="w-3 h-3" />
                  استيراد
                </Button>
              </motion.div>
              <motion.button
                whileHover={{ scale: 1.07 }} whileTap={{ scale: 0.93 }}
                onClick={() => setAiOpen(o => !o)}
                aria-label="المساعد الذكي"
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                  aiOpen
                    ? "bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-sm shadow-fuchsia-500/30"
                    : "text-muted-foreground hover:text-fuchsia-500 hover:bg-fuchsia-500/10"
                }`}
              >
                <Bot className="w-4 h-4" />
              </motion.button>
            </>
          )}
          <LangButtons />
          <ThemeButton />
          {/* Desktop user avatar + logout */}
          {user && (
            <div className="hidden lg:flex items-center gap-1 ms-1">
              {user.profileImageUrl ? (
                <img src={user.profileImageUrl} className="w-6 h-6 rounded-full ring-1 ring-border" alt="" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {(user.firstName?.[0] || user.email?.[0] || "?").toUpperCase()}
                </div>
              )}
              <motion.button
                onClick={logout}
                whileTap={{ scale: 0.97 }}
                title="تسجيل الخروج"
                className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          )}
          {/* Mobile hamburger */}
          <motion.button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted/60 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Menu className="w-4 h-4" />
          </motion.button>
        </div>
        <QuickImportDialog open={importOpen} onOpenChange={setImportOpen} />
      </motion.header>

      {/* Secondary nav — sub-items of open section (desktop) */}
      <AnimatePresence>
        {activeSection && (
          <motion.div
            key={activeSection.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="hidden lg:block border-b bg-card/70 backdrop-blur shrink-0 z-20 relative overflow-hidden"
          >
            <div className="flex items-center gap-0.5 px-4 py-1.5 overflow-x-auto scrollbar-none">
              {activeSection.items.map(item => {
                const active = isActive(item.href, loc);
                return (
                  <Link key={item.href} href={item.href}>
                    <motion.div
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer shrink-0 transition-all ${
                        active
                          ? "bg-gradient-to-r from-blue-500/15 to-indigo-500/10 text-blue-700 dark:text-blue-300 font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <item.icon className={`w-3 h-3 shrink-0 ${active ? "text-blue-500" : ""}`} />
                      {t(item.labelKey)}
                      {item.badge && (
                        <span className="text-[9px] px-1 py-0.5 rounded font-bold bg-gradient-to-r from-violet-500 to-purple-600 text-white">
                          {item.badge}
                        </span>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 start-0 w-64 z-50 lg:hidden shadow-2xl"
            >
              <MobileSidebarContent onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AI Chat Widget */}
      {user?.subscriptionPlan !== "free" && user?.memberContext?.schoolSubscriptionPlan !== "free" && (
        <AiChatWidget
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          role={user?.memberContext?.role ?? (isStandaloneStaffPlan ? "teacher" : "admin")}
        />
      )}
    </>
  );
}

// ── Coming soon stub ──────────────────────────────────────────────────────────
function ComingSoon({ title }: { title: string }) {
  return (
    <motion.div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center p-8"
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
      <motion.div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/30 dark:to-orange-950/30 flex items-center justify-center mb-4 shadow-lg"
        animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <Compass className="w-8 h-8 text-amber-500 opacity-60" />
      </motion.div>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground text-sm">هذه الصفحة قيد الإنشاء — قريباً</p>
    </motion.div>
  );
}

// ── App layout ────────────────────────────────────────────────────────────────
function AppLayout() {
  const [loc, navigate] = useLocation();
  const { user } = useAuth();
  const isParent = user?.memberContext?.role === "parent";
  const isStandaloneStaffPlan = user?.subscriptionPlan === "staff"
    && user.subscriptionStatus === "active"
    && !user.memberContext
    && user.role !== "admin";
  const isFreeAccount = user?.role !== "admin" && (
    (user?.subscriptionPlan === "free" && user.subscriptionStatus === "active" && !user.memberContext)
    ||     (user?.memberContext && user.memberContext.role !== "parent" && user.memberContext.schoolSubscriptionPlan === "free")
  );
  useEffect(() => {
    const freePaths = ["/", "/students", "/results", "/subjects", "/import", "/settings", "/account", "/subscription", "/payment-demo"];
    if (isFreeAccount && !freePaths.some(path => path === "/" ? loc === "/" : loc === path || loc.startsWith(`${path}/`))) {
      navigate("/subscription", { replace: true });
    }
  }, [isFreeAccount, loc, navigate]);
  useEffect(() => {
    if (!isStandaloneStaffPlan) return;
    if (loc === "/") {
      navigate("/upload-grades-ocr", { replace: true });
      return;
    }

    const requiredPermission = permissionForAppPath(loc);
    const allowed = requiredPermission
      ? DEFAULT_STAFF_PERMISSIONS.teacher.includes(requiredPermission)
      : ["/settings", "/account", "/subscription"].includes(loc);
    if (!allowed) navigate("/upload-grades-ocr", { replace: true });
  }, [isStandaloneStaffPlan, loc, navigate]);
  useEffect(() => {
    const member = user?.memberContext;
    if (!member || member.role === "parent") return;
    const requiredPermission = permissionForAppPath(loc);
    const allowed = requiredPermission
      ? member.permissions.includes(requiredPermission)
      : ["/settings", "/account", "/subscription"].includes(loc);
    if (!allowed) {
      const firstAllowed = member.permissions[0];
      navigate(firstAllowed ? appPathForPermission(firstAllowed) : "/subscription", { replace: true });
    }
  }, [loc, navigate, user?.memberContext]);
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TopNav />
      <main className="flex-1 overflow-y-auto bg-dot-grid">
          {isParent ? (
            <Switch key={loc}>
              <Route path="/parent-assistant" component={ParentAssistantPage} />
              <Route component={MyChildPage} />
            </Switch>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <Switch key={loc}>
              <Route path="/"                    component={Dashboard} />
              <Route path="/students"            component={Students} />
              <Route path="/sms"                 component={SmsPage} />
              <Route path="/results"             component={Results} />
              <Route path="/subjects"            component={SubjectsPage} />
              <Route path="/exam-results"        component={ExamResultsPage} />
              <Route path="/absences"            component={AbsencesPage} />
              <Route path="/repeaters"           component={RepeatersPage} />
              <Route path="/failed">{() => <RepeatersPage />}</Route>
              <Route path="/orientation-results" component={OrientationResultsPage} />
              <Route path="/transfer-results"    component={TransferResultsPage} />
              <Route path="/councils"            component={CouncilsPage} />
              <Route path="/bem"                 component={BEMPage} />
              <Route path="/yearend"             component={YearEnd} />
              <Route path="/yearend/passed"     component={YearEndPassed} />
              <Route path="/yearend/failed"     component={YearEndFailed} />
              <Route path="/yearend/mustarrak"  component={YearEndMustarrak} />
              <Route path="/yearend/recovery"   component={YearEndRecovery} />
              <Route path="/yearend/guides"     component={YearEndGuides} />
              <Route path="/yearend/final"      component={YearEndFinal} />
              <Route path="/analytics"           component={AnalyticsPage} />
              <Route path="/reports"             component={ReportsPage} />
              <Route path="/subscription"        component={SubscriptionPage} />
              <Route path="/payment-demo"         component={PaymentDemoPage} />
              <Route path="/admin"               component={AdminPage} />
              <Route path="/preorient/tracking" component={PreOrientTrackingPage} />
              <Route path="/preorient/first"    component={PreOrientFirstPage} />
              <Route path="/preorient/wishes"   component={OrientationWishesPage} />
              <Route path="/preorient/second"   component={PreOrientSecondPage} />
              <Route path="/preorient/final"    component={PreOrientFinalPage} />
              <Route path="/preorient/reports"  component={PreOrientReportsPage} />
              <Route path="/orientation" component={OrientationWorkflowPage} />
              <Route path="/assistant"           component={AssistantPage} />
              <Route path="/pedagogy-center"     component={PedagogyCenterPage} />
              <Route path="/pedagogy"            component={PedagogyCenterPage} />
              <Route path="/import"              component={ImportPage} />
              <Route path="/payment-return" component={PaymentReturnPage} />
              <Route path="/excel-injection"     component={ExcelInjectionPage} />
              <Route path="/archive"            component={ArchivePage} />
              <Route path="/upload-grades-ocr"  component={UploadGradesOcrPage} />
              <Route path="/agent"               component={AgentSetupPage} />
              <Route path="/settings"            component={SettingsPage} />
              <Route path="/account">{() => <SettingsPage />}</Route>
              <Route path="/members"             component={MembersPage} />
              <Route path="/my-child"            component={MyChildPage} />
              <Route path="/audit-log"           component={AuditLogPage} />
              <Route path="/class-balancer"      component={ClassBalancerPage} />
              <Route path="/timetable"           component={TimetablePage} />
              <Route component={NotFound} />
              </Switch>
            </AnimatePresence>
          )}
      </main>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  config_error: "تعذّر الاتصال بخدمة تسجيل الدخول. يرجى التحقق من إعدادات الخادم والمحاولة لاحقاً.",
  callback_failed: "فشلت عملية تسجيل الدخول. يرجى المحاولة مرة أخرى.",
  db_unavailable: "قاعدة البيانات غير متاحة حالياً. يرجى المحاولة لاحقاً أو التواصل مع المسؤول.",
};

function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const features = ["login.feature1", "login.feature2", "login.feature3", "login.feature4"] as const;
  const featureIcons = [Users, BarChart3, LayoutDashboard, GraduationCap];

  const authError = new URLSearchParams(window.location.search).get("auth_error");
  const errorMessage = authError ? (AUTH_ERROR_MESSAGES[authError] ?? "حدث خطأ غير متوقع أثناء تسجيل الدخول.") : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden relative"
      style={{ background: "radial-gradient(ellipse 120% 80% at 50% -10%, #dbeafe 0%, #ede9fe 35%, #f0f9ff 60%, #f8fafc 100%)" }}>
      {/* Decorative blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div className="absolute -top-40 -end-20 w-[600px] h-[600px] rounded-full bg-blue-400/20 blur-[100px]"
          animate={{ scale: [1, 1.12, 1], rotate: [0, 10, 0] }} transition={{ duration: 9, repeat: Infinity }} />
        <motion.div className="absolute -bottom-40 -start-20 w-[600px] h-[600px] rounded-full bg-violet-400/18 blur-[100px]"
          animate={{ scale: [1, 1.18, 1], rotate: [0, -10, 0] }} transition={{ duration: 11, repeat: Infinity, delay: 2 }} />
        <motion.div className="absolute top-1/4 start-1/4 w-80 h-80 rounded-full bg-sky-300/15 blur-[80px]"
          animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 7, repeat: Infinity, delay: 1 }} />
        <motion.div className="absolute bottom-1/4 end-1/4 w-64 h-64 rounded-full bg-fuchsia-300/14 blur-[80px]"
          animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 8, repeat: Infinity, delay: 3 }} />
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 bg-dot-grid opacity-40" />
      </div>

      <motion.div className="text-center max-w-xl mx-auto relative z-10">
        {/* Auth error banner */}
        {errorMessage && (
          <motion.div
            className="mb-6 flex items-start gap-3 px-5 py-4 rounded-2xl text-sm text-red-700 dark:text-red-300 text-start"
            style={{
              background: "rgba(254,226,226,0.85)",
              border: "1px solid rgba(252,165,165,0.6)",
              boxShadow: "0 4px 20px rgba(239,68,68,0.10)",
              backdropFilter: "blur(8px)",
            }}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
            <span className="leading-relaxed font-medium">{errorMessage}</span>
          </motion.div>
        )}

        {/* Brand pill */}
        <motion.div
          className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-blue-700 dark:text-blue-300 text-sm font-bold mb-8 backdrop-blur-md"
          style={{
            background: "rgba(255,255,255,0.65)",
            border: "1px solid rgba(147,197,253,0.5)",
            boxShadow: "0 4px 24px rgba(59,130,246,0.14), 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
          initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 260 }}
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4 }}
            className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"
            style={{ boxShadow: "0 4px 12px rgba(79,120,255,0.45)" }}
          >
            <BookOpen className="w-3.5 h-3.5 text-white" />
          </motion.div>
          {t("appName")}
        </motion.div>

        <motion.h1
          className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent mb-4 leading-tight"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
        >
          {t("login.hero")}
        </motion.h1>
        <motion.p
          className="text-lg text-muted-foreground mb-10"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.18 }}
        >
          {t("login.subtitle")}
        </motion.p>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-10">
          {features.map((k, i) => {
            const Icon = featureIcons[i];
            const gradients = [
              "from-blue-500 to-indigo-600",
              "from-violet-500 to-purple-600",
              "from-cyan-500 to-blue-600",
              "from-emerald-500 to-teal-600",
            ];
            const glows = [
              "rgba(59,130,246,0.18)",
              "rgba(139,92,246,0.18)",
              "rgba(6,182,212,0.18)",
              "rgba(16,185,129,0.18)",
            ];
            return (
              <motion.div key={k}
                initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.25 + i * 0.07, type: "spring", stiffness: 260 }}
                whileHover={{ y: -5, scale: 1.04 }}
                className="flex items-center gap-3 p-4 rounded-2xl backdrop-blur-md border border-white/60 text-sm text-foreground transition-all cursor-default"
                style={{
                  background: "rgba(255,255,255,0.60)",
                  boxShadow: `0 4px 20px ${glows[i]}, 0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)`,
                }}
              >
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradients[i]} flex items-center justify-center shrink-0`}
                  style={{ boxShadow: `0 4px 12px ${glows[i]}, 0 2px 4px rgba(0,0,0,0.15)` }}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-foreground/85">{t(k)}</span>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <motion.div
            whileHover={{ scale: 1.05, y: -3 }} whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <Button size="lg"
              className="px-14 py-6 text-base font-extrabold rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 text-white shadow-2xl shadow-blue-500/30 border-0 tracking-wide"
              onClick={login}
            >
              {t("login.cta")}
            </Button>
          </motion.div>
          <motion.p className="text-xs text-muted-foreground mt-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            تسجيل الدخول عبر حساب Google • آمن ومشفر
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Auth gate ─────────────────────────────────────────────────────────────────
function AuthGate() {
  const { user, isAuthenticated, isLoading, loadError, retry } = useAuth();
  const [loc] = useLocation();
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"
        animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
    </div>
  );
  if (loadError) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h1 className="text-xl font-bold">تعذر التحقق من تسجيل الدخول</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        تعذّر الاتصال بخدمة المصادقة. تحقق من اتصالك ثم أعد المحاولة.
      </p>
      <Button onClick={retry}>إعادة المحاولة</Button>
    </div>
  );

  // Teachers are covered by the school's subscription. Parent access is a
  // separate service paid by the parent account.
  const isTeacherMember = user?.memberContext?.role === "teacher";
  const isFreePlan = user?.subscriptionPlan === "free" && user.subscriptionStatus === "active";
  const isSubscribed = user?.subscriptionStatus === "active" || isTeacherMember || isFreePlan;

    return (
    <AnimatePresence mode="wait">
      {!isAuthenticated
        ? <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><LoginScreen /></motion.div>
        : loc === "/payment-demo"
          ? <motion.div key="payment-demo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><PaymentDemoPage /></motion.div>
        : loc === "/payment-return"
          ? <motion.div key="payment-return" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><PaymentReturnPage /></motion.div>
        : !isSubscribed
          ? <motion.div key="paywall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}><PaywallScreen /></motion.div>
          : <motion.div key="app" className="h-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}><AppLayout /></motion.div>
      }
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="ui-theme">
      <LanguageProvider defaultLang="ar">
        {/* Public routes — no auth required */}
        <Switch>
          <Route path="/parent-register" component={ParentRegisterPage} />
          <Route>
            <AuthGate />
          </Route>
        </Switch>
        <Toaster />
        <PwaInstallPromptLazy />
      </LanguageProvider>
    </ThemeProvider>
  );
}
// Lazy-load so it never blocks the main bundle
import { lazy, Suspense } from "react";
const _PwaPrompt = lazy(() =>
  import("@/components/pwa-install-prompt").then(m => ({ default: m.PwaInstallPrompt }))
);
function PwaInstallPromptLazy() {
  return (
    <Suspense fallback={null}>
      <_PwaPrompt />
    </Suspense>
  );
}
