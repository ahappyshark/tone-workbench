# Open Questions

Running list of decisions this project has deferred. Each entry says what the
question is, why it bites, and the options — so picking one later doesn't mean
re-deriving the context.

Status: **OPEN** (undecided) · **DECIDED** (settled, kept for the rationale) ·
**DEFERRED** (real, deliberately not now).

---

## Modulation

### 1. LFO modulation is additive, and the UI doesn't say so — **DECIDED → (b)**

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

Lands in phase 2 of the build. Until then the current additive behaviour and
its wrong readout stay as-is.

### 2. Can two LFOs target the same param? — **DECIDED (yes)**

Nothing prevents it today and they sum, which is musically useful. The current
hazard is only that depth knobs snap to the param's full range on selection, so
two sources both snapped to `100 → 10000` will scream. Bipolar depth (#1)
removes the snap and the hazard with it — multiple routes to one destination
becomes a normal, intended thing.

### 3. Tempo-synced LFO rates — **DEFERRED**

Rate is free-running Hz only. `Tone.Transport` exists and `TransportControls`
already drives BPM, so `1/4`, `1/8T`, `1/16` rates are cheap and are table
stakes for anything rhythmic. Needs a rate-mode toggle in `LFOState`.

---

## Presets

### 4. Schema migration when `PatchState` grows — **DECIDED (revisit at v2)**

`PATCH_VERSION` exists but there is no migration function. The de facto
strategy is `coercePatch()`: unknown fields are dropped, missing fields take
their default. That's genuinely sufficient for *additive* changes — an old
preset loaded into a newer app just gets defaults for the new controls.

It is **not** sufficient for renames or unit changes. That case is no longer
hypothetical: phase 1 of `SYNTH-DESIGN.md` moves `attack`/`decay`/`sustain`/
`release` under `ampEnv` and `filterCutoff`/`filterRes` under `filter`. That's
a rename, so **v2 needs a real `if (raw.version < 2)` branch** remapping the
flat fields before coercion. Units stay in Hz and seconds, so it's a pure field
move — write it when phase 1 lands, not after.

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

### 8. Seven parked patch components — **OPEN**

`SynthPatch`, `PolyPatch`, `ArpPatch`, `XYPatch`, `GrainPatch`,
`SequencerPatch`, `SynthTestPatch` are still imported in `App.tsx` but never
rendered, which is what makes `npm run build` fail (see #11). They are not
worthless — `XYPatch` already has working FM, AM and pulse-width configs, and
`GrainPatch` has a file-loading granular player.

Options: delete them; move them to a `sandbox/` excluded from the build; or
harvest the good parts into the main synth and then delete. The imports should
come out of `App.tsx` either way.

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

### 11. `npm run build` is red — **OPEN**

15 TypeScript errors, none from the preset work. Unused imports in `App.tsx`
(#8), `XYController`, `ArpPatch` — plus four real ones in `useMidi.ts`:
`port` is possibly null in three places and `Uint8Array | null` isn't
iterable. That last group will actually bite with a real controller attached.

### 12. `useRegisterParam` only depends on `ready` — **OPEN**

`getParams` isn't memoised and isn't in the dep array, so params are captured
once when `ready` flips. Fine while every registered param is a stable node
reference; a stale-closure bug waiting to happen the moment a patch registers
params that can change identity.

### 13. `RegisteredParam.signal` is `any` — **DEFERRED**

`Tone.Signal<any> | Tone.Param<any>` with `as any` at both connect and
disconnect. Tone's param generics don't unify cleanly across units
(`frequency` vs `positive` vs `decibels`); a discriminated union keyed on unit
would type it properly. Low value until the mod matrix exists.

---

## Synth engine

Raised by `SYNTH-DESIGN.md`. These only become live once phase 1 starts.

### 14. Voice count: fixed, or user-facing? — **OPEN**

Default 8. Changing it is the one operation that must rebuild the whole pool,
so it can't be a knob you sweep during playback — it needs to be a discrete
setting that stops all voices first. Is it patch state (a pad wants 8, a bass
wants 1) or an app-level preference? Leaning patch state, since the variants
will disagree about it.

### 15. Is unison `fat*` oscillators, or real per-voice stacking? — **OPEN**

`Tone.OmniOscillator`'s `fat*` types give `count` detuned copies with a
`spread`, for free, inside one node. Real per-voice stacking (N voices per note,
each with its own filter and envelope) sounds better and costs N× the voices
plus a much more complicated allocator.

Leaning `fat*` plus a `Tone.StereoWidener` for width — it's most of the sound
for a fraction of the work, and `FatOscillator` is mono so width needs solving
either way. Revisit if the ambient variant sounds thin.

### 16. Does the mod matrix get a UI, or stay a list? — **OPEN**

A route is `{source, destination, depth}`. A flat "add route" list is trivial
and scales badly past ~8 routes; a grid is the classic answer and is a real
chunk of UI work. Start with the list, since the routes themselves are the
interesting part and the list is throwaway.

### 17. What actually makes the two variants different? — **OPEN**

The design says variants are preset packs, not forks. Unresolved: whether
either variant needs a module the other never touches — a generative sequencer
for ambient is the obvious candidate. If so it's an *optional module in one
engine* (a flag in `PatchState`), never a second engine. Worth checking after
phase 4 whether the packs actually sound distinct, or whether the engine is
missing something that only one of them needs.
