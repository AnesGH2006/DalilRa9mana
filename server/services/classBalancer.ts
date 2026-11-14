/**
 * Automated Class Balancer
 * ------------------------
 * Splits a list of students into a requested number of classes while
 * optimising three objectives simultaneously:
 *
 *   1. Average grade balance       — classes should have similar mean grades
 *   2. Gender ratio balance        — male/female split should be equal across classes
 *   3. Repeating-student spread    — redoublants distributed evenly
 *
 * Algorithm: sort students into a priority queue by a composite key, then
 * distribute them in a snake-draft pattern (class 1, 2, …, N, N, …, 2, 1,
 * repeat) so the strongest and weakest students alternate between classes
 * rather than stacking in one section.
 *
 * Accepts raw student objects — the route layer fetches from DB and passes
 * them in, keeping this file testable without a live database.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StudentInput {
  id: string;
  nomPrenom: string;
  sexe: "M" | "F";
  statut: "nouveau" | "redoublant";
  /** Optional weighted average across all subjects/trimesters (0-20 scale) */
  averageGrade?: number | null;
}

export interface BalancedClass {
  /** Auto-assigned label: أ، ب، ج … */
  label: string;
  students: StudentInput[];
  stats: {
    count: number;
    males: number;
    females: number;
    redoublants: number;
    averageGrade: number | null;
    genderRatioPct: number;   // % male
    redoublantPct: number;
  };
}

export interface ClassBalancerResult {
  classes: BalancedClass[];
  summary: {
    totalStudents: number;
    classCount: number;
    globalAvgGrade: number | null;
    /** Standard deviation of class averages — lower = better balance */
    gradeStdDev: number | null;
    genderBalance: string;
    redoublantBalance: string;
  };
}

export interface ClassBalancerOptions {
  /** How many classes to create (2–10) */
  classCount: number;
  /**
   * Weight of each factor in the composite sort key (0–1, sum need not be 1).
   * Defaults: grade=0.6, gender=0.25, repeating=0.15
   */
  weights?: {
    grade?: number;
    gender?: number;
    repeating?: number;
  };
  /** Optional Arabic instructions used to derive the balancing priorities. */
  rules?: string;
}

// ── Arabic class labels ───────────────────────────────────────────────────────
const CLASS_LABELS = ["أ", "ب", "ج", "د", "هـ", "و", "ز", "ح", "ط", "ي"];

function weightsFromRules(
  rules: string | undefined,
  fallback: NonNullable<ClassBalancerOptions["weights"]> = {},
): Required<NonNullable<ClassBalancerOptions["weights"]>> {
  const text = (rules ?? "").toLowerCase();
  const weights = {
    grade: fallback.grade ?? 0.6,
    gender: fallback.gender ?? 0.25,
    repeating: fallback.repeating ?? 0.15,
  };

  if (/معدل|نقاط|درجات|متفوق/.test(text)) weights.grade = 0.7;
  if (/جنس|ذكور|إناث|بنات|اولاد|أولاد/.test(text)) weights.gender = 0.7;
  if (/معيد|راسب|إعادة|اعادة/.test(text)) weights.repeating = 0.7;
  return weights;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function stddev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

/** Normalise a 0-20 grade into 0-1 (higher = better for sorting) */
function normaliseGrade(g: number | null | undefined): number {
  if (g == null || isNaN(g)) return 0.5; // unknown → treat as median
  return Math.min(Math.max(g / 20, 0), 1);
}

/**
 * Composite sort key for a student.
 * We sort descending so the first student picked is the "strongest" by the
 * combined metric.
 */
function compositeKey(
  student: StudentInput,
  weights: Required<NonNullable<ClassBalancerOptions["weights"]>>,
): number {
  const gradeScore  = normaliseGrade(student.averageGrade) * weights.grade;
  // Males first so snake-draft mixes genders (arbitrary tiebreak direction)
  const genderScore = (student.sexe === "M" ? 1 : 0) * weights.gender;
  // Redoublants first so they're spread across all classes
  const repeatScore = (student.statut === "redoublant" ? 1 : 0) * weights.repeating;
  return gradeScore + genderScore + repeatScore;
}

function buildStats(students: StudentInput[]): BalancedClass["stats"] {
  const males      = students.filter((s) => s.sexe === "M").length;
  const females    = students.length - males;
  const redoublants = students.filter((s) => s.statut === "redoublant").length;
  const grades     = students
    .map((s) => s.averageGrade)
    .filter((g): g is number => g != null && !isNaN(g));
  const avgGrade   = avg(grades);

  return {
    count: students.length,
    males,
    females,
    redoublants,
    averageGrade: avgGrade !== null ? Math.round(avgGrade * 100) / 100 : null,
    genderRatioPct: students.length > 0 ? Math.round((males / students.length) * 100) : 0,
    redoublantPct: students.length > 0 ? Math.round((redoublants / students.length) * 100) : 0,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Split `students` into `options.classCount` balanced classes.
 */
export function balanceClasses(
  students: StudentInput[],
  options: ClassBalancerOptions,
): ClassBalancerResult {
  const classCount = Math.min(Math.max(options.classCount, 2), CLASS_LABELS.length);
  const weights = weightsFromRules(options.rules, options.weights);

  // Sort descending by composite key
  const sorted = [...students].sort(
    (a, b) => compositeKey(b, weights) - compositeKey(a, weights),
  );

  // Initialise empty class buckets
  const buckets: StudentInput[][] = Array.from({ length: classCount }, () => []);

  // Snake-draft distribution
  // Pass 1: 0, 1, 2, …, N-1
  // Pass 2: N-1, N-2, …, 0
  // Pass 3: 0, 1, … etc.
  let forward = true;
  let classIdx = 0;

  for (const student of sorted) {
    buckets[classIdx]!.push(student);

    if (forward) {
      classIdx++;
      if (classIdx >= classCount) {
        classIdx = classCount - 1;
        forward = false;
      }
    } else {
      classIdx--;
      if (classIdx < 0) {
        classIdx = 0;
        forward = true;
      }
    }
  }

  // Build output
  const classes: BalancedClass[] = buckets.map((bucket, i) => ({
    label: CLASS_LABELS[i] ?? String(i + 1),
    students: bucket,
    stats: buildStats(bucket),
  }));

  // Summary
  const allGrades = classes
    .map((c) => c.stats.averageGrade)
    .filter((g): g is number => g !== null);

  const globalAvgGrade = avg(allGrades);
  const gradeStdDev    = stddev(allGrades);

  const genderPcts  = classes.map((c) => c.stats.genderRatioPct);
  const redoPcts    = classes.map((c) => c.stats.redoublantPct);

  const genderRange   = Math.max(...genderPcts)  - Math.min(...genderPcts);
  const redoRange     = Math.max(...redoPcts)    - Math.min(...redoPcts);

  return {
    classes,
    summary: {
      totalStudents: students.length,
      classCount,
      globalAvgGrade:
        globalAvgGrade !== null ? Math.round(globalAvgGrade * 100) / 100 : null,
      gradeStdDev:
        gradeStdDev !== null ? Math.round(gradeStdDev * 1000) / 1000 : null,
      genderBalance:   `فرق ${genderRange}% في نسبة الذكور بين الأقسام`,
      redoublantBalance: `فرق ${redoRange}% في نسبة المعيدين بين الأقسام`,
    },
  };
}
