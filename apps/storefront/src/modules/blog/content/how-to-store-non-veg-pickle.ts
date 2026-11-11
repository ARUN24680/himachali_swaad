import type { BlogPost } from './types';

/**
 * Grounded only in the FAQ (storage & shelf life, batch codes, damaged jars) and About copy. Shelf life
 * is deliberately NOT given as a number — it differs per product and batch and lives on the jar + PDP.
 */
export const howToStoreNonVegPickle: BlogPost = {
  slug: 'how-to-store-himachali-non-veg-pickle',
  title: 'How to store Himachali non-veg pickle (and how long it lasts)',
  description:
    'Clean spoon, tight lid, pieces under the oil: simple habits that keep a Himachali meat or fish pickle at its best — and where to find the real shelf life of your jar.',
  eyebrow: 'Storage guide',
  publishedAt: '2026-11-04',
  keywords: [
    'how to store non-veg pickle',
    'meat pickle shelf life',
    'Himachali pickle storage',
    'chicken pickle storage',
    'mustard oil pickle',
  ],
  image: {
    src: '/home/pickle-texture.webp',
    alt: 'Close-up of slow-cooked meat pickle pieces glistening with spice and mustard oil',
  },
  blocks: [
    {
      type: 'p',
      text: 'A Himachali non-veg pickle is made to keep. It is cooked down, rested and sealed under a layer of hot mustard oil — the same way hill families have kept meat and fish pickles through the winter. But how it is handled once the jar is open matters just as much as how it was made. These are the habits that keep every spoonful as good as the first.',
    },
    { type: 'h2', id: 'how-long', text: 'How long does a jar last?' },
    {
      type: 'p',
      text: 'There is no single number that is honest for every jar. Shelf life depends on the recipe, so we show it where it belongs: each product page lists the shelf life and the best-before date of the batch that is shipping right now, and the same dates are printed on every jar.',
    },
    {
      type: 'p',
      text: 'We only ship jars with a healthy shelf life left. When your jar arrives, the best-before date on the label is the date to go by.',
    },
    {
      type: 'note',
      title: 'Reading the label',
      text: 'Every batch gets a code like PK-2610-CHK250-01, together with its manufacture and best-before dates. That code traces your jar to the day it was made — keep it handy if you ever need to contact us.',
    },
    { type: 'h2', id: 'once-opened', text: 'Once it is open: four simple habits' },
    {
      type: 'list',
      ordered: true,
      items: [
        'Always use a clean, dry spoon. Water or crumbs from another dish are the quickest way to spoil a pickle.',
        'Close the lid tightly after every use, so air and moisture stay out.',
        'Keep the jar in a cool, dry place away from sunlight.',
        'Keep the pieces under the oil layer. The mustard oil is what protects them — press pieces back down if they sit above it.',
      ],
    },
    {
      type: 'p',
      text: 'Follow any extra instructions printed on the label too; they are specific to that product.',
    },
    { type: 'h2', id: 'why-oil', text: 'Why the oil layer matters' },
    {
      type: 'p',
      text: 'We add no preservatives. Mustard oil, salt and spices are what keep the pickle, and the oil does its job by covering the pieces. A jar where the pieces stay submerged and the spoon stays dry is a jar that keeps its bite.',
    },
    { type: 'h2', id: 'when-it-arrives', text: 'When your jar arrives' },
    {
      type: 'p',
      text: 'Our glass jars have airtight lids and are checked by hand and packed leak-proof before they leave the kitchen. If a jar still reaches you damaged, contact us with your order code and a few photos and we will replace or refund it as per our refund policy.',
    },
    {
      type: 'p',
      text: 'Food cannot be returned once delivered for hygiene reasons, but damaged or wrong items are always replaced or refunded.',
    },
    { type: 'h2', id: 'quick-recap', text: 'Quick recap' },
    {
      type: 'list',
      items: [
        'Shelf life and best-before: on the product page and printed on every jar.',
        'Clean, dry spoon — every time.',
        'Lid tight, jar cool and dry, away from sunlight.',
        'Pieces under the oil.',
      ],
    },
  ],
};
