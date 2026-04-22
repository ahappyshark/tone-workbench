import * as Tone from 'tone';

const masterGain = new Tone.Gain(0.8)
const limiter = new Tone.Limiter(-6)

masterGain.connect(limiter)
limiter.toDestination()

export { masterGain }