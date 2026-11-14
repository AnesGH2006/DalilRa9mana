/**
 * Members Page — Head-Admin only
 * Manage STAFF accounts (teachers, supervisors, counselors).
 * Parents self-register via /parent-register using the school join code.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/language-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, UserPlus, Trash2, Pencil, GraduationCap,
  UserCheck, AlertCircle, BookOpen, Copy, Check,
  ShieldCheck, MessageSquare, ExternalLink,
} from "lucide-react";
import {
  DEFAULT_STAFF_PERMISSIONS,
  STAFF_PERMISSION_LABELS,
  STAFF_PERMISSIONS,
  type StaffPermission,
  type StaffRole,
} from "@shared/member-permissions";

const BASE = import.meta.env.BASE_URL;

type MemberRole  = StaffRole | "parent";

interface Member {
  id: string;
  schoolUserId: string;
  memberUserId: string | null;
  role: MemberRole;
  name: string;
  email: string | null;
  phone: string | null;
  assignedClasses: string[];
  permissions: StaffPermission[] | null;
  linkedStudentId: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  nomPrenom: string;
  niveau: string;
  classe: string;
}

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const EMPTY_FORM: { role: StaffRole; name: string; email: string; phone: string; assignedClasses: string; permissions: StaffPermission[] } = {
  role: "teacher",
  name: "",
  email: "",
  phone: "",
  assignedClasses: "",
  permissions: [...DEFAULT_STAFF_PERMISSIONS.teacher],
};

const ROLE_META: Record<MemberRole, { label: string; arLabel: string; color: string; bg: string; icon: React.ElementType }> = {
  teacher:    { label: "Teacher",     arLabel: "أستاذ",      color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800/40",  icon: GraduationCap   },
  supervisor: { label: "Supervisor",  arLabel: "مشرف",       color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/40",            icon: ShieldCheck     },
  counselor:  { label: "Counselor",   arLabel: "مستشار",     color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40",        icon: MessageSquare   },
  parent:     { label: "Parent",      arLabel: "ولي الأمر",   color: "text-emerald-600 dark:text-emerald-400",bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40",icon: UserCheck       },
};

export default function MembersPage() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [members,    setMembers]    = useState<Member[]>([]);
  const [students,   setStudents]   = useState<Student[]>([]);
  const [joinCode,   setJoinCode]   = useState<string>("");
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Member | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Load members + students + school join code
  useEffect(() => {
    Promise.all([
      fetch(`${BASE}api/members`,            { credentials: "include" }).then(r => r.json()),
      fetch(`${BASE}api/students?limit=500`, { credentials: "include" }).then(r => r.json()),
      fetch(`${BASE}api/school`,             { credentials: "include" }).then(r => r.json()),
    ]).then(([mem, stu, school]) => {
      setMembers(Array.isArray(mem) ? mem : []);
      setStudents(Array.isArray(stu?.students) ? stu.students : Array.isArray(stu) ? stu : []);
      if (school?.joinCode) setJoinCode(school.joinCode);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(m: Member) {
    if (m.role === "parent") return; // parents are read-only
    setEditing(m);
    setForm({
      role: m.role as StaffRole,
      name: m.name,
      email: m.email ?? "",
      phone: m.phone ?? "",
      assignedClasses: (m.assignedClasses ?? []).join(", "),
      permissions: m.permissions ?? [...DEFAULT_STAFF_PERMISSIONS[m.role as StaffRole]],
    });
    setDialogOpen(true);
  }

  async function saveMember() {
    if (!form.name.trim()) return;
    setSaving(true);
    const body = {
      role: form.role,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      assignedClasses: form.role === "teacher"
        ? form.assignedClasses.split(",").map(s => s.trim()).filter(Boolean)
        : [],
      permissions: form.permissions,
    };
    try {
      const url    = editing ? `${BASE}api/members/${editing.id}` : `${BASE}api/members`;
      const method = editing ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      if (editing) {
        setMembers(prev => prev.map(m => m.id === saved.id ? saved : m));
      } else {
        setMembers(prev => [...prev, saved]);
      }
      toast({ description: t("members.saved") });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function deleteMember(id: string) {
    try {
      const res = await fetch(`${BASE}api/members/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setMembers(prev => prev.filter(m => m.id !== id));
      toast({ description: t("members.deleted") });
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message });
    } finally {
      setDeleteId(null);
    }
  }

  function copyCode() {
    if (!joinCode) return;
    navigator.clipboard.writeText(joinCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  const staffMembers  = members.filter(m => m.role !== "parent");
  const parentMembers = members.filter(m => m.role === "parent");

  function studentName(id: string | null) {
    if (!id) return "—";
    return students.find(s => s.id === id)?.nomPrenom ?? id;
  }

  const STAFF_GROUPS: { role: StaffRole; list: Member[] }[] = [
    { role: "teacher",    list: staffMembers.filter(m => m.role === "teacher")    },
    { role: "supervisor", list: staffMembers.filter(m => m.role === "supervisor") },
    { role: "counselor",  list: staffMembers.filter(m => m.role === "counselor")  },
  ];

  return (
    <motion.div
      variants={pageVariants} initial="initial" animate="animate"
      className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow">
              <Users className="w-5 h-5 text-white" />
            </span>
            {t("members.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("members.subtitle")}</p>
        </div>
        <Button onClick={openAdd} className="gap-2 shrink-0">
          <UserPlus className="w-4 h-4" />
          {t("members.add")}
        </Button>
      </div>

      {/* School Join Code card */}
      {joinCode && (
        <Card className="border-0 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20 border border-indigo-200/60 dark:border-indigo-800/30 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                  {t("members.join_code")}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-3xl font-black tracking-[0.25em] text-indigo-700 dark:text-indigo-300 select-all">
                    {joinCode}
                  </span>
                  <Button size="sm" variant="outline" onClick={copyCode}
                    className="gap-1.5 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300">
                    {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {codeCopied ? "تم النسخ" : "نسخ"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{t("members.join_code_hint")}</p>
              </div>
              <a
                href="/parent-register"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {`/parent-register`}
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : (
        <div className="space-y-6">
          {/* Staff groups */}
          {STAFF_GROUPS.map(({ role, list }) => {
            const meta = ROLE_META[role];
            const Icon = meta.icon;
            return (
              <Card key={role} className={`border shadow-sm ${meta.bg}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                    <span>{meta.arLabel}s ({list.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">{t("members.none")}</p>
                  ) : (
                    list.map(m => (
                      <MemberCard
                        key={m.id}
                        member={m}
                        meta={meta}
                        extra={m.assignedClasses?.length
                          ? `${t("members.classes")}: ${m.assignedClasses.join(" · ")}`
                          : undefined}
                        onEdit={() => openEdit(m)}
                        onDelete={() => setDeleteId(m.id)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Parents section (read-only — self-registered) */}
          <Card className="border shadow-sm bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-500" />
                {t("members.parents_section")} ({parentMembers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-900/20 rounded-lg p-2.5 mb-3">
                <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {t("members.parent_hint")}
              </div>
              {parentMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">{t("members.none")}</p>
              ) : (
                parentMembers.map(m => (
                  <MemberCard
                    key={m.id}
                    member={m}
                    meta={ROLE_META.parent}
                    extra={m.linkedStudentId
                      ? `${t("members.student")}: ${studentName(m.linkedStudentId)}`
                      : undefined}
                    readOnly
                    onDelete={() => setDeleteId(m.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add / Edit dialog — staff only */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? `تعديل: ${editing.name}` : t("members.add")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Role (only when adding) */}
            {!editing && (
              <div className="space-y-1.5">
                <Label>{t("members.role")}</Label>
                <Select value={form.role} onValueChange={v => {
                  const role = v as StaffRole;
                  setForm(f => ({ ...f, role, permissions: [...DEFAULT_STAFF_PERMISSIONS[role]] }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">
                      <span className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-violet-500" />
                        {t("members.teacher")}
                      </span>
                    </SelectItem>
                    <SelectItem value="supervisor">
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-500" />
                        {t("members.supervisor")}
                      </span>
                    </SelectItem>
                    <SelectItem value="counselor">
                      <span className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-amber-500" />
                        {t("members.counselor")}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t("members.name")} *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="…"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label>{t("members.email")}</Label>
              <Input
                value={form.email}
                type="email"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">{t("members.linked_hint")}</p>
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label>{t("members.phone")}</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="05xxxxxxxx"
                dir="ltr"
              />
            </div>

            {/* Teacher: assigned classes */}
            {form.role === "teacher" && (
              <div className="space-y-1.5">
                <Label>{t("members.classes")}</Label>
                <Input
                  value={form.assignedClasses}
                  onChange={e => setForm(f => ({ ...f, assignedClasses: e.target.value }))}
                  placeholder="1AM A, 2AM B"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">{t("members.class_hint")}</p>
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">الصلاحيات</legend>
              <p className="text-xs text-muted-foreground">
                تم اختيار صلاحيات افتراضية حسب الدور؛ يمكنك تعديلها لهذا الحساب فقط.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border p-3">
                {STAFF_PERMISSIONS.map(permission => (
                  <label key={permission} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(permission)}
                      onChange={event => setForm(current => ({
                        ...current,
                        permissions: event.target.checked
                          ? [...current.permissions, permission]
                          : current.permissions.filter(item => item !== permission),
                      }))}
                      className="accent-primary"
                    />
                    {STAFF_PERMISSION_LABELS[permission]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveMember} disabled={saving || !form.name.trim()}>
              {saving ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              {t("members.delete_confirm")}
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMember(deleteId)}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

// ── MemberCard ────────────────────────────────────────────────────────────────
function MemberCard({ member, meta, extra, readOnly, onEdit, onDelete }: {
  member: Member;
  meta: typeof ROLE_META[MemberRole];
  extra?: string;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  const Icon = meta.icon;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />
          <span className="font-medium text-sm truncate">{member.name}</span>
          <Badge
            variant="outline"
            className={`text-[10px] shrink-0 ${member.memberUserId ? "border-emerald-400 text-emerald-600 dark:text-emerald-400" : "border-amber-400 text-amber-600 dark:text-amber-400"}`}
          >
            {member.memberUserId ? t("members.status_linked") : t("members.status_pending")}
          </Badge>
        </div>
        {member.email && (
          <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{member.email}</p>
        )}
        {extra && (
          <p className="text-xs text-muted-foreground mt-0.5">{extra}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!readOnly && onEdit && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
