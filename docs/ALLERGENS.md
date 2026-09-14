# Allergens: the list and where it comes from

The app's allergen list is the Canadian **priority allergens** plus **gluten sources**, exactly as Health Canada and the Canadian
Food Inspection Agency (CFIA) list them. Keys and labels are in `docs/API.md` ("Allergens").

The brief said "the 9 priority allergens". The official pages list more than nine today: eleven priority allergens (sulphites
included) plus gluten sources. The app follows the official pages (DECISIONS.md #4).

Every quote below is checked as an exact substring of the saved page (whitespace collapsed, tags removed) by
`node tools/check-allergen-quotes.mjs`. Saved pages are in `data/sources/`, fetched 2026-09-14 with the User-Agent
`APCO-Software-Tools-research/1.0 (+https://apcosoftwaretools.ca)`; canada.ca's robots.txt does not disallow these paths.

## The list the app uses

| key | label on screen | source |
|---|---|---|
| `eggs` | Eggs | CFIA, Health Canada |
| `milk` | Milk | CFIA, Health Canada |
| `mustard` | Mustard | CFIA, Health Canada |
| `peanuts` | Peanuts | CFIA, Health Canada |
| `crustaceans_molluscs` | Crustaceans and molluscs | CFIA, Health Canada |
| `fish` | Fish | CFIA, Health Canada |
| `sesame` | Sesame seeds | CFIA, Health Canada |
| `soy` | Soy | CFIA, Health Canada |
| `sulphites` | Sulphites | CFIA, Health Canada |
| `tree_nuts` | Tree nuts | CFIA, Health Canada |
| `wheat_triticale` | Wheat and triticale | CFIA, Health Canada |
| `gluten` | Gluten (barley, oats, rye, triticale, wheat) | CFIA; oats: Health Canada Q&A |

One `gluten` key covers every gluten source, because a family with a child who has celiac disease ticks "gluten", not five grains.
An item made with wheat gets both `wheat_triticale` and `gluten`; an item made with oats gets `gluten`.

## Sources and quotes

### CFIA: Before you shop: food allergies and allergen labelling
URL: https://inspection.canada.ca/en/food-labels/labelling/consumers/food-allergies · saved as `data/sources/cfia-food-allergies.html` · fetched 2026-09-14

source: cfia-food-allergies.html
> In Canada, the most common allergens in food are known as priority allergens, and must be clearly identified on prepackaged food labels.

source: cfia-food-allergies.html
> These priority allergens are: eggs milk mustard peanuts crustaceans and molluscs fish sesame seeds soy sulphites tree nuts (almonds, Brazil nuts, cashews, hazelnuts, macadamia nuts, pecans, pine nuts, pistachios and walnuts) wheat and triticale

source: cfia-food-allergies.html
> Like priority allergens, gluten sources must be identified on prepackaged food labels. The grains that are gluten sources are: barley oats rye triticale wheat

### Health Canada: Common food allergens
URL: https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety/food-allergies-intolerances/food-allergies.html · saved as `data/sources/food-allergies.html` · fetched 2026-09-14 (page dated 2026-05-28)

source: food-allergies.html
> These substances are often referred to as priority food allergens.

source: food-allergies.html
> Eggs Milk Mustard Peanuts Crustaceans and molluscs Fish Sesame seeds Soy Sulphites Tree Nuts Wheat and triticale

### Health Canada: Questions and answers about the regulations to enhance the labelling of food allergens, gluten and added sulphites
URL: https://www.canada.ca/en/health-canada/services/food-nutrition/food-labelling/allergen-labelling/questions-answers-about-new-regulations-enhance-labelling-food-allergens-gluten-added-sulphites.html · saved as `data/sources/regulations-qa.html` · fetched 2026-09-14

source: regulations-qa.html
> Health Canada still considers regular commercial oats as a source of gluten due mainly to the high potential of cross-contamination with other grain cereals containing gluten.

## What the app does and does not claim

- The app shows **what the school typed** about each menu item. It never decides on its own that an item is safe.
- A red warning appears when an item's listed allergens include one ticked for that child. No warning does not mean "safe": the
  kitchen's own ingredient list and cross-contact practices decide that, and the order page says so in plain words.
- The SAMPLE menu's ingredients are made up for the demo and are not a real kitchen's recipes.
