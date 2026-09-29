"use client";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="font-semibold text-red-800">Something went wrong</h2>
      <p className="mt-1 text-sm text-red-700">{error.message}</p>
      <button onClick={() => retry()} className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm">
        Try again
      </button>
    </div>
  );
}
