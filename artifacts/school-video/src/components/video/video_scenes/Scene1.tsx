import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 w-full h-full flex flex-col justify-center items-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}>
      
      <div className="absolute inset-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/problem-paper.png`} 
          className="w-full h-full object-cover opacity-40 mix-blend-overlay"
          alt=""
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.h1 
          className="text-[6vw] font-display font-bold text-white drop-shadow-lg"
          initial={{ y: 50, opacity: 0, filter: 'blur(10px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          أطنان من السجلات الورقية
        </motion.h1>
        
        <motion.p
          className="text-[3vw] font-sans font-semibold text-red-400 mt-4"
          initial={{ y: 20, opacity: 0 }}
          animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          فوضى في تتبع العلامات والحسابات اليدوية
        </motion.p>
      </div>
    </motion.div>
  );
}
