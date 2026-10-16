import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, Flame, HeartHandshake, ShieldCheck, SunMedium } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { MountainRidges } from '@/components/common/MountainRidges';

const STEPS = [
  {
    icon: <Flame className="size-4 text-primary" />,
    title: 'Wood-Fired Slow Simmer',
    body: 'Hand-cut fresh meat is marinated with stone-ground pahadi spices and slow-cooked in heavy vessels until tender.',
  },
  {
    icon: <SunMedium className="size-4 text-primary" />,
    title: 'Mustard Oil Maturation',
    body: 'Each batch rests steeped in cold-pressed mustard oil so the aromatic flavours soak deep into every single fibre.',
  },
  {
    icon: <ShieldCheck className="size-4 text-primary" />,
    title: 'Sealed & Glass-Packed',
    body: 'Packed in food-grade glass jars with airtight lids, stamped with batch codes, and checked by hand.',
  },
  {
    icon: <HeartHandshake className="size-4 text-primary" />,
    title: 'Shipped from the Hills',
    body: 'Dispatched directly from Himachal to your doorstep anywhere in India with leakproof shock packaging.',
  },
];

export function OriginStory() {
  return (
    <section aria-labelledby="origin-title" className="px-4 md:px-8">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-2xl bg-secondary px-6 pt-12 pb-24 text-secondary-foreground md:px-12 md:pt-16 md:pb-28">
        {/* Background ambient lighting */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -right-20 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left Column: Story narrative & craft steps */}
          <div className="grid content-start gap-6">
            <span className="text-xs font-semibold tracking-[0.16em] text-accent-foreground uppercase">
              Artisanal Heritage
            </span>
            <h2 id="origin-title" className="font-serif text-3xl leading-tight font-medium text-balance sm:text-4xl">
              &ldquo;Khatki&rdquo; is what the mountains call a pickle with bite.
            </h2>
            <p className="text-base leading-relaxed text-secondary-foreground/85">
              In the high valleys of Himachal Pradesh, winters are long and food is sacred. Meat was traditionally
              cooked down in cold-pressed mustard oil with roasted garlic and sun-dried chillies so families could
              nourish themselves through freezing blizzards. We preserve that exact age-old tradition — no shortcuts, no
              chemicals, just honest hill food.
            </p>

            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              {STEPS.map((s, i) => (
                <div
                  key={s.title}
                  className="rounded-lg border border-secondary-foreground/15 bg-secondary-foreground/5 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-7 place-items-center rounded-md bg-secondary-foreground/10">
                      {s.icon}
                    </span>
                    <span className="font-mono text-xs font-semibold text-primary">Step 0{i + 1}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-secondary-foreground">{s.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-secondary-foreground/75">{s.body}</p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <Link
                href="/about"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'border-secondary-foreground/30 text-secondary-foreground hover:bg-secondary-foreground/10',
                )}
              >
                Read Our Story & Heritage
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Right Column: Authentic Editorial Culinary Photograph */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-secondary-foreground/20 bg-card shadow-float sm:aspect-[4/3]">
              <Image
                src="/home/jar-lifestyle-culinary.webp"
                alt="Authentic Pahadi Khatki pickle served in an antique bronze kansa bowl"
                fill
                sizes="(min-width: 1024px) 500px, 90vw"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-secondary/95 via-secondary/50 to-transparent p-4 pt-10 text-secondary-foreground">
                <p className="font-serif text-sm font-medium tracking-wide sm:text-base">
                  &ldquo;A taste that reminds you of home in the hills.&rdquo;
                </p>
                <p className="text-xs text-secondary-foreground/80">
                  Fresh batch served in handcrafted kansa tableware
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mountain decorative bottom ridge */}
        <div className="absolute inset-x-0 bottom-0 -z-10 h-20 opacity-40" aria-hidden="true">
          <MountainRidges showSun={false} className="[&_path:last-child]:fill-secondary" />
        </div>
      </div>
    </section>
  );
}
