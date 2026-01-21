import {
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  getDistanceYards,
  getLegDuration,
  getPlayerPositionAtTime,
  type Play,
  type Player,
  type RouteLeg,
  type RouteActionType,
  type Vec2
} from './model';

export const DEFAULT_BALL_SPEED_YPS = 18;
const EPSILON = 1e-6;

export interface BallFlight {
  start: Vec2;
  end: Vec2;
  progress: number;
}

export interface BallState {
  position: Vec2 | null;
  carrierId: string | null;
  inAir: boolean;
  flight?: BallFlight;
}

interface BallEvent {
  time: number;
  passerId: string;
  targetId: string;
  type: RouteActionType;
  order: number;
}

interface Segment {
  startTime: number;
  endTime: number;
  start: Vec2;
  end: Vec2;
  velocityYards: Vec2;
}

export function getBallState(play: Play, time: number, ballSpeed: number): BallState {
  const initialCarrier = play.players.find((player) => player.team === 'offense') ?? null;
  if (!initialCarrier) {
    return { position: null, carrierId: null, inAir: false };
  }

  const events = collectBallEvents(play);
  let carrier = initialCarrier;
  let ballUnavailableUntil = 0;

  for (const event of events) {
    if (event.time > time) {
      break;
    }
    if (event.time < ballUnavailableUntil) {
      continue;
    }
    if (carrier.id !== event.passerId) {
      continue;
    }
    if (event.targetId === carrier.id) {
      continue;
    }

    const target = play.players.find((player) => player.id === event.targetId);
    if (!target) {
      continue;
    }

    const passStart = getPlayerPositionAtTime(carrier, event.time);
    const intercept = findIntercept(passStart, event.time, target, ballSpeed);
    if (!intercept) {
      continue;
    }

    if (intercept.time <= event.time + EPSILON) {
      carrier = target;
      ballUnavailableUntil = intercept.time;
      continue;
    }

    if (time < intercept.time) {
      const duration = intercept.time - event.time;
      const progress = clamp((time - event.time) / duration, 0, 1);
      return {
        position: {
          x: lerp(passStart.x, intercept.point.x, progress),
          y: lerp(passStart.y, intercept.point.y, progress)
        },
        carrierId: carrier.id,
        inAir: true,
        flight: {
          start: passStart,
          end: intercept.point,
          progress
        }
      };
    }

    carrier = target;
    ballUnavailableUntil = intercept.time;
  }

  return {
    position: getPlayerPositionAtTime(carrier, time),
    carrierId: carrier.id,
    inAir: false
  };
}

export function getBallEndTime(play: Play, ballSpeed: number): number {
  const initialCarrier = play.players.find((player) => player.team === 'offense') ?? null;
  if (!initialCarrier) {
    return 0;
  }

  const events = collectBallEvents(play);
  let carrier = initialCarrier;
  let ballUnavailableUntil = 0;
  let lastTime = 0;

  for (const event of events) {
    if (event.time < ballUnavailableUntil) {
      continue;
    }
    if (carrier.id !== event.passerId) {
      continue;
    }
    if (event.targetId === carrier.id) {
      continue;
    }

    const target = play.players.find((player) => player.id === event.targetId);
    if (!target) {
      continue;
    }

    const passStart = getPlayerPositionAtTime(carrier, event.time);
    const intercept = findIntercept(passStart, event.time, target, ballSpeed);
    if (!intercept) {
      continue;
    }

    carrier = target;
    ballUnavailableUntil = intercept.time;
    if (intercept.time > lastTime) {
      lastTime = intercept.time;
    }
  }

  return lastTime;
}

function collectBallEvents(play: Play): BallEvent[] {
  const events: BallEvent[] = [];
  let order = 0;
  for (const player of play.players) {
    if (player.team !== 'offense') {
      continue;
    }
    const route = player.route ?? [];
    const delay = player.startDelay ?? 0;
    if (player.startAction) {
      events.push({
        time: Math.max(0, delay),
        passerId: player.id,
        targetId: player.startAction.targetId,
        type: player.startAction.type,
        order: order++
      });
    }
    let currentTime = delay;
    let from = player.start;
    for (const leg of route) {
      const duration = getLegDuration(from, leg);
      currentTime += duration;
      from = leg.to;
      const wait = Math.max(0, leg.delay ?? 0);
      if (!leg.action) {
        currentTime += wait;
        continue;
      }
      events.push({
        time: Math.max(0, currentTime + wait),
        passerId: player.id,
        targetId: leg.action.targetId,
        type: leg.action.type,
        order: order++
      });
      currentTime += wait;
    }
  }

  return events.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.order - b.order));
}

