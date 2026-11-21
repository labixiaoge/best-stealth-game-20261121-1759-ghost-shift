// Keyboard and mouse input for GHOST SHIFT. The game reads movement every
// frame from the held keys; discrete actions (confirm, pause, throw, mark)
// are queued as a bit mask the main loop drains once per frame, so a quick
// key tap is never lost between frames.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_THROW = 4;
export const ACTION_RESTART = 8;
export const ACTION_MUTE = 16;
export const ACTION_MARK = 32;

const CONFIRM_KEYS = new Set(['Enter', 'Space']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const THROW_KEYS = new Set(['KeyQ']);
const RESTART_KEYS = new Set(['KeyR']);
const MUTE_KEYS = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let mouse = { x: 0, y: 0, inside: false };
  let clicked = false;

  function keyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (CONFIRM_KEYS.has(event.code) || CONFIRM_KEYS.has(event.key)) queued |= ACTION_CONFIRM;
    if (PAUSE_KEYS.has(event.code)) queued |= ACTION_PAUSE;
    if (THROW_KEYS.has(event.code)) queued |= ACTION_THROW;
    if (RESTART_KEYS.has(event.code)) queued |= ACTION_RESTART;
    if (MUTE_KEYS.has(event.code)) queued |= ACTION_MUTE;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function keyUp(event) {
    held.delete(event.code);
  }

  function mouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      inside: true,
    };
  }

  function mouseDown(event) {
    mouseMove(event);
    clicked = true;
    queued |= ACTION_MARK;
    event.preventDefault();
  }

  function blur() {
    held.clear();
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('mousedown', mouseDown);

  return {
    /** Normalised -1..1 movement vector from WASD / arrow keys. */
    direction() {
      let x = 0;
      let y = 0;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.hypot(x, y);
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },
    /** True while either Shift key is held: sneak, slow and quiet. */
    sneaking() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    /** The mouse position in canvas pixels, for coin throws. */
    mouse() {
      return mouse;
    },
    /** True once per click; consumed by takeActions. */
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
    /** Drain the queued discrete actions. */
    takeActions() {
      const actions = queued;
      queued = 0;
      return actions;
    },
  };
}
