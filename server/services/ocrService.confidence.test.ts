import test from "node:test";
import assert from "node:assert/strict";
import { estimateLineConfidence } from "./ocrService.js";

test("valid grade line should not be marked as low confidence", () => {
  const confidence = estimateLineConfidence("سارة محمد", 14.5, "grades");
  assert.ok(confidence >= 80, `expected confidence >= 80 but got ${confidence}`);
});

test("valid absence line should not be marked as low confidence", () => {
  const confidence = estimateLineConfidence("أمين بوشوشة", { justifiedHours: 2, unjustifiedHours: 5 }, "absences");
  assert.ok(confidence >= 80, `expected confidence >= 80 but got ${confidence}`);
});
