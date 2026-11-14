import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div className="absolute inset-0 w-full h-full flex items-center justify-center bg-indigo-600 z-20"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}>
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.8, type: 'spring' }}
      >
        <h2 className="text-[8vw] font-display font-bold text-white drop-shadow-xl text-center">
          لكن الآن...
        </h2>
      </motion.div>
    </motion.div>
  );
}
