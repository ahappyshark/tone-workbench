import { useCallback, useEffect, useRef, useState } from 'react'
import {
    getPatch,
    loadPatch,
    setPatchName,
    usePatchName,
} from '../state/patchStore'
import {
    deletePreset,
    exportPatchFile,
    importPatchFile,
    listPresetNames,
    loadPreset,
    savePreset,
} from '../state/presetStorage'
import { DEFAULT_PATCH } from '../audio/patchTypes'
import { FACTORY_PRESETS, loadFactoryPreset } from '../presets/factory'

const btn: React.CSSProperties = {
    fontSize: 11,
    padding: '4px 10px',
    background: '#333',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: 4,
    cursor: 'pointer',
}

function PresetBar() {
    const name = usePatchName()
    // Read the bank once at mount via a lazy initialiser; every mutation
    // below refreshes it explicitly.
    const [names, setNames] = useState<string[]>(listPresetNames)
    const [status, setStatus] = useState('')
    const fileRef = useRef<HTMLInputElement | null>(null)

    const refresh = useCallback(() => setNames(listPresetNames()), [])

    // Status is transient feedback, not state worth keeping.
    useEffect(() => {
        if (!status) return
        const t = setTimeout(() => setStatus(''), 2500)
        return () => clearTimeout(t)
    }, [status])

    const handleSave = () => {
        const trimmed = name.trim()
        if (!trimmed) {
            setStatus('name the patch first')
            return
        }
        if (savePreset(trimmed, getPatch())) {
            refresh()
            setStatus(`saved "${trimmed}"`)
        } else {
            setStatus('could not write to localStorage')
        }
    }

    // The factory bank is code, not localStorage: it can't be overwritten or
    // deleted, and it always matches the current schema.
    const handleLoadFactory = (preset: string) => {
        if (!preset) return
        const patch = loadFactoryPreset(preset)
        if (!patch) return
        loadPatch(patch)
        setStatus(`loaded "${preset}"`)
    }

    const handleLoad = (preset: string) => {
        if (!preset) return
        const patch = loadPreset(preset)
        if (!patch) {
            setStatus('preset not found')
            refresh()
            return
        }
        loadPatch(patch)
        setStatus(`loaded "${preset}"`)
    }

    const handleDelete = () => {
        const trimmed = name.trim()
        if (!names.includes(trimmed)) {
            setStatus('no saved preset by that name')
            return
        }
        deletePreset(trimmed)
        refresh()
        setStatus(`deleted "${trimmed}"`)
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        // Reset first so re-picking the same file fires change again.
        e.target.value = ''
        if (!file) return
        try {
            loadPatch(await importPatchFile(file))
            setStatus(`imported ${file.name}`)
        } catch {
            setStatus(`${file.name} is not valid JSON`)
        }
    }

    return (
        <div style={{
            border: '1px solid #444',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
        }}>
            <span style={{ fontSize: 11, opacity: 0.5 }}>PRESET</span>

            <select
                value=""
                onChange={e => handleLoadFactory(e.target.value)}
                style={{
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '4px 6px',
                    fontSize: 11,
                }}
            >
                <option value="">— factory —</option>
                {FACTORY_PRESETS.map(p => (
                    <option key={p.name} value={p.name} title={p.blurb}>{p.name}</option>
                ))}
            </select>

            <span style={{ opacity: 0.3 }}>|</span>

            <input
                value={name}
                onChange={e => setPatchName(e.target.value)}
                placeholder="patch name"
                style={{
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '4px 8px',
                    fontSize: 11,
                    width: 150,
                }}
            />

            <button style={btn} onClick={handleSave}>Save</button>

            <select
                value=""
                onChange={e => handleLoad(e.target.value)}
                style={{
                    background: '#222',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '4px 6px',
                    fontSize: 11,
                }}
            >
                <option value="">{names.length ? '— load —' : '— none saved —'}</option>
                {names.map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <button style={btn} onClick={handleDelete}>Delete</button>

            <span style={{ opacity: 0.3 }}>|</span>

            <button style={btn} onClick={() => exportPatchFile(getPatch())}>Export</button>
            <button style={btn} onClick={() => fileRef.current?.click()}>Import</button>
            <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImport}
                style={{ display: 'none' }}
            />

            <button style={btn} onClick={() => loadPatch(structuredClone(DEFAULT_PATCH))}>Init</button>

            {status && <span style={{ fontSize: 10, color: '#00ff88' }}>{status}</span>}
        </div>
    )
}

export default PresetBar
