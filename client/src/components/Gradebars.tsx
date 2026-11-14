import React from "react";
import { Subject, GradeValues } from "../grading/types";
import { getBarColor } from "../grading/utils";

interface GradeBarsProps {
  subjects: Subject[];
  values: GradeValues;
}

const GradeBars: React.FC<GradeBarsProps> = ({ subjects, values }) => {
  return (
    <div className="space-y-2 mb-6">
      {subjects.map((s) => {
        const v = parseFloat(values[s.name] || "0");
        const pct = Math.min(100, (v / 20) * 100).toFixed(1);
        const color = getBarColor(v);
        return (
          <div key={s.name} className="flex items-center gap-3 text-xs">
            <span className="w-36 text-gray-500 dark:text-gray-400 truncate flex-shrink-0">
              {s.name}
            </span>
            <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-8 text-right font-medium text-gray-900 dark:text-gray-100">
              {v.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default GradeBars;