// Every pixel of GHOST SHIFT. The renderer paints a moody midnight
// archive: dark slate floors, warm lamp pools, shelves and crates for
// cover, and the guards' vision cones in gold — orange when they are
// suspicious, red when the alarm is up. It also draws the HUD and every
// screen overlay (title, pause, level clear, caught, victory).
import {
  TILE, COLS, ROWS, VIEW_W, VIEW_H, CONE_RANGE, CONE_HALF_ANGLE,
  SUSPICION_NOTICED, SUSPICION_ALERT,
} from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL = 'level';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const SPINE_COLORS = ['#7a4a3a', '#4a6b7a', '#6b7a4a', '#8a6d3b', '#5d4a7a', '#3f6b52'];

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ratingFor(alerts) {
  if (alerts === 0) return 'GHOST';
  if (alerts === 1) return 'SHADOW';
  return 'SPOTTED';
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  // Deterministic decoration: floor speckles and book-spine colours are
  // fixed per tile, so every load of the same level looks identical.
  const decor = createRandom(20261121);
  const speckles = [];
  for (let i = 0; i < 520; i += 1) {
    speckles.push({
      x: decor() * VIEW_W,
      y: decor() * VIEW_H,
      r: 0.5 + decor() * 1.6,
      a: 0.03 + decor() * 0.06,
    });
  }
  const spineSeed = [];
  for (let row = 0; row < ROWS; row += 1) {
    spineSeed[row] = [];
    for (let col = 0; col < COLS; col += 1) {
      spineSeed[row][col] = (col * 7 + row * 13) % SPINE_COLORS.length;
    }
  }

  const vignette = document.createElement('canvas');
  vignette.width = VIEW_W;
  vignette.height = VIEW_H;
  {
    const vctx = vignette.getContext('2d');
    const grad = vctx.createRadialGradient(
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42,
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(2,4,8,0.55)');
    vctx.fillStyle = grad;
    vctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function drawFloor(state) {
    ctx.fillStyle = '#171b26';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if ((col + row) % 2 === 0) {
          ctx.fillStyle = '#1a1f2d';
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 0; col <= COLS; col += 1) {
      ctx.moveTo(col * TILE + 0.5, 0);
      ctx.lineTo(col * TILE + 0.5, VIEW_H);
    }
    for (let row = 0; row <= ROWS; row += 1) {
      ctx.moveTo(0, row * TILE + 0.5);
      ctx.lineTo(VIEW_W, row * TILE + 0.5);
    }
    ctx.stroke();
    for (const s of speckles) {
      ctx.fillStyle = `rgba(190,200,220,${s.a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shadow floor: unlit stretches where detection is halved.
    for (const key of state.shadow) {
      const [col, row] = key.split(',').map(Number);
      ctx.fillStyle = 'rgba(8,12,26,0.5)';
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }

  function drawLamps(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const lamp of state.lamps) {
      const grad = ctx.createRadialGradient(lamp.x, lamp.y, 8, lamp.x, lamp.y, 150);
      grad.addColorStop(0, 'rgba(255,196,110,0.20)');
      grad.addColorStop(0.55, 'rgba(255,180,90,0.08)');
      grad.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 150, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const lamp of state.lamps) {
      ctx.fillStyle = '#2a2f3d';
      ctx.fillRect(lamp.x - 3, lamp.y - 3, 6, 6);
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDust(state, time) {
    ctx.fillStyle = 'rgba(255,214,140,0.28)';
    for (const mote of state.dust) {
      const x = mote.x + Math.sin(mote.phase) * 6;
      const y = mote.y + Math.cos(mote.phase * 0.8) * 4;
      ctx.beginPath();
      ctx.arc(x, y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function coneColor(guard) {
    if (guard.alerted) return { fill: 'rgba(255,64,64,0.30)', edge: 'rgba(255,90,90,0.55)' };
    if (guard.suspicion >= SUSPICION_NOTICED) return { fill: 'rgba(255,150,50,0.26)', edge: 'rgba(255,170,70,0.5)' };
    return { fill: 'rgba(255,214,90,0.20)', edge: 'rgba(255,220,120,0.4)' };
  }

  function drawCones(state) {
    for (const guard of state.guards) {
      const { fill, edge } = coneColor(guard);
      const grad = ctx.createRadialGradient(guard.x, guard.y, 10, guard.x, guard.y, CONE_RANGE);
      grad.addColorStop(0, fill);
      grad.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.arc(guard.x, guard.y, CONE_RANGE, guard.angle - CONE_HALF_ANGLE, guard.angle + CONE_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(
        guard.x + Math.cos(guard.angle - CONE_HALF_ANGLE) * CONE_RANGE,
        guard.y + Math.sin(guard.angle - CONE_HALF_ANGLE) * CONE_RANGE,
      );
      ctx.moveTo(guard.x, guard.y);
      ctx.lineTo(
        guard.x + Math.cos(guard.angle + CONE_HALF_ANGLE) * CONE_RANGE,
        guard.y + Math.sin(guard.angle + CONE_HALF_ANGLE) * CONE_RANGE,
      );
      ctx.stroke();
      if (guard.visible) {
        ctx.strokeStyle = 'rgba(255,70,70,0.75)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(guard.x, guard.y);
        ctx.lineTo(state.player.x, state.player.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawExit(state, time) {
    const exit = state.exit;
    const pulse = 0.6 + 0.4 * Math.sin(time * 3);
    if (exit.open) {
      const beam = ctx.createLinearGradient(exit.x, exit.y - 130, exit.x, exit.y + 20);
      beam.addColorStop(0, 'rgba(90,255,150,0)');
      beam.addColorStop(1, `rgba(90,255,150,${0.22 * pulse})`);
      ctx.fillStyle = beam;
      ctx.fillRect(exit.x - 18, exit.y - 130, 36, 150);
      ctx.strokeStyle = `rgba(120,255,170,${0.5 + 0.3 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(exit.x, exit.y, 24 + 4 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(exit.x - 15, exit.y - 17, 30, 34);
    ctx.strokeStyle = exit.open ? '#5aff96' : '#5a3a3a';
    ctx.lineWidth = 3;
    ctx.strokeRect(exit.x - 15, exit.y - 17, 30, 34);
    // The label sits below the door when the exit is on the top row, so
    // the HUD bar never covers it.
    const labelY = exit.y < 110 ? exit.y + 30 : exit.y - 28;
    if (exit.open) {
      ctx.fillStyle = '#5aff96';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('EXIT', exit.x, labelY);
    } else {
      ctx.fillStyle = '#8a5a5a';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LOCKED', exit.x, labelY);
    }
  }

  function drawFiles(state, time) {
    for (const file of state.files) {
      if (file.taken) continue;
      const bob = Math.sin(file.bob) * 3;
      const glow = 0.5 + 0.3 * Math.sin(file.bob * 1.5);
      ctx.save();
      ctx.shadowColor = `rgba(255,200,90,${glow})`;
      ctx.shadowBlur = 16;
      ctx.translate(file.x, file.y + bob);
      ctx.rotate(-0.12);
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(-8, -11, 16, 22);
      ctx.fillStyle = '#2a2f3d';
      ctx.fillRect(-5, -7, 10, 2);
      ctx.fillRect(-5, -2, 10, 2);
      ctx.fillRect(-5, 3, 7, 2);
      ctx.restore();
    }
  }

  function drawCover(state) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const ch = state.level.map[row][col];
        const x = col * TILE;
        const y = row * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#2b3242';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#3d465e';
          ctx.fillRect(x, y, TILE, 4);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, y + TILE - 3, TILE, 3);
        } else if (ch === 'S') {
          ctx.fillStyle = '#4a3320';
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = '#5d4128';
          ctx.fillRect(x + 2, y + 2, TILE - 4, 6);
          const base = spineSeed[row][col];
          for (let i = 0; i < 4; i += 1) {
            ctx.fillStyle = SPINE_COLORS[(base + i) % SPINE_COLORS.length];
            ctx.fillRect(x + 6 + i * 8, y + 12, 5, TILE - 18);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
        } else if (ch === 'C') {
          ctx.fillStyle = '#6b5233';
          ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
          ctx.strokeStyle = '#3f2f1c';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4);
          ctx.lineTo(x + TILE - 4, y + TILE - 4);
          ctx.moveTo(x + TILE - 4, y + 4);
          ctx.lineTo(x + 4, y + TILE - 4);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 4.5, y + 4.5, TILE - 9, TILE - 9);
        } else if (ch === 'B') {
          ctx.fillStyle = '#1d3a24';
          for (const [ox, oy, r] of [[10, 12, 11], [26, 10, 12], [20, 24, 12], [30, 26, 9], [8, 28, 8]]) {
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#2c5a35';
          for (const [ox, oy, r] of [[14, 10, 5], [26, 18, 6], [18, 28, 5]]) {
            ctx.beginPath();
            ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  function drawGuard(state, guard) {
    if (guard.marked) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      guard.waypoints.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      for (const point of guard.waypoints) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(guard.x, guard.y + 10, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e3d5c';
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5f8a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Cap brim points where the guard is looking.
    ctx.fillStyle = '#1c2740';
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, 14, guard.angle - 0.9, guard.angle + 0.9);
    ctx.lineTo(guard.x, guard.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d8c9a3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(guard.x + Math.cos(guard.angle) * 8, guard.y + Math.sin(guard.angle) * 8);
    ctx.lineTo(guard.x + Math.cos(guard.angle) * 16, guard.y + Math.sin(guard.angle) * 16);
    ctx.stroke();
    if (guard.suspicion > 2) {
      const w = 32;
      const frac = guard.suspicion / SUSPICION_ALERT;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(guard.x - w / 2, guard.y - 28, w, 5);
      ctx.fillStyle = frac < 0.5 ? '#ffd65a' : frac < 0.85 ? '#ff9a3c' : '#ff4d4d';
      ctx.fillRect(guard.x - w / 2, guard.y - 28, w * frac, 5);
    }
    if (guard.alerted) {
      ctx.fillStyle = '#ff4d4d';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', guard.x, guard.y - 38);
    } else if (guard.suspicion >= SUSPICION_NOTICED) {
      ctx.fillStyle = '#ffb03c';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', guard.x, guard.y - 38);
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    const radius = player.sneaking ? 11 : 13;
    ctx.save();
    if (player.hidden) ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f8a70';
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d5c48';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Hood: a darker arc on the facing side.
    ctx.fillStyle = '#14604d';
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius - 3, player.angle - 1.1, player.angle + 1.1);
    ctx.lineTo(player.x, player.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2e6c8';
    ctx.beginPath();
    ctx.arc(
      player.x + Math.cos(player.angle) * 5,
      player.y + Math.sin(player.angle) * 5,
      3.2, 0, Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    if (player.sneaking) {
      ctx.strokeStyle = 'rgba(140,220,190,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (player.hidden) {
      ctx.fillStyle = 'rgba(150,255,180,0.9)';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HIDDEN', player.x, player.y - 24);
    }
  }

  function drawBushCanopy(state) {
    const player = state.player;
    if (!player.hidden) return;
    for (const bush of state.bushes) {
      if (player.x >= bush.x - 6 && player.x <= bush.x + bush.w + 6
        && player.y >= bush.y - 6 && player.y <= bush.y + bush.h + 6) {
        ctx.fillStyle = 'rgba(44,90,53,0.85)';
        for (const [ox, oy, r] of [[14, 10, 6], [26, 18, 7], [18, 28, 6]]) {
          ctx.beginPath();
          ctx.arc(bush.x + ox, bush.y + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawProjectiles(state) {
    for (const coin of state.projectiles) {
      ctx.fillStyle = '#ffd65a';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawPings(state) {
    for (const ping of state.pings) {
      const k = 1 - ping.ttl / ping.max;
      ctx.strokeStyle = `rgba(255,214,120,${0.55 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, 12 + ping.radius * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.ttl / p.max);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function alertStatus(state) {
    if (state.guards.some((g) => g.alerted)) return { text: 'ALERT!', color: '#ff4d4d' };
    if (state.guards.some((g) => g.suspicion >= SUSPICION_NOTICED)) return { text: 'SUSPICIOUS', color: '#ffb03c' };
    return { text: 'UNSEEN', color: '#5aff96' };
  }

  function drawHud(state, ui) {
    ctx.fillStyle = 'rgba(8,11,18,0.82)';
    ctx.fillRect(0, 0, VIEW_W, 38);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 38, VIEW_W, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8e2d0';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(`GHOST SHIFT  ·  LEVEL ${state.levelIndex + 1} — ${state.level.name.toUpperCase()}`, 14, 19);
    const filesText = `FILES ${state.filesTaken}/${state.files.length}`;
    ctx.fillStyle = '#ffd65a';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(filesText, 560, 19);
    const status = alertStatus(state);
    ctx.fillStyle = status.color;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`● ${status.text}`, 760, 19);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff8a8a';
    ctx.font = '700 14px system-ui, sans-serif';
    let hearts = '';
    for (let i = 0; i < state.lives; i += 1) hearts += '♥ ';
    ctx.fillText(hearts.trim(), 1010, 19);
    ctx.fillStyle = '#ffd65a';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(`◉ ${state.coins}`, 1075, 19);
    ctx.fillStyle = '#c8d0e0';
    ctx.fillText(formatTime(state.time), 1180, 19);
    ctx.fillText(ui.muted ? 'MUTED (M)' : '', 1250, 19);
    if (state.toast) {
      const alpha = Math.min(1, state.toast.ttl);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 15px system-ui, sans-serif';
      const w = ctx.measureText(state.toast.text).width + 28;
      ctx.fillStyle = 'rgba(8,11,18,0.85)';
      ctx.fillRect((VIEW_W - w) / 2, 52, w, 30);
      ctx.strokeStyle = 'rgba(255,214,120,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect((VIEW_W - w) / 2 + 0.5, 52.5, w, 30);
      ctx.fillStyle = '#ffe9b0';
      ctx.textAlign = 'center';
      ctx.fillText(state.toast.text, VIEW_W / 2, 67);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(200,210,230,0.55)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('WASD move  ·  SHIFT sneak  ·  Q throw a coin  ·  CLICK a guard to mark its patrol  ·  P pause  ·  M mute', 14, VIEW_H - 12);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,11,18,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,214,120,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function drawTitle(state, ui) {
    ctx.fillStyle = 'rgba(4,7,12,0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,90,0.5)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#f2d492';
    ctx.font = '700 68px Georgia, serif';
    ctx.fillText('GHOST SHIFT', VIEW_W / 2, 190);
    ctx.restore();
    ctx.fillStyle = '#c8d0e0';
    ctx.font = '600 19px Georgia, serif';
    ctx.fillText('T H E   M E R I D I A N   A R C H I V E', VIEW_W / 2, 246);
    ctx.fillStyle = '#9aa5b8';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Midnight in the Meridian Archive. Steal the files. Stay out of the light.', VIEW_W / 2, 292);
    ctx.fillText('Three levels. Three files a level. One way out — unseen.', VIEW_W / 2, 318);
    panel(VIEW_W / 2 - 260, 360, 520, 190);
    ctx.fillStyle = '#e8e2d0';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText('HOW TO PLAY', VIEW_W / 2, 388);
    ctx.fillStyle = '#c8d0e0';
    ctx.font = '14px system-ui, sans-serif';
    const lines = [
      'WASD / arrows — move        SHIFT — sneak (slow, quiet, hard to see)',
      'Q — throw a coin to distract a guard        CLICK a guard — mark its patrol',
      'Hide in bushes, stay in shadow, mind the gold cones',
      'Collect 3 files, then slip out the green exit',
    ];
    lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 420 + i * 26));
    ctx.fillStyle = '#ffd65a';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER OR CLICK TO START', VIEW_W / 2, 610);
    if (ui.best) {
      ctx.fillStyle = '#9aa5b8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`Best full run: ${ui.best}`, VIEW_W / 2, 646);
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4,7,12,0.7)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2d492';
    ctx.font = '700 52px Georgia, serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 360);
    ctx.fillStyle = '#c8d0e0';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('P or Esc to resume  ·  R to restart the level  ·  M to mute', VIEW_W / 2, 420);
  }

  function drawLevelClear(state, ui) {
    ctx.fillStyle = 'rgba(4,7,12,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const stats = ui.lastLevel;
    panel(VIEW_W / 2 - 260, 220, 520, 300);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5aff96';
    ctx.font = '700 44px Georgia, serif';
    ctx.fillText('LEVEL CLEAR', VIEW_W / 2, 268);
    ctx.fillStyle = '#e8e2d0';
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText(`${state.level.name} — ${formatTime(stats.time)}  ·  ${stats.alerts} alarm${stats.alerts === 1 ? '' : 's'}`, VIEW_W / 2, 322);
    ctx.fillStyle = stats.rating === 'GHOST' ? '#ffd65a' : stats.rating === 'SHADOW' ? '#9ecfff' : '#ff8a8a';
    ctx.font = '700 40px Georgia, serif';
    ctx.fillText(stats.rating, VIEW_W / 2, 392);
    ctx.fillStyle = '#c8d0e0';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(
      stats.rating === 'GHOST' ? 'Not a single guard knew you were there.' : stats.rating === 'SHADOW' ? 'Seen once — but never caught.' : 'Loud, but alive. The archive remembers.',
      VIEW_W / 2, 436,
    );
    ctx.fillStyle = '#ffd65a';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('PRESS ENTER FOR THE NEXT LEVEL', VIEW_W / 2, 486);
  }

  function drawOver(state, ui) {
    ctx.fillStyle = 'rgba(10,4,6,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const gameOver = state.lives <= 0;
    ctx.fillStyle = '#ff6a6a';
    ctx.font = '700 56px Georgia, serif';
    ctx.fillText(gameOver ? 'THE ARCHIVE KEEPS ITS SECRETS' : 'CAUGHT!', VIEW_W / 2, 330);
    ctx.fillStyle = '#c8d0e0';
    ctx.font = '16px system-ui, sans-serif';
    if (gameOver) {
      ctx.fillText('Three strikes, and the night shift ends. The files stay locked away.', VIEW_W / 2, 396);
      ctx.fillStyle = '#ffd65a';
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.fillText('PRESS R FOR A NEW RUN', VIEW_W / 2, 452);
    } else {
      ctx.fillText(`A guard got you. ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left — the level resets.`, VIEW_W / 2, 396);
      ctx.fillStyle = '#ffd65a';
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.fillText('PRESS R TO TRY THE LEVEL AGAIN', VIEW_W / 2, 452);
    }
    if (ui.best) {
      ctx.fillStyle = '#9aa5b8';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`Best full run: ${ui.best}`, VIEW_W / 2, 500);
    }
  }

  function drawWin(state, ui) {
    ctx.fillStyle = 'rgba(4,8,6,0.66)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = 'rgba(120,255,170,0.5)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#8affb0';
    ctx.font = '700 52px Georgia, serif';
    ctx.fillText('ALL FILES RECOVERED', VIEW_W / 2, 250);
    ctx.restore();
    ctx.fillStyle = '#e8e2d0';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('You walked out of the Meridian Archive with every secret — and no one ever saw you.', VIEW_W / 2, 310);
    ctx.fillStyle = '#c8d0e0';
    ctx.font = '15px system-ui, sans-serif';
    ui.ratings.forEach((entry, i) => {
      ctx.fillText(`${entry.name}: ${entry.rating} — ${formatTime(entry.time)}`, VIEW_W / 2, 360 + i * 28);
    });
    ctx.fillStyle = '#ffd65a';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(`Total time ${formatTime(ui.totalTime)}`, VIEW_W / 2, 360 + ui.ratings.length * 28 + 14);
    ctx.fillStyle = '#ffd65a';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('PRESS R TO PLAY AGAIN', VIEW_W / 2, 360 + ui.ratings.length * 28 + 58);
  }

  function draw(state, screen, ui) {
    drawFloor(state);
    drawLamps(state);
    drawDust(state, state.time);
    drawCones(state);
    drawFiles(state, state.time);
    drawExit(state, state.time);
    drawCover(state);
    for (const guard of state.guards) drawGuard(state, guard);
    drawPlayer(state);
    drawBushCanopy(state);
    drawProjectiles(state);
    drawPings(state);
    drawParticles(state);
    drawHud(state, ui);
    ctx.drawImage(vignette, 0, 0);
    if (screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_LEVEL) drawLevelClear(state, ui);
    else if (screen === SCREEN_OVER) drawOver(state, ui);
    else if (screen === SCREEN_WIN) drawWin(state, ui);
  }

  return { draw };
}
