# Open Questions

Running list of decisions this project has deferred. Each entry says what the
question is, why it bites, and the options — so picking one later doesn't mean
re-deriving the context.

Status: **OPEN** (undecided) · **DECIDED** (settled, kept for the rationale) ·
**DEFERRED** (real, deliberately not now).

---

## Modulation

### 1. LFO modulation is additive, and the UI doesn't say so — **OPEN**

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

Recommendation: **(b)**. It's the smaller change, it matches hardware
intuition, and "knob sets the centre, LFO wobbles around it" is the mental
model that survives contact with a modulation matrix. (a) fights the platform —
Web Audio param summing is the native behaviour, and suppressing it means
special-casing every knob.

Blocks: a proper mod matrix, since depth semantics have to be settled before
multiple sources can share a destination.

### 2. Can two LFOs target the same param? — **OPEN**

Nothing prevents it today and they'd sum, which is musically fine and arguably
a feature. But the depth knobs snap to the param's range on selection, so two
sources both snapped to `100 → 10000` will scream. Related to #1.

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

It is **not** sufficient for renames or unit changes (e.g. if cutoff ever
becomes a normalised 0..1 taper, see #10). At that point `coercePatch` needs a
real `if (raw.version < 2)` branch before the field mapping. Leaving the
version field in place now is what makes that possible later.

### 5. Factory presets — **OPEN**

Nothing ships with the app; first run is always `Init`. A `src/presets/*.json`
set loaded into the bank on first boot would give the workbench something to
make noise with immediately, and doubles as regression fixtures. Cheap, but it
needs #10 settled first or every shipped preset needs rewriting.

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

### 9. One global patch, or many instruments? — **OPEN**

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
