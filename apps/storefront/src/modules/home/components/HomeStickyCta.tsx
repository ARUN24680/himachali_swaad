'use client';

import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Phone-only thumb-reach bar (same pattern as the product page's sticky add-to-cart): it slides in
 * once the hero CTAs have scrolled away, and hides again while the quick-shop cards or the footer
 * (legal links) are on screen, so it never covers them.
 */
export function HomeStickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('hero-ctas');
    const shop = document.getElementById('shop');
    const footer = document.querySelector('[data-testid="site-footer"]');
    if (!hero || !shop || typeof IntersectionObserver === 'undefined') return;
    const state = { heroGone: false, shopInView: false, footerInView: false };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) state.heroGone = !e.isIntersecting && e.boundingClientRect.top < 0;
        if (e.target === shop) state.shopInView = e.isIntersecting;
        if (e.target === footer) state.footerInView = e.isIntersecting;
      }
      setVisible(state.heroGone && !state.shopInView && !state.footerInView);
    });
    io.observe(hero);
    io.observe(shop);
    if (footer) io.observe(footer);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      data-testid="home-sticky-cta"
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
