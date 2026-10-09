export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13.5" />
      <circle cx="16" cy="16" r="9.5" strokeDasharray="1.6 2.2" />
      <path d="M10.5 16.5l3.6 3.6 7.4-8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-[18px] font-extrabold tracking-[-0.02em] ${className}`}>
      <Mark className="h-[22px] w-[22px] text-green" />
      CampusSign
    </span>
  );
}

export function VerifiedBadge({ label = "Verified faculty" }: { label?: string }) {
  return (
    <span className="verified">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M8 0l1.9 1.6 2.5-.2.6 2.4 2.1 1.4-.9 2.3.9 2.3-2.1 1.4-.6 2.4-2.5-.2L8 16l-1.9-1.6-2.5.2-.6-2.4L.9 10.8l.9-2.3-.9-2.3L3 4.8l.6-2.4 2.5.2z" />
        <path d="M5 8.2l2 2 4-4.2" stroke="var(--surface)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}
