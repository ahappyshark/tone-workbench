# Open Questions

Running list of decisions this project has deferred. Each entry says what the
question is, why it bites, and the options — so picking one later doesn't mean
re-deriving the context.

Status: **OPEN** (undecided) · **DECIDED** (settled, kept for the rationale) ·
**DEFERRED** (real, deliberately not now).

---

## Modulation

### 1. LFO modulation is additive, and the UI doesn't say so — **DONE**

Connecting a `Tone.LFO` to a param *sums* with that param's base value; it does
not replace it. So a cutoff of 4000 with an LFO of `100 → 10000` actually
sweeps **4100 → 14000**, while `LFOModule` cheerfully prints `100.0 → 10000.0`.
The knob and the readout are both lying.

Presets are unaffected — it's deterministic and round-trips correctly — so this
is a sound-design and honesty problem, not a persistence bug.

Options:

- **(a) Modulation ownership.** When an LFO claims a param, zero the param's
  base value and remember it; restore on disconnect. The LFO's min/max then
  mean absolute values, matching what the UI already claims. Requires the
  registry to track claims so `PolySynth`'s apply-effects skip writing to a
  claimed param, and the owning knob should render as disabled/ghosted while
  modulated.
- **(b) Bipolar depth.** Keep it additive but re-label honestly: replace the
  min/max knobs with a single **Depth** knob (−1..1) scaled to the param's
  range, so the LFO reads as an offset around the knob's position. This is how
  most hardware actually behaves, and it's less machinery than (a).
- **(c) Leave it, fix the label only.** Print the real resulting range.

**Decided: (b), bipolar depth.** Settled by `SYNTH-DESIGN.md` rather than by
argument — once modulation goes through a matrix, summing *is* the natural
semantics and any other answer needs special-casing at every knob. The min/max
knob pair is replaced by a single signed depth; the knob sets the centre.

Two consequences worth recording:

- Sources normalise to −1..1 and each destination declares what depth `1.0`
  means in its own units, so depth is comparable across destinations.
- Pitch and cutoff modulation route to `detune` (a `Signal<"cents">`, which is
  exponential) instead of `frequency` (linear Hz). Without that, the same depth
  is a four-octave lurch at 200Hz and inaudible at 8kHz.

Shipped in phase 2. The min/max pair is gone; each route carries one signed
depth, and the row prints what that depth means in the destination's units
(`0.45 → +2160 cents`) so the number on screen is the real one.

### 2. Can two LFOs target the same param? — **DONE**

