import React from "react";
import { Subject, GradeValues } from "../grading/types";

interface SubjectGridProps {
  subjects: Subject[];
  values: GradeValues;
  onChange: (name: string, value: string) => void;
}

const SubjectGrid: React.FC<SubjectGridProps> = ({
  subjects,
  values,
  onChange,
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
      {subjects.map((s) => (
        <div
          key={s.name}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
        >
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            {s.name}
          </label>
          <input
            type="number"
            min={0}
            max={20}
            step={0.25}
            placeholder="— /20"
            value={values[s.name] || ""}
            onChange={(e) => onChange(s.name, e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Coefficient : {s.coef}</p>
        </div>
      ))}
    </div>
  );
};

export default SubjectGrid;