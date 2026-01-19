import { describe, expect, it } from 'vitest';
import { getBallEndTime, getBallState } from './ball';
import { FIELD_WIDTH_YARDS, type Play, type Player } from './model';

describe('getBallState', () => {
  it('starts with the first offensive player', () => {
    const play: Play = {
      players: [
        { id: 'd1', label: 'D1', team: 'defense', start: { x: 0.2, y: 0.2 } },
        { id: 'o1', label: 'O1', team: 'offense', start: { x: 0.4, y: 0.2 } },
        { id: 'o2', label: 'O2', team: 'offense', start: { x: 0.6, y: 0.2 } }
      ]
    };

    const state = getBallState(play, 0, 12);
    expect(state.carrierId).toBe('o1');
    expect(state.position).toEqual({ x: 0.4, y: 0.2 });
    expect(state.inAir).toBe(false);
  });

  it('throws to a stationary receiver at constant speed', () => {
    const passer: Player = {
      id: 'o1',
      label: 'O1',
      team: 'offense',
      start: { x: 0, y: 0 },
      route: [
        {
          to: { x: 0, y: 0 },
          speed: 5,
          action: { type: 'pass', targetId: 'o2' }
        }
      ]
    };
    const receiver: Player = {
      id: 'o2',
      label: 'O2',
      team: 'offense',
      start: { x: 1, y: 0 }
    };

    const play: Play = {
      players: [passer, receiver]
    };

    const ballSpeed = FIELD_WIDTH_YARDS / 2; // 15 yd/s for a 30 yd throw.
    const midFlight = getBallState(play, 1, ballSpeed);
    expect(midFlight.inAir).toBe(true);
    expect(midFlight.position?.x).toBeCloseTo(0.5, 4);
    expect(midFlight.position?.y).toBeCloseTo(0, 4);

    const afterCatch = getBallState(play, 3, ballSpeed);
    expect(afterCatch.inAir).toBe(false);
    expect(afterCatch.carrierId).toBe('o2');
    expect(afterCatch.position).toEqual({ x: 1, y: 0 });
  });

  it('supports a start action at time zero', () => {
    const play: Play = {
      players: [
        {
          id: 'o1',
          label: 'O1',
          team: 'offense',
          start: { x: 0, y: 0 },
          startAction: { type: 'pass', targetId: 'o2' }
        },
        {
          id: 'o2',
          label: 'O2',
          team: 'offense',
          start: { x: 1, y: 0 }
        }
      ]
    };

    const ballSpeed = FIELD_WIDTH_YARDS; // 30 yd/s for a 30 yd throw.
    const midFlight = getBallState(play, 0.5, ballSpeed);
    expect(midFlight.inAir).toBe(true);
    expect(midFlight.position?.x).toBeCloseTo(0.5, 4);
    expect(midFlight.position?.y).toBeCloseTo(0, 4);

    const afterCatch = getBallState(play, 1.2, ballSpeed);
    expect(afterCatch.inAir).toBe(false);
    expect(afterCatch.carrierId).toBe('o2');
  });

  it('extends ball timing until the pass completes', () => {
    const play: Play = {
      players: [
        {
          id: 'o1',
          label: 'O1',
          team: 'offense',
          start: { x: 0, y: 0 },
          startAction: { type: 'pass', targetId: 'o2' }
        },
        {
          id: 'o2',
          label: 'O2',
          team: 'offense',
          start: { x: 1, y: 0 }
        }
      ]
    };

    const ballSpeed = 10; // 10 yd/s for a 30 yd throw.
    const endTime = getBallEndTime(play, ballSpeed);
    expect(endTime).toBeCloseTo(5, 2);
  });
});
