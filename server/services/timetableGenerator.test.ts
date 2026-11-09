import test from "node:test";
import assert from "node:assert/strict";
import { generateTimetable } from "./timetableGenerator.js";

test("required room types are reserved without overlapping sections", () => {
  const result = generateTimetable(
    [
      { classe: "1AS1", subjects: [{ subject: "العلوم الفيزيائية", periods: 2, requiredRoomType: "lab" }] },
      { classe: "1AS2", subjects: [{ subject: "العلوم الفيزيائية", periods: 2, requiredRoomType: "lab" }] },
      { classe: "1AS3", subjects: [{ subject: "اللغة العربية", periods: 2 }] },
    ],
    ["lab-1", "class-1"],
    {
      periodsPerDay: 2,
      roomTypes: { "lab-1": "lab", "class-1": "classroom" },
    },
  );

  assert.equal(result.unscheduled.length, 0);
  assert.ok(result.slots.filter(slot => slot.subject === "العلوم الفيزيائية").every(slot => slot.roomId === "lab-1"));
  assert.ok(result.slots.filter(slot => slot.subject === "اللغة العربية").every(slot => slot.roomId === "class-1"));
  const occupied = result.slots.map(slot => `${slot.roomId}:${slot.day}:${slot.period}`);
  assert.equal(new Set(occupied).size, occupied.length);
});

test("a required lab lesson remains unscheduled if no matching room exists", () => {
  const result = generateTimetable(
    [{ classe: "1AS1", subjects: [{ subject: "علوم الطبيعة والحياة", periods: 2, consecutivePeriods: 2, requiredRoomType: "lab" }] }],
    ["class-1"],
    { periodsPerDay: 2, roomTypes: { "class-1": "classroom" } },
  );

  assert.equal(result.slots.length, 0);
  assert.equal(result.unscheduled.length, 1);
});

test("two-period sessions use adjacent periods and odd remainders remain schedulable", () => {
  const result = generateTimetable(
    [{ classe: "1AS1", subjects: [{ subject: "الرياضيات", periods: 5, consecutivePeriods: 2 }] }],
    [],
    { periodsPerDay: 5, avoidConsecutiveSameSubject: false },
  );

  assert.equal(result.unscheduled.length, 0);
  assert.equal(result.slots.length, 5);
  const periodsByDay = new Map<number, number[]>();
  for (const slot of result.slots) {
    periodsByDay.set(slot.day, [...(periodsByDay.get(slot.day) ?? []), slot.period]);
  }
  assert.ok([...periodsByDay.values()].some(periods =>
    periods.length >= 2 && periods.some(period => periods.includes(period + 1)),
  ));
});

test("heavy subjects are preferred early and not back-to-back when alternatives exist", () => {
  const result = generateTimetable(
    [{
      classe: "1AS1",
      subjects: [
        { subject: "التربية الإسلامية", periods: 1 },
        { subject: "الرياضيات", periods: 1 },
        { subject: "الفيزياء", periods: 1 },
      ],
    }],
    [],
    { periodsPerDay: 4, workingDays: [0], avoidConsecutiveSameSubject: true },
  );

  const ordered = result.slots.sort((a, b) => a.period - b.period);
  assert.equal(ordered[0]?.subject, "الرياضيات");
  assert.equal(ordered[1]?.subject, "التربية الإسلامية");
  assert.equal(result.unscheduled.length, 0);
});
