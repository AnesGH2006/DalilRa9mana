import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/hooks/use-auth";

const BASE: string = (import.meta as any).env?.BASE_URL ?? "/";

type SchoolHit = { id: string; nom: string; wilaya: string; commune: string };
type Done = { school: { nom: string }; student: { nomPrenom: string; niveau: string; classe: string } };

const css = {
  wrap: { minHeight: "100vh", padding: "28px 16px 48px", background: "radial-gradient(ellipse at top, #121a3a 0%, #0b1020 60%)", color: "#e6e9f2" } as CSSProperties,
  card: { maxWidth: 560, margin: "0 auto", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 22, padding: 24 } as CSSProperties,
  title: { fontSize: 24, fontWeight: 800, margin: "0 0 6px" } as CSSProperties,
  sub: { color: "#9aa6c4", fontSize: 14, lineHeight: 1.7, margin: "0 0 20px" } as CSSProperties,
  label: { display: "block", fontSize: 13, fontWeight: 700, margin: "16px 0 6px" } as CSSProperties,
  hint: { color: "#7f8aa8", fontSize: 12, marginTop: 5, lineHeight: 1.6 } as CSSProperties,
  input: { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, outline: "none" } as CSSProperties,
  hit: (active: boolean): CSSProperties => ({
    display: "block", width: "100%", textAlign: "start", cursor: "pointer", marginTop: 6, padding: "10px 12px", borderRadius: 12,
    background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "#3b82f6" : "rgba(255,255,255,0.1)"}`, color: "#e6e9f2", fontSize: 14,
  }),
  button: (disabled: boolean): CSSProperties => ({
    width: "100%", marginTop: 22, border: 0, borderRadius: 12, padding: "13px 16px", fontSize: 15, fontWeight: 700, color: "#fff",
    background: disabled ? "#334155" : "linear-gradient(135deg,#2563eb,#4f46e5)", cursor: disabled ? "not-allowed" : "pointer",
  }),
  link: { background: "transparent", border: 0, color: "#93c5fd", cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" } as CSSProperties,
  error: { background: "rgba(239,68,68,0.14)", border: "1px solid #ef4444", borderRadius: 12, padding: "11px 14px", marginTop: 16, fontSize: 14, lineHeight: 1.7 } as CSSProperties,
  ok: { background: "rgba(16,185,129,0.14)", border: "1px solid #10b981", borderRadius: 14, padding: 18, textAlign: "center" } as CSSProperties,
};

export default function ParentRegisterPage() {
  const { isAuthenticated, isLoading, login } = useAuth();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SchoolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [school, setSchool] = useState<SchoolHit | null>(null);

  const [useCode, setUseCode] = useState(() => new URLSearchParams(window.location.search).has("code"));
  const [joinCode, setJoinCode] = useState(() => (new URLSearchParams(window.location.search).get("code") ?? "").toUpperCase());
  const [codeSchool, setCodeSchool] = useState<string | null>(null);

  const [studentName, setStudentName] = useState("");
  const [phone, setPhone] = useState("");
  const [parentName, setParentName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  // Search schools by name / wilaya / commune (waits a moment after typing)
  useEffect(() => {
    if (useCode || school || query.trim().length < 3) {
      setHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${BASE}api/public/schools/search?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json().catch(() => ({}))) as { schools?: SchoolHit[] };
        setHits(res.ok ? data.schools ?? [] : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, useCode, school]);

  // Check a typed school code
  useEffect(() => {
    setCodeSchool(null);
    if (!useCode || joinCode.trim().length < 6) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${BASE}api/public/school-by-code/${encodeURIComponent(joinCode.trim())}`);
        const data = (await res.json().catch(() => ({}))) as { nom?: string };
        if (!cancelled && res.ok && data.nom) setCodeSchool(data.nom);
      } catch {
        /* the check is only a convenience */
      }
    })();
    return () => { cancelled = true; };
  }, [useCode, joinCode]);

  const nameWords = studentName.trim().split(/\s+/).filter(Boolean).length;
  const phoneDigits = phone.replace(/\D/g, "").length;
  const schoolChosen = useCode ? joinCode.trim().length >= 6 : Boolean(school);
  const canSubmit = !busy && schoolChosen && nameWords >= 2 && phoneDigits >= 9;
  const schoolLabel = useMemo(() => (useCode ? codeSchool : school?.nom) ?? "", [useCode, codeSchool, school]);

  function goToChild() {
    // A full reload so the app reads the new parent account from the server.
    window.location.href = `${BASE}my-child`;
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BASE}api/parent-link`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(useCode ? { joinCode: joinCode.trim() } : { schoolId: school?.id }),
          studentName: studentName.trim(),
          phone: phone.trim(),
          parentName: parentName.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Done> & { error?: string; alreadyLinked?: boolean };
      if (res.status === 409 && data.alreadyLinked) {
        goToChild();
        return;
      }
      if (!res.ok || !data.student || !data.school) throw new Error(data.error ?? "تعذر ربط الحساب. حاول مرة أخرى.");
      setDone({ school: data.school, student: data.student });
      window.setTimeout(goToChild, 2500);
    } catch (e: any) {
      setError(e?.message ?? "تعذر ربط الحساب. حاول مرة أخرى.");
      setBusy(false);
    }
  }

  if (isLoading) return <div dir="rtl" style={css.wrap}>جارٍ التحميل…</div>;

  if (!isAuthenticated) {
    return (
      <div dir="rtl" style={css.wrap}>
        <div style={css.card}>
          <h1 style={css.title}>ربط حسابك بمدرسة ابنك</h1>
          <p style={css.sub}>سجّل الدخول بحساب Google أولاً، ثم أكمل ربط حسابك بابنك.</p>
          <button type="button" style={css.button(false)} onClick={login}>تسجيل الدخول عبر Google</button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div dir="rtl" style={css.wrap}>
        <div style={css.card}>
          <div style={css.ok}>
            <div style={{ fontSize: 42 }}>✅</div>
            <h1 style={{ ...css.title, fontSize: 21 }}>تم ربط حسابك بنجاح</h1>
            <p style={{ ...css.sub, margin: "0 0 14px" }}>
              {done.student.nomPrenom}<br />
              {done.student.niveau} · القسم {done.student.classe}<br />
              {done.school.nom}
            </p>
            <button type="button" style={css.button(false)} onClick={goToChild}>الانتقال إلى صفحة ابني</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={css.wrap}>
      <div style={css.card}>
        <h1 style={css.title}>ربط حسابك بمدرسة ابنك</h1>
        <p style={css.sub}>اختر المدرسة، ثم اكتب اسم ابنك ورقم هاتفك. نتحقق منهما من سجلات المدرسة قبل أن نعرض لك أي معلومات.</p>

        {/* 1. School */}
        <label style={css.label}>1. مدرسة ابنك</label>
        {!useCode ? (
          <>
            {school ? (
              <div style={css.hit(true)}>
                <strong>{school.nom}</strong>
                <div style={css.hint}>{[school.commune, school.wilaya].filter(Boolean).join(" · ")}</div>
                <button type="button" style={css.link} onClick={() => { setSchool(null); setQuery(""); }}>تغيير المدرسة</button>
              </div>
            ) : (
              <>
                <input
                  style={css.input}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="ابحث باسم المدرسة أو البلدية أو الولاية"
                  aria-label="ابحث عن مدرسة"
                />
                {searching && <div style={css.hint}>جارٍ البحث…</div>}
                {hits.map(hit => (
                  <button key={hit.id} type="button" style={css.hit(false)} onClick={() => { setSchool(hit); setHits([]); }}>
                    <strong>{hit.nom}</strong>
                    <div style={css.hint}>{[hit.commune, hit.wilaya].filter(Boolean).join(" · ")}</div>
                  </button>
                ))}
                {!searching && query.trim().length >= 3 && hits.length === 0 && (
                  <div style={css.hint}>لا توجد مدرسة بهذا الاسم. جرّب كتابة جزء آخر من الاسم، أو استعمل رمز المدرسة.</div>
                )}
              </>
            )}
            <div style={{ marginTop: 8 }}>
              <button type="button" style={css.link} onClick={() => setUseCode(true)}>لدي رمز المدرسة</button>
            </div>
          </>
        ) : (
          <>
            <input
              style={{ ...css.input, direction: "ltr", textTransform: "uppercase" }}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="مثال: QGGGHG"
              maxLength={10}
              aria-label="رمز المدرسة"
            />
            {codeSchool && <div style={{ ...css.hint, color: "#6ee7b7" }}>✓ {codeSchool}</div>}
            <div style={{ marginTop: 8 }}>
              <button type="button" style={css.link} onClick={() => setUseCode(false)}>البحث عن المدرسة بالاسم بدلاً من الرمز</button>
            </div>
          </>
        )}

        {/* 2. Child name */}
        <label style={css.label} htmlFor="pr-student">2. الاسم الكامل لابنك</label>
        <input
          id="pr-student"
          style={css.input}
          value={studentName}
          onChange={e => setStudentName(e.target.value)}
          placeholder="الاسم واللقب كما في سجلات المدرسة"
          autoComplete="off"
        />
        <div style={css.hint}>اللقب والاسم، بأي ترتيب. مثال: بوعلقة عبدالقادر</div>

        {/* 3. Phone */}
        <label style={css.label} htmlFor="pr-phone">3. رقم هاتفك المسجّل لدى المدرسة</label>
        <input
          id="pr-phone"
          style={{ ...css.input, direction: "ltr", textAlign: "right" }}
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="05 50 12 34 56"
          inputMode="tel"
          autoComplete="tel"
        />
        <div style={css.hint}>نقارنه بأرقام الأولياء في سجلات المدرسة. الصيغ 0550123456 و+213550123456 تُعتبر نفس الرقم.</div>

        {/* 4. Your name (optional) */}
        <label style={css.label} htmlFor="pr-parent">4. اسمك (اختياري)</label>
        <input id="pr-parent" style={css.input} value={parentName} onChange={e => setParentName(e.target.value)} placeholder="اسم الولي" autoComplete="name" />

        {error && <div style={css.error} role="alert">{error}</div>}

        <button type="button" style={css.button(!canSubmit)} disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? "جارٍ التحقق…" : `ربط حسابي${schoolLabel ? ` · ${schoolLabel}` : ""}`}
        </button>
      </div>
    </div>
  );
}