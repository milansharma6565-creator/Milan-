import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  color?: string;
}

export function Logo({ className = '', size = 40, color }: LogoProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size, color: color }}>
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Majestic Flying Swan */}
        <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Outstretched neck and head flying high and forward (rightwards) */}
          <path d="M30 55C38 55 48 50 56 42C64 34 76 26 84 24C88 23 90 25 87 28C84 31 74 40 68 48C62 56 50 62 38 62Z" fill="currentColor" fillOpacity="0.15" />
          
          {/* Spread wings sweeping gracefully upwards & back */}
          <path d="M40 48C45 35 48 18 42 10C37 12 36 25 38 38C39 45 34 42 28 34C22 26 18 20 14 24C18 32 25 44 32 50C35 52 32 55 24 53C16 51 10 48 8 52C12 58 22 65 30 62" />
          
          {/* Streamlined feathers and wind trails underneath */}
          <path d="M18 72C30 76 45 74 58 68" strokeWidth="3" opacity="0.6" strokeDasharray="3 3" />
          <path d="M28 80C40 82 52 78 64 72" strokeWidth="2" opacity="0.4" />
        </g>
      </svg>
    </div>
  );
}
