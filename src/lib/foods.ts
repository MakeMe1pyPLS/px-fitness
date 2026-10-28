// Ingredient and recipe library.
//
// NUTRITION: per 100 g, approximate typical values in line with USDA
// FoodData Central entries for the generic food. Brands vary; these are
// estimates and are labelled as such in the UI.
//
// PRICES: two kinds, always labelled in the UI.
//  - 'bls': U.S. city average retail price, Bureau of Labor Statistics
//    Average Price Data, September 2026 (converted to the package size shown).
//  - 'estimate': no national average is published for this item; a typical
//    U.S. supermarket price used as a starting point. Users can edit any price.

import type { Allergen, DietPattern, Kitchen, MealType } from './types';

export const PRICE_SOURCE = {
  bls: 'BLS U.S. city average, Sep 2026',
  estimate: 'Estimate, edit to match your store',
  you: 'Your price',
} as const;

export interface Per100 { kcal: number; p: number; c: number; f: number; fib: number }

export interface Ingredient {
  id: string;
  name: string;
  category: 'Produce' | 'Protein' | 'Dairy & eggs' | 'Grains & bread' | 'Pantry' | 'Frozen';
  per100: Per100;
  pkg: { grams: number; label: string; price: number; source: 'bls' | 'estimate' };
  allergens: Allergen[];
  animal: 'meat' | 'fish' | 'egg' | 'dairy' | null;
  unit?: { name: string; grams: number }; // display as a count, e.g. eggs
  subs: { id: string; factor: number }[]; // replacement and grams multiplier
}

const lb = 453.6;
const bls = (perLb: number, grams: number, label: string) => ({ grams, label, price: Math.round(perLb * (grams / lb) * 100) / 100, source: 'bls' as const });
const est = (price: number, grams: number, label: string) => ({ grams, label, price, source: 'estimate' as const });

