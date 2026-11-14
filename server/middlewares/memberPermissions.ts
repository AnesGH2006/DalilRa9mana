import type { Request, Response, NextFunction } from "express";
import type { StaffPermission } from "../../shared/member-permissions.js";

const PATH_PERMISSIONS: Array<[RegExp, StaffPermission]> = [
  [/^\/orientation\/wishes\/import(?:\/|$)/, "imports"],
  [/^\/students\/import(?:\/|$)/, "imports"],
  [/^\/students\/auto-detect-repeaters(?:\/|$)/, "yearend"],
  [/^\/students(?:\/|$)/, "students"],
  [/^\/teacher\/students(?:\/|$)/, "students"],
  [/^\/teacher\/grades(?:\/|$)/, "results"],
  [/^\/(?:grades|results|bem|bac)(?:\/|$)/, "results"],
  [/^\/absences(?:\/|$)/, "absences"],
  [/^\/v1\/attendance(?:\/|$)/, "absences"],
  [/^\/(?:yearend|repeaters)(?:\/|$)/, "yearend"],
  [/^\/(?:orientation|preorient|transfer-results|orientation-results|councils)(?:\/|$)/, "orientation"],
  [/^\/(?:stats|analytics)(?:\/|$)/, "analytics"],
  [/^\/(?:reports|documents)(?:\/|$)/, "reports"],
  [/^\/(?:import|excel-injection|ocr)(?:\/|$)/, "imports"],
  [/^\/(?:timetable|class-balancer|substitution)(?:\/|$)/, "planning"],
  [/^\/v1\/(?:pedagogy|ai|notifications\/disciplinary)(?:\/|$)/, "pedagogy"],
];

export function memberPermissionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const member = req.memberContext;
  if (!member || member.role === "parent") {
    next();
    return;
  }

  const requiredPermission = PATH_PERMISSIONS.find(([pattern]) => pattern.test(req.path))?.[1];
  if (requiredPermission && !member.permissions.includes(requiredPermission)) {
    res.status(403).json({ error: "You do not have permission to access this feature" });
    return;
  }

  next();
}
