import { parseGradeScore, parseVisionJson, parseAttendanceStatus } from "./visionOcrService.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(parseGradeScore("14,5") === 14.5, "European comma");
assert(parseGradeScore("٢٠") === 20, "Arabic-Indic 20");
assert(parseGradeScore("20.01") === null, "out of range");
assert(parseGradeScore("") === null, "empty");
assert(parseAttendanceStatus("غائب") === "ABSENT", "absent");
assert(parseAttendanceStatus("مبرر") === "EXCUSED", "excused");

const records = parseVisionJson(JSON.stringify({
  records: [
    { student_name: "بن علي أحمد", continuous_eval: "14,5", test_1: 12, exam: null, status: "PRESENT" },
    { student_name: "  ", exam: 10 },
  ],
}));
assert(records.length === 1, "skip empty names");
assert(records[0]!.continuous_eval === 14.5, "comma in json string");
assert(records[0]!.exam === null, "null exam");

console.log("visionOcrService helpers ok");
