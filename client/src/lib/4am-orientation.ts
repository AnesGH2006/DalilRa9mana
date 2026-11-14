export type DesiredStream = "SCIENCE_TECH" | "ARTS";

export interface OrientationCaseInput {
  student_info: {
    student_id: string;
    name: string;
    desired_stream: DesiredStream;
  };
  annual_subject_averages: {
    math: number;
    physics: number;
    natural_science: number;
    arabic: number;
    french: number;
    english: number;
    history_geo: number;
  };
  annual_general_average: number;
  bem_exam_average: number | null;
  remedial_scores: {
    math: number | null;
    physics: number | null;
  } | null;
}

export interface OrientationAssessment {
  finalAverage: number | null;
  passedToSecondary: boolean | null;
  scienceAverage: number;
  weightedScienceScore: number;
  artsAverage: number;
  desiredStreamScore: number;
  desiredStreamEligible: boolean | null;
  desiredStreamLabel: string;
  remedialScores: OrientationCaseInput["remedial_scores"];
  appealDistance: number | null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function assessOrientationCase(input: OrientationCaseInput, seatCutoff: number | null = null): OrientationAssessment {
  const { annual_general_average: annualAverage, bem_exam_average: bemAverage } = input;
  const { annual_subject_averages: subjects } = input;
  const scienceAverage = mean([subjects.math, subjects.physics, subjects.natural_science]);
  const artsAverage = mean([subjects.arabic, subjects.french, subjects.english]);
  const weightedScienceScore = (
    subjects.math * 4 + subjects.physics * 3 + subjects.natural_science * 3 + annualAverage * 2
  ) / 12;

  const finalAverage = bemAverage === null
    ? annualAverage
    : bemAverage >= 10
      ? bemAverage
      : Math.round(((annualAverage + bemAverage) / 2) * 100) / 100;

  const desiredStreamScore = input.student_info.desired_stream === "SCIENCE_TECH"
    ? weightedScienceScore
    : artsAverage;

  return {
    finalAverage,
    passedToSecondary: finalAverage === null ? null : finalAverage >= 10,
    scienceAverage,
    weightedScienceScore,
    artsAverage,
    desiredStreamScore,
    desiredStreamEligible: seatCutoff === null ? null : desiredStreamScore >= seatCutoff,
    desiredStreamLabel: input.student_info.desired_stream === "SCIENCE_TECH"
      ? "جذع مشترك علوم وتكنولوجيا"
      : "جذع مشترك آداب",
    remedialScores: input.remedial_scores,
    appealDistance: seatCutoff === null ? null : Math.max(0, seatCutoff - desiredStreamScore),
  };
}

export function parseOrientationCase(value: unknown): OrientationCaseInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("يجب أن يكون الإدخال كائن JSON.");
  }

  const record = value as Record<string, unknown>;
  const student = record.student_info as Record<string, unknown> | undefined;
  const subjects = record.annual_subject_averages as Record<string, unknown> | undefined;
  const remedial = record.remedial_scores as Record<string, unknown> | null | undefined;
  const errors: string[] = [];

  const isScore = (score: unknown): score is number => typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 20;
  const requireText = (parent: Record<string, unknown> | undefined, key: string, label: string) => {
    const item = parent?.[key];
    if (typeof item !== "string" || item.trim() === "") errors.push(`${label}: قيمة نصية مطلوبة.`);
    return typeof item === "string" ? item.trim() : "";
  };
  const requireScore = (parent: Record<string, unknown> | undefined, key: string, label: string) => {
    const item = parent?.[key];
    if (!isScore(item)) errors.push(`${label}: أدخل علامة بين 0 و20.`);
    return isScore(item) ? item : 0;
  };
  const optionalScore = (parent: Record<string, unknown> | null | undefined, key: string, label: string) => {
    const item = parent?.[key];
    if (item === null || item === undefined) return null;
    if (!isScore(item)) errors.push(`${label}: أدخل علامة بين 0 و20 أو null.`);
    return isScore(item) ? item : null;
  };
  const requireNullableScore = (parent: Record<string, unknown> | null | undefined, key: string, label: string) => {
    if (!parent || !Object.prototype.hasOwnProperty.call(parent, key)) {
      errors.push(`${label}: الحقل مطلوب، وأدخل علامة بين 0 و20 أو null.`);
      return null;
    }
    return optionalScore(parent, key, label);
  };

  const desiredStream = student?.desired_stream;
  if (desiredStream !== "SCIENCE_TECH" && desiredStream !== "ARTS") {
    errors.push("student_info.desired_stream: اختر SCIENCE_TECH أو ARTS.");
  }
  if (record.remedial_scores !== null && (typeof remedial !== "object" || remedial === null || Array.isArray(remedial))) {
    errors.push("remedial_scores: أدخل كائن العلامات أو null.");
  }
  if (!Object.prototype.hasOwnProperty.call(record, "remedial_scores")) {
    errors.push("remedial_scores: الحقل مطلوب، أدخل العلامات أو null.");
  }

  const parsed: OrientationCaseInput = {
    student_info: {
      student_id: requireText(student, "student_id", "student_info.student_id"),
      name: requireText(student, "name", "student_info.name"),
      desired_stream: desiredStream === "ARTS" ? "ARTS" : "SCIENCE_TECH",
    },
    annual_subject_averages: {
      math: requireScore(subjects, "math", "annual_subject_averages.math"),
      physics: requireScore(subjects, "physics", "annual_subject_averages.physics"),
      natural_science: requireScore(subjects, "natural_science", "annual_subject_averages.natural_science"),
      arabic: requireScore(subjects, "arabic", "annual_subject_averages.arabic"),
      french: requireScore(subjects, "french", "annual_subject_averages.french"),
      english: requireScore(subjects, "english", "annual_subject_averages.english"),
      history_geo: requireScore(subjects, "history_geo", "annual_subject_averages.history_geo"),
    },
    annual_general_average: requireScore(record, "annual_general_average", "annual_general_average"),
    bem_exam_average: requireNullableScore(record, "bem_exam_average", "bem_exam_average"),
    remedial_scores: record.remedial_scores === null ? null : {
      math: requireNullableScore(remedial, "math", "remedial_scores.math"),
      physics: requireNullableScore(remedial, "physics", "remedial_scores.physics"),
    },
  };

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return parsed;
}
