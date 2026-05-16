export type PlayMode = 'design' | 'game';
export type PlaybookRole = 'coach' | 'player';

type PlayModeState = {
  persistedPlayMode: PlayMode;
  currentRole: PlaybookRole | null;
  currentUserId: string | null;
  sharedPlayActive: boolean;
};

export function resolveSelectedPlaybookId<T extends { id: string }>(
  playbooks: T[],
  currentSelectedPlaybookId: string | null,
  lastSelectedPlaybookId: string | null
): string | null {
  if (currentSelectedPlaybookId && playbooks.some((item) => item.id === currentSelectedPlaybookId)) {
    return currentSelectedPlaybookId;
  }
  if (lastSelectedPlaybookId) {
    const restored = playbooks.find((item) => item.id === lastSelectedPlaybookId)?.id;
    if (restored) {
      return restored;
    }
  }
  return playbooks[0]?.id ?? null;
}

export function isGuestScratchMode(state: Pick<PlayModeState, 'currentUserId' | 'sharedPlayActive'>): boolean {
  return !state.currentUserId && !state.sharedPlayActive;
}

export function resolveEffectivePlayMode(state: PlayModeState): PlayMode {
  if (isGuestScratchMode(state)) {
    return 'design';
  }
  return state.currentRole === 'coach' ? state.persistedPlayMode : 'game';
}

export function canEditPlayForState(state: PlayModeState): boolean {
  return (
    resolveEffectivePlayMode(state) === 'design' &&
    !state.sharedPlayActive &&
    (!state.currentUserId || state.currentRole === 'coach')
  );
}
