import { Subject, GradeValues, GradeStats, ResultBadge } from "./types";

export function calcStats(subjects: Subject[], values: GradeValues): GradeStats {
  let totalPoints = 0;
  let totalCoef = 0;
  let passCount = 0;
  let failCount = 0;

  subjects.forEach((s) => {
    const v = parseFloat(values[s.name] || "0");
    totalPoints += v * s.coef;
    totalCoef += s.coef;
    if (v >= 10) passCount++;
    else failCount++;
  });

  const avg = totalCoef ? totalPoints / totalCoef : 0;
  return {
    avg: avg.toFixed(2),
    totalPoints: totalPoints.toFixed(1),
    totalCoef,
    passCount,
    failCount,
  };
}

export function getBadgeCEM(avg: number, failCount: number): ResultBadge {
  if (avg >= 10) return { cls: "admis", icon: "✓", text: "Admis au BEM" };
  if (avg >= 9 && failCount <= 2)
    return { cls: "recalage", icon: "⚠", text: "Raccrochage possible" };
  return { cls: "refuse", icon: "✗", text: "Non admis" };
}

export function getBadgeBAC(avg: number, failCount: number): ResultBadge {
  if (avg >= 10) return { cls: "admis", icon: "✓", text: "Admis au BAC" };
  if (avg >= 9 && failCount <= 2)
    return { cls: "recalage", icon: "⚠", text: "Oral de rattrapage" };
  return { cls: "refuse", icon: "✗", text: "Non admis" };
}

export function getBadgeTrimestre(avg: number): ResultBadge {
  if (avg >= 14) return { cls: "admis", icon: "★", text: "Excellent" };
  if (avg >= 12) return { cls: "admis", icon: "✓", text: "Bien" };
  if (avg >= 10) return { cls: "recalage", icon: "✓", text: "Passable" };
  if (avg >= 8) return { cls: "recalage", icon: "⚠", text: "Insuffisant" };
  return { cls: "refuse", icon: "✗", text: "Faible" };
}

export function getBarColor(note: number): string {
  if (note >= 16) return "#1D9E75";
  if (note >= 10) return "#378ADD";
  if (note >= 8) return "#EF9F27";
  return "#E24B4A";
}

export function getWorstSubjects(
  subjects: Subject[],
  values: GradeValues,
  limit = 3
): Subject[] {
  return [...subjects]
    .filter((s) => (parseFloat(values[s.name] || "0")) < 10)
    .sort(
      (a, b) =>
        (parseFloat(values[a.name] || "0")) -
        (parseFloat(values[b.name] || "0"))
    )
    .slice(0, limit);
}

export function getTrimestreReco(avg: number): string {
  if (avg >= 14) return "Excellents résultats. Continuez sur cette lancée.";
  if (avg >= 12)
    return "Bons résultats. Quelques efforts supplémentaires pour atteindre l'excellence.";
  if (avg >= 10)
    return "Résultats acceptables. Un travail régulier permettra de progresser.";
  if (avg >= 8)
    return "Résultats insuffisants. Des efforts importants sont nécessaires, notamment dans les matières à fort coefficient.";
  return "Résultats faibles. Une remise à niveau urgente est recommandée. Consultez votre professeur principal.";
}