import React from "react";
import { Subject, GradeValues } from "../grading/types";

interface BreakdownTableProps {
  subjects: Subject[];
  values: GradeValues;
}

const BreakdownTable: React.FC<BreakdownTableProps> = ({ subjects, values }) => {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-2 px-3 font-medium text-xs text-gray-500 dark:text-gray-400">Matière</th>
            <th className="text-left py-2 px-3 font-medium text-xs text-gray-500 dark:text-gray-400">Note /20</th>
            <th className="text-left py-2 px-3 font-medium text-xs text-gray-500 dark:text-gray-400">Coef.</th>
            <th className="text-left py-2 px-3 font-medium text-xs text-gray-500 dark:text-gray-400">Points</th>
            <th className="text-left py-2 px-3 font-medium text-xs text-gray-500 dark:text-gray-400">Statut</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => {
            const v = parseFloat(values[s.name] || "0");
            const pts = (v * s.coef).toFixed(2);
            const pass = v >= 10;
            return (
              <tr
                key={s.name}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className={`py-2 px-3 ${!pass ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>
                  {s.name}
                </td>
                <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">
                  {v.toFixed(2)}
                </td>
                <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{s.coef}</td>
                <td className="py-2 px-3 text-gray-900 dark:text-gray-100">{pts}</td>
                <td className="py-2 px-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      pass
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                    }`}
                  >
                    {pass ? "Réussi" : "Échoué"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BreakdownTable;