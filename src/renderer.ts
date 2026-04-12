import { type BallState } from './ball';
import { getPlayerPositionWithDefense } from './defense';
import {
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  LINE_OF_SCRIMMAGE_YARDS_FROM_TOP,
  type Play,
  type Team,
  type Vec2
} from './model';

export interface RenderState {
  play: Play;
  playTime: number;
  selectedPlayerId: string | null;
  ball: BallState;
  showWaypointMarkers: boolean;
  defenseDisplayMode: 'show' | 'hide-zones' | 'hide-defense';
  highContrast?: boolean;
}

interface FieldMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TEAM_STYLES: Record<Team, { fill: string; stroke: string; route: string }> = {
  offense: {
    fill: '#f7b84b',
    stroke: '#3b2c1a',
    route: 'rgba(247, 184, 75, 0.65)'
  },
  defense: {
    fill: '#76d1ff',
    stroke: '#153447',
    route: 'rgba(118, 209, 255, 0.65)'
  }
};
const HIGH_CONTRAST_TEAM_STYLES: Record<Team, { fill: string; stroke: string; route: string }> = {
  offense: {
    fill: '#000000',
    stroke: '#000000',
    route: '#000000'
  },
  defense: {
    fill: '#ffffff',
    stroke: '#000000',
    route: '#000000'
  }
};
const DEFENSE_HALO_PX = 2;
const PLAYER_HIT_SLOP_PX = 10;
const WAYPOINT_HIT_SLOP_PX = 10;
const ZONE_HANDLE_HIT_RADIUS = 14;

export function createRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  let field: FieldMetrics = { x: 0, y: 0, width: 0, height: 0 };
  let devicePixelRatio = window.devicePixelRatio || 1;

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(clientWidth * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(clientHeight * devicePixelRatio));
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    field = computeFieldRect(clientWidth, clientHeight);
  }

  function computeFieldRect(width: number, height: number): FieldMetrics {
    const padding = Math.max(6, Math.min(width, height) * 0.02);
    const availableWidth = Math.max(1, width - padding * 2);
    const availableHeight = Math.max(1, height - padding * 2);
    const targetRatio = FIELD_LENGTH_YARDS / FIELD_WIDTH_YARDS;

    let fieldWidth = availableWidth;
    let fieldHeight = fieldWidth * targetRatio;

    if (fieldHeight > availableHeight) {
      fieldHeight = availableHeight;
      fieldWidth = fieldHeight / targetRatio;
    }

    return {
      x: padding + (availableWidth - fieldWidth) / 2,
      y: padding + (availableHeight - fieldHeight) / 2,
      width: fieldWidth,
      height: fieldHeight
    };
  }

  function render(state: RenderState) {
    const width = canvas.width / devicePixelRatio;
    const height = canvas.height / devicePixelRatio;
    context.clearRect(0, 0, width, height);

    drawField(context, field, !!state.highContrast);
    drawRoutes(context, state);
    drawZones(context, state);
    drawPlayers(context, state);
    drawBall(context, state);
  }

  function drawField(ctx: CanvasRenderingContext2D, metrics: FieldMetrics, highContrast: boolean) {
    const gradient = ctx.createLinearGradient(
      metrics.x,
      metrics.y,
      metrics.x + metrics.width,
      metrics.y + metrics.height
    );
    gradient.addColorStop(0, highContrast ? '#ffffff' : '#205a41');
    gradient.addColorStop(1, highContrast ? '#f7f7f2' : '#123a2a');
    const cornerRadius = getFieldCornerRadius(metrics);

    ctx.save();
    traceRoundedRect(ctx, metrics.x, metrics.y, metrics.width, metrics.height, cornerRadius);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(metrics.x, metrics.y, metrics.width, metrics.height);

    const stripeCount = Math.max(1, Math.round(FIELD_LENGTH_YARDS / 5));
    for (let i = 1; i < stripeCount; i += 1) {
      const y = metrics.y + (metrics.height / stripeCount) * i;
      ctx.beginPath();
      ctx.moveTo(metrics.x, y);
      ctx.lineTo(metrics.x + metrics.width, y);
      ctx.strokeStyle = highContrast ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = highContrast ? 1.4 : 1;
      ctx.stroke();
    }

    const lineOfScrimmage =
      metrics.y + (LINE_OF_SCRIMMAGE_YARDS_FROM_TOP / FIELD_LENGTH_YARDS) * metrics.height;
    ctx.beginPath();
    ctx.moveTo(metrics.x, lineOfScrimmage);
    ctx.lineTo(metrics.x + metrics.width, lineOfScrimmage);
    ctx.strokeStyle = highContrast ? '#000000' : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = highContrast ? 3 : 2;
    ctx.setLineDash(highContrast ? [12, 6] : [10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    ctx.save();
    traceRoundedRect(ctx, metrics.x, metrics.y, metrics.width, metrics.height, cornerRadius);
    ctx.strokeStyle = highContrast ? '#000000' : 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = highContrast ? 2 : 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function getFieldCornerRadius(metrics: FieldMetrics): number {
    return Math.max(10, Math.min(18, Math.min(metrics.width, metrics.height) * 0.035));
  }

  function traceRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    const clamped = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + clamped, y);
    ctx.lineTo(x + width - clamped, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + clamped);
    ctx.lineTo(x + width, y + height - clamped);
    ctx.quadraticCurveTo(x + width, y + height, x + width - clamped, y + height);
    ctx.lineTo(x + clamped, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - clamped);
    ctx.lineTo(x, y + clamped);
    ctx.quadraticCurveTo(x, y, x + clamped, y);
    ctx.closePath();
  }

  function drawRoutes(ctx: CanvasRenderingContext2D, state: RenderState) {
    for (const player of state.play.players) {
      if (player.team === 'defense') {
        continue;
      }
      const route = player.route ?? [];
      if (route.length === 0) {
        continue;
      }

      const highContrast = !!state.highContrast;
      const style = getTeamStyle(player.team, highContrast);
      const routeWidth = player.id === state.selectedPlayerId ? 3 : 2;

      ctx.save();
      drawRoutePath(ctx, player.start, route, style.route, highContrast ? routeWidth + 2 : routeWidth, highContrast ? [9, 5] : [6, 6]);

      if (state.showWaypointMarkers || player.id === state.selectedPlayerId) {
        ctx.fillStyle = style.route;
        for (const leg of route) {
          const end = worldToCanvas(leg.to);
          ctx.beginPath();
          ctx.arc(end.x, end.y, getWaypointRadius(), 0, Math.PI * 2);
          ctx.fill();
          if (highContrast) {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }
  }

  function drawZones(ctx: CanvasRenderingContext2D, state: RenderState) {
    if (state.defenseDisplayMode !== 'show') {
      return;
    }
    for (const player of state.play.players) {
      if (player.team !== 'defense' || player.assignment?.type !== 'zone') {
        continue;
      }

      const center = worldToCanvas(player.start);
      const radiusX = (player.assignment.radiusX / FIELD_WIDTH_YARDS) * field.width;
      const radiusY = (player.assignment.radiusY / FIELD_LENGTH_YARDS) * field.height;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = state.highContrast ? 'rgba(0, 0, 0, 0.08)' : 'rgba(118, 209, 255, 0.14)';
      ctx.fill();
      ctx.strokeStyle = state.highContrast ? 'rgba(0, 0, 0, 0.52)' : 'rgba(118, 209, 255, 0.12)';
      ctx.lineWidth = state.highContrast ? 2 : 1.5;
      ctx.stroke();
      ctx.restore();

      if (player.id === state.selectedPlayerId) {
        drawZoneHandles(ctx, center, radiusX, radiusY);
      }
    }
  }

  function drawZoneHandles(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radiusX: number,
    radiusY: number
  ) {
    const handleRadius = 7;
    const handles = [
      { x: center.x + radiusX, y: center.y },
      { x: center.x, y: center.y + radiusY }
    ];

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(21, 52, 71, 0.9)';
    ctx.lineWidth = 2;
    for (const handle of handles) {
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayers(ctx: CanvasRenderingContext2D, state: RenderState) {
    const radius = getPlayerRadius();
    const defenseOptions = { minSeparationYards: getMinSeparationYards() };
    const highContrast = !!state.highContrast;

    for (const player of state.play.players) {
      if (state.defenseDisplayMode === 'hide-defense' && player.team === 'defense') {
        continue;
      }
      const point = worldToCanvas(
        getPlayerPositionWithDefense(state.play, player, state.playTime, defenseOptions)
      );
      const style = getTeamStyle(player.team, highContrast);

      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = highContrast ? 3 : 2;
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (player.id === state.selectedPlayerId) {
        ctx.beginPath();
        ctx.strokeStyle = highContrast ? '#000000' : 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = highContrast ? 3 : 2;
        ctx.arc(point.x, point.y, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#0f1411';
      ctx.font = `${Math.max(10, radius)}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (highContrast) {
        ctx.fillStyle = player.team === 'offense' ? '#ffffff' : '#000000';
      }
      ctx.fillText(player.label, point.x, point.y + 1);

      ctx.restore();
    }
  }

  function drawBall(ctx: CanvasRenderingContext2D, state: RenderState) {
    const ball = state.ball;
    if (!ball.position) {
      return;
    }

    const point = worldToCanvas(ball.position);
    const radius = Math.max(5, Math.min(field.width, field.height) * 0.012);

    if (ball.inAir && ball.flight) {
      drawFlightArc(ctx, ball.flight, !!state.highContrast);
      drawBallTrail(ctx, point, ball.flight, !!state.highContrast);
    }

    const angle = ball.flight ? Math.atan2(ball.flight.end.y - ball.flight.start.y, ball.flight.end.x - ball.flight.start.x) : 0;
    drawFootball(ctx, point, radius, angle, !!state.highContrast);
  }

  function drawRoutePath(
    ctx: CanvasRenderingContext2D,
    start: Vec2,
    route: Array<{ to: Vec2 }>,
    strokeStyle: string,
    lineWidth: number,
    dash: number[]
  ) {
    let from = worldToCanvas(start);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dash);
    for (const leg of route) {
      const end = worldToCanvas(leg.to);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      from = end;
    }
    ctx.setLineDash([]);
  }

  function getTeamStyle(team: Team, highContrast: boolean) {
    return highContrast ? HIGH_CONTRAST_TEAM_STYLES[team] : TEAM_STYLES[team];
  }

  function drawFlightArc(ctx: CanvasRenderingContext2D, flight: { start: Vec2; end: Vec2 }, highContrast: boolean) {
    const start = worldToCanvas(flight.start);
    const end = worldToCanvas(flight.end);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.1) {
      return;
    }
    const nx = -dy / distance;
    const ny = dx / distance;
    const arcHeight = Math.min(48, distance * 0.3);
    const cx = (start.x + end.x) / 2 + nx * arcHeight;
    const cy = (start.y + end.y) / 2 + ny * arcHeight;

    ctx.save();
    ctx.strokeStyle = highContrast ? '#000000' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = highContrast ? 3 : 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(cx, cy, end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBallTrail(ctx: CanvasRenderingContext2D, point: Vec2, flight: { start: Vec2; end: Vec2 }, highContrast: boolean) {
    const start = worldToCanvas(flight.start);
    const end = worldToCanvas(flight.end);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.1) {
      return;
    }
    const ux = dx / distance;
    const uy = dy / distance;

    ctx.save();
    ctx.strokeStyle = highContrast ? '#000000' : 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = highContrast ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(point.x - ux * 12, point.y - uy * 12);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawFootball(ctx: CanvasRenderingContext2D, point: Vec2, radius: number, angle: number, highContrast: boolean) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.scale(1.6, 1);

    ctx.fillStyle = highContrast ? '#ffffff' : '#9c5a2a';
    ctx.strokeStyle = highContrast ? '#000000' : '#4f2b14';
    ctx.lineWidth = highContrast ? 2 : 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = highContrast ? '#000000' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.6, 0);
    ctx.lineTo(radius * 0.6, 0);
    ctx.stroke();

    ctx.restore();
  }

  function worldToCanvas(position: Vec2): Vec2 {
    return {
      x: field.x + position.x * field.width,
      y: field.y + position.y * field.height
    };
  }

  function canvasToWorld(position: Vec2): Vec2 | null {
    if (
      position.x < field.x ||
      position.x > field.x + field.width ||
      position.y < field.y ||
      position.y > field.y + field.height
    ) {
      return null;
    }

    return {
      x: (position.x - field.x) / field.width,
      y: (position.y - field.y) / field.height
    };
  }

  function getPlayerRadius(): number {
    return Math.max(12, Math.min(field.width, field.height) * 0.03);
  }

  function getWaypointRadius(): number {
    return Math.max(6, Math.min(field.width, field.height) * 0.015);
  }

  function hitTest(
    canvasPoint: Vec2,
    play: Play,
    playTime: number,
    defenseDisplayMode: RenderState['defenseDisplayMode'] = 'show'
  ): string | null {
    const radius = getPlayerRadius();
    const defenseOptions = { minSeparationYards: getMinSeparationYards() };
    for (let i = play.players.length - 1; i >= 0; i -= 1) {
      const player = play.players[i];
      if (defenseDisplayMode === 'hide-defense' && player.team === 'defense') {
        continue;
      }
      const point = worldToCanvas(getPlayerPositionWithDefense(play, player, playTime, defenseOptions));
      const distance = Math.hypot(canvasPoint.x - point.x, canvasPoint.y - point.y);
      if (distance <= radius + PLAYER_HIT_SLOP_PX) {
        return player.id;
      }
    }

    return null;
  }

  function hitTestWaypoint(canvasPoint: Vec2, playerId: string | null, play: Play): number | null {
    if (!playerId) {
      return null;
    }
    const player = play.players.find((item) => item.id === playerId);
    if (!player) {
      return null;
    }
    const route = player.route ?? [];
    if (route.length === 0) {
      return null;
    }

    const radius = getWaypointRadius();
    for (let i = route.length - 1; i >= 0; i -= 1) {
      const point = worldToCanvas(route[i].to);
      const distance = Math.hypot(canvasPoint.x - point.x, canvasPoint.y - point.y);
      if (distance <= radius + WAYPOINT_HIT_SLOP_PX) {
        return i;
      }
    }

    return null;
  }

  function hitTestZoneHandle(
    canvasPoint: Vec2,
    play: Play,
    selectedPlayerId: string | null
  ): 'x' | 'y' | null {
    if (!selectedPlayerId) {
      return null;
    }
    const player = play.players.find((item) => item.id === selectedPlayerId);
    if (!player || player.team !== 'defense' || player.assignment?.type !== 'zone') {
      return null;
    }

    const center = worldToCanvas(player.start);
    const radiusX = (player.assignment.radiusX / FIELD_WIDTH_YARDS) * field.width;
    const radiusY = (player.assignment.radiusY / FIELD_LENGTH_YARDS) * field.height;
    const handleRadius = ZONE_HANDLE_HIT_RADIUS;

    const handleX = { x: center.x + radiusX, y: center.y };
    const handleY = { x: center.x, y: center.y + radiusY };

    if (Math.hypot(canvasPoint.x - handleX.x, canvasPoint.y - handleX.y) <= handleRadius) {
      return 'x';
    }
    if (Math.hypot(canvasPoint.x - handleY.x, canvasPoint.y - handleY.y) <= handleRadius) {
      return 'y';
    }

    return null;
  }

  function getMinSeparationYards(): number {
    const radiusPx = getPlayerRadius();
    const minDistancePx = radiusPx * 2 + DEFENSE_HALO_PX;
    const yardsPerPixelX = FIELD_WIDTH_YARDS / field.width;
    const yardsPerPixelY = FIELD_LENGTH_YARDS / field.height;
    const yardsPerPixel = (yardsPerPixelX + yardsPerPixelY) / 2;
    return minDistancePx * yardsPerPixel;
  }

  return {
    resize,
    render,
    canvasToWorld,
    hitTest,
    hitTestWaypoint,
    hitTestZoneHandle,
    getFieldBounds: () => field
  };
}
