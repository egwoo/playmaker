import { describe, expect, it } from 'vitest';
import { getPlayerPositionWithDefense } from './defense';
import { FIELD_LENGTH_YARDS, FIELD_WIDTH_YARDS, type Play, type Player } from './model';

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
