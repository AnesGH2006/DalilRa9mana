import { useEffect, useState } from "react";

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const scenes = Object.keys(durations);

  useEffect(() => {
    // Notify environment that recording should start
    if (typeof window !== "undefined" && (window as any).startRecording) {
      (window as any).startRecording();
    }

    let isRunning = true;

    const playLoop = async () => {
      while (isRunning) {
        for (let i = 0; i < scenes.length; i++) {
          if (!isRunning) break;
          setCurrentScene(i);
          const duration = durations[scenes[i]];
          await new Promise(resolve => setTimeout(resolve, duration));
        }

        // Notify environment that one full loop completed
        if (typeof window !== "undefined" && (window as any).stopRecording) {
          (window as any).stopRecording();
        }
      }
    };

    playLoop();

    return () => {
      isRunning = false;
    };
  }, []); // Run once on mount

  return { currentScene };
}
