import { ClipboardList, Stethoscope } from "lucide-react";

const demoSites = [
  { name: "Downtown Demo Clinic", queue: "General Check-in", wait: "12 min" },
  { name: "Northside Demo Clinic", queue: "Walk-in Care", wait: "18 min" },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-8 md:px-10">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Stethoscope size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">QDoc</p>
            <h1 className="text-3xl font-semibold text-slate-950">Clinic queue demo</h1>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {demoSites.map((site) => (
            <article key={site.name} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{site.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">{site.queue}</p>
                </div>
                <ClipboardList className="text-slate-500" size={22} aria-hidden="true" />
              </div>
              <p className="mt-5 text-sm text-slate-500">Estimated wait</p>
              <p className="text-2xl font-semibold text-slate-950">{site.wait}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