function findIntercept(origin: Vec2, passTime: number, target: Player, speed: number) {
  if (speed <= 0) {
    return null;
  }
  const segments = getPlayerSegments(target);
  let bestTime: number | null = null;

  for (const segment of segments) {
    const solution = solveInterceptOnSegment(origin, passTime, speed, segment);
    if (solution === null) {
      continue;
    }
    if (bestTime === null || solution < bestTime) {
      bestTime = solution;
    }
  }

  if (bestTime === null) {
    return null;
  }

  return {
    time: bestTime,
    point: getPlayerPositionAtTime(target, bestTime)
  };
}

function getPlayerSegments(player: Player): Segment[] {
  const segments: Segment[] = [];
  const route = player.route ?? [];
  const startDelay = player.startDelay ?? 0;
  let currentTime = startDelay;
  let from = player.start;

  if (startDelay > 0) {
    segments.push({
      startTime: 0,
      endTime: startDelay,
      start: from,
      end: from,
      velocityYards: { x: 0, y: 0 }
    });
  }

  for (const leg of route) {
    const duration = getLegDuration(from, leg);
    const end = leg.to;
    const startYards = toYards(from);
    const endYards = toYards(end);
    const velocityYards = duration > 0 ? scaleVec(subtractVec(endYards, startYards), 1 / duration) : { x: 0, y: 0 };

    segments.push({
      startTime: currentTime,
      endTime: currentTime + duration,
      start: from,
      end,
      velocityYards
    });

    currentTime += duration;
    from = end;

    const wait = Math.max(0, leg.delay ?? 0);
    if (wait > 0) {
      segments.push({
        startTime: currentTime,
        endTime: currentTime + wait,
        start: from,
        end: from,
        velocityYards: { x: 0, y: 0 }
      });
      currentTime += wait;
    }
  }

  segments.push({
    startTime: currentTime,
    endTime: Number.POSITIVE_INFINITY,
    start: from,
    end: from,
    velocityYards: { x: 0, y: 0 }
  });

  return segments;
}

function solveInterceptOnSegment(origin: Vec2, passTime: number, speed: number, segment: Segment): number | null {
  const segmentStart = Math.max(segment.startTime, passTime);
  const segmentEnd = segment.endTime;
  if (segmentStart > segmentEnd) {
    return null;
  }

  const originYards = toYards(origin);
  const segmentStartYards = toYards(segment.start);
  const v = segment.velocityYards;

  const r0 = {
    x: segmentStartYards.x - v.x * segment.startTime,
    y: segmentStartYards.y - v.y * segment.startTime
  };
  const d = subtractVec(r0, originYards);

  const a = v.x * v.x + v.y * v.y - speed * speed;
  const b = 2 * (d.x * v.x + d.y * v.y + speed * speed * passTime);
  const c = d.x * d.x + d.y * d.y - speed * speed * passTime * passTime;

  const solutions: number[] = [];
  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) < EPSILON) {
      return null;
    }
    solutions.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      return null;
    }
    const sqrt = Math.sqrt(disc);
    solutions.push((-b - sqrt) / (2 * a));
    solutions.push((-b + sqrt) / (2 * a));
  }

  let best: number | null = null;
  for (const t of solutions) {
    if (t < segmentStart - EPSILON) {
      continue;
    }
    if (t > segmentEnd + EPSILON) {
      continue;
    }
    if (t < passTime - EPSILON) {
      continue;
    }
    if (best === null || t < best) {
      best = t;
    }
  }

  return best;
}

function toYards(position: Vec2): Vec2 {
  return {
    x: position.x * FIELD_WIDTH_YARDS,
    y: position.y * FIELD_LENGTH_YARDS
  };
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function subtractVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scaleVec(a: Vec2, scale: number): Vec2 {
  return { x: a.x * scale, y: a.y * scale };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Used elsewhere for tests and UI cues.
export function getRouteDistanceYards(from: Vec2, legs: RouteLeg[]): number {
  let total = 0;
  let current = from;
  for (const leg of legs) {
    total += getDistanceYards(current, leg.to);
    current = leg.to;
  }
  return total;
}
