export default function Loading() {
  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton mt-3 h-4 w-72" />
      <div className="mt-8 space-y-0 border-t border-rule">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-rule py-4">
            <div className="space-y-2">
              <div className="skeleton h-4 w-56" />
              <div className="skeleton h-3 w-40" />
            </div>
            <div className="skeleton h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
