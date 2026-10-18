import { AboutClosing } from './about/AboutClosing';
import { AboutHero } from './about/AboutHero';
import { AboutProcess } from './about/AboutProcess';
import { AboutPromises } from './about/AboutPromises';
import { AboutStickyCta } from './about/AboutStickyCta';
import { AboutStory } from './about/AboutStory';

/**
 * About / Our story. Rhythm mirrors the home page: dark hero → one curve → editorial story →
 * muted process band → promises → closing CTA card. All static (D-51); only the phone sticky CTA
 * hydrates.
 */
export function AboutContent() {
  return (
    <>
      <AboutHero />
      <AboutStory />
      <AboutProcess />
      <AboutPromises />
      <AboutClosing />
      <AboutStickyCta />
    </>
  );
}
