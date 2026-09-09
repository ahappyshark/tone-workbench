# Grain Lab — architecture

A second instrument in the same workbench, not a mode of the shark synth.
Written after the fact, because the design changed twice while it was being
built and the reasons are worth keeping.

---

## Why not `Tone.GrainPlayer`

`GrainPatch` in the sandbox used it, and it can't do this job. Its read
position is computed as `tickCount * grainSize` — position is a pure function
of elapsed time. That rules out, by construction:

- **freezing**, or any position control at all beyond a loop region
- **scanning** at a rate independent of pitch
- **spray**, or any per-grain position jitter
- **reverse** grains
- **density** as a control separate from grain size — it fires exactly one
  grain per tick and calls the crossfade "overlap"

Every one of those is the reason to reach for granular synthesis, so the
scheduler is ours. It is about a hundred and fifty lines, and `GrainVoice` is
otherwise shaped exactly like `Voice`.

---

## Signal flow

```
        ┌───────────── one cloud (× 6 in the pool) ──────────────┐
 note ─▶│  grain ─┐                                              │
        │  grain ─┼─▶ pan fan ─▶ cloud ─▶ filter ─▶ amp ─▶ pan ──┼─▶ voice bus
        │  grain ─┘                          ▲        ▲          │
        │                                 mod env  amp env       │
        └────────────────────────────────────────────────────────┘
                                                                        │
  voice bus ──▶ [ fx slot 0 ──▶ fx slot 1 ──▶ … ] ──▶ masterGain ───────┘
                └── the same FxRack class the synth uses ──┘
```

`FxRack` needed no changes at all to be reused. It was already written as
"an ordered chain of effect slots with modulatable params", knowing nothing
about oscillators, so the grain engine just constructs its own instance.
`fxDestinations` was split out of `modDestinations` so both instruments can
merge the effect half into their own very different destination tables.

---

## Two modulation regimes

The one genuinely new problem, and the one worth reading twice.

The shark synth sums modulation into `AudioParam`s at audio rate. A knob
writes a base signal, routes add on top, and nothing in JavaScript ever needs
to know the total — which is fortunate, because Web Audio offers no way to
read the summed value of a param back out.

Grain parameters cannot work that way. Grain size, density, spray, position
and pitch are read by the **scheduler**, in JavaScript, at the moment each
grain is born. So those destinations are **sampled** instead: every source is
reduced to a number, and the route sums are arithmetic.

Every source can supply one:

| source | how it becomes a number |
|---|---|
| mod envelope | `Envelope.getValueAtTime` |
| velocity, key track | already numbers on the voice |
| mod wheel, random S&H | numbers we set ourselves |
| LFO | a 32-sample `Analyser` tap, read once per scheduler tick |

Params still on the audio path — filter cutoff, resonance, cloud pan, and
everything in the effects chain — keep the existing signal-summing route.
`GRAIN_DESTINATIONS` marks which regime each destination belongs to and
`applyRoutes` sends it to the right one.

**Sampling per grain is not a compromise.** It is what per-grain modulation
*is*: random into position is literally spray. The real limit is the other
end — an LFO faster than the grain rate aliases rather than wobbles, and the
matrix says so under the route list.

The one dead route is the same one the synth has: a per-voice source aimed at
a shared effect param. Sixteen values, one knob, no honest answer. See
OPEN-QUESTIONS #26.

---

## Decisions worth keeping

**Per-grain jitter is knobs, not matrix rows.** Spray, pitch jitter, stereo
spread and reverse odds each roll fresh randomness per grain. The matrix's
`random` source stays a stepped sample-and-hold on its own clock, like the
synth's. Two different kinds of randomness that would otherwise fight over
one control.

**Reverse needs a second buffer.** `AudioBufferSourceNode` refuses a negative
`playbackRate`, so a backwards grain reads a genuinely reversed copy at the
mirrored offset. One extra buffer in memory buys the whole feature.

**Nine panners, not one per grain.** A panner built and torn down per grain is
most of the CPU at high density, and nobody can hear nine positions apart
inside a cloud.

**Grain gain is normalised by overlap.** Density times size is the overlap
count; without dividing by its square root, a density sweep is a volume sweep
and a deep one is a limiter test.

**A hard cap of 48 concurrent grains per voice.** Density and size are both
modulatable, so a badly aimed route can otherwise ask for hundreds. Dropping
grains degrades the texture; not having a cap degrades everything.

**Key tracking at zero is the texture-box setting.** Keys trigger clouds
without transposing them, which is what makes this sound like a Liven rather
than a sampler. The drone switch holds one cloud open with no key at all.

**Starter textures are generated, not shipped.** Additive synthesis at load
time means the instrument makes sound the moment it opens without putting
megabytes of audio in the repo, and they're written to granulate well: slow
evolution, no silence, nothing percussive enough to machine-gun.

---

## The note bus

Two instruments and, shortly, a third source of notes. Wiring each source to
each instrument directly is a grid that grows the wrong way, so the computer
keyboard, MIDI input and (next) the generative harmonizer all meet in
`noteBus`, which fans out to whichever instruments are targeted.

It remembers which instruments each sounding note actually reached. Without
that, retargeting while a key is held sends the note-off to the wrong
instrument and the old one drones until the page reloads.

A module singleton rather than context, for the same reason `patchStore` is:
the harmonizer will be a clock callback, not a component, and it has to play
a note without a render happening first.

---

## Deliberately not doing

- **Per-voice LFOs.** They could not reach a grain param without an analyser
  per voice per LFO, and a cloud already varies per note through spray and
  jitter. `perVoiceLFOs` on the store adapter hides the toggle.
- **Unison.** Spray *is* unison, and cheaper.
- **Resampling the shark synth into the buffer.** Wanted, not built yet.
