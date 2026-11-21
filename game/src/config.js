// Shared constants for GHOST SHIFT. The canvas is a fixed 1280x800 stage
// (one 32x20 tile grid at 40 px a tile) so a screenshot always frames the
// whole level exactly as the player sees it.
export const TILE = 40;
export const COLS = 32;
export const ROWS = 20;
export const VIEW_W = 1280;
export const VIEW_H = 800;
export const STEP = 1 / 60;
export const BEST_KEY = 'ghost-shift-best';

/** The longest a single frame may advance the simulation. */
export const MAX_FRAME = 0.25;

// Player movement.
export const PLAYER_RADIUS = 13;
export const WALK_SPEED = 168;
export const SNEAK_SPEED = 96;

// Guards.
export const GUARD_RADIUS = 14;
export const GUARD_PATROL_SPEED = 72;
export const GUARD_CHASE_SPEED = 152;
export const GUARD_INVESTIGATE_SPEED = 98;
export const CONE_RANGE = 205;
export const CONE_HALF_ANGLE = 0.61; // ~35 degrees each side
export const CATCH_DISTANCE = 26;
export const SUSPICION_ALERT = 100;
export const SUSPICION_NOTICED = 35;
export const SUSPICION_DECAY = 14;
export const HIDE_CLOSE_RANGE = 48; // a guard this close sees through a bush

// Noise and distractions.
export const RUN_NOISE_RADIUS = 95;
export const RUN_NOISE_INTERVAL = 0.45;
export const COIN_RANGE = 460;
export const COIN_NOISE_RADIUS = 175;
export const COINS_PER_LEVEL = 3;

// Scoring.
export const LIVES_PER_RUN = 3;
export const FILES_PER_LEVEL = 3;
