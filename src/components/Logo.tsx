import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className = '', size = 40 }: LogoProps) {
  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]"
      >
        <circle cx="50" cy="50" r="48" fill="#004A99" />
        {/* Swan Shape */}
        <path 
          d="M72 45C72 38 65 32 58 32C52 32 48 35 46 38C44 35 40 32 35 32C28 32 22 38 22 45C22 55 35 65 47 72L50 74L53 72C65 65 78 55 78 45" 
          fill="white"
          transform="scale(0.8) translate(12, 12)"
          opacity="0.2"
        />
        <path 
          d="M65 35C65 35 60 25 50 25C40 25 35 35 35 35C35 35 30 40 30 50C30 60 40 75 50 75C60 75 70 60 70 50C70 40 65 35 65 35Z" 
          fill="white"
        />
        <circle cx="50" cy="37.5" r="7.5" fill="#004A99" />
        <circle cx="50" cy="37.5" r="2.5" fill="white" />
      </svg>
    </div>
  );
}
