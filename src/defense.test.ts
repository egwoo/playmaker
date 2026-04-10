import { describe, expect, it } from 'vitest';
import { getPlayerPositionWithDefense } from './defense';
import {
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  LINE_OF_SCRIMMAGE_YARDS_FROM_TOP,
  type Play,
  type Player
} from './model';

describe('getPlayerPositionWithDefense', () => {
  it('moves a defender toward a 1-yard cushion with max speed', () => {
    const offense: Player = {
      id: 'o1',
      label: 'O1',
      team: 'offense',
      start: { x: 1, y: 0 }
    };
    const defender: Player = {
      id: 'd1',
      label: 'D1',
      team: 'defense',
      start: { x: 0, y: 0 },
      assignment: {
        type: 'man',
        targetId: 'o1',
        speed: 6
      }
    };

    const play: Play = { players: [offense, defender] };

    const positionAtOne = getPlayerPositionWithDefense(play, defender, 1, { stepSeconds: 0.1 });
    expect(positionAtOne.x).toBeCloseTo(6 / FIELD_WIDTH_YARDS, 2);
    expect(positionAtOne.y).toBeCloseTo(0, 2);

    const positionAtFive = getPlayerPositionWithDefense(play, defender, 5, { stepSeconds: 0.1 });
    const maxTravel = (defender.assignment?.speed ?? 0) * 5;
    const expectedX = Math.min(1 - 1 / FIELD_WIDTH_YARDS, maxTravel / FIELD_WIDTH_YARDS);
    expect(positionAtFive.x).toBeCloseTo(expectedX, 2);
  });

  it('tracks pre-snap motion for a man coverage defender', () => {
    const offense: Player = {
      id: 'o1',
      label: 'O1',
      team: 'offense',
      start: { x: 0.4, y: 0.5 },
      startDelay: -1,
      route: [{ to: { x: 0.6, y: 0.5 }, speed: 10 }]
    };
    const defender: Player = {
      id: 'd1',
      label: 'D1',
      team: 'defense',
      start: { x: 0.4, y: 0.4 },
      assignment: {
        type: 'man',
        targetId: 'o1',
        speed: 12
      }
    };

    const play: Play = { players: [offense, defender] };
    const position = getPlayerPositionWithDefense(play, defender, -0.5, { stepSeconds: 0.05 });

    expect(position.x).toBeGreaterThan(defender.start.x);
    expect(position.y).toBeGreaterThan(defender.start.y);
  });

  it('keeps a man defender behind the line of scrimmage before the snap', () => {
    const lineOfScrimmage = LINE_OF_SCRIMMAGE_YARDS_FROM_TOP / FIELD_LENGTH_YARDS;
    const offense: Player = {
      id: 'o1',
      label: 'O1',
      team: 'offense',
      start: { x: 0.4, y: lineOfScrimmage },
      startDelay: -1,
      route: [{ to: { x: 0.4, y: lineOfScrimmage + 0.12 }, speed: 8 }]
    };
    const defender: Player = {
      id: 'd1',
      label: 'D1',
      team: 'defense',
      start: { x: 0.4, y: lineOfScrimmage - 0.04 },
      assignment: {
        type: 'man',
        targetId: 'o1',
        speed: 20
      }
    };

    const play: Play = { players: [offense, defender] };
    const position = getPlayerPositionWithDefense(play, defender, -0.1, { stepSeconds: 0.05 });

    expect(position.y).toBeLessThanOrEqual(lineOfScrimmage - 1 / FIELD_LENGTH_YARDS + 1e-6);
  });

  it('ignores separation collisions before the snap', () => {
    const offense: Player = {
      id: 'o1',
      label: 'O1',
      team: 'offense',
      start: { x: 0.4, y: 0.5 },
      startDelay: -1,
      route: [{ to: { x: 0.6, y: 0.5 }, speed: 10 }]
    };
    const center: Player = {
      id: 'o2',
      label: 'C',
      team: 'offense',
      start: { x: 0.52, y: 0.5 }
    };
    const defender: Player = {
      id: 'd1',
      label: 'D1',
      team: 'defense',
      start: { x: 0.4, y: 0.4 },
      assignment: {
        type: 'man',
        targetId: 'o1',
        speed: 12
      }
    };

    const play: Play = { players: [offense, center, defender] };
    const position = getPlayerPositionWithDefense(play, defender, -0.5, {
      stepSeconds: 0.05,
      minSeparationYards: 20
    });

    expect(position.x).toBeGreaterThan(defender.start.x);
    expect(position.x).toBeGreaterThan(0.45);
  });

  it('keeps a zone defender inside the ellipse while shading toward offense', () => {
    const offense: Player = {
      id: 'o1',
      label: 'O1',
      team: 'offense',
      start: { x: 1, y: 0 }
    };
    const defender: Player = {
      id: 'd1',
      label: 'D1',
      team: 'defense',
      start: { x: 0, y: 0 },
      assignment: {
        type: 'zone',
        radiusX: 10,
        radiusY: 5,
        speed: 6
      }
    };

    const play: Play = { players: [offense, defender] };
    const position = getPlayerPositionWithDefense(play, defender, 2, { stepSeconds: 0.1 });

    const maxX = 10 / FIELD_WIDTH_YARDS;
    const maxY = 5 / FIELD_LENGTH_YARDS;
    const normalized =
      (position.x / maxX) * (position.x / maxX) + (position.y / maxY) * (position.y / maxY);
    expect(normalized).toBeLessThanOrEqual(1.001);
  });

  it('keeps defenders at their start when unassigned', () => {
    const defender: Player = {
      id: 'd1',
      label: 'D1',
      team: 'defense',
      start: { x: 0.2, y: 0.4 },
      route: [{ to: { x: 0.9, y: 0.9 }, speed: 8 }]
    };

    const play: Play = { players: [defender] };
    const position = getPlayerPositionWithDefense(play, defender, 5, { stepSeconds: 0.1 });
    expect(position).toEqual({ x: 0.2, y: 0.4 });
  });
});
