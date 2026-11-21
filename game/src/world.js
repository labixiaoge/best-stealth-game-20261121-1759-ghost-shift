// The simulation for GHOST SHIFT: one level's tiles, the player, the
// guards and everything that happens between them. The world knows nothing
// about the canvas or the keyboard; main.js feeds it a small input object
// each frame and reads back an event bit mask.
//
// Guard minds, in one paragraph: a guard walks its waypoints and looks
// around at each stop. If you stand inside its vision cone with a clear
// line of sight, its suspicion climbs — faster up close, slower while you
// sneak, slower still in shadow, barely at all inside a bush. Past a
// threshold it stops and stares (?); at full it raises the alarm (!) and
// chases your last seen position. Break sight for a few seconds and it
// searches, then gives up and goes back to its patrol. Running is loud:
// guards nearby come to listen. A thrown coin is louder still.
import {
  TILE, COLS, ROWS, PLAYER_RADIUS, WALK_SPEED, SNEAK_SPEED,
  GUARD_RADIUS, GUARD_PATROL_SPEED, GUARD_CHASE_SPEED,
  GUARD_INVESTIGATE_SPEED, CONE_RANGE, CONE_HALF_ANGLE,
  CATCH_DISTANCE, SUSPICION_ALERT, SUSPICION_NOTICED, SUSPICION_DECAY,
  HIDE_CLOSE_RANGE, RUN_NOISE_RADIUS, RUN_NOISE_INTERVAL,
  COIN_RANGE, COIN_NOISE_RADIUS, COINS_PER_LEVEL, LIVES_PER_RUN,
} from './config.js';
import { LEVELS } from './levels.js';
import { createRandom } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_LEVEL_DONE = 4;
export const EVENT_ALERT = 8;
export const EVENT_NOTICED = 16;
export const EVENT_DOOR = 32;

function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

function angleTo(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

function segmentsCross(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d1 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d2 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
  const d3 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d4 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function segmentHitsRect(x0, y0, x1, y1, rect) {
  if (x0 >= rect.x && x0 <= rect.x + rect.w && y0 >= rect.y && y0 <= rect.y + rect.h) return true;
  if (x1 >= rect.x && x1 <= rect.x + rect.w && y1 >= rect.y && y1 <= rect.y + rect.h) return true;
  const rx = rect.x;
  const ry = rect.y;
  const rw = rect.x + rect.w;
  const rh = rect.y + rect.h;
  return segmentsCross(x0, y0, x1, y1, rx, ry, rw, ry)
    || segmentsCross(x0, y0, x1, y1, rw, ry, rw, rh)
    || segmentsCross(x0, y0, x1, y1, rw, rh, rx, rh)
    || segmentsCross(x0, y0, x1, y1, rx, rh, rx, ry);
}

function circleHitsRect(x, y, radius, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < radius * radius;
}

function moveCircle(entity, dx, dy, blocking, radius) {
  let nx = entity.x + dx;
  for (const rect of blocking) {
    if (circleHitsRect(nx, entity.y, radius, rect)) { nx = entity.x; break; }
  }
  entity.x = nx;
  let ny = entity.y + dy;
  for (const rect of blocking) {
    if (circleHitsRect(entity.x, ny, radius, rect)) { ny = entity.y; break; }
  }
  entity.y = ny;
}

/** Parse one level's tile map into the structures the simulation uses. */
function parseLevel(def) {
  const blocking = [];
  const sightBlocking = [];
  const bushes = [];
  const shadow = new Set();
  const files = [];
  let playerStart = { x: TILE * 1.5, y: TILE * 1.5 };
  let exit = { x: TILE * 30.5, y: TILE * 1.5, open: false };
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const ch = def.map[row][col];
      const rect = { x: col * TILE, y: row * TILE, w: TILE, h: TILE };
      const centre = tileCenter(col, row);
      if (ch === '#' || ch === 'S') {
        blocking.push(rect);
        sightBlocking.push(rect);
      } else if (ch === 'C') {
        blocking.push(rect);
      } else if (ch === 'B') {
        bushes.push({ x: rect.x + 3, y: rect.y + 3, w: TILE - 6, h: TILE - 6 });
      } else if (ch === ',') {
        shadow.add(`${col},${row}`);
      } else if (ch === 'F') {
        files.push({ x: centre.x, y: centre.y, taken: false, bob: Math.random() * 6.28 });
      } else if (ch === 'E') {
        exit = { x: centre.x, y: centre.y, open: false };
      } else if (ch === 'P') {
        playerStart = { x: centre.x, y: centre.y };
      }
    }
  }
  return { blocking, sightBlocking, bushes, shadow, files, playerStart, exit };
}

