import { describe, expect, it } from 'vitest';
import {
  createEmptyPlay,
  deserializePlay,
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  getPlayDuration,
  getPlayerPositionAtTime,
  serializePlay,
  type Play,
  type Player
} from './model';

describe('getPlayerPositionAtTime', () => {
  it('returns start position when there is no move', () => {
    const player: Player = {
      id: 'p1',
      label: 'O1',
      team: 'offense',
      start: { x: 0.25, y: 0.4 }
    };

    expect(getPlayerPositionAtTime(player, 0)).toEqual({ x: 0.25, y: 0.4 });
    expect(getPlayerPositionAtTime(player, 3)).toEqual({ x: 0.25, y: 0.4 });
  });

  it('interpolates linearly for a single leg', () => {
    const player: Player = {
      id: 'p2',
      label: 'D1',
      team: 'offense',
      start: { x: 0, y: 0 },
      route: [{ to: { x: 1, y: 0 }, speed: FIELD_WIDTH_YARDS }]
    };

    expect(getPlayerPositionAtTime(player, 0)).toEqual({ x: 0, y: 0 });
    expect(getPlayerPositionAtTime(player, 0.5)).toEqual({ x: 0.5, y: 0 });
    expect(getPlayerPositionAtTime(player, 1)).toEqual({ x: 1, y: 0 });
    expect(getPlayerPositionAtTime(player, 2)).toEqual({ x: 1, y: 0 });
  });

  it('moves across multiple legs in sequence', () => {
    const player: Player = {
      id: 'p3',
      label: 'O2',
      team: 'offense',
      start: { x: 0, y: 0 },
      route: [
        { to: { x: 1, y: 0 }, speed: FIELD_WIDTH_YARDS },
        { to: { x: 1, y: 1 }, speed: FIELD_LENGTH_YARDS }
      ]
    };

    expect(getPlayerPositionAtTime(player, 0.5)).toEqual({ x: 0.5, y: 0 });
    expect(getPlayerPositionAtTime(player, 1.5)).toEqual({ x: 1, y: 0.5 });
    expect(getPlayerPositionAtTime(player, 2)).toEqual({ x: 1, y: 1 });
  });
});

describe('getPlayDuration', () => {
  it('returns 0 for an empty play', () => {
    const play = createEmptyPlay();
    expect(getPlayDuration(play)).toBe(0);
  });

  it('returns the longest move duration for offense only', () => {
    const play: Play = {
      players: [
        {
          id: 'p1',
          label: 'O1',
          team: 'offense',
          start: { x: 0, y: 0 },
          route: [{ to: { x: 1, y: 0 }, speed: FIELD_WIDTH_YARDS }]
        },
        {
          id: 'p2',
          label: 'D1',
          team: 'defense',
          start: { x: 0, y: 0 },
          route: [{ to: { x: 0, y: 1 }, speed: FIELD_LENGTH_YARDS / 2 }]
        }
      ]
    };

    expect(getPlayDuration(play)).toBe(1);
  });
});

describe('serializePlay / deserializePlay', () => {
  it('round trips a play', () => {
    const play: Play = {
      players: [
        {
          id: 'p1',
          label: 'O1',
          team: 'offense',
          start: { x: 0.1, y: 0.2 },
          route: [
            { to: { x: 0.4, y: 0.8 }, speed: 5.2 },
            { to: { x: 0.6, y: 0.9 }, speed: 4.1 }
          ]
        }
      ]
    };

    const encoded = serializePlay(play);
    const decoded = deserializePlay(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(play);
  });

  it('returns null for invalid payloads', () => {
    expect(deserializePlay('not-json')).toBeNull();
    expect(deserializePlay('{"players":[{"team":"oops"}]}')).toBeNull();
    expect(
      deserializePlay(
        JSON.stringify({
          players: [
            {
              id: 'p1',
              label: 'O1',
              team: 'offense',
              start: { x: 0.1, y: 0.2 },
              route: [{ to: { x: 0.4, y: 0.8 }, speed: -1 }]
            }
          ]
        })
      )
    ).toBeNull();
  });
});
