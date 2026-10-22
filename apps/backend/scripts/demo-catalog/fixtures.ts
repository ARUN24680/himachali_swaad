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

/**
 * Recipes that also ship a 500 g family jar (same product_group → one storefront card with a 250 g / 500 g
 * toggle). Price ≈ 1.85 × the 250 g price, rounded to a ₹…9 price.
 */
const FAMILY_JARS: Partial<Record<(typeof recipes)[number][0], number>> = {
  'garlic-chicken': 86900,
  'pepper-chicken': 88900,
};

const allergensFor = (meat: (typeof recipes)[number][2]) =>
  meat === 'FISH'
    ? 'Contains fish and mustard.'
    : meat === 'PRAWN'
      ? 'Contains crustaceans (prawns) and mustard.'
      : 'Contains mustard.';

/**
 * Stable IDs/keys identify ONLY this set. Existing products, including old seeds, are never adopted.
 * 250 g jars keep their original v1 IDs/keys/SKUs (…-0000000000NN, DEMONN250). 500 g jars use
 * …-0000000005NN, DEMONN500 and a `-500g` key suffix, so they never collide and existing installs gain
 * them on the next `seed`. Both sizes share sort_order: the listing orders by sort_order, product_group,
 * net_weight_g, so the 250 g jar stays first (and the default) in its group.
 */
export const DEMO_PRODUCTS = recipes.flatMap(([key, title, meat, price, spice, short, ingredients], index) => {
  const sequence = String(index + 1).padStart(2, '0');
  const family = FAMILY_JARS[key];
  const sizes = family
    ? ([
        [250, price],
        [500, family],
      ] as const)
    : ([[250, price]] as const);
  return sizes.map(([grams, sizePrice]) => {
    const id = `d30c0001-0000-4000-8000-${String((grams === 250 ? 0 : 500) + index + 1).padStart(12, '0')}`;
    return {
      id,
      key: `pickle-demo-v1/${key}${grams === 250 ? '' : `-${grams}g`}`,
      imageFile: `${key}.png`,
      imageKey: `products/${id}/demo-v1.png`,
      sku: `DEMO${sequence}${grams}`,
      slug: `demo-${key}-pickle-${grams}g`,
      group: `demo-${key}-pickle`,
      title: `${title} (Demo)`,
      meat,
      grams,
      packedGrams: grams + 230,
      price: sizePrice,
      spice,
      short,
      description: `${short} Serve a spoonful alongside dal-rice, rotis or a favourite meal. DEMO PRODUCT: sample content and AI-generated image for testing; nutrition, tax and shelf-life values are placeholders, not verified product claims.`,
      ingredients: `DEMO VALUES: ${ingredients}`,
      allergens: allergensFor(meat),
      sortOrder: 100 + index,
    };
  });
});
export type DemoProduct = (typeof DEMO_PRODUCTS)[number];
