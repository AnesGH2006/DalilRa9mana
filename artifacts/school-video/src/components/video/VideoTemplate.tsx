import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';

const SCENE_DURATIONS = { open: 4000, transition: 3000, solution: 6000, close: 4000 };

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0f172a]">
      {/* Background layer */}
      <div className="absolute inset-0">
         <motion.div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[100px] opacity-30"
          style={{ background: 'radial-gradient(circle, #4f46e5, transparent)' }}
          animate={{
            scale: [1, 1.2, 0.9],
            x: currentScene >= 2 ? '-30vw' : '0vw'
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
         <motion.div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-20"
          style={{ background: 'radial-gradient(circle, #10b981, transparent)' }}
          animate={{
            scale: [0.9, 1.1, 1],
            x: currentScene >= 2 ? '20vw' : '0vw'
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="transition" />}
        {currentScene === 2 && <Scene3 key="solution" />}
        {currentScene === 3 && <Scene4 key="close" />}
      </AnimatePresence>
    </div>
  );
}
