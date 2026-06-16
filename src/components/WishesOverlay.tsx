import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX, Heart, Sparkles, SkipForward } from 'lucide-react';

interface Occasion {
  id: string;
  date: string; // MM-DD
  title: string;
  message: string;
  image: string;
  audio?: string;
  bgColor: string;
  textColor: string;
}

const OCCASIONS: Occasion[] = [
  {
    id: 'new_year',
    date: '01-01',
    title: 'Happy New Year!',
    message: 'Naye saal ki hardik shubhkamnaye! May this year bring abundance of water and prosperity to your life. \n- Team TankerWala',
    image: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?q=80&w=800',
    bgColor: 'from-purple-600 to-blue-600',
    textColor: 'text-white'
  },
  {
    id: 'republic_day',
    date: '01-26',
    title: 'Happy Republic Day',
    message: 'Gantantra Diwas ki sabhi ko badhai! Proud to serve our nation with pure water. Jai Hind! Vande Mataram! \n- Wishes from TankerWala',
    image: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?q=80&w=800',
    audio: 'https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3', 
    bgColor: 'from-orange-500 via-white to-green-500',
    textColor: 'text-slate-900'
  },
  {
    id: 'holi',
    date: '03-14', // 2025 date
    title: 'Happy Holi!',
    message: 'Rangon ke tyohar ki hardik shubhkamnaye! Let your life be as colorful as Holi and as pure as our water. \n- Wishes from TankerWala',
    image: 'https://images.unsplash.com/photo-1570733577313-097ed43321db?q=80&w=800',
    bgColor: 'from-pink-500 via-yellow-400 to-teal-500',
    textColor: 'text-white'
  },
  {
    id: 'independence_day',
    date: '08-15',
    title: 'Swatantrata Diwas',
    message: '79th Independence Day ki hardik badhai! Vande Mataram! Serving the nation with every drop. \n- Wishes from TankerWala',
    image: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?q=80&w=800',
    audio: 'https://www.soundjay.com/buttons/beep-01a.mp3', 
    bgColor: 'from-orange-600 via-slate-50 to-green-600',
    textColor: 'text-slate-900'
  },
  {
    id: 'gandhi_jayanti',
    date: '10-02',
    title: 'Happy Gandhi Jayanti',
    message: 'Mahatma Gandhi ki jayanti par unke satya aur ahimsa ke marg ko yaad karte hue. \n- Wishes from TankerWala',
    image: 'https://images.unsplash.com/photo-1590494165264-1ebe3602eb80?q=80&w=800',
    bgColor: 'from-slate-100 to-slate-300',
    textColor: 'text-slate-800'
  },
  {
    id: 'diwali',
    date: '10-20', // Approx for 2025
    title: 'Happy Diwali!',
    message: 'Deepawali ki dher saari shubhkamnaye! Is saal roshni ke saath tanki bhi full rahegi! \n- Wishes from TankerWala',
    image: 'https://images.unsplash.com/photo-1573843225224-aa69739d446a?q=80&w=800',
    bgColor: 'from-yellow-500 to-red-600',
    textColor: 'text-white'
  },
  {
    id: 'christmas',
    date: '12-25',
    title: 'Merry Christmas!',
    message: 'Ho Ho Ho! Santa has brought you pure water and happiness. Have a wonderful holiday season! \n- Wishes from TankerWala',
    image: 'https://images.unsplash.com/photo-1544253167-73d74c057cc6?q=80&w=800',
    bgColor: 'from-red-600 to-green-700',
    textColor: 'text-white'
  }
];

export function WishesOverlay() {
  const [currentOccasion, setCurrentOccasion] = useState<Occasion | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const year = today.getFullYear();
    
    const occasion = OCCASIONS.find(o => o.date === mmdd);
    
    if (occasion) {
      const storageKey = `tankerwala_wish_${occasion.id}_${year}`;
      const hasSeenToday = localStorage.getItem(storageKey);
      
      if (!hasSeenToday) {
        setCurrentOccasion(occasion);
        setIsVisible(true);
        localStorage.setItem(storageKey, 'true');
      }
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
  };

  return (
    <AnimatePresence>
      {currentOccasion && isVisible && (
        <motion.div 
          key="wishes-overlay-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md"
        >
          <motion.div 
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            className={`relative w-full max-w-lg bg-gradient-to-br ${currentOccasion.bgColor} rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white/20`}
          >
            {/* Close button */}
            <button 
              onClick={handleClose}
              className="absolute top-6 right-6 z-20 w-12 h-12 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all active:scale-90"
            >
              <X size={24} />
            </button>

            {/* Mute button */}
            {currentOccasion.audio && (
              <button 
                onClick={toggleMute}
                className="absolute top-6 left-6 z-20 w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"
              >
                {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            )}

            {/* Main Content */}
            <div className="relative aspect-[4/5] md:aspect-video w-full overflow-hidden">
              <img 
                src={currentOccasion.image} 
                alt={currentOccasion.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              
              <div className="absolute bottom-0 left-0 right-0 p-8 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="flex justify-center gap-2 mb-4">
                    <Sparkles className="text-yellow-400" size={24} />
                    <Heart className="text-red-400 fill-current" size={24} />
                    <Sparkles className="text-yellow-400" size={24} />
                  </div>
                  <h2 className={`text-4xl font-black mb-4 ${currentOccasion.textColor} tracking-tight`}>
                    {currentOccasion.title}
                  </h2>
                  <div className={`p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 ${currentOccasion.textColor} font-medium leading-relaxed`}>
                     {currentOccasion.message}
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Bottom Branding */}
            <div className="p-6 bg-black/20 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-[10px] font-black uppercase tracking-[0.3em]">Special Greetings From</span>
                <div className="h-[1px] w-8 bg-white/20" />
              </div>
              <div className="text-2xl font-black text-white italic tracking-tighter">TankerWala</div>
              
              <button 
                 onClick={handleClose}
                 className="mt-2 text-white/50 hover:text-white flex items-center gap-2 text-xs font-bold transition-colors uppercase tracking-widest"
              >
                Skip <SkipForward size={14} />
              </button>
            </div>

            {currentOccasion.audio && (
              <audio 
                ref={audioRef}
                src={currentOccasion.audio} 
                autoPlay 
                loop 
                playsInline
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