function makeGuard(def, index, random) {
  const start = tileCenter(def.waypoints[0][0], def.waypoints[0][1]);
  const next = tileCenter(def.waypoints[1 % def.waypoints.length][0], def.waypoints[1 % def.waypoints.length][1]);
  return {
    id: index,
    x: start.x,
    y: start.y,
    angle: angleTo(start.x, start.y, next.x, next.y),
    state: 'patrol', // patrol | investigate | search | return | chase
    waypointIndex: 1 % def.waypoints.length,
    waypointDir: 1,
    pauseTimer: 0,
    pauseLength: def.pause ?? 1.4,
    scanBase: 0,
    scanTime: 0,
    suspicion: 0,
    alerted: false,
    lastSeen: { x: start.x, y: start.y },
    loseTimer: 0,
    searchTimer: 0,
    target: null,
    marked: false,
    stepTimer: random() * 0.4,
    moving: false,
    visible: false,
    waypoints: def.waypoints.map(([c, r]) => tileCenter(c, r)),
  };
}

export function createWorld(seed, levelIndex = 0, lives = LIVES_PER_RUN) {
  const random = createRandom(seed);
  const level = LEVELS[levelIndex];
  const parsed = parseLevel(level);
  const state = {
    levelIndex,
    level,
    random,
    lives,
    coins: COINS_PER_LEVEL,
    time: 0,
    runTime: 0,
    alerts: 0,
    filesTaken: 0,
    player: {
      x: parsed.playerStart.x,
      y: parsed.playerStart.y,
      angle: 0,
      moving: false,
      sneaking: false,
      hidden: false,
      inShadow: false,
      stepTimer: 0,
      noiseTimer: 0,
    },
    guards: level.guards.map((g, i) => makeGuard(g, i, random)),
    files: parsed.files,
    exit: parsed.exit,
    blocking: parsed.blocking,
    sightBlocking: parsed.sightBlocking,
    bushes: parsed.bushes,
    shadow: parsed.shadow,
    lamps: level.lamps.map(([c, r]) => tileCenter(c, r)),
    projectiles: [],
    pings: [],
    particles: [],
    dust: [],
    toast: null,
    caught: false,
    done: false,
  };
  for (let i = 0; i < 70; i += 1) {
    state.dust.push({
      x: random() * COLS * TILE,
      y: random() * ROWS * TILE,
      r: 0.6 + random() * 1.5,
      phase: random() * Math.PI * 2,
      speed: 0.2 + random() * 0.5,
    });
  }
  state.toast = { text: 'Steal 3 files, then reach the exit unseen.', ttl: 5 };
  return { state, random };
}

/** Rebuild the current level after being caught, keeping lives and run time. */
export function restartLevel(world) {
  const { lives, runTime } = world.state;
  const fresh = createWorld(Math.floor(Math.random() * 4294967296), world.state.levelIndex, lives);
  fresh.state.runTime = runTime;
  world.state = fresh.state;
  world.random = fresh.random;
}

export function nextLevel(world) {
  const { lives, runTime } = world.state;
  const fresh = createWorld(Math.floor(Math.random() * 4294967296), world.state.levelIndex + 1, lives);
  fresh.state.runTime = runTime;
  fresh.state.coins = COINS_PER_LEVEL;
  world.state = fresh.state;
  world.random = fresh.random;
}

function tileAt(state, x, y) {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return '#';
  return state.level.map[row][col];
}

function losClear(state, x0, y0, x1, y1) {
  for (const rect of state.sightBlocking) {
    if (segmentHitsRect(x0, y0, x1, y1, rect)) return false;
  }
  return true;
}

