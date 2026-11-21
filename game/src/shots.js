// Staged scenes for the screenshots: ?shot=cover|patrol|alert|win (with
// &seed=N) paints one fixed moment instead of running the loop, twice, and
// sets window.__shotReady. Every scene is built from the same world the
// player runs in, so the screenshots are real renders of the game's code —
// a guard mid-patrol, a cone sweeping a sneaking player, an alarm chase,
// and the level-clear screen.
import { TILE } from './config.js';
import { createWorld } from './world.js';
import { SCREEN_PLAY, SCREEN_LEVEL, ratingFor } from './render.js';

function at(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function face(guard, tx, ty) {
  guard.angle = Math.atan2(ty - guard.y, tx - guard.x);
}

function placeGuard(world, index, col, row, angle, suspicion = 0) {
  const guard = world.state.guards[index];
  const p = at(col, row);
  guard.x = p.x;
  guard.y = p.y;
  guard.angle = angle;
  guard.suspicion = suspicion;
  guard.state = 'patrol';
  guard.alerted = false;
  guard.visible = false;
  return guard;
}

function placePlayer(world, col, row, sneaking = true) {
  const p = at(col, row);
  world.state.player.x = p.x;
  world.state.player.y = p.y;
  world.state.player.sneaking = sneaking;
  world.state.player.moving = true;
  world.state.player.angle = 0;
  world.state.player.hidden = false;
  world.state.player.inShadow = false;
  return world.state.player;
}

function takeFiles(world, count) {
  for (let i = 0; i < count && i < world.state.files.length; i += 1) {
    world.state.files[i].taken = true;
  }
  world.state.filesTaken = Math.min(count, world.state.files.length);
  if (world.state.filesTaken >= world.state.files.length) world.state.exit.open = true;
}

export function stageShot(name, seed) {
  if (name === 'cover') {
    const world = createWorld(seed, 0);
    const player = placePlayer(world, 12, 10, true);
    player.angle = -Math.PI / 2;
    const near = placeGuard(world, 0, 8, 9, 0, 55);
    face(near, player.x, player.y);
    near.visible = true;
    placeGuard(world, 1, 20, 7, Math.PI, 0);
    placeGuard(world, 2, 24, 13, -Math.PI / 2, 0);
    takeFiles(world, 1);
    world.state.toast = { text: 'Stay out of the gold cones.', ttl: 99 };
    return { world, screen: SCREEN_PLAY, lastLevel: null };
  }
  if (name === 'patrol') {
    const world = createWorld(seed, 1);
    const player = placePlayer(world, 10, 13, true);
    player.hidden = true;
    player.angle = Math.PI / 2;
    placeGuard(world, 0, 7, 2, 0, 0);
    placeGuard(world, 1, 25, 5, Math.PI, 0);
    const third = placeGuard(world, 2, 10, 14, 0, 22);
    face(third, player.x, player.y);
    placeGuard(world, 3, 28, 12, -Math.PI / 2, 0);
    world.state.toast = { text: 'Bushes hide you — even inside a cone.', ttl: 99 };
    return { world, screen: SCREEN_PLAY, lastLevel: null };
  }
  if (name === 'alert') {
    const world = createWorld(seed, 0);
    const player = placePlayer(world, 25, 4, false);
    player.angle = -Math.PI / 4;
    takeFiles(world, 3);
    const chaser = placeGuard(world, 2, 24, 6, 0, 100);
    chaser.alerted = true;
    chaser.state = 'chase';
    chaser.visible = true;
    face(chaser, player.x, player.y);
    const other = placeGuard(world, 1, 20, 10, 0, 60);
    face(other, player.x, player.y);
    placeGuard(world, 0, 6, 5, Math.PI / 2, 0);
    world.state.toast = { text: 'SPOTTED — break line of sight!', ttl: 99 };
    return { world, screen: SCREEN_PLAY, lastLevel: null };
  }
  if (name === 'win') {
    const world = createWorld(seed, 0);
    takeFiles(world, 3);
    const player = placePlayer(world, 29, 1, false);
    player.angle = -Math.PI / 2;
    placeGuard(world, 0, 8, 9, 0, 0);
    placeGuard(world, 1, 20, 7, Math.PI, 0);
    placeGuard(world, 2, 24, 13, -Math.PI / 2, 0);
    world.state.toast = null;
    return {
      world,
      screen: SCREEN_LEVEL,
      lastLevel: { time: 187, alerts: 0, rating: ratingFor(0) },
    };
  }
  return { world: createWorld(seed, 0), screen: SCREEN_PLAY, lastLevel: null };
}
