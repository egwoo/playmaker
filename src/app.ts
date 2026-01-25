import {
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  createEmptyPlay,
  deserializePlay,
  getLegDuration,
  getPlayDuration,
  serializePlay,
  type Play,
  type Player,
  type RouteLeg,
  type Team,
  type Vec2
} from './model';
import { DEFAULT_BALL_SPEED_YPS, getBallEndTime, getBallState } from './ball';
import { createRenderer } from './renderer';
import { loadDraftPlay, saveDraftPlay } from './storage';
import { renderIcons } from './icons';
import { supabase } from './supabase';

const DEFAULT_SPEED = 6;
const DEFAULT_DEFENSE_SPEED = 6;
const DEFAULT_ZONE_RADIUS_X = 10;
const DEFAULT_ZONE_RADIUS_Y = 5;
const MIN_ZONE_RADIUS = 1;
const HELP_SEEN_KEY = 'playmaker.help.seen.v1';
const LAST_SELECTED_PLAY_KEY = 'playmaker.lastSelectedPlay.v1';

type PlayMode = 'design' | 'game';

type DragState = {
  playerId: string;
  waypointIndex: number;
  pointerId: number;
  snapshot: Play;
  moved: boolean;
};

type ZoneDragState = {
  playerId: string;
  axis: 'x' | 'y';
  pointerId: number;
  snapshot: Play;
  moved: boolean;
};

type PlayerDragState = {
  playerId: string;
  pointerId: number;
  snapshot: Play;
  moved: boolean;
  updated: boolean;
  offset: Vec2;
  startCanvas: Vec2;
  originStart: Vec2;
  originRoute: Vec2[] | null;
  initialSelectedId: string | null;
};

type ReorderState = {
  playId: string;
  pointerId: number;
};

type Settings = {
  showWaypointMarkers: boolean;
};

type Playbook = {
  id: string;
  name: string;
  role: 'coach' | 'player';
  isOwner: boolean;
};

type RemotePlay = {
  id: string;
  name: string;
  play: Play;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
};

