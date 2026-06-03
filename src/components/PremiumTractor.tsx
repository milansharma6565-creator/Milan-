import React from 'react';
import { motion } from 'motion/react';
import { Gauge, Droplets } from 'lucide-react';

export function PremiumTractor() {
  return (
    <div className="relative w-full max-w-sm mx-auto aspect-square group">
      {/* Dynamic Background Glow - Simplified to static backdrop with simple pulse to save resources */}
      <div 
        className="absolute inset-0 bg-blue-400/10 blur-[80px] rounded-full animate-pulse pointer-events-none"
        style={{ willChange: 'opacity' }}
      />

      {/* Floating bobbing Container (Hardware-accelerated 2D float instead of heavy 3D rotate + scale) */}
      <motion.div 
        animate={{ 
          y: [0, -8, 0]
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        className="w-full h-full relative"
        style={{ willChange: 'transform' }}
      >
        {/* Floating Badges */}
        <div className="absolute -top-4 -right-4 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-lg z-20 border border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
            <Gauge size={18} />
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Status</div>
            <div className="text-[10px] font-bold text-slate-900 leading-none">High HP</div>
          </div>
        </div>

        <div className="absolute bottom-10 -left-10 bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl shadow-xl z-20 border border-slate-700 flex items-center gap-2 text-white">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Droplets size={18} />
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Capacity</div>
            <div className="text-[10px] font-bold leading-none">5000L+</div>
          </div>
        </div>

        {/* Main Tractor Illustration (Optimized SVG with hardware-driven rotations) */}
        <svg viewBox="0 0 200 200" className="w-full h-full filter drop-shadow-[0_20px_20px_rgba(30,58,138,0.15)]">
          {/* Shadow */}
          <ellipse cx="100" cy="160" rx="60" ry="15" fill="rgba(0,0,0,0.05)" />
          
          {/* THE TANK (Back Layer) */}
          <g>
            <rect x="90" y="60" width="80" height="60" rx="30" fill="#1e40af" />
            <rect x="100" y="70" width="60" height="40" rx="20" fill="#3b82f6" />
            <rect x="110" y="65" width="40" height="5" rx="2.5" fill="white" fillOpacity="0.2" />
            
            {/* Tank Caps */}
            <circle cx="110" cy="62" r="4" fill="#1d4ed8" />
            <circle cx="150" cy="62" r="4" fill="#1d4ed8" />
          </g>

          {/* CHASSIS & ENGINE */}
          <path d="M40 140 L40 100 L70 80 L110 80 L110 140 Z" fill="#1e3a8a" />
          
          {/* Cabin (Glass Look) */}
          <path d="M70 80 L95 80 L105 130 L45 130 Z" fill="#60a5fa" fillOpacity="0.3" stroke="#93c5fd" strokeWidth="1" />
          <path d="M75 85 L90 85 L98 120 L55 120 Z" fill="#ffffff" fillOpacity="0.2" />
          
          {/* Front Grill */}
          <rect x="35" y="110" width="10" height="25" rx="2" fill="#0f172a" />
          {[...Array(5)].map((_, i) => (
             <line key={i} x1="37" y1={115 + i*4} x2="43" y2={115 + i*4} stroke="white" strokeWidth="0.5" strokeOpacity="0.3" />
          ))}

          {/* Headlights */}
          <circle cx="45" cy="115" r="3" fill="#fbbf24" style={{ filter: 'blur(0.5px)' }} />
          <circle cx="45" cy="115" r="1.5" fill="white" />
          
          {/* WHEELS (Hardware Accelerated Rotations using CSS transform-origin) */}
          {/* Front Small Wheel */}
          <motion.g 
            animate={{ rotate: 360 }} 
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: '60px 150px', willChange: 'transform' }}
          >
             <circle cx="60" cy="150" r="18" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
             <circle cx="60" cy="150" r="10" fill="#334155" />
             <circle cx="60" cy="150" r="4" fill="#94a3b8" />
             <rect x="58" y="140" width="4" height="20" fill="rgba(255,255,255,0.08)" />
          </motion.g>

          {/* Back Large Wheels */}
          <motion.g 
            animate={{ rotate: 360 }} 
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: '140px 150px', willChange: 'transform' }}
          >
             <circle cx="140" cy="150" r="24" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
             <circle cx="140" cy="150" r="14" fill="#334155" />
             <circle cx="140" cy="150" r="6" fill="#94a3b8" />
             <rect x="138" y="135" width="4" height="30" fill="rgba(255,255,255,0.08)" />
          </motion.g>
          
          {/* Exhaust Pipe & Smoke (Lighter scale & opacity shifts to lower CPU cycle strain) */}
          <rect x="75" y="60" width="6" height="30" fill="#475569" />
          <g>
            {[0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={78}
                cy={55}
                r={3.5}
                fill="#cbd5e1"
                initial={{ opacity: 0, y: 0, x: 0 }}
                animate={{ 
                  opacity: [0, 0.3, 0],
                  y: [-8, -32],
                  x: [0, 10],
                  scale: [0.6, 1.3]
                }}
                transition={{ 
                  duration: 2.2, 
                  repeat: Infinity, 
                  delay: i * 0.7,
                  ease: "easeOut"
                }}
                style={{ willChange: 'transform, opacity' }}
              />
            ))}
          </g>
        </svg>

        {/* Dynamic Shadow Ring */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-48 h-12 bg-blue-600/5 blur-xl rounded-full -z-10" />
      </motion.div>
      
      {/* Info Label */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
        <h4 className="text-sm font-black text-slate-800 tracking-tight">Rajhans Series VII</h4>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Heavy Duty Tanker</p>
      </div>
    </div>
  );
}
