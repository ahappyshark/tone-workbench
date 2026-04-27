import { useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { masterGain } from '../../audio/master'
import Knob from '../controls/Knob'

function GrainPatch() {
  const playerRef = useRef<Tone.GrainPlayer | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  const [params, setParams] = useState({
    grainSize: 0.2,
    overlap: 0.1,
    playbackRate: 1,
    detune: 0,
    loopStart: 0,
    loopEnd: 1,
    wet: 0.5
  })

  const reverbRef = useRef<Tone.Reverb | null>(null)

  useEffect(() => {
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.5 })
    reverb.connect(masterGain)
    reverbRef.current = reverb
    return () => {
      reverb.dispose()
    }
  }, [])

  useEffect(() => {
    if (!fileUrl) return

    playerRef.current?.dispose()
    setLoaded(false)

    const player = new Tone.GrainPlayer({
      url: fileUrl,
      loop: true,
      grainSize: params.grainSize,
      overlap: params.overlap,
      playbackRate: params.playbackRate,
      detune: params.detune,
      loopStart: params.loopStart,
      loopEnd: params.loopEnd,
      onload: () => setLoaded(true)
    })

    player.connect(reverbRef.current!)
    playerRef.current = player

    return () => {
      player.dispose()
    }
  }, [fileUrl])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setFileUrl(url)
    setPlaying(false)
  }

  const togglePlay = () => {
    if (!playerRef.current || !loaded) return
    if (playing) {
      playerRef.current.stop()
      setPlaying(false)
    } else {
      playerRef.current.start()
      setPlaying(true)
    }
  }

  const handleParam = (key: keyof typeof params) => (value: number) => {
    setParams(prev => {
      const next = { ...prev, [key]: value }
      if (!playerRef.current) return next
      switch (key) {
        case 'grainSize': playerRef.current.grainSize = value; break
        case 'overlap': playerRef.current.overlap = value; break
        case 'playbackRate': playerRef.current.playbackRate = value; break
        case 'detune': playerRef.current.detune = value; break
        case 'loopStart': playerRef.current.loopStart = value; break
        case 'loopEnd': playerRef.current.loopEnd = value; break
        case 'wet':
          if (reverbRef.current) reverbRef.current.wet.value = value
          break
      }
      return next
    })
  }

  return (
    <div>
      <h3>Grain Player</h3>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="file" accept="audio/*" onChange={handleFile} />
        <button onClick={togglePlay} disabled={!loaded}>
          {playing ? 'Stop' : 'Play'}
        </button>
        {fileUrl && !loaded && <span style={{ fontSize: 11, opacity: 0.5 }}>Loading...</span>}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>GRANULAR</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Knob label="Grain Size" min={0.01} max={1} value={params.grainSize} onChange={handleParam('grainSize')} />
            <Knob label="Overlap" min={0.01} max={0.5} value={params.overlap} onChange={handleParam('overlap')} color="#ff8800" />
            <Knob label="Playback" min={0.001} max={2} value={params.playbackRate} onChange={handleParam('playbackRate')} color="#ffff00" />
          </div>
        </div>

        <div>
          <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>PITCH</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Knob label="Detune" min={-1200} max={1200} value={params.detune} onChange={handleParam('detune')} color="#00aaff" />
          </div>
        </div>

        <div>
          <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>LOOP REGION</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Knob label="Loop Start" min={0} max={1} value={params.loopStart} onChange={handleParam('loopStart')} color="#ff4488" />
            <Knob label="Loop End" min={0} max={1} value={params.loopEnd} onChange={handleParam('loopEnd')} color="#aa44ff" />
          </div>
        </div>

        <div>
          <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>FX</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Knob label="Reverb" min={0} max={1} value={params.wet} onChange={handleParam('wet')} color="#44ffaa" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default GrainPatch
