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
