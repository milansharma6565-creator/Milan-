import React from 'react';

interface SwanLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

export const SwanLogo: React.FC<SwanLogoProps> = ({ 
  className = "", 
  size = 40, 
  color = "currentColor" 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Professional Minimalist Swan Logo */}
      <path 
        d="M20 80C20 80 35 85 50 80C65 75 80 60 80 40C80 20 60 15 55 15C50 15 45 20 45 30C45 40 55 45 60 40C65 35 60 30 55 30C52 30 50 32 50 35C50 45 65 50 65 65C65 80 50 85 30 80C10 75 10 60 10 60" 
        stroke={color} 
        strokeWidth="4" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      <path 
        d="M30 65C40 65 70 55 70 40" 
        stroke={color} 
        strokeWidth="2" 
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
    </svg>
  );
};