export const INGREDIENTS: Ingredient[] = [
  // Grains & bread
  { id: 'rice', name: 'White rice (dry)', category: 'Grains & bread', per100: { kcal: 365, p: 7.1, c: 80, f: 0.7, fib: 1.3 }, pkg: bls(1.118, 907, '2 lb bag'), allergens: [], animal: null, subs: [{ id: 'potatoes', factor: 4.5 }, { id: 'spaghetti', factor: 1 }] },
  { id: 'spaghetti', name: 'Spaghetti (dry)', category: 'Grains & bread', per100: { kcal: 371, p: 13, c: 75, f: 1.5, fib: 3.2 }, pkg: bls(1.375, 454, '1 lb box'), allergens: ['gluten'], animal: null, subs: [{ id: 'rice', factor: 1 }] },
  { id: 'bread', name: 'Sandwich bread', category: 'Grains & bread', per100: { kcal: 266, p: 8.9, c: 49, f: 3.3, fib: 2.7 }, pkg: bls(1.83, 567, '20 oz loaf'), allergens: ['gluten'], animal: null, unit: { name: 'slice', grams: 34 }, subs: [{ id: 'tortilla', factor: 1 }] },
  { id: 'tortilla', name: 'Whole-wheat tortillas', category: 'Grains & bread', per100: { kcal: 300, p: 9, c: 48, f: 8, fib: 7 }, pkg: est(3.0, 360, '8 count'), allergens: ['gluten'], animal: null, unit: { name: 'tortilla', grams: 45 }, subs: [{ id: 'bread', factor: 1 }] },
  { id: 'oats', name: 'Rolled oats', category: 'Grains & bread', per100: { kcal: 379, p: 13.2, c: 67.7, f: 6.5, fib: 10.1 }, pkg: est(4.5, 1190, '42 oz canister'), allergens: [], animal: null, subs: [] },
  // Protein
  { id: 'chicken-breast', name: 'Chicken breast, boneless', category: 'Protein', per100: { kcal: 120, p: 22.5, c: 0, f: 2.6, fib: 0 }, pkg: bls(4.203, 1361, '3 lb pack'), allergens: [], animal: 'meat', subs: [{ id: 'chicken-legs', factor: 1.5 }, { id: 'tofu', factor: 1 }, { id: 'chickpeas', factor: 1.2 }] },
  { id: 'chicken-legs', name: 'Chicken legs, bone-in', category: 'Protein', per100: { kcal: 113, p: 12.7, c: 0, f: 6.4, fib: 0 }, pkg: bls(1.739, 1361, '3 lb pack'), allergens: [], animal: 'meat', subs: [{ id: 'chicken-breast', factor: 0.67 }, { id: 'tofu', factor: 0.7 }] },
  { id: 'ground-beef', name: 'Ground beef, lean', category: 'Protein', per100: { kcal: 176, p: 20, c: 0, f: 10, fib: 0 }, pkg: bls(8.461, 454, '1 lb pack'), allergens: [], animal: 'meat', subs: [{ id: 'lentils', factor: 0.5 }, { id: 'dried-beans', factor: 0.5 }, { id: 'chicken-breast', factor: 1 }] },
  { id: 'tuna', name: 'Canned tuna in water (drained)', category: 'Protein', per100: { kcal: 116, p: 25.5, c: 0, f: 0.8, fib: 0 }, pkg: est(1.3, 113, '5 oz can'), allergens: ['fish'], animal: 'fish', unit: { name: 'can', grams: 113 }, subs: [{ id: 'chickpeas', factor: 2 }, { id: 'eggs', factor: 1 }] },
  { id: 'tofu', name: 'Firm tofu', category: 'Protein', per100: { kcal: 144, p: 15.8, c: 2.8, f: 8.7, fib: 2.3 }, pkg: est(2.25, 397, '14 oz block'), allergens: ['soy'], animal: null, subs: [{ id: 'eggs', factor: 1 }, { id: 'chickpeas', factor: 1.2 }] },
  { id: 'dried-beans', name: 'Dried black beans', category: 'Pantry', per100: { kcal: 341, p: 21.6, c: 62.4, f: 1.4, fib: 15.5 }, pkg: bls(1.669, 454, '1 lb bag'), allergens: [], animal: null, subs: [{ id: 'lentils', factor: 1 }, { id: 'chickpeas', factor: 2.2 }] },
  { id: 'lentils', name: 'Dried lentils', category: 'Pantry', per100: { kcal: 352, p: 24.6, c: 63.4, f: 1.1, fib: 10.7 }, pkg: est(1.8, 454, '1 lb bag'), allergens: [], animal: null, subs: [{ id: 'dried-beans', factor: 1 }] },
  { id: 'chickpeas', name: 'Canned chickpeas (drained)', category: 'Pantry', per100: { kcal: 139, p: 7, c: 22.5, f: 2.6, fib: 6.6 }, pkg: est(1.1, 240, '15 oz can'), allergens: [], animal: null, unit: { name: 'can', grams: 240 }, subs: [{ id: 'dried-beans', factor: 0.45 }] },
  // Dairy & eggs
  { id: 'eggs', name: 'Eggs, large', category: 'Dairy & eggs', per100: { kcal: 143, p: 12.6, c: 0.7, f: 9.5, fib: 0 }, pkg: bls(2.272 / (600 / lb), 600, '1 dozen'), allergens: ['egg'], animal: 'egg', unit: { name: 'egg', grams: 50 }, subs: [{ id: 'tofu', factor: 1 }] },
  { id: 'milk', name: 'Milk, whole', category: 'Dairy & eggs', per100: { kcal: 61, p: 3.2, c: 4.8, f: 3.3, fib: 0 }, pkg: bls(4.106 / (3785 / lb), 3785, '1 gallon'), allergens: ['dairy'], animal: 'dairy', subs: [{ id: 'greek-yogurt', factor: 0.6 }] },
  { id: 'greek-yogurt', name: 'Greek yogurt, plain nonfat', category: 'Dairy & eggs', per100: { kcal: 59, p: 10.3, c: 3.6, f: 0.4, fib: 0 }, pkg: est(5.0, 907, '32 oz tub'), allergens: ['dairy'], animal: 'dairy', subs: [] },
  { id: 'cheddar', name: 'Cheddar cheese', category: 'Dairy & eggs', per100: { kcal: 403, p: 24.9, c: 1.3, f: 33.1, fib: 0 }, pkg: bls(6.133, 227, '8 oz block'), allergens: ['dairy'], animal: 'dairy', subs: [{ id: 'greek-yogurt', factor: 1 }] },
  // Produce
  { id: 'banana', name: 'Bananas', category: 'Produce', per100: { kcal: 89, p: 1.1, c: 22.8, f: 0.3, fib: 2.6 }, pkg: bls(0.656, 118, 'each (~0.26 lb)'), allergens: [], animal: null, unit: { name: 'banana', grams: 118 }, subs: [{ id: 'berries', factor: 1 }] },
  { id: 'potatoes', name: 'Potatoes', category: 'Produce', per100: { kcal: 77, p: 2, c: 17.5, f: 0.1, fib: 2.2 }, pkg: bls(0.989, 2268, '5 lb bag'), allergens: [], animal: null, subs: [{ id: 'rice', factor: 0.22 }] },
  { id: 'tomatoes', name: 'Tomatoes, fresh', category: 'Produce', per100: { kcal: 18, p: 0.9, c: 3.9, f: 0.2, fib: 1.2 }, pkg: bls(1.992, 454, '1 lb'), allergens: [], animal: null, subs: [{ id: 'canned-tomatoes', factor: 1 }] },
  { id: 'onion', name: 'Yellow onions', category: 'Produce', per100: { kcal: 40, p: 1.1, c: 9.3, f: 0.1, fib: 1.7 }, pkg: est(3.0, 1361, '3 lb bag'), allergens: [], animal: null, subs: [] },
  { id: 'spinach', name: 'Baby spinach', category: 'Produce', per100: { kcal: 23, p: 2.9, c: 3.6, f: 0.4, fib: 2.2 }, pkg: est(2.5, 142, '5 oz box'), allergens: [], animal: null, subs: [{ id: 'broccoli', factor: 1.5 }] },
  // Frozen
  { id: 'mixed-veg', name: 'Frozen mixed vegetables', category: 'Frozen', per100: { kcal: 65, p: 2.9, c: 13, f: 0.5, fib: 4 }, pkg: est(2.0, 454, '16 oz bag'), allergens: [], animal: null, subs: [{ id: 'broccoli', factor: 1 }] },
  { id: 'broccoli', name: 'Frozen broccoli', category: 'Frozen', per100: { kcal: 30, p: 2.8, c: 5.4, f: 0.3, fib: 3 }, pkg: est(1.8, 340, '12 oz bag'), allergens: [], animal: null, subs: [{ id: 'mixed-veg', factor: 1 }, { id: 'spinach', factor: 0.7 }] },
  { id: 'berries', name: 'Frozen mixed berries', category: 'Frozen', per100: { kcal: 50, p: 0.7, c: 12, f: 0.3, fib: 2.5 }, pkg: est(3.5, 454, '16 oz bag'), allergens: [], animal: null, subs: [{ id: 'banana', factor: 1 }] },
  // Pantry
  { id: 'peanut-butter', name: 'Peanut butter', category: 'Pantry', per100: { kcal: 588, p: 25, c: 20, f: 50, fib: 6 }, pkg: est(3.0, 454, '16 oz jar'), allergens: ['peanut'], animal: null, subs: [] },
  { id: 'canned-tomatoes', name: 'Canned diced tomatoes', category: 'Pantry', per100: { kcal: 24, p: 1.1, c: 4.6, f: 0.2, fib: 1.6 }, pkg: est(1.25, 411, '14.5 oz can'), allergens: [], animal: null, unit: { name: 'can', grams: 411 }, subs: [{ id: 'tomatoes', factor: 1 }] },
  { id: 'olive-oil', name: 'Olive oil', category: 'Pantry', per100: { kcal: 884, p: 0, c: 0, f: 100, fib: 0 }, pkg: est(6.5, 435, '16 oz bottle'), allergens: [], animal: null, unit: { name: 'tbsp', grams: 13.5 }, subs: [] },
  { id: 'soy-sauce', name: 'Soy sauce', category: 'Pantry', per100: { kcal: 53, p: 8.1, c: 4.9, f: 0.6, fib: 0.8 }, pkg: est(2.5, 340, '10 oz bottle'), allergens: ['soy', 'gluten'], animal: null, unit: { name: 'tbsp', grams: 16 }, subs: [] },
  { id: 'salsa', name: 'Salsa', category: 'Pantry', per100: { kcal: 36, p: 1.5, c: 7, f: 0.2, fib: 1.9 }, pkg: est(3.0, 454, '16 oz jar'), allergens: [], animal: null, subs: [{ id: 'canned-tomatoes', factor: 1 }] },
  { id: 'seasoning', name: 'Spice blend (chili, cumin, garlic)', category: 'Pantry', per100: { kcal: 300, p: 12, c: 55, f: 8, fib: 30 }, pkg: est(1.5, 57, '2 oz jar'), allergens: [], animal: null, unit: { name: 'tsp', grams: 2.5 }, subs: [] },
];

