import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div className="absolute inset-0 w-full h-full flex flex-col justify-center items-center bg-indigo-900 z-30"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}>
      
      <motion.h1 
        className="text-[8vw] font-display font-bold text-emerald-400 drop-shadow-2xl mb-4"
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 100, damping: 15 }}
      >
        أدر متوسطتك بكفاءة
      </motion.h1>

      <motion.p
        className="text-[3vw] font-sans text-white/80"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        سجلات التلاميذ والنتائج والإحصاءات وأكثر
      </motion.p>
    </motion.div>
  );
}
