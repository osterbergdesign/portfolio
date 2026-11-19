---
title: Bicycle helmet
tagline: Choosing the material and manufacturing process for every part of a bicycle helmet.
summary: A design translation table, CES EduPack charts and process reasoning for the shell, liner, padding, strap and buckle — with the trade-offs and sustainability calls written down.
year: 2024
context: T0021T Materials and Manufacturing Methods
team: Group of 3
role: Project leader — organised the work and made the final calls
disciplines: [Materials & production]
tools: [Ansys Granta EduPack (CES), Ashby charts]
highlights:
  - "My part: project leader — organised the group's work and made the final calls"
  - Polycarbonate shell, vacuum-formed — the highest impact strength among the shortlisted plastics
  - EPS liner moulded as one piece, because glue lines create weak points
  - Open-cell PU padding, cut on a CNC hot-wire cutter from bought-in sheet
  - PET webbing for fatigue strength and recyclability; a PC copolymer buckle, injection moulded
  - "PP foam rejected: 20 % denser, 89 % higher compressive stress at 50 % strain, poor UV rating and a glass transition at −20 °C"
cover: ./cover.jpg
coverAlt: Graphic cross-section of a helmet showing a thin navy shell, a thick hatched foam liner and a rust padding layer, with straps and a buckle
accent: sand
order: 6
gallery:
  - src: ./liner-foam-chart.jpg
    alt: CES EduPack bubble chart of compressive modulus against elastic stored energy, with the shortlisted foams highlighted in green
    caption: Liner foams — compressive modulus against elastic stored energy, ranked along a 1:1 line.
    wide: true
  - src: ./shell-chart.jpg
    alt: CES EduPack chart of impact strength against density for shell plastics
    caption: Shell plastics — impact strength against density.
  - src: ./buckle-chart.jpg
    alt: CES EduPack chart of fatigue strength against density for buckle plastics
    caption: Buckle plastics — fatigue strength against density.
---

## The task

For each part of a helmet, translate its function into objectives, constraints and free variables, narrow the candidates in CES EduPack, then choose and justify a material and a manufacturing process.

## How we chose

Wherever we could, constraints came from materials that already work in the field: shell stiffness and toughness limits from the PET, PC and ABS used in today's helmets, and strap properties from seatbelt polyester. Every part shared a base set of requirements — UV resistant, safe against skin, insoluble in water, easy to mass-produce, and stable mechanical properties from −30 °C to 50 °C, because Swedish winters are cold.

We then plotted the survivors on Ashby charts — for the foams, compressive modulus against elastic stored energy — ranked them, and compared the last two or three by hand. As project leader I organised the work and made the final call when a shortlist came down to those last candidates.

## Decisions

| Part | Material | Process | Deciding factor |
| --- | --- | --- | --- |
| Shell | PC, high viscosity | Vacuum forming | Highest impact strength of the shortlist; TPU dropped for poor impact strength in the cold |
| Liner | EPS foam, closed cell | Moulded in one piece | Best balance of density, stiffness and stored energy; the industry standard |
| Padding | PU foam, elastomeric, open cell | CNC hot-wire cutting | Soft, even compression curve that breathes and takes up sweat |
| Strap | PET (polyester) | Melt spinning, woven into webbing | Fatigue strength and recyclability; beat PLA |
| Buckle | PC copolymer, heat resistant | Injection moulding | Highest elastic stored energy and yield strength of the three finalists |

## Sustainability, honestly

We explored cork as a renewable liner, but EPS outperformed it on what matters most in a crash. EPS is cheap and well understood by manufacturers, but energy-intensive to recycle. PET webbing can be recycled several times but doesn't biodegrade — the opposite of PLA — so there's no clear winner between them, and the report says so.
