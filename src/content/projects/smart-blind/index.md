---
title: Smart blind
tagline: A motorised blind for Home Assistant — from a hand-wired prototype to a circuit board of my own.
summary: An ESP32-C3 on Wi-Fi drives a stepper motor through an A4988 driver, running on 24 V with a buck converter for the logic. The first version was hand-wired in a 3D-printed enclosure; V1 puts it all on my own PCB.
context: Own project
team: Solo project
disciplines: [PCB design, Prototyping, Home automation]
tools: [PCB design, ESP32-C3, A4988 stepper driver, Home Assistant, 3D printing, Soldering]
highlights:
  - Schematic and board layout of my own — 24 V in, a buck converter down to 5 V, a stepper driver and an ESP32-C3 on one board
  - Proven first as a hand-wired prototype in a 3D-printed enclosure
  - V1 boards manufactured, with a screw terminal for power, a four-pin motor connector and four mounting holes
  - Controlled from Home Assistant over Wi-Fi
cover: ./cover.jpg
coverAlt: A fan of black V1 circuit boards with white silkscreen reading STATIC and Smart Blind V.1
accent: mustard
category: hobby
order: 2
gallery:
  - src: ./schematic.png
    alt: Schematic with the 24 V screw terminal and capacitor, the 24 to 5 V buck converter, the A4988 stepper driver, the ESP32-C3 and the four-pin motor connector
    caption: The schematic — 24 V in, 5 V for the logic, and three ESP32 pins driving the stepper driver.
  - src: ./pcb-layout.png
    alt: Board layout with copper pours and traces, the driver socket in the middle and the ESP32-C3, buck converter and power terminal around it
    caption: Board layout of V1.
  - src: ./prototype.jpg
    alt: A white 3D-printed enclosure holding a buck converter module, a green stepper driver with a heat sink and a small ESP32-C3 board, wired together
    caption: The first version, hand-wired inside a 3D-printed enclosure.
  - src: ./pcb-in-hand.jpg
    alt: A bare black V1 board held in a hand, with white silkscreen labels for every pin and component
    caption: A bare V1 board, before assembly.
---

## The idea

A motorised blind that Home Assistant can open and close, built around a stepper motor and an ESP32-C3 on the home Wi-Fi.

## Prototype first

The first version was hand-wired: an adjustable buck converter module, an A4988 stepper driver and an ESP32-C3 board, soldered together and fitted into a 3D-printed enclosure. It proved the electronics before anything was committed to a board.

## The board

The schematic puts the same parts on one board. 24 V comes in through a screw terminal, with a 100 µF capacitor across the supply. The stepper driver takes the 24 V directly for the motor, while a buck converter steps it down to 5 V for the ESP32-C3 and the driver's logic. The ESP32 controls the driver's step, direction and sleep pins, and the motor connects through a four-pin header.

The layout keeps the power terminal, motor connector and microcontroller around the edges of the driver, with four mounting holes. The silkscreen labels every pin and carries my own STATIC brand and a NEIL mark — Network Embedded Intelligent Liaison.

## V1

The first batch of V1 boards came back as black PCBs with white silkscreen, ready to be assembled.
