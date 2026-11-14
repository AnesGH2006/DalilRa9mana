import { useCallback, useEffect, useState } from "react";
import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE, setSchoolStage } from "@/lib/deployment";

export function useSchoolStage() {
  const [stage, setStage] = useState<SchoolStage | null>(null);
  const [stageConfigured, setStageConfigured] = useState(false);
  const [stageLoading, setStageLoading] = useState(true);
  const [stageSaving, setStageSaving] = useState(false);
  const [stageError, setStageError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadStage = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}api/school/stage`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({})) as {
          stage?: SchoolStage;
          configured?: boolean;
          error?: string;
        };
        if (!response.ok || (data.stage !== "moyen" && data.stage !== "lycee")) {
          throw new Error(data.error ?? "تعذر تحميل مرحلة المؤسسة.");
        }
        const loadedStage: SchoolStage = data.stage === "lycee" ? "lycee" : "moyen";
        if (!cancelled) {
          const configured = data.configured === true;
          setStage(configured ? loadedStage : null);
          if (configured) setSchoolStage(loadedStage);
          setStageConfigured(configured);
        }
      } catch (error) {
        if (!cancelled) setStageError(error instanceof Error ? error.message : "تعذر تحميل مرحلة المؤسسة.");
      } finally {
        if (!cancelled) setStageLoading(false);
      }
    };
    void loadStage();
    return () => { cancelled = true; };
  }, []);

  const chooseStage = useCallback(async (nextStage: SchoolStage): Promise<boolean> => {
    if (stageSaving || stageLoading) return false;
    if (nextStage === stage && stageConfigured) return true;
    setStageSaving(true);
    setStageError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/school/stage`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: nextStage }),
      });
      const data = await response.json().catch(() => ({})) as { stage?: SchoolStage; error?: string };
      if (!response.ok || data.stage !== nextStage) {
        throw new Error(data.error ?? "تعذر حفظ مرحلة المؤسسة.");
      }
      setStage(nextStage);
      setSchoolStage(nextStage);
      setStageConfigured(true);
      return true;
    } catch (error) {
      setStageError(error instanceof Error ? error.message : "تعذر حفظ مرحلة المؤسسة.");
      return false;
    } finally {
      setStageSaving(false);
    }
  }, [stage, stageConfigured, stageLoading, stageSaving]);

  return { stage, stageConfigured, stageLoading, stageSaving, stageError, chooseStage };
}
