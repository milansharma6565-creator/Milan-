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
        <defs>
          <style>{`
            @keyframes swan-bob {
              0%, 100% { transform: translateY(0px) rotate(0deg); }
              50% { transform: translateY(-4px) rotate(1.5deg); }
            }
            @keyframes swan-flap-top {
              0%, 100% { transform: rotate(0deg) scaleY(1); }
              50% { transform: rotate(-18deg) scaleY(0.65) translateY(2px); }
            }
            @keyframes swan-flap-bottom {
              0%, 100% { transform: rotate(0deg) scaleY(1); }
              50% { transform: rotate(8deg) scaleY(0.75); }
            }
            @keyframes wind-flow {
              0% { stroke-dashoffset: 0; }
              100% { stroke-dashoffset: -50; }
            }
            .swan-body {
              animation: swan-bob 2.8s ease-in-out infinite;
              transform-origin: 30px 55px;
            }
            .swan-wing-top {
              animation: swan-flap-top 1.4s ease-in-out infinite;
              transform-origin: 38px 45px;
            }
            .swan-wing-bottom {
              animation: swan-flap-bottom 1.4s ease-in-out infinite;
              transform-origin: 25px 48px;
            }
            .wind-trail-1 {
              stroke-dasharray: 12, 38;
              animation: wind-flow 1s linear infinite;
            }
            .wind-trail-2 {
              stroke-dasharray: 18, 32;
              animation: wind-flow 1.4s linear infinite;
            }
          `}</style>
        </defs>

        {/* Majestic Flying Swan */}
        <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Bobbing swan body, neck and head */}
          <g className="swan-body">
            {/* Outstretched neck and head flying high and forward */}
            <path 
              d="M30 55C38 55 48 50 56 42C64 34 76 26 84 24C88 23 90 25 87 28C84 31 74 40 68 48C62 56 50 62 38 62Z" 
              fill="currentColor" 
              fillOpacity="0.15" 
            />
            
            {/* Upper flapping wing */}
            <path 
              className="swan-wing-top" 
              d="M40 48C45 35 48 18 42 10C37 12 36 25 38 38C39 45 34 42" 
              fill="currentColor"
              fillOpacity="0.05"
            />
            
            {/* Tail feathers and lower wing structure */}
            <path 
              className="swan-wing-bottom" 
              d="M28 34C22 26 18 20 14 24C18 32 25 44 32 50C35 52 32 55 24 53C16 51 10 48 8 52C12 58 22 65 30 62" 
            />
          </g>
          
          {/* Moving current-speed trails */}
          <path d="M10 74C25 78 42 76 58 68" strokeWidth="3" opacity="0.6" className="wind-trail-1" />
          <path d="M20 82C35 84 50 80 64 72" strokeWidth="2.5" opacity="0.4" className="wind-trail-2" />
        </g>
      </svg>
    </div>
  );
}
