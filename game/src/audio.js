// Synthesised sound for GHOST SHIFT: every effect is a small WebAudio
// patch, so the game ships no audio files and makes no network request.
// The context is created lazily on the first user gesture; until then the
// game is silent rather than throwing.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') void context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, duration, type, gainValue, slideTo = 0, delay = 0) {
    if (!ensure() || muted) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (slideTo > 0) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(gainValue, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  function noiseBurst(duration, gainValue, lowpass) {
    if (!ensure() || muted) return;
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
  }

  return {
    /** Call from any user gesture so later sounds are allowed to play. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** A soft footstep; volume scales with distance (1 = at the player). */
    step(volume) {
      noiseBurst(0.07, 0.1 * volume, 500);
    },
    /** A guard's footstep, heard across the hall: louder means closer. */
    guardStep(volume) {
      noiseBurst(0.09, 0.16 * volume, 320);
    },
    pickup() {
      tone(880, 0.12, 'sine', 0.22);
      tone(1318, 0.18, 'sine', 0.2, 0, 0.09);
    },
    coin() {
      tone(2093, 0.1, 'triangle', 0.16);
      tone(1568, 0.14, 'triangle', 0.12, 0, 0.06);
    },
    coinLand() {
      tone(1244, 0.08, 'triangle', 0.14);
      tone(932, 0.12, 'triangle', 0.1, 0, 0.05);
    },
    noticed() {
      tone(392, 0.14, 'square', 0.08);
    },
    alert() {
      tone(220, 0.35, 'sawtooth', 0.14, 311);
      tone(233, 0.35, 'sawtooth', 0.12, 330, 0.02);
    },
    caught() {
      tone(196, 0.5, 'sawtooth', 0.18, 55);
      noiseBurst(0.25, 0.2, 240);
    },
    door() {
      tone(523, 0.3, 'sine', 0.14, 1046);
    },
    levelClear() {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.22, 'sine', 0.18, 0, i * 0.11));
    },
    victory() {
      [523, 659, 784, 1046, 1318, 1568].forEach((freq, i) => tone(freq, 0.3, 'sine', 0.16, 0, i * 0.13));
    },
  };
}
