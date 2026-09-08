# Shark Synth — architecture

Plan for growing `PolySynth` from "one oscillator and an ADSR" into a real
instrument. Written before the code so the trade-offs are arguable rather than
implied.

---

## The goal, and what it implies

Breadth first: build the full skeleton with modest versions of everything, hear
it, then specialise. The stated end state is **two bespoke variants** — one
ambient/generative, one aggressive.

That second part is the load-bearing requirement, and it rules out the obvious
approach.

**The variants must not be forks of the code.** Two synth engines means every
fix lands twice, they drift within a month, and the "finish something" project
becomes two unfinished things. The variants should be **data**: a preset pack,
plus per-module enable flags, on top of one engine.

This is exactly what the preset layer already bought us. `PatchState` is the
instrument's description; `Shark Ambient` and `Shark Aggro` are two JSON files.
If a variant ever genuinely needs a module the other can't use, it becomes an
optional module in the one engine — not a second engine.

Concretely, that means one rule for everything below: **if a variant would want
it different, it belongs in `PatchState`, not in the code.**

---

## Signal flow

```
                ┌──────────────── one voice (× N in the pool) ─────────────────┐
  note on ─────▶│                                                             │
                │   osc A ──┐                                                 │
                │   osc B ──┼──▶ mix ──▶ filter ──▶ VCA ──────────────────────┼──▶ voice bus
                │   sub   ──┤              ▲         ▲                        │
                │   noise ──┘              │         │                        │
                │                      mod env    amp env                     │
                └─────────────────────────────────────────────────────────────┘
                                                                                    │
   voice bus ──▶ drive ──▶ chorus ──▶ delay ──▶ reverb ──▶ masterGain ──▶ limiter ──┘
                 └───────────── effects chain (patch state) ─────────┘  └ master (not patch state)
```

Voices sum into one bus; effects are global, not per-voice. That is both
cheaper and how most polysynths actually work — per-voice reverb is a niche
want and eight reverbs will melt the audio thread.

---

## Voice pool

A fixed array of `N` voices (default 8), each owning its own node graph, built
once at load and never rebuilt. Note-on grabs one; note-off releases it.

```ts
class Voice {
  readonly oscA: Tone.OmniOscillator<any>
  readonly oscB: Tone.OmniOscillator<any>
  readonly sub: Tone.Oscillator
  readonly noise: Tone.Noise
  readonly filter: Tone.Filter
  readonly amp: Tone.AmplitudeEnvelope   // -> VCA
  readonly modEnv: Tone.Envelope         // -> mod matrix source

  note: number | null
  startedAt: number      // for stealing
  releasing: boolean
}
```

**Allocation.** Note-on: first idle voice, else the oldest *releasing* voice,
else the oldest held voice. Note-off: `triggerRelease`, mark releasing, keep it
claimable. A `Map<number, Voice>` tracks note → voice so note-off finds its
voice in O(1) and repeated note-on of the same pitch retriggers rather than
stacking.

**Why this and not `Tone.PolySynth`.** PolySynth allocates internally and hands
you a `.set()` on the whole pool. It cannot do per-voice modulation, per-voice
unison detune, or velocity routed anywhere except amplitude — because you never
get a handle on a voice. Owning the pool is ~150 lines and it is the thing that
unlocks the rest of this document.

**Nodes are never recreated.** Changing oscillator type mutates
`osc.type`; changing voice count is the only operation that rebuilds, and it
rebuilds the whole pool. Allocating audio nodes during playback is how you get
clicks.

---

## Oscillators: `OmniOscillator` does the heavy lifting

`Tone.OmniOscillator` aggregates six oscillator classes behind one switchable
`type` string:

| type | gives you |
|---|---|
| `sine` `square` `triangle` `sawtooth` | the basics |
| `fatsawtooth`, `fatsquare`, … | **unison** — `count` copies, `spread` cents apart |
| `fmsine`, `fmsquare`, … | **FM** — `harmonicity`, `modulationIndex` |
| `amsine`, `amsquare`, … | **AM** — `harmonicity` |
| `pulse` | `width` — and PWM if you modulate it |
| `pwm` | `modulationFrequency` |

So a single node per oscillator slot covers FM, AM, unison and pulse width.
`XYPatch` already proved the FM and pulse-width configs work; this folds them
into the main instrument instead of a parked sandbox.

**Caveat that will bite:** type-specific params *throw* when the oscillator
isn't currently that type — setting `modulationIndex` on a `sawtooth` is an
error, not a no-op. So `PatchState` stores every osc param regardless of type,
and the apply layer writes only the ones valid for the current type. One
`OSC_PARAMS_BY_TYPE` table, checked before every `set`.

---

## Modulation matrix

This replaces the LFO target dropdown, and it resolves **OPEN-QUESTIONS #1**.

```
  sources                        depth              destinations
   LFO 1..n      ──┐                             ┌── oscA.detune    (cents)
   mod env       ──┤        ┌─────────┐          ├── oscB.detune    (cents)
   velocity      ──┼───────▶│ Gain(d) │─────────▶├── filter.detune  (cents)
   key tracking  ──┤        └─────────┘          ├── filter.Q
   mod wheel     ──┤      signed, bipolar        ├── osc width / modulationIndex
   S&H / random  ──┘                             └── fx send levels
```

