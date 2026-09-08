import { coercePatch, type PatchState } from '../audio/patchTypes'

const STORAGE_KEY = 'tone-workbench.presets.v1'

type PresetBank = Record<string, PatchState>

/**
 * localStorage can throw (private mode, quota, disabled storage) and its
 * contents are user-editable, so every read goes through coercePatch and
 * every access is guarded. A broken bank degrades to "no presets", never
 * to a crash on boot.
 */
function readBank(): PresetBank {
    let raw: string | null = null
    try {
        raw = localStorage.getItem(STORAGE_KEY)
    } catch {
        return {}
    }
    if (!raw) return {}

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return {}
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    const bank: PresetBank = {}
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
        bank[name] = coercePatch(value)
    }
    return bank
}

function writeBank(bank: PresetBank): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bank))
        return true
    } catch {
        return false
    }
}

export function listPresetNames(): string[] {
    return Object.keys(readBank()).sort((a, b) => a.localeCompare(b))
}

export function savePreset(name: string, patch: PatchState): boolean {
    const trimmed = name.trim()
    if (!trimmed) return false
    const bank = readBank()
    bank[trimmed] = { ...patch, name: trimmed }
    return writeBank(bank)
}

export function loadPreset(name: string): PatchState | null {
    const stored = readBank()[name]
    return stored ? coercePatch(stored) : null
}

export function deletePreset(name: string): boolean {
    const bank = readBank()
    if (!(name in bank)) return false
    delete bank[name]
    return writeBank(bank)
}

/* ------------------------------------------------------------------ */
/* File export / import                                                */
/* ------------------------------------------------------------------ */

function safeFilename(name: string): string {
    const cleaned = name.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
    return `${cleaned || 'patch'}.json`
}

/** Download the patch as a .json file so it can be shared or committed. */
export function exportPatchFile(patch: PatchState) {
    const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = safeFilename(patch.name)
    a.click()
    URL.revokeObjectURL(url)
}

/** Parse a user-supplied .json file. Rejects only on unreadable/invalid JSON. */
export async function importPatchFile(file: File): Promise<PatchState> {
    const text = await file.text()
    return coercePatch(JSON.parse(text) as unknown)
}
