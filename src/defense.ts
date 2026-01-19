import {
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  getPlayerPositionAtTime,
  type Play,
  type Player,
  type Vec2
} from './model';

export const DEFAULT_COVERAGE_RADIUS_YARDS = 1;
export const DEFAULT_DEFENSE_SPEED_YPS = 6;
const DEFAULT_STEP_SECONDS = 0.05;

export interface DefenseOptions {
  radiusYards?: number;
  defaultSpeed?: number;
  stepSeconds?: number;
}

export function getPlayerPositionWithDefense(
  play: Play,
  player: Player,
  timeSeconds: number,
  options: DefenseOptions = {}
): Vec2 {
  if (player.team !== 'defense') {
    return getPlayerPositionAtTime(player, timeSeconds);
  }

  if (!player.assignment) {
    return player.start;
  }

  if (player.assignment.type === 'man') {
    return getManCoveragePosition(play, player, timeSeconds, options);
  }

  return getZoneCoveragePosition(play, player, timeSeconds, options);
}

function getManCoveragePosition(
  play: Play,
  defender: Player,
  timeSeconds: number,
  options: DefenseOptions
): Vec2 {
  if (defender.assignment?.type !== 'man') {
    return defender.start;
  }
  const targetId = defender.assignment.targetId;

  const target = play.players.find((player) => player.id === targetId);
  if (!target) {
    return defender.start;
  }

  const radius = options.radiusYards ?? DEFAULT_COVERAGE_RADIUS_YARDS;
  const speed = defender.assignment.speed ?? options.defaultSpeed ?? DEFAULT_DEFENSE_SPEED_YPS;
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;

  let position = defender.start;
  let currentTime = 0;

  while (currentTime < timeSeconds) {
    const dt = Math.min(stepSeconds, timeSeconds - currentTime);
    const offensePos = getPlayerPositionAtTime(target, currentTime + dt);
    position = stepTowardCoverage(position, offensePos, radius, speed, dt);
    currentTime += dt;
  }

  return position;
}

function getZoneCoveragePosition(
  play: Play,
  defender: Player,
  timeSeconds: number,
  options: DefenseOptions
): Vec2 {
  if (defender.assignment?.type !== 'zone') {
    return defender.start;
  }

  const radiusX = defender.assignment.radiusX;
  const radiusY = defender.assignment.radiusY;
  const speed = defender.assignment.speed ?? options.defaultSpeed ?? DEFAULT_DEFENSE_SPEED_YPS;
  const stepSeconds = options.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const center = defender.start;

  let position = defender.start;
  let currentTime = 0;

  while (currentTime < timeSeconds) {
    const dt = Math.min(stepSeconds, timeSeconds - currentTime);
    const offenseTarget = pickZoneTarget(play, currentTime + dt, center, radiusX, radiusY, position);
    const desired = offenseTarget
      ? clampPointToEllipse(offenseTarget, center, radiusX, radiusY)
      : center;
    position = stepTowardZone(position, desired, center, radiusX, radiusY, speed, dt);
    currentTime += dt;
  }

  return position;
}

function pickZoneTarget(
  play: Play,
  timeSeconds: number,
  center: Vec2,
  radiusX: number,
  radiusY: number,
  defender: Vec2
): Vec2 | null {
  const offenses = play.players.filter((player) => player.team === 'offense');
  if (offenses.length === 0) {
    return null;
  }

  let best: Vec2 | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const offense of offenses) {
    const position = getPlayerPositionAtTime(offense, timeSeconds);
    const clamped = clampPointToEllipse(position, center, radiusX, radiusY);
    const distanceToZone = distanceYards(position, clamped);
    const defenderDistance = distanceYards(defender, clamped);
    const score = distanceToZone * 10 + defenderDistance;
    if (score < bestScore) {
      bestScore = score;
      best = clamped;
    }
  }

  return best;
}

function stepTowardZone(
  defender: Vec2,
  desired: Vec2,
  center: Vec2,
  radiusX: number,
  radiusY: number,
  speedYps: number,
  dt: number
): Vec2 {
  const defenderYards = toYards(defender);
  const desiredYards = toYards(desired);
  const toDesired = subtractVec(desiredYards, defenderYards);
  const distToDesired = Math.hypot(toDesired.x, toDesired.y);
  if (distToDesired < 1e-6) {
    return defender;
  }

  const maxStep = Math.max(0, speedYps * dt);
  const scale = Math.min(1, maxStep / distToDesired);
  const next = {
    x: defenderYards.x + toDesired.x * scale,
    y: defenderYards.y + toDesired.y * scale
  };

  const bounded = clampPointToEllipse(fromYards(next), center, radiusX, radiusY);
  return bounded;
}

function stepTowardCoverage(
  defender: Vec2,
  offense: Vec2,
  radiusYards: number,
  speedYps: number,
  dt: number
): Vec2 {
  const defenderYards = toYards(defender);
  const offenseYards = toYards(offense);
  const delta = subtractVec(defenderYards, offenseYards);
  const distance = Math.hypot(delta.x, delta.y);

  let desired: Vec2;
  if (distance < 1e-6) {
    desired = { x: offenseYards.x + radiusYards, y: offenseYards.y };
  } else {
    desired = {
      x: offenseYards.x + (delta.x / distance) * radiusYards,
      y: offenseYards.y + (delta.y / distance) * radiusYards
    };
  }

  const toDesired = subtractVec(desired, defenderYards);
  const distToDesired = Math.hypot(toDesired.x, toDesired.y);
  if (distToDesired < 1e-6) {
    return defender;
  }

  const maxStep = Math.max(0, speedYps * dt);
  if (distToDesired <= maxStep) {
    return fromYards(desired);
  }

  const scale = maxStep / distToDesired;
  const next = {
    x: defenderYards.x + toDesired.x * scale,
    y: defenderYards.y + toDesired.y * scale
  };

  return fromYards(next);
}

function toYards(position: Vec2): Vec2 {
  return {
    x: position.x * FIELD_WIDTH_YARDS,
    y: position.y * FIELD_LENGTH_YARDS
  };
}

function fromYards(position: Vec2): Vec2 {
  return {
    x: position.x / FIELD_WIDTH_YARDS,
    y: position.y / FIELD_LENGTH_YARDS
  };
}

function subtractVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function clampPointToEllipse(point: Vec2, center: Vec2, radiusX: number, radiusY: number): Vec2 {
  const centerYards = toYards(center);
  const pointYards = toYards(point);
  const dx = pointYards.x - centerYards.x;
  const dy = pointYards.y - centerYards.y;
  const nx = radiusX > 0 ? dx / radiusX : 0;
  const ny = radiusY > 0 ? dy / radiusY : 0;
  const distance = Math.hypot(nx, ny);
  if (distance <= 1) {
    return point;
  }
  const scale = 1 / distance;
  const clampedYards = {
    x: centerYards.x + dx * scale,
    y: centerYards.y + dy * scale
  };
  return fromYards(clampedYards);
}

function distanceYards(a: Vec2, b: Vec2): number {
  const aYards = toYards(a);
  const bYards = toYards(b);
  return Math.hypot(aYards.x - bYards.x, aYards.y - bYards.y);
}
