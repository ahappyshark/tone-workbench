import type { ReactNode } from 'react'
import Knob from './controls/Knob'
import Selector from './controls/Selector'
import TriggerTabs from './controls/TriggerTabs'
import { setParam, useSection } from '../state/patchStore'
import { useSynthEngine } from '../hooks/useSynthEngine'
import { POLYPHONY } from '../audio/synthEngine'
import {
    DEFAULT_PATCH,
    DIVISIONS,
    ENV_RANGES,
    LFO_RATE,
    FILTER_RANGES,
    FILTER_TYPES,
    NOISE_RANGES,
    NOISE_TYPES,
    NOTE_PRIORITIES,
    OSC_MODES,
    OSC_RANGES,
    SUB_RANGES,
    VOICE_MODES,
    VOICE_RANGES,
    WAVES,
    type EnvState,
    type OscState,
} from '../audio/patchTypes'

function Section({ title, children, note }: { title: string, children: ReactNode, note?: string }) {
    return (
        <div style={{
            border: '1px solid #444',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>{title}</span>
                {note && <span style={{ fontSize: 9, opacity: 0.35 }}>{note}</span>}
            </div>
            {children}
        </div>
    )
}

const row: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' }

/** Osc A and B are identical panels over different sections of the patch. */
function OscPanel({ which }: { which: 'oscA' | 'oscB' }) {
    const osc = useSection(which)
    const d = DEFAULT_PATCH[which]
    const set = <K extends keyof OscState>(key: K) => (v: OscState[K]) => setParam(which, key, v)

    return (
        <Section title={which === 'oscA' ? 'OSC A' : 'OSC B'}>
            <Selector options={OSC_MODES} value={osc.mode} onChange={set('mode')} />
            <Selector
                options={WAVES}
                value={osc.wave}
                onChange={set('wave')}
                color={osc.mode === 'pulse' ? '#555' : '#00aaff'}
            />
            <div style={row}>
                <Knob label="Level" min={OSC_RANGES.level.min} max={OSC_RANGES.level.max}
                    value={osc.level} defaultValue={d.level} onChange={set('level')} size={48} />
                <Knob label="Octave" min={OSC_RANGES.octave.min} max={OSC_RANGES.octave.max}
                    value={osc.octave} defaultValue={d.octave} onChange={set('octave')}
                    size={48} step={1} color="#ff8800" />
                <Knob label="Semi" min={OSC_RANGES.semi.min} max={OSC_RANGES.semi.max}
                    value={osc.semi} defaultValue={d.semi} onChange={set('semi')}
                    size={48} step={1} color="#ff8800" />
                <Knob label="Fine" min={OSC_RANGES.fine.min} max={OSC_RANGES.fine.max}
                    value={osc.fine} defaultValue={d.fine} onChange={set('fine')}
                    size={48} precision={1} color="#ffff00" />
            </div>
            {/* Only the params the current mode actually has — OmniOscillator
                throws on the others rather than ignoring them. */}
            <div style={row}>
                {osc.mode === 'fat' && <>
                    <Knob label="Count" min={OSC_RANGES.count.min} max={OSC_RANGES.count.max}
                        value={osc.count} defaultValue={d.count} onChange={set('count')}
                        size={44} step={1} color="#aa44ff" />
                    <Knob label="Spread" min={OSC_RANGES.spread.min} max={OSC_RANGES.spread.max}
                        value={osc.spread} defaultValue={d.spread} onChange={set('spread')}
                        size={44} precision={0} color="#aa44ff" />
                </>}
                {(osc.mode === 'fm' || osc.mode === 'am') &&
                    <Knob label="Harmonic" min={OSC_RANGES.harmonicity.min} max={OSC_RANGES.harmonicity.max}
                        value={osc.harmonicity} defaultValue={d.harmonicity} onChange={set('harmonicity')}
                        size={44} color="#aa44ff" />}
                {osc.mode === 'fm' &&
                    <Knob label="FM Index" min={OSC_RANGES.modulationIndex.min} max={OSC_RANGES.modulationIndex.max}
                        value={osc.modulationIndex} defaultValue={d.modulationIndex} onChange={set('modulationIndex')}
                        size={44} precision={1} color="#aa44ff" />}
                {osc.mode === 'pulse' &&
                    <Knob label="Width" min={OSC_RANGES.width.min} max={OSC_RANGES.width.max}
                        value={osc.width} defaultValue={d.width} onChange={set('width')}
                        size={44} color="#aa44ff" />}
            </div>
        </Section>
    )
}

function EnvPanel({ which, title, color, note, extra }: {
    which: 'ampEnv' | 'modEnv'
    title: string
    color: string
    note?: string
    extra?: ReactNode
}) {
    const env = useSection(which)
    const d = DEFAULT_PATCH[which]
    const set = <K extends keyof EnvState>(key: K) => (v: EnvState[K]) => setParam(which, key, v)
    return (
        <Section title={title} note={note}>
            {extra}
            <div style={row}>
                <Knob label="Attack" min={ENV_RANGES.attack.min} max={ENV_RANGES.attack.max}
                    value={env.attack} defaultValue={d.attack} onChange={set('attack')} size={48} color={color} />
                <Knob label="Decay" min={ENV_RANGES.decay.min} max={ENV_RANGES.decay.max}
                    value={env.decay} defaultValue={d.decay} onChange={set('decay')} size={48} color={color} />
                <Knob label="Sustain" min={ENV_RANGES.sustain.min} max={ENV_RANGES.sustain.max}
                    value={env.sustain} defaultValue={d.sustain} onChange={set('sustain')} size={48} color={color} />
                <Knob label="Release" min={ENV_RANGES.release.min} max={ENV_RANGES.release.max}
                    value={env.release} defaultValue={d.release} onChange={set('release')} size={48} color={color} />
            </div>
        </Section>
    )
}

/**
 * How the mod envelope repeats. `free` and `sync` re-fire the attack on a
 * clock while a note is held, which turns the ADSR into a looping shape — an
 * LFO whose waveform you drew with four knobs.
 */
function ModEnvTrigger() {
    const modEnv = useSection('modEnv')
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TriggerTabs
                value={modEnv.trigger}
                onChange={t => setParam('modEnv', 'trigger', t)}
                titles={{
                    free: 'One shot per note, then loops at its own rate while held',
                    key: 'One shot per note — an ordinary envelope',
                    sync: 'Loops on a division of the transport while a note is held',
                }}
            />
            {modEnv.trigger === 'free' && (
                <Knob label="Loop" min={LFO_RATE.min} max={LFO_RATE.max} value={modEnv.rate}
                    defaultValue={DEFAULT_PATCH.modEnv.rate}
                    onChange={v => setParam('modEnv', 'rate', v)} size={40} color="#aa44ff" />
            )}
            {modEnv.trigger === 'sync' && (
                <Selector options={DIVISIONS} value={modEnv.division}
                    onChange={d => setParam('modEnv', 'division', d)} color="#00aaff" />
            )}
        </div>
    )
}

function SynthPanel() {
    const keyboardOctave = useSynthEngine()

    const sub = useSection('sub')
    const noise = useSection('noise')
    const filter = useSection('filter')
    const voice = useSection('voice')
    const d = DEFAULT_PATCH

    // Unison consumes polyphony — say so rather than letting it be a mystery.
    const notes = voice.mode === 'poly' ? Math.floor(POLYPHONY / voice.unison) : 1
    // A–K plays C4–C5 at shift 0; Z and X move it.
    const lowKey = 60 + keyboardOctave * 12
    const octaveName = (midi: number) => `C${Math.floor(midi / 12) - 1}`

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: '12px 0' }}>Shark Synth</h3>
                <span style={{ fontSize: 10, opacity: 0.4 }}>
                    keys A–K play {octaveName(lowKey)}–{octaveName(lowKey + 12)} · Z / X shift octave
                    {keyboardOctave !== 0 && ` (${keyboardOctave > 0 ? '+' : ''}${keyboardOctave})`}
                </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <OscPanel which="oscA" />
                <OscPanel which="oscB" />

                <Section title="SUB / NOISE">
                    <Selector options={WAVES} value={sub.wave} onChange={v => setParam('sub', 'wave', v)} color="#00aaff" />
                    <div style={row}>
                        <Knob label="Sub Lvl" min={SUB_RANGES.level.min} max={SUB_RANGES.level.max}
                            value={sub.level} defaultValue={d.sub.level} onChange={v => setParam('sub', 'level', v)} size={48} />
                        <Knob label="Sub Oct" min={SUB_RANGES.octave.min} max={SUB_RANGES.octave.max}
                            value={sub.octave} defaultValue={d.sub.octave} onChange={v => setParam('sub', 'octave', v)}
                            size={48} step={1} color="#ff8800" />
                    </div>
                    <Selector options={NOISE_TYPES} value={noise.type} onChange={v => setParam('noise', 'type', v)} color="#888" />
                    <Knob label="Noise Lvl" min={NOISE_RANGES.level.min} max={NOISE_RANGES.level.max}
                        value={noise.level} defaultValue={d.noise.level} onChange={v => setParam('noise', 'level', v)} size={48} color="#888" />
                </Section>

                <Section title="FILTER">
                    <Selector options={FILTER_TYPES} value={filter.type} onChange={v => setParam('filter', 'type', v)} color="#00aaff" />
                    <div style={row}>
                        <Knob label="Cutoff" min={FILTER_RANGES.cutoff.min} max={FILTER_RANGES.cutoff.max}
                            value={filter.cutoff} defaultValue={d.filter.cutoff} onChange={v => setParam('filter', 'cutoff', v)}
                            size={48} precision={0} color="#00aaff" />
                        <Knob label="Reso" min={FILTER_RANGES.resonance.min} max={FILTER_RANGES.resonance.max}
                            value={filter.resonance} defaultValue={d.filter.resonance} onChange={v => setParam('filter', 'resonance', v)}
                            size={48} color="#ff4488" />
                        <Knob label="Env Amt" min={FILTER_RANGES.envAmount.min} max={FILTER_RANGES.envAmount.max}
                            value={filter.envAmount} defaultValue={d.filter.envAmount} onChange={v => setParam('filter', 'envAmount', v)}
                            size={48} precision={0} color="#aa44ff" />
                        <Knob label="Key Trk" min={FILTER_RANGES.keyTrack.min} max={FILTER_RANGES.keyTrack.max}
                            value={filter.keyTrack} defaultValue={d.filter.keyTrack} onChange={v => setParam('filter', 'keyTrack', v)}
                            size={48} color="#ffff00" />
                    </div>
                </Section>

                <EnvPanel which="ampEnv" title="AMP ENV" color="#00ff88" />
                <EnvPanel
                    which="modEnv"
                    title="MOD ENV"
                    color="#aa44ff"
                    note="filter env amt + matrix"
                    extra={<ModEnvTrigger />}
                />

                <Section title="VOICE" note={`${notes} note${notes === 1 ? '' : 's'} of ${POLYPHONY}`}>
                    <Selector options={VOICE_MODES} value={voice.mode} onChange={v => setParam('voice', 'mode', v)} />
                    {/* Priority and glide only mean anything with one voice
                        chasing several keys, so don't offer them in poly. */}
                    {voice.mode !== 'poly' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, opacity: 0.4 }}>priority</span>
                            <Selector options={NOTE_PRIORITIES} value={voice.priority}
                                onChange={v => setParam('voice', 'priority', v)} color="#ffff00" />
                        </div>
                    )}
                    <div style={row}>
                        <Knob label="Unison" min={VOICE_RANGES.unison.min} max={VOICE_RANGES.unison.max}
                            value={voice.unison} defaultValue={d.voice.unison} onChange={v => setParam('voice', 'unison', v)}
                            size={48} step={1} color="#aa44ff" />
                        <Knob label="Detune" min={VOICE_RANGES.detune.min} max={VOICE_RANGES.detune.max}
                            value={voice.detune} defaultValue={d.voice.detune} onChange={v => setParam('voice', 'detune', v)}
                            size={48} precision={1} color="#ffff00" />
                        <Knob label="Spread" min={VOICE_RANGES.spread.min} max={VOICE_RANGES.spread.max}
                            value={voice.spread} defaultValue={d.voice.spread} onChange={v => setParam('voice', 'spread', v)}
                            size={48} color="#00aaff" />
                        <Knob label="Glide" min={VOICE_RANGES.glide.min} max={VOICE_RANGES.glide.max}
                            value={voice.glide} defaultValue={d.voice.glide} onChange={v => setParam('voice', 'glide', v)}
                            size={48} color="#ff8800" />
                        <Knob label="Bend Rng" min={VOICE_RANGES.bendRange.min} max={VOICE_RANGES.bendRange.max}
                            value={voice.bendRange} defaultValue={d.voice.bendRange}
                            onChange={v => setParam('voice', 'bendRange', v)}
                            size={48} step={1} color="#00aaff" />
                    </div>
                    {voice.mode === 'poly' && voice.glide > 0 && (
                        <span style={{ fontSize: 9, opacity: 0.35 }}>
                            glide only applies in mono and legato
                        </span>
                    )}
                </Section>
            </div>
        </div>
    )
}

export default SynthPanel
