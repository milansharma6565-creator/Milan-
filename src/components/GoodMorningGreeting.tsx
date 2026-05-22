import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

const SMILEYS = ['😊', '😇', '🤠', '😎', '🌞', '🥳', '🥰', '✨', '🌈', '💎'];

export function GoodMorningGreeting() {
  const [show, setShow] = useState(false);
  const [dailySmiley, setDailySmiley] = useState('🌞');

  useEffect(() => {
    const checkGreeting = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const todayDate = now.toDateString();
      
      const dateSum = todayDate.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const index = dateSum % SMILEYS.length;
      setDailySmiley(SMILEYS[index]);

      // Show greeting once a day
      const lastSeen = localStorage.getItem('last_morning_greeting');
      if (lastSeen !== todayDate) {
        setShow(true);
        // Auto-hide after 2 seconds
        const timer = setTimeout(() => {
          handleClose();
        }, 2000);
        return () => clearTimeout(timer);
      }
    };

    checkGreeting();
  }, []);

  const handleClose = () => {
    const todayDate = new Date().toDateString();
    localStorage.setItem('last_morning_greeting', todayDate);
    setShow(false);
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-white"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              transition: {
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1]
              }
            }}
            className="text-center"
          >
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-9xl mb-8 select-none"
            >
              {dailySmiley}
            </motion.div>

            <motion.h2 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-5xl font-display font-black text-slate-900 leading-tight"
            >
              Good Morning <span className="text-blue-600">!</span>
            </motion.h2>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-lg font-bold text-slate-400 uppercase tracking-[0.2em] mt-4"
            >
              TankerWala is ready for you
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