const ING = new Map(INGREDIENTS.map((i) => [i.id, i]));
export const ingredient = (id: string) => ING.get(id)!;

export interface Recipe {
  id: string;
  name: string;
  mealTypes: MealType[];
  servings: number;
  ingredients: { id: string; grams: number }[];
  steps: string[];
  prepMin: number;
  cookMin: number;
  kitchen: Kitchen[]; // equipment required (empty = none)
  cuisine: string;
  storage: string;
  substitutions: string[];
  notes?: string;
}

const FRIDGE = 'Cool quickly and refrigerate within 2 hours of cooking. Keeps 3–4 days in the fridge. Reheat until steaming hot all the way through (165 °F / 74 °C).';
const FREEZE = ' Freezes well for 2–3 months; thaw overnight in the fridge.';

export const RECIPES: Recipe[] = [
  {
    id: 'overnight-oats', name: 'Peanut Butter Banana Overnight Oats', mealTypes: ['breakfast'], servings: 2,
    ingredients: [{ id: 'oats', grams: 120 }, { id: 'milk', grams: 360 }, { id: 'peanut-butter', grams: 32 }, { id: 'banana', grams: 236 }],
    steps: ['Split the oats and milk between two jars or containers.', 'Stir 1 tbsp peanut butter into each.', 'Slice one banana into each jar, or add it in the morning.', 'Cover and refrigerate at least 6 hours or overnight.'],
    prepMin: 5, cookMin: 0, kitchen: [], cuisine: 'American',
    storage: 'Keep covered in the fridge and eat within 3 days. Add banana the day you eat it if you prefer it firm.',
    substitutions: ['Any milk works, including soy or oat milk.', 'Swap peanut butter for sunflower seed butter if you avoid peanuts.'],
    notes: 'Oats are naturally gluten-free but often processed alongside wheat. Choose certified gluten-free oats if needed.',
  },
  {
    id: 'egg-potato-hash', name: 'Egg & Potato Breakfast Hash', mealTypes: ['breakfast', 'dinner'], servings: 4,
    ingredients: [{ id: 'potatoes', grams: 800 }, { id: 'eggs', grams: 400 }, { id: 'onion', grams: 150 }, { id: 'mixed-veg', grams: 300 }, { id: 'olive-oil', grams: 27 }, { id: 'cheddar', grams: 60 }],
    steps: ['Dice potatoes into ½-inch cubes and onion into small pieces.', 'Heat oil in a large pan over medium-high. Cook potatoes 12–15 minutes, stirring occasionally, until golden and tender.', 'Add onion and frozen vegetables; cook 5 minutes.', 'Make 8 small wells, crack in the eggs, cover and cook 4–6 minutes until whites are set and yolks are cooked to your liking (fully set if meal-prepping).', 'Top with shredded cheddar and season with salt and pepper.'],
    prepMin: 10, cookMin: 25, kitchen: ['stove'], cuisine: 'American',
    storage: FRIDGE + ' Cook yolks fully for meal prep.',
    substitutions: ['Use tofu crumbles instead of eggs.', 'Leave out the cheese for dairy-free.'],
  },
  {
    id: 'yogurt-berry-bowl', name: 'Greek Yogurt Berry Bowl', mealTypes: ['breakfast', 'snack'], servings: 2,
    ingredients: [{ id: 'greek-yogurt', grams: 450 }, { id: 'berries', grams: 200 }, { id: 'oats', grams: 40 }, { id: 'peanut-butter', grams: 16 }],
    steps: ['Divide yogurt between two bowls or containers.', 'Top with berries (thawed overnight in the fridge, or straight from frozen).', 'Add oats and a drizzle of peanut butter just before eating.'],
    prepMin: 5, cookMin: 0, kitchen: [], cuisine: 'American',
    storage: 'Yogurt and berries keep 2 days in the fridge. Add oats when eating so they stay crunchy.',
    substitutions: ['Use a soy-based yogurt for dairy-free.', 'Skip peanut butter if you avoid peanuts.'],
  },
  {
    id: 'chicken-rice-broccoli', name: 'Chicken, Rice & Broccoli Bowls', mealTypes: ['lunch', 'dinner'], servings: 6,
    ingredients: [{ id: 'chicken-breast', grams: 900 }, { id: 'rice', grams: 450 }, { id: 'broccoli', grams: 680 }, { id: 'olive-oil', grams: 27 }, { id: 'soy-sauce', grams: 45 }, { id: 'seasoning', grams: 6 }],
    steps: ['Cook rice according to the package (about 2 cups water per cup of rice).', 'Cut chicken into bite-size pieces and toss with seasoning.', 'Heat oil in a large pan over medium-high. Cook chicken 7–9 minutes until no pink remains and it reaches 165 °F (74 °C).', 'Steam or microwave the broccoli until hot.', 'Stir soy sauce into the chicken, then divide rice, chicken and broccoli evenly into 6 containers.'],
    prepMin: 10, cookMin: 25, kitchen: ['stove'], cuisine: 'Asian-inspired',
    storage: FRIDGE + FREEZE,
    substitutions: ['Use tamari for gluten-free soy sauce.', 'Swap chicken for tofu or chickpeas.'],
  },
  {
    id: 'beef-bean-chili', name: 'Beef & Black Bean Chili', mealTypes: ['lunch', 'dinner'], servings: 6,
    ingredients: [{ id: 'ground-beef', grams: 454 }, { id: 'dried-beans', grams: 340 }, { id: 'canned-tomatoes', grams: 822 }, { id: 'onion', grams: 200 }, { id: 'seasoning', grams: 20 }, { id: 'olive-oil', grams: 14 }],
    steps: ['Soak the dried beans overnight, then simmer in fresh water 60–90 minutes until tender, and drain. (Or use three 15 oz cans, rinsed.)', 'Heat oil in a large pot. Cook diced onion 5 minutes.', 'Add beef and cook, breaking it up, until browned with no pink (160 °F / 71 °C).', 'Stir in seasoning, tomatoes and beans with 1 cup water. Simmer 20 minutes.', 'Season to taste and divide into 6 portions.'],
    prepMin: 15, cookMin: 40, kitchen: ['stove'], cuisine: 'Mexican-inspired',
    storage: FRIDGE + FREEZE,
    substitutions: ['Use lentils instead of beef for a vegetarian chili.', 'Ground chicken works too.'],
    notes: 'Bean cooking time not included in the total.',
  },
  {
    id: 'lentil-potato-curry', name: 'Lentil & Potato Curry', mealTypes: ['lunch', 'dinner'], servings: 5,
    ingredients: [{ id: 'lentils', grams: 300 }, { id: 'potatoes', grams: 500 }, { id: 'canned-tomatoes', grams: 411 }, { id: 'onion', grams: 150 }, { id: 'spinach', grams: 142 }, { id: 'olive-oil', grams: 27 }, { id: 'seasoning', grams: 15 }],
    steps: ['Rinse lentils. Dice onion and potatoes into ½-inch pieces.', 'Heat oil in a pot and cook onion 5 minutes; add seasoning for 1 minute.', 'Add lentils, potatoes, tomatoes and 4 cups water. Simmer 25–30 minutes, stirring, until lentils and potatoes are soft.', 'Stir in spinach until wilted. Season with salt.'],
    prepMin: 10, cookMin: 35, kitchen: ['stove'], cuisine: 'Indian-inspired',
    storage: FRIDGE + FREEZE + ' Add a splash of water when reheating.',
    substitutions: ['Any lentil works; red lentils cook fastest.', 'Swap spinach for frozen broccoli.'],
  },
  {
    id: 'black-bean-rice-bowls', name: 'Black Bean & Rice Burrito Bowls', mealTypes: ['lunch', 'dinner'], servings: 5,
    ingredients: [{ id: 'dried-beans', grams: 340 }, { id: 'rice', grams: 300 }, { id: 'mixed-veg', grams: 454 }, { id: 'salsa', grams: 300 }, { id: 'onion', grams: 100 }, { id: 'seasoning', grams: 12 }, { id: 'olive-oil', grams: 14 }],
    steps: ['Cook beans as in the chili recipe (or use three rinsed cans).', 'Cook rice according to the package.', 'Sauté onion in oil 4 minutes, add vegetables and seasoning, cook until hot.', 'Stir in the beans to warm through.', 'Divide rice, beans and vegetables into 5 containers; top with salsa when serving.'],
    prepMin: 10, cookMin: 30, kitchen: ['stove'], cuisine: 'Mexican-inspired',
    storage: FRIDGE + FREEZE + ' Freeze without salsa.',
    substitutions: ['Add cheddar or Greek yogurt if you eat dairy.', 'Swap rice for potatoes.'],
  },
  {
    id: 'tuna-tomato-pasta', name: 'Tuna & Tomato Pasta', mealTypes: ['lunch', 'dinner'], servings: 4,
    ingredients: [{ id: 'spaghetti', grams: 454 }, { id: 'tuna', grams: 339 }, { id: 'canned-tomatoes', grams: 411 }, { id: 'broccoli', grams: 340 }, { id: 'olive-oil', grams: 27 }, { id: 'onion', grams: 100 }],
    steps: ['Boil pasta in salted water per the package; add broccoli for the last 3 minutes. Drain.', 'Meanwhile, cook diced onion in oil 5 minutes, add tomatoes and simmer 8 minutes.', 'Flake in the drained tuna and warm through.', 'Toss with the pasta and broccoli; divide into 4 portions.'],
    prepMin: 5, cookMin: 20, kitchen: ['stove'], cuisine: 'Italian-inspired',
    storage: FRIDGE,
    substitutions: ['Use chickpeas instead of tuna for vegetarian.', 'Gluten-free pasta works the same way.'],
  },
  {
    id: 'tofu-stir-fry', name: 'Crispy Tofu Veggie Stir-fry', mealTypes: ['lunch', 'dinner'], servings: 4,
    ingredients: [{ id: 'tofu', grams: 794 }, { id: 'rice', grams: 240 }, { id: 'mixed-veg', grams: 680 }, { id: 'soy-sauce', grams: 45 }, { id: 'olive-oil', grams: 27 }],
    steps: ['Cook rice according to the package.', 'Press tofu between towels for 10 minutes, then cut into cubes.', 'Heat oil in a large pan over medium-high; fry tofu 8–10 minutes, turning, until golden.', 'Add frozen vegetables and cook 5 minutes until hot.', 'Stir in soy sauce; serve over rice in 4 portions.'],
    prepMin: 15, cookMin: 20, kitchen: ['stove'], cuisine: 'Asian-inspired',
    storage: FRIDGE,
    substitutions: ['Use tamari for gluten-free.', 'Swap tofu for eggs or chicken.'],
  },
  {
    id: 'egg-fried-rice', name: 'Veggie Egg Fried Rice', mealTypes: ['lunch', 'dinner'], servings: 4,
    ingredients: [{ id: 'rice', grams: 300 }, { id: 'eggs', grams: 300 }, { id: 'mixed-veg', grams: 454 }, { id: 'soy-sauce', grams: 30 }, { id: 'olive-oil', grams: 27 }, { id: 'onion', grams: 100 }],
    steps: ['Cook rice ahead, spread it on a tray to cool, and refrigerate within 1 hour (cold rice fries best and this keeps it safe).', 'Heat half the oil, scramble the eggs until fully set, and set aside.', 'Add remaining oil, onion and vegetables; cook 5 minutes.', 'Add cold rice and stir-fry 5 minutes until piping hot.', 'Stir in eggs and soy sauce; divide into 4 portions.'],
    prepMin: 10, cookMin: 15, kitchen: ['stove'], cuisine: 'Asian-inspired',
    storage: 'Cooked rice needs extra care: cool it fast and refrigerate within 1 hour. Eat within 3 days and reheat until steaming hot.',
    substitutions: ['Use tofu instead of eggs.', 'Add leftover chicken for more protein.'],
  },
  {
    id: 'sheet-pan-chicken', name: 'Sheet-pan Chicken & Potatoes', mealTypes: ['lunch', 'dinner'], servings: 4,
    ingredients: [{ id: 'chicken-legs', grams: 1361 }, { id: 'potatoes', grams: 907 }, { id: 'broccoli', grams: 454 }, { id: 'olive-oil', grams: 27 }, { id: 'seasoning', grams: 10 }],
    steps: ['Heat oven to 425 °F (220 °C).', 'Cut potatoes into wedges; toss with half the oil and seasoning on a sheet pan.', 'Rub chicken with remaining oil and seasoning; nestle among potatoes.', 'Roast 40–45 minutes until chicken reaches 165 °F (74 °C) at the thickest part, adding broccoli for the last 12 minutes.', 'Divide into 4 portions.'],
    prepMin: 10, cookMin: 45, kitchen: ['oven'], cuisine: 'American',
    storage: FRIDGE + FREEZE,
    substitutions: ['Boneless breast cooks in about 20–25 minutes.', 'Sweet potatoes work in place of white.'],
    notes: 'Nutrition for chicken legs is per gram as purchased, with bone. Estimates are less precise than for boneless cuts.',
  },
  {
    id: 'pb-banana-toast', name: 'Peanut Butter Banana Toast', mealTypes: ['breakfast', 'snack'], servings: 1,
    ingredients: [{ id: 'bread', grams: 68 }, { id: 'peanut-butter', grams: 32 }, { id: 'banana', grams: 118 }],
    steps: ['Toast two slices of bread.', 'Spread with peanut butter and top with sliced banana.'],
    prepMin: 3, cookMin: 2, kitchen: [], cuisine: 'American',
    storage: 'Best made fresh.',
    substitutions: ['Use a tortilla instead of bread for a wrap.', 'Sunflower seed butter for peanut-free.'],
  },
  {
    id: 'chickpea-spinach-pasta', name: 'Chickpea & Spinach Tomato Pasta', mealTypes: ['lunch', 'dinner'], servings: 4,
    ingredients: [{ id: 'spaghetti', grams: 340 }, { id: 'chickpeas', grams: 480 }, { id: 'spinach', grams: 142 }, { id: 'canned-tomatoes', grams: 411 }, { id: 'olive-oil', grams: 27 }, { id: 'onion', grams: 100 }, { id: 'seasoning', grams: 6 }],
    steps: ['Cook pasta per the package; drain.', 'Cook diced onion in oil 5 minutes; add seasoning, tomatoes and chickpeas. Simmer 10 minutes.', 'Stir in spinach until wilted.', 'Toss with pasta and divide into 4 portions.'],
    prepMin: 5, cookMin: 20, kitchen: ['stove'], cuisine: 'Italian-inspired',
    storage: FRIDGE,
    substitutions: ['Gluten-free pasta works.', 'Add tuna for extra protein if you eat fish.'],
  },
  {
    id: 'beef-taco-bowls', name: 'Beef Taco Rice Bowls', mealTypes: ['lunch', 'dinner'], servings: 5,
    ingredients: [{ id: 'ground-beef', grams: 454 }, { id: 'rice', grams: 300 }, { id: 'dried-beans', grams: 200 }, { id: 'cheddar', grams: 113 }, { id: 'tomatoes', grams: 300 }, { id: 'seasoning', grams: 20 }, { id: 'onion', grams: 100 }],
    steps: ['Cook beans (or use two rinsed cans) and rice.', 'Brown beef with onion until no pink remains (160 °F / 71 °C); stir in seasoning and ¼ cup water.', 'Dice tomatoes and shred cheese.', 'Divide rice, beans and beef into 5 containers; top with tomatoes and cheese when serving.'],
    prepMin: 10, cookMin: 25, kitchen: ['stove'], cuisine: 'Mexican-inspired',
    storage: FRIDGE + ' Keep tomatoes separate and add fresh.',
    substitutions: ['Lentils in place of beef for vegetarian.', 'Greek yogurt in place of cheese.'],
  },
  {
    id: 'yogurt-pb-snack', name: 'Protein Yogurt Cup', mealTypes: ['snack'], servings: 1,
    ingredients: [{ id: 'greek-yogurt', grams: 170 }, { id: 'peanut-butter', grams: 16 }, { id: 'berries', grams: 75 }],
    steps: ['Spoon yogurt into a bowl or container.', 'Swirl in peanut butter and top with berries.'],
    prepMin: 2, cookMin: 0, kitchen: [], cuisine: 'American',
    storage: 'Keeps 1 day in the fridge.',
    substitutions: ['Soy yogurt for dairy-free.'],
  },
  {
    id: 'tuna-chickpea-wraps', name: 'Tuna & Chickpea Wraps', mealTypes: ['lunch'], servings: 3,
    ingredients: [{ id: 'tuna', grams: 226 }, { id: 'chickpeas', grams: 240 }, { id: 'spinach', grams: 90 }, { id: 'greek-yogurt', grams: 150 }, { id: 'tortilla', grams: 135 }],
    steps: ['Mash the chickpeas lightly with a fork.', 'Mix in drained tuna and Greek yogurt; season with salt, pepper and lemon if you have it.', 'Divide filling and spinach over 3 tortillas and roll up.'],
    prepMin: 10, cookMin: 0, kitchen: [], cuisine: 'American',
    storage: 'Keep the filling in the fridge up to 2 days; assemble wraps the day you eat them.',
    substitutions: ['Use eggs (hard-boiled) instead of tuna.', 'Bread works in place of tortillas.'],
  },
];

const REC = new Map(RECIPES.map((r) => [r.id, r]));
export const recipe = (id: string) => REC.get(id);

export const ALLERGEN_LABEL: Record<Allergen, string> = { egg: 'Egg', dairy: 'Dairy', gluten: 'Gluten (wheat)', peanut: 'Peanut', tree_nut: 'Tree nuts', soy: 'Soy', fish: 'Fish', shellfish: 'Shellfish', sesame: 'Sesame' };

export function allowedByPattern(ing: Ingredient, pattern: DietPattern): boolean {
  if (!ing.animal) return true;
  if (pattern === 'omnivore') return true;
  if (pattern === 'pescatarian') return ing.animal !== 'meat';
  if (pattern === 'vegetarian') return ing.animal === 'egg' || ing.animal === 'dairy';
  return false; // vegan
}
