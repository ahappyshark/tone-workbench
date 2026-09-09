import { useRef } from 'react'
import Knob from '../controls/Knob'
import Selector from '../controls/Selector'
import TriggerTabs from '../controls/TriggerTabs'
import WaveformView from './WaveformView'
import type { GrainHandle } from '../../hooks/useGrainEngine'
import { setGrainParam, useGrainSection } from '../../state/grainStore'
import {
    DEFAULT_GRAIN_PATCH,
    GRAIN_MODES,
    GRAIN_POLYPHONY,
    GRAIN_RANGES,
    GRAIN_VOICE_RANGES,
} from '../../audio/grainTypes'
import { STARTERS } from '../../audio/grainSource'
import {
    DIVISIONS,
    ENV_RANGES,
    FILTER_RANGES,
    FILTER_TYPES,
    LFO_RATE,
} from '../../audio/patchTypes'

const row: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' }

function Section({ title, hint, children }: {
    title: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div style={{
            border: '1px solid #444', borderRadius: 8, padding: 12,
            display: 'flex', flexDirection: 'column', gap: 10,
        }}>
            <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>{title}</span>
            {children}
            {hint && <span style={{ fontSize: 9, opacity: 0.35 }}>{hint}</span>}
        </div>
    )
}

function SourceBar({ handle }: { handle: GrainHandle }) {
    const fileRef = useRef<HTMLInputElement>(null)

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10,
        }}>
            <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>SOURCE</span>
            <Selector
                options={STARTERS}
                value={(STARTERS as readonly string[]).includes(handle.buffer?.name ?? '')
                    ? (handle.buffer?.name as typeof STARTERS[number])
                    : ('' as typeof STARTERS[number])}
                onChange={name => handle.loadStarterBuffer(name)}
                color="#aa44ff"
            />
            <button onClick={() => fileRef.current?.click()}>Load file…</button>
            <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) void handle.loadFile(file)
                    e.target.value = ''
                }}
            />
            <span style={{ fontSize: 10, opacity: 0.45, fontFamily: 'monospace' }}>
                {handle.loading
                    ? 'decoding…'
                    : handle.buffer
                        ? `${handle.buffer.name} · ${handle.buffer.duration.toFixed(2)}s`
                        : 'nothing loaded'}
            </span>
            {handle.error && <span style={{ fontSize: 10, color: '#ff4444' }}>{handle.error}</span>}
        </div>
    )
}

