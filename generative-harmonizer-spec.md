# Generative Harmonizer — Design Spec

Feature for the existing tone workbench (Tone.js). Workbench already has: keyboard input hooks, MIDI input hooks, basic building blocks. This spec covers the new generative logic layer only — sound design (synth patches, timbre, effects character) is separate follow-up work, not covered here.

## Concept

A rule-based cluster generator that either plays autonomously or reacts to live input (keyboard/MIDI), choosing the next "cluster" of notes based on musical compatibility with whatever the "current" cluster is — generated or user-played.

## Core idea: root-omitted stacked-third clusters

Given a key/mode, build clusters from diatonic 7th chords with the root dropped (e.g. in C major, E-G-B-D = Cmaj9 minus root). These are inherently ambiguous/reharmonizable — not committed to one chord's gravity — which is what makes them sound good over shifting harmony. Auto-generate the cluster pool this way from the chosen key; also allow manual cluster entry.

## Components

1. **Key/scale module** — user picks root + mode. Use Tonal.js to derive the diatonic chord pool for that key.
2. **Cluster library** — data objects: `{ notes, register, density }`. Auto-built from the diatonic pool (stacked-third, root omitted) + manually added clusters.
3. **Compatibility engine** — precompute a pairwise common-tone matrix across the cluster pool. Also computable on the fly against live-played input (treat played notes as an ad hoc "current cluster").
4. **Rule engine** — filters/weights candidate next-clusters using:
   - common-tone threshold vs. current cluster (core rule)
   - recency exclusion (don't repeat last N clusters)
   - register/interval distance (optional)
   - density delta (optional — e.g. dense → sparse phrasing)
   - **certainty knob**: 0 = always pick top-ranked candidate (deterministic), 1 = uniform random among all rule-passing candidates, in between = weighted random (softmax over compatibility scores). Expose as a single user-facing slider.
5. **Trigger clock** — `Tone.Loop` fires cluster selection + playback on a settable subdivision/tempo.
6. **Voice layer** — per-cluster `Tone.PolySynth` + its own `Tone.FeedbackDelay` instance (not shared), so a new cluster doesn't cut off the previous one's tail. Delay feedback/decay stays "open" until the next trigger, per-cluster.
7. **Input listener** — existing keyboard/MIDI hooks feed "what the user just played" into the compatibility engine as the new current node, so the system can respond to live playing instead of only generating autonomously.

## User-facing controls (MVP)

- Key + mode picker
- Cluster library view/editor (auto-generated + manual add)
- Rule toggles: common-tone threshold, recency window, register limit
- Certainty slider (deterministic ↔ random)
- Tempo/subdivision for trigger clock
- Per-cluster echo/decay setting
- Play (autonomous) vs. respond-to-input mode

## Explicitly out of scope for this pass

- Synth patch/timbre design
- Effects chain character beyond the per-cluster feedback delay
- Any UI polish beyond functional controls
