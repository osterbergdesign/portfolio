---
title: beofaus
tagline: A bathroom tap that pays homage to the Bang & Olufsen Beomic 2000 microphone.
summary: A Sub-D modelling and rendering exercise — tap, basin, soap bottles and the whole room modelled from scratch in Autodesk Alias, then lit and rendered in KeyShot.
context: D0005A, assignment 5
team: Solo project
role: Concept, Sub-D modelling, materials, lighting and rendering
disciplines: [CAD & surfacing, Visualization]
tools: [Autodesk Alias (Sub-D), KeyShot]
highlights:
  - Every model and the room built from scratch in Alias
  - The signature grille made from 16 cylinders rotated 22.5° apart, then intersected and trimmed
  - A stubborn surfacing problem solved by realigning cut-outs away from the surface splits
  - Lighting and materials in KeyShot
cover: ./cover.jpg
coverAlt: Chrome tap with a ribbed grille over a white vessel basin on a marble counter
accent: mustard
order: 4
gallery:
  - src: ./render-countertop.jpg
    alt: Wide view of the basin, tap and soap bottles on a marble counter
    caption: Final render.
    wide: true
  - src: ./subd-body.jpg
    alt: Alias screenshots of the tap body built from Sub-D cylinders
    caption: Tap body from Sub-D cylinders.
  - src: ./subd-grille.jpg
    alt: Alias screenshots of the grille built from rotated cylinders
    caption: The grille — 16 cylinders, intersected and trimmed.
  - src: ./render-side.jpg
    alt: Side view of the tap and its hose over the basin
    caption: Side view with the hose.
  - src: ./render-basin.jpg
    alt: Close view of the tap grille over the white basin
    caption: Detail of the grille.
  - src: ./room-blockout.jpg
    alt: Grey Alias blockout of the bathroom
    caption: Room blockout in Alias.
---

## Idea

I've always liked Bang & Olufsen's products, so a brief to model a water tap became a tribute to the Beomic 2000, an older B&O microphone. Modelling skill was graded, not originality, so I followed the microphone's form as closely as a working tap allowed and made my own calls where it didn't.

## Modelling the tap

The body is a set of Sub-D cylinders extruded in pivot mode, so thicknesses could change without switching tools or falling back to NURBS. Fill hole closed the ends; crease, bevel and moving individual vertices with the transform tool — more precise than move and scale — sharpened the edges. The hose also started as a cylinder, extruded in global mode so the bend kept an even thickness.

The grille at the front was the hard part: 16 cylinders rotated 22.5° apart, capped on one side, then intersected and trimmed against the body. It kept failing until I found that the cut-outs had to be lined up so they didn't sit too close to the surface's splits.

## The room

The bathroom is built from 1–5-span cubes and planes stretched with the transform tool. The basin is two cubes nested and trimmed with a plane, with vertices pulled to create the wavy rim and a round to finish. Soap bottles and the diffuser holder — with a visible liquid level — came from the same toolkit.

## Rendering

Materials came from KeyShot's library, with the metal recoloured from gold to chrome. Compared with my earlier water-bottle assignment, the lighting and context are a clear step up in realism.

## Takeaway

I already knew Sub-D basics from Blender and the VR tool Gravity Sketch, which made Alias feel intuitive — but Alias works differently enough that Blender habits didn't always transfer.
