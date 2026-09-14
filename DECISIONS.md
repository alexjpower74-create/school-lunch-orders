# School Lunch Orders: decisions

Alexander was asleep; the lead (sl-lead) made these calls so the build could keep moving. Each one is easy to reverse.
Newest at the bottom.

1. **Two slices, split by who holds the phone.** sl1 = the Worker **and** the parent's phone pages (cut-off, allergen
   acknowledgement and "all or nothing" live on both sides of one API call); sl2 = the kitchen, teacher, office and settings pages.
   The lead owns the design tokens, the shared page helpers, the test scaffolding and the cross-slice journey.
2. **Three staff roles.** `admin` (the office: settings, ledger, and it can open the kitchen and teacher pages), `kitchen`,
   `teacher`. The brief's "admin PIN" and "office" are the same person in a small NL school; splitting them later is one role.
3. **Cut-off = 9:00 AM the school day before, skipping weekends, holidays and PD days, but not storm closures.** Planned days off
   are known in advance, so the kitchen's "day before" is the real working day before. A storm closure is added on the morning it
   happens; letting it move tomorrow's cut-off back a day would lock parents out without warning. Both numbers are settings.
4. **The allergen list follows Health Canada and CFIA, not the brief's "9".** The official pages list 11 priority allergens
   (sulphites included) plus gluten sources today. One `gluten` key covers barley, oats, rye, triticale and wheat because that is
   how a family with celiac disease thinks about it. Quotes are checked word for word against the saved pages
   (`tools/check-allergen-quotes.mjs`, which has a self-test that must go red).
5. **"I understand" is enforced by the server, per order line.** The order page asks once per item for that child (the tap that
   adds it) and the cart shows the tick again; the Worker refuses any line whose item contains an allergen ticked for that child
   without `allergen_ack: true`. Only that child's own allergies count, never a sibling's.
6. **Kitchen and labels use the allergies as they are now.** If a parent ticks a new allergy after ordering, the kitchen sees the
   conflict at once, marked "Not confirmed by the parent". Safer than trusting the snapshot.
7. **Money is a ledger, not a paid flag.** Orders add a charge; cancellations, closures and payments add credits; the balance is
   the sum. "Mark paid" = record the amount that arrived (e-Transfer, cash, cheque, other). Payments and adjustments can be undone,
   and stay listed struck through. Nothing old is ever edited, so the office can always explain a balance.
8. **Any no-school day added after orders cancels and credits them**, not only storm closures (a PD day added late too), in one
   D1 batch, one credit entry per family. Removing the day later does not bring the orders back; parents order again.
9. **Absent does not credit.** The lunch was made. The office can add an adjustment if the school's policy says otherwise.
10. **Family codes are 8 characters without look-alikes (no I, L, O, 0, 1), stored hashed, shown once.** A code is like a
    password to children's allergy information, so the office sees it only when it is made; a lost paper means a new code, which
    signs out every phone that used the old one. 10 wrong tries from one address in 15 minutes locks that address out for the
    window.
11. **Children are first names plus a room.** No surnames, no birthdays, no photos: the kitchen label needs name, room, item and
    allergy, nothing more. Two children with the same first name in a room is a known gap (the parent can type "Liam B.").
12. **A per-item daily maximum, not a per-child total.** "Optional daily max per child" is set on each item (e.g. 2 milks), which
    is how a lunch program limits add-ons. No global cap.
13. **The menu is explicit per day.** Each item has usual days, and "Fill from usual days" writes a week; the kitchen can then
    change any day. An item already ordered for a day cannot be taken off that day's menu (make it a no-school day instead).
14. **Tests share one fixed calendar.** The seed is the 2026–27 SAMPLE school year with Thanksgiving, a PD day and Remembrance Day,
    and tests pin "now" to Tue Sep 15 2026, 11:00 AM NDT, so every cut-off example in docs/API.md is exact.
15. **One wording for a conflict, everywhere.** "Liam is allergic to Milk. Macaroni and cheese contains Milk." on the order page,
    in the cart, in the Worker's refusal and on home; the kitchen label leads with only the conflict ("ALLERGY: Eggs. Contains
    Eggs.") and lists the child's other allergies on a second line. A parent and the kitchen describe the same risk the same way
    (sl2's cross-review found three different phrasings).
16. **An allergy ticked after ordering reaches the parent too.** The kitchen already saw "Not confirmed by the parent"; now the
    parent's home screen shows the same red warning on that lunch with "I understand, keep it" or Cancel. Confirming never changes
    the kitchen's numbers, so it has no cut-off (sl2's cross-review).