Nothing prevents it today and they sum, which is musically useful. The current
hazard is only that depth knobs snap to the param's full range on selection, so
two sources both snapped to `100 → 10000` will scream. Bipolar depth (#1)
removes the snap and the hazard with it — multiple routes to one destination
becomes a normal, intended thing.

### 3. Tempo-synced LFO rates — **DONE**

Shipped in phase 2 for both LFOs and random S&H. Two things worth recording:

- `lfo.sync()` captures the frequency signal's *current* value as its ratio
  against transport bpm, so the division has to be assigned **before** calling
  it. Setting it afterwards silently overwrites the synced connection and the
  rate stops following tempo — and `frequency.value` then reads 0, so you
  can't detect it by inspection, only by ear.
- A synced source is scheduled on the transport timeline, so it needs
  `start(0)`, not `start()`, and it only runs while the transport does. The
  LFO panel says so rather than leaving it a mystery.

---

## Presets

### 4. Schema migration when `PatchState` grows — **DECIDED (revisit at v2)**

`PATCH_VERSION` exists but there is no migration function. The de facto
strategy is `coercePatch()`: unknown fields are dropped, missing fields take
their default. That's genuinely sufficient for *additive* changes — an old
preset loaded into a newer app just gets defaults for the new controls.

It is **not** sufficient for renames or unit changes. Phase 1 of
`SYNTH-DESIGN.md` moves the ADSR under `ampEnv` and cutoff/res under `filter`,
which is exactly that case — but **no presets exist yet**, so there is nothing
to migrate and phase 1 simply bumps `PATCH_VERSION` with no migration branch.

The first migration will be the first schema change made *after* real presets
exist. Keep the version field bumping honestly until then, so that when the day
comes the branch has something to key on.

### 5. Factory presets — **OPEN**

Nothing ships with the app; first run is always `Init`. A `src/presets/*.json`
set loaded into the bank on first boot would give the workbench something to
make noise with immediately, and doubles as regression fixtures.

Now upgraded in importance: `SYNTH-DESIGN.md` makes the two planned variants
(**Shark Ambient**, **Shark Aggro**) *preset packs on one engine* rather than
forks of the code, so the factory-preset mechanism is how variants ship at all.
Blocked until phase 1 lands, since the schema is about to change shape.

### 6. Save silently overwrites — **OPEN**

`savePreset` clobbers an existing name with no confirmation. Fine for a
workbench, mildly annoying the first time it eats a patch. Also: the bank is
flat and unsorted-by-use — no tags, folders, or categories.

### 7. Is the master chain part of the patch? — **OPEN**

`audio/master.ts` hardcodes `Gain(0.8) → Limiter(-6) → destination`. Not
exposed, not registered as a modulation target, not saved in presets. Probably
correct — master is a mixer setting, not a patch setting — but if any master
effects ever land (see the synth expansion), they *are* patch state.

---

## Architecture

### 8. Seven parked patch components — **DECIDED (sandboxed)**

Moved to `src/sandbox/`, excluded from `tsconfig.app.json` and
`eslint.config.js`, with a README noting what each one proved. They were
probes at Tone.js features rather than app components, and several are worth
harvesting — `XYPatch`'s FM/AM/pulse-width configs feed straight into the
oscillator design, and `SequencerPatch`/`ArpPatch` are the seed for the ambient
variant's generative module.

`XYController` and `Slider` went with them (nothing else used either).
`PolySynth` was the only survivor of `components/patches/`, so it moved up to
`components/` and the directory is gone.

### 9. One global patch, or many instruments? — **DEFERRED**

`patchStore` is a module singleton holding exactly one synth. That is the right
call for a workbench and the wrong call for anything multi-timbral. If layered
or split sounds ever matter, the store has to become a keyed collection and
param registry ids need an instance prefix (they're already namespaced —
`PolySynth.filterCutoff` — so this is less painful than it sounds).

---

## Controls & code health

### 10. Every knob is linear, including cutoff — **OPEN**

`Knob` maps drag distance to value linearly. For frequency that feels awful:
half the travel of the cutoff knob is spent between 5kHz and 10kHz where almost
nothing musical happens, and the useful 100–1000Hz range is crammed into the
first few pixels. Real synths use a logarithmic taper.

Fix: add a `taper?: 'linear' | 'log'` prop to `Knob` mapping through
`log`/`exp`, and use it for cutoff, LFO rate, and any time value. Changes no
stored data (values stay in Hz) — but see #4 if the *stored unit* ever changes.

Note this is a *separate* problem from #1's `detune` routing, which only fixes
the modulation path. The knob itself is still linear under the finger. Both
need doing.

Same component, smaller: no fine-drag modifier (shift = 10× precision), no
keyboard or ARIA support, and `onPointerLeave` ends a drag, so dragging past
the window edge drops the knob.

### 11. `npm run build` is red — **FIXED**

Green as of the sandbox move. Most of the 15 errors were the parked patches
(#8); the four real ones were in `useMidi.ts` and are fixed properly rather
than cast away:

- `e.data` is nullable per the Web MIDI spec, and sysex messages exceed three
  bytes — messages shorter than a channel message are now ignored instead of
  destructured blindly.
- `e.port` is nullable on `statechange`; guarded, and re-plugged devices are
  de-duplicated instead of stacking a second listener.
- `requestMIDIAccess()` could resolve after unmount and attach listeners to a
  torn-down effect. Now guarded by a `cancelled` flag, and `onstatechange` is
  cleared on cleanup.

Lint is down to four errors, all in files the synth engine rewrites
(`PolySynth`, `ParamRegistry`, `useRegisterParam`).

### 12. `useRegisterParam` only depends on `ready` — **RESOLVED (deleted)**

Moot as of phase 1. The engine is now the only source of modulation
destinations and registers them directly inside the effect that builds the
voice pool, so there is no `ready` flag and no deferred `getParams` closure.
The hook had no callers left and was deleted.

### 13. `RegisteredParam.targets` is `any` — **RESOLVED (registry deleted)**

Moot. The param registry existed so LFOs could discover destinations at
runtime; with the matrix, destinations are a static table (`MOD_DESTINATIONS`)
and each voice resolves them itself. `ParamRegistry`, its context and its
hooks are deleted, and the provider is out of `main.tsx`.

If OQ #9 (multiple instruments) is ever taken up, the destination table grows
an instrument prefix rather than the registry coming back.

---

## Synth engine

Raised by `SYNTH-DESIGN.md`. These only become live once phase 1 starts.

### 14. Voice count: fixed, or user-facing? — **DECIDED (fixed at 16)**

Pool size is a constant, not a control. Changing it is the one operation that
must rebuild the whole pool, and rebuilding audio nodes during playback clicks.

16 rather than 8 because unison consumes voices (#15): at 8, a 4-voice unison
patch could only play two notes.

What *is* per-patch is **voice mode** — `poly` / `mono` / `legato` — which is
the same allocator as unison and lives in the same `voice` block. That covers
the actual musical want (this patch is a mono bass, that one is a pad) without
exposing pool size.

### 15. Unison: `fat*` oscillators or real voice stacking? — **DECIDED (stacking)**

This was posed wrong. The question isn't which technique to use, it's one level
up and genuinely architectural:

> **Can a single note claim more than one voice?**

That's an allocator property. Build it in and the unison count is just a number
that can be patch state for free; leave it out and adding it later rewrites the
hot path. So: **the allocator hands out groups of voices**, and `unison` is a
per-patch control.

The audible difference, for the record. `fat*` sums detuned copies *inside one
oscillator node*, before the filter — so every copy shares one filter, one
envelope, and the node is mono. Stacking real voices gives each copy its own
filter (so per-voice LFOs let each drift independently), its own envelope, and
its own pan. That independent-filter drift is most of what "lush evolving pad"
means, which is half the ambient variant's job. `fat*` gets maybe 80% of the
way for a fraction of the cost; the missing 20% is exactly the part that
matters here.

`fat*` types stay available as oscillator types — free with `OmniOscillator`,
useful as a cheap thickener — they're just not the unison feature.

Cost: unison eats polyphony, which is the trade the control exposes and the
reason the pool is 16 (#14).

### 16. Does the mod matrix get a UI, or stay a list? — **DECIDED (list)**

Shipped as a flat list of `{source, destination, depth}` rows. Deliberately
throwaway: the routing is the interesting part, and a week of using a mediocre
list will say more about what the real UI wants than guessing now. Revisit
once a patch routinely runs past ~8 routes.

### 17. What actually makes the two variants different? — **OPEN**

The design says variants are preset packs, not forks. Unresolved: whether
either variant needs a module the other never touches — a generative sequencer
for ambient is the obvious candidate. If so it's an *optional module in one
engine* (a flag in `PatchState`), never a second engine. Worth checking after
phase 4 whether the packs actually sound distinct, or whether the engine is
missing something that only one of them needs.

### 18. Mono/legato note priority — **DONE**

All three shipped as a per-patch control, defaulting to last-note. Under
low/high priority a key that doesn't win changes nothing at all — no
retrigger, no pitch change — which is the point of holding a bass note and
playing over it. Releasing the winner hands over to the next in line.

### 19. Oscillators run continuously — **OPEN (worse now)**

Every voice's sources are started once and gated by the amp envelope, because
starting and stopping them per note clicks. That means 16 voices × (2 osc +
sub + noise) are always generating, and `fat` mode multiplies the oscillator
count by up to 7 per slot — a patch with both slots on `fat`/count 7 is
running 224 oscillators before the sub and noise.

Phase 2 adds to this: a `perVoice` LFO is instantiated 16 times, so three
per-voice LFOs is another 48 running oscillators on top.

Still no audible problem. If crackle shows up this is the first suspect, and
the fix is to stop a voice's sources once its release tail is spent (the
`isSpent` check the sweep already uses) and restart them on trigger.

### 20. Velocity only reaches the amp envelope — **DONE**

Velocity is a proper per-voice mod source as of phase 2, held at a constant
signal for the life of the note. Routed to filter cutoff at full depth it
moves the measured brightness from 4.9 to 28.2 between a soft and a hard
note — the difference between an instrument that responds to playing and one
that doesn't.

### 21. Synced sources need the transport running — **OPEN**

An LFO or S&H in `sync` mode is scheduled on the transport, so it sits still
until Play is pressed. That is what locking to tempo *means*, and both panels
say so, but it will still read as "my LFO is broken" the first time.

Options if it grates: auto-start the transport when a synced source exists;
show a warning when something is synced and the transport is stopped; or free
the rate from the transport and merely derive Hz from BPM (which then stops
following tempo changes). Leaving it until it actually annoys someone.

### 22. Test runs need a fresh dev server — **RESOLVED (process note)**

Not a product issue, but it cost real time twice, so: Vite appends `?t=<ts>`
HMR query strings to modules it has re-transformed. A test that does
`import('/src/state/patchStore.ts')` then gets a **different module instance**
than the running app — the store writes land in one copy and the UI reads the
other, which presents exactly like a broken subscription.

The same trap applies to `tone` itself (`?v=<hash>`), where it presents as an
AudioContext mismatch. Restart the dev server before a test run, and treat
"the UI stopped reacting to the store" as a suspected module-identity problem
before debugging the store.

### 23. Writing a Tone Param that also receives modulation — **DONE (and it was silent)**

The nastiest bug of the project so far, found by phase 1's unison-beating test
after phase 3 connected pitch bend.

`connectSignal` (Tone `Signal.js`) does this to any `Param` or `Signal` you
connect something to: cancels its scheduled values, sets it to 0, and marks it
`overridden`. From then on `_fromType` returns 0 for every write, so
`param.value = x` **silently does nothing**. No error, no warning.

Every knob whose param is also a modulation destination was therefore dead the
moment anything routed to it:

- `filter.detune` takes the mod envelope from the constructor, so the **Key Trk
  knob never worked at all**, from the day it was written.
- `oscA/B.detune` carried fine tuning and unison detune; pitch bend connecting
  in phase 3 killed both unconditionally.
- `filter.Q`, the four level gains and `panner.pan` each died as soon as a
  route pointed at them.

The rule now: **a param that can receive modulation is never written
directly.** Either fold the value into a param that takes no connections
(fine/unison go into `frequency`; key tracking multiplies the cutoff), or give
it a dedicated base `Tone.Signal` that supplies the value while modulation sums
on top — a base signal has no inputs of its own, so writing it works.

`phase3override.mjs` covers every destination that has both a knob and a route.
Anything added to `MOD_DESTINATIONS` from here needs the same treatment and a
row in that test.

### 24. Computer-keyboard range — **DONE**

A–K covered one octave, which isn't enough to play a bassline and a lead on the
same patch. Z and X shift by octave, clamped to ±3, with the current range
shown next to the title. Keys track the note they actually started, so a shift
mid-note releases the right pitch instead of hanging it.
