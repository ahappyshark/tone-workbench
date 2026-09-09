# Handoff — tone-workbench

Written at the end of the session that built the Grain Lab and the composite
effects, and updated by the one that added the last two of them — the
multiband smear and the mid/side dimension. Everything here is current as of
the working tree described below.

**Read this first, then `SYNTH-DESIGN.md` and `GRAIN-DESIGN.md` for the
reasoning behind the decisions summarised here.** `OPEN-QUESTIONS.md` is the
running log of things deliberately settled or deliberately postponed.

---

## What this is

A Tone.js sound-design workbench in Vite + React + TypeScript. It holds **two
independent instruments that are alive at the same time**, plus a shared
effects and modulation layer.

```
npm run dev     # or the "tone-workbench" entry in .claude/launch.json, port 5173
npm run build   # tsc -b && vite build
npm run lint
```

Audio does not start until the user clicks **Start Audio** — everything below
that gate mounts only after `Tone.start()`.

| path | what lives there |
| --- | --- |
| `src/audio/` | all sound. Engines, voices, effects, the note bus, patch schemas |
| `src/state/` | patch stores (one per instrument) and the shared store adapter |
| `src/hooks/` | engine bridges and input |
| `src/components/` | panels and racks |
| `src/sandbox/` | dead experiments, excluded from tsconfig and eslint. Stale by design |


---

## Completed

### Shark Synth (`src/audio/synthEngine.ts`, `voice.ts`)

- Fixed pool of **16 voices**. A note claims a *group* of `unison` voices and
  groups are always stolen whole. Stealing prefers releasing groups, then
  oldest-first. Spent voices are swept back to the pool by release-tail time.
- Oscillator A and B through `OmniOscillator` in basic / fat / fm / am / pulse
  modes, plus a sub oscillator and a noise source.
- Filter with mod-envelope amount in cents and key tracking.
- Amp envelope; mod envelope that additionally **loops** in `free` and `sync`
  trigger modes, driven by one engine-level clock so a chord stays in phase.
- Poly / mono / legato, note priority (last / low / high), glide, pitch bend
  with patch-controlled range, sustain pedal, unison detune and stereo spread.
- Modulation matrix: sources are mod envelope, velocity, key track, mod wheel,
  random sample-and-hold, and any number of LFOs (per-voice or shared).
  Destinations are per-voice params plus every modulatable effect param.
- LFO rack with `free` / `key` / `sync` trigger modes.
- Presets: seven factory presets, localStorage save/load, JSON import/export.
- Computer keyboard and Web MIDI input.

### Grain Lab (`src/audio/grainEngine.ts`, `grainVoice.ts`, `grainSource.ts`)

A separate instrument, not a mode of the synth. Six grain clouds, its own
`FxRack` instance, its own store.

- **A custom grain scheduler, not `Tone.GrainPlayer`.** One clock at 30 Hz
  asks every sounding voice for the grains due before the next tick, and each
  grain is scheduled with an explicit start time.
- Per note: position, scan rate (zero freezes, negative reverses), grain size,
  density, scatter, window shape, pitch jitter, stereo spread, reverse
  probability, octave / semi / fine, and key tracking (at zero, keys trigger
  clouds without transposing them).
- Drone switch holds one cloud open with no key down.
- Post-cloud filter, amp envelope, mod envelope, shared LFOs, random S&H.
- Waveform display with the position playhead, live scan heads, the scatter
  band, and drag-to-scrub.
- Five **generated** starter textures (`chords`, `vowels`, `bells`, `weather`,
  `melody`) plus audio file drop.

### Shared layer

- **Note bus** (`src/audio/noteBus.ts`). Computer keyboard and MIDI feed it;
  it fans out to whichever instruments are targeted (Shark / Grain / Both). It
  records which instruments each sounding note reached, so retargeting
  mid-note still delivers the note-off correctly.
- **`InstrumentStore` adapter** (`src/state/instrumentStore.ts`). The FX rack,
  LFO rack and mod matrix take one of these instead of importing a store, so
  the same components render either instrument.
- **Eleven effect types**, all available to both instruments:

| type | node |
| --- | --- |
| drive, chorus, delay, reverb | single Tone effects |
| shimmer | `Ladder('pitch')` — delay feedback through a pitch shifter, into a reverb |
| shift | `Ladder('shift')` — same network with a frequency shifter, so it goes inharmonic |
| resonator | four tuned comb filters; one voicing is the root-omitted stacked third |
| duck | reverb with an envelope follower pulling the wet down while you play |
| tape | delay with saturation and lowpass in the feedback path, plus a wow LFO |
| smear | `MultibandSmear` — `MultibandSplit` into three delays with independent times and feedbacks |
| dimension | `Dimension` — `MidSideSplit`, a modulated delay and a width gain on the sides only, merge |

---

## Unresolved, with acceptance criteria

Ordered roughly by value. Nothing here is started.

### 1. Grain patches cannot be saved at all

`presetStorage.ts` and `PresetBar.tsx` are typed to `PatchState` and wired to
`patchStore` only. Every Grain Lab edit is lost on reload. This is the largest
gap in the app.

**Done when:** grain patches save to and load from localStorage under their
own key, export and import as JSON through `coerceGrainPatch`, a handful of
factory grain presets exist, and the preset bar acts on whichever instrument
tab is showing rather than always the synth.

### 2. Resample the shark synth into the grain buffer

The user explicitly asked for this. Needs an `AudioWorklet` to capture raw
samples: Tone's `Recorder` encodes to a compressed blob and does not give you
sample data.

**Done when:** a record control captures a chosen number of seconds of the
synth's output into an `AudioBuffer`, installs it as the grain source, and the
waveform display updates. The same worklet should be reusable by item 3.

### 3. Granular freeze effect

An effect slot that keeps a rolling buffer of its input and granulates it, so
any moment can be held and scanned. Same worklet dependency as item 2.

**Done when:** it exists as an `FxType` with freeze, position, scatter and
density controls, and holding a chord then releasing it leaves the texture
sustaining.

### 4. Generative harmonizer

Spec is in `generative-harmonizer-spec.md`. **Component 6 of that spec is
superseded and must not be implemented as written** — it calls for a
`PolySynth` and a `FeedbackDelay` per cluster so tails are not cut, which the
voice pool already handles. It should own no audio at all.

**Done when:** it emits note-on and note-off into `noteBus` like any other
input source, with a key and mode picker, a cluster pool auto-built from
diatonic sevenths with the root dropped, a pairwise common-tone matrix, the
rule engine (common-tone threshold, recency window, register limit, density
delta), the single certainty slider from deterministic to uniform-random, a
`Tone.Loop` trigger on a settable subdivision, and a mode that responds to
live playing instead of generating autonomously.

### 5. UI pass

