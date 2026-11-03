---
title: Vending machine interface
tagline: A touchscreen redesign for the campus vending machines — purchase time cut from 68 to 23 seconds.
summary: Observations, a survey and eye-tracking user tests behind a new purchase flow for the vending machines at Luleå University of Technology. Three competing Figma prototypes — mine set the direction for the start screen.
year: 2024
context: D0055A Human–Machine Interaction
team: Group of 4
role: Built one of the three competing Figma prototypes; shared research and testing
disciplines: [UX & interaction]
tools: [Figma, Tobii Pro Glasses 3, Surveys, Observation, Task analysis]
highlights:
  - Average purchase time fell from 1 min 8 s to 23 s for first-time users, and to 14 s for returning users
  - Every test participant preferred the new interface to the existing one
  - Five eye-tracked user tests with Tobii Pro Glasses 3, four tasks each, followed by structured interviews
  - "Fixes driven by the tests: + and − swapped after nearly every user tapped minus when asked to add, and a large red cancel button added"
  - Designed to work for the most common type of colour blindness
cover: ./cover.jpg
coverAlt: Three screens of the new vending machine interface — start screen, store and cart — on a sand background
accent: navy
featured: true
order: 5
gallery:
  - src: ./concepts-start.jpg
    alt: Three alternative start screens side by side
    caption: Start screens from the three prototypes. Mine, on the right, was chosen.
    wide: true
  - src: ./concepts-store.jpg
    alt: Three alternative store screens side by side
    caption: Store screens from the three prototypes.
  - src: ./concepts-cart.jpg
    alt: Three alternative cart screens side by side
    caption: Cart screens from the three prototypes.
  - src: ./observed-paths.jpg
    alt: Diagram of the different paths users took through the existing vending machine
    caption: Observed paths through the old machine — several routes to the same result.
    wide: true
  - src: ./survey-ease-of-use.jpg
    alt: Bar chart of survey answers on how easy the machines are to use, on a scale from 1 to 7
    caption: "Survey: how easy are the machines to understand? 1 = very easy, 7 = impossible."
  - src: ./start-screen.jpg
    alt: Final start screen with a large green Order here button over a campus photo and a language selector
    caption: Final start screen.
  - src: ./store-screen.jpg
    alt: Final store screen with category icons, search and best-sellers grid
    caption: Store with best-sellers first.
  - src: ./cart-screen.jpg
    alt: Final cart sheet with item quantities, a red cancel button and a pay button
    caption: Swipe-up cart with the added cancel button.
  - src: ./payment-screen.jpg
    alt: Payment choice between Swish and card
    caption: Payment — Swish or card.
---

## The problem

Students and staff at Luleå University of Technology queue at vending machines with unclear instructions. Purchases fail and people give up. We limited the project to the interface, so we could test real improvements on real users on campus.

## Research

- **Survey, 25 responses.** 64 % had run into problems, mostly with the card reader and payment. 76 % preferred contactless card payment. Among people who used the machines less than once a month, 85 % found them hard to use.
- **Observation.** A purchase took 68 seconds on average, with about 11.7 inputs where four is the minimum. The most common errors were payments not going through and not pressing start.
- **Task analysis.** Mapping the observed paths showed a confusing system with no single right way through — several routes led to the same result.
- **Benchmarking.** Self-service ordering from MAX, McDonald's and similar food systems.

## Three prototypes

Three of us each built a separate prototype in Figma. Mine used a large, swappable background image and one big central button; it was chosen for the start screen and reused almost entirely. The store and cart combined the best of all three: product cards, search by name or slot number (so the machine's existing numbering still works), every item in a category on one page, and a cart that swipes up from the bottom.

## Testing with eye tracking

Five participants completed four tasks — from buying a single item to changing language, editing the cart and cancelling — while wearing Tobii Pro Glasses 3, followed by a ten-question interview. The tests changed the design:

- Almost every user tapped minus when asked to add an item, so plus moved to the right.
- Users lost time when they wanted to back out, so a large red cancel button joined the back button.
- Most users looked to the top right for the cart, so that's where it lives — with a bag icon instead of a trolley to leave room for a large item count.

## Result

Average purchase time dropped from 1 min 8 s to 23 s for new users and 14 s for returning users (after two purchases). Every participant preferred the new interface; one called it "10 times better".

## What we'd do differently

We measured satisfaction with our own questions rather than the standard SUS questionnaire, and five testers is too few to generalise from. The final prototype also lacked clear feedback when an item is added to the cart — the first gap to close in a next iteration.