function GrainPanel({ handle }: { handle: GrainHandle }) {
    const grain = useGrainSection('grain')
    const filter = useGrainSection('filter')
    const ampEnv = useGrainSection('ampEnv')
    const modEnv = useGrainSection('modEnv')
    const voice = useGrainSection('voice')
    const d = DEFAULT_GRAIN_PATCH

    // Overlap is what actually decides whether this sounds like a cloud, a
    // stutter or a sampler, and neither knob says it alone.
    const overlap = grain.density * grain.size
    const texture = overlap < 1
        ? 'sparse — audible gaps between grains'
        : overlap < 4
            ? 'grainy — you can hear the individual grains'
            : 'smooth — grains overlap into a continuous cloud'

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: '12px 0' }}>Grain Lab</h3>
                <span style={{ fontSize: 10, opacity: 0.4 }}>
                    {GRAIN_POLYPHONY} clouds · drag the waveform to scrub position
                </span>
            </div>

            <SourceBar handle={handle} />
            <WaveformView
                buffer={handle.buffer}
                position={grain.position}
                spray={grain.spray}
                readHeads={handle.readHeads}
                onScrub={p => setGrainParam('grain', 'position', p)}
            />

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
                marginTop: 12,
            }}>
                <Section title="SCAN" hint="scan at zero freezes the head; negative crawls backwards">
                    <div style={row}>
                        <Knob label="Position" min={GRAIN_RANGES.position.min} max={GRAIN_RANGES.position.max}
                            value={grain.position} defaultValue={d.grain.position}
                            onChange={v => setGrainParam('grain', 'position', v)} size={54} />
                        <Knob label="Scan" min={GRAIN_RANGES.scan.min} max={GRAIN_RANGES.scan.max}
                            value={grain.scan} defaultValue={d.grain.scan}
                            onChange={v => setGrainParam('grain', 'scan', v)} size={54} color="#ffff00" />
                        <Knob label="Spray" min={GRAIN_RANGES.spray.min} max={GRAIN_RANGES.spray.max}
                            value={grain.spray} defaultValue={d.grain.spray}
                            onChange={v => setGrainParam('grain', 'spray', v)} size={54} color="#aa44ff" />
                    </div>
                </Section>

                <Section title="GRAIN" hint={`overlap ${overlap.toFixed(1)}× — ${texture}`}>
                    <div style={row}>
                        <Knob label="Size" min={GRAIN_RANGES.size.min} max={GRAIN_RANGES.size.max}
                            value={grain.size} defaultValue={d.grain.size} precision={3}
                            onChange={v => setGrainParam('grain', 'size', v)} size={54} color="#00aaff" />
                        <Knob label="Density" min={GRAIN_RANGES.density.min} max={GRAIN_RANGES.density.max}
                            value={grain.density} defaultValue={d.grain.density} precision={1}
                            onChange={v => setGrainParam('grain', 'density', v)} size={54} color="#ff8800" />
                        <Knob label="Shape" min={GRAIN_RANGES.shape.min} max={GRAIN_RANGES.shape.max}
                            value={grain.shape} defaultValue={d.grain.shape}
                            onChange={v => setGrainParam('grain', 'shape', v)} size={54} color="#ff4488" />
                        <Knob label="Reverse" min={GRAIN_RANGES.reverse.min} max={GRAIN_RANGES.reverse.max}
                            value={grain.reverse} defaultValue={d.grain.reverse}
                            onChange={v => setGrainParam('grain', 'reverse', v)} size={54} color="#888" />
                    </div>
                </Section>

                <Section title="PITCH" hint="key track at zero fixes the pitch — keys trigger clouds without transposing them">
                    <div style={row}>
                        <Knob label="Octave" min={GRAIN_RANGES.octave.min} max={GRAIN_RANGES.octave.max}
                            value={grain.octave} defaultValue={d.grain.octave} step={1}
                            onChange={v => setGrainParam('grain', 'octave', v)} size={48} color="#00aaff" />
                        <Knob label="Semi" min={GRAIN_RANGES.semi.min} max={GRAIN_RANGES.semi.max}
                            value={grain.semi} defaultValue={d.grain.semi} step={1}
                            onChange={v => setGrainParam('grain', 'semi', v)} size={48} color="#00aaff" />
                        <Knob label="Fine" min={GRAIN_RANGES.fine.min} max={GRAIN_RANGES.fine.max}
                            value={grain.fine} defaultValue={d.grain.fine}
                            onChange={v => setGrainParam('grain', 'fine', v)} size={48} />
                        <Knob label="Jitter" min={GRAIN_RANGES.jitter.min} max={GRAIN_RANGES.jitter.max}
                            value={grain.jitter} defaultValue={d.grain.jitter} precision={0}
                            onChange={v => setGrainParam('grain', 'jitter', v)} size={48} color="#aa44ff" />
                        <Knob label="Key Trk" min={GRAIN_RANGES.keyTrack.min} max={GRAIN_RANGES.keyTrack.max}
                            value={grain.keyTrack} defaultValue={d.grain.keyTrack}
                            onChange={v => setGrainParam('grain', 'keyTrack', v)} size={48} color="#ff8800" />
                        <Knob label="Spread" min={GRAIN_RANGES.spread.min} max={GRAIN_RANGES.spread.max}
                            value={grain.spread} defaultValue={d.grain.spread}
                            onChange={v => setGrainParam('grain', 'spread', v)} size={48} color="#44ffaa" />
                    </div>
                </Section>

                <Section title="FILTER">
                    <Selector options={FILTER_TYPES} value={filter.type}
                        onChange={v => setGrainParam('filter', 'type', v)} color="#ff8800" />
                    <div style={row}>
                        <Knob label="Cutoff" min={FILTER_RANGES.cutoff.min} max={FILTER_RANGES.cutoff.max}
                            value={filter.cutoff} defaultValue={d.filter.cutoff} precision={0}
                            onChange={v => setGrainParam('filter', 'cutoff', v)} size={48} color="#ff8800" />
                        <Knob label="Reso" min={FILTER_RANGES.resonance.min} max={FILTER_RANGES.resonance.max}
                            value={filter.resonance} defaultValue={d.filter.resonance}
                            onChange={v => setGrainParam('filter', 'resonance', v)} size={48} color="#ff8800" />
                        <Knob label="Env Amt" min={FILTER_RANGES.envAmount.min} max={FILTER_RANGES.envAmount.max}
                            value={filter.envAmount} defaultValue={d.filter.envAmount} precision={0}
                            onChange={v => setGrainParam('filter', 'envAmount', v)} size={48} color="#aa44ff" />
                        <Knob label="Key Trk" min={FILTER_RANGES.keyTrack.min} max={FILTER_RANGES.keyTrack.max}
                            value={filter.keyTrack} defaultValue={d.filter.keyTrack}
                            onChange={v => setGrainParam('filter', 'keyTrack', v)} size={48} />
                    </div>
                </Section>

                <Section title="AMP ENVELOPE" hint="slow by default — a cloud with a fast attack is a sampler">
                    <div style={row}>
                        {(['attack', 'decay', 'sustain', 'release'] as const).map(key => (
                            <Knob key={key} label={key[0].toUpperCase() + key.slice(1)}
                                min={ENV_RANGES[key].min} max={ENV_RANGES[key].max}
                                value={ampEnv[key]} defaultValue={d.ampEnv[key]}
                                onChange={v => setGrainParam('ampEnv', key, v)} size={48} />
                        ))}
                    </div>
                </Section>

                <Section title="MOD ENVELOPE" hint="free or sync loops the attack while a note is held">
                    <div style={row}>
                        {(['attack', 'decay', 'sustain', 'release'] as const).map(key => (
                            <Knob key={key} label={key[0].toUpperCase() + key.slice(1)}
                                min={ENV_RANGES[key].min} max={ENV_RANGES[key].max}
                                value={modEnv[key]} defaultValue={d.modEnv[key]}
                                onChange={v => setGrainParam('modEnv', key, v)} size={48} color="#aa44ff" />
                        ))}
                    </div>
                    <TriggerTabs
                        value={modEnv.trigger}
                        onChange={t => setGrainParam('modEnv', 'trigger', t)}
                        titles={{
                            free: 'One shot per note, then loops on its own clock',
                            key: 'One shot per note',
                            sync: 'Loops on a division of the transport',
                        }}
                    />
                    {modEnv.trigger === 'free' && (
                        <Knob label="Loop Rate" min={LFO_RATE.min} max={LFO_RATE.max} value={modEnv.rate}
                            defaultValue={d.modEnv.rate} onChange={v => setGrainParam('modEnv', 'rate', v)}
                            size={44} color="#aa44ff" />
                    )}
                    {modEnv.trigger === 'sync' && (
                        <Selector options={DIVISIONS} value={modEnv.division}
                            onChange={v => setGrainParam('modEnv', 'division', v)} color="#00aaff" />
                    )}
                </Section>

                <Section title="VOICE" hint="drone holds one cloud open with no key down">
                    <Selector options={GRAIN_MODES} value={voice.mode}
                        onChange={v => setGrainParam('voice', 'mode', v)} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setGrainParam('voice', 'drone', !voice.drone)}
                            style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 3, border: 'none',
                                cursor: 'pointer',
                                background: voice.drone ? '#00ff88' : '#333',
                                color: voice.drone ? '#000' : '#fff',
                            }}
                        >drone</button>
                        <Knob label="Bend" min={GRAIN_VOICE_RANGES.bendRange.min} max={GRAIN_VOICE_RANGES.bendRange.max}
                            value={voice.bendRange} defaultValue={d.voice.bendRange} step={1}
                            onChange={v => setGrainParam('voice', 'bendRange', v)} size={44} color="#00aaff" />
                    </div>
                </Section>
            </div>
        </div>
    )
}

export default GrainPanel
