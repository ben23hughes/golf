export default function Loading() {
  return (
    <main className="app-page">
      <div className="page-wrap flex min-h-screen items-center justify-center">
        <section className="hero-panel w-full max-w-md px-6 py-8">
          <p className="section-label text-[#d6ddcc]">Launching</p>
          <h1 className="mt-3 font-serif text-[2.1rem] font-semibold leading-none text-[#f8f3e9]">
            Golf Bet Live
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-6 text-[#dbe7dd]">
            Loading your rounds, profile, and live action.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="h-20 rounded-[1.2rem] border border-white/15 bg-white/10" />
            <div className="h-20 rounded-[1.2rem] border border-white/15 bg-white/10" />
            <div className="h-20 rounded-[1.2rem] border border-white/15 bg-white/10" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-4 w-32 rounded-full bg-white/15" />
            <div className="h-24 rounded-[1.2rem] border border-white/12 bg-white/10" />
            <div className="h-24 rounded-[1.2rem] border border-white/12 bg-white/10" />
          </div>
        </section>
      </div>
    </main>
  );
}
