# School Lunch Orders — brief (Onyx, 2026-09-14)

**Prefix** `sl` · **Ports** app 8601, worker 8602, QA 8609 · **Repo** `school-lunch-orders` (private) · **Lead effort** xhigh

## What
Hot lunch pre-orders for a school (or a school's parent council / lunch provider) in Newfoundland: parents order
lunches for the coming days or weeks on their phone, the kitchen gets daily totals by item and by class with
**allergens flagged**, and teachers get a class list at lunchtime showing who ordered what. Many NL schools still
do this on paper forms and cash envelopes.

## Menu and settings (admin PIN)
Menu items with price, ingredients, **allergens** (the 9 priority allergens Health Canada lists, plus gluten
sources — research and cite the official list in `docs/ALLERGENS.md`), vegetarian flag, available days;
menu calendar by week; order cut-off (e.g. 9:00 AM the school day before); no-school days (PD days, holidays,
storm closures added on the day — orders for that day are cancelled and credited); classes and grades; price
per item and optional daily max per child.

## Parent (phone, account = email-less family code)
Family code (given by the school on paper) → children (first name, class, allergies ticked from the list) → pick
days and items for each child → the app **warns in red** when an item contains an allergen ticked for that child
and requires an explicit "I understand" per item → cart → order total → payment instructions text the school sets
(e-Transfer / cash envelope). The app **takes no payments**. Order history, balance owing/credit, cancel before
cut-off.

## Kitchen and school
Kitchen: tomorrow's totals by item, by class, allergen-flagged rows on top, printable labels per child (name,
class, item, allergen warning). Teacher: class lunch list for today (tablet/phone), mark delivered/absent.
Office: payments ledger (mark paid), balances, credits from cancellations/closures, CSV export.

## Data
SAMPLE school "SAMPLE Harbour Pond Elementary (demo)", SAMPLE families and children (first names only, labelled
SAMPLE).

## Tests that matter
Cut-off enforced on a fake clock (negative control: move the clock back, order allowed; forward, refused);
allergen warning appears for a child with that allergy and not for a sibling without it (negative control);
storm-closure day cancels and credits every order for that day to the cent; kitchen totals equal the sum of
orders; journeys chromium + webkit at 390 + 1280.
