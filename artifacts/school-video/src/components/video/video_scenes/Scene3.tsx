import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 w-full h-full flex flex-col justify-center items-center bg-[#0f172a]"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}>

      <div className="absolute inset-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/solution-digital.png`} 
          className="w-full h-full object-cover opacity-30"
          alt=""
        />
        <div className="absolute inset-0 bg-indigo-900/40 mix-blend-multiply" />
      </div>

      <div className="relative z-10 w-full max-w-6xl px-12 flex justify-between items-center">
        
        <div className="w-1/2 flex flex-col items-start gap-8">
          <motion.div
             className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl w-full"
             initial={{ x: 100, opacity: 0 }}
             animate={phase >= 1 ? { x: 0, opacity: 1 } : { x: 100, opacity: 0 }}
             transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
             <h3 className="text-[2vw] font-sans font-bold text-white mb-2">إدارة سجلات التلاميذ</h3>
             <div className="h-2 bg-emerald-500 rounded-full w-3/4"></div>
          </motion.div>

          <motion.div
             className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl w-full"
             initial={{ x: 100, opacity: 0 }}
             animate={phase >= 2 ? { x: 0, opacity: 1 } : { x: 100, opacity: 0 }}
             transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
             <h3 className="text-[2vw] font-sans font-bold text-white mb-2">تحليلات وإحصاءات دقيقة</h3>
             <div className="h-2 bg-amber-500 rounded-full w-1/2"></div>
          </motion.div>
          
          <motion.div
             className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl w-full"
             initial={{ x: 100, opacity: 0 }}
             animate={phase >= 3 ? { x: 0, opacity: 1 } : { x: 100, opacity: 0 }}
             transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
             <h3 className="text-[2vw] font-sans font-bold text-white mb-2">تتبع الغيابات والنتائج</h3>
             <div className="h-2 bg-indigo-400 rounded-full w-5/6"></div>
          </motion.div>
        </div>

        <div className="w-1/2 flex justify-center items-center">
           <motion.div 
             className="relative w-64 h-64 border-8 border-emerald-400 rounded-full flex items-center justify-center"
             initial={{ scale: 0, rotate: -90 }}
             animate={{ scale: 1, rotate: 0 }}
             transition={{ duration: 1.5, type: 'spring' }}
           >
             <span className="text-[4vw] font-bold text-white">رقمي</span>
             <motion.div className="absolute top-0 right-0 w-8 h-8 bg-amber-400 rounded-full"
               animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
               transition={{ duration: 2, repeat: Infinity }} />
           </motion.div>
        </div>

      </div>

    </motion.div>
  );
}
