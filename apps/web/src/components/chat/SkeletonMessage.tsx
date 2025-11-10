export function SkeletonMessage() {
  return (
    <div className="flex gap-3 px-4 py-6 animate-pulse">
      {/* Avatar skeleton */}
      <div className="h-8 w-8 shrink-0 rounded-full bg-gray-300" />

      {/* Message content skeleton */}
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-300" />
        <div className="h-4 w-full rounded bg-gray-300" />
        <div className="h-4 w-5/6 rounded bg-gray-300" />
      </div>
    </div>
  );
}
