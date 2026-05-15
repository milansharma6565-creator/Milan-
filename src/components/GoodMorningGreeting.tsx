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
      const todayDate = now.toDateString(); // e.g., "Sat May 09 2026"
      
      // Seeded random for daily smiley based on date string
      const dateSum = todayDate.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const index = dateSum % SMILEYS.length;
      setDailySmiley(SMILEYS[index]);

      // Condition: After 5 AM
      if (currentHour >= 5) {
        const lastSeen = localStorage.getItem('last_morning_greeting');
        if (lastSeen !== todayDate) {
          setShow(true);
        }
      }
    };

    checkGreeting();
  }, []);

  const handleClose = () => {
    const todayDate = new Date().toDateString();
    localStorage.setItem('last_morning_greeting', todayDate);
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[3rem] shadow-2xl max-w-sm w-full p-10 text-center relative overflow-hidden"
          >
            {/* Background Accent */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500" />
            
            <button 
              onClick={handleClose}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X size={24} />
            </button>

            <div className="mb-8 relative inline-block">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-8xl select-none"
              >
                {dailySmiley}
              </motion.div>
            </div>

            <h2 className="text-3xl font-display font-black text-slate-900 mb-4 leading-tight">
              Good Morning 🌞
            </h2>
            
            <p className="text-xl font-medium text-slate-600 mb-10 italic">
              "Toh chaliye shurut karte hai"
            </p>

            <button
              onClick={handleClose}
              className="w-full bg-slate-900 text-white h-16 rounded-2xl font-bold text-lg shadow-xl shadow-slate-200 active:scale-95 transition-all"
            >
              Shuru Karein 🚀
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
