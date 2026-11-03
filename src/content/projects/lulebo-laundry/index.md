---
title: Lulebo laundry booking
tagline: Book and cancel laundry times from Home Assistant, with a booking card of its own.
summary: A Home Assistant integration for Lulebo's laundry booking — free times, your bookings as calendar events and to-dos, and a custom card that shows the week as a grid on a big screen and one day at a time on a phone.
year: 2026
context: Own project, on GitHub
team: Solo project
disciplines: [Software, UX & interaction, Home automation]
tools: [Python, JavaScript, Web components, Home Assistant, HACS]
highlights:
  - A custom dashboard card with no build step or dependencies — the week as a grid, or one day at a time on phones
  - Book or cancel with one tap; the card always asks first and says what happened
  - Bookings show up as calendar events and in a to-do list, with actions for automations
  - Swedish or English to match Home Assistant, and colours you can theme to match the dashboard
cover: ./cover.jpg
coverAlt: Illustration of a week of laundry times as a grid of tiles, two of them highlighted as booked, next to a washing machine drum
accent: navy
category: hobby
order: 5
links:
  - label: View on GitHub
    url: https://github.com/osterbergdesign/lulebo-laundry-ha
---

## The idea

Booking the shared laundry room at Lulebo means logging in to a web portal. This integration brings it into Home Assistant instead: see the free times for this week and next, book and cancel, and get your bookings into the calendar.

## The booking card

The integration ships its own dashboard card, loaded automatically. On a wide screen it shows the week as a grid of the four daily slots, like the booking site; below a set width it switches to one day at a time, with arrows to move between days. Your next booked time sits at the top.

Tap a free time to book it, or your own time to cancel — the card always asks first, then confirms. It follows Home Assistant's language (Swedish or English), and its colours can be changed with CSS variables to match the rest of the dashboard.

## Under the hood

The client talks to the Aptus booking portal that Lulebo uses. Every request has a timeout, expired sessions are renewed automatically instead of quietly returning nothing, and a failed fetch keeps the last good data on screen. No personal information is written to the log.

Bookings are also exposed as calendar events, a to-do list and actions for booking, cancelling and refreshing, so they can be used in automations. The same approach should work for other housing companies that use Aptus.
