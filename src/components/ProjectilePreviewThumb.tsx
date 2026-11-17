import { ProjectileType } from '../types/simulation';

export function ProjectilePreviewThumb({
  type,
  className = 'w-14 h-14',
}: {
  type: ProjectileType;
  className?: string;
}) {
  if (type === 'rocket') {
    return (
      <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
        <path
          d="M32 6C38 14 40 24 40 36V44H24V36C24 24 26 14 32 6Z"
          className="fill-slate-100 dark:fill-slate-900 stroke-sky-500 dark:stroke-sky-400"
          strokeWidth="2"
        />
        <path d="M24 34L14 44V49L24 44V34Z" className="fill-emerald-500" />
        <path d="M40 34L50 44V49L40 44V34Z" className="fill-emerald-500" />
        <circle cx="32" cy="24" r="3.5" className="fill-sky-400" />
        <path d="M28 48L32 58L36 48H28Z" className="fill-yellow-400" />
      </svg>
    );
  }

  if (type === 'airplane') {
    return (
      <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
        <path
          d="M8 36L52 24L56 26L14 40L8 36Z"
          className="fill-slate-100 dark:fill-slate-900 stroke-sky-500 dark:stroke-sky-400"
          strokeWidth="2"
        />
        <path d="M26 30L36 14L42 15L34 29" className="fill-emerald-500/80 stroke-emerald-400" strokeWidth="1.5" />
        <path d="M27 34L39 48L44 46L34 32" className="fill-emerald-500/80 stroke-emerald-400" strokeWidth="1.5" />
        <path d="M10 35L14 26L19 27L16 34" className="fill-yellow-400" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <circle
        cx="32"
        cy="32"
        r="18"
        className="fill-slate-100 dark:fill-slate-900 stroke-sky-500 dark:stroke-sky-400"
        strokeWidth="2"
      />
      <path d="M15 27C23 30 41 30 49 27" className="stroke-emerald-500" strokeWidth="2" />
      <path d="M22 17C26 26 26 38 22 47" className="stroke-yellow-500" strokeWidth="1.5" />
    </svg>
  );
}
