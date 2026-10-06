/**
 * Site logo: an original maharaja figure (red turban with a gold jewel and plume, curled moustache), drawn as a homage
 * to the classic Indian airline mascot. It is not Air India's artwork, which is their trademark.
 */
export function MaharajaMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="mm-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff7ec" />
          <stop offset="1" stopColor="#ffe2c2" />
        </linearGradient>
        <linearGradient id="mm-turban" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3263f" />
          <stop offset="1" stopColor="#a50f25" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#mm-tile)" />
      {/* Plume */}
      <path d="M21.5 4.5c3 1.2 3.6 4.4 1.2 6.6-.5-2.4-1.6-4-3.4-5 .6-.8 1.3-1.3 2.2-1.6z" fill="#f2a516" />
      {/* Face and ears */}
      <circle cx="11.6" cy="22.5" r="2" fill="#e9b088" />
      <circle cx="28.4" cy="22.5" r="2" fill="#e9b088" />
      <ellipse cx="20" cy="23" rx="8.4" ry="9" fill="#f3c49c" />
      {/* Turban: dome with folds and a gold band */}
      <path d="M9.8 18.6C9.4 11.4 14 7.6 20 7.6s10.6 3.8 10.2 11c-3-1.6-6.4-2.4-10.2-2.4s-7.2.8-10.2 2.4z" fill="url(#mm-turban)" />
      <path d="M12.5 12.4c2.4 1.3 5 1.9 7.5 1.9s5.1-.6 7.5-1.9M11.1 15.6c2.8 1.2 5.8 1.8 8.9 1.8s6.1-.6 8.9-1.8" fill="none" stroke="#7d0a1b" strokeWidth=".9" strokeLinecap="round" opacity=".55" />
      <circle cx="20" cy="11.4" r="2.2" fill="#f5c542" stroke="#b9851a" strokeWidth=".7" />
      <circle cx="20" cy="11.4" r=".9" fill="#1e8a5a" />
      {/* Eyes and brows */}
      <path d="M15.2 20.6c.9-.7 2-.8 2.9-.2M21.9 20.4c.9-.6 2-.5 2.9.2" fill="none" stroke="#3b2414" strokeWidth=".9" strokeLinecap="round" />
      <circle cx="16.7" cy="22.4" r=".95" fill="#2a1a10" />
      <circle cx="23.3" cy="22.4" r=".95" fill="#2a1a10" />
      {/* Nose */}
      <path d="M20 22.6c-.5 1.6-.8 2.7-.1 3.2" fill="none" stroke="#c98b63" strokeWidth=".9" strokeLinecap="round" />
      {/* The moustache, curled up at both ends */}
      <path
        d="M20 27.1c-1.6-1.4-4.2-1.6-6.2-.4-1.4.8-2.9.6-3.6-.6-.3 2.1 1.4 3.7 3.6 3.3 2.2-.3 4.2-1.2 6.2-1.3 2 .1 4 1 6.2 1.3 2.2.4 3.9-1.2 3.6-3.3-.7 1.2-2.2 1.4-3.6.6-2-1.2-4.6-1-6.2.4z"
        fill="#2b1b12"
      />
      {/* Smile */}
      <path d="M17.6 29.6c1.5.9 3.3.9 4.8 0" fill="none" stroke="#a1543a" strokeWidth=".8" strokeLinecap="round" />
    </svg>
  );
}
