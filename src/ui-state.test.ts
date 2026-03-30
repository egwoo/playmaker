import { describe, expect, it } from 'vitest';

import { resolveSelectedPlaybookId } from './ui-state';

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
