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
        {/* Professional Swan Silhouette */}
        <path 
          d="M20 80C20 80 35 85 55 82C75 79 90 60 90 40C90 15 60 10 50 35C45 47 50 58 60 55C70 52 65 35 50 30C35 25 20 45 20 65C20 85 45 90 65 85" 
          stroke="currentColor" 
          strokeWidth="6" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
        <path 
          d="M45 65C55 65 80 55 80 40" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeOpacity="0.3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