A route is `{ source, destination, depth }`. Wiring is one `Tone.Gain` per
route: `source → Gain(depth) → destinationParam`. Negative gain gives inversion
for free.

**Depth is bipolar, and that settles the additive question.** Web Audio *sums*
a connected signal into a param's base value — that is the platform's native
behaviour, and a mod matrix is the thing that makes it read correctly instead
of confusingly. The knob sets the centre; modulation moves around it. Sources
are normalised to −1..1 and each destination declares how much depth `1.0`
means in its own units. So OPEN-QUESTIONS #1 resolves to option **(b)**, not by
argument but because the matrix makes any other answer awkward.

### Modulate `detune`, not `frequency`

Both `Tone.Filter` and `Tone.Oscillator` expose `detune` as a `Signal<"cents">`
alongside `frequency`. This matters more than it looks:

- `frequency` is **linear in Hz**. An LFO of ±2000Hz on a 200Hz cutoff is a
  four-octave lurch upward and a hard clamp at the bottom. Same LFO on a 5kHz
  cutoff is barely audible. Modulation depth that changes meaning depending on
  where the knob sits is unusable.
- `detune` is **exponential**, in cents. 1200 cents is one octave, everywhere.
  ±1200 sounds like the same sweep whether the cutoff is at 200Hz or 8kHz.

So every pitch and cutoff modulation destination routes to `detune`. The knob
still stores Hz (which keeps saved presets valid — see OPEN-QUESTIONS #4); only
the modulation path is exponential. This also fixes half of the linear-taper
complaint in OPEN-QUESTIONS #10 for free.

### Per-voice vs global sources

Envelopes, velocity and key tracking are inherently per-voice. LFOs get a
`perVoice: boolean`:

- **global** — one shared LFO node fanning out to every voice's destination
  param through a single depth `Gain`. All notes wobble in lockstep.
- **per-voice** — one LFO per voice, retriggered on note-on. Each note breathes
  independently. This is the difference between a pad that sounds like a chord
  and one that sounds alive, and it is impossible without the voice pool.

Cost is trivial: 8 voices × 3 LFOs is 24 oscillator nodes.

### What this does to `ParamRegistry`

Today the registry maps an id to a single `Tone.Signal`. With a voice pool a
destination is *N* signals. The registry entry becomes a descriptor:

```ts
interface ModDestination {
  id: string            // 'filter.detune'
  label: string
  unit: 'cents' | 'normal' | 'hz'
  scale: number         // what depth 1.0 means in these units
  params: () => Tone.Param<any>[]   // one per voice, or one global
}
```

Routing connects the depth `Gain` to every param in the fan-out. The existing
`register`/`unregister`/version-subscription machinery survives unchanged —
only the shape of the value changes.

---

## Patch schema growth

`PatchState` goes from nine flat fields to nested groups: `oscA`, `oscB`,
`sub`, `noise`, `filter`, `ampEnv`, `modEnv`, `lfos[]`, `modRoutes[]`, `fx`,
`voice` (count, mode, glide).

This is purely **additive** for existing presets, so `coercePatch()` handles it
without a migration branch: an old two-knob preset loads with defaults for
everything new. The `filterCutoff` / `filterRes` / ADSR fields keep their names
and units and simply move under `filter` and `ampEnv` — which *is* a rename, so
that one needs a `version < 2` branch. Exactly the case OPEN-QUESTIONS #4
flagged.

---

## Build order

Each phase should end with something audible.

| # | Phase | Contains | Rough size |
|---|---|---|---|
| 1 | **Voice pool** | `Voice`, allocator, stealing, 2 osc + sub + noise, filter, amp + mod envelope. Replaces `Tone.PolySynth` entirely. | ~450 lines |
| 2 | **Mod matrix** | Destination descriptors, routes, depth gains, `detune` routing, per-voice LFOs. Retires the LFO target dropdown. | ~300 lines |
| 3 | **Playability** | Unison via `fat*` + `Tone.StereoWidener`, glide, poly/mono/legato, velocity routing. | small |
| 4 | **Effects chain** | Drive/waveshaper, chorus, delay, reverb, wet knobs, as patch state. | ~250 lines |
| 5 | **Variants** | `Shark Ambient` and `Shark Aggro` preset packs. Generative sequencer for the ambient one (`SequencerPatch` and `ArpPatch` are the seed — OPEN-QUESTIONS #8). | data + one module |

Phase 1 is the commitment; everything after is additive.

---

## Deliberately not doing

- **Hard sync.** Web Audio has no oscillator sync. Faking it needs an
  `AudioWorklet` with a hand-written oscillator — a genuinely fun rabbit hole,
  and a separate project from this one.
- **Wavetables.** `setPeriodicWave` could do it, but scanning between tables
  needs crossfading custom waves per voice. Revisit if the aggressive variant
  demands it.
- **Per-voice effects.** See signal flow.
- **Sample playback.** `GrainPatch` already exists as a sandbox; folding
  granular into the voice pool is its own design.
