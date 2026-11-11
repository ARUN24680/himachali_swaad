import type { BlogPost } from './types';

/**
 * Grounded only in the About / home copy (tradition, process, promises). No invented times, temperatures,
 * certifications or numbers.
 */
export const howKangraPickleIsMade: BlogPost = {
  slug: 'how-traditional-kangra-pickle-is-made',
  title: 'How traditional Kangra pickle is made',
  description:
    'From the meat pickles Himachali families make before winter, to a sealed, batch-coded jar: the slow, old way a Kangra pickle is cooked, matured and kept.',
  eyebrow: 'From the kitchen',
  publishedAt: '2026-11-04',
  keywords: [
    'Kangra pickle',
    'Himachali pickle',
    'traditional meat pickle',
    'mustard oil pickle',
    'how pickle is made',
  ],
  image: {
    src: '/home/jar-elevated-spices.webp',
    alt: 'A jar of Pahadi Khatki pickle on slate, with garlic cloves and dried red chillies',
  },
  blocks: [
    {
      type: 'p',
      text: 'In the hills of Himachal, a pickle is how a kitchen keeps the season. Before winter closes the passes, families cook meat or river fish down with garlic and chillies and seal it under mustard oil, so there is something bold and warming on the table through the cold months. Pahadi Khatki starts from that same habit. Here is how a traditional Kangra pickle comes together — and why each step matters.',
    },
    { type: 'h2', id: 'ingredients', text: 'It starts with very few ingredients' },
    {
      type: 'p',
      text: 'A hill pickle is short on ingredients and long on time: coarse salt, whole spices, mustard oil and the meat or fish itself. If a hill kitchen wouldn’t use an ingredient, it doesn’t go in the jar.',
    },
    {
      type: 'list',
      items: [
        'Chicken, mutton or river fish, cleaned well before it goes near the pan.',
        'Garlic, ginger and sun-dried red chillies for the base.',
        'Whole spices — coriander, wild cumin, fenugreek and red chilli — roasted low and slow, then hand-pounded.',
        'Cold-pressed mustard oil, which is both the cooking medium and the preservative.',
      ],
    },
    { type: 'h2', id: 'cooked-down', text: 'Step 1: Cooked down, not rushed' },
    {
      type: 'p',
      text: 'The meat or fish is cooked down with the garlic, ginger and chillies until it is tender and the spices have clung to every piece. Cooking low is the point: the pickle needs pieces that hold their shape in the jar and carry the spice all the way through.',
    },
    { type: 'h2', id: 'matured', text: 'Step 2: Rested so the spice soaks in' },
    {
      type: 'p',
      text: 'Once cooked, the pickle is left to rest. This is where it stops tasting like a curry and starts tasting like a pickle — the roasted, hand-pounded spice soaks into each piece and the flavours settle together.',
    },
    { type: 'h2', id: 'sealed', text: 'Step 3: Sealed under hot mustard oil' },
    {
      type: 'p',
      text: 'The jar is then sealed with a layer of hot mustard oil — the hill way of keeping a pickle. The oil covers the pieces and keeps air away from them. Done right, a pickle made like this keeps its bite, its khatak, for months. That is why we add no preservatives: salt, spice, oil and time do the work.',
    },
    {
      type: 'note',
      title: 'Why mustard oil?',
      text: 'In Himachali kitchens mustard oil is not just a fat to cook in. Its sharp, pungent taste is part of the pickle’s character, and the oil layer on top is what protects the pieces underneath.',
    },
    { type: 'h2', id: 'packed', text: 'Step 4: Batch-coded and packed by hand' },
    {
      type: 'p',
      text: 'Every jar we fill is a glass jar with an airtight lid, checked by hand. Each one carries a batch code along with its manufacture and best-before dates, so any jar can be traced back to the day it was made. The batch you order from is the batch you see on the product page.',
    },
    {
      type: 'p',
      text: 'The jars are then packed leak-proof for the journey across India.',
    },
    { type: 'h2', id: 'small-batches', text: 'Why small batches' },
    {
      type: 'p',
      text: 'Our kitchen partner in Himachal cooks, matures, seals and packs every jar by hand, so we make pickles in small batches. It also means we sometimes run out. We would rather tell you a jar is sold out than ship one we wouldn’t serve at home.',
    },
    { type: 'h2', id: 'how-to-enjoy', text: 'How to enjoy it' },
    {
      type: 'list',
      items: [
        'A spoonful on the side of hot parathas or rotis — let the oil soak in.',
        'With dal-chawal, where it lifts the simplest home meal.',
        'In a small bowl next to the mains on a festive thali.',
      ],
    },
    {
      type: 'p',
      text: 'Himachali pickles are bold, so start with a little. Each product page shows a spice level where available, along with the full ingredients and allergens.',
    },
  ],
};
