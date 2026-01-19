export type Team = 'offense' | 'defense';

export interface Vec2 {
  x: number;
  y: number;
}

export interface RouteLeg {
  to: Vec2;
  speed: number;
  action?: RouteAction;
}

export type RouteActionType = 'pass' | 'handoff';

export interface RouteAction {
  type: RouteActionType;
  targetId: string;
}

export type DefenseAssignmentType = 'man';

export interface ManAssignment {
  type: 'man';
  targetId: string;
  speed: number;
}

export interface ZoneAssignment {
  type: 'zone';
  radiusX: number;
  radiusY: number;
  speed: number;
}

export type DefenseAssignment = ManAssignment | ZoneAssignment;

export interface Player {
  id: string;
  label: string;
  team: Team;
  start: Vec2;
  route?: RouteLeg[];
  startAction?: RouteAction;
  assignment?: DefenseAssignment;
}

export interface Play {
  players: Player[];
}

const TEAMS: Team[] = ['offense', 'defense'];
export const FIELD_BEHIND_YARDS = 10;
export const FIELD_AHEAD_YARDS = 20;
export const FIELD_LENGTH_YARDS = FIELD_BEHIND_YARDS + FIELD_AHEAD_YARDS;
export const FIELD_WIDTH_YARDS = 50;
export const LINE_OF_SCRIMMAGE_YARDS_FROM_TOP = FIELD_AHEAD_YARDS;

export function createEmptyPlay(): Play {
  return { players: [] };
}

export function getPlayDuration(play: Play): number {
  return play.players.reduce((max, player) => {
    const duration = getRouteDuration(player);
    return duration > max ? duration : max;
  }, 0);
}

export function getPlayerPositionAtTime(player: Player, timeSeconds: number): Vec2 {
  if (player.team === 'defense') {
    return { ...player.start };
  }
  const route = player.route ?? [];
  if (route.length === 0) {
    return { ...player.start };
  }

  let remaining = Math.max(timeSeconds, 0);
  let from = player.start;

  for (const leg of route) {
    const duration = getLegDuration(from, leg);
    if (duration === 0) {
      from = leg.to;
      continue;
    }

    if (remaining <= duration) {
      const progress = remaining / duration;
      return {
        x: lerp(from.x, leg.to.x, progress),
        y: lerp(from.y, leg.to.y, progress)
      };
    }

    remaining -= duration;
    from = leg.to;
  }

  return { ...from };
}

export function serializePlay(play: Play): string {
  return JSON.stringify(play);
}

export function deserializePlay(raw: string): Play | null {
  try {
    const data = JSON.parse(raw);
    if (!isRecord(data) || !Array.isArray(data.players)) {
      return null;
    }

    const players: Player[] = [];
    for (const item of data.players) {
      const player = parsePlayer(item);
      if (!player) {
        return null;
      }
      players.push(player);
    }

    return { players };
  } catch {
    return null;
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVec2(value: unknown): value is Vec2 {
  if (!isRecord(value)) {
    return false;
  }
  return isNumber(value.x) && isNumber(value.y);
}

function isTeam(value: unknown): value is Team {
  return TEAMS.includes(value as Team);
}

function isRouteLeg(value: unknown): value is RouteLeg {
  if (!isRecord(value)) {
    return false;
  }
  if (!isVec2(value.to) || !isNumber(value.speed) || value.speed <= 0) {
    return false;
  }
  if ('action' in value && value.action !== undefined) {
    return isRouteAction(value.action);
  }
  return true;
}

function isRoute(value: unknown): value is RouteLeg[] {
  return Array.isArray(value) && value.every(isRouteLeg);
}

function parsePlayer(value: unknown): Player | null {
  if (!isRecord(value)) {
    return null;
  }

  const { id, label, team, start } = value;

  if (typeof id !== 'string' || typeof label !== 'string' || !isTeam(team) || !isVec2(start)) {
    return null;
  }

  let route: RouteLeg[] | undefined;
  let startAction: RouteAction | undefined;
  if (team === 'offense') {
    if ('route' in value && value.route !== undefined) {
      if (!isRoute(value.route)) {
        return null;
      }
      route = value.route;
    }

    if ('startAction' in value && value.startAction !== undefined) {
      if (!isRouteAction(value.startAction)) {
        return null;
      }
      startAction = value.startAction;
    }
  }

  let assignment: DefenseAssignment | undefined;
  if (team === 'defense' && 'assignment' in value && value.assignment !== undefined) {
    if (!isDefenseAssignment(value.assignment)) {
      return null;
    }
    assignment = value.assignment;
  }

  return { id, label, team, start, route, startAction, assignment };
}

export function getRouteDuration(player: Player): number {
  if (player.team === 'defense') {
    return 0;
  }
  const route = player.route ?? [];
  let total = 0;
  let from = player.start;
  for (const leg of route) {
    total += getLegDuration(from, leg);
    from = leg.to;
  }
  return total;
}

export function getLegDuration(from: Vec2, leg: RouteLeg): number {
  if (leg.speed <= 0) {
    return 0;
  }
  const distance = getDistanceYards(from, leg.to);
  if (distance === 0) {
    return 0;
  }
  return distance / leg.speed;
}

export function getDistanceYards(from: Vec2, to: Vec2): number {
  const dx = (to.x - from.x) * FIELD_WIDTH_YARDS;
  const dy = (to.y - from.y) * FIELD_LENGTH_YARDS;
  return Math.hypot(dx, dy);
}

function isRouteAction(value: unknown): value is RouteAction {
  if (!isRecord(value)) {
    return false;
  }
  const { type, targetId } = value;
  if (type !== 'pass' && type !== 'handoff') {
    return false;
  }
  return typeof targetId === 'string';
}

function isDefenseAssignment(value: unknown): value is DefenseAssignment {
  if (!isRecord(value)) {
    return false;
  }
  const { type } = value;
  if (type === 'man') {
    return isManAssignment(value);
  }
  if (type === 'zone') {
    return isZoneAssignment(value);
  }
  return false;
}

function isManAssignment(value: Record<string, unknown>): value is ManAssignment {
  return typeof value.targetId === 'string' && isNumber(value.speed) && value.speed > 0;
}

function isZoneAssignment(value: Record<string, unknown>): value is ZoneAssignment {
  return (
    isNumber(value.radiusX) &&
    value.radiusX > 0 &&
    isNumber(value.radiusY) &&
    value.radiusY > 0 &&
    isNumber(value.speed) &&
    value.speed > 0
  );
}