Raised and deferred. Everything is inline styles and functional-only controls.
The mod matrix is deliberately a flat list until a patch routinely runs past
about eight routes (OPEN-QUESTIONS #16).

### 6. Smaller items

- Resonator `tune` is a setter, so the bank's root cannot be modulated.
  Making it one means driving four delay-time params from one source.
- Grain LFOs are shared only; per-voice was deliberately skipped.
- Grain Lab has no mic or line-in recording.

---

## Architectural decisions and constraints

These are the things that will bite a fresh session that does not know them.

### The base-signal rule, which is not optional

**Connecting anything to a Tone `Param` cancels its value, zeroes it, and
marks it overridden. After that, writing `.value` silently does nothing.**

So every param that can receive modulation is fed by a dedicated base signal
with no inputs of its own: the knob writes the base, the mod routes sum on
top. This is why `Voice`, `FxRack`, `GrainVoice` and every composite effect
all carry base signals rather than writing params directly. A silent knob is
almost always a violation of this rule.

### Two modulation regimes in the Grain Lab

The synth sums modulation into audio params at audio rate and nothing in
JavaScript ever needs the total — which is fortunate, because Web Audio
offers no way to read a param's summed value back out.

Grain parameters cannot work that way: they are read by the scheduler, in
JavaScript, when each grain is born. So grain destinations are **sampled** —
every source is reduced to a number once per tick and the sums are
arithmetic. Envelopes use `getValueAtTime`, velocity and key tracking are
already numbers, and LFOs get a small analyser tap. Params still on the audio
path (filter, pan, all effects) keep the signal-summing route.
`GRAIN_DESTINATIONS` marks the regime; `applyRoutes` dispatches on it.

Consequence: an LFO faster than the grain rate aliases rather than wobbles.

### Effects are global, so per-voice sources cannot reach them

One chain after the voices are summed means an effect param is one value and a
per-voice source is sixteen. Those routes are simply not connected, and the
matrix labels them inactive. `isRouteLive` / `isGrainRouteLive` is the shared
rule. See OPEN-QUESTIONS #26.

### An effect is not necessarily one node

`FxRack` tracks each slot's `entry` and `exit` separately, so a slot can hold a
patched network with a feedback loop inside it. That is what makes the next
composite effect a new file rather than a new exception.

Rewiring the chain is the one operation that clicks, so it only happens when
the *shape* changes — add, remove, bypass, reorder, retype. The chain
signature is `id:type` rather than `id` because retyping replaces the node in
place.

### Web Audio and Tone constraints worth memorising

- **A feedback cycle must contain a `DelayNode` or the browser silences it.**
  Tone states this in `FeedbackEffect`. Every composite with a loop has an
  explicit delay in it for this reason.
- **A convolution reverb inside a feedback loop starves.** It spreads one
  impulse across its whole decay, so the gain going round the loop is a small
  fraction of unity. Measured: the tail died in about two seconds regardless
  of the feedback setting. Reverbs go *after* loops, not inside them.
- **A comb filter's ring time and its gain are the same control.** Ring time
  goes as 1/(1−r) and so does gain at the resonant frequency. The resonator
  maps the knob through a curve *and* scales its output by the square root of
  (1−r), or it either does not ring or clips.
- **An envelope follower's output is much smaller than it looks.** It is the
  smoothed absolute value, and notes off the voice bus peak near a tenth of
  full scale. The ducker needs a makeup gain of about twenty, and once it is
  that hot the control signal can go negative, where a gain inverts rather
  than mutes — hence a waveshaper flooring the sum at zero.
- **Some params are not params.** `Distortion.distortion` rebuilds a
  waveshaper curve, `Reverb.decay` re-renders an impulse response offline, and
  `PitchShift.pitch` rebuilds delay ramps. None can follow modulation, so none
  are offered as destinations, and reverb decay is debounced by 120 ms before
  it is written or a knob drag fires one render per frame.
- **`AudioBufferSourceNode` refuses a negative playback rate.** Reverse grains
  read a genuinely reversed copy of the buffer at the mirrored offset.
- **A crossover's Q is a resonant peak at the crossover.** Tone's `Filter` and
  `MultibandSplit` default to Q = 1, and the bands are summed back together
  afterwards, so that peak survives as an audible bump exactly where the
  bands meet. Both new composites pin Q at 0.707 for this; the mid/side one
  measured +1.2 dB of bass *into* the sides before it did, which is the
  opposite of what its mono control is for.
- **A three-band split does not reconstruct flat.** Butterworth crossovers are
  not complementary, so summing the bands back is about 2 dB down on
  broadband material even with all three delays set equal. Not corrected: the
  error is frequency-dependent, so a fixed makeup gain would only move it.
- **Mid/side is silent on a mono source.** The side signal of two identical
  channels is zero, so every control in `dimension` does nothing at all.
  Something stereo has to come first — unison spread, a chorus, panned
  grains. It is a property of the transform, not a bug to fix.
- **A negative delay time clamps at zero rather than wrapping.** An LFO summed
  into a delay time around an offset of zero gets half-wave rectified, which
  is a buzz and not a wobble. `dimension`'s sway LFO is unipolar so it only
  ever adds.

### Why the grain engine is not `Tone.GrainPlayer`

Its read position is `tickCount * grainSize`, a pure function of elapsed time.
That rules out position control, freeze, scanning independent of pitch, spray,
reverse, and density separate from grain size — which is to say, everything
granular synthesis is for.

### Granular has no controls on stationary material

The first set of starter textures was written to "granulate well": smooth,
slowly evolving, no silence. That made them spectrally identical everywhere,
measured at 0.998 or better window-to-window similarity. Every control worked
and none could be heard. Material for a granular engine **must change across
its length** — distinct events, pitch and timbre changes, and gaps. The
replacements measure between 0.003 and 0.6.

### State

- Stores are module singletons **outside React**, so a knob drag cannot
  re-render the tree above it. Updates replace only the section that changed,
  which keeps `useSyncExternalStore` snapshots reference-stable and stops a
  filter tweak re-applying the oscillators.
- **One store per instrument, not one keyed store.** The two share no state.
  OPEN-QUESTIONS #9 is about multi-timbral instances of *one* instrument,
  which is a different problem and still deferred.
- Everything a preset must restore lives in `PatchState` / `GrainPatchState`.
  Nothing about a patch may live in component state.
- `coercePatch` and `coerceGrainPatch` never throw. Preset files are
  hand-editable and several Tone setters throw on bad values rather than
  ignoring them.

### Fixed sizes, and why

16 synth voices and 6 grain clouds, both fixed. Rebuilding node graphs
mid-playback clicks. Grains are additionally capped at 48 concurrent per voice
because density and size are both modulatable, and grain gain is normalised by
the overlap count or a density sweep becomes a volume sweep.

---

## Known failures and todos

**No known runtime failures.** Build and lint are green, and a smoke test of
the current tree showed no console errors, both instruments sounding, the
grain starter loaded, and all eleven effect types available on both racks.
The two newest were additionally rendered offline and measured: each band of
the smear arrives at its own delay time and repeats at it, and the dimension
scales the sides while leaving a mono source bit-identical.

Things to be aware of:

1. **Grain patch state is not persisted.** See unresolved item 1. Treat this
   as a bug rather than a missing feature if a user loses work to it.
2. **Schema versions have moved without migration logic.** `PATCH_VERSION` is
   8 and `GRAIN_PATCH_VERSION` is 2. Coercion clamps and defaults anything
   unrecognised, which has been enough so far, but OPEN-QUESTIONS #4 says to
   revisit and that point has arguably arrived.
3. **Vite HMR does not reliably swap composite effect classes.** Editing
   `ladder.ts`, `ducker.ts`, `resonator.ts`, `tapeEcho.ts`, `multiband.ts` or
   `dimension.ts` leaves already
   constructed instances in the graph. This produced a false negative during
   testing that cost real time. **Do a full page reload after touching an
   audio class**, not just an HMR update.
4. **The preview pane does not repaint while hidden**, so canvas-based
   verification silently reads stale pixels. See the testing note below.
5. **Web MIDI is denied in the in-app preview browser**, so MIDI input cannot
   be verified there. The console warning is expected, not a bug.
6. The bundle is over 500 kB and Vite says so on every build. Tone is most of
   it. Not addressed.
7. `src/sandbox/` is stale and excluded from typechecking and linting.
   `GrainPatch.tsx` in there is superseded by the Grain Lab.
8. Open items in `OPEN-QUESTIONS.md`: #6 (save silently overwrites), #10 (all
   knobs are linear, including cutoff), #17 (what actually distinguishes the
   two planned variants), #19 (oscillators run continuously — worse now that
   there are two instruments), #21 (synced sources need the transport
   running). Deferred: #9, #25.
