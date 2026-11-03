---
title: ICA Lists for Home Assistant
tagline: ICA shopping lists as Home Assistant to-do lists — and any list in the house mirrored into ICA.
summary: A custom integration that keeps ICA's shopping lists and Home Assistant in step both ways. Add milk by voice, on the dashboard or in Google Keep, and it's on the ICA list — sorted by your store's layout — when you get there.
year: 2026
context: Own project, on GitHub
team: Solo project
disciplines: [Software, Home automation]
tools: [Python, Home Assistant, HACS, Automated tests]
highlights:
  - Two-way sync — changes made in the ICA app show up at home within a couple of minutes, and the other way round
  - A mirror that copies any Home Assistant to-do list (Google Keep, Bring!, the built-in shopping list) into an ICA list
  - Safety rules — mass removals wait three minutes for a second look, and every change is read back so a silent failure never undoes anything in ICA
  - The sync rules are pure functions, tested against a fake ICA server and inside a real Home Assistant core
cover: ./cover.jpg
coverAlt: Illustration of two shopping lists side by side with arrows in both directions between them, the same items ticked off on both
accent: rust
category: hobby
order: 4
links:
  - label: View on GitHub
    url: https://github.com/osterbergdesign/ICA_Lists_HA
---

## The idea

The shopping list should be wherever you are when you notice you're out of something — a voice command, the dashboard, Google Keep — but in the store you want the ICA app, which sorts the list by how that store is laid out. This integration connects the two.

## What it does

Each ICA list you pick becomes a to-do list in Home Assistant: add, rename, tick off and remove items there, and changes made in the ICA app show up within a couple of minutes. Quantities set in the ICA app are shown and never wiped.

The **mirror** takes any Home Assistant to-do list and keeps an ICA list in step with it. Added at home means added in ICA (or paired with an identical open item, so nothing is doubled); ticked off in the store means ticked off at home.

## Making sync trustworthy

Two lists that edit each other can easily fight. Each pair of items remembers what both sides looked like the last time they agreed, so the integration can tell which side changed and push that change exactly once — and one side's own formatting, like ICA capitalising a word, is never bounced back to the other.

Some lists fail quietly, so the mirror reads the list back after each change. And if many items vanish at once, it waits three minutes before removing them from ICA, in case the list just glitched.

The sign-in is handled with the same care: the password is used once to get a long-lived token, a refused password is never retried automatically, and the diagnostics download never includes the personnummer, password or tokens.

## Credits

ICA has no public API. How its login and list protocol work was documented by earlier open-source projects (credited in the repository); the client, the sync rules and the integration are written for this one.
