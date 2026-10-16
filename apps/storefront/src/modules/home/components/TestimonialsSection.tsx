import { Quote, Star } from 'lucide-react';
import { SectionHeading } from '@/components/common/SectionHeading';

const REVIEWS = [
  {
    quote:
      'Reminds me of my grandmother’s kitchen in Kangra. The mutton chunks are so tender and the mustard oil aroma hits you the moment you pop the seal.',
    author: 'Vikram S.',
    location: 'Shimla / New Delhi',
    dish: 'Himachali Mutton Pickle (500g)',
  },
  {
    quote:
      'Zero chemical aftertaste! Just genuine slow-cooked chicken in pungent kacchi ghani oil with whole coriander and red chillies. Pairs wonderfully with piping hot parathas.',
    author: 'Ananya R.',
    location: 'Bengaluru',
    dish: 'Red Chilli Chicken Pickle (250g)',
  },
  {
    quote:
      'The trout pickle was a revelation. Flaky, delicately spiced and not oily or overpowering. The glass jar packing arrived in perfect condition all the way to Mumbai.',
    author: 'Rohan M.',
    location: 'Mumbai',
    dish: 'Himalayan Trout Pickle (250g)',
  },
];

export function TestimonialsSection() {
  return (
    <section aria-labelledby="reviews-title" className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
      <SectionHeading
        id="reviews-title"
        eyebrow="Tasted & Loved"
        title="Word from Mountain Food Lovers"
        lead="Straight from dinner tables across India that crave authentic Himalayan flavours."
        align="center"
      />

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {REVIEWS.map((rev) => (
          <div
            key={rev.author}
            className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-float"
          >
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <div className="flex text-primary">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="size-4 fill-primary text-primary" aria-hidden="true" />
                  ))}
                </div>
                <Quote className="size-6 text-muted-foreground/30" aria-hidden="true" />
              </div>

              <p className="text-sm leading-relaxed text-card-foreground/90 italic">&ldquo;{rev.quote}&rdquo;</p>
            </div>

            <div className="mt-6 border-t border-border/60 pt-4">
              <p className="font-serif text-sm font-semibold text-foreground">{rev.author}</p>
              <p className="text-xs text-muted-foreground">{rev.location}</p>
              <span className="mt-1 inline-block rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                Verified Buyer · {rev.dish}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
