import { site } from '@/config/site';

/** Placeholder until Phase 4 builds the real home page (modules/home). */
export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-3xl content-center gap-4 px-4 py-16">
      <p className="text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">Coming soon</p>
      <h1 className="text-4xl font-semibold text-balance md:text-5xl">{site.name}</h1>
      <p className="max-w-prose text-lg text-muted-foreground">{site.tagline}.</p>
    </main>
  );
}
