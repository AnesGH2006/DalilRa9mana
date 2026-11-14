import { useEffect, useState } from "react";
import type { OrientationWish } from "@shared/types";

const BASE = import.meta.env.BASE_URL;

export function useOrientationWishes(year: string): Map<string, string[]> {
  const [wishes, setWishes] = useState<OrientationWish[]>([]);

  useEffect(() => {
    let active = true;
    setWishes([]);
    fetch(`${BASE}api/orientation/wishes?annee=${encodeURIComponent(year)}`, { credentials: "include" })
      .then(response => response.ok ? response.json() as Promise<OrientationWish[]> : [])
      .then(data => { if (active && Array.isArray(data)) setWishes(data); })
      .catch(() => { if (active) setWishes([]); });
    return () => { active = false; };
  }, [year]);

  return new Map(wishes.flatMap(wish => wish.studentId ? [[wish.studentId, wish.choices] as const] : []));
}
