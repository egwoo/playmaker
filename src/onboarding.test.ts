import { describe, expect, it } from 'vitest';
import {
  createOnboardingState,
  dismissHint,
  endTour,
  getActiveTip,
  HINT_IDS,
  reduceOnboarding,
  setTipsEnabled,
  startTour,
  type OnboardingContext,
  type OnboardingEvent,
  type OnboardingState
} from './onboarding';

const nothingSelected: OnboardingContext = { selectedTeam: null };
const offenseSelected: OnboardingContext = { selectedTeam: 'offense' };

function freshState(): OnboardingState {
  return createOnboardingState(null, { returningUser: false });
}

function send(state: OnboardingState, events: Array<[OnboardingEvent, OnboardingContext]>): OnboardingState {
  return events.reduce((current, [event, context]) => reduceOnboarding(current, event, context), state);
}

describe('createOnboardingState', () => {
  it('treats returning users as having seen everything', () => {
    const state = createOnboardingState(null, { returningUser: true });
    expect(state.tourDone).toBe(true);
    expect(state.seenHints).toEqual(HINT_IDS);
  });

  it('restores stored progress without an active tip', () => {
    const state = createOnboardingState(
      { tourDone: true, tipsEnabled: false, seenHints: ['defense'] },
      { returningUser: false }
    );
    expect(state).toMatchObject({ tourDone: true, tipsEnabled: false, seenHints: ['defense'] });
    expect(getActiveTip(state)).toBeNull();
  });
});

describe('tour', () => {
  it('walks through run, select, waypoint, rerun, save', () => {
    let state = startTour(freshState(), nothingSelected);
    expect(getActiveTip(state)).toBe('run');

    state = send(state, [[{ type: 'playback-started' }, nothingSelected]]);
    expect(getActiveTip(state)).toBe('select');

    state = send(state, [[{ type: 'player-selected', team: 'offense' }, offenseSelected]]);
    expect(getActiveTip(state)).toBe('waypoint');

    state = send(state, [[{ type: 'waypoint-added' }, offenseSelected]]);
    expect(getActiveTip(state)).toBe('rerun');

    state = send(state, [[{ type: 'playback-started' }, offenseSelected]]);
    expect(getActiveTip(state)).toBe('save');

    state = send(state, [[{ type: 'save-clicked' }, offenseSelected]]);
    expect(getActiveTip(state)).toBeNull();
    expect(state.tourDone).toBe(true);
  });

  it('skips selecting when a player is already selected', () => {
    let state = startTour(freshState(), offenseSelected);
    state = send(state, [[{ type: 'playback-started' }, offenseSelected]]);
    expect(getActiveTip(state)).toBe('waypoint');
  });

  it('goes back to selecting when the player is deselected', () => {
    let state = startTour(freshState(), nothingSelected);
    state = send(state, [
      [{ type: 'playback-started' }, nothingSelected],
      [{ type: 'player-selected', team: 'offense' }, offenseSelected],
      [{ type: 'player-selected', team: null }, nothingSelected]
    ]);
    expect(getActiveTip(state)).toBe('select');
  });

  it('ignores defenders for the select step', () => {
    let state = startTour(freshState(), nothingSelected);
    state = send(state, [
      [{ type: 'playback-started' }, nothingSelected],
      [{ type: 'player-selected', team: 'defense' }, { selectedTeam: 'defense' }]
    ]);
    expect(getActiveTip(state)).toBe('select');
  });

  it('suppresses hints while running and marks the tour done when skipped', () => {
    let state = startTour(freshState(), nothingSelected);
    state = send(state, [[{ type: 'team-changed', team: 'defense' }, nothingSelected]]);
    expect(getActiveTip(state)).toBe('run');
    expect(state.seenHints).toEqual([]);

    state = endTour(state);
    expect(state.tourDone).toBe(true);
    expect(getActiveTip(state)).toBeNull();
  });
});

describe('hints', () => {
  it('shows a hint once and clears it when the user does the thing', () => {
    let state = send(freshState(), [[{ type: 'play-cleared' }, nothingSelected]]);
    expect(getActiveTip(state)).toBe('empty-field');

    state = send(state, [[{ type: 'player-added', team: 'offense' }, nothingSelected]]);
    expect(getActiveTip(state)).toBeNull();

    state = send(state, [[{ type: 'play-cleared' }, nothingSelected]]);
    expect(getActiveTip(state)).toBeNull();
  });

  it('replaces the current hint when a new scenario starts', () => {
    let state = send(freshState(), [
      [{ type: 'waypoint-added' }, offenseSelected],
      [{ type: 'team-changed', team: 'defense' }, nothingSelected]
    ]);
    expect(getActiveTip(state)).toBe('defense');
    expect(state.seenHints).toEqual(['waypoint-details', 'defense']);
  });

  it('chains from placing a defender to coverage', () => {
    let state = send(freshState(), [
      [{ type: 'team-changed', team: 'defense' }, nothingSelected],
      [{ type: 'player-added', team: 'defense' }, nothingSelected]
    ]);
    expect(getActiveTip(state)).toBeNull();

    state = send(state, [[{ type: 'player-selected', team: 'defense' }, { selectedTeam: 'defense' }]]);
    expect(getActiveTip(state)).toBe('coverage');
  });

  it('stays quiet when tips are turned off', () => {
    let state = send(freshState(), [[{ type: 'fullscreen-changed', active: true }, nothingSelected]]);
    expect(getActiveTip(state)).toBe('fullscreen');

    state = setTipsEnabled(state, false);
    expect(getActiveTip(state)).toBeNull();

    state = send(state, [[{ type: 'mode-changed', mode: 'game' }, nothingSelected]]);
    expect(getActiveTip(state)).toBeNull();
    expect(state.seenHints).toEqual(['fullscreen']);
  });

  it('can be dismissed', () => {
    let state = send(freshState(), [[{ type: 'start-delay-focused' }, offenseSelected]]);
    expect(getActiveTip(state)).toBe('motion');
    state = dismissHint(state);
    expect(getActiveTip(state)).toBeNull();
  });
});
