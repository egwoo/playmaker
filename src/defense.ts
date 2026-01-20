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
  minSeparationYards?: number;
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
  const separation = options.minSeparationYards ?? 0;

  let position = defender.start;
  let currentTime = 0;

  while (currentTime < timeSeconds) {
    const dt = Math.min(stepSeconds, timeSeconds - currentTime);
    const offensePos = getPlayerPositionAtTime(target, currentTime + dt);
    const desired = stepTowardCoverage(position, offensePos, radius, speed, dt);
    position = applySeparationStep(
      play,
      currentTime + dt,
      position,
      desired,
      speed * dt,
      separation
    );
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
  const separation = options.minSeparationYards ?? 0;
  const center = defender.start;

  let position = defender.start;
  let currentTime = 0;

  while (currentTime < timeSeconds) {
    const dt = Math.min(stepSeconds, timeSeconds - currentTime);
    const offenseTarget = pickZoneTarget(play, currentTime + dt, center, radiusX, radiusY, position);
    const desired = offenseTarget
      ? clampPointToEllipse(offenseTarget, center, radiusX, radiusY)
      : center;
    const stepped = stepTowardZone(position, desired, center, radiusX, radiusY, speed, dt);
    position = applySeparationStep(
      play,
      currentTime + dt,
      position,
      stepped,
      speed * dt,
      separation,
      { center, radiusX, radiusY }
    );
    currentTime += dt;
  }

  return position;
}

function applySeparationStep(
  play: Play,
  timeSeconds: number,
  previous: Vec2,
  desired: Vec2,
  maxStep: number,
  minSeparationYards: number,
  zone?: { center: Vec2; radiusX: number; radiusY: number }
): Vec2 {
  if (minSeparationYards <= 0) {
    return desired;
  }
  const offenses = play.players.filter((player) => player.team === 'offense');
  if (offenses.length === 0) {
    return desired;
  }

  const desiredYards = toYards(desired);
  const previousYards = toYards(previous);
  let closest = toYards(getPlayerPositionAtTime(offenses[0], timeSeconds));
  let closestDistance = Math.hypot(desiredYards.x - closest.x, desiredYards.y - closest.y);

  for (let i = 1; i < offenses.length; i += 1) {
    const offensePos = toYards(getPlayerPositionAtTime(offenses[i], timeSeconds));
    const distance = Math.hypot(desiredYards.x - offensePos.x, desiredYards.y - offensePos.y);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = offensePos;
    }
  }

  if (closestDistance >= minSeparationYards) {
    return desired;
  }

  let dx = desiredYards.x - closest.x;
  let dy = desiredYards.y - closest.y;
  let distance = Math.hypot(dx, dy);
  if (distance < 1e-6) {
    dx = previousYards.x - closest.x;
    dy = previousYards.y - closest.y;
    distance = Math.hypot(dx, dy);
  }
  if (distance < 1e-6) {
    dx = 1;
    dy = 0;
    distance = 1;
  }

  const scale = minSeparationYards / distance;
  const adjustedYards = {
    x: closest.x + dx * scale,
    y: closest.y + dy * scale
  };

  let adjusted = fromYards({
    x: clamp(adjustedYards.x, 0, FIELD_WIDTH_YARDS),
    y: clamp(adjustedYards.y, 0, FIELD_LENGTH_YARDS)
  });

  if (zone) {
    adjusted = clampPointToEllipse(adjusted, zone.center, zone.radiusX, zone.radiusY);
  }

  const adjustedYardsFinal = toYards(adjusted);
  const stepVec = subtractVec(adjustedYardsFinal, previousYards);
  const stepDistance = Math.hypot(stepVec.x, stepVec.y);

  if (stepDistance <= maxStep || maxStep <= 0) {
    return adjusted;
  }

  const scaleStep = maxStep / stepDistance;
  return fromYards({
    x: previousYards.x + stepVec.x * scaleStep,
    y: previousYards.y + stepVec.y * scaleStep
  });
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

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
