export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-semfaz-200 border-t-semfaz-500" />
    </div>
  );
}

export function LoadingCard() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-6">
      <div className="mb-2 h-4 w-1/3 rounded bg-muted" />
      <div className="h-8 w-2/3 rounded bg-muted" />
    </div>
  );
}

export function LoadingChart() {
  return (
    <div className="animate-pulse rounded-lg border bg-card p-6">
      <div className="mb-4 h-4 w-1/4 rounded bg-muted" />
      <div className="h-64 rounded bg-muted" />
    </div>
  );
}
