/* Theme constants and formatters, kept in their own module so leaf components
   (e.g. components/Tutorial.tsx) can use them without importing the components
   barrel — which would create an import cycle. `components.tsx` re-exports both,
   so existing `import { BRAND, fmt$ } from '../components'` keeps working. */

// Official UCLA palette (see UCLA Slack theme): Navy #003b5c, Bruin Blue #005587,
// Light Blue #8bb8e8, Gold #ffb81c, Bright Gold #ffd100.
export const BRAND = {
  navy: '#003b5c',        // deep navy — headers / dark accents
  bruinBlue: '#005587',   // UCLA Bruin blue — primary brand
  lightBlue: '#8bb8e8',   // light blue accent
  bruinGold: '#ffb81c',   // UCLA gold
  brightGold: '#ffd100',  // bright gold
  action: '#005587',      // primary action = Bruin blue
  production: '#005587',  // Joke Maker lane
  marketing: '#003b5c',   // Marketing lane — navy (distinct from production)
  market: '#ffb81c',      // on-market lane — gold
  sold: '#059669',        // sold / revenue — kept green for meaning
  waste: '#e11d48',       // wasted / loss — kept red for meaning
} as const;

export const fmt$ = (n: number): string =>
  n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
