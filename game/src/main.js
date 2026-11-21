// Boot and the one loop for GHOST SHIFT: input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what is
// there. The game moves between six screens: title, play, paused, level
// clear, caught / game over, and victory.
//
// ?seed=N fixes the level's decoration. ?shot=cover|patrol|alert|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP, MAX_FRAME, VIEW_W, VIEW_H } from './config.js';
import { createWorld, stepWorld, restartLevel, nextLevel } from './world.js';
import { EVENT_CAUGHT, EVENT_LEVEL_DONE } from './world.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_THROW, ACTION_RESTART,
  ACTION_MUTE, ACTION_MARK, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED,
  SCREEN_LEVEL, SCREEN_OVER, SCREEN_WIN, ratingFor, formatTime,
} from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

let world = createWorld(seed, 0);
let screen = SCREEN_TITLE;
let lastLevel = null;
let ratings = [];
let totalTime = 0;
let muted = false;
// Discrete intents drained once per frame by handleActions and handed to
// the next fixed step (a coin throw, a guard to mark).
let pendingThrow = null;
let pendingMark = null;

function readBest() {
  try {
    const value = Number.parseFloat(window.localStorage.getItem(BEST_KEY) ?? '');
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

let best = readBest();

function ui() {
  return {
    muted,
    best: best ? formatTime(best) : null,
    lastLevel,
    ratings,
    totalTime,
  };
}

function announce(message) {
  status.textContent = message;
}

function startRun() {
  world = createWorld(Math.floor(Math.random() * 4294967296), 0);
  ratings = [];
  lastLevel = null;
  totalTime = 0;
  screen = SCREEN_PLAY;
  announce('Playing. Steal 3 files, then reach the exit unseen.');
}

function runShot(name) {
  const staged = stageShot(name, seed);
  world = staged.world;
  screen = staged.screen;
  lastLevel = staged.lastLevel;
  if (lastLevel) {
    ratings = [{ name: world.state.level.name, time: lastLevel.time, rating: lastLevel.rating }];
  }
  let painted = 0;
  function paint() {
    renderer.draw(world.state, screen, ui());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
    }
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_MARK)) {
        audio.unlock();
        startRun();
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        return;
      }
      if (actions & ACTION_THROW) pendingThrow = input.mouse();
      if (actions & ACTION_MARK && input.takeClick()) pendingMark = input.mouse();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) {
        restartLevel(world);
        screen = SCREEN_PLAY;
        announce('Level restarted.');
      }
      return;
    }
    if (screen === SCREEN_LEVEL) {
      if (actions & ACTION_CONFIRM) {
        nextLevel(world);
        screen = SCREEN_PLAY;
        announce(`Level ${world.state.levelIndex + 1}: ${world.state.level.name}.`);
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_RESTART) {
        if (world.state.lives > 0) {
          restartLevel(world);
        } else {
          startRun();
          return;
        }
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_WIN) {
      if (actions & ACTION_RESTART) {
        startRun();
      }
    }
  }

  function step() {
    const direction = input.direction();
    const stepInput = {
      dx: direction.x,
      dy: direction.y,
      sneaking: input.sneaking(),
      throwAt: pendingThrow,
      markAt: pendingMark,
    };
    pendingThrow = null;
    pendingMark = null;
    const events = stepWorld(world, STEP, stepInput, audio);
    if (events & EVENT_CAUGHT) {
      world.state.lives -= 1;
      screen = SCREEN_OVER;
      announce(world.state.lives > 0
        ? `Caught. ${world.state.lives} ${world.state.lives === 1 ? 'life' : 'lives'} left.`
        : 'Caught. No lives left.');
      return;
    }
    if (events & EVENT_LEVEL_DONE) {
      lastLevel = {
        time: world.state.time,
        alerts: world.state.alerts,
        rating: ratingFor(world.state.alerts),
      };
      ratings.push({ name: world.state.level.name, time: lastLevel.time, rating: lastLevel.rating });
      audio.levelClear();
      if (world.state.levelIndex + 1 >= 3) {
        totalTime = world.state.runTime;
        if (best === null || totalTime < best) {
          best = totalTime;
          saveBest(best);
        }
        audio.victory();
        screen = SCREEN_WIN;
        announce(`All files recovered in ${formatTime(totalTime)}.`);
      } else {
        screen = SCREEN_LEVEL;
        announce(`Level clear. ${lastLevel.rating}. Press Enter for the next level.`);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, ui());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ghost Shift. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// A handle for play-testing: the verify script drives the real game through it.
window.__game = {
  get world() { return world; },
  get state() { return world.state; },
  get screen() { return screen; },
  setScreen(value) { screen = value; },
  startRun,
};

if (shot) runShot(shot);
else runGame();