function playerInBush(state) {
  const { x, y } = state.player;
  return state.bushes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

function emitNoise(state, x, y, radius) {
  state.pings.push({ x, y, radius, ttl: 0.7, max: 0.7 });
  for (const guard of state.guards) {
    if (guard.alerted) continue;
    const dist = Math.hypot(guard.x - x, guard.y - y);
    if (dist <= radius) {
      guard.state = 'investigate';
      guard.looking = false;
      guard.pauseTimer = 0;
      guard.target = { x, y };
      guard.suspicion = Math.max(guard.suspicion, SUSPICION_NOTICED);
    }
  }
}

function burst(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.random() * Math.PI * 2;
    const v = speed * (0.4 + state.random() * 0.8);
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      ttl: 0.5 + state.random() * 0.4,
      max: 0.9,
      color,
      size: 2 + state.random() * 2.5,
    });
  }
}

function updateGuard(world, guard, dt, audio) {
  const state = world.state;
  const player = state.player;
  const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
  const toPlayer = angleTo(guard.x, guard.y, player.x, player.y);
  let angleDiff = toPlayer - guard.angle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const inCone = dist <= CONE_RANGE && Math.abs(angleDiff) <= CONE_HALF_ANGLE;
  const hidden = player.hidden && dist > HIDE_CLOSE_RANGE;
  const seen = inCone && !hidden && losClear(state, guard.x, guard.y, player.x, player.y);
  guard.visible = seen;

  if (seen) {
    guard.lastSeen = { x: player.x, y: player.y };
    guard.loseTimer = 0;
    const proximity = Math.max(0, 1 - dist / CONE_RANGE);
    let rate = 25 + 80 * proximity;
    if (player.sneaking) rate *= 0.5;
    if (player.inShadow) rate *= 0.55;
    if (player.hidden) rate *= 0.12;
    if (!player.moving) rate *= 0.85;
    const before = guard.suspicion;
    guard.suspicion = Math.min(SUSPICION_ALERT, guard.suspicion + rate * dt);
    if (before < SUSPICION_NOTICED && guard.suspicion >= SUSPICION_NOTICED && !guard.alerted) {
      audio.noticed();
    }
    if (guard.suspicion >= SUSPICION_ALERT && !guard.alerted) {
      guard.alerted = true;
      guard.state = 'chase';
      guard.looking = false;
      state.alerts += 1;
      audio.alert();
      state.toast = { text: 'SPOTTED — break line of sight!', ttl: 2.5 };
      return EVENT_ALERT;
    }
  } else {
    guard.suspicion = Math.max(0, guard.suspicion - SUSPICION_DECAY * dt);
    if (guard.alerted) {
      guard.loseTimer += dt;
      if (guard.loseTimer > 3.5) {
        guard.alerted = false;
        guard.state = 'search';
        guard.target = { x: guard.lastSeen.x, y: guard.lastSeen.y };
        guard.searchTimer = 2.5;
      }
    }
  }

  guard.moving = false;
  if (guard.state === 'chase') {
    const target = guard.visible ? player : guard.lastSeen;
    const d = Math.hypot(target.x - guard.x, target.y - guard.y);
    if (d > 8) {
      const vx = ((target.x - guard.x) / d) * GUARD_CHASE_SPEED * dt;
      const vy = ((target.y - guard.y) / d) * GUARD_CHASE_SPEED * dt;
      moveCircle(guard, vx, vy, state.blocking, GUARD_RADIUS);
      guard.angle = angleLerp(guard.angle, angleTo(guard.x, guard.y, target.x, target.y), dt * 10);
      guard.moving = true;
    }
  } else if (guard.state === 'investigate' || guard.state === 'search') {
    const target = guard.target ?? guard.lastSeen;
    const d = Math.hypot(target.x - guard.x, target.y - guard.y);
    if (d > 10) {
      const speed = guard.state === 'investigate' ? GUARD_INVESTIGATE_SPEED : GUARD_PATROL_SPEED;
      const vx = ((target.x - guard.x) / d) * speed * dt;
      const vy = ((target.y - guard.y) / d) * speed * dt;
      moveCircle(guard, vx, vy, state.blocking, GUARD_RADIUS);
      guard.angle = angleLerp(guard.angle, angleTo(guard.x, guard.y, target.x, target.y), dt * 8);
      guard.moving = true;
    } else if (guard.state === 'search') {
      if (!guard.looking) { guard.looking = true; guard.scanBase = guard.angle; }
      guard.searchTimer -= dt;
      guard.scanTime += dt;
      guard.angle = guard.scanBase + Math.sin(guard.scanTime * 1.4) * 0.9;
      if (guard.searchTimer <= 0) {
        guard.state = 'return';
        guard.looking = false;
        guard.suspicion = Math.min(guard.suspicion, 30);
      }
    } else {
      if (!guard.looking) { guard.looking = true; guard.scanBase = guard.angle; }
      guard.scanTime += dt;
      guard.angle = guard.scanBase + Math.sin(guard.scanTime * 1.6) * 0.8;
      guard.pauseTimer += dt;
      if (guard.pauseTimer > 1.6) {
        guard.state = 'patrol';
        guard.looking = false;
        guard.pauseTimer = 0;
      }
    }
  } else if (guard.state === 'return') {
    let best = null;
    let bestDist = Infinity;
    for (const point of guard.waypoints) {
      const d = Math.hypot(point.x - guard.x, point.y - guard.y);
      if (d < bestDist) { bestDist = d; best = point; }
    }
    if (best && bestDist > 12) {
      const vx = ((best.x - guard.x) / bestDist) * GUARD_PATROL_SPEED * dt;
      const vy = ((best.y - guard.y) / bestDist) * GUARD_PATROL_SPEED * dt;
      moveCircle(guard, vx, vy, state.blocking, GUARD_RADIUS);
      guard.angle = angleLerp(guard.angle, angleTo(guard.x, guard.y, best.x, best.y), dt * 8);
      guard.moving = true;
    } else {
      guard.state = 'patrol';
      guard.waypointIndex = guard.waypoints.indexOf(best);
    }
  } else {
    // Patrol: walk to the current waypoint, pause and scan, then continue.
    if (guard.pauseTimer > 0) {
      guard.pauseTimer -= dt;
      guard.scanTime += dt;
      guard.angle = guard.scanBase + Math.sin(guard.scanTime * 1.1) * 0.7;
      if (guard.pauseTimer <= 0) {
        let next = guard.waypointIndex + guard.waypointDir;
        if (next < 0 || next >= guard.waypoints.length) {
          guard.waypointDir *= -1;
          next = guard.waypointIndex + guard.waypointDir;
        }
        guard.waypointIndex = next;
      }
    } else {
      const target = guard.waypoints[guard.waypointIndex];
      const d = Math.hypot(target.x - guard.x, target.y - guard.y);
      if (d <= 6) {
        guard.pauseTimer = guard.pauseLength;
        guard.scanBase = guard.angle;
        guard.scanTime = 0;
      } else {
        const vx = ((target.x - guard.x) / d) * GUARD_PATROL_SPEED * dt;
        const vy = ((target.y - guard.y) / d) * GUARD_PATROL_SPEED * dt;
        moveCircle(guard, vx, vy, state.blocking, GUARD_RADIUS);
        guard.angle = angleLerp(guard.angle, angleTo(guard.x, guard.y, target.x, target.y), dt * 10);
        guard.moving = true;
      }
    }
  }

  if (guard.moving) {
    guard.stepTimer += dt;
    if (guard.stepTimer > 0.42) {
      guard.stepTimer = 0;
      const volume = Math.max(0.06, Math.min(1, 1 - dist / 520));
      audio.guardStep(volume);
    }
  }
  return 0;
}

