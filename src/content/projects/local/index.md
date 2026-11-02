---
title: LoCal
tagline: A self-hosted meal planner and calorie tracker for the whole household, built into Home Assistant.
summary: Barcode scanning, photo logging with a vision model, recipes with kcal per gram and a shared weekly meal plan — installed through HACS with its own sidebar panel, or run on its own in Docker or a Proxmox container.
year: 2026
context: Own project, on GitHub
team: Solo project
disciplines: [Software, UX & interaction, Home automation]
tools: [Python, JavaScript, Starlette, SQLite, Home Assistant, Docker, Proxmox LXC, Ollama]
highlights:
  - Barcode scanning against Open Food Facts, saved locally so each product is only looked up once
  - Photo logging — a vision model lists what's on the plate with estimated grams, and you check them before anything is logged
  - Recipes weighed after cooking give kcal per gram, so home-cooked food logs as precisely as packaged food
  - Runs inside Home Assistant with sensors, a meal-plan calendar and actions — or standalone with a one-line Proxmox install
cover: ./cover.jpg
coverAlt: Illustration in LoCal's colours — a cyan progress ring for the day's calories beside three bars for protein, carbohydrates and fat
accent: olive
category: hobby
order: 2
links:
  - label: View on GitHub
    url: https://github.com/osterbergdesign/LoCal-Tracker
---

## What it is

LoCal is a meal planner and calorie tracker for a household, and it runs on your own server rather than in someone else's cloud. Everyone gets a personal diary and goals; foods, recipes and the weekly meal plan are shared.

## Getting food in quickly

Logging only works if it's fast, so there are several ways in:

- **Barcodes.** Scan with the phone camera. Products are looked up in Open Food Facts and saved locally; unknown ones can be added from the label and are remembered.
- **Photos.** Snap the plate and a vision model lists what it sees with estimated grams and calories. You check the amounts, swap any item for a matching food from the database, and log it. It works with a local Ollama model, the Claude API or the OpenAI API.
- **Recipes.** Add the raw ingredients, weigh the finished dish, and LoCal works out kcal per gram of the cooked food. Recipes can then be logged by the gram and used inside other recipes.
- **Recipe links.** Paste a link from ICA, Arla, Köket and most other recipe sites; the ingredients are matched to foods and their grams estimated for you to check.

The food data comes from Livsmedelsverket's ~2,500 Swedish foods, USDA FoodData Central, Open Food Facts, and your own entries.

## Part of the house

Installed through HACS, LoCal gets its own panel in the Home Assistant sidebar and app, and everyone with a Home Assistant login gets their own diary automatically. In return, Home Assistant gets sensors for each person's calories and macros, today's planned meals, a meal-plan calendar, and an action for logging food from automations.

The meal plan also syncs both ways with Mealie, so recipes and plans can live in either app.

## Runs anywhere

Without Home Assistant it runs in Docker, or as a Proxmox container set up by a single command that asks a few questions, installs the app as a service and keeps daily database backups. There's also an optional native iPhone app with Apple's barcode scanner and Apple Health sync.
