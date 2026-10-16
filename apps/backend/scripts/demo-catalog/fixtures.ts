export const DEMO_QUANTITY = 32;
export const DEMO_SHELF_LIFE_DAYS = 180;

const recipes = [
  [
    'chilli-chicken',
    'Red Chilli Chicken Pickle',
    'CHICKEN',
    44900,
    4,
    'Boneless chicken in a bold red chilli and mustard-oil masala.',
    'Chicken, mustard oil, red chilli, ginger, garlic, salt, spices',
  ],
  [
    'garlic-chicken',
    'Garlic Chicken Pickle',
    'CHICKEN',
    46900,
    2,
    'Tender chicken and roasted garlic with a mellow, warming finish.',
    'Chicken, mustard oil, garlic, ginger, chilli, salt, spices',
  ],
  [
    'pepper-chicken',
    'Black Pepper Chicken Pickle',
    'CHICKEN',
    47900,
    3,
    'Aromatic black pepper and juicy chicken in a rich pickle masala.',
    'Chicken, mustard oil, black pepper, garlic, ginger, salt, spices',
  ],
  [
    'smoked-mutton',
    'Smoked Mutton Pickle',
    'MUTTON',
    54900,
    3,
    'Slow-cooked mutton with a smoky, deeply spiced finish.',
    'Mutton, mustard oil, cumin, garlic, chilli, salt, spices',
  ],
  [
    'garlic-mutton',
    'Garlic Mutton Pickle',
    'MUTTON',
    56900,
    2,
    'Rich mutton pieces with roasted garlic and fragrant whole spices.',
    'Mutton, mustard oil, garlic, ginger, chilli, salt, spices',
  ],
  [
    'chilli-mutton',
    'Fiery Mutton Pickle',
    'MUTTON',
    57900,
    5,
    'A fiery red chilli pickle for lovers of bold, warming flavours.',
    'Mutton, mustard oil, red chilli, mustard seeds, garlic, salt, spices',
  ],
  [
    'mustard-trout',
    'Mustard Trout Pickle',
    'FISH',
    59900,
    3,
    'Flaky trout with golden mustard and a tangy spice blend.',
    'Trout fish, mustard oil, mustard seeds, turmeric, garlic, salt, spices',
  ],
  [
    'lemon-fish',
    'Lemon Fish Pickle',
    'FISH',
    52900,
    2,
    'Tender fish pieces with bright lemon and a gentle chilli warmth.',
    'Fish, mustard oil, lemon, turmeric, chilli, garlic, salt, spices',
  ],
  [
    'coastal-prawn',
    'Coastal Prawn Pickle',
    'PRAWN',
    62900,
    4,
    'Succulent prawns in red masala with fragrant curry leaves.',
    'Prawns, mustard oil, curry leaves, chilli, garlic, vinegar, salt, spices',
  ],
  [
    'garlic-prawn',
    'Garlic Prawn Pickle',
    'PRAWN',
    64900,
    3,
    'Prawns and roasted garlic in a glossy, tangy pickle masala.',
    'Prawns, mustard oil, garlic, ginger, chilli, vinegar, salt, spices',
  ],
] as const;

/** Stable IDs/keys identify ONLY this set. Existing products, including old seeds, are never adopted. */
export const DEMO_PRODUCTS = recipes.map(([key, title, meat, price, spice, short, ingredients], index) => {
  const sequence = String(index + 1).padStart(2, '0');
  const id = `d30c0001-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return {
    id,
    key: `pickle-demo-v1/${key}`,
    imageFile: `${key}.png`,
    imageKey: `products/${id}/demo-v1.png`,
    sku: `DEMO${sequence}250`,
    slug: `demo-${key}-pickle-250g`,
    group: `demo-${key}-pickle`,
    title: `${title} (Demo)`,
    meat,
    price,
    spice,
    short,
    description: `${short} Serve a spoonful alongside dal-rice, rotis or a favourite meal. DEMO PRODUCT: sample content and AI-generated image for testing; nutrition, tax and shelf-life values are placeholders, not verified product claims.`,
    ingredients: `DEMO VALUES: ${ingredients}`,
    allergens:
      meat === 'FISH'
        ? 'Contains fish and mustard.'
        : meat === 'PRAWN'
          ? 'Contains crustaceans (prawns) and mustard.'
          : 'Contains mustard.',
    sortOrder: 100 + index,
  };
});
export type DemoProduct = (typeof DEMO_PRODUCTS)[number];