9. The master chain (gain and limiter) is deliberately **not** part of any
   patch. OPEN-QUESTIONS #7.

### How to verify audio changes

There is no test suite. What worked in this session, and is worth repeating:

Temporarily append a probe to `src/audio/master.ts` behind
`import.meta.env.DEV` that connects an `Analyser` to `masterGain` and exposes
a function on `globalThis` returning peak level and spectral centroid. Then
drive the app from the browser console: click through the DOM, dispatch
`KeyboardEvent`s with `code: 'KeyA'` at `window` to play notes, and sample the
probe on a timer.

This catches things listening cannot describe and screenshots cannot show —
that scatter was mathematically working but inaudible, that the shimmer tail
climbed in centroid, that the resonator peaked past full scale, that the duck
gain moved from 1.0 to 0.38 and back. **Remove the probe when done.**

**Better still, render it offline.** `Tone.Offline(cb, seconds, channels)`
swaps the global context for the duration of the callback, so anything built
inside it — a composite effect, or a whole `FxRack` with a patch applied —
renders to a buffer you can measure sample by sample. That is how the two
newest effects were checked: a ramped sine burst through the smear, with the
arrival times of the peaks read off the buffer and compared against each
band's delay time, and a pure-side source through the dimension, with the
width knob shown to scale the sides and leave a pure-mid source untouched to
four decimal places. It runs faster than real time, needs no clicking, and
answers questions listening cannot.

Two things it caught that a live smoke test would not have:

- **Test through `FxRack`, not just the effect class.** Writing `.value` on a
  param the rack has connected a base signal to does nothing, so an effect
  that measures perfectly on its own can still be a row of dead knobs in the
  app. `rack.destinationParam()` is public: walk `FX_MOD_PARAMS` for every
  type, assert each name resolves and that no two resolve to the *same*
  param, and both wiring mistakes fall out. All eleven types pass today.
- **Gate a test tone with ramps.** A `setValueAtTime` step is a click, a click
  is broadband, and broadband lands in all three bands of the smear at once —
  which made the arrival times meaningless until the burst was ramped.

Knobs are pointer-drag controls; to set one from the console, stub
`Element.prototype.setPointerCapture` to a no-op and dispatch
`pointerdown` / `pointermove` / `pointerup` with a vertical offset. The value
moves by `(dy / 150) * range`.
