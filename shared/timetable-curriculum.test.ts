import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEEKLY_PERIODS,
  LYCEE_PROGRAMS,
} from "./timetable-curriculum.js";

test("secondary curriculum includes every stream in the supplied result sheets", () => {
  const programIds = new Set(LYCEE_PROGRAMS.map(program => program.id));
  for (const id of [
    "1AS-sciences", "1AS-literature",
    "2AS-literature", "2AS-management", "2AS-sciences",
    "2AS-technical-civil", "2AS-technical-mechanical", "2AS-foreign-spanish",
    "3AS-literature", "3AS-management", "3AS-sciences",
    "3AS-technical-electrical", "3AS-technical-civil", "3AS-technical-mechanical",
    "3AS-foreign-spanish",
  ]) {
    assert.ok(programIds.has(id), `missing curriculum ${id}`);
  }
});

test("each secondary program has an editable weekly-period entry for every subject", () => {
  for (const program of LYCEE_PROGRAMS) {
    const curriculum = DEFAULT_WEEKLY_PERIODS[program.id];
    assert.ok(curriculum, `missing weekly-period template for ${program.id}`);
    for (const subject of program.subjects) {
      assert.equal(typeof curriculum[subject], "number", `${program.id} is missing ${subject}`);
    }
  }
});

test("unverified high-school period counts start at zero", () => {
  for (const program of LYCEE_PROGRAMS.filter(item => item.id !== "1AS-sciences")) {
    assert.ok(Object.values(DEFAULT_WEEKLY_PERIODS[program.id]!).every(periods => periods === 0));
  }
});
