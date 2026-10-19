import {
  ArrowUp,
  ChevronDown,
  Eye,
  Flame,
  FlameKindling,
  Hourglass,
  LockKeyhole,
  MoonStar,
  MountainSnow,
  Sprout,
  Stamp,
  Sun,
} from 'lucide-react';
import { cn } from '@pk/ui';
import type { ReactNode } from 'react';
import Image from 'next/image';
import logoHorizontal from '@pk/ui/brand/logo-horizontal-dark.png';
import { HimalayaRange } from './HimalayaRange';

/**
 * Public "coming soon" teaser — a scrollable night-in-the-hills story that deliberately says nothing
 * about WHAT is coming: no product, category, food words or imagery. The brand logo sits in the hero's
 * top bar (owner's request, v20); the copy itself never names the brand or the product. Only that
 * something is on its way from Himachal. Server component, no client JS, static (D-51). Token
 * colours only; motion = a ping dot and a slow glow pulse, both off under prefers-reduced-motion.
 */
export function ComingSoon() {
  return (
    <div id="top" className="relative isolate overflow-hidden bg-secondary text-secondary-foreground">
      <Grain />
      <Hero />
      <Story />
      <Values />
      <Valleys />
      <Making />
      <Sealed />
      <WhatWeCanSay />
      <Closing />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function Hero() {
  return (
    <section aria-labelledby="teaser-title" className="relative flex min-h-dvh flex-col">
      <NightSky />

      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-secondary-foreground/70 uppercase md:px-8 md:pt-6">
        {/* The hero sky is dark in both themes, so the cream "dark-background" logo is always the right one */}
        <Image src={logoHorizontal} alt="Pahadi Khatki" priority className="h-14 w-auto shrink-0 md:h-20" />
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-linear-to-r from-transparent via-primary/40 to-transparent"
        />
        <p className="flex shrink-0 flex-col items-end gap-1.5 text-right">
          <span>Himachal Pradesh</span>
          <span className="text-[0.625rem] tracking-[0.32em] text-primary/80">Dev Bhoomi</span>
        </p>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 pt-16 pb-8 text-center md:px-8 md:pt-24">
        <Pill>Coming soon</Pill>

        <h1
          id="teaser-title"
          className="mt-7 font-serif text-5xl leading-[1.02] font-medium tracking-tight text-balance sm:text-6xl md:text-7xl"
        >
          Something is coming
          <span className="block text-primary italic">from the mountains.</span>
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-pretty text-secondary-foreground/85 text-shadow-md text-shadow-secondary/80 md:max-w-lg md:text-lg">
          Born in the valleys of Himachal Pradesh, taking its time — and almost ready to make the journey down.
        </p>

        <a
          href="#story"
          className="group mt-8 inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-3 text-[0.6875rem] font-semibold tracking-[0.28em] text-secondary-foreground/85 uppercase outline-none text-shadow-md text-shadow-secondary/80 hover:text-secondary-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          Scroll
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-y-0.5 motion-safe:animate-bounce"
          />
        </a>
      </div>

      <ValleyPhoto />
    </section>
  );
}

/**
 * The photo's top fade (v18). A plain linear mask (`mask-t-from-55%`) starts and ends with a sudden
 * change of slope, and the eye reads that kink as a horizontal line where the photo begins. These
 * stops follow a smoothstep curve (3t² − 2t³) from fully transparent at the photo's top edge to
 * opaque at half its height, so the photo emerges out of the night sky with no edge at any width.
 * Mask stops carry alpha only (the colour is ignored), so this is not a palette colour.
 */
const PHOTO_TOP_FADE =
  '[mask-image:linear-gradient(to_bottom,transparent_0%,rgb(0_0_0/0.007)_2.5%,rgb(0_0_0/0.028)_5%,rgb(0_0_0/0.104)_10%,rgb(0_0_0/0.216)_15%,rgb(0_0_0/0.352)_20%,rgb(0_0_0/0.5)_25%,rgb(0_0_0/0.648)_30%,rgb(0_0_0/0.784)_35%,rgb(0_0_0/0.896)_40%,rgb(0_0_0/0.972)_45%,black_50%)]'; // pk-allow-color: alpha-only mask stops

/**
 * The hero's landscape: a wide Kangra valley panorama under the snow line. It is pulled up behind
 * the lede ("Born in the valleys…") and its top is masked with a long smoothstep fade
 * (`PHOTO_TOP_FADE`), so it dissolves into the night sky under the text with no seam.
 * The box is exactly the photo's 16:9 at every width (v21: phones and tablets used to get a taller
 * box that cropped both sides and cut the train's engine off), so the whole panorama shows edge to
 * edge and nothing is cropped. Below lg the photo is short, so it tucks under the text much less
 * (`-mt-12` … `md:-mt-36`) and the scroll cue stays over the faded sky; the lower half fades out
 * under an opaque band-colour wash into the next section (a wash, not a mask, so the hero's sun
 * glow never shows through as an edge), and a light band-colour wash keeps the daylight photo in
 * the page's evening mood. No product in frame.
 */
function ValleyPhoto() {
  return (
    <div className={cn('relative -z-10 -mt-12 aspect-video w-full sm:-mt-24 md:-mt-36 lg:-mt-60', PHOTO_TOP_FADE)}>
      <Image
        src="/teaser/kangra-valley.webp"
        alt="The Kangra valley in Himachal Pradesh: a narrow-gauge train winds past terraced gardens and deodar forest below the snow-capped Dhauladhar range"
        fill
        sizes="100vw"
        priority
        quality={100}
        className="object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-secondary/15" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-secondary from-5% via-secondary/50 via-35% to-transparent"
      />
    </div>
  );
}

function Story() {
  return (
    <section id="story" aria-labelledby="story-title" className="scroll-mt-4 px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="grid content-start gap-6 lg:col-span-7">
          <Eyebrow>Chapter one · The hills</Eyebrow>
          <h2 id="story-title" className="font-serif text-4xl leading-[1.08] font-medium text-balance md:text-5xl">
            In Himachal, the mountains set the pace.
          </h2>
          <div className="grid max-w-xl gap-5 text-base leading-relaxed text-pretty text-secondary-foreground/80 md:text-lg">
            <p>
              Snow decides the seasons. Rivers carve the roads. Villages hold on to slopes where the deodar grows thick,
              and evenings arrive early behind the ridges.
            </p>
            <p>
              Up here, nothing worth having is rushed — it takes exactly as long as it needs. What is coming has been
              shaped by that same patience.
            </p>
          </div>
        </div>

        <div className="relative grid content-center lg:col-span-5">
          <div
            aria-hidden="true"
            className="absolute -inset-10 -z-10 bg-radial from-primary/12 via-primary/4 via-40% to-transparent to-70%"
          />
          <p className="border-l border-primary/50 pl-6 font-serif text-4xl leading-[1.15] font-medium italic sm:text-5xl md:pl-8">
            Slow.
            <span className="block text-secondary-foreground/70">Honest.</span>
            <span className="block text-primary">Of the hills.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

const VALUES: { icon: ReactNode; title: string; line: string }[] = [
  {
    icon: <Hourglass />,
    title: 'Unhurried',
    line: 'Shaped at the pace of the mountains, not the pace of the city.',
  },
  {
    icon: <Eye />,
    title: 'Honest',
    line: 'Nothing hidden, nothing borrowed. You will know exactly where it comes from.',
  },
  {
    icon: <MountainSnow />,
    title: 'Of the hills',
    line: 'Rooted in Himachal — its valleys, its people, its seasons.',
  },
];

function Values() {
  return (
    <section
      aria-labelledby="values-title"
      className="border-y border-secondary-foreground/10 bg-secondary-foreground/3 px-4 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto grid max-w-6xl gap-10">
        <div className="grid max-w-2xl gap-4">
          <Eyebrow>What it stands for</Eyebrow>
          <h2 id="values-title" className="font-serif text-4xl leading-tight font-medium text-balance md:text-5xl">
            Three promises, made before a single word is revealed.
          </h2>
        </div>
        <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
          {VALUES.map((v, i) => (
            <li
              key={v.title}
              className="group relative grid gap-4 overflow-hidden rounded-2xl border border-secondary-foreground/10 bg-secondary-foreground/5 p-6 transition-colors duration-300 hover:border-primary/40 motion-reduce:transition-none md:p-8"
            >
              <span
                aria-hidden="true"
                className="absolute top-5 right-6 font-serif text-6xl leading-none text-secondary-foreground/10 tabular-nums md:top-6 md:right-8 md:text-7xl"
              >
                0{i + 1}
              </span>
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary [&_svg]:size-5"
              >
                {v.icon}
              </span>
              <h3 className="font-serif text-2xl font-medium">{v.title}</h3>
              <p className="text-sm leading-relaxed text-secondary-foreground/75 md:text-base">{v.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Valleys() {
  return (
    <section aria-labelledby="valleys-title" className="relative pt-20 md:pt-28">
      <div className="mx-auto grid max-w-6xl justify-items-center gap-8 px-4 text-center md:px-8">
        <Eyebrow>Chapter two · The valley</Eyebrow>
        <h2
          id="valleys-title"
          className="max-w-3xl font-serif text-4xl leading-tight font-medium text-balance md:text-5xl"
        >
          Somewhere in this valley, something is getting ready.
        </h2>
        <p className="grid justify-items-center gap-3">
          <span className="font-serif text-5xl leading-none font-medium text-primary italic sm:text-6xl md:text-7xl">
            Kangra
          </span>
          <span className="flex items-center gap-3 text-xs font-semibold tracking-[0.3em] text-secondary-foreground/75 uppercase sm:text-sm">
            <span aria-hidden="true" className="h-px w-8 bg-primary/50 sm:w-12" />
            Himachal Pradesh
            <span aria-hidden="true" className="h-px w-8 bg-primary/50 sm:w-12" />
          </span>
        </p>
      </div>
      <HimalayaRange
        id="pk-range-valleys"
        variant="divider"
        className="mt-2 -mb-12 aspect-[1440/300] min-h-40 sm:min-h-48 md:mt-4 md:-mb-20"
      />
    </section>
  );
}

const STEPS: { icon: ReactNode; title: string; line: string }[] = [
  {
    icon: <Sprout />,
    title: 'Chosen by hand',
    line: 'Gathered from Kangra’s own farms and hill markets, only at the height of the season.',
  },
  {
    icon: <Flame />,
    title: 'Slow-cooked',
    line: 'Over a low flame, stirred by hand, for as long as it takes. Never hurried.',
  },
  {
    icon: <Sun />,
    title: 'Sun-cured',
    line: 'Set out under the Kangra sun on open rooftops, the way the valley has always done it.',
  },
  {
    icon: <MoonStar />,
    title: 'Rested',
    line: 'Then it waits, through warm days and cold nights, until the taste turns deep, bold and gently tangy.',
  },
];

/**
 * Chapter three: how it is made, as a four-step process (hand-picked, slow-cooked, sun-cured, rested)
 * rooted in the Kangra valley. It hints at the craft and the taste (slow-cooked, tangy) without
 * naming what it is. A hairline joins the steps: horizontal on desktop, a vertical timeline below lg.
 */
function Making() {
  return (
    <section aria-labelledby="making-title" className="px-4 pt-20 md:px-8 md:pt-28">
      <div className="mx-auto grid max-w-6xl gap-12 md:gap-16">
        <div className="grid max-w-2xl gap-5">
          <Eyebrow>Chapter three · The making</Eyebrow>
          <h2 id="making-title" className="font-serif text-4xl leading-tight font-medium text-balance md:text-5xl">
            Made slowly, the Kangra way.
          </h2>
          <p className="text-base leading-relaxed text-pretty text-secondary-foreground/80 md:text-lg">
            In the valley, some things are still made the old way: by hand, over a low flame, under an open sky. What is
            coming is one of them.
          </p>
        </div>

        <ol className="relative grid max-w-2xl gap-10 lg:max-w-none lg:grid-cols-4 lg:gap-x-10">
          {/* The path that joins the steps: vertical down the icons below lg, horizontal from lg up */}
          <span
            aria-hidden="true"
            className="absolute top-6 bottom-16 left-6 w-px bg-linear-to-b from-primary/40 via-primary/25 to-transparent lg:hidden"
          />
          <span
            aria-hidden="true"
            className="absolute top-6 right-0 left-6 hidden h-px bg-linear-to-r from-primary/40 via-primary/25 to-transparent lg:block"
          />
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="relative grid grid-cols-[3rem_1fr] content-start gap-x-5 gap-y-2 lg:grid-cols-1 lg:gap-4"
            >
              <div className="row-span-2 flex flex-col items-center gap-2 lg:row-span-1 lg:flex-row lg:gap-2">
                <span
                  aria-hidden="true"
                  className="relative grid size-12 shrink-0 place-items-center rounded-full border border-primary/40 bg-secondary text-primary [&_svg]:size-5"
                >
                  {step.icon}
                </span>
                <span
                  aria-hidden="true"
                  className="relative bg-secondary px-1 py-1 text-xs font-semibold tracking-[0.22em] text-primary tabular-nums lg:px-2 lg:py-0"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="self-center font-serif text-2xl font-medium lg:self-auto">{step.title}</h3>
              <p className="col-start-2 text-sm leading-relaxed text-pretty text-secondary-foreground/75 md:text-base lg:col-start-1">
                {step.line}
              </p>
            </li>
          ))}
        </ol>

        <p className="text-center font-serif text-2xl leading-snug font-medium text-balance italic md:text-3xl">
          <span className="whitespace-nowrap">Slow-cooked.</span> <span className="whitespace-nowrap">Sun-cured.</span>{' '}
          <span className="whitespace-nowrap text-primary">Gently tangy.</span>
        </p>
      </div>
    </section>
  );
}

const SEAL_NOTES = [
  { icon: <FlameKindling />, line: 'Wood-fired in a mud-walled house above the valley' },
  { icon: <Stamp />, line: 'Sealed by hand, in small batches' },
  { icon: <LockKeyhole />, line: 'Kept under seal until the day it leaves the hills' },
];

/**
 * Chapter four, the advert: a cinematic collage of the wood-fired hearth (large) and the gold-sealed
 * "Coming soon" card tucked over its corner, beside a short, confident pitch. It sells the mystery
 * (fire, seal, small batches) and still never names what it is. Images live in /public/teaser.
 */
function Sealed() {
  return (
    <section aria-labelledby="sealed-title" className="relative isolate px-4 pt-24 md:px-8 md:pt-32">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/4 -z-10 h-3/4 bg-radial-[ellipse_50%_50%_at_30%_50%] from-primary/15 via-primary/5 via-50% to-transparent to-75%"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-16 lg:grid-cols-12 lg:gap-12">
        <figure className="relative pr-8 pb-20 sm:pr-14 sm:pb-24 lg:col-span-7 lg:pr-20">
          <div className="relative overflow-hidden rounded-3xl shadow-2xl ring-1 ring-primary/25">
            <Image
              src="/teaser/woodfire-hearth.webp"
              alt="A wood fire burns in a clay hearth inside an old mud-walled Himachali house, brass pots beside it and herbs drying from the rafters"
              width={1024}
              height={1024}
              sizes="(min-width: 1024px) 40rem, 92vw"
              className="aspect-square w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-t from-secondary/70 via-transparent via-40% to-transparent"
            />
            <p className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-secondary/70 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.22em] text-secondary-foreground uppercase backdrop-blur-sm md:bottom-6 md:left-6">
              <Flame aria-hidden="true" className="size-3.5 text-primary" />
              Lit before dawn
            </p>
          </div>
          <div className="absolute right-0 bottom-0 w-[34%] rotate-3 overflow-hidden rounded-xl shadow-2xl ring-1 ring-primary/40 transition-transform duration-500 hover:rotate-0 motion-reduce:transition-none sm:w-[32%]">
            <Image
              src="/teaser/sealed-card.webp"
              alt="A deep-green card stamped with a gold wax seal of the mountains, with gold ribbons and the words Coming soon, Authenticity redefined"
              width={614}
              height={868}
              sizes="(min-width: 1024px) 14rem, 34vw"
              className="aspect-[614/868] w-full object-cover"
            />
          </div>
        </figure>

        <div className="grid content-center gap-6 lg:col-span-5">
          <Eyebrow>Chapter four · The secret</Eyebrow>
          <h2 id="sealed-title" className="font-serif text-4xl leading-tight font-medium text-balance md:text-5xl">
            Sealed by hand.
            <span className="block text-primary italic">Yours, soon.</span>
          </h2>
          <p className="text-base leading-relaxed text-pretty text-secondary-foreground/80 md:text-lg">
            High above the valley, a wood fire has been burning since before dawn. What comes off it is sealed in gold
            and kept quiet, until the day it is ready to make the journey down.
          </p>
          <ul className="grid gap-4 border-y border-secondary-foreground/10 py-6">
            {SEAL_NOTES.map((note) => (
              <li key={note.line} className="flex items-center gap-4 text-sm text-secondary-foreground/85 md:text-base">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-primary/40 text-primary [&_svg]:size-4"
                >
                  {note.icon}
                </span>
                {note.line}
              </li>
            ))}
          </ul>
          <p className="font-serif text-2xl leading-snug font-medium italic md:text-3xl">
            Authenticity, <span className="text-primary">redefined.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

const QA = [
  { q: 'What is it?', a: 'Not yet.' },
  { q: 'Where is it from?', a: 'Himachal Pradesh.' },
  { q: 'When?', a: 'Soon.' },
];

function WhatWeCanSay() {
  return (
    <section aria-labelledby="qa-title" className="px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-10">
        <div className="grid gap-4 text-center">
          <Eyebrow className="justify-center">What we can tell you</Eyebrow>
          <h2 id="qa-title" className="font-serif text-4xl leading-tight font-medium text-balance md:text-5xl">
            Not much. Not yet.
          </h2>
        </div>
        <dl className="grid divide-y divide-secondary-foreground/10 overflow-hidden rounded-2xl border border-secondary-foreground/10 md:grid-cols-3 md:divide-x md:divide-y-0">
          {QA.map((item) => (
            <div key={item.q} className="grid gap-2 bg-secondary-foreground/5 p-6 text-center md:p-10">
              <dt className="text-xs font-semibold tracking-[0.2em] text-secondary-foreground/60 uppercase">
                {item.q}
              </dt>
              <dd className="font-serif text-3xl font-medium text-primary italic md:text-4xl">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="closing-title" className="relative px-4 pt-4 pb-10 md:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-full bg-radial-[ellipse_60%_70%_at_50%_100%] from-primary/20 via-primary/5 via-40% to-transparent to-75% motion-safe:animate-[pulse_7s_ease-in-out_infinite]"
      />
      <div className="mx-auto grid max-w-3xl justify-items-center gap-6 pb-16 text-center md:pb-24">
        <span
          aria-hidden="true"
          className="grid size-14 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary"
        >
          <MountainSnow className="size-6" />
        </span>
        <h2 id="closing-title" className="font-serif text-5xl leading-[1.05] font-medium text-balance md:text-7xl">
          Keep watching
          <span className="block text-primary italic">the mountains.</span>
        </h2>
        <Pill>Unveiling soon</Pill>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-secondary-foreground/10 pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[0.6875rem] tracking-[0.24em] text-secondary-foreground/60 uppercase sm:flex-row">
        <span>Himachal Pradesh, India</span>
        <a
          href="#top"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold outline-none hover:text-secondary-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          Back to the top
          <ArrowUp aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function Pill({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-secondary-foreground/5 px-4 py-2 text-xs font-semibold tracking-[0.22em] text-primary uppercase backdrop-blur-sm">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-primary/60 motion-safe:animate-ping" />
        <span className="relative size-2 rounded-full bg-primary" />
      </span>
      {children}
    </p>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase',
        className,
      )}
    >
      <span aria-hidden="true" className="h-px w-8 bg-primary/60" />
      {children}
    </p>
  );
}

/**
 * Page-wide film grain (aria-hidden), coloured by the text token via currentColor. It sits ABOVE the
 * content (pointer-events-none) so the opaque mountain layers don't show as grain-free rectangles.
 */
function Grain() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 size-full text-secondary-foreground opacity-[0.07] mix-blend-soft-light"
    >
      <filter id="pk-teaser-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.2" />
        <feComposite in="SourceGraphic" operator="in" />
      </filter>
      <rect width="100%" height="100%" fill="currentColor" filter="url(#pk-teaser-grain)" />
    </svg>
  );
}

/** Hero sky: cool lift at the top, faint stars, a warm glow rising behind the range. aria-hidden. */
function NightSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-radial-[ellipse_at_50%_0%] from-secondary-foreground/10 to-transparent to-60%" />
      <svg className="absolute inset-x-0 top-0 h-2/3 w-full" preserveAspectRatio="none" viewBox="0 0 1440 600">
        {STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className="fill-secondary-foreground/40" />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-[70%] bg-radial-[ellipse_40%_45%_at_60%_82%] from-primary/30 via-primary/8 via-45% to-transparent to-75% motion-safe:animate-[pulse_7s_ease-in-out_infinite]" />
    </div>
  );
}

/** [x, y, r] in a 1440×600 box — fixed so server and client render the same sky. */
const STARS: [number, number, number][] = [
  [80, 60, 1.2],
  [210, 140, 0.8],
  [330, 40, 1],
  [460, 210, 0.7],
  [540, 90, 1.3],
  [640, 30, 0.8],
  [760, 160, 1],
  [860, 70, 0.7],
  [950, 230, 1.1],
  [1040, 50, 0.9],
  [1150, 150, 1.3],
  [1260, 80, 0.8],
  [1370, 190, 1],
  [150, 280, 0.7],
  [400, 330, 0.9],
  [1000, 330, 0.7],
  [1300, 300, 0.9],
  [700, 280, 0.6],
];