/**
 * Advance the world one fixed step. `input` is { dx, dy, sneaking,
 * throwAt: {x,y} | null, markAt: {x,y} | null }. Returns an event bit mask.
 */
export function stepWorld(world, dt, input, audio) {
  const state = world.state;
  let events = 0;
  state.time += dt;
  state.runTime += dt;
  if (state.toast) {
    state.toast.ttl -= dt;
    if (state.toast.ttl <= 0) state.toast = null;
  }

  const player = state.player;
  const speed = input.sneaking ? SNEAK_SPEED : WALK_SPEED;
  const moving = input.dx !== 0 || input.dy !== 0;
  player.moving = moving;
  player.sneaking = input.sneaking;
  if (moving) {
    moveCircle(player, input.dx * speed * dt, input.dy * speed * dt, state.blocking, PLAYER_RADIUS);
    player.angle = Math.atan2(input.dy, input.dx);
    player.stepTimer += dt;
    if (player.stepTimer > 0.38) {
      player.stepTimer = 0;
      audio.step(input.sneaking ? 0.35 : 1);
      if (Math.random() < 0.5) {
        state.particles.push({
          x: player.x, y: player.y + 10,
          vx: (Math.random() - 0.5) * 12, vy: -6 - Math.random() * 8,
          ttl: 0.4, max: 0.4, color: 'rgba(160,170,190,0.35)', size: 2,
        });
      }
    }
    if (!input.sneaking) {
      player.noiseTimer += dt;
      if (player.noiseTimer >= RUN_NOISE_INTERVAL) {
        player.noiseTimer = 0;
        emitNoise(state, player.x, player.y, RUN_NOISE_RADIUS);
      }
    } else {
      player.noiseTimer = 0;
    }
  } else {
    player.stepTimer = 0;
    player.noiseTimer = 0;
  }
  player.hidden = playerInBush(state);
  player.inShadow = tileAt(state, player.x, player.y) === ',';

  if (input.markAt) {
    let best = null;
    let bestDist = 48;
    for (const guard of state.guards) {
      const d = Math.hypot(guard.x - input.markAt.x, guard.y - input.markAt.y);
      if (d < bestDist) { bestDist = d; best = guard; }
    }
    if (best) best.marked = !best.marked;
  }

  if (input.throwAt && state.coins > 0 && state.projectiles.length === 0) {
    const dx = input.throwAt.x - player.x;
    const dy = input.throwAt.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 12) {
      const range = Math.min(dist, COIN_RANGE);
      const tx = player.x + (dx / dist) * range;
      const ty = player.y + (dy / dist) * range;
      state.coins -= 1;
      state.projectiles.push({
        x: player.x, y: player.y,
        tx, ty,
        t: 0,
        duration: Math.max(0.25, range / 460),
        startX: player.x, startY: player.y,
      });
      audio.coin();
    }
  }

  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const coin = state.projectiles[i];
    coin.t += dt;
    const k = Math.min(1, coin.t / coin.duration);
    coin.x = coin.startX + (coin.tx - coin.startX) * k;
    coin.y = coin.startY + (coin.ty - coin.startY) * k;
    if (k >= 1) {
      state.projectiles.splice(i, 1);
      audio.coinLand();
      emitNoise(state, coin.tx, coin.ty, COIN_NOISE_RADIUS);
    }
  }

  for (let i = state.pings.length - 1; i >= 0; i -= 1) {
    state.pings[i].ttl -= dt;
    if (state.pings[i].ttl <= 0) state.pings.splice(i, 1);
  }
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.ttl -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.ttl <= 0) state.particles.splice(i, 1);
  }
  for (const mote of state.dust) {
    mote.phase += dt * mote.speed;
  }

  for (const guard of state.guards) {
    events |= updateGuard(world, guard, dt, audio);
    const d = Math.hypot(guard.x - player.x, guard.y - player.y);
    if (d < CATCH_DISTANCE) {
      state.caught = true;
      events |= EVENT_CAUGHT;
      audio.caught();
      return events;
    }
    if (d < 40 && guard.visible) {
      state.caught = true;
      events |= EVENT_CAUGHT;
      audio.caught();
      return events;
    }
  }

  for (const file of state.files) {
    if (file.taken) continue;
    file.bob += dt * 2;
    if (Math.hypot(file.x - player.x, file.y - player.y) < 28) {
      file.taken = true;
      state.filesTaken += 1;
      events |= EVENT_PICKUP;
      audio.pickup();
      burst(state, file.x, file.y, 'rgba(255,214,120,0.9)', 14, 90);
      if (state.filesTaken >= state.files.length) {
        state.exit.open = true;
        events |= EVENT_DOOR;
        audio.door();
        state.toast = { text: 'Exit open — get out unseen.', ttl: 4 };
      }
    }
  }

  if (state.exit.open && Math.hypot(state.exit.x - player.x, state.exit.y - player.y) < 30) {
    state.done = true;
    events |= EVENT_LEVEL_DONE;
  }
  return events;
}
