# Sandbox

Parked experiments from before the synth engine existed — each one was a probe
at a different Tone.js feature, not a component the app uses. Kept for
reference because several contain working solutions worth harvesting:

| file | what it proved |
|---|---|
| `XYPatch.tsx` | FM, AM and pulse-width oscillator configs, switchable |
| `GrainPatch.tsx` | `Tone.GrainPlayer` with file loading and a reverb send |
| `ArpPatch.tsx` | `Tone.Transport`-scheduled arpeggiation |
| `SequencerPatch.tsx` | step sequencing against the transport |
| `PolyPatch.tsx`, `SynthPatch.tsx`, `SynthTestPatch.tsx` | early polyphony and voice probes |
| `XYController.tsx`, `Slider.tsx` | controls only these patches used |

Nothing here is rendered, imported by the app, typechecked, or linted —
`src/sandbox` is excluded in `tsconfig.app.json` and `eslint.config.js`. Expect
it to be stale; treat it as notes rather than working code.
