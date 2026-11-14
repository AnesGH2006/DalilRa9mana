import assert from "node:assert/strict";
import test from "node:test";
import type { StudentResult } from "@shared/types";
import { allocateFourAMStreams, getFourAMScienceWeightedScore } from "./4am-stream-allocation";

function student(id: string, annualAvg: number, science: number, arts: number): StudentResult {
  const termScores = {
    maths: science,
    physique: science,
    svt: science,
    arabe: arts,
    francais: arts,
    anglais: arts,
  };
  return {
    student: { id },
    annualAvg,
    passed: true,
    scores: { "1": termScores, "2": termScores, "3": termScores },
  } as StudentResult;
}

test("calculates the science orientation average with the specified weights", () => {
  const candidate = student("78", 12.88, 13.228, 13);
  assert.equal(Math.round((getFourAMScienceWeightedScore(candidate) ?? 0) * 100) / 100, 13.17);
});

test("allocates the science seat by weighted score while honoring first-choice arts", () => {
  const artsFirst = student("77", 13.2, 15, 13);
  const scienceFirst = student("78", 12.88, 13.228, 13);
  const wishes = new Map([
    ["77", ["جذع مشترك آداب"]],
    ["78", ["جذع مشترك علوم وتكنولوجيا"]],
  ]);

  const assignments = allocateFourAMStreams(
    [artsFirst, scienceFirst],
    { science: 1, arts: 1 },
    wishes,
  );

  assert.equal(assignments.get("78"), "science");
  assert.equal(assignments.get("77"), "arts");
});