export function initApp() {
  const NEW_PLAYBOOK_VALUE = '__new__';
  const canvas = document.getElementById('field-canvas') as HTMLCanvasElement | null;
  const statusText = document.getElementById('status-text');
  const scrubber = document.getElementById('scrubber') as HTMLInputElement | null;
  const fullscreenToggle = document.getElementById('fullscreen-toggle') as HTMLButtonElement | null;
  const playToggle = document.getElementById('play-toggle') as HTMLButtonElement | null;
  const deletePlayerButton = document.getElementById('delete-player') as HTMLButtonElement | null;
  const undoButton = document.getElementById('undo-action') as HTMLButtonElement | null;
  const redoButton = document.getElementById('redo-action') as HTMLButtonElement | null;
  const resetTimeButton = document.getElementById('reset-time') as HTMLButtonElement | null;
  const newPlayButton = document.getElementById('new-play') as HTMLButtonElement | null;
  const flipPlayButton = document.getElementById('flip-play') as HTMLButtonElement | null;
  const savePlayButton = document.getElementById('save-play') as HTMLButtonElement | null;
  const saveMenuToggle = document.getElementById('save-menu-toggle') as HTMLButtonElement | null;
  const saveMenu = document.getElementById('save-menu');
  const saveAsNewButton = document.getElementById('save-as-new') as HTMLButtonElement | null;
  const sharePlayButton = document.getElementById('share-play') as HTMLButtonElement | null;
  const helpTrigger = document.getElementById('help-trigger') as HTMLButtonElement | null;
  const authTrigger = document.getElementById('auth-trigger') as HTMLButtonElement | null;
  const authAvatar = document.getElementById('auth-avatar') as HTMLButtonElement | null;
  const authAvatarImg = document.getElementById('auth-avatar-img') as HTMLImageElement | null;
  const authAvatarFallback = document.getElementById('auth-avatar-fallback');
  const authMenu = document.getElementById('auth-menu');
  const authUserEmail = document.getElementById('auth-user-email');
  const authSignOut = document.getElementById('auth-signout') as HTMLButtonElement | null;
  const toolbar = document.querySelector<HTMLElement>('.field-toolbar');
  const toolbarHost = document.querySelector<HTMLElement>('.layout-toolbar');
  const fieldToolbarOverlay = document.getElementById('field-toolbar-overlay') as HTMLDivElement | null;
  const editModeToggle = document.getElementById('edit-mode-toggle') as HTMLButtonElement | null;
  const editModeLabel = editModeToggle?.querySelector<HTMLElement>('.field-mode-label') ?? null;
  const fieldSection = document.querySelector<HTMLElement>('section.field');
  const playbookSelect = document.getElementById('playbook-select') as HTMLSelectElement | null;
  const playbookRolePill = document.getElementById('playbook-role-pill');
  const playbookMenuToggle = document.getElementById('playbook-menu-toggle') as HTMLButtonElement | null;
  const playbookMenu = document.getElementById('playbook-menu');
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-mode]'));
  const designPlaySection = document.getElementById('design-play-section');
  const gamePlaySection = document.getElementById('game-play-section');
  const gamePlayList = document.getElementById('game-play-list');
  const sharePlaybookButton = document.getElementById('share-playbook') as HTMLButtonElement | null;
  const renamePlaybookButton = document.getElementById('rename-playbook') as HTMLButtonElement | null;
  const deletePlaybookButton = document.getElementById('delete-playbook') as HTMLButtonElement | null;
  const sharedPlaybookBanner = document.getElementById('shared-playbook-banner');
  const sharedPlaybookText = document.getElementById('shared-playbook-text');
  const sharedPlaybookAction = document.getElementById('shared-playbook-action') as HTMLButtonElement | null;
  const savedPlaysSelect = document.getElementById('saved-plays-select') as HTMLSelectElement | null;
  const playMenuToggle = document.getElementById('play-menu-toggle') as HTMLButtonElement | null;
  const playMenu = document.getElementById('play-menu');
  const playHistoryButton = document.getElementById('play-history') as HTMLButtonElement | null;
  const renamePlayButton = document.getElementById('rename-play') as HTMLButtonElement | null;
  const deletePlayButton = document.getElementById('delete-play') as HTMLButtonElement | null;
  const sharedPlayBanner = document.getElementById('shared-play-banner');
  const sharedPlayText = document.getElementById('shared-play-text');
  const sharedPlayAction = document.getElementById('shared-play-action') as HTMLButtonElement | null;
  const playActions = document.getElementById('play-actions');
  const fieldHint = document.getElementById('field-hint');
  const teamPanel = document.getElementById('team-panel');
  const playerPanel = document.getElementById('player-panel');
  const controlsPanel = document.querySelector<HTMLDetailsElement>('details[data-panel="controls"]');
  const panelWrapper = document.querySelector<HTMLElement>('section.panel');
  const fieldOverlay = document.getElementById('field-overlay');
  const playerSelect = document.getElementById('selected-player-select') as HTMLSelectElement | null;
  const playerMenuToggle = document.getElementById('player-menu-toggle') as HTMLButtonElement | null;
  const playerMenu = document.getElementById('player-menu');
  const renamePlayerButton = document.getElementById('rename-player') as HTMLButtonElement | null;
  const playerActions = document.getElementById('player-actions');
  const waypointSection = document.querySelector<HTMLElement>('.waypoint-section');
  const waypointHint = document.getElementById('waypoint-hint');
  const waypointList = document.getElementById('waypoint-list');
  const coveragePanel = document.getElementById('coverage-panel');
  const coverageTypeSelect = document.getElementById('coverage-type-select') as HTMLSelectElement | null;
  const coverageManSection = document.querySelector<HTMLElement>('.coverage-man');
  const coverageZoneSection = document.querySelector<HTMLElement>('.coverage-zone');
  const coverageTargetSelect = document.getElementById('coverage-target-select') as HTMLSelectElement | null;
  const coverageSpeedInput = document.getElementById('coverage-speed-input') as HTMLInputElement | null;
  const zoneRadiusXInput = document.getElementById('zone-radius-x-input') as HTMLInputElement | null;
  const zoneRadiusYInput = document.getElementById('zone-radius-y-input') as HTMLInputElement | null;
  const zoneSpeedInput = document.getElementById('zone-speed-input') as HTMLInputElement | null;
  const teamButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-team]'));
  const waypointOpenState = new Map<string, Map<number, boolean>>();

  if (
    !canvas ||
    !statusText ||
    !scrubber ||
    !fullscreenToggle ||
    !playToggle ||
    !deletePlayerButton ||
    !undoButton ||
    !redoButton ||
    !resetTimeButton ||
    !newPlayButton ||
    !flipPlayButton ||
    !savePlayButton ||
    !saveMenuToggle ||
    !saveMenu ||
    !saveAsNewButton ||
    !sharePlayButton ||
    !helpTrigger ||
    !authTrigger ||
    !authAvatar ||
    !authAvatarImg ||
    !authAvatarFallback ||
    !authMenu ||
    !authUserEmail ||
    !authSignOut ||
    !toolbar ||
    !toolbarHost ||
    !fieldToolbarOverlay ||
    !editModeToggle ||
    !editModeLabel ||
    !playbookSelect ||
    !playbookRolePill ||
    !playbookMenuToggle ||
    !playbookMenu ||
    modeButtons.length === 0 ||
    !designPlaySection ||
    !gamePlaySection ||
    !gamePlayList ||
    !sharePlaybookButton ||
    !renamePlaybookButton ||
    !deletePlaybookButton ||
    !sharedPlaybookBanner ||
    !sharedPlaybookText ||
    !sharedPlaybookAction ||
    !savedPlaysSelect ||
    !playMenuToggle ||
    !playMenu ||
    !playHistoryButton ||
    !renamePlayButton ||
    !deletePlayButton ||
    !sharedPlayBanner ||
    !sharedPlayText ||
    !sharedPlayAction ||
    !playActions ||
    !fieldHint ||
    !teamPanel ||
    !playerPanel ||
    !playerSelect ||
    !playerMenuToggle ||
    !playerMenu ||
    !renamePlayerButton ||
    !playerActions ||
    !waypointSection ||
    !waypointHint ||
    !waypointList ||
    !coveragePanel ||
    !coverageTypeSelect ||
    !coverageManSection ||
    !coverageZoneSection ||
    !coverageTargetSelect ||
    !coverageSpeedInput ||
    !zoneRadiusXInput ||
    !zoneRadiusYInput ||
    !zoneSpeedInput ||
    !controlsPanel ||
    !panelWrapper
  ) {
    throw new Error('Missing required UI elements.');
  }

  const renderer = createRenderer(canvas);
  const shareTokens = loadShareTokens();
  const savedPlay = loadDraftPlay();
  const settings: Settings = { showWaypointMarkers: false };

  let sharedPlayToken: string | null = shareTokens.playToken;
  let sharedPlayName: string | null = null;
  let sharedPlayActive = false;
  let sharedPlaybookToken: string | null = shareTokens.playbookToken;
  let sharedPlaybookAccepted = false;
  let play = sharedPlayToken ? createEmptyPlay() : savedPlay ?? createEmptyPlay();
  let savedPlays: RemotePlay[] = [];
  let selectedSavedPlayId: string | null = null;
  let playbooks: Playbook[] = [];
  let selectedPlaybookId: string | null = null;
  let currentRole: Playbook['role'] | null = null;
  let playMode: PlayMode = 'game';
  let currentNotes = '';
  let currentTags: string[] = [];
  let currentUserId: string | null = null;
  let currentAvatarUrl: string | null = null;
  let lastAuthEmail = '';
  let lastSessionUserId: string | null = null;
  let playbookLoadPromise: Promise<void> | null = null;
  let editMode = false;
  let editModeTimeout: number | null = null;
  let editModeBeforeFullscreen: boolean | null = null;
  let canEdit = false;
  let fullscreenActive = false;
  let selectedPlayerId: string | null = null;
  let activeTeam: Team = 'offense';
  let playTime = 0;
  let isPlaying = false;
  let lastTimestamp = 0;
  let scrubberTouched = false;
  let dragState: DragState | null = null;
  let zoneDragState: ZoneDragState | null = null;
  let playerDragState: PlayerDragState | null = null;
  let reorderState: ReorderState | null = null;
  let historyPast: Play[] = [];
  let historyFuture: Play[] = [];
  let statusTimeout: number | null = null;
  let rolePillTimeout: number | null = null;
  const contextMenuClosers: Array<(except?: HTMLElement) => void> = [];

  const resizeObserver = new ResizeObserver(() => {
    renderer.resize();
    render();
  });
  resizeObserver.observe(canvas);
  renderer.resize();
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      renderer.resize();
      render();
    });
  }
  if (!sharedPlayToken) {
    saveDraftPlay(play);
  }

  function collapsePanelsForMobile() {
    if (!window.matchMedia('(max-width: 900px)').matches) {
      return;
    }
    controlsPanel.open = false;
  }

  function syncControlsCollapse() {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    panelWrapper.classList.toggle('controls-collapsed', isMobile && !controlsPanel.open);
    if (fieldOverlay) {
      fieldOverlay.classList.toggle('is-hidden', isMobile);
    }
    positionStatusToast();
  }

  function syncFullscreenUI() {
    const label = fullscreenActive ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenToggle.setAttribute('aria-label', label);
    fullscreenToggle.title = fullscreenActive ? 'Exit fullscreen' : 'Fullscreen';
    const icon = fullscreenToggle.querySelector('[data-lucide]') as HTMLElement | null;
    if (icon) {
      icon.setAttribute('data-lucide', fullscreenActive ? 'minimize-2' : 'maximize-2');
      renderIcons(fullscreenToggle);
    }
  }

  function setFullscreen(active: boolean) {
    const wasFullscreen = fullscreenActive;
    fullscreenActive = active;
    fieldSection?.classList.toggle('is-fullscreen', active);
    document.body.classList.toggle('field-fullscreen', active);
    if (fullscreenActive) {
      if (toolbar.parentElement !== fieldToolbarOverlay) {
        fieldToolbarOverlay.append(toolbar);
      }
      playToggle.focus();
    } else if (toolbar.parentElement !== toolbarHost) {
      toolbarHost.prepend(toolbar);
    }
    if (active && !wasFullscreen) {
      editModeBeforeFullscreen = editMode;
      editMode = false;
      syncEditorMode();
    } else if (!active && wasFullscreen) {
      if (editModeBeforeFullscreen !== null) {
        editMode = editModeBeforeFullscreen;
        editModeBeforeFullscreen = null;
      }
      syncEditorMode();
    }
    syncFullscreenUI();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderer.resize();
        render();
        positionStatusToast();
      });
    });
  }

  function setStatus(message: string) {
    positionStatusToast();
    statusText.textContent = message;
    statusText.classList.remove('is-hidden');
    if (statusTimeout) {
      window.clearTimeout(statusTimeout);
    }
    statusTimeout = window.setTimeout(() => {
      statusText.classList.add('is-hidden');
    }, 2600);
  }

  function positionStatusToast() {
    if (!fieldSection) {
      return;
    }
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) {
      statusText.style.left = '50%';
      statusText.style.transform = 'translateX(-50%)';
      return;
    }
    const rect = fieldSection.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    statusText.style.left = `${center}px`;
    statusText.style.transform = 'translateX(-50%)';
  }

  function getSelectedPlayer(): Player | null {
    if (!selectedPlayerId) {
      return null;
    }
    return play.players.find((player) => player.id === selectedPlayerId) ?? null;
  }

  function syncSelectedPlayer() {
    if (selectedPlayerId && !play.players.some((player) => player.id === selectedPlayerId)) {
      selectedPlayerId = null;
    }
  }

  function selectPlayer(playerId: string | null) {
    selectedPlayerId = playerId;
    if (playerId) {
      const selected = play.players.find((player) => player.id === playerId);
      if (selected && selected.team !== activeTeam) {
        setActiveTeam(selected.team, { preserveSelection: true });
      }
    }
    updateSelectedPanel();
    render();
  }

  function updateSelectedPanel() {
    const selected = getSelectedPlayer();
    if (selected && selected.team !== activeTeam) {
      selectedPlayerId = null;
    }
    renderPlayerSelect();
    const player = getSelectedPlayer();
    if (!player) {
      deletePlayerButton.disabled = true;
      playerMenuToggle.disabled = true;
      renamePlayerButton.disabled = true;
      waypointList.replaceChildren();
      const emptyRow = document.createElement('div');
      emptyRow.className = 'waypoint-empty';
      emptyRow.textContent = 'No player selected.';
      waypointList.append(emptyRow);
      setSectionHidden(playerActions, true);
      setSectionHidden(waypointSection, true);
      setSectionHidden(coveragePanel, true);
      return;
    }

    if (player.team === 'defense') {
      ensureDefenseAssignment(player);
    }

    deletePlayerButton.disabled = !canEdit;
    renamePlayerButton.disabled = !canEdit;
    playerMenuToggle.disabled = !canEdit;
    setSectionHidden(playerActions, false);
    setSectionHidden(waypointSection, player.team === 'defense');
    if (player.team === 'offense') {
      renderWaypointList(player);
    } else {
      waypointList.replaceChildren();
    }
    renderCoverageControls(player);
  }

  function setSectionHidden(element: HTMLElement, hidden: boolean) {
    element.classList.toggle('is-hidden', hidden);
  }

  function renderPlayerSelect() {
    playerSelect.replaceChildren();
    const candidates = play.players.filter((player) => player.team === activeTeam);
    if (candidates.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'Add players on the field';
      emptyOption.disabled = true;
      emptyOption.selected = true;
      playerSelect.append(emptyOption);
      playerSelect.disabled = true;
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a player';
    playerSelect.append(placeholder);

    for (const candidate of candidates) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.label;
      playerSelect.append(option);
    }

    const selected = getSelectedPlayer();
    if (selected && selected.team === activeTeam) {
      playerSelect.value = selected.id;
    } else {
      playerSelect.value = '';
    }

    playerSelect.disabled = false;
  }

  function setAuthUI(isSignedIn: boolean, email?: string | null, avatarUrl?: string | null) {
    authTrigger.classList.toggle('is-hidden', isSignedIn);
    authAvatar.classList.toggle('is-hidden', !isSignedIn);
    authMenu.classList.add('is-hidden');
    authUserEmail.textContent = email ?? '';
    currentAvatarUrl = avatarUrl ?? null;
    if (currentAvatarUrl) {
      authAvatarImg.src = currentAvatarUrl;
      authAvatarImg.classList.remove('is-hidden');
      authAvatarFallback.classList.add('is-hidden');
    } else {
      authAvatarImg.removeAttribute('src');
      authAvatarImg.classList.add('is-hidden');
      authAvatarFallback.classList.remove('is-hidden');
    }
  }

  function updateSharedPlayUI() {
    const shouldShow = !!sharedPlayToken && sharedPlayActive;
    sharedPlayBanner.classList.toggle('is-hidden', !shouldShow);
    if (!shouldShow) {
      return;
    }
    if (!currentUserId) {
      sharedPlayText.textContent = 'Viewing a shared play.';
      sharedPlayAction.textContent = 'Sign in to save this play';
    } else {
      sharedPlayText.textContent = `Shared play: ${sharedPlayName ?? 'Untitled play'}`;
      sharedPlayAction.textContent = 'Save to playbook';
    }
  }

  function updateSharedPlaybookUI() {
    const shouldShow = !!sharedPlaybookToken && !sharedPlaybookAccepted;
    sharedPlaybookBanner.classList.toggle('is-hidden', !shouldShow);
    if (!shouldShow) {
      return;
    }
    if (!currentUserId) {
      sharedPlaybookText.textContent = 'Shared playbook link.';
      sharedPlaybookAction.textContent = 'Sign in to access';
    } else {
      sharedPlaybookText.textContent = 'Shared playbook ready to add.';
      sharedPlaybookAction.textContent = 'Add to my playbooks';
    }
  }

  function loadLastSelectedPlayMap(): Record<string, string> {
    try {
      const raw = localStorage.getItem(LAST_SELECTED_PLAY_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // ignore storage failures
    }
    return {};
  }

  function saveLastSelectedPlayMap(map: Record<string, string>) {
    try {
      localStorage.setItem(LAST_SELECTED_PLAY_KEY, JSON.stringify(map));
    } catch {
      // ignore storage failures
    }
  }

  function setLastSelectedPlay(playbookId: string | null, playId: string | null) {
    if (!playbookId) {
      return;
    }
    const map = loadLastSelectedPlayMap();
    if (!playId) {
      delete map[playbookId];
    } else {
      map[playbookId] = playId;
    }
    saveLastSelectedPlayMap(map);
  }

  function getLastSelectedPlay(playbookId: string | null): string | null {
    if (!playbookId) {
      return null;
    }
    const map = loadLastSelectedPlayMap();
    return map[playbookId] ?? null;
  }

  function renderGamePlayList() {
    gamePlayList.replaceChildren();
    if (!currentUserId) {
      const empty = document.createElement('div');
      empty.className = 'game-play-empty';
      empty.textContent = 'Sign in to load plays.';
      gamePlayList.append(empty);
      return;
    }
    if (!selectedPlaybookId) {
      const empty = document.createElement('div');
      empty.className = 'game-play-empty';
      empty.textContent = 'Select a playbook.';
      gamePlayList.append(empty);
      return;
    }
    if (savedPlays.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'game-play-empty';
      empty.textContent = 'No plays yet.';
      gamePlayList.append(empty);
      return;
    }

    const ordered = getOrderedPlays();
    const canReorder = currentRole === 'coach' && !sharedPlayActive;
    for (const entry of ordered) {
      const row = document.createElement('div');
      row.className = 'game-play-row';
      row.dataset.playId = entry.id;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-play-item';
      if (entry.id === selectedSavedPlayId) {
        button.classList.add('is-active');
      }
      const label = document.createElement('span');
      label.className = 'game-play-label';
      label.textContent = entry.name;
      button.append(label);
      button.addEventListener('click', () => selectSavedPlayById(entry.id));

      if (canReorder && entry.id === selectedSavedPlayId) {
        const handle = document.createElement('span');
        handle.className = 'play-reorder-handle';
        handle.setAttribute('aria-label', 'Reorder play');
        handle.innerHTML = '<span data-lucide="grip-horizontal" aria-hidden="true"></span>';
        handle.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.button !== 0) {
            return;
          }
          handle.setPointerCapture(event.pointerId);
          reorderState = { playId: entry.id, pointerId: event.pointerId };
        });
        handle.addEventListener('pointerup', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!reorderState || reorderState.pointerId !== event.pointerId) {
            return;
          }
          handle.releasePointerCapture(event.pointerId);
          finalizeReorder(event.clientY);
        });
        handle.addEventListener('pointercancel', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (reorderState && reorderState.pointerId === event.pointerId) {
            handle.releasePointerCapture(event.pointerId);
            reorderState = null;
          }
        });
        button.append(handle);
      }

      row.append(button);
      gamePlayList.append(row);
    }
    renderIcons(gamePlayList);
  }

  function updateModeUI() {
    modeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === playMode);
    });
    setSectionHidden(designPlaySection, playMode === 'game');
    setSectionHidden(gamePlaySection, playMode === 'design');
    setSectionHidden(teamPanel, playMode === 'game');
    setSectionHidden(playerPanel, playMode === 'game');
    editModeToggle.classList.toggle('is-hidden', playMode === 'game');
    renderGamePlayList();
  }

  function setPlayMode(nextMode: PlayMode) {
    playMode = nextMode;
    updateModeUI();
    syncEditorMode();
  }

  function applyPlayOrder(orderedIds: string[]) {
    const total = orderedIds.length;
    const orderMap = new Map<string, number>();
    orderedIds.forEach((id, index) => {
      orderMap.set(id, total - index);
    });
    savedPlays = savedPlays.map((entry) => ({
      ...entry,
      sortOrder: orderMap.get(entry.id) ?? entry.sortOrder
    }));
    renderSavedPlaysSelect();
    renderGamePlayList();
  }

  async function persistPlayOrder(orderedIds: string[]) {
    if (!selectedPlaybookId) {
      return;
    }
    const total = orderedIds.length;
    const results = await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from('plays')
          .update({ sort_order: total - index })
          .eq('id', id)
          .eq('playbook_id', selectedPlaybookId)
      )
    );
    const error = results.find((result) => result.error)?.error;
    if (error) {
      console.error('Failed to update play order', error);
      setStatus('Unable to save play order');
    }
  }

  function finalizeReorder(clientY: number) {
    if (!reorderState) {
      return;
    }
    const currentOrder = getOrderedPlays().map((entry) => entry.id);
    const startIndex = currentOrder.indexOf(reorderState.playId);
    reorderState = null;
    if (startIndex === -1 || currentOrder.length < 2) {
      return;
    }
    const rows = Array.from(gamePlayList.querySelectorAll<HTMLElement>('.game-play-row'));
    const targetIndex = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    const clampedIndex = targetIndex === -1 ? rows.length - 1 : targetIndex;
    if (clampedIndex === startIndex) {
      return;
    }
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(startIndex, 1);
    nextOrder.splice(clampedIndex, 0, moved);
    applyPlayOrder(nextOrder);
    void persistPlayOrder(nextOrder);
  }

  async function loadSharedPlayByToken(token: string) {
    const { data, error } = await supabase.rpc('fetch_play_share', { share_token: token });
    if (error || !data || data.length === 0) {
      console.error('Failed to load shared play', error);
      setStatus('Unable to load shared play');
      sharedPlayActive = false;
      sharedPlayToken = null;
      updateSharedPlayUI();
      return;
    }
    const entry = Array.isArray(data) ? data[0] : data;
    sharedPlayName = entry.play_name ?? 'Untitled play';
    sharedPlayActive = true;
    play = entry.play_data as Play;
    selectedSavedPlayId = null;
    selectedPlayerId = null;
    historyPast = [];
    historyFuture = [];
    resetPlayback();
    editMode = false;
    syncEditorMode();
    updateSelectedPanel();
    updateTimelineUI();
    updateSaveButtonLabel();
    render();
    updateSharedPlayUI();
  }

  async function acceptPlaybookShare(token: string) {
    const { data, error } = await supabase.rpc('accept_playbook_share', { share_token: token });
    if (error || !data || data.length === 0) {
      console.error('Failed to accept playbook share', error);
      setStatus('Unable to accept playbook share');
      return;
    }
    const entry = Array.isArray(data) ? data[0] : data;
    selectedPlaybookId = entry.playbook_id ?? null;
    sharedPlaybookAccepted = true;
    sharedPlaybookToken = null;
    clearShareParam('playbook');
    updateSharedPlaybookUI();
    await loadPlaybooks();
    setStatus('Playbook added to your account');
  }

  function canUserEdit() {
    return playMode === 'design' && !sharedPlayActive && (!currentUserId || currentRole === 'coach');
  }

  function updateEditModeToggle() {
    const editable = canUserEdit();
    const editingActive = editable && editMode;
    editModeToggle.disabled = !editable;
    editModeToggle.setAttribute('aria-pressed', editingActive ? 'true' : 'false');
    editModeToggle.setAttribute('aria-label', editingActive ? 'Edit mode' : 'View mode');
    editModeLabel.textContent = editingActive ? 'Edit mode' : 'View mode';
    const icon = editModeToggle.querySelector<HTMLElement>('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', editingActive ? 'unlock' : 'lock');
    } else {
      const freshIcon = document.createElement('span');
      freshIcon.className = 'field-mode-icon';
      freshIcon.setAttribute('data-lucide', editingActive ? 'unlock' : 'lock');
      freshIcon.setAttribute('aria-hidden', 'true');
      editModeToggle.append(freshIcon);
    }
    renderIcons(editModeToggle);
  }

  function showEditModeLabel() {
    editModeToggle.classList.remove('is-collapsed');
    if (editModeTimeout) {
      window.clearTimeout(editModeTimeout);
    }
    editModeTimeout = window.setTimeout(() => {
      editModeToggle.classList.add('is-collapsed');
    }, 2200);
  }

  function syncEditorMode() {
    const editable = canUserEdit();
    const editingActive = editable && editMode;
    const disable = !editingActive;
    canEdit = editingActive;
    if (playMode === 'game') {
      fieldHint.classList.add('is-hidden');
      waypointHint.classList.add('is-hidden');
    } else if (canEdit) {
      fieldHint.textContent = 'Tap on the field to place a player.';
      fieldHint.classList.remove('is-hidden');
      waypointHint.classList.remove('is-hidden');
    } else if (editable) {
      fieldHint.textContent = 'Tap the unlock icon to edit the play.';
      fieldHint.classList.remove('is-hidden');
      waypointHint.classList.add('is-hidden');
    } else {
      fieldHint.classList.add('is-hidden');
      waypointHint.classList.add('is-hidden');
    }
    newPlayButton.disabled = disable;
    flipPlayButton.disabled = disable;
    savePlayButton.disabled = disable;
    saveMenuToggle.disabled = disable;
    playMenuToggle.disabled = disable || !selectedSavedPlayId;
    renamePlayButton.disabled = disable || !selectedSavedPlayId;
    deletePlayButton.disabled = disable || !selectedSavedPlayId;
    const hasPlaybook = !!selectedPlaybookId;
    playbookMenuToggle.disabled = !hasPlaybook;
    sharePlaybookButton.disabled = !hasPlaybook || currentRole !== 'coach';
    renamePlaybookButton.disabled = !hasPlaybook || currentRole !== 'coach';
    deletePlaybookButton.disabled = !hasPlaybook;
    setSectionHidden(playActions, disable);
    updatePlaybookRolePill();
    updateEditModeToggle();
    updateSaveButtonLabel();
    updateSelectedPanel();
  }

  async function loadPlaybooks() {
    const [membersResult, ownedResult] = await Promise.all([
      supabase
        .from('playbook_members')
        .select('role, playbooks (id, name, owner_id)')
        .order('created_at', { ascending: true }),
      currentUserId
        ? supabase
            .from('playbooks')
            .select('id, name, owner_id')
            .eq('owner_id', currentUserId)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (membersResult.error) {
      console.error('Failed to load playbooks', membersResult.error);
      return;
    }
    if (ownedResult.error) {
      console.error('Failed to load owned playbooks', ownedResult.error);
      return;
    }

    const playbookMap = new Map<string, Playbook>();
    (ownedResult.data ?? []).forEach((row) => {
      playbookMap.set(row.id, { id: row.id, name: row.name, role: 'coach', isOwner: true });
    });

    (membersResult.data ?? []).forEach((row) => {
      const entry = row.playbooks as { id: string; name: string } | null;
      if (!entry) {
        return;
      }
      const existing = playbookMap.get(entry.id);
      playbookMap.set(entry.id, {
        id: entry.id,
        name: entry.name,
        role: row.role as Playbook['role'],
        isOwner: existing?.isOwner ?? false
      });
    });

    playbooks = Array.from(playbookMap.values());

    if (playbooks.length === 0) {
      const created = await createDefaultPlaybook();
      if (created) {
        playbooks = [created];
      }
    }
    if (!selectedPlaybookId && playbooks.length > 0) {
      selectedPlaybookId = playbooks[0].id;
    }
    renderPlaybookSelect();
    if (selectedPlaybookId) {
      const current = playbooks.find((item) => item.id === selectedPlaybookId);
      currentRole = current?.role ?? null;
      syncEditorMode();
      updateSelectedPanel();
      await loadPlaysForPlaybook(selectedPlaybookId);
    }
  }

  async function createDefaultPlaybook(): Promise<Playbook | null> {
    if (!currentUserId) {
      return null;
    }
    const { data: existing, error: existingError } = await supabase
      .from('playbooks')
      .select('id, name')
      .eq('owner_id', currentUserId)
      .eq('name', 'My Playbook')
      .limit(1)
      .maybeSingle();
    if (existingError) {
      console.error('Failed to check for default playbook', existingError);
    }
    if (existing) {
      return { id: existing.id, name: existing.name, role: 'coach', isOwner: true };
    }
    const { data, error } = await supabase
      .from('playbooks')
      .insert({ name: 'My Playbook', owner_id: currentUserId })
      .select('id, name')
      .single();
    if (error || !data) {
      console.error('Failed to create playbook', error);
      return null;
    }
    return { id: data.id, name: data.name, role: 'coach', isOwner: true };
  }

  function renderPlaybookSelect() {
    playbookSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    if (!currentUserId) {
      placeholder.textContent = 'Sign in to load playbooks';
    } else if (playbooks.length) {
      placeholder.textContent = 'Select playbook';
    } else {
      placeholder.textContent = 'Select playbook';
    }
    playbookSelect.append(placeholder);

    const nameTotals = new Map<string, number>();
    playbooks.forEach((playbook) => {
      nameTotals.set(playbook.name, (nameTotals.get(playbook.name) ?? 0) + 1);
    });
    const nameCounts = new Map<string, number>();

    for (const playbook of playbooks) {
      const option = document.createElement('option');
      option.value = playbook.id;
      const total = nameTotals.get(playbook.name) ?? 1;
      const index = (nameCounts.get(playbook.name) ?? 0) + 1;
      nameCounts.set(playbook.name, index);
      option.textContent = total > 1 ? `${playbook.name} (${index})` : playbook.name;
      playbookSelect.append(option);
    }

    if (currentUserId) {
      const addOption = document.createElement('option');
      addOption.value = NEW_PLAYBOOK_VALUE;
      addOption.textContent = '+ Add a new playbook';
      playbookSelect.append(addOption);
    }

    if (selectedPlaybookId) {
      playbookSelect.value = selectedPlaybookId;
    } else {
      playbookSelect.value = '';
    }
    playbookSelect.disabled = !currentUserId;
    const hasPlaybook = !!selectedPlaybookId;
    playbookMenuToggle.disabled = !hasPlaybook;
    sharePlaybookButton.disabled = !hasPlaybook || currentRole !== 'coach';
    renamePlaybookButton.disabled = !hasPlaybook || currentRole !== 'coach';
    deletePlaybookButton.disabled = !hasPlaybook;
  }

  async function loadPlaysForPlaybook(playbookId: string) {
    const { data, error } = await supabase
      .from('plays')
      .select('id, name, data, notes, tags, sort_order, created_at, updated_at')
      .eq('playbook_id', playbookId)
      .order('sort_order', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('Failed to load plays', error);
      savedPlays = [];
      renderSavedPlaysSelect();
      return;
    }
    savedPlays = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      play: row.data as Play,
      notes: row.notes ?? '',
      tags: row.tags ?? [],
      sortOrder: row.sort_order ?? 0,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime()
    }));
    selectedSavedPlayId = null;
    currentNotes = '';
    currentTags = [];
    const lastSelected = getLastSelectedPlay(playbookId);
    if (lastSelected && savedPlays.some((entry) => entry.id === lastSelected)) {
      selectSavedPlayById(lastSelected);
      return;
    }
    renderSavedPlaysSelect();
    renderGamePlayList();
  }

  function renderSavedPlaysSelect() {
    savedPlaysSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    if (!currentUserId) {
      placeholder.textContent = 'Sign in to load plays';
    } else if (!selectedPlaybookId) {
      placeholder.textContent = 'Select a playbook';
    } else if (currentRole && currentRole !== 'coach') {
      placeholder.textContent = 'Select a play';
      placeholder.disabled = true;
    } else {
      placeholder.textContent = 'New play';
    }
    savedPlaysSelect.append(placeholder);

    const ordered = getOrderedPlays();
    for (const entry of ordered) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      savedPlaysSelect.append(option);
    }

    const canManage = currentRole === 'coach' && !!selectedSavedPlayId && !sharedPlayActive;
    if (selectedSavedPlayId && savedPlays.some((entry) => entry.id === selectedSavedPlayId)) {
      savedPlaysSelect.value = selectedSavedPlayId;
    } else {
      savedPlaysSelect.value = '';
    }
    playHistoryButton.disabled = !selectedSavedPlayId;
    playMenuToggle.disabled = !canManage;
    renamePlayButton.disabled = !canManage;
    deletePlayButton.disabled = !canManage;

    updateSaveButtonLabel();
    savedPlaysSelect.disabled = !currentUserId || !selectedPlaybookId;
    updatePlaybookRolePill();
    renderGamePlayList();
  }

  function getOrderedPlays(): RemotePlay[] {
    return [...savedPlays].sort((a, b) => {
      const orderDelta = (b.sortOrder ?? 0) - (a.sortOrder ?? 0);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return b.updatedAt - a.updatedAt;
    });
  }

  function selectSavedPlayById(value: string | null) {
    if (!value) {
      selectedSavedPlayId = null;
      currentNotes = '';
      currentTags = [];
      updateSaveButtonLabel();
      renderSavedPlaysSelect();
      renderGamePlayList();
      return;
    }

    selectedSavedPlayId = value;
    const selectedEntry = savedPlays.find((entry) => entry.id === value);
    if (!selectedEntry) {
      setLastSelectedPlay(selectedPlaybookId, null);
      updateSaveButtonLabel();
      renderSavedPlaysSelect();
      renderGamePlayList();
      return;
    }
    setLastSelectedPlay(selectedPlaybookId, value);
    sharedPlayActive = false;
    sharedPlayToken = null;
    syncEditorMode();
    play = clonePlay(selectedEntry.play);
    currentNotes = selectedEntry.notes ?? '';
    currentTags = selectedEntry.tags ?? [];
    resetPlayback();
    historyPast = [];
    historyFuture = [];
    updateHistoryUI();
    updateSelectedPanel();
    render();
    persist();
    updateSaveButtonLabel();
    renderSavedPlaysSelect();
    renderGamePlayList();
    updateSharedPlayUI();
  }

  function updatePlaybookRolePill() {
    const isViewer = currentRole === 'player' && !!selectedPlaybookId;
    playbookRolePill.classList.toggle('is-hidden', !isViewer);
  }

  function updateSavedPlaysStorage() {
    renderSavedPlaysSelect();
  }

  function updateSaveButtonLabel() {
    savePlayButton.textContent = selectedSavedPlayId ? 'Update' : 'Save';
    const canSave = canEdit && currentRole === 'coach' && !sharedPlayActive;
    savePlayButton.disabled = !canSave;
    saveMenuToggle.disabled = !canSave;
    sharePlayButton.disabled = !canSave;
  }

  function getCurrentPlayName(): string {
    if (!selectedSavedPlayId) {
      return 'New play';
    }
    return savedPlays.find((entry) => entry.id === selectedSavedPlayId)?.name ?? 'New play';
  }

  function resetPlayState() {
    play = createEmptyPlay();
    selectedPlayerId = null;
    playTime = 0;
    historyPast = [];
    historyFuture = [];
    currentNotes = '';
    currentTags = [];
    updateHistoryUI();
    updateSelectedPanel();
    updateTimelineUI();
    render();
    persist();
  }

  async function savePlayAsNew(name: string) {
    if (!selectedPlaybookId) {
      setStatus('Sign in to save plays');
      return;
    }
    const payload = {
      playbook_id: selectedPlaybookId,
      name,
      data: clonePlay(play),
      notes: currentNotes,
      tags: currentTags
    };
    const { data, error } = await supabase
      .from('plays')
      .insert(payload)
      .select('id, name, data, notes, tags, sort_order, created_at, updated_at')
      .single();
    if (error || !data) {
      console.error('Failed to save play', error);
      setStatus('Unable to save play');
      return;
    }
    const entry: RemotePlay = {
      id: data.id,
      name: data.name,
      play: data.data as Play,
      notes: data.notes ?? '',
      tags: data.tags ?? [],
      sortOrder: data.sort_order ?? 0,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime()
    };
    savedPlays = [entry, ...savedPlays];
    selectedSavedPlayId = entry.id;
    setLastSelectedPlay(selectedPlaybookId, entry.id);
    await recordPlayVersion(entry.id, entry.name, entry.play);
    updateSavedPlaysStorage();
    setStatus('Saved new play');
  }

  function flipPlay() {
    play.players.forEach((player) => {
      player.start = { x: 1 - player.start.x, y: player.start.y };
      if (player.route) {
        player.route = player.route.map((leg) => ({
          ...leg,
          to: { x: 1 - leg.to.x, y: leg.to.y }
        }));
      }
    });
  }

  async function updateSelectedPlay(name: string) {
    if (!selectedSavedPlayId) {
      await savePlayAsNew(name);
      return;
    }
    const payload = {
      name,
      data: clonePlay(play),
      notes: currentNotes,
      tags: currentTags
    };
    const { data, error } = await supabase
      .from('plays')
      .update(payload)
      .eq('id', selectedSavedPlayId)
      .select('id, name, data, notes, tags, sort_order, created_at, updated_at')
      .single();
    if (error || !data) {
      console.error('Failed to update play', error);
      setStatus('Unable to update play');
      return;
    }
    savedPlays = savedPlays.map((entry) =>
      entry.id === selectedSavedPlayId
        ? {
            id: data.id,
            name: data.name,
            play: data.data as Play,
            notes: data.notes ?? '',
            tags: data.tags ?? [],
            sortOrder: data.sort_order ?? entry.sortOrder ?? 0,
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime()
          }
        : entry
    );
    setLastSelectedPlay(selectedPlaybookId, selectedSavedPlayId);
    await recordPlayVersion(data.id, data.name, data.data as Play);
    updateSavedPlaysStorage();
    setStatus(`${data.name} updated`);
  }

  async function recordPlayVersion(playId: string, name: string, playData: Play) {
    const { error } = await supabase.from('play_versions').insert({
      play_id: playId,
      name,
      data: playData,
      created_by: currentUserId
    });
    if (error) {
      console.error('Failed to record play version', error);
      return;
    }
    await supabase.rpc('prune_play_versions', { pid: playId });
  }

  function ensureDefenseAssignment(player: Player) {
    if (player.team !== 'defense' || player.assignment) {
      if (player.team !== 'defense') {
        return;
      }
      if (player.assignment?.type === 'man') {
        const offenses = play.players.filter((item) => item.team === 'offense');
        const targetExists = offenses.some((item) => item.id === player.assignment?.targetId);
        if (!targetExists) {
          if (offenses.length > 0) {
            player.assignment.targetId = offenses[0].id;
          } else {
            player.assignment = {
              type: 'zone',
              radiusX: DEFAULT_ZONE_RADIUS_X,
              radiusY: DEFAULT_ZONE_RADIUS_Y,
              speed: DEFAULT_DEFENSE_SPEED
            };
          }
          persist();
        }
      }
      return;
    }
    const offenses = play.players.filter((item) => item.team === 'offense');
    if (offenses.length > 0) {
      player.assignment = { type: 'man', targetId: offenses[0].id, speed: DEFAULT_DEFENSE_SPEED };
    } else {
      player.assignment = {
        type: 'zone',
        radiusX: DEFAULT_ZONE_RADIUS_X,
        radiusY: DEFAULT_ZONE_RADIUS_Y,
        speed: DEFAULT_DEFENSE_SPEED
      };
    }
    persist();
  }

  function renderCoverageControls(player: Player) {
    if (player.team !== 'defense') {
      setSectionHidden(coveragePanel, true);
      return;
    }

    setSectionHidden(coveragePanel, false);
    const editable = canEdit;
    coverageTypeSelect.replaceChildren();
    const typeMan = document.createElement('option');
    typeMan.value = 'man';
    typeMan.textContent = 'Man';
    coverageTypeSelect.append(typeMan);
    const typeZone = document.createElement('option');
    typeZone.value = 'zone';
    typeZone.textContent = 'Zone';
    coverageTypeSelect.append(typeZone);

    const hasOffense = play.players.some((candidate) => candidate.team === 'offense');
    if (!hasOffense) {
      typeMan.disabled = true;
    }

    let currentType = player.assignment?.type ?? (hasOffense ? 'man' : 'zone');
    if (currentType === 'man' && !hasOffense) {
      currentType = 'zone';
    }
    coverageTypeSelect.value = currentType;
    coverageTypeSelect.disabled = !editable;
    setSectionHidden(coverageManSection, currentType !== 'man');
    setSectionHidden(coverageZoneSection, currentType !== 'zone');

    coverageTargetSelect.replaceChildren();
    const candidates = play.players.filter((candidate) => candidate.team === 'offense');
    if (candidates.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'Add an offensive player to cover';
      emptyOption.disabled = true;
      emptyOption.selected = true;
      coverageTargetSelect.append(emptyOption);
      coverageTargetSelect.disabled = true;
      coverageSpeedInput.disabled = true;
      coverageSpeedInput.value = DEFAULT_DEFENSE_SPEED.toString();
    } else {
      for (const candidate of candidates) {
        const option = document.createElement('option');
        option.value = candidate.id;
        option.textContent = `Cover ${candidate.label}`;
        coverageTargetSelect.append(option);
      }

      if (
        player.assignment?.type === 'man' &&
        candidates.some((candidate) => candidate.id === player.assignment?.targetId)
      ) {
        coverageTargetSelect.value = player.assignment.targetId;
        coverageSpeedInput.value = player.assignment.speed.toString();
        coverageSpeedInput.disabled = !editable;
      } else {
        coverageTargetSelect.value = candidates[0]?.id ?? '';
        coverageSpeedInput.value = DEFAULT_DEFENSE_SPEED.toString();
        coverageSpeedInput.disabled = !editable;
      }

      coverageTargetSelect.disabled = currentType !== 'man' || !editable;
    }

    if (player.assignment?.type === 'zone') {
      zoneRadiusXInput.value = player.assignment.radiusX.toString();
      zoneRadiusYInput.value = player.assignment.radiusY.toString();
      zoneSpeedInput.value = player.assignment.speed.toString();
    } else {
      zoneRadiusXInput.value = DEFAULT_ZONE_RADIUS_X.toString();
      zoneRadiusYInput.value = DEFAULT_ZONE_RADIUS_Y.toString();
      zoneSpeedInput.value = DEFAULT_DEFENSE_SPEED.toString();
    }

    zoneRadiusXInput.disabled = currentType !== 'zone' || !editable;
    zoneRadiusYInput.disabled = currentType !== 'zone' || !editable;
    zoneSpeedInput.disabled = currentType !== 'zone' || !editable;
  }

  function renderWaypointList(player: Player) {
    waypointList.replaceChildren();
    const route = player.route ?? [];
    const isEditable = canEdit;

    const candidates = play.players.filter(
      (candidate) => candidate.team === 'offense' && candidate.id !== player.id
    );

    const buildActionSelect = (
      currentTargetId: string | undefined,
      onChange: (targetId: string | null) => void
    ) => {
      const actionSelect = document.createElement('select');
      actionSelect.className = 'waypoint-action';

      if (candidates.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'Add an offensive player to target';
        emptyOption.disabled = true;
        emptyOption.selected = true;
        actionSelect.append(emptyOption);
        actionSelect.disabled = true;
      } else {
        const actionNone = document.createElement('option');
        actionNone.value = '';
        actionNone.textContent = 'None';
        actionSelect.append(actionNone);

        for (const candidate of candidates) {
          const option = document.createElement('option');
          option.value = candidate.id;
          option.textContent = `${player.label} → ${candidate.label}`;
          actionSelect.append(option);
        }

        if (currentTargetId && candidates.some((candidate) => candidate.id === currentTargetId)) {
          actionSelect.value = currentTargetId;
        } else {
          actionSelect.value = '';
        }

        actionSelect.disabled = false;
      }

      actionSelect.addEventListener('change', () => {
        if (actionSelect.disabled) {
          return;
        }
        const value = actionSelect.value;
        onChange(value ? value : null);
      });

      return actionSelect;
    };

    const waypoint0Row = document.createElement('div');
    waypoint0Row.className = 'waypoint-row is-waypoint';

    const waypoint0Label = document.createElement('button');
    waypoint0Label.type = 'button';
    waypoint0Label.className = 'waypoint-toggle';
    const waypoint0LabelText = document.createElement('span');
    waypoint0LabelText.textContent = `Waypoint 0 @ ${(player.startDelay ?? 0).toFixed(1)}s`;
    const waypoint0Caret = document.createElement('span');
    waypoint0Caret.className = 'waypoint-caret';
    waypoint0Label.append(waypoint0LabelText, waypoint0Caret);

    const waypoint0DelayInput = document.createElement('input');
    waypoint0DelayInput.type = 'number';
    waypoint0DelayInput.step = '0.1';
    waypoint0DelayInput.value = (player.startDelay ?? 0).toString();
    waypoint0DelayInput.className = 'waypoint-delay';
    waypoint0DelayInput.disabled = !isEditable;
    waypoint0DelayInput.addEventListener('change', () => {
      if (!isEditable) {
        return;
      }
      const nextDelay = parseDelay(waypoint0DelayInput.value, player.startDelay ?? 0, Number.NEGATIVE_INFINITY);
      if (nextDelay === (player.startDelay ?? 0)) {
        return;
      }
      applyMutation(() => {
        const target = getSelectedPlayer();
        if (!target || target.team !== 'offense') {
          return;
        }
        target.startDelay = nextDelay;
      });
    });

    const waypoint0ActionSelect = buildActionSelect(player.startAction?.targetId, (targetId) => {
      if (!isEditable) {
        return;
      }
      applyMutation(() => {
        const target = getSelectedPlayer();
        if (!target || target.team !== 'offense') {
          return;
        }
        if (!targetId) {
          target.startAction = undefined;
          return;
        }
        target.startAction = { type: 'pass', targetId };
      });
    });
    if (!isEditable) {
      waypoint0ActionSelect.disabled = true;
    }

    const waypoint0DelayField = document.createElement('label');
    waypoint0DelayField.className = 'waypoint-field waypoint-delay-field';
    waypoint0DelayField.textContent = 'Delay';
    waypoint0DelayField.append(waypoint0DelayInput);

    const waypoint0ActionField = document.createElement('label');
    waypoint0ActionField.className = 'waypoint-field waypoint-action-field';
    waypoint0ActionField.textContent = 'Action';
    waypoint0ActionField.append(waypoint0ActionSelect);

    const waypoint0Content = document.createElement('div');
    waypoint0Content.className = 'waypoint-content';
    waypoint0Content.append(waypoint0DelayField, waypoint0ActionField);
    waypoint0Row.append(waypoint0Label, waypoint0Content);

    const waypoint0DefaultOpen = (player.startDelay ?? 0) !== 0 || !!player.startAction;
    const waypoint0State = waypointOpenState.get(player.id)?.get(0);
    waypoint0Row.classList.toggle('is-open', waypoint0State ?? waypoint0DefaultOpen);
    waypoint0Label.addEventListener('click', () => {
      if (!isEditable && !waypoint0Row.classList.contains('is-open')) {
        waypoint0Row.classList.add('is-open');
      }
      const isOpen = waypoint0Row.classList.toggle('is-open');
      let map = waypointOpenState.get(player.id);
      if (!map) {
        map = new Map();
        waypointOpenState.set(player.id, map);
      }
      map.set(0, isOpen);
    });
    waypointList.append(waypoint0Row);

    if (route.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'waypoint-empty';
      emptyRow.textContent = 'No waypoints yet.';
      waypointList.append(emptyRow);
      renderIcons(waypointList);
      return;
    }

    let from = player.start;
    let elapsed = player.startDelay ?? 0;

    route.forEach((leg, index) => {
      const duration = getLegDuration(from, leg);
      const arrival = elapsed + duration;

      const legRow = document.createElement('div');
      legRow.className = 'waypoint-row is-leg';

      const legLabel = document.createElement('div');
      legLabel.className = 'waypoint-label';
      legLabel.textContent = `Leg ${index} → ${index + 1}`;

      const speed = document.createElement('input');
      speed.type = 'number';
      speed.min = '0.1';
      speed.step = '0.1';
      speed.value = leg.speed.toString();
      speed.className = 'waypoint-speed';
      speed.disabled = !isEditable;
      speed.addEventListener('change', () => {
        if (!isEditable) {
          return;
        }
        const nextSpeed = parseSpeed(speed.value, leg.speed);
        if (nextSpeed === leg.speed) {
          return;
        }
        applyMutation(() => {
          const target = getSelectedPlayer();
          if (!target?.route) {
            return;
          }
          target.route[index].speed = nextSpeed;
        });
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'tertiary icon-button';
      deleteButton.setAttribute('aria-label', 'Remove waypoint');
      deleteButton.title = 'Remove waypoint';
      deleteButton.innerHTML = '<span data-lucide="trash-2" aria-hidden="true"></span>';
      deleteButton.disabled = !isEditable;
      deleteButton.addEventListener('click', () => {
        if (!isEditable) {
          return;
        }
        applyMutation(() => {
          const target = getSelectedPlayer();
          if (!target?.route) {
            return;
          }
          target.route.splice(index, 1);
        });
      });

      const speedField = document.createElement('label');
      speedField.className = 'waypoint-field waypoint-speed-field';
      speedField.textContent = 'Speed';
      speedField.append(speed);

      legRow.append(legLabel, speedField, deleteButton);
      waypointList.append(legRow);

      const waypointRow = document.createElement('div');
      waypointRow.className = 'waypoint-row is-waypoint';

      const waypointLabel = document.createElement('button');
      waypointLabel.type = 'button';
      waypointLabel.className = 'waypoint-toggle';
      const waypointLabelText = document.createElement('span');
      waypointLabelText.textContent = `Waypoint ${index + 1} @ ${arrival.toFixed(1)}s`;
      const waypointCaret = document.createElement('span');
      waypointCaret.className = 'waypoint-caret';
      waypointLabel.append(waypointLabelText, waypointCaret);

      const delayInput = document.createElement('input');
      delayInput.type = 'number';
      delayInput.min = '0';
      delayInput.step = '0.1';
      delayInput.value = (leg.delay ?? 0).toString();
      delayInput.className = 'waypoint-delay';
      delayInput.disabled = !isEditable;
      delayInput.addEventListener('change', () => {
        if (!isEditable) {
          return;
        }
        const nextDelay = parseDelay(delayInput.value, leg.delay ?? 0);
        if (nextDelay === (leg.delay ?? 0)) {
          return;
        }
        applyMutation(() => {
          const target = getSelectedPlayer();
          if (!target?.route) {
            return;
          }
          target.route[index].delay = nextDelay;
        });
      });

      const actionSelect = buildActionSelect(leg.action?.targetId, (targetId) => {
        if (!isEditable) {
          return;
        }
        applyMutation(() => {
          const target = getSelectedPlayer();
          if (!target?.route) {
            return;
          }
          if (!targetId) {
            target.route[index].action = undefined;
            return;
          }
          target.route[index].action = { type: 'pass', targetId };
        });
      });
      if (!isEditable) {
        actionSelect.disabled = true;
      }

      const delayField = document.createElement('label');
      delayField.className = 'waypoint-field waypoint-delay-field';
      delayField.textContent = 'Delay';
      delayField.append(delayInput);

      const actionField = document.createElement('label');
      actionField.className = 'waypoint-field waypoint-action-field';
      actionField.textContent = 'Action';
      actionField.append(actionSelect);

      const waypointContent = document.createElement('div');
      waypointContent.className = 'waypoint-content';
      waypointContent.append(delayField, actionField);
      waypointRow.append(waypointLabel, waypointContent);
      const waypointIndex = index + 1;
      const waypointDefaultOpen = (leg.delay ?? 0) !== 0 || !!leg.action;
      const waypointState = waypointOpenState.get(player.id)?.get(waypointIndex);
      waypointRow.classList.toggle('is-open', waypointState ?? waypointDefaultOpen);
      waypointLabel.addEventListener('click', () => {
        if (!isEditable && !waypointRow.classList.contains('is-open')) {
          waypointRow.classList.add('is-open');
        }
        const isOpen = waypointRow.classList.toggle('is-open');
        let map = waypointOpenState.get(player.id);
        if (!map) {
          map = new Map();
          waypointOpenState.set(player.id, map);
        }
        map.set(waypointIndex, isOpen);
      });
      waypointList.append(waypointRow);

      const wait = Math.max(0, leg.delay ?? 0);
      elapsed = arrival + wait;
      from = leg.to;
    });

    renderIcons(waypointList);
  }

  function updateTimelineUI() {
    const { start, end } = getPlaybackRange();
    const duration = Math.max(0, end - start);
    if (start < 0 && !scrubberTouched && playTime === 0) {
      playTime = start;
    }
    scrubber.min = '0';
    scrubber.max = duration.toString();
    playTime = clampRange(playTime, start, end);
    scrubber.value = (playTime - start).toString();
    playToggle.disabled = duration <= 0;
  }

  function getPlaybackRange() {
    const start = getPlaybackStartTime();
    const end = Math.max(getPlayDuration(play), getBallEndTime(play, DEFAULT_BALL_SPEED_YPS));
    return { start, end };
  }

  function getPlaybackStartTime(): number {
    return getPlaybackStartTimeForPlay(play);
  }

  function getPlaybackStartTimeForPlay(targetPlay: Play): number {
    const offense = targetPlay.players.filter((player) => player.team === 'offense');
    let minStart = 0;
    for (const player of offense) {
      const delay = player.startDelay ?? 0;
      if (delay < minStart) {
        minStart = delay;
      }
    }
    return minStart;
  }

  function render() {
    const ballState = getBallState(play, playTime, DEFAULT_BALL_SPEED_YPS);
    renderer.render({
      play,
      playTime,
      selectedPlayerId,
      ball: ballState,
      showWaypointMarkers: settings.showWaypointMarkers
    });
    updateTimelineUI();
  }

  function persist() {
    saveDraftPlay(play);
  }

  function pushHistory(snapshot: Play) {
    historyPast.push(snapshot);
    historyFuture = [];
    updateHistoryUI();
  }

  function updateHistoryUI() {
    undoButton.disabled = historyPast.length === 0;
    redoButton.disabled = historyFuture.length === 0;
  }

  function applyMutation(mutator: () => void) {
    const beforeState = serializePlay(play);
    const snapshot = clonePlay(play);
    mutator();
    syncSelectedPlayer();
    updateSelectedPanel();
    render();
    if (serializePlay(play) === beforeState) {
      return;
    }
    pushHistory(snapshot);
    persist();
  }

  function setActiveTeam(team: Team, options: { preserveSelection?: boolean } = {}) {
    activeTeam = team;
    for (const button of teamButtons) {
      button.classList.toggle('active', button.dataset.team === team);
    }
    if (!options.preserveSelection) {
      const selectedPlayer = getSelectedPlayer();
      if (selectedPlayer && selectedPlayer.team !== team) {
        selectedPlayerId = null;
      }
    }
  }

  function setPlayTime(nextTime: number) {
    const { start, end } = getPlaybackRange();
    playTime = clampRange(nextTime, start, end);
    updateTimelineUI();
    render();
  }

  function stopPlayback() {
    isPlaying = false;
    setPlayToggleState('play');
  }

  function resetPlayback() {
    stopPlayback();
    scrubberTouched = false;
    setPlayTime(getPlaybackStartTime());
  }

  function startPlayback() {
    const { start, end } = getPlaybackRange();
    if (end <= start) {
      return;
    }
    if (start < 0 && !scrubberTouched && playTime === 0) {
      playTime = start;
    }
    if (playTime >= end || playTime < start) {
      playTime = start;
    }
    isPlaying = true;
    lastTimestamp = 0;
    setPlayToggleState('pause');
    requestAnimationFrame(tickPlayback);
  }

  function setPlayToggleState(state: 'play' | 'pause') {
    playToggle.setAttribute('aria-label', state === 'play' ? 'Play' : 'Pause');
    playToggle.innerHTML = `<span data-lucide="${state}" aria-hidden="true"></span>`;
    renderIcons(playToggle);
  }

  function tickPlayback(timestamp: number) {
    if (!isPlaying) {
      return;
    }

    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    const delta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    const { end } = getPlaybackRange();
    playTime = Math.min(playTime + delta, end);

    if (playTime >= end) {
      stopPlayback();
    }

    render();

    if (isPlaying) {
      requestAnimationFrame(tickPlayback);
    }
  }

  function addPlayerAt(point: { x: number; y: number }) {
    const label = getNextLabel(activeTeam, play.players);
    const player: Player = {
      id: createId(),
      label,
      team: activeTeam,
      start: point
    };

    if (activeTeam === 'offense') {
      player.route = [];
      player.startDelay = 0;
    }

    if (activeTeam === 'defense') {
      const offenses = play.players.filter((item) => item.team === 'offense');
      if (offenses.length > 0) {
        player.assignment = { type: 'man', targetId: offenses[0].id, speed: DEFAULT_DEFENSE_SPEED };
      } else {
        player.assignment = {
          type: 'zone',
          radiusX: DEFAULT_ZONE_RADIUS_X,
          radiusY: DEFAULT_ZONE_RADIUS_Y,
          speed: DEFAULT_DEFENSE_SPEED
        };
      }
    }

    play.players.push(player);
    setStatus(`Added ${label}`);
  }

  function addWaypointAt(player: Player, point: { x: number; y: number }) {
    if (player.team !== 'offense') {
      return;
    }
    const route = player.route ?? [];
    const previousSpeed =
      route.length > 0 ? route[route.length - 1]?.speed ?? DEFAULT_SPEED : DEFAULT_SPEED;
    const speed = parseSpeed(previousSpeed.toString(), DEFAULT_SPEED);
    const leg: RouteLeg = { to: point, speed, delay: 0 };
    route.push(leg);
    player.route = route;
    setStatus(`Added waypoint for ${player.label}`);
  }

  function startPlayerDrag(pointerId: number, playerId: string, canvasPoint: Vec2) {
    const player = play.players.find((item) => item.id === playerId);
    if (!player) {
      return;
    }
    const world = renderer.canvasToWorld(canvasPoint);
    if (!world) {
      return;
    }

    playerDragState = {
      playerId,
      pointerId,
      snapshot: clonePlay(play),
      moved: false,
      updated: false,
      offset: { x: world.x - player.start.x, y: world.y - player.start.y },
      startCanvas: { ...canvasPoint },
      originStart: { ...player.start },
      originRoute: player.route ? player.route.map((leg) => ({ ...leg.to })) : null,
      initialSelectedId: selectedPlayerId
    };
    canvas.setPointerCapture(pointerId);
    selectPlayer(playerId);
  }

  function updatePlayerDrag(event: PointerEvent) {
    if (!playerDragState || playerDragState.pointerId !== event.pointerId) {
      return;
    }
    const player = play.players.find((item) => item.id === playerDragState.playerId);
    if (!player) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    const distance = Math.hypot(
      point.x - playerDragState.startCanvas.x,
      point.y - playerDragState.startCanvas.y
    );
    if (!playerDragState.moved && distance < 4) {
      return;
    }
    playerDragState.moved = true;

    const world = renderer.canvasToWorld(point);
    if (!world) {
      return;
    }
    const nextStart = {
      x: clamp01(world.x - playerDragState.offset.x),
      y: clamp01(world.y - playerDragState.offset.y)
    };

    const deltaX = nextStart.x - playerDragState.originStart.x;
    const deltaY = nextStart.y - playerDragState.originStart.y;
    player.start = nextStart;

    if (player.route && playerDragState.originRoute) {
      player.route.forEach((leg, index) => {
        const origin = playerDragState.originRoute?.[index];
        if (!origin) {
          return;
        }
        leg.to = {
          x: clamp01(origin.x + deltaX),
          y: clamp01(origin.y + deltaY)
        };
      });
    }

    playerDragState.updated = true;
    render();
  }

  function endPlayerDrag(event: PointerEvent) {
    if (!playerDragState || playerDragState.pointerId !== event.pointerId) {
      return;
    }
    canvas.releasePointerCapture(event.pointerId);

    if (playerDragState.updated) {
      pushHistory(playerDragState.snapshot);
      persist();
      updateSelectedPanel();
    } else if (!playerDragState.moved) {
      if (playerDragState.initialSelectedId === playerDragState.playerId) {
        selectPlayer(null);
      } else {
        selectPlayer(playerDragState.playerId);
        setStatus('Player selected — tap to add waypoints');
      }
    }

    playerDragState = null;
    render();
  }

  function startWaypointDrag(pointerId: number, waypointIndex: number) {
    const player = getSelectedPlayer();
    if (!player) {
      return;
    }
    dragState = {
      playerId: player.id,
      waypointIndex,
      pointerId,
      snapshot: clonePlay(play),
      moved: false
    };
    canvas.setPointerCapture(pointerId);
  }

  function updateWaypointDrag(event: PointerEvent) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const player = getSelectedPlayer();
    if (!player?.route) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const world = renderer.canvasToWorld(point);
    if (!world) {
      return;
    }

    const leg = player.route[dragState.waypointIndex];
    if (!leg) {
      return;
    }

    leg.to = world;
    dragState.moved = true;
    render();
  }

  function endWaypointDrag(event: PointerEvent) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    canvas.releasePointerCapture(event.pointerId);

    if (dragState.moved) {
      pushHistory(dragState.snapshot);
      persist();
      updateSelectedPanel();
    }

    dragState = null;
    render();
  }

  function startZoneDrag(pointerId: number, axis: 'x' | 'y') {
    const player = getSelectedPlayer();
    if (!player || player.assignment?.type !== 'zone') {
      return;
    }
    zoneDragState = {
      playerId: player.id,
      axis,
      pointerId,
      snapshot: clonePlay(play),
      moved: false
    };
    canvas.setPointerCapture(pointerId);
  }

  function updateZoneDrag(event: PointerEvent) {
    if (!zoneDragState || zoneDragState.pointerId !== event.pointerId) {
      return;
    }
    const player = play.players.find((item) => item.id === zoneDragState.playerId);
    if (!player || player.assignment?.type !== 'zone') {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const world = renderer.canvasToWorld(point);
    if (!world) {
      return;
    }

    const dxYards = Math.abs(world.x - player.start.x) * FIELD_WIDTH_YARDS;
    const dyYards = Math.abs(world.y - player.start.y) * FIELD_LENGTH_YARDS;
    if (zoneDragState.axis === 'x') {
      player.assignment.radiusX = Math.max(MIN_ZONE_RADIUS, dxYards);
      zoneRadiusXInput.value = player.assignment.radiusX.toFixed(1);
    } else {
      player.assignment.radiusY = Math.max(MIN_ZONE_RADIUS, dyYards);
      zoneRadiusYInput.value = player.assignment.radiusY.toFixed(1);
    }

    zoneDragState.moved = true;
    render();
  }

  function endZoneDrag(event: PointerEvent) {
    if (!zoneDragState || zoneDragState.pointerId !== event.pointerId) {
      return;
    }
    canvas.releasePointerCapture(event.pointerId);

    if (zoneDragState.moved) {
      pushHistory(zoneDragState.snapshot);
      persist();
      updateSelectedPanel();
    }

    zoneDragState = null;
    render();
  }

  function handleUndo() {
    if (historyPast.length === 0) {
      return;
    }
    historyFuture.push(clonePlay(play));
    play = historyPast.pop() ?? play;
    syncSelectedPlayer();
    persist();
    updateSelectedPanel();
    render();
    updateHistoryUI();
  }

  function handleRedo() {
    if (historyFuture.length === 0) {
      return;
    }
    historyPast.push(clonePlay(play));
    play = historyFuture.pop() ?? play;
    syncSelectedPlayer();
    persist();
    updateSelectedPanel();
    render();
    updateHistoryUI();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    stopPlayback();
    const rect = canvas.getBoundingClientRect();
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    if (canEdit) {
      const zoneAxis = renderer.hitTestZoneHandle(point, play, selectedPlayerId);
      if (zoneAxis) {
        startZoneDrag(event.pointerId, zoneAxis);
        return;
      }
    }

    const selectedForWaypoint = getSelectedPlayer();
    if (canEdit && selectedForWaypoint?.team === 'offense') {
      const waypointIndex = renderer.hitTestWaypoint(point, selectedPlayerId, play);
      if (waypointIndex !== null) {
        startWaypointDrag(event.pointerId, waypointIndex);
        return;
      }
    }

    const hitId = renderer.hitTest(point, play, playTime);
    if (hitId) {
      if (canEdit) {
        startPlayerDrag(event.pointerId, hitId, point);
      } else {
        selectPlayer(hitId);
      }
      return;
    }

    const world = renderer.canvasToWorld(point);
    if (!world) {
      return;
    }

    if (!canEdit) {
      return;
    }

    setPlayTime(0);
    const selectedPlayer = getSelectedPlayer();
    if (selectedPlayer && selectedPlayer.team === 'offense') {
      applyMutation(() => {
        addWaypointAt(selectedPlayer, world);
      });
      return;
    }

    applyMutation(() => {
      addPlayerAt(world);
    });
  });

  canvas.addEventListener('pointermove', (event) => {
    if (zoneDragState) {
      updateZoneDrag(event);
      return;
    }
    if (dragState) {
      updateWaypointDrag(event);
      return;
    }
    updatePlayerDrag(event);
  });

  canvas.addEventListener('pointerup', (event) => {
    if (zoneDragState) {
      endZoneDrag(event);
      return;
    }
    if (dragState) {
      endWaypointDrag(event);
      return;
    }
    endPlayerDrag(event);
  });

  canvas.addEventListener('pointercancel', (event) => {
    if (zoneDragState) {
      endZoneDrag(event);
      return;
    }
    if (dragState) {
      endWaypointDrag(event);
      return;
    }
    endPlayerDrag(event);
  });

  scrubber.addEventListener('input', () => {
    stopPlayback();
    const value = Number(scrubber.value);
    if (Number.isFinite(value)) {
      scrubberTouched = true;
      const { start } = getPlaybackRange();
      setPlayTime(start + value);
    }
  });

  playToggle.addEventListener('click', () => {
    if (isPlaying) {
      stopPlayback();
      render();
      return;
    }
    startPlayback();
  });

  resetTimeButton.addEventListener('click', () => {
    resetPlayback();
  });

  fullscreenToggle.addEventListener('click', async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fieldSection?.requestFullscreen) {
      await fieldSection.requestFullscreen();
      return;
    }
    setFullscreen(!fullscreenActive);
  });

  document.addEventListener('fullscreenchange', () => {
    setFullscreen(document.fullscreenElement === fieldSection);
  });

  editModeToggle.addEventListener('click', () => {
    if (editModeToggle.disabled) {
      return;
    }
    editMode = !editMode;
    syncEditorMode();
    showEditModeLabel();
  });

  deletePlayerButton.addEventListener('click', () => {
    closePlayerMenu();
    const player = getSelectedPlayer();
    if (!player || !canEdit) {
      return;
    }
    applyMutation(() => {
      play.players = play.players.filter((item) => item.id !== player.id);
      selectedPlayerId = null;
      setStatus('Player removed');
    });
  });

  renamePlayerButton.addEventListener('click', async () => {
    closePlayerMenu();
    const player = getSelectedPlayer();
    if (!player || !canEdit) {
      return;
    }
    const name = await openNameModal({
      title: 'Rename player',
      subtitle: '',
      label: 'Player name',
      placeholder: player.label,
      submitLabel: 'Rename player',
      defaultName: player.label
    });
    if (!name || name === player.label) {
      return;
    }
    applyMutation(() => {
      const selected = getSelectedPlayer();
      if (!selected) {
        return;
      }
      selected.label = name;
    });
    setStatus(`Renamed to ${name}`);
  });

  coverageTypeSelect.addEventListener('change', () => {
    if (!canEdit) {
      return;
    }
    const type = coverageTypeSelect.value;
    applyMutation(() => {
      const target = getSelectedPlayer();
      if (!target) {
        return;
      }
      if (type === 'man') {
        const candidates = play.players.filter((player) => player.team === 'offense');
        const targetId = candidates[0]?.id;
        if (!targetId) {
          target.assignment = {
            type: 'zone',
            radiusX: DEFAULT_ZONE_RADIUS_X,
            radiusY: DEFAULT_ZONE_RADIUS_Y,
            speed: DEFAULT_DEFENSE_SPEED
          };
          return;
        }
        const speed = parseSpeed(coverageSpeedInput.value, DEFAULT_DEFENSE_SPEED);
        target.assignment = { type: 'man', targetId, speed };
        return;
      }
      if (type === 'zone') {
        target.assignment = {
          type: 'zone',
          radiusX: parsePositiveNumber(zoneRadiusXInput.value, DEFAULT_ZONE_RADIUS_X),
          radiusY: parsePositiveNumber(zoneRadiusYInput.value, DEFAULT_ZONE_RADIUS_Y),
          speed: parseSpeed(zoneSpeedInput.value, DEFAULT_DEFENSE_SPEED)
        };
      }
    });
  });

  coverageTargetSelect.addEventListener('change', () => {
    if (!canEdit) {
      return;
    }
    if (coverageTypeSelect.value !== 'man') {
      return;
    }
    const targetId = coverageTargetSelect.value;
    applyMutation(() => {
      const target = getSelectedPlayer();
      if (!target) {
        return;
      }
      if (!targetId) {
        return;
      }
      const speed = parseSpeed(coverageSpeedInput.value, DEFAULT_DEFENSE_SPEED);
      target.assignment = { type: 'man', targetId, speed };
    });
  });

  coverageSpeedInput.addEventListener('change', () => {
    if (!canEdit) {
      return;
    }
    const target = getSelectedPlayer();
    if (!target?.assignment || target.assignment.type !== 'man') {
      return;
    }
    const speed = parseSpeed(coverageSpeedInput.value, target.assignment.speed);
    if (speed === target.assignment.speed) {
      return;
    }
    applyMutation(() => {
      const selected = getSelectedPlayer();
      if (!selected?.assignment) {
        return;
      }
      if (selected.assignment.type === 'man') {
        selected.assignment.speed = speed;
      }
    });
  });

  zoneRadiusXInput.addEventListener('change', () => {
    if (!canEdit) {
      return;
    }
    const target = getSelectedPlayer();
    if (!target?.assignment || target.assignment.type !== 'zone') {
      return;
    }
    const radiusX = parsePositiveNumber(zoneRadiusXInput.value, target.assignment.radiusX);
    if (radiusX === target.assignment.radiusX) {
      return;
    }
    applyMutation(() => {
      const selected = getSelectedPlayer();
      if (!selected?.assignment || selected.assignment.type !== 'zone') {
        return;
      }
      selected.assignment.radiusX = radiusX;
    });
  });

  zoneRadiusYInput.addEventListener('change', () => {
    if (!canEdit) {
      return;
    }
    const target = getSelectedPlayer();
    if (!target?.assignment || target.assignment.type !== 'zone') {
      return;
    }
    const radiusY = parsePositiveNumber(zoneRadiusYInput.value, target.assignment.radiusY);
    if (radiusY === target.assignment.radiusY) {
      return;
    }
    applyMutation(() => {
      const selected = getSelectedPlayer();
      if (!selected?.assignment || selected.assignment.type !== 'zone') {
        return;
      }
      selected.assignment.radiusY = radiusY;
    });
  });

  zoneSpeedInput.addEventListener('change', () => {
    if (!canEdit) {
      return;
    }
    const target = getSelectedPlayer();
    if (!target?.assignment || target.assignment.type !== 'zone') {
      return;
    }
    const speed = parseSpeed(zoneSpeedInput.value, target.assignment.speed);
    if (speed === target.assignment.speed) {
      return;
    }
    applyMutation(() => {
      const selected = getSelectedPlayer();
      if (!selected?.assignment || selected.assignment.type !== 'zone') {
        return;
      }
      selected.assignment.speed = speed;
    });
  });

  function closeSaveMenu() {
    saveMenu.classList.add('is-hidden');
    saveMenuToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleSaveMenu() {
    const isOpen = !saveMenu.classList.contains('is-hidden');
    if (isOpen) {
      closeSaveMenu();
      return;
    }
    saveMenu.classList.remove('is-hidden');
    saveMenuToggle.setAttribute('aria-expanded', 'true');
  }

  async function copyToClipboard(text: string, message = 'Link copied') {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setStatus(message);
        return;
      } catch {
        // fall back to prompt below
      }
    }
    window.prompt('Copy link', text);
    setStatus(message);
  }

  async function copyShareLink() {
    if (!currentUserId || currentRole !== 'coach') {
      setStatus('Sign in as a collaborator to share plays');
      return;
    }
    if (!selectedSavedPlayId) {
      const name = await openNameModal({
        title: 'Save play',
        subtitle: 'Name this play before sharing.',
        label: 'Play name',
        placeholder: 'New play',
        submitLabel: 'Save play',
        defaultName: getCurrentPlayName()
      });
      if (!name) {
        return;
      }
      await updateSelectedPlay(name);
    }
    if (!selectedSavedPlayId) {
      return;
    }
    const token = generateShareToken();
    const payload = {
      play_id: selectedSavedPlayId,
      play_name: getCurrentPlayName(),
      play_data: clonePlay(play),
      token,
      created_by: currentUserId
    };
    const { data, error } = await supabase
      .from('play_shares')
      .insert(payload)
      .select('token')
      .single();
    if (error || !data) {
      console.error('Failed to create play share', error);
      setStatus('Unable to share play');
      return;
    }
    const url = buildShareUrl(data.token, 'share');
    await copyToClipboard(url, 'Play link copied');
  }

  async function createPlaybookShareLink(role: 'player' | 'coach'): Promise<string | null> {
    if (!currentUserId || !selectedPlaybookId || currentRole !== 'coach') {
      setStatus('Select a playbook you can share');
      return null;
    }
    const token = generateShareToken();
    const { data, error } = await supabase
      .from('playbook_shares')
      .upsert(
        {
          playbook_id: selectedPlaybookId,
          role,
          token,
          created_by: currentUserId
        },
        { onConflict: 'playbook_id,role' }
      )
      .select('token')
      .single();
    if (error || !data) {
      console.error('Failed to create playbook share', error);
      setStatus('Unable to share playbook');
      return null;
    }
    return buildShareUrl(data.token, 'playbook');
  }

  savePlayButton.addEventListener('click', async () => {
    if (selectedSavedPlayId) {
      const entry = savedPlays.find((item) => item.id === selectedSavedPlayId);
      if (entry) {
        await updateSelectedPlay(entry.name);
        return;
      }
    }
    const name = await openNameModal({
      title: 'Save play',
      subtitle: 'Name this play before saving.',
      label: 'Play name',
      placeholder: 'New play',
      submitLabel: 'Save play',
      defaultName: getCurrentPlayName()
    });
    if (!name) {
      return;
    }
    await updateSelectedPlay(name);
  });

  newPlayButton.addEventListener('click', () => {
    resetPlayState();
    selectedSavedPlayId = null;
    sharedPlayActive = false;
    sharedPlayToken = null;
    syncEditorMode();
    renderSavedPlaysSelect();
    scrubberTouched = false;
    setStatus('Started a new play');
    updateSharedPlayUI();
  });

  flipPlayButton.addEventListener('click', () => {
    applyMutation(() => {
      flipPlay();
    });
    setStatus('Flipped play');
  });

  saveAsNewButton.addEventListener('click', async () => {
    const name = await openNameModal({
      title: 'Save as new',
      subtitle: 'Save a fresh copy of this play.',
      label: 'Play name',
      placeholder: 'New play',
      submitLabel: 'Save play',
      defaultName: getCurrentPlayName()
    });
    if (!name) {
      return;
    }
    await savePlayAsNew(name);
    closeSaveMenu();
  });

  sharePlayButton.addEventListener('click', () => {
    copyShareLink();
    closeSaveMenu();
  });

  renamePlayButton.addEventListener('click', async () => {
    closePlayMenu();
    if (!selectedSavedPlayId) {
      return;
    }
    const entry = savedPlays.find((item) => item.id === selectedSavedPlayId);
    if (!entry) {
      return;
    }
    const name = await openNameModal({
      title: 'Rename play',
      subtitle: '',
      label: 'Play name',
      placeholder: entry.name,
      submitLabel: 'Rename play',
      defaultName: entry.name
    });
    if (!name || name === entry.name) {
      return;
    }
    const { data, error } = await supabase
      .from('plays')
      .update({ name })
      .eq('id', entry.id)
      .select('id, name, data, notes, tags, sort_order, created_at, updated_at')
      .single();
    if (error || !data) {
      console.error('Failed to rename play', error);
      setStatus('Unable to rename play');
      return;
    }
    savedPlays = savedPlays.map((item) =>
      item.id === entry.id
        ? {
            id: data.id,
            name: data.name,
            play: data.data as Play,
            notes: data.notes ?? '',
            tags: data.tags ?? [],
            sortOrder: data.sort_order ?? item.sortOrder ?? 0,
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime()
          }
        : item
    );
    updateSavedPlaysStorage();
    setStatus(`Renamed to ${name}`);
  });

  deletePlayButton.addEventListener('click', async () => {
    closePlayMenu();
    if (!selectedSavedPlayId) {
      return;
    }
    const entry = savedPlays.find((item) => item.id === selectedSavedPlayId);
    if (!entry) {
      return;
    }
    const { error } = await supabase.from('plays').delete().eq('id', entry.id);
    if (error) {
      console.error('Failed to delete play', error);
      setStatus('Unable to delete play');
      return;
    }
    savedPlays = savedPlays.filter((item) => item.id !== selectedSavedPlayId);
    selectedSavedPlayId = null;
    setLastSelectedPlay(selectedPlaybookId, null);
    updateSavedPlaysStorage();
    persist();
    setStatus(`Deleted ${entry.name}`);
  });

  saveMenuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSaveMenu();
  });

  document.addEventListener('click', (event) => {
    if (!saveMenu.classList.contains('is-hidden')) {
      const target = event.target as Node | null;
      if (target && !saveMenu.contains(target) && !saveMenuToggle.contains(target)) {
        closeSaveMenu();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSaveMenu();
    }
  });

  savedPlaysSelect.addEventListener('change', () => {
    const value = savedPlaysSelect.value;
    selectSavedPlayById(value || null);
  });

  playerSelect.addEventListener('change', () => {
    const value = playerSelect.value;
    if (!value) {
      selectPlayer(null);
      return;
    }
    const candidate = play.players.find((player) => player.id === value);
    if (!candidate) {
      selectPlayer(null);
      return;
    }
    selectPlayer(candidate.id);
  });

  undoButton.addEventListener('click', handleUndo);
  redoButton.addEventListener('click', handleRedo);

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    const platform = navigator.platform ? navigator.platform.toLowerCase() : '';
    const isMac = platform.includes('mac');
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (!modifier) {
      return;
    }
    if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      handleUndo();
    }
    if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') {
      event.preventDefault();
      handleRedo();
    }
  });

  for (const button of teamButtons) {
    button.addEventListener('click', () => {
      const team = button.dataset.team as Team | undefined;
      if (!team) {
        return;
      }
      setActiveTeam(team);
      updateSelectedPanel();
      render();
    });
  }

  const closePlaybookMenu = setupContextMenu(playbookMenuToggle, playbookMenu as HTMLElement);
  const closePlayMenu = setupContextMenu(playMenuToggle, playMenu as HTMLElement);
  const closePlayerMenu = setupContextMenu(playerMenuToggle, playerMenu as HTMLElement);

  function closeAuthMenu() {
    authMenu.classList.add('is-hidden');
  }

  function openAuthModal() {
    if (document.querySelector('.auth-modal')) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.innerHTML = `
      <div class="auth-modal-card" role="dialog" aria-modal="true" aria-label="Sign in">
        <div class="auth-modal-header">
          <div>
            <p class="auth-modal-title">Sign in</p>
            <p class="auth-modal-subtitle">Access your playbooks anywhere.</p>
          </div>
          <button type="button" class="icon-button" data-auth-close aria-label="Close">
            <span data-lucide="x" aria-hidden="true"></span>
          </button>
        </div>
        <div class="auth-provider-buttons">
          <button type="button" class="secondary" data-auth-google>
            Continue with Google
          </button>
          <div class="auth-divider">or</div>
          <div class="auth-email-row">
            <label class="field-label">
              Email
              <input type="email" data-auth-email placeholder="you@example.com" />
            </label>
            <button type="button" class="primary" data-auth-email-submit>
              Send magic link
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.append(overlay);
    renderIcons(overlay);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    const closeButton = overlay.querySelector('[data-auth-close]') as HTMLButtonElement | null;
    const googleButton = overlay.querySelector('[data-auth-google]') as HTMLButtonElement | null;
    const emailInput = overlay.querySelector('[data-auth-email]') as HTMLInputElement | null;
    const emailSubmit = overlay.querySelector('[data-auth-email-submit]') as HTMLButtonElement | null;

    if (emailInput) {
      emailInput.value = lastAuthEmail;
      window.setTimeout(() => emailInput.focus(), 0);
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    closeButton?.addEventListener('click', close);

    emailSubmit?.addEventListener('click', async () => {
      const email = emailInput?.value.trim() ?? '';
      if (!email) {
        setStatus('Enter an email to receive a magic link');
        return;
      }
      lastAuthEmail = email;
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) {
        console.error('Magic link error', error);
        setStatus('Unable to send magic link');
        return;
      }
      setStatus('Magic link sent — check your email');
      close();
    });

    googleButton?.addEventListener('click', async () => {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      });
      if (error) {
        console.error('Google auth error', error);
        setStatus('Unable to sign in with Google');
        return;
      }
      close();
    });
  }

  function openHelpModal() {
    if (document.querySelector('.auth-modal')) {
      return;
    }

    const steps = [
      {
        title: 'Welcome to Playmaker',
        body: ['Start making plays by tapping on the field to add players.']
      },
      {
        title: 'Add routes & actions',
        body: [
          'Select a player, then tap the field to add waypoints.',
          'Set delays, speeds, and actions like handoffs or passes.'
        ]
      },
      {
        title: 'Run your play',
        body: ['Press Play to watch it move and scrub the timeline to review.']
      },
      {
        title: 'Share with your team',
        body: ['Share a play or playbook so others can view or collaborate.']
      },
      {
        title: 'Advanced timing',
        body: [
          'Run pre-snap motion by setting Waypoint 0 Delay to a negative number.',
          'Use waypoint timings to sync player movements and actions.'
        ]
      }
    ];

    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.innerHTML = `
      <div class="auth-modal-card help-modal-card" role="dialog" aria-modal="true" aria-label="Help">
        <div class="help-modal-close">
          <button type="button" class="icon-button" data-help-close aria-label="Close">
            <span data-lucide="x" aria-hidden="true"></span>
          </button>
        </div>
        <div class="help-carousel">
          <div class="help-slides">
            ${steps
              .map((step, index) => {
                const visual =
                  index === 0
                    ? 'hike'
                    : index === 1
                      ? 'waypoints'
                      : index === 2
                        ? 'run'
                        : index === 3
                          ? 'share'
                          : 'motion';
                const visualMarkup =
                  visual === 'run'
                    ? `
                <div class="help-mini-controls">
                  <span class="help-mini-play">
                    <span class="help-mini-play-icon"></span>
                  </span>
                  <div class="help-mini-scrubber">
                    <span class="help-mini-scrubber-dot"></span>
                  </div>
                </div>
                <div class="help-visual help-visual-canvas" data-help-visual="${visual}"></div>
              `
                    : visual === 'share'
                    ? `
                <div class="help-visual help-visual-share" data-help-visual="${visual}">
                  <div class="help-share-wrapper">
                    <div class="help-share-toolbar">
                      <div class="help-share-group">
                        <div class="help-share-dropdown">My Playbook</div>
                        <div class="help-share-dots">
                          <span></span><span></span><span></span>
                        </div>
                        <div class="help-share-menu">
                          <div class="help-share-item help-share-item-share">Share</div>
                          <div class="help-share-item">Rename</div>
                          <div class="help-share-item">Delete</div>
                        </div>
                      </div>
                    </div>
                    <div class="help-share-cursor"></div>
                  </div>
                </div>
              `
                      : `
                <div class="help-visual help-visual-canvas" data-help-visual="${visual}"></div>
              `;
                return `
              <div class="help-slide${index === 0 ? ' is-active' : ''}" data-help-slide="${index}">
                <p class="help-slide-title">${step.title}</p>
                ${step.body.map((line) => `<p class="help-slide-text">${line}</p>`).join('')}
                ${visualMarkup}
              </div>
            `;
              })
              .join('')}
          </div>
          <div class="help-footer">
            <div class="help-dots" role="tablist">
              ${steps
                .map(
                  (_step, index) => `
                <button type="button" class="help-dot${index === 0 ? ' is-active' : ''}" data-help-dot="${index}" aria-label="Step ${index + 1}"></button>
              `
                )
                .join('')}
            </div>
            <div class="help-actions">
              <button type="button" class="secondary" data-help-prev>Back</button>
              <button type="button" class="primary" data-help-next>Next</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.append(overlay);
    renderIcons(overlay);
    const cleanupAnimations: Array<() => void> = [];

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      cleanupAnimations.forEach((cleanup) => cleanup());
      try {
        localStorage.setItem(HELP_SEEN_KEY, '1');
      } catch {
        // ignore persistence errors
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    const closeButton = overlay.querySelector('[data-help-close]') as HTMLButtonElement | null;
    const prevButton = overlay.querySelector('[data-help-prev]') as HTMLButtonElement | null;
    const nextButton = overlay.querySelector('[data-help-next]') as HTMLButtonElement | null;
    const slides = Array.from(overlay.querySelectorAll<HTMLElement>('.help-slide'));
    const dots = Array.from(overlay.querySelectorAll<HTMLButtonElement>('.help-dot'));

    if (!prevButton || !nextButton) {
      return;
    }

    const setupHelpVisuals = () => {
      const visuals = Array.from(
        overlay.querySelectorAll<HTMLElement>('[data-help-visual]')
      );

      const createHikePlay = (): Play => {
        const centerId = 'help-center';
        const qbId = 'help-qb';
        const wrId = 'help-wr';
        return {
          players: [
            {
              id: centerId,
              label: 'C',
              team: 'offense',
              start: { x: 0.5, y: 0.68 },
              startAction: { type: 'handoff', targetId: qbId }
            },
            {
              id: qbId,
              label: 'QB',
              team: 'offense',
              start: { x: 0.5, y: 0.78 },
              route: [
                {
                  to: { x: 0.48, y: 0.82 },
                  speed: 6,
                  delay: 0.6,
                  action: { type: 'pass', targetId: wrId }
                }
              ]
            },
            {
              id: wrId,
              label: 'WR',
              team: 'offense',
              start: { x: 0.7, y: 0.62 },
              route: [
                {
                  to: { x: 0.55, y: 0.46 },
                  speed: 7
                }
              ]
            }
          ]
        };
      };

      const createMotionPlay = (): Play => ({
        players: [
          {
            id: 'motion-qb',
            label: 'QB',
            team: 'offense',
            start: { x: 0.5, y: 0.78 }
          },
          {
            id: 'motion-wr',
            label: 'WR',
            team: 'offense',
            start: { x: 0.2, y: 0.66 },
            startDelay: -1,
            route: [
              {
                to: { x: 0.42, y: 0.9 },
                speed: 6
              },
              {
                to: { x: 0.78, y: 0.9 },
                speed: 6
              }
            ]
          }
        ]
      });

      const createWaypointSteps = (): Play[] => {
        const playerA = {
          id: 'waypoint-a',
          label: 'O',
          team: 'offense' as const,
          start: { x: 0.4, y: 0.7 }
        };
        const playerB = {
          id: 'waypoint-b',
          label: 'O',
          team: 'offense' as const,
          start: { x: 0.65, y: 0.7 }
        };
        const baseLeg = {
          to: { x: 0.52, y: 0.82 },
          speed: 8
        };
        return [
          { players: [playerA] },
          { players: [playerA, playerB] },
          {
            players: [
              {
                ...playerA,
                route: [baseLeg]
              },
              playerB
            ]
          },
          {
            players: [
              {
                ...playerA,
                route: [
                  {
                    ...baseLeg,
                    action: { type: 'handoff', targetId: playerB.id }
                  }
                ]
              },
              playerB
            ]
          }
        ];
      };

      const hikePlay = createHikePlay();
      const motionPlay = createMotionPlay();
      const waypointSteps = createWaypointSteps();
      const waypointLegDuration = getLegDuration(
        waypointSteps[2]?.players[0]?.start ?? { x: 0.4, y: 0.7 },
        (waypointSteps[2]?.players[0] as Player | undefined)?.route?.[0] ?? {
          to: { x: 0.52, y: 0.82 },
          speed: 8
        }
      );
      const handoffPreviewDuration = Math.max(0.6, waypointLegDuration + 0.35);

      visuals.forEach((visual) => {
        const type = visual.dataset.helpVisual;
        if (!type || type === 'share') {
          return;
        }
        const canvas = document.createElement('canvas');
        visual.append(canvas);
        const renderer = createRenderer(canvas);

        const handleResize = () => {
          renderer.resize();
        };
        handleResize();
        window.addEventListener('resize', handleResize);

        let frameId = 0;
        const start = performance.now();
        const loop = (now: number) => {
          renderer.resize();
          const elapsed = (now - start) / 1000;
          let playToRender: Play = hikePlay;
          let playTime = elapsed % 4.5;
          let showMarkers = false;

          if (type === 'motion') {
            playToRender = motionPlay;
            const duration = 4.2;
            playTime = -1 + (elapsed % duration);
          } else if (type === 'waypoints') {
            const stepDuration = Math.max(1.4, handoffPreviewDuration + 0.2);
            const step = Math.floor((elapsed % (stepDuration * 4)) / stepDuration);
            const localTime = (elapsed % stepDuration) / stepDuration;
            playToRender = waypointSteps[step] ?? waypointSteps[0];
            showMarkers = step >= 2;
            playTime = step === 3 ? localTime * handoffPreviewDuration : 0;
          }

          const ballState = getBallState(playToRender, playTime, DEFAULT_BALL_SPEED_YPS);
          renderer.render({
            play: playToRender,
            playTime,
            selectedPlayerId: null,
            ball: ballState,
            showWaypointMarkers: showMarkers
          });
          frameId = window.requestAnimationFrame(loop);
        };

        frameId = window.requestAnimationFrame(loop);

        cleanupAnimations.push(() => {
          window.cancelAnimationFrame(frameId);
          window.removeEventListener('resize', handleResize);
        });
      });
    };

    setupHelpVisuals();

    let activeIndex = 0;

    const setSlide = (index: number) => {
      activeIndex = Math.min(Math.max(index, 0), slides.length - 1);
      slides.forEach((slide, idx) => {
        slide.classList.toggle('is-active', idx === activeIndex);
      });
      dots.forEach((dot, idx) => {
        dot.classList.toggle('is-active', idx === activeIndex);
      });
      prevButton.disabled = activeIndex === 0;
      nextButton.textContent = activeIndex === slides.length - 1 ? 'Done' : 'Next';
    };

    prevButton.addEventListener('click', () => {
      setSlide(activeIndex - 1);
    });

    nextButton.addEventListener('click', () => {
      if (activeIndex === slides.length - 1) {
        close();
        return;
      }
      setSlide(activeIndex + 1);
    });

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const value = Number(dot.dataset.helpDot ?? 0);
        if (!Number.isNaN(value)) {
          setSlide(value);
        }
      });
    });

    closeButton?.addEventListener('click', close);
    setSlide(0);
  }

  function openNameModal(options: {
    title: string;
    subtitle?: string;
    label: string;
    placeholder: string;
    submitLabel: string;
    defaultName?: string;
  }): Promise<string | null> {
    if (document.querySelector('.auth-modal')) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const title = options.title;
      const subtitle = options.subtitle ?? '';
      const submitLabel = options.submitLabel;
      const label = options.label;
      const placeholder = options.placeholder;
      const defaultName = options.defaultName ?? '';
      const overlay = document.createElement('div');
      overlay.className = 'auth-modal';
      overlay.innerHTML = `
        <div class="auth-modal-card" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="auth-modal-header">
            <div>
              <p class="auth-modal-title">${title}</p>
              ${subtitle ? `<p class="auth-modal-subtitle">${subtitle}</p>` : ''}
            </div>
            <button type="button" class="icon-button" data-playbook-close aria-label="Close">
              <span data-lucide="x" aria-hidden="true"></span>
            </button>
          </div>
          <div class="auth-email-row">
            <label class="field-label">
              ${label}
              <input type="text" data-playbook-name placeholder="${placeholder}" />
            </label>
            <button type="button" class="primary" data-playbook-submit>
              ${submitLabel}
            </button>
          </div>
        </div>
      `;

      document.body.append(overlay);
      renderIcons(overlay);

      const close = (value: string | null) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };

      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close(null);
        }
      };
      document.addEventListener('keydown', onKey);

      const closeButton = overlay.querySelector('[data-playbook-close]') as HTMLButtonElement | null;
      const submitButton = overlay.querySelector('[data-playbook-submit]') as HTMLButtonElement | null;
      const nameInput = overlay.querySelector('[data-playbook-name]') as HTMLInputElement | null;

      if (nameInput) {
        nameInput.value = defaultName;
        window.setTimeout(() => nameInput.focus(), 0);
      }

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });

      closeButton?.addEventListener('click', () => close(null));

      submitButton?.addEventListener('click', () => {
        const name = nameInput?.value.trim() ?? '';
        if (!name) {
          setStatus(`Enter a ${label.toLowerCase()}`);
          return;
        }
        close(name);
      });
    });
  }

  function openConfirmModal(options: {
    title: string;
    subtitle?: string;
    confirmLabel: string;
    cancelLabel?: string;
  }): Promise<boolean> {
    if (document.querySelector('.auth-modal')) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const title = options.title;
      const subtitle = options.subtitle ?? '';
      const confirmLabel = options.confirmLabel;
      const cancelLabel = options.cancelLabel ?? 'Cancel';
      const overlay = document.createElement('div');
      overlay.className = 'auth-modal';
      overlay.innerHTML = `
        <div class="auth-modal-card" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="auth-modal-header">
            <div>
              <p class="auth-modal-title">${title}</p>
              ${subtitle ? `<p class="auth-modal-subtitle">${subtitle}</p>` : ''}
            </div>
            <button type="button" class="icon-button" data-confirm-close aria-label="Close">
              <span data-lucide="x" aria-hidden="true"></span>
            </button>
          </div>
          <div class="auth-email-row">
            <div class="button-row">
              <button type="button" class="secondary" data-confirm-cancel>${cancelLabel}</button>
              <button type="button" class="primary" data-confirm-submit>${confirmLabel}</button>
            </div>
          </div>
        </div>
      `;

      document.body.append(overlay);
      renderIcons(overlay);

      const close = (value: boolean) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };

      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close(false);
        }
      };
      document.addEventListener('keydown', onKey);

      const closeButton = overlay.querySelector('[data-confirm-close]') as HTMLButtonElement | null;
      const cancelButton = overlay.querySelector('[data-confirm-cancel]') as HTMLButtonElement | null;
      const submitButton = overlay.querySelector('[data-confirm-submit]') as HTMLButtonElement | null;

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          close(false);
        }
      });

      closeButton?.addEventListener('click', () => close(false));
      cancelButton?.addEventListener('click', () => close(false));
      submitButton?.addEventListener('click', () => close(true));
    });
  }

  function openSharedSaveModal(defaultName: string): Promise<{ playbookId: string; name: string } | null> {
    if (document.querySelector('.auth-modal')) {
      return Promise.resolve(null);
    }
    const editablePlaybooks = playbooks.filter((book) => book.role === 'coach');
    if (editablePlaybooks.length === 0) {
      setStatus('Create a playbook you can edit to save this play');
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'auth-modal';
      overlay.innerHTML = `
        <div class="auth-modal-card history-modal-card" role="dialog" aria-modal="true" aria-label="Save shared play">
          <div class="auth-modal-header">
            <div>
              <p class="auth-modal-title">Save shared play</p>
              <p class="auth-modal-subtitle">Choose where to store this play.</p>
            </div>
            <button type="button" class="icon-button" data-share-close aria-label="Close">
              <span data-lucide="x" aria-hidden="true"></span>
            </button>
          </div>
          <div class="auth-email-row">
            <label class="field-label">
              Playbook
              <select data-share-playbook></select>
            </label>
            <label class="field-label">
              Play name
              <input type="text" data-share-name placeholder="New play" />
            </label>
            <button type="button" class="primary" data-share-submit>Save play</button>
          </div>
        </div>
      `;

      document.body.append(overlay);
      renderIcons(overlay);

      const close = (value: { playbookId: string; name: string } | null) => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };

      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close(null);
        }
      };
      document.addEventListener('keydown', onKey);

      const playbookSelectEl = overlay.querySelector('[data-share-playbook]') as HTMLSelectElement | null;
      const nameInput = overlay.querySelector('[data-share-name]') as HTMLInputElement | null;
      const submitButton = overlay.querySelector('[data-share-submit]') as HTMLButtonElement | null;
      const closeButton = overlay.querySelector('[data-share-close]') as HTMLButtonElement | null;

      if (playbookSelectEl) {
        editablePlaybooks.forEach((book) => {
          const option = document.createElement('option');
          option.value = book.id;
          option.textContent = book.name;
          playbookSelectEl.append(option);
        });
        playbookSelectEl.value = selectedPlaybookId ?? editablePlaybooks[0].id;
      }

      if (nameInput) {
        nameInput.value = defaultName;
        window.setTimeout(() => nameInput.focus(), 0);
      }

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });

      closeButton?.addEventListener('click', () => close(null));
      submitButton?.addEventListener('click', () => {
        const name = nameInput?.value.trim() ?? '';
        const playbookId = playbookSelectEl?.value ?? '';
        if (!playbookId) {
          setStatus('Select a playbook');
          return;
        }
        if (!name) {
          setStatus('Enter a play name');
          return;
        }
        close({ playbookId, name });
      });
    });
  }

  function openPlaybookShareModal(getLink: (role: 'player' | 'coach') => Promise<string | null>) {
    if (document.querySelector('.auth-modal')) {
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.innerHTML = `
      <div class="auth-modal-card history-modal-card" role="dialog" aria-modal="true" aria-label="Share playbook">
        <div class="auth-modal-header">
          <div>
            <p class="auth-modal-title">Share playbook</p>
            <p class="auth-modal-subtitle">Send a view or collaborate link.</p>
          </div>
          <button type="button" class="icon-button" data-share-close aria-label="Close">
            <span data-lucide="x" aria-hidden="true"></span>
          </button>
        </div>
        <div class="share-link-list">
          <div class="share-link-row">
            <div>
              <strong>Viewer link</strong>
              <p class="auth-modal-subtitle">Read-only access.</p>
            </div>
            <button type="button" class="secondary" data-share-view>Copy link</button>
          </div>
          <div class="share-link-row">
            <div>
              <strong>Collaborator link</strong>
              <p class="auth-modal-subtitle">Can edit plays.</p>
            </div>
            <button type="button" class="secondary" data-share-collab>Copy link</button>
          </div>
        </div>
      </div>
    `;
    document.body.append(overlay);
    renderIcons(overlay);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    const closeButton = overlay.querySelector('[data-share-close]') as HTMLButtonElement | null;
    closeButton?.addEventListener('click', close);

    const viewButton = overlay.querySelector('[data-share-view]') as HTMLButtonElement | null;
    const collabButton = overlay.querySelector('[data-share-collab]') as HTMLButtonElement | null;

    viewButton?.addEventListener('click', async () => {
      const link = await getLink('player');
      if (link) {
        await copyToClipboard(link, 'Playbook Viewer link copied');
      }
    });

    collabButton?.addEventListener('click', async () => {
      const link = await getLink('coach');
      if (link) {
        await copyToClipboard(link, 'Playbook Collaborator link copied');
      }
    });
  }

  function openHistoryModal(versions: { id: string; createdAt: number; play: Play }[]) {
    if (document.querySelector('.auth-modal')) {
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal';
    overlay.innerHTML = `
      <div class="auth-modal-card history-modal-card history-modal" role="dialog" aria-modal="true" aria-label="Play history">
        <div class="auth-modal-header">
          <div>
            <p class="auth-modal-title">Play history</p>
            <p class="auth-modal-subtitle">Restore a previous save.</p>
          </div>
          <button type="button" class="icon-button" data-history-close aria-label="Close">
            <span data-lucide="x" aria-hidden="true"></span>
          </button>
        </div>
        <div class="history-body">
          <div class="history-list" data-history-list></div>
          <div class="history-preview" data-history-preview>
            <p class="auth-modal-subtitle" data-history-meta>Select a version to restore.</p>
            <div class="history-preview-canvas">
              <canvas data-history-canvas></canvas>
            </div>
            <button type="button" class="secondary" data-history-restore disabled>Restore version</button>
          </div>
        </div>
      </div>
    `;
    document.body.append(overlay);
    renderIcons(overlay);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    const closeButton = overlay.querySelector('[data-history-close]') as HTMLButtonElement | null;
    closeButton?.addEventListener('click', close);

    const listEl = overlay.querySelector('[data-history-list]') as HTMLElement | null;
    const previewMeta = overlay.querySelector('[data-history-meta]') as HTMLElement | null;
    const previewCanvas = overlay.querySelector('[data-history-canvas]') as HTMLCanvasElement | null;
    const restoreButton = overlay.querySelector('[data-history-restore]') as HTMLButtonElement | null;

    if (!listEl || !previewMeta || !previewCanvas || !restoreButton) {
      return;
    }

    let selectedVersion: { id: string; createdAt: number; play: Play } | null = null;
    const previewRenderer = createRenderer(previewCanvas);

    const renderPreview = (previewPlay: Play) => {
      previewRenderer.resize();
      const startTime = getPlaybackStartTimeForPlay(previewPlay);
      const ballState = getBallState(previewPlay, startTime, DEFAULT_BALL_SPEED_YPS);
      previewRenderer.render({
        play: previewPlay,
        playTime: startTime,
        selectedPlayerId: null,
        ball: ballState,
        showWaypointMarkers: false
      });
    };

    versions.forEach((version) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      button.textContent = formatTimestamp(version.createdAt);
      button.addEventListener('click', () => {
        selectedVersion = version;
        listEl.querySelectorAll('.history-item').forEach((item) => {
          item.classList.toggle('is-active', item === button);
        });
        previewMeta.textContent = `Saved ${formatTimestamp(version.createdAt)}`;
        restoreButton.disabled = false;
        renderPreview(version.play);
      });
      listEl.append(button);
    });

    restoreButton.addEventListener('click', async () => {
      if (!selectedVersion) {
        return;
      }
      play = clonePlay(selectedVersion.play);
      resetPlayback();
      await updateSelectedPlay(getCurrentPlayName());
      updateSelectedPanel();
      render();
      close();
    });
  }

  function closeAllContextMenus(except?: HTMLElement) {
    contextMenuClosers.forEach((close) => close(except));
  }

  function setupContextMenu(toggle: HTMLButtonElement, menu: HTMLElement) {
    const close = () => {
      menu.classList.add('is-hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const closeIfNot = (except?: HTMLElement) => {
      if (except && menu === except) {
        return;
      }
      close();
    };

    contextMenuClosers.push(closeIfNot);

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isHidden = menu.classList.contains('is-hidden');
      closeAllContextMenus(menu);
      if (isHidden) {
        menu.classList.remove('is-hidden');
        toggle.setAttribute('aria-expanded', 'true');
      } else {
        close();
      }
    });

    document.addEventListener('click', (event) => {
      if (menu.classList.contains('is-hidden')) {
        return;
      }
      const target = event.target as Node;
      if (menu.contains(target) || toggle.contains(target)) {
        return;
      }
      close();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        close();
      }
    });

    return close;
  }

  async function handleSession(
    session: { user: { id: string; email?: string | null; user_metadata?: { avatar_url?: string | null } } } | null
  ) {
    currentUserId = session?.user.id ?? null;
    const avatar =
      session?.user.user_metadata?.avatar_url ??
      session?.user.user_metadata?.picture ??
      null;
    setAuthUI(!!session, session?.user.email, avatar);
    updateSharedPlayUI();
    updateSharedPlaybookUI();
    if (!session) {
      playbooks = [];
      selectedPlaybookId = null;
      savedPlays = [];
      selectedSavedPlayId = null;
    currentRole = null;
    syncEditorMode();
    renderPlaybookSelect();
    renderSavedPlaysSelect();
    updateSelectedPanel();
    return;
  }
    renderPlaybookSelect();
    renderSavedPlaysSelect();
    if (sharedPlaybookToken && !sharedPlaybookAccepted) {
      await acceptPlaybookShare(sharedPlaybookToken);
      return;
    }
    if (playbookLoadPromise && lastSessionUserId === currentUserId) {
      await playbookLoadPromise;
      return;
    }
    lastSessionUserId = currentUserId;
    playbookLoadPromise = loadPlaybooks();
    try {
      await playbookLoadPromise;
    } finally {
      playbookLoadPromise = null;
    }
  }

  helpTrigger.addEventListener('click', openHelpModal);

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = button.dataset.mode === 'game' ? 'game' : 'design';
      setPlayMode(nextMode);
    });
  });

  playbookRolePill.addEventListener('click', () => {
    if (playbookRolePill.classList.contains('is-hidden')) {
      return;
    }
    playbookRolePill.classList.add('is-open');
    if (rolePillTimeout) {
      window.clearTimeout(rolePillTimeout);
    }
    rolePillTimeout = window.setTimeout(() => {
      playbookRolePill.classList.remove('is-open');
    }, 1600);
  });
  authTrigger.addEventListener('click', openAuthModal);

  authAvatar.addEventListener('click', (event) => {
    event.stopPropagation();
    authMenu.classList.toggle('is-hidden');
  });

  document.addEventListener('click', (event) => {
    if (authMenu.classList.contains('is-hidden')) {
      return;
    }
    if (authMenu.contains(event.target as Node) || authAvatar.contains(event.target as Node)) {
      return;
    }
    closeAuthMenu();
  });

  authSignOut.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error', error);
      setStatus('Unable to sign out');
    }
  });

  sharedPlayAction.addEventListener('click', async () => {
    if (!currentUserId) {
      openAuthModal();
      return;
    }
    const name = sharedPlayName ?? getCurrentPlayName();
    const result = await openSharedSaveModal(name);
    if (!result) {
      return;
    }
    selectedPlaybookId = result.playbookId;
    const current = playbooks.find((item) => item.id === selectedPlaybookId);
    currentRole = current?.role ?? null;
    renderPlaybookSelect();
    await loadPlaysForPlaybook(selectedPlaybookId);
    await savePlayAsNew(result.name);
    clearShareParam('share');
    sharedPlayActive = false;
    sharedPlayToken = null;
    syncEditorMode();
    updateSharedPlayUI();
  });

  sharedPlaybookAction.addEventListener('click', async () => {
    if (!currentUserId) {
      openAuthModal();
      return;
    }
    if (sharedPlaybookToken && !sharedPlaybookAccepted) {
      await acceptPlaybookShare(sharedPlaybookToken);
    }
  });

  playbookSelect.addEventListener('change', async () => {
    const value = playbookSelect.value;

    if (value === NEW_PLAYBOOK_VALUE) {
      playbookSelect.value = selectedPlaybookId ?? '';
      if (!currentUserId) {
        return;
      }
      const name = await openNameModal({
        title: 'New playbook',
        subtitle: 'Create a fresh playbook to organize plays.',
        label: 'Playbook name',
        placeholder: 'My playbook',
        submitLabel: 'Create playbook',
        defaultName: 'My playbook'
      });
      if (!name) {
        return;
      }
      const { data, error } = await supabase
        .from('playbooks')
        .insert({ name, owner_id: currentUserId })
        .select('id, name')
        .single();
      if (error || !data) {
        console.error('Failed to create playbook', error);
        setStatus('Unable to create playbook');
        return;
      }
      const entry: Playbook = { id: data.id, name: data.name, role: 'coach', isOwner: true };
      playbooks = [entry, ...playbooks];
      selectedPlaybookId = entry.id;
      currentRole = entry.role;
      syncEditorMode();
      renderPlaybookSelect();
      await loadPlaysForPlaybook(entry.id);
      return;
    }

    selectedPlaybookId = value || null;
    selectedSavedPlayId = null;
    savedPlays = [];
    renderSavedPlaysSelect();
    if (!selectedPlaybookId) {
      currentRole = null;
      syncEditorMode();
      return;
    }
    const current = playbooks.find((item) => item.id === selectedPlaybookId);
    currentRole = current?.role ?? null;
    syncEditorMode();
    updateSelectedPanel();
    await loadPlaysForPlaybook(selectedPlaybookId);
  });

  sharePlaybookButton.addEventListener('click', () => {
    closePlaybookMenu();
    openPlaybookShareModal(createPlaybookShareLink);
  });

  renamePlaybookButton.addEventListener('click', async () => {
    closePlaybookMenu();
    if (!selectedPlaybookId || currentRole !== 'coach') {
      return;
    }
    const entry = playbooks.find((item) => item.id === selectedPlaybookId);
    if (!entry) {
      return;
    }
    const name = await openNameModal({
      title: 'Rename playbook',
      subtitle: '',
      label: 'Playbook name',
      placeholder: 'My playbook',
      submitLabel: 'Rename playbook',
      defaultName: entry.name
    });
    if (!name || name === entry.name) {
      return;
    }
    const { data, error } = await supabase
      .from('playbooks')
      .update({ name })
      .eq('id', entry.id)
      .select('id, name')
      .single();
    if (error || !data) {
      console.error('Failed to rename playbook', error);
      setStatus('Unable to rename playbook');
      return;
    }
    playbooks = playbooks.map((item) =>
      item.id === entry.id ? { ...item, name: data.name } : item
    );
    renderPlaybookSelect();
    setStatus(`Renamed to ${data.name}`);
  });

  deletePlaybookButton.addEventListener('click', async () => {
    closePlaybookMenu();
    if (!selectedPlaybookId) {
      return;
    }
    const entry = playbooks.find((item) => item.id === selectedPlaybookId);
    if (!entry) {
      return;
    }
    const isOwner = entry.isOwner;
    const confirmed = await openConfirmModal({
      title: isOwner ? 'Delete playbook' : 'Remove playbook',
      subtitle: isOwner
        ? `This will permanently delete "${entry.name}" for everyone.`
        : `Remove "${entry.name}" from your playbooks?`,
      confirmLabel: isOwner ? 'Delete playbook' : 'Remove playbook'
    });
    if (!confirmed) {
      return;
    }
    if (entry.isOwner) {
      const { error } = await supabase.from('playbooks').delete().eq('id', entry.id);
      if (error) {
        console.error('Failed to delete playbook', error);
        setStatus('Unable to delete playbook');
        return;
      }
      playbooks = playbooks.filter((item) => item.id !== entry.id);
    } else {
      const { error } = await supabase
        .from('playbook_members')
        .delete()
        .eq('playbook_id', entry.id)
        .eq('user_id', currentUserId);
      if (error) {
        console.error('Failed to leave playbook', error);
        setStatus('Unable to leave playbook');
        return;
      }
      playbooks = playbooks.filter((item) => item.id !== entry.id);
    }
    selectedPlaybookId = playbooks[0]?.id ?? null;
    selectedSavedPlayId = null;
    savedPlays = [];
    if (selectedPlaybookId) {
      const current = playbooks.find((item) => item.id === selectedPlaybookId);
      currentRole = current?.role ?? null;
      syncEditorMode();
      renderPlaybookSelect();
      await loadPlaysForPlaybook(selectedPlaybookId);
    } else {
      currentRole = null;
      syncEditorMode();
      renderPlaybookSelect();
      renderSavedPlaysSelect();
    }
    setStatus(`Deleted ${entry.name}`);
  });

  playHistoryButton.addEventListener('click', async () => {
    closePlayMenu();
    if (!selectedSavedPlayId) {
      return;
    }
    const { data, error } = await supabase
      .from('play_versions')
      .select('id, data, created_at')
      .eq('play_id', selectedSavedPlayId)
      .order('created_at', { ascending: false });
    if (error || !data) {
      console.error('Failed to load play history', error);
      setStatus('Unable to load play history');
      return;
    }
    if (data.length === 0) {
      setStatus('No history yet');
      return;
    }
    const versions = data.map((row) => ({
      id: row.id,
      play: row.data as Play,
      createdAt: new Date(row.created_at).getTime()
    }));
    openHistoryModal(versions);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    handleSession(session);
  });

  supabase.auth.getSession().then(({ data }) => {
    handleSession(data.session);
  });

  setActiveTeam(activeTeam);
  updateHistoryUI();
  updateSelectedPanel();
  updateTimelineUI();
  setPlayToggleState(isPlaying ? 'pause' : 'play');
  controlsPanel.addEventListener('toggle', syncControlsCollapse);
  window.addEventListener('resize', syncControlsCollapse);
  collapsePanelsForMobile();
  syncControlsCollapse();
  renderSavedPlaysSelect();
  renderPlaybookSelect();
  updateSharedPlayUI();
  updateSharedPlaybookUI();
  updateModeUI();
  syncEditorMode();
  syncFullscreenUI();
  if (sharedPlayToken) {
    loadSharedPlayByToken(sharedPlayToken);
  }
  render();
  try {
    if (!localStorage.getItem(HELP_SEEN_KEY)) {
      window.setTimeout(() => openHelpModal(), 400);
    }
  } catch {
    // ignore persistence errors
  }
}

function getNextLabel(team: Team, players: Player[]): string {
  const prefix = team === 'offense' ? 'O' : 'D';
  const count = players.filter((player) => player.team === team).length + 1;
  return `${prefix}${count}`;
}

function parseSpeed(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseDelay(value: string, fallback: number, minValue = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return fallback;
  }
  return parsed;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function clampRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function formatTimestamp(value: number): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return `${value}`;
  }
}

function buildShareUrl(token: string, param: 'share' | 'playbook'): string {
  const url = new URL(window.location.href);
  url.searchParams.set(param, token);
  return url.toString();
}

function loadShareTokens(): { playToken: string | null; playbookToken: string | null } {
  const params = new URLSearchParams(window.location.search);
  return {
    playToken: params.get('share'),
    playbookToken: params.get('playbook')
  };
}

function clearShareParam(param: 'share' | 'playbook') {
  const url = new URL(window.location.href);
  url.searchParams.delete(param);
  window.history.replaceState({}, '', url.toString());
}

function generateShareToken(size = 16): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `player-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function clonePlay(play: Play): Play {
  const cloned = deserializePlay(serializePlay(play));
  if (!cloned) {
    throw new Error('Unable to clone play state.');
  }
  return cloned;
}
