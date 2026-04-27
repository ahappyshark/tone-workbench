import { useEffect } from 'react'

interface MidiOptions {
  onNoteOn: (midi: number, velocity: number) => void
  onNoteOff: (midi: number) => void
  onControlChange?: (cc: number, value: number) => void
}

export function useMidi({ onNoteOn, onNoteOff, onControlChange }: MidiOptions) {
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API not supported in this browser')
      return
    }

    let inputs: MIDIInput[] = []

    const handleMessage = (e: MIDIMessageEvent) => {
      const [status, data1, data2] = e.data
      const type = status & 0xf0

      switch (type) {
        case 0x90: // note on
          if (data2 > 0) {
            onNoteOn(data1, data2 / 127)
          } else {
            // velocity 0 note on = note off
            onNoteOff(data1)
          }
          break
        case 0x80: // note off
          onNoteOff(data1)
          break
        case 0xb0: // control change
          onControlChange?.(data1, data2 / 127)
          break
      }
    }

    navigator.requestMIDIAccess().then(midi => {
      midi.inputs.forEach(input => {
        input.addEventListener('midimessage', handleMessage as EventListener)
        inputs.push(input)
      })

      // handle devices plugged in after load
      midi.onstatechange = (e) => {
        const port = e.port
        if (port.type === 'input' && port.state === 'connected') {
          port.addEventListener('midimessage', handleMessage as EventListener)
          inputs.push(port as MIDIInput)
        }
      }
    }).catch(err => {
      console.warn('MIDI access denied:', err)
    })

    return () => {
      inputs.forEach(input => {
        input.removeEventListener('midimessage', handleMessage as EventListener)
      })
    }
  }, [onNoteOn, onNoteOff, onControlChange])
}
