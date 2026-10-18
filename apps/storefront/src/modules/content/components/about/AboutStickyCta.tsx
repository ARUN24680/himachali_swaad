'use client';

import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Phone-only thumb-reach "Shop pickles" bar for the About page (same pattern as the home page's
 * sticky CTA): shows once the hero CTAs have scrolled away, hides while the closing CTA card or the
 * footer (legal links) is on screen so it never covers them.
 */
export function AboutStickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('about-hero-ctas');
    const closing = document.getElementById('about-cta');
    const footer = document.querySelector('[data-testid="site-footer"]');
    if (!hero || !closing || typeof IntersectionObserver === 'undefined') return;
    const state = { heroGone: false, closingInView: false, footerInView: false };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) state.heroGone = !e.isIntersecting && e.boundingClientRect.top < 0;
        if (e.target === closing) state.closingInView = e.isIntersecting;
        if (e.target === footer) state.footerInView = e.isIntersecting;
      }
      setVisible(state.heroGone && !state.closingInView && !state.footerInView);
    });
    io.observe(hero);
    io.observe(closing);
    if (footer) io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      data-testid="about-sticky-cta"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float backdrop-blur transition-[transform,visibility] duration-300 motion-reduce:transition-none md:hidden',
        visible ? 'visible translate-y-0' : 'invisible translate-y-full',
      )}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <p className="min-w-0 flex-1 text-sm leading-snug text-muted-foreground">
          <span className="block truncate font-medium text-foreground">Himachali pickles</span>
          <span className="block truncate">250 g &amp; 500 g jars</span>
        </p>
        <Link href="/products" className={cn(buttonVariants({ size: 'lg' }), 'group shrink-0')}>
          Shop pickles
          <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
