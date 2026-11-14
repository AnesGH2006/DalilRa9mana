// Algerian middle school (CEM) and lycée (secondary) subject coefficients
// Source: Official Algerian Ministry of Education grading system

export interface Subject {
  key: string;
  arLabel: string;
  frLabel: string;
  coef: number;
}

export type LyceeBacFiliere = "science" | "math" | "technical" | "management" | "letters" | "languages";
export type LyceeCommonCoreFiliere = "common_science" | "common_literature";
export type LyceeFiliere = LyceeBacFiliere | LyceeCommonCoreFiliere;
export const LYCEE_BAC_FILIERES: LyceeBacFiliere[] = [
  "science", "math", "technical", "management", "letters", "languages",
];
export const LYCEE_COMMON_CORE_FILIERES: LyceeCommonCoreFiliere[] = ["common_science", "common_literature"];
export const LYCEE_BAC_FILIERE_LABELS: Record<LyceeBacFiliere, string> = {
  science: "علوم تجريبية",
  math: "رياضيات",
  technical: "تقني رياضي",
  management: "تسيير واقتصاد",
  letters: "آداب وفلسفة",
  languages: "لغات أجنبية",
};
export const LYCEE_COMMON_CORE_FILIERE_LABELS: Record<LyceeCommonCoreFiliere, string> = {
  common_science: "جذع مشترك علوم وتكنولوجيا",
  common_literature: "جذع مشترك آداب",
};
export const LYCEE_FILIERE_LABELS: Record<LyceeFiliere, string> = {
  ...LYCEE_BAC_FILIERE_LABELS,
  ...LYCEE_COMMON_CORE_FILIERE_LABELS,
};

