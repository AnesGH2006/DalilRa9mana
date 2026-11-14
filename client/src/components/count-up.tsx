import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  to: number;
  duration?: number;
  className?: string;
}

export function CountUp({ to, duration = 1.4, className }: CountUpProps) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const prevTo = useRef(0);

  useEffect(() => {
    const from = prevTo.current;
    prevTo.current = to;
    startTimeRef.current = null;

    function tick(ts: number) {
      if (!startTimeRef.current) startTimeRef.current = ts;
      const elapsed = (ts - startTimeRef.current) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out expo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(from + (to - from) * ease));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [to, duration]);

  return <span className={className}>{value.toLocaleString("ar-DZ")}</span>;
}
