export default function PatientLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-2xl border border-white/40 bg-white/40"
        />
      ))}
    </div>
  );
}