function normalizeFiliereText(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function normalizeLyceeBacFiliere(value: string): LyceeBacFiliere | null {
  const normalized = normalizeFiliereText(value);
  if (!normalized) return null;
  if (["science", "sciences", "experimental", "scientifique", "علوم", "علومطبيعيه", "علومالتجريبيه", "علومالتجريبية"].some(v => normalized.includes(v))) return "science";
  if (["math", "mathematics", "mathematiques", "رياضيات"].some(v => normalized.includes(v))) return "math";
  if (["technical", "technique", "تقنيرياضي", "تقني"].some(v => normalized.includes(v))) return "technical";
  if (["management", "gestion", "economy", "اقتصاد", "تسيير"].some(v => normalized.includes(v))) return "management";
  if (["letters", "literature", "lettres", "اداب", "فلسفه"].some(v => normalized.includes(v))) return "letters";
  if (["languages", "langues", "لغات", "لغهاجنبيه"].some(v => normalized.includes(v))) return "languages";
  return null;
}

function isLyceeBacFiliere(value: LyceeFiliere): value is LyceeBacFiliere {
  return LYCEE_BAC_FILIERES.some(filiere => filiere === value);
}

export function normalizeLyceeFiliere(value: string, niveau: Niveau): LyceeFiliere | null {
  const normalized = normalizeFiliereText(value);
  if (!normalized) return null;
  if (niveau === "1AS") {
    if (["common_science", "sciences", "science", "sciencetechnology", "sciencesettechnologie", "tronccommuns", "علوم", "علوموتكنولوجيا", "علوموتقنيات", "جذعمشتركعلوم", "جذعمشتركعلوموتكنولوجيا"].some(v => normalized.includes(normalizeFiliereText(v)))) {
      return "common_science";
    }
    if (["common_literature", "common_arts", "letters", "literature", "lettres", "tronccommunlettres", "اداب", "جذعمشتركاداب"].some(v => normalized.includes(normalizeFiliereText(v)))) {
      return "common_literature";
    }
    return null;
  }
  return normalizeLyceeBacFiliere(value);
}

const SUBJECTS_LYCEE: Subject[] = [
  { key: "arabe", arLabel: "اللغة العربية", frLabel: "Langue Arabe", coef: 4 },
  { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Langue Française", coef: 3 },
  { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Langue Anglaise", coef: 2 },
  { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 4 },
  { key: "physique", arLabel: "العلوم الفيزيائية", frLabel: "Physique", coef: 3 },
  { key: "svt", arLabel: "العلوم الطبيعية", frLabel: "SVT", coef: 3 },
  { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 2 },
  { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 2 },
  { key: "civique", arLabel: "التربية المدنية", frLabel: "Éducation Civique", coef: 1 },
  { key: "eps", arLabel: "التربية البدنية", frLabel: "EPS", coef: 1 },
];

const BAC_SUBJECTS_BY_FILIERE: Record<LyceeBacFiliere, Subject[]> = {
  science: [
    { key: "arabe", arLabel: "اللغة العربية", frLabel: "Langue Arabe", coef: 2 },
    { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 6 },
    { key: "physique", arLabel: "العلوم الفيزيائية", frLabel: "Physique", coef: 6 },
    { key: "svt", arLabel: "علوم الطبيعة والحياة", frLabel: "Sciences naturelles", coef: 6 },
    { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Français", coef: 2 },
    { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Anglais", coef: 2 },
    { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 1 },
    { key: "philosophy", arLabel: "الفلسفة", frLabel: "Philosophie", coef: 1 },
    { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 1 },
    { key: "eps", arLabel: "التربية البدنية", frLabel: "EPS", coef: 1 },
  ],
  math: [
    { key: "arabe", arLabel: "اللغة العربية", frLabel: "Langue Arabe", coef: 2 },
    { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 9 },
    { key: "physique", arLabel: "العلوم الفيزيائية", frLabel: "Physique", coef: 7 },
    { key: "svt", arLabel: "علوم الطبيعة والحياة", frLabel: "Sciences naturelles", coef: 2 },
    { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Français", coef: 2 },
    { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Anglais", coef: 2 },
    { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 1 },
    { key: "philosophy", arLabel: "الفلسفة", frLabel: "Philosophie", coef: 1 },
    { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 1 },
    { key: "eps", arLabel: "التربية البدنية", frLabel: "EPS", coef: 1 },
  ],
  technical: [
    { key: "arabe", arLabel: "اللغة العربية", frLabel: "Langue Arabe", coef: 2 },
    { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 6 },
    { key: "physique", arLabel: "العلوم الفيزيائية", frLabel: "Physique", coef: 5 },
    { key: "technical", arLabel: "التكنولوجيا (حسب التخصص)", frLabel: "Technique (selon la spécialité)", coef: 6 },
    { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Français", coef: 2 },
    { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Anglais", coef: 2 },
    { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 1 },
    { key: "philosophy", arLabel: "الفلسفة", frLabel: "Philosophie", coef: 1 },
    { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 1 },
    { key: "eps", arLabel: "التربية البدنية", frLabel: "EPS", coef: 1 },
  ],
  management: [
    { key: "arabe", arLabel: "اللغة العربية", frLabel: "Langue Arabe", coef: 2 },
    { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 4 },
    { key: "accounting", arLabel: "التسيير المحاسبي والمالي", frLabel: "Comptabilité", coef: 6 },
    { key: "economics", arLabel: "الاقتصاد والمناجمنت", frLabel: "Économie et management", coef: 4 },
    { key: "law", arLabel: "القانون", frLabel: "Droit", coef: 2 },
    { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Français", coef: 3 },
    { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Anglais", coef: 3 },
    { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 2 },
    { key: "philosophy", arLabel: "الفلسفة", frLabel: "Philosophie", coef: 1 },
    { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 1 },
    { key: "eps", arLabel: "التربية البدنية", frLabel: "EPS", coef: 1 },
  ],
  letters: [
    { key: "arabe", arLabel: "اللغة العربية وآدابها", frLabel: "Langue et littérature arabes", coef: 5 },
    { key: "philosophy", arLabel: "الفلسفة", frLabel: "Philosophie", coef: 4 },
    { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 4 },
    { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Français", coef: 4 },
    { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Anglais", coef: 4 },
    { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 1 },
    { key: "svt", arLabel: "علوم الطبيعة والحياة", frLabel: "Sciences naturelles", coef: 1 },
    { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 2 },
    { key: "eps", arLabel: "التربية البدنية", frLabel: "EPS", coef: 1 },
  ],
  languages: [
    { key: "arabe", arLabel: "اللغة العربية", frLabel: "Langue Arabe", coef: 3 },
    { key: "francais", arLabel: "اللغة الفرنسية", frLabel: "Français", coef: 5 },
    { key: "anglais", arLabel: "اللغة الإنجليزية", frLabel: "Anglais", coef: 5 },
    { key: "third_language", arLabel: "اللغة الأجنبية الثالثة", frLabel: "Troisième langue étrangère", coef: 4 },
    { key: "histoire_geo", arLabel: "التاريخ والجغرافيا", frLabel: "Histoire-Géographie", coef: 2 },
    { key: "philosophy", arLabel: "الفلسفة", frLabel: "Philosophie", coef: 2 },
    { key: "maths", arLabel: "الرياضيات", frLabel: "Mathématiques", coef: 2 },
    { key: "islam", arLabel: "التربية الإسلامية", frLabel: "Éducation Islamique", coef: 2 },
  ],
};

export function getBacSubjectsForFiliere(filiere: LyceeBacFiliere): Subject[] {
  return BAC_SUBJECTS_BY_FILIERE[filiere];
}

// ── 1AM & 2AM ─────────────────────────────────────────────────────────────────
const SUBJECTS_1_2AM: Subject[] = [
  { key: "arabe",        arLabel: "اللغة العربية",                    frLabel: "Langue Arabe",         coef: 3 },
  { key: "maths",        arLabel: "الرياضيات",                        frLabel: "Mathématiques",        coef: 3 },
  { key: "francais",     arLabel: "اللغة الفرنسية",                   frLabel: "Langue Française",     coef: 2 },
  { key: "anglais",      arLabel: "اللغة الإنجليزية",                  frLabel: "Langue Anglaise",      coef: 2 },
  { key: "histoire_geo", arLabel: "التاريخ والجغرافيا",                frLabel: "Histoire-Géographie",  coef: 2 },
  { key: "svt",          arLabel: "علوم الطبيعة والحياة",              frLabel: "SVT",                  coef: 2 },
  { key: "physique",     arLabel: "العلوم الفيزيائية والتكنولوجيا",    frLabel: "Physique-Technologie", coef: 2 },
  { key: "islam",        arLabel: "التربية الإسلامية",                 frLabel: "Éducation Islamique",  coef: 1 },
  { key: "civique",      arLabel: "التربية المدنية",                   frLabel: "Éducation Civique",    coef: 1 },
  { key: "arts",         arLabel: "التربية التشكيلية / الموسيقية",     frLabel: "Arts / Musique",       coef: 1 },
  { key: "eps",          arLabel: "التربية البدنية والرياضية",          frLabel: "EPS",                  coef: 1 },
  { key: "amazigh",      arLabel: "اللغة الأمازيغية",                  frLabel: "Langue Amazighe",      coef: 1 },
];

// ── 3AM — identical to 1AM/2AM ────────────────────────────────────────────────
const SUBJECTS_3AM: Subject[] = [
  { key: "arabe",        arLabel: "اللغة العربية",                    frLabel: "Langue Arabe",         coef: 3 },
  { key: "maths",        arLabel: "الرياضيات",                        frLabel: "Mathématiques",        coef: 3 },
  { key: "francais",     arLabel: "اللغة الفرنسية",                   frLabel: "Langue Française",     coef: 2 },
  { key: "anglais",      arLabel: "اللغة الإنجليزية",                  frLabel: "Langue Anglaise",      coef: 2 },
  { key: "histoire_geo", arLabel: "التاريخ والجغرافيا",                frLabel: "Histoire-Géographie",  coef: 2 },
  { key: "svt",          arLabel: "علوم الطبيعة والحياة",              frLabel: "SVT",                  coef: 2 },
  { key: "physique",     arLabel: "العلوم الفيزيائية والتكنولوجيا",    frLabel: "Physique-Technologie", coef: 2 },
  { key: "islam",        arLabel: "التربية الإسلامية",                 frLabel: "Éducation Islamique",  coef: 1 },
  { key: "civique",      arLabel: "التربية المدنية",                   frLabel: "Éducation Civique",    coef: 1 },
  { key: "arts",         arLabel: "التربية التشكيلية / الموسيقية",     frLabel: "Arts / Musique",       coef: 1 },
  { key: "eps",          arLabel: "التربية البدنية والرياضية",          frLabel: "EPS",                  coef: 1 },
  { key: "amazigh",      arLabel: "اللغة الأمازيغية",                  frLabel: "Langue Amazighe",      coef: 1 },
];

// ── 4AM (BEM) — higher coefficients for core subjects ─────────────────────────
const SUBJECTS_4AM: Subject[] = [
  { key: "arabe",        arLabel: "اللغة العربية",                    frLabel: "Langue Arabe",         coef: 5 },
  { key: "maths",        arLabel: "الرياضيات",                        frLabel: "Mathématiques",        coef: 4 },
  { key: "francais",     arLabel: "اللغة الفرنسية",                   frLabel: "Langue Française",     coef: 3 },
  { key: "histoire_geo", arLabel: "التاريخ والجغرافيا",                frLabel: "Histoire-Géographie",  coef: 3 },
  { key: "svt",          arLabel: "علوم الطبيعة والحياة",              frLabel: "SVT",                  coef: 2 },
  { key: "physique",     arLabel: "العلوم الفيزيائية والتكنولوجيا",    frLabel: "Physique-Technologie", coef: 2 },
  { key: "anglais",      arLabel: "اللغة الإنجليزية",                  frLabel: "Langue Anglaise",      coef: 2 },
  { key: "islam",        arLabel: "التربية الإسلامية",                 frLabel: "Éducation Islamique",  coef: 2 },
  { key: "civique",      arLabel: "التربية المدنية",                   frLabel: "Éducation Civique",    coef: 1 },
  { key: "eps",          arLabel: "التربية البدنية والرياضية",          frLabel: "EPS",                  coef: 1 },
  { key: "amazigh",      arLabel: "اللغة الأمازيغية",                  frLabel: "Langue Amazighe",      coef: 1 },
  // Note: التشكيلية/الموسيقية not listed for 4AM in official BEM coefficients
];

// ── Lookup ────────────────────────────────────────────────────────────────────
export type Niveau = "1AM" | "2AM" | "3AM" | "4AM" | "1AS" | "2AS" | "3AS";

export function getSubjectsForLevel(niveau: Niveau, filiere?: LyceeFiliere): Subject[] {
  if (niveau === "3AS" && filiere && isLyceeBacFiliere(filiere)) {
    return getBacSubjectsForFiliere(filiere);
  }
  switch (niveau) {
    case "1AM":
    case "2AM": return SUBJECTS_1_2AM;
    case "3AM": return SUBJECTS_3AM;
    case "4AM": return SUBJECTS_4AM;
    case "1AS":
    case "2AS":
    case "3AS": return SUBJECTS_LYCEE;
    default:    return SUBJECTS_3AM;
  }
}

/**
 * Calculate weighted trimester average.
 * Formula: Σ(grade × coef) / Σ(coef)
 * Subjects with grade 0 or missing are excluded from both numerator and denominator.
 * Returns null if no valid grades exist.
 */
export function calcWeightedAvg(
  grades: Record<string, number>,
  subjects: Subject[]
): number | null {
  let weightedSum = 0;
  let totalCoef = 0;

  for (const s of subjects) {
    const grade = grades[s.key];
    // Exclude truly missing grades (undefined/null) and negative values.
    // Grade 0 IS valid and must be included so the denominator matches the Ministry's calculation.
    if (grade === undefined || grade === null || isNaN(grade) || grade < 0 || s.coef === 0) continue;
    weightedSum += grade * s.coef;
    totalCoef   += s.coef;
  }

  if (totalCoef === 0) return null;
  return Math.round((weightedSum / totalCoef) * 100) / 100;
}

/**
 * Calculate annual average from three trimester averages.
 * Uses only non-null trimesters.
 */
export function calcAnnualAvg(
  t1: number | null,
  t2: number | null,
  t3: number | null
): number | null {
  const available = [t1, t2, t3].filter((v): v is number => v !== null && Number.isFinite(v));
  if (available.length === 0) return null;
  return Math.round((available.reduce((a, b) => a + b, 0) / available.length) * 100) / 100;
}

/**
 * Determine pass/fail.
 * Pass threshold is 10/20.
 */
export function isPassed(annualAvg: number | null): boolean | null {
  if (annualAvg === null) return null;
  return annualAvg >= 10;
}

// Legacy export for compatibility
export const CEM_SUBJECTS = SUBJECTS_3AM;