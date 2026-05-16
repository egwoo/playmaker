import { describe, expect, it } from 'vitest';

import { canEditPlayForState, resolveEffectivePlayMode, resolveSelectedPlaybookId } from './ui-state';

describe('resolveSelectedPlaybookId', () => {
  const playbooks = [
    { id: 'alpha', name: 'Alpha' },
    { id: 'bravo', name: 'Bravo' },
    { id: 'charlie', name: 'Charlie' }
  ];

  it('keeps the current playbook when it is still available', () => {
    expect(resolveSelectedPlaybookId(playbooks, 'bravo', 'alpha')).toBe('bravo');
  });

  it('restores the persisted playbook when the current selection is unavailable', () => {
    expect(resolveSelectedPlaybookId(playbooks, null, 'charlie')).toBe('charlie');
  });

  it('falls back to the first playbook when neither selection is available', () => {
    expect(resolveSelectedPlaybookId(playbooks, 'missing', 'also-missing')).toBe('alpha');
  });

  it('returns null when there are no playbooks', () => {
    expect(resolveSelectedPlaybookId([], 'alpha', 'alpha')).toBeNull();
  });
});

describe('resolveEffectivePlayMode', () => {
  it('puts anonymous scratch sessions into design mode even when the saved mode is plays', () => {
    expect(
      resolveEffectivePlayMode({
        persistedPlayMode: 'game',
        currentRole: null,
        currentUserId: null,
        sharedPlayActive: false
      })
    ).toBe('design');
  });

  it('keeps anonymous shared play links in plays mode', () => {
    expect(
      resolveEffectivePlayMode({
        persistedPlayMode: 'design',
        currentRole: null,
        currentUserId: null,
        sharedPlayActive: true
      })
    ).toBe('game');
  });

  it('uses the saved mode for coaches', () => {
    expect(
      resolveEffectivePlayMode({
        persistedPlayMode: 'design',
        currentRole: 'coach',
        currentUserId: 'user-1',
        sharedPlayActive: false
      })
    ).toBe('design');
  });

  it('keeps players in plays mode even if design was saved', () => {
    expect(
      resolveEffectivePlayMode({
        persistedPlayMode: 'design',
        currentRole: 'player',
        currentUserId: 'user-1',
        sharedPlayActive: false
      })
    ).toBe('game');
  });
});

describe('canEditPlayForState', () => {
  it('allows anonymous scratch sessions to edit', () => {
    expect(
      canEditPlayForState({
        persistedPlayMode: 'game',
        currentRole: null,
        currentUserId: null,
        sharedPlayActive: false
      })
    ).toBe(true);
  });

  it('does not allow anonymous shared play links to edit', () => {
    expect(
      canEditPlayForState({
        persistedPlayMode: 'design',
        currentRole: null,
        currentUserId: null,
        sharedPlayActive: true
      })
    ).toBe(false);
  });
});
