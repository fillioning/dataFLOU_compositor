# dataFLOU_compositor

**Send OSC data to many destinations as triggerable scenes.** A rotated‑Ableton‑Session‑style editor that fires multiple OSC messages at once with optional modulation, sequencing, transitions, delays, MIDI control, and an authorable **Pool of Instruments and Parameters** that mirrors the dataFLOU C++ library's vocabulary.

![dataFLOU_compositor — Edit view](docs/images/dataFLOU_Compositor_EditMode.png)

Built as a desktop app for Windows and macOS using Electron + React. Sessions are saved as plain JSON files and round‑trip cleanly between machines.

---

## Table of Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
  - [Run from source](#run-from-source)
  - [Build a Windows installer](#build-a-windows-installer)
  - [Build a macOS dmg](#build-a-macos-dmg-must-run-on-a-mac)
- [How it's organized](#how-its-organized)
- [Concepts in detail](#concepts-in-detail)
  - [Instruments + Parameters (rows)](#instruments--parameters-rows)
  - [Pool drawer](#pool-drawer)
  - [Network discovery (Pool · Network tab)](#network-discovery-pool--network-tab)
  - [Group triggers (Instrument × Scene)](#group-triggers-instrument--scene)
  - [Scenes (columns)](#scenes-columns)
  - [Sequence view + Timeline](#sequence-view)
  - [Transport (bottom bar)](#transport-bottom-bar)
  - [Cue system](#cue-system)
  - [Scene‑to‑scene Morph](#scene-to-scene-morph)
  - [Clips (cells)](#clips-cells)
  - [Sequencer — 9 modes](#sequencer--9-modes)
  - [Generative mode](#generative-mode)
  - [Modulators — 8 types with live visuals](#modulators--8-types-with-live-visuals)
  - [Smart Scale 0.0 – 1.0 (auto‑range)](#smart-scale-00--10-auto-range)
  - [Hold vs Last rest behaviour](#hold-vs-last-rest-behaviour)
  - [Multi‑arg parameters + pinned slots](#multi-arg-parameters--pinned-slots)
  - [Templates & bulk actions](#templates--bulk-actions)
  - [OSC monitor](#osc-monitor)
  - [Autosave + crash recovery](#autosave--crash-recovery)
  - [Meta Controller (32 knobs, 4 banks, Destination picker)](#meta-controller-32-knobs-4-banks-destination-picker)
  - [Show / Kiosk mode](#show--kiosk-mode)
  - [Themes (15 + rich themes)](#themes-15--rich-themes)
- [Sessions](#sessions)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Architecture](#architecture)
- [Release notes](#release-notes--045)
  - [0.4.5](#release-notes--045)
  - [0.4.1](#release-notes--041)
  - [0.4.0](#release-notes--040)
  - [0.3.6](#release-notes--036)
  - [0.3.5](#release-notes--035)
  - [0.3.0](#release-notes--030)
- [Project status](#project-status)
- [License](#license)

---

## What it does

You build a grid of **Instruments** (rows — each Instrument is a typed group of OSC **Parameters**) and **Scenes** (columns). Each cell at the intersection (a "clip") holds the value, modulation, sequencing, and timing parameters that this Parameter will use whenever this Scene is triggered. The big square at the **Instrument × Scene intersection** is a **group trigger** that fires every Parameter under the Instrument at once.

- **One scene trigger** fires every clip in that column simultaneously.
- **Per‑Parameter triggers** let you fire individual messages without launching the whole scene.
- **Per‑Instrument group trigger** at each Instrument × Scene intersection fires (or stops) every child Parameter's clip on that scene as a single gesture. MIDI‑learnable.
- **Pool drawer with three tabs** — Built‑in, User, **Network**. Browse shipped Instrument Templates (OCTOCOSME, Generic XYZ, Pandore) and Parameter blueprints (RGB Light, Knob, Motor, Button, XY Pad); author your own; or watch the local network for OSC senders and drag any discovered device onto the grid as an Instrument with one Parameter per observed address.
- **Multi‑value OSC** — space‑separated entries in a clip's Value field become multiple OSC args in a single message. Every modulator treats each entry independently. **Pin individual slots** to freeze them while the sequencer / modulator drives the rest.
- **Smart Scale 0.0 – 1.0** — auto‑ranges each parameter's actual min/max into `[0, 1]` instead of blunt‑clamping. Works for sequencer cycles, modulator outputs, even multi‑arg colour channels.
- **Eight modulation types with live visualisations** — **LFO**, **Ramp** (Normal / Inverted / Loop), **Envelope (ADSR)**, **Arpeggiator** (with mode‑aware playback patterns), **Random Generator**, **Sample & Hold**, **Slew**, **Chaos** (logistic map). All share one clock-rate control (Free Hz or BPM-synced with dotted/triplet); per‑modulator preview SVG redraws as you tweak.
- **Nine sequencer modes** — **Steps**, **Euclidean**, **Polyrhythm** (two interlocking rings), **Density** (per‑step probability), **Cellular** (1‑D Wolfram automaton with Seed LFO), **Drift** (Brownian playhead), **Ratchet** (sub‑pulse bursts with 7 shaping modes), **Bounce** (geometrically accelerating step duration), **Draw** (free‑form curve up to 1024 steps). Each has its own inspector preview.
- **Generative mode** — flip a switch on any sequencer and the engine reinterprets the step values through a per‑mode musical rule (Tide, Accent, Voicing, Wave, Crowd, Terrain, Scatter, Bounce). Variation knob controls how far values stray from the user's base.
- **Hold vs Last** rest behaviour — choose whether a muted step keeps emitting the last value (Hold) or replays the previous step's value (Last). Default Hold.
- **Transitions** morph the previous clip's value into the new one over a configurable time, even while the LFO keeps running.
- **Ableton‑style follow actions** — Stop / Loop / Next / Previous / First / Last / Any / Other, plus a per‑scene **×Multiplicator**. Right‑click a scene (or multi‑selection) → **Set Follow Action** and the menu's submenu applies to every selected scene at once.
- **Sequence grid** — 1–128‑step drag‑laid sequence in the Sequence view. **Multi‑select scenes in the palette and drop a single drag** to fill consecutive Scene Steps next to each other in one gesture.
- **Timeline view** — alternate Sequence visualization where each occupied slot becomes a flex block whose width is proportional to its Duration. Live remaining-time + progress fill on every instance of the active scene.
- **Live scene progress everywhere** — Scene Steps and Timeline both fill from 0 → 100% orange across the playing scene's duration, on every visual instance, so you can see exactly where you are even when the scene is placed in multiple slots.
- **Meta Controller** — **32 knobs across 4 banks** (A B C D), with a new **Destination picker** that walks Instrument → Parameter → optional Value‑slot and adds the resolved OSC destination with one click. Each knob still supports user name, min/max range, **Smooth (ms)** time, one of **14 output curves**, up to **8 OSC destinations** broadcasting simultaneously, and MIDI CC learn.
- **Cue system** — arm a scene as "next", fire it with **GO** / **Space** / MIDI. Optional auto‑advance to the next sequence slot after each GO.
- **Scene‑to‑scene Morph** — one knob in the transport glides every cell from scene A to scene B over N ms.
- **Pause freezes scene time** — Pressing Pause freezes the active scene's elapsed time; on Resume the countdown continues from where it was. Visual countdowns in Timeline + transport bar freeze in lockstep.
- **Show / Kiosk mode** — locks the UI into a performance view (F11, hold Escape to exit).
- **Autosave + crash recovery** — silent snapshot every 60 s to `~/AppData/Roaming/dataFLOU/autosave/`, keeps 30 rolling copies. Writes are atomic so a crash mid‑save can never corrupt the session file.
- **OSC monitor drawer** — bottom panel streams outgoing OSC in real time. Resizable via top‑edge drag handle. Toggle with **O**.
- **Transport bar** — always visible at the bottom: Play / Pause / Stop, cue GO, Morph enable + ms, **live HH:MM:SS:MS time counter** AND a **live remaining‑time pill** for the currently playing scene right next to it.
- **Clip Templates** — save full clip configs and apply them to empty cells.
- **Multi‑select clips** — Ctrl+click adds clips to a disjoint selection.
- **Multi‑select sequence slots** — Shift+click in the Scene Steps grid OR the Timeline extends a contiguous slot range. Right‑click → Clear Scene from N slots / Set Follow Action on every covered scene at once.
- **Global MIDI Learn** — one button. Click a scene, clip trigger, **Instrument group trigger**, or Meta knob, wiggle a MIDI control. Blue overlays show learnables, green = bound.
- **UI zoom** — Ctrl+wheel rescales everything below the main toolbar (0.5×–2×), including the Pool drawer + OSC monitor.
- **17 themes** — including two **rich themes** (Nature, Cream) that swap classic HTML controls for bespoke Rainbow‑Circuit‑flavoured arc sliders, mode icon rows, console‑style readouts, and card‑wrapped inspector sections.

OSC is sent over UDP. The engine runs in the Electron main process at a configurable tick rate (10–300 Hz) so timing stays stable even if the UI is busy.

---

## Quick start

### Run from source

Requires [Node.js](https://nodejs.org) (LTS or newer).

```bash
git clone https://github.com/filliformes/dataFLOU_compositor.git
cd dataFLOU_compositor
npm install
npm run dev          # launch in dev mode with hot reload
```

### Build a Windows installer

```bash
npm run build:win
```

Produces an installer under `release/<version>/dataFLOU_compositor-<version>-win-x64.exe` plus an unpacked `win-unpacked/` directory.

### Build a macOS dmg (must run on a Mac)

```bash
npm run build:mac
```

---

## How it's organized

The window is split into three regions:

| Region | What it holds |
| --- | --- |
| **Top toolbar** | **dataFLOU** brand button (preferences sub‑toolbar: Theme picker + Enter Show Mode), session name, file actions, default OSC, Tick rate, Global BPM, MIDI input picker, MIDI Learn, **Edit ↔ Sequence** view toggle, Stop All, Panic. |
| **Transport bar (bottom)** | Play / Pause / Stop (colored by active state), GO + auto‑advance toggle, Morph enable + ms, selected scene readout, **live HH:MM:SS:MS time + remaining‑time pill**. Always visible in both views. |
| **Meta Controller bar** | Toggled via the Inspector or **M** — sits below the main toolbar, resizable. |
| **Editor** (Edit view) | Left: Scenes/Instruments header (Add buttons + counts) and Instruments sidebar (Templates with their child Parameters indented under them). Each Instrument header has a `+PARAM` chip and a centered group‑trigger button at every Scene intersection. Center: Scene columns. Right: Inspector panel (toggleable with **I**) — top toggles for Notes / Meta Controller / Collapse Scenes / Collapse Instruments, then Clip Template dropdown when a cell is selected, then the clip's full parameters. |
| **Sequence view** | Left: resizable Scenes palette (200–1200 px) + a per‑scene inspector below it (toggleable with **S**). Center: 128‑slot Scene Steps grid OR Timeline visualization (toggle next to Clear mode), with progress fills + live time on every instance of the playing scene. Bottom: global transport bar. |

**Tab** toggles Edit ↔ Sequence — even from inside text inputs, dedicated to view‑switch only.

**Ctrl+wheel** zooms the whole app (except the main toolbar). **Left‑click** on either Collapse toggle flips just that axis; **right‑click** flips both.

---

## Concepts in detail

### Instruments + Parameters (rows)

The sidebar's vocabulary mirrors the dataFLOU C++ library: each row is either a **Template** (Instrument header) or a **Parameter** (child row that owns clips).

- **A new session opens with one Scene + one Instrument 1 with a child Parameter 1**, ready to send OSC.
- **+ Instrument** in the Scenes/Instruments header (or **Ctrl+T**) creates a new draft Template + one seeded child Parameter.
- **`+PARAM`** chip on the right edge of each Instrument header (or **Ctrl+P** with the Instrument selected) adds another child Parameter.
- **Right‑click a row** for: Add Instrument · Add orphan Parameter · Add Parameter to <X> · Save as Template · Show/Hide Pool · Delete.
- **Drag rows to reorder** them. Templates carry their child Parameters as a contiguous block.
- **Save as Template** flips the draft into a saved User Template in the Pool, re‑instantiable across sessions.

### Pool drawer

Toggle with **P** (also opens the OSC drawer if it's closed) or via the **Show Pool** entry in the Instruments right‑click menu.

- **Built‑in tab** — shipped library.
  - **Instruments**: OCTOCOSME (5 RGB rings + strip RGB), Generic XYZ pad, Pandore.
  - **Parameters**: RGB Light (v3 0–255), Knob (float 0–1), Motor (bipolar ‑1..1), Button (bool discrete), XY Pad (v2).
- **User tab** — your authored Instrument Templates + Parameter blueprints.
- **Network tab** — auto‑discovered OSC senders on the local network (see below).
- **Drag any item onto the Edit‑view sidebar** to instantiate.
- **Click an item** to edit its full metadata in the right‑side Inspector.
- **Pop out** the Pool (`⤢` button or fast double‑click on the title bar) into a centered floating window.

### Network discovery (Pool · Network tab)

Auto‑discovers OSC senders on the local network and lets you drag any device straight onto the grid as an Instrument.

- **Passive UDP listener** — click **Listen** to bind a port (default `9000`, configurable) and the Pool starts logging every sender that hits that port.
- **Discovered devices** show as draggable rows keyed by `ip:port`, with a green/grey activity dot (fresh < 2 s), packet count, and last‑seen age that refreshes every second.
- **Expand a device** to see every OSC address path it has emitted, with its OSC type tags and a short live preview of the latest args.
- **Drag a device onto the Edit sidebar** to materialise it as a user Instrument Template:
  - One Parameter per observed OSC address.
  - **Auto‑typed**: 1× `f`/`i` → float / int / bool / string; 2× numeric → `v2`; 3× → `v3`; 4× → `v4`; OSC type tags from the observed args drive `paramType`. Multi‑arg discoveries get a full `argSpec` with canonical slot names (x/y, x/y/z, x/y/z/w, r/g/b/a for colour with max=255).
  - **Common OSC root extracted** — if half or more of a device's addresses share `/octocosme/...`, the template adopts `octocosme` as its name and `/octocosme` as its base path, with each Parameter's path stripped to the remainder.
- **Status header** shows the listener's bound port + this machine's IPv4 addresses so the user knows exactly what to point their sender at.
- **Drag‑cancel cleanup** — if you start dragging a discovered device and abort (Esc, drop off‑target), the just‑materialised template is removed from the Pool so you don't accumulate orphan Instruments.
- **Clear** wipes the discovered‑device cache (useful after moving networks).
- **Title‑bar dot** stays in sync with bind status even when the Pool drawer is collapsed — green when listening, red on bind error.

The listener stays closed by default so the app doesn't fight other tools for port 9000 unless you ask it to.

### Group triggers (Instrument × Scene)

Templates carry no clips of their own, so the cell at each Instrument header × Scene column intersection is a **centered Play/Stop button** that fires every child Parameter's clip on that scene at once.

- Click → triggers all children that have a clip on this scene.
- Click again (any child playing) → stops every active child of this Instrument on this scene.
- **MIDI‑learnable** — Global MIDI Learn → click the group trigger → wiggle a control.
- Greyed out when no child has a clip on this scene yet.

### Scenes (columns)

A Scene is a column. It has:

- A **name**, **color** (color picker), and **notes** (italic, toggle visibility globally via **Notes**).
- A **Duration** (0.5 – 300 s) and a **Next** follow‑action.
- A **×Multiplicator** (Sequence‑tab inspector only).
- A **Morph‑in (ms)** override.
- A **MIDI Learn** binding.
- A **trigger button** (top of column) that **fills clockwise over the scene Duration**.

#### Adding scenes

- **+ Scene** button in the palette header (or **Alt+S**).
- **+ Silence** button — adds a gray scene with no cells (no OSC fires).
- **Right‑click in the palette's blank area** → Add Scene · Add Scenes…
- **Delete** key with one or more scenes selected.

### Sequence view

A 1 – 128 slot grid for laying out scenes in playback order. Left column is user‑resizable (200 – 1200 px).

- **Scene Steps grid** — 16 columns by default; with > 72 scenes, cells shrink to 28 px min width.
- **Timeline view** — each occupied slot becomes a horizontal block whose width is proportional to its Duration. Click a segment to highlight it; the segment currently playing gets a separate accent ring + live `Xs left` readout.
- **Click a scene** in either view to focus + mark it as the Transport Play start point.
- **Shift+click** extends a contiguous slot multi‑selection.
- **Right‑click a slot or segment** → menu with **Clear Scene** and **Set Follow Action ▸** submenu (bulk‑aware).
- **Drag a slot** to swap its content with another slot.
- **Clear mode** — click any slot to empty it.
- **Live progress fill** — every instance of the currently playing scene fills orange from 0 → 100% across its Duration.
- **Single‑instance highlight** — only the slot that fired gets the accent ring.

### Transport (bottom bar)

- **Play** — Sequence view: starts the sequence from the selected slot. Edit view: plays the focused scene as a one‑shot.
- **Pause** — freezes auto‑advance AND freezes the active scene's elapsed time.
- **Stop** — full stop, clears the slot selection.
- **Time** — running HH:MM:SS:MS counter.
- **Scene remaining** — colored pill with the current scene's color + live countdown.
- **GO** + Next auto‑advance toggle.
- **Morph** enable + ms.

### Cue system

- **Arm** a scene three ways: right‑click → *Arm as next* · Alt‑click · press **A** with the scene focused.
- An armed scene shows a pulsing blue ring + `▶▶` chevron everywhere it appears.
- **Fire** with the **GO** button, **Space**, or a MIDI binding.
- **Next (auto‑advance arm)** — automatically arm the next non‑empty sequence slot after each fire.

### Scene‑to‑scene Morph

A single transport knob that turns every scene trigger from a snap into a glide. Per‑scene override + MIDI CC mapping (0..127 → 0..10 000 ms).

### Clips (cells)

Each clip carries the full per‑scene settings for one Parameter. Open a clip in the Inspector by clicking its tile.

- **Destination** (IP : port, with `~def~` link to session default), **OSC Address**, **Value** (auto‑detected at send), **Delay** + **Transition**.
- **Modulation** (collapsed by default): LFO / Ramp / Envelope / Arpeggiator / Random / Sample & Hold / Slew / Chaos — each with its own live visual.
- **Sequencer** (collapsed by default): 1–16 steps (or 4–1024 for Draw), one of 9 modes, BPM/Tempo/Free sync.
- **Scale 0.0–1.0**, **Rest behaviour** (Hold / Last), per‑arg **Pin** for multi‑value parameters.

#### Visual cues

- **Trigger square solid orange** — clip is armed and held.
- **Clockwise orange sweep inside the square** — clip is modulating or sequencing.
- **Live value text in orange** in the cell tile — currently being modulated/sequenced.
- **Per‑step pulse** in the Inspector — flashes the current step at the sequencer rate.

### Sequencer — 9 modes

Each mode is its own rhythmic / generative engine, picked from a row of pictogram buttons at the top of the Sequencer section.

| Mode | What it does |
| --- | --- |
| **Steps** | Classic 1–16 step cycle. Each step holds its own value; the playhead walks left→right at the sync rate. |
| **Euclidean** | N pulses distributed as evenly as possible across M steps with rotation. Live preview row shows which steps are active. |
| **Polyrhythm** | Two interlocking ring clocks (lengths A and B). Combine mode chooses whether a step fires when A and B coincide, when either fires, or only on the coincidence. |
| **Density** | Per‑step "personality" from a seeded hash + a Density knob (0–100 %). At classic mode, each step's value is multiplied by `(density/100) × hash(step, seed)` so the slider sculpts intensity instead of gating. |
| **Cellular** | 1‑D Wolfram cellular automaton (rule 0–255). The current row's bits decide which steps fire; the row evolves once per cycle. **Cellular Seed LFO** modulates the initial row at a user‑set rate / depth for slow pattern drift. Stable starter seed so the preview looks alive out of the box. |
| **Drift** | Brownian playhead. Each step the head moves back / stays / forward, biased by a slider. Edge behaviour: wrap or reflect. Useful for non‑repeating organic motion. |
| **Ratchet** | Per‑step burst into 2–16 sub‑pulses. **Probability** and **MaxDiv** decide if and how many; **Mode** picks the shape of the burst (**Octaves / Ramp / Inverse / Ping‑pong / Echo / Trill / Random**). **Variation** blends global vs per‑step random. |
| **Bounce** | Step durations shrink geometrically across the row, like a ball settling. **Decay** knob (0–100) controls how fast. Animated SVG ball + splash rings in the preview. |
| **Draw** | Free‑form curve sketcher. Click + drag to draw up to **1024 steps**. **X / Y output range** maps the drawn 0..1 curve onto any numeric span. **Randomize** button rolls a smooth‑stepped random curve as a starting point. With Generative on, the engine regenerates a hash‑varied curve at each cycle wrap based on the user's drawing. |

The 9 mode pictograms read as a row of mini instruments — pick by clicking the icon. Rich themes (Nature, Cream) render the row as a stylised icon picker; standard themes use a dropdown.

### Generative mode

Flip the **Generative** switch on any sequencer and the engine reinterprets every step value through a per‑mode musical rule rooted in a "true artistic world intention." Each rule reads the cell's base value as a seed and shapes the step output around it; the **Variation** knob controls how far the output strays from the base.

| Mode | Generative rule |
| --- | --- |
| Steps | **Tide** — smooth sine swell across one cycle, peak position seeded. |
| Euclidean | **Accent** — hits land harder on the downbeat, off‑beats lighter. |
| Polyrhythm | **Voicing** — Ring A and Ring B sit at different pitch/colour levels, coincidences resonate. |
| Density | **Wave** — gate samples through a sine wave, amplitude knob = swing. |
| Cellular | **Crowd** — cells with crowded neighbours emit louder than lonely ones. |
| Drift | **Terrain** — walker samples a height field shaped by Variation. |
| Ratchet | **Scatter** — burst values picked from a chaotic distribution. |
| Bounce | **Decay envelope** — each step shrinks by `bounceCoeff^i`. |
| Draw | **Live curve** — regenerates a hash‑varied curve at each cycle wrap, anchored to your drawing. |

Generative outputs respect Scale 0.0–1.0 — values stay inside `[0, 1]` even when the base is large.

### Modulators — 8 types with live visuals

Each modulator type has its own SVG preview in the Inspector that redraws as you change its parameters, so you can see the shape before it ever fires.

| Modulator | Reactive controls |
| --- | --- |
| **LFO** | Shape (sine, triangle, sawtooth, square, rndStep, rndSmooth), Mode (bipolar / unipolar), Depth, Rate (Free Hz or BPM‑synced with division dropdown). |
| **Ramp** | One‑shot 0→1 curve with **Mode** (Normal / Inverted / Loop), exponent, Sync (Free / Synced / FreeSync). Live progress dot rides the curve at the engine's actual position. Total time label shown for synced modes. |
| **Envelope (ADSR)** | Attack / Decay / Sustain / Release as percentages of the total time. **Total time label** shown in synced modes. Live progress dot rides the ADSR shape. |
| **Arpeggiator** | Steps (1–8), **Arp Mode** (Up / Down / Ping‑pong / Random / Walk / Drunk / Inclusion / Exclusion / Chord), Multiplication mode (×1, ×2, fractional). Visual shows the ladder for the chosen mode with per‑step labels. |
| **Random** | Value type (float / int / colour), min/max, Rate. Output range is normalised under Scale 0.0–1.0 so colour values map cleanly into `[0, 1]` instead of clipping. |
| **Sample & Hold** | Probability (0–100 %), Smooth (cosine‑smoothed stair vs hard stair). |
| **Slew** | Random target at the clock rate, glides toward it with **independent rise / fall half‑life** (1 ms – 60 s each). |
| **Chaos** | Logistic map iterate (`r` 3.4 – 4.0). 3.83 hides the famous period‑3 window. |

All modulators share one clock — **Free Hz** or **BPM‑synced + division** (whole / dotted / triplet). The visualisation respects sync mode so a synced LFO shows the right number of cycles per beat as you slide BPM.

### Smart Scale 0.0 – 1.0 (auto‑range)

Old behaviour: `clamp01()` on every output. A value range of 0..255 collapsed to 0/1.

New behaviour: when **Scale 0.0–1.0** is on, the engine **auto‑ranges the actual cycle's min/max** into `[0, 1]`. The full musical span maps proportionally — a 0..255 RGB byte becomes 0..1 with every intermediate value preserved.

- **Sequencer + Scale** — precomputes the cycle's per‑token min/max (including ratchet sub‑pulses up to maxDiv=16) and normalises into `[0, 1]`.
- **Modulator + Scale (no sequencer)** — predicts the modulator's output range and normalises against THAT, so a Chaos modulator on a base of 100 spans the full `[0, 1]` visually rather than clipping.
- **Plain Scale (no mod, no seq)** — classic clamp.
- **Degenerate range** (all step values identical) — emits the user's actual value clamped into `[0, 1]`, not a flat 0.5 placeholder.

### Hold vs Last rest behaviour

Choose how the engine handles sequencer rests (steps the gate mutes).

- **Hold** (default) — re‑sending the same payload is suppressed; the receiver naturally holds whatever it received last tick. Saves bandwidth and avoids re‑triggering one‑shot receivers.
- **Last** — re‑emits the previous step's value on every rest. Useful for receivers that need a fresh packet to stay alive.

Per cell. Sticks with the session.

### Multi‑arg parameters + pinned slots

Parameters with an `argSpec` (e.g. OCTOCOSME Voice Pots with four pots per voice, or any discovered v3 / v4 / colour) emit multi‑arg OSC bundles.

- **One numeric input per slot** in the cell editor, labelled by name (HAUTEUR1 / r / x / etc.).
- **Each slot has its own pin**: click the pin to freeze that slot at the value shown. Modulators + the sequencer keep running on the unpinned slots; the pinned slot emits its captured value forever until unpinned.
- **Sequencer respects pinned slots** — when the sequencer is on and your step value is a single number, that number is broadcast to every *unpinned* slot. Pinned slots keep their frozen values. Type a multi‑token step (`0.5 0.7 0.9 0.2`) to drive each unpinned slot independently per step.
- **Fixed protocol headers** (argSpec entries declared with `fixed:`, like OCTOCOSME's `sender: "compositor"` and `timestamp: 0`) appear in the pin list as **locked rows with a `FIXED` badge**. The engine bypasses sequencer + modulator on these slots entirely — they always emit their declared value so receivers like Pure Data's `list split 2` can do their job.

This means you can sequence one channel of a multi‑value parameter while leaving the other channels pinned at a hand‑set value, and the receiver's protocol header stays intact even under heavy modulation.

### Templates & bulk actions

- **Right‑click an empty cell** → pick from saved Clip Templates.
- **With a clip selected**, the **Template** dropdown at the top of the Inspector applies templates or saves the current clip as a new template.
- **Ctrl‑click clips** to build a disjoint multi‑selection across any scene/parameter combination.
- **Apply template** → bulk‑apply across the selection.
- **Use Default OSC** → overwrite OSC address + destination on every selected clip with the session's current defaults.

### OSC monitor

A bottom drawer that streams outgoing OSC traffic for debugging.

- Toggle with **O** or right‑click the Instruments column → **Show Pool**.
- **Resizable** — drag the top edge. Max height now adapts to UI zoom so the drawer can't eat the workspace at 2× scale.
- Single‑line title bar — `× close · OSC Monitor · Log N/M · filter input · Live · Clear`.
- Filter by substring, pause, clear.
- Pool pane sits beside the log; each can be hidden independently.
- **Scales with Ctrl+wheel zoom** — Pool tabs, device rows, and OSC log all scale alongside the rest of the app.

### Autosave + crash recovery

- Silent snapshot every 60 s to `~/AppData/Roaming/dataFLOU/autosave/<name>-<timestamp>.dflou.json`.
- Keeps the most recent **30** copies.
- **Atomic writes** — saves go through `<file>.tmp` then `fs.rename`, so a crash mid‑write can never corrupt the existing session file.
- A `.running` sentinel detects unclean shutdowns; on next launch the app pops a **Restore from autosave?** modal.
- One final autosave fires on quit (serialised with the 60 s tick so concurrent writes can't race).

### Meta Controller (32 knobs, 4 banks, Destination picker)

**32 knobs across 4 banks (A, B, C, D)** — 8 per bank. Toggled with **M** or via the Inspector. Bank selector is a single column of 4 buttons so the bar's footprint stays narrow.

Per‑knob: name, min/max, smooth (ms), curve (14 shapes), MIDI CC binding, up to 8 OSC destinations.

**New Destination picker** in the Destinations row — instead of "+ Destination" creating an empty row you fill in by hand, the picker walks Instrument → Parameter → optional Value‑slot, then `+` commits the resolved destination:

1. **Instrument** dropdown — lists every Instrument header on the current sidebar, plus an "(orphan parameters)" section for un‑grouped Function rows.
2. **Parameter** dropdown — appears after picking an Instrument, lists its child Parameters.
3. **Value** dropdown — appears only when the chosen Parameter has multiple value slots (`argSpec.length > 1`). Pick "All values" to send to the parent address, or pick a specific slot (x / r / HAUTEUR1 / etc.) to suffix the OSC address with a sanitised slot name.

Click **+** to commit. The resolved `destIp`/`destPort`/`oscAddress` is pre‑filled into a new destination row; with no Instrument picked the **+** falls back to the freeform "add empty destination" behaviour. After committing, the Instrument stays sticky so you can rapidly wire several Parameters under the same Instrument.

### Show / Kiosk mode

Locks the UI into a performance view. Enabled from the preferences sub‑toolbar or with **F11**. Hides authoring chrome; keeps transport, GO button, scene palette, sequence grid, Meta Controller knobs. Exit by holding Escape ≥ 800 ms or pressing F11 again.

### Themes (15 + rich themes)

**17 built‑in themes** (picker in the preferences sub‑toolbar). Bundled woff2 fonts so everything works offline.

**Two of them are "rich themes"** — Nature (Hopscotch palette: dark warm grey + olive→teal + orange) and Cream (Peaks palette: cream paper + mustard ochre). When either is active, the inspector swaps several controls for bespoke Rainbow‑Circuit‑flavoured replacements:

- **Mode icon row** — sequencer mode picker becomes a row of 9 mini pictograms (vertical bars for Steps, dots on a circle for Euclidean, two interlocking rings for Polyrhythm, etc.). Active icon glows in the accent hue.
- **Arc slider** — Modulation Rate becomes a half‑circle of warm→cool gradient bars (RcArcSlider).
- **Flat gradient bar** — Sequencer Variation becomes a horizontal tonal sweep with a tip indicator (RcFlatBar).
- **Card‑wrapped sections** — Soft cards group inspector blocks, console‑style readouts for numerics.

Classic themes (Studio Dark, Warm Charcoal, Graphite, Paper Light, plus the original 10) keep the standard HTML controls.

---

## Sessions

Saved as plain JSON via the standard OS save dialog (suggested extension `.dflou.json`).

Contents:

- Session name, default OSC, global BPM, tick rate, sequence length
- All Tracks (Templates + Parameters with their kind/parent/source‑template links), per‑track defaults, MIDI bindings, per‑arg `persistentSlots` / `persistentValues` (pins)
- All Scenes (name, color, notes, duration, follow action, multiplicator, morph‑in, MIDI binding, per‑Instrument group MIDI bindings) and the cells inside them — with every sequencer + modulator field, including drawValues (length 1024), ratchet mode, cellular seed LFO, generative state, rest behaviour, etc.
- The 128‑slot sequence
- The Pool (Instrument Templates + Parameter blueprints; builtin entries dedup'd against the shipped library on load)
- Selected MIDI input device name
- Meta Controller bank state

Old sessions migrate cleanly via `propagateDefaults()` + `migrateSequencer()` — pre‑v0.4.0 single‑track sessions load as orphan Parameters with no parent; new sequencer fields are backfilled with sane defaults.

Saves are **atomic** — the file is written to `<path>.tmp` then renamed, so a crash mid‑write can never corrupt your session. The Save button **flashes blue** on a successful write.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| **Tab** | Toggle Edit ↔ Sequence (works even inside text inputs) |
| **Space** | GO — fire the armed scene; if none, trigger the next non‑empty slot |
| **A** | Arm / unarm the focused scene as the next cue |
| **1 – 9 / 0** | Trigger scenes 1–10 in the sequence directly |
| **Enter** (in a clip's Value field) | Commit the new value AND re‑trigger the clip |
| **. / Shift + .** | Stop All (graceful) / Panic (instant) |
| **F11** | Toggle Show / Kiosk mode |
| **Esc** (hold ≥ 800 ms) | Exit Show mode |
| **M** | Toggle the Meta Controller bar |
| **O** | Toggle the OSC Monitor drawer |
| **P** | Toggle the Pool inside the OSC Monitor (opens drawer if closed) |
| **I** | Toggle the right‑side Inspector panel (Edit view) |
| **S** | Toggle the focused‑Scene info panel (Sequence view) |
| **Ctrl + S** *(Cmd + S on macOS)* | Save the current session |
| **Ctrl + T** *(Cmd + T on macOS)* | Add a new Instrument |
| **Ctrl + P** *(Cmd + P on macOS)* | Add a Parameter to the selected Instrument's group |
| **Alt + S** | Add a Scene |
| **Delete** | Multi‑selected Scenes → bulk delete; otherwise focused scene / selected Instrument(s) |
| **Ctrl + wheel** | Zoom the whole app (except the main toolbar), 0.5×–2× |
| **Ctrl + drag** *(Cmd + drag on macOS)* a clip onto an empty cell | Duplicate that clip |
| **Ctrl + click** a clip | Add / remove it from the disjoint multi‑selection |
| **Shift + click** a scene | Extend range selection from the anchor |
| **Alt + click** a scene / palette pill / sequence slot | Arm that scene as the next cue (toggle) |
| **Right‑click** an empty cell | Open the Clip Template picker |
| **Right‑click** a filled clip (or multi‑selection) | Apply template / Use Default OSC |
| **Right‑click** a palette pill | Arm as next · Set Follow Action ▸ · Delete |
| **Right‑click** a Scene Step or Timeline segment | Clear Scene · Set Follow Action ▸ |
| **Right‑click** a scene column header | Arm · Set Follow Action chips · Delete |
| **Right‑click** an Instrument row | Add Instrument · Add orphan Parameter · Add Parameter to <X> · Save as Template · Show/Hide Pool · Delete |
| **Right‑click** a Collapse toggle | Flip BOTH Collapse Scenes + Collapse Instruments together |
| **Double‑click** the Pool title bar | Pop the Pool out into a floating window (or dock back) |
| **Drag** the floating Pool's title bar | Move the floating window |
| **Shift + drag** a knob | Fine adjustment (×4 slower) |
| **Double‑click** a knob | Reset to 0 |

---

## Architecture

- **Electron 33 / electron‑vite / TypeScript / React 18 / Tailwind / Zustand**
- **Main process (Node)** — UDP sockets (OSC sender + passive discovery listener), scene engine, fixed‑tick LFO + sequencer + all 9 generative modes, file I/O, autosave, network discovery. Pure logic so timing stays stable independent of the UI.
- **Renderer process** — all UI, Web MIDI input handling, drag‑drop sequence grid (`@dnd-kit`), bespoke SVG modulator visuals.
- **Preload** — typed `window.api` bridge.

```
src/
├── main/
│   ├── engine.ts        # fixed-tick scene engine, 9 sequencer modes, 8 modulators (10–300 Hz)
│   ├── osc.ts           # UDP sender
│   ├── oscNetwork.ts    # passive UDP OSC discovery listener
│   ├── session.ts       # Save / Save As / Open + atomic JSON I/O
│   ├── autosave.ts      # 60s rolling snapshots + crash-recovery sentinel + serialised writes
│   └── index.ts         # window creation, IPC handler wiring, safeHandle wrapper
├── preload/
├── shared/              # types & factories used by main and renderer
│   ├── types.ts         # Session, Pool, ParameterTemplate, EngineState, MIDI binding, network discovery shapes
│   └── factory.ts       # makeEmptySession, makeBuiltinPool, generative rules (tide/accent/voicing/wave/crowd/terrain/scatter/bounce),
│                        # cellular automaton, drift walker, ratchet shaping, draw curve regen, paramType inference, …
└── renderer/
    ├── components/
    │   ├── TopBar / TransportBar / OscMonitor / PoolPane / InstrumentsInspectorPane
    │   ├── EditView / TrackSidebar / SceneColumn / CellTile / Inspector
    │   ├── SequenceView / MetaControllerBar (incl DestinationPicker) / MetaKnob
    │   ├── DrawCanvas / ModulatorVisuals (LFO/Ramp/Envelope/Arp/Random/SH/Slew/Chaos)
    │   └── RcModeIcons / RcArcSlider / RcFlatBar  # rich-theme controls
    ├── fonts/
    ├── hooks/sessionIntegrity.ts, useSceneCountdown.ts
    ├── store.ts                     # Zustand global state (session + UI state + network devices)
    ├── metaSmooth.ts                # renderer-side knob-value tweener
    ├── midi.ts                      # Web MIDI manager
    └── styles.css                    # incl rich-theme variables + animations
```

---

## Release notes — 0.4.5

The "huge expansion" release. Builds on top of v0.4.1 with a massive sequencer + modulator overhaul, a new generative system, network discovery in the Pool, a Meta Controller destination picker, rich themes, and a long correctness pass.

### Nine sequencer modes

The Sequencer panel now ships with 9 modes instead of 2. Each is its own little instrument:

- **Steps** — the classic 1‑16 step cycle (unchanged).
- **Euclidean** — Pulses + Rotation, evenly distributed across M steps.
- **Polyrhythm** — two interlocking ring clocks (lengths A and B) with a Combine mode (AND / OR / coincidence only).
- **Density** — per‑step probability shaped by Seed + Density knob. In classic mode, density acts as a multiplier on the step value rather than a gate, so the slider sculpts intensity smoothly.
- **Cellular** — 1‑D Wolfram automaton (rule 0‑255). The row evolves once per cycle. **Cellular Seed LFO** modulates the initial row at a user‑set rate/depth for slow pattern drift. Default seed picked so the preview reads as "alive" out of the box.
- **Drift** — Brownian playhead with bias and wrap/reflect edge behaviour.
- **Ratchet** — per‑step burst into 2‑16 sub‑pulses with **7 shaping modes** (Octaves, Ramp, Inverse, Ping‑pong, Echo, Trill, Random). Probability + MaxDiv per step, Variation knob blends global vs per‑step random. Bursts work with Bounce mode (sub‑pulses respect the current step's actual duration).
- **Bounce** — step duration shrinks geometrically across the row, like a settling ball. Animated SVG ball + splash rings in the inspector preview.
- **Draw** — free‑form curve sketcher with **up to 1024 steps**. **X / Y output range** maps the drawn 0..1 curve onto any numeric span. **Randomize** button rolls a smooth‑stepped random starting curve. Per‑step dots up to 64 steps, single playhead dot above that.

The 9 modes are picked from a dropdown in standard themes; rich themes (Nature / Cream) show a row of 9 mini pictograms.

### Generative mode

A new switch on every sequencer that reinterprets step values through a per‑mode musical rule:

- Steps → **Tide** (sine swell across the cycle)
- Euclidean → **Accent** (downbeat lands harder)
- Polyrhythm → **Voicing** (Ring A low, Ring B high, coincidences resonate)
- Density → **Wave** (sample through a sine)
- Cellular → **Crowd** (cells with more neighbours emit louder)
- Drift → **Terrain** (walker samples a height field)
- Ratchet → **Scatter** (chaotic burst distribution)
- Bounce → **Decay envelope**
- Draw → **Live curve** (regenerates a hash‑varied curve at each cycle wrap, anchored to your drawing)

**Variation** knob (0‑100 %) controls how far values stray from the user's base. Generative outputs respect Scale 0.0–1.0 internally so they can't smuggle values out of `[0, 1]`.

### Eight modulators, each with a live visual

Every modulator now has its own SVG preview in the Inspector that reacts to its parameters in real time. The visuals respect sync mode so a BPM‑synced LFO at 1/8 shows 8 cycles per beat.

- **LFO** — sine / triangle / sawtooth / square / rndStep / rndSmooth, bipolar or unipolar.
- **Ramp** — **Mode menu** (Normal / Inverted / Loop), exponent, sync mode. Live progress dot rides the curve. Mode change mid‑play restarts the ramp from t=0 cleanly.
- **Envelope (ADSR)** — Attack / Decay / Sustain / Release as percentages. **Total time label** shown for synced modes. Live progress dot on the ADSR shape.
- **Arpeggiator** — Mode menu (Up / Down / Ping‑pong / Random / Walk / Drunk / Inclusion / Exclusion / Chord) drives playback order; visual shows the ladder for the chosen mode with per‑step labels.
- **Random** — float / int / colour with proper Scale 0.0–1.0 normalisation (RGB bytes map to `[0, 1]` cleanly instead of clipping).
- **Sample & Hold** — probability + smooth modes. Visuals correctly invert probability (was inverted in v0.4.1).
- **Slew** — independent rise / fall half‑life (1 ms – 60 s each).
- **Chaos** — logistic map.

### Network discovery in the Pool

New **Network tab** in the Pool drawer. Click **Listen** to bind a UDP port (default 9000) and the Pool starts logging every OSC sender on the local network.

- Devices show as draggable rows keyed by `ip:port`, with activity dot, packet count, and last‑seen age that refreshes every second.
- Expand a device to see every OSC address it has emitted, with type tags and a live preview of the latest args.
- **Drag onto the sidebar** → materialised as a user Instrument Template with one Parameter per observed address. Multi‑arg addresses get a full `argSpec` (canonical slot names, max=255 for colour) so the cell editor's split‑input strip works immediately.
- Common OSC root auto‑extracted into the template's base path.
- Cancelled drags (Esc / drop off‑target) auto‑clean the just‑materialised template.
- Status header shows local IPv4 addresses + bind status; subscription stays alive at app‑level so the title‑bar dot updates even when the drawer is collapsed.

### Meta Controller — Destination picker + 4‑row bank

Adding a destination to a Meta knob used to be "click +, then hand‑type the IP / port / address." Now the row next to the Destinations header holds **three dropdowns** + a `+`:

- **Instrument** — every Instrument header on the current sidebar (plus orphan Parameters).
- **Parameter** — appears after picking an Instrument; lists its child Parameters.
- **Value** — appears only for multi‑arg Parameters; pick All or a specific slot (x / r / HAUTEUR1 / etc.) to suffix the OSC address.

Click **+** to commit the resolved destination. With no Instrument picked, **+** falls back to the freeform "add empty destination" behaviour.

The **A / B / C / D bank selector** is now a single‑column 4‑row stack so the bar's footprint stays narrow.

### Multi‑arg Sequencer respects pinned slots + fixed protocol headers

When the sequencer is on for a multi‑value parameter (e.g. OCTOCOSME Voice Pots' four pots), the engine now emits the **full** multi‑arg bundle every step. Pinned slots keep their frozen values; unpinned slots receive the sequencer's output (broadcast from the single token, or matched per‑slot if you type a multi‑token step value). You can now sequence one channel while leaving the others hand‑set.

Additionally, **argSpec entries marked `fixed:`** (the protocol headers OCTOCOSME prepends as `sender: "compositor"` and `timestamp: 0` for Pure Data's `list split 2`) are now always emitted as their declared value — the engine bypasses sequencer + modulator on those slots entirely. Previously the sequencer's broadcast value could overwrite them, breaking the receiver's split. The Inspector's pin list shows these slots as locked rows with a `FIXED` badge so you can see what's being prepended on every send.

### Rich themes — Nature + Cream

Two themes opt into a bespoke "rich" UI surface inspired by Hopscotch and Peaks: bespoke arc sliders for Rate / Variation, a mini‑pictogram icon row in place of the sequencer mode dropdown, soft cards around inspector sections, console‑style numeric readouts. **Nature** (Hopscotch palette: dark warm grey + olive→teal + orange) and **Cream** (Peaks palette: cream paper + mustard ochre).

Other themes keep the classic HTML controls.

### Smart Scale 0.0 – 1.0 (auto‑range)

Scale 0.0–1.0 used to be a blunt `clamp01()`. It now **auto‑ranges**:

- **Sequencer + Scale** → precomputes the cycle's per‑token min/max (including ratchet sub‑pulses up to maxDiv=16) and normalises into `[0, 1]`.
- **Modulator + Scale (no sequencer)** → predicts the modulator's output range and normalises against that.
- **Degenerate range** → emits the user's actual value clamped into `[0, 1]` instead of forcing 0.5.
- **Random colour mode** now normalises through `(v - min) / (max - min)` so RGB bytes don't collapse to 0/1.

### Hold vs Last rest behaviour

A new dropdown on every sequencer: **Hold** (default — receiver naturally holds the previous value during rests; the engine suppresses redundant re‑sends) or **Last** (re‑emits the previous step's value on every rest tick).

### Engine + correctness pass

A long list of small fixes from the v0.4.5 review:

- **Atomic session + autosave writes** — saves go to `<path>.tmp` then `fs.rename`, so a crash mid‑write can never corrupt the file.
- **Autosave write race** fixed via an `inFlight` Promise mutex — shutdown final‑flush and the 60s tick can't double‑write or race the prune step.
- **Engine.stop()** now clears every ephemeral tick field (`liveValues`, `lastTickAt`, `pauseStartedAt`, active scene bookkeeping) so a re‑`start()` doesn't compute against stale state.
- **Modulator state reseed** (rndStep / rndSmooth / S&H / Slew / Chaos) now uses the per‑track PRNG instead of `Math.random()` for deterministic re‑triggers.
- **Ratchet sub‑pulse timing** under Bounce mode now uses the current step's actual (variable) duration rather than the constant `stepDurMs`.
- **predictModRange** for ratchet auto‑range raised from 8 to 16 to match the runtime cap — high‑division bursts no longer clip.
- **LFO sync‑mode jumps** that wrap multiple cycles in a single tick now iterate the resampler loop so intermediate rndStep / rndSmooth samples aren't dropped.
- **oscNetwork listener** clears `enabled` on post‑ready errors, awaits the underlying socket's `'close'` event before resolving (fast re‑bind no longer EADDRINUSEs), and `observe()` short‑circuits when not enabled so late dgram packets can't mutate the device map.
- **IPC handlers** wrapped in a `safeHandle` that catches throws and logs by channel name, so a malformed payload can't half‑mutate engine state.
- **stepHash** XOR'd with a golden‑ratio constant so the all‑zero input (step=0, seed=0) no longer returns 0 (which would make every density gate fire at step 0).
- **Generator helpers** now post‑clamp under Scale 0.0–1.0 so tide / accent / voicing / wave / crowd / terrain / scatter / bounce can't smuggle out‑of‑range values past the engine.
- **DrawCanvas Randomize** now starts from a zeroed length‑1024 buffer so increasing `drawSteps` later doesn't expose stale tail values.
- **DrawCanvas high‑res playhead** modulos by `drawSteps` so a stale `currentStep ≥ drawSteps` doesn't make the dot vanish.
- **DestinationPicker** drops `instrumentId` when the picked Instrument is removed from the sidebar, and clamps `slotIdx` when fnArgSpec shrinks.
- **PoolPane port input** now ignores external status pushes while focused, and shows empty instead of "0" when cleared.
- **Network listener subscription** hoisted from PoolPane to App so the title‑bar status dot updates while the drawer is hidden.
- **Network device row age labels** refresh at 1 Hz between push updates.
- **Cellular initial row** at low step counts now re‑folds the user's full `cellSeed` into the visible bit window so an even seed at steps=1 isn't silently masked to 0.
- **Drift bias asymmetry** fixed — extreme bias (`±1`) now produces a truly monotonic walk (was capped at 2/3 forward).
- **Modulator visuals** now correctly invert S&H probability (the high‑probability branch was firing the low‑probability path) and use proper Slew bipolar dropdown sizing.
- **Random Stepped LFO** no longer disappears at fast BPM‑sync — `visibleStairs = max(8, cycles*8)`.
- **Arpeggiator visual** rebuilt to be driven by Arp Mode (not multMode) for accurate playback‑order display.
- **Inspector step‑value edits** read fresh state inside the onChange callback so rapid keystrokes can't race across re‑renders.
- **CellTile triggerAtRef** moved from render body to a `useEffect` so the ramp progress dot doesn't micro‑jitter at trigger.
- **RcArcSlider / RcFlatBar** got pointer cancel handlers + try/catch around capture so OS‑yanked pointers don't leave them in a captured‑scrub state.
- **RcModeIcons** switched to `flex-wrap` so the 9 icons fold onto two rows at narrow widths / high UI zoom.
- **OscMonitor + Pool now scale with Ctrl+wheel zoom** — moved inside the zoom wrapper, with drawer max height adapting to `uiScale` so the drawer can't eat the workspace at 2×.
- **Pool header layout fixed** — User tab's "+ Instr / + Param / ⤢ / Hide" cluster shrunk so "Built‑in" doesn't wrap to two rows.
- **`materialiseNetworkDevice` regex injection** fixed — OSC roots containing `.` / `(` / `+` etc. no longer produce malformed patterns.
- **Render‑deterministic empty session** — atomic writes, integrity migration backfills every new sequencer / modulator field with sane defaults so v0.3.x and v0.4.0 sessions load cleanly.

---

## Release notes — 0.4.1

A polish pass on top of v0.4.0 with two user‑reported papercuts fixed and a deeper authoring loop for clips that send multi‑arg OSC.

### Open dialog now actually loads
- **Open → click a saved session → it loads.** v0.4.0 silently swallowed a `ReferenceError` (`require is not defined`) inside `requestSessionLoad`. Replaced the dynamic `require` of the integrity‑check module with a static ESM import.

### Ctrl+S saves
- **Ctrl + S** *(Cmd + S on macOS)* saves the current session.

### OCTOCOSME builtin retargeted at the software
- The shipped **OCTOCOSME** Instrument Template now targets port 1986 with 8 bundle Parameters matching the Pure Data show‑control patch's `list split 2` convention.

### Schema‑driven multi‑arg editor
- Pool Parameters can declare a typed list of args (`ParamArgSpec[]`).
- Cells inheriting an `argSpec` show a **Values** section with one bounded numeric input per arg.
- Each arg participates in modulation independently.

### Per‑Track enable / disable + per‑slot persistence
- Per‑Parameter enable checkboxes in the Instrument inspector.
- Pin individual args on a multi‑arg cell — modulation keeps running on the others.

### Other
- Scene cells auto‑size to widest clip.
- Track‑defaults auto‑inheritance.
- Drop‑focus stickiness fix.

---

## Release notes — 0.4.0

**The big merger toward Alex Burton's dataFLOU C++ library:** the editor now speaks the library's vocabulary natively. A flat row of Messages becomes a hierarchy of typed **Instruments** (Templates) holding **Parameters**, with a browseable **Pool** for shipped + user‑authored entries.

- **Pool of Instruments + Parameters** — Built‑in / User tabs, shipped library of 3 Instruments + 5 Parameter blueprints, drag‑to‑instantiate.
- **Group triggers** at every Instrument × Scene intersection — fires every child clip in one gesture.
- **Timeline view** — alternate Sequence visualization, scenes as flex blocks proportional to Duration.
- **Sequence polish** — palette pills hug their names, multi‑scene drag‑drop fills consecutive slots, slot multi‑selection.
- **Transport** — Play in Sequence is dedicated to sequence transport; Pause freezes scene time end‑to‑end; live remaining‑time pill.
- **Inspector toggles** — I / S / M / O / P.
- **OSC Monitor drawer** resizable.
- "Collapse Messages" → "Collapse Instruments".

---

## Release notes — 0.3.6

Three new modulators, Euclidean sequencing, and correctness fixes.

- **Sample & Hold**, **Slew**, **Chaos** modulators.
- **Euclidean** sequencer mode.
- Follow actions, Stop, S&H smooth math, shutdown sequencing fixes.

---

## Release notes — 0.3.5

Live‑performance polish + Ramp + autosave.

- **Cue system** + Morph + Show / Kiosk + transport HH:MM:SS:MS.
- **Ramp** modulator + Envelope synced mode.
- **Autosave + crash recovery**.
- **OSC monitor drawer**.
- **Meta Controller expanded to 32 knobs / 4 banks**.

---

## Release notes — 0.3.0

- **Meta Controller** bank (8 knobs originally), 14 curves, MIDI CC learn, 8 destinations per knob.
- **Follow actions** + ×Multiplicator.
- **Multi‑select** everywhere.
- **5 new themes**, **UI zoom**, **Scene inspector in Sequence view**, **Notes** toggle.

---

## Project status

A personal tool by [Vincent Fillion](https://vincentfillion.com), in active use. Out of scope for now:

- No undo / redo
- No MIDI output (MIDI is input‑only for triggering)
- No OSC bundles with timestamps
- No quantized scene changes (cue firing is immediate)
- No mDNS / OSCQuery (Network discovery is passive listening only)

Issues and PRs welcome.

---

## License

ISC — do whatever you want, no warranty.
