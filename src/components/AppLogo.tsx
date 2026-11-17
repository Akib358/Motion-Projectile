import { useState } from 'react';
import logoUrl from '../assets/logo.jpg';

interface AppLogoProps {
  className?: string;
  size?: number;
}

export function AppLogo({ className = 'w-8 h-8', size = 32 }: AppLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <svg
        className={className}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="PROJECTILE LAB logo"
      >
        <rect width="40" height="40" rx="10" fill="url(#logoGrad)" />
        {/* Parabolic trajectory arc */}
        <path
          d="M 6 34 Q 20 6 34 34"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeDasharray="3 2"
          strokeLinecap="round"
        />
        {/* Target bullseye */}
        <circle cx="34" cy="34" r="3" fill="#facc15" stroke="#ffffff" strokeWidth="1.5" />
        {/* Projectile ball at apogee */}
        <circle cx="20" cy="13" r="3.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0284c7" />
            <stop offset="0.5" stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <img
      src={logoUrl}
      alt="PROJECTILE LAB logo"
      width={size}
      height={size}
      onError={() => setHasError(true)}
      className={`${className} object-contain`}
    />
  );
}
