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
const SETTINGS_KEY = 'playmaker.settings.v1';

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

type Settings = {
  showWaypointMarkers: boolean;
};

type Playbook = {
  id: string;
  name: string;
  role: 'coach' | 'player';
};

type RemotePlay = {
  id: string;
  name: string;
  play: Play;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export function initApp() {
  const NEW_PLAYBOOK_VALUE = '__new__';
  const canvas = document.getElementById('field-canvas') as HTMLCanvasElement | null;
  const statusText = document.getElementById('status-text');
  const scrubber = document.getElementById('scrubber') as HTMLInputElement | null;
  const playToggle = document.getElementById('play-toggle') as HTMLButtonElement | null;
  const deletePlayerButton = document.getElementById('delete-player') as HTMLButtonElement | null;
  const deselectPlayerButton = document.getElementById('deselect-player') as HTMLButtonElement | null;
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
  const authTrigger = document.getElementById('auth-trigger') as HTMLButtonElement | null;
  const authAvatar = document.getElementById('auth-avatar') as HTMLButtonElement | null;
  const authAvatarImg = document.getElementById('auth-avatar-img') as HTMLImageElement | null;
  const authAvatarFallback = document.getElementById('auth-avatar-fallback');
  const authMenu = document.getElementById('auth-menu');
  const authUserEmail = document.getElementById('auth-user-email');
  const authSignOut = document.getElementById('auth-signout') as HTMLButtonElement | null;
  const playbookSelect = document.getElementById('playbook-select') as HTMLSelectElement | null;
  const playbookMenuToggle = document.getElementById('playbook-menu-toggle') as HTMLButtonElement | null;
  const playbookMenu = document.getElementById('playbook-menu');
  const renamePlaybookButton = document.getElementById('rename-playbook') as HTMLButtonElement | null;
  const deletePlaybookButton = document.getElementById('delete-playbook') as HTMLButtonElement | null;
  const showWaypointsToggle = document.getElementById('show-waypoints-toggle') as
    | HTMLInputElement
    | null;
  const savedPlaysSelect = document.getElementById('saved-plays-select') as HTMLSelectElement | null;
  const playMenuToggle = document.getElementById('play-menu-toggle') as HTMLButtonElement | null;
  const playMenu = document.getElementById('play-menu');
  const renamePlayButton = document.getElementById('rename-play') as HTMLButtonElement | null;
  const deletePlayButton = document.getElementById('delete-play') as HTMLButtonElement | null;
  const controlsPanel = document.querySelector<HTMLDetailsElement>('details[data-panel="controls"]');
  const panelWrapper = document.querySelector<HTMLElement>('section.panel');
  const fieldOverlay = document.getElementById('field-overlay');
  const playerSelect = document.getElementById('selected-player-select') as HTMLSelectElement | null;
  const playerMenuToggle = document.getElementById('player-menu-toggle') as HTMLButtonElement | null;
  const playerMenu = document.getElementById('player-menu');
  const renamePlayerButton = document.getElementById('rename-player') as HTMLButtonElement | null;
  const playerActions = document.getElementById('player-actions');
  const waypointSection = document.querySelector<HTMLElement>('.waypoint-section');
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
    !playToggle ||
    !deletePlayerButton ||
    !deselectPlayerButton ||
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
    !authTrigger ||
    !authAvatar ||
    !authAvatarImg ||
    !authAvatarFallback ||
    !authMenu ||
    !authUserEmail ||
    !authSignOut ||
    !playbookSelect ||
    !playbookMenuToggle ||
    !playbookMenu ||
    !renamePlaybookButton ||
    !deletePlaybookButton ||
    !savedPlaysSelect ||
    !playMenuToggle ||
    !playMenu ||
    !renamePlayButton ||
    !deletePlayButton ||
    !showWaypointsToggle ||
    !playerSelect ||
    !playerMenuToggle ||
    !playerMenu ||
    !renamePlayerButton ||
    !playerActions ||
    !waypointSection ||
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
  const sharedPlay = loadSharedPlay();
  const savedPlay = loadDraftPlay();
  let settings = loadSettings();

  let play = sharedPlay ?? savedPlay ?? createEmptyPlay();
  let savedPlays: RemotePlay[] = [];
  let selectedSavedPlayId: string | null = null;
  let playbooks: Playbook[] = [];
  let selectedPlaybookId: string | null = null;
  let currentRole: Playbook['role'] | null = null;
  let currentNotes = '';
  let currentTags: string[] = [];
  let currentUserId: string | null = null;
  let currentAvatarUrl: string | null = null;
  let lastAuthEmail = '';
  let lastSessionUserId: string | null = null;
  let playbookLoadPromise: Promise<void> | null = null;
  let canEdit = true;
  let selectedPlayerId: string | null = null;
  let activeTeam: Team = 'offense';
  let playTime = 0;
  let isPlaying = false;
  let lastTimestamp = 0;
  let scrubberTouched = false;
  let dragState: DragState | null = null;
  let zoneDragState: ZoneDragState | null = null;
  let playerDragState: PlayerDragState | null = null;
  let historyPast: Play[] = [];
  let historyFuture: Play[] = [];

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
  if (sharedPlay) {
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
  }

  function loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
      return { showWaypointMarkers: false };
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      showWaypointMarkers: parsed.showWaypointMarkers !== false
    };
  } catch {
    return { showWaypointMarkers: false };
  }
  }

  function saveSettings(next: Settings) {
    settings = next;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore persistence errors.
    }
  }

  function setStatus(message: string) {
    statusText.textContent = message;
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
      deselectPlayerButton.disabled = true;
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
    deselectPlayerButton.disabled = false;
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

  function promptForPlayName(defaultName: string): string | null {
    const response = window.prompt('Play name', defaultName);
    if (response === null) {
      return null;
    }
    const name = response.trim();
    return name ? name : 'Untitled play';
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

  function setEditorMode(allowEdit: boolean) {
    const disable = !allowEdit;
    canEdit = allowEdit;
    newPlayButton.disabled = disable;
    flipPlayButton.disabled = disable;
    savePlayButton.disabled = disable;
    saveMenuToggle.disabled = disable;
    playMenuToggle.disabled = disable || !selectedSavedPlayId;
    renamePlayButton.disabled = disable || !selectedSavedPlayId;
    deletePlayButton.disabled = disable || !selectedSavedPlayId;
    playbookMenuToggle.disabled = disable || !selectedPlaybookId || currentRole !== 'coach';
    renamePlaybookButton.disabled = disable || !selectedPlaybookId || currentRole !== 'coach';
    deletePlaybookButton.disabled = disable || !selectedPlaybookId || currentRole !== 'coach';
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
      playbookMap.set(row.id, { id: row.id, name: row.name, role: 'coach' });
    });

    (membersResult.data ?? []).forEach((row) => {
      const entry = row.playbooks as { id: string; name: string } | null;
      if (!entry) {
        return;
      }
      playbookMap.set(entry.id, {
        id: entry.id,
        name: entry.name,
        role: row.role as Playbook['role']
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
      setEditorMode(currentRole === 'coach');
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
      return { id: existing.id, name: existing.name, role: 'coach' };
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
    return { id: data.id, name: data.name, role: 'coach' };
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
    const canManagePlaybook = currentRole === 'coach' && !!selectedPlaybookId;
    playbookMenuToggle.disabled = !canManagePlaybook;
    renamePlaybookButton.disabled = !canManagePlaybook;
    deletePlaybookButton.disabled = !canManagePlaybook;
  }

  async function loadPlaysForPlaybook(playbookId: string) {
    const { data, error } = await supabase
      .from('plays')
      .select('id, name, data, notes, tags, created_at, updated_at')
      .eq('playbook_id', playbookId)
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
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime()
    }));
    selectedSavedPlayId = null;
    currentNotes = '';
    currentTags = [];
    renderSavedPlaysSelect();
  }

  function renderSavedPlaysSelect() {
    savedPlaysSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    if (!currentUserId) {
      placeholder.textContent = 'Sign in to load plays';
    } else if (!selectedPlaybookId) {
      placeholder.textContent = 'Select a playbook';
    } else {
      placeholder.textContent = 'New play';
    }
    savedPlaysSelect.append(placeholder);

    const sorted = [...savedPlays].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const entry of sorted) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      savedPlaysSelect.append(option);
    }

    const canManage = currentRole === 'coach' && !!selectedSavedPlayId;
    if (selectedSavedPlayId && savedPlays.some((entry) => entry.id === selectedSavedPlayId)) {
      savedPlaysSelect.value = selectedSavedPlayId;
    } else {
      savedPlaysSelect.value = '';
    }
    playMenuToggle.disabled = !canManage;
    renamePlayButton.disabled = !canManage;
    deletePlayButton.disabled = !canManage;

    updateSaveButtonLabel();
    savedPlaysSelect.disabled = !currentUserId || !selectedPlaybookId;
  }

  function updateSavedPlaysStorage() {
    renderSavedPlaysSelect();
  }

  function updateSaveButtonLabel() {
    savePlayButton.textContent = selectedSavedPlayId ? 'Update' : 'Save';
    savePlayButton.disabled = currentRole !== 'coach';
    saveMenuToggle.disabled = currentRole !== 'coach';
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
      setStatus('Sign in to save plays.');
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
      .select('id, name, data, notes, tags, created_at, updated_at')
      .single();
    if (error || !data) {
      console.error('Failed to save play', error);
      setStatus('Unable to save play.');
      return;
    }
    const entry: RemotePlay = {
      id: data.id,
      name: data.name,
      play: data.data as Play,
      notes: data.notes ?? '',
      tags: data.tags ?? [],
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime()
    };
    savedPlays = [entry, ...savedPlays];
    selectedSavedPlayId = entry.id;
    updateSavedPlaysStorage();
    setStatus('Saved new play.');
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
      .select('id, name, data, notes, tags, created_at, updated_at')
      .single();
    if (error || !data) {
      console.error('Failed to update play', error);
      setStatus('Unable to update play.');
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
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime()
          }
        : entry
    );
    updateSavedPlaysStorage();
    setStatus('Play updated.');
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
    const offense = play.players.filter((player) => player.team === 'offense');
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
    setStatus(`Added ${label}.`);
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
    setStatus(`Added waypoint for ${player.label}.`);
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
        setStatus('Add player mode.');
      } else {
        selectPlayer(playerDragState.playerId);
        setStatus('Player selected. Tap to add waypoints.');
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
    stopPlayback();
    setPlayTime(getPlaybackStartTime());
    scrubberTouched = false;
    setStatus('Playback reset.');
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
      setStatus('Player removed.');
    });
  });

  renamePlayerButton.addEventListener('click', () => {
    closePlayerMenu();
    const player = getSelectedPlayer();
    if (!player || !canEdit) {
      return;
    }
    const name = promptForPlayName(player.label);
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
    setStatus(`Renamed to ${name}.`);
  });

  deselectPlayerButton.addEventListener('click', () => {
    selectPlayer(null);
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

  async function copyShareLink() {
    const url = buildShareUrl(play);
    if (!url) {
      return;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setStatus('Share link copied.');
        return;
      } catch {
        // fall back to prompt below
      }
    }
    window.prompt('Copy share link', url);
  }

  savePlayButton.addEventListener('click', async () => {
    if (selectedSavedPlayId) {
      const entry = savedPlays.find((item) => item.id === selectedSavedPlayId);
      if (entry) {
        await updateSelectedPlay(entry.name);
        return;
      }
    }
    const name = promptForPlayName(getCurrentPlayName());
    if (!name) {
      return;
    }
    await updateSelectedPlay(name);
  });

  newPlayButton.addEventListener('click', () => {
    resetPlayState();
    selectedSavedPlayId = null;
    renderSavedPlaysSelect();
    scrubberTouched = false;
    setStatus('Started a new play.');
  });

  flipPlayButton.addEventListener('click', () => {
    applyMutation(() => {
      flipPlay();
    });
    setStatus('Flipped play.');
  });

  saveAsNewButton.addEventListener('click', async () => {
    const name = promptForPlayName(getCurrentPlayName());
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
    const name = promptForPlayName(entry.name);
    if (!name || name === entry.name) {
      return;
    }
    const { data, error } = await supabase
      .from('plays')
      .update({ name })
      .eq('id', entry.id)
      .select('id, name, data, notes, tags, created_at, updated_at')
      .single();
    if (error || !data) {
      console.error('Failed to rename play', error);
      setStatus('Unable to rename play.');
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
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime()
          }
        : item
    );
    updateSavedPlaysStorage();
    setStatus(`Renamed to ${name}.`);
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
      setStatus('Unable to delete play.');
      return;
    }
    savedPlays = savedPlays.filter((item) => item.id !== selectedSavedPlayId);
    selectedSavedPlayId = null;
    updateSavedPlaysStorage();
    persist();
    setStatus(`Deleted ${entry.name}.`);
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
    if (!value) {
      selectedSavedPlayId = null;
      renamePlayButton.disabled = true;
      deletePlayButton.disabled = true;
      currentNotes = '';
      currentTags = [];
      updateSaveButtonLabel();
      return;
    }
    selectedSavedPlayId = value;
    const selectedEntry = savedPlays.find((entry) => entry.id === value);
    if (selectedEntry) {
      renamePlayButton.disabled = false;
      deletePlayButton.disabled = false;
      play = clonePlay(selectedEntry.play);
      currentNotes = selectedEntry.notes ?? '';
      currentTags = selectedEntry.tags ?? [];
      playTime = 0;
      scrubberTouched = false;
      historyPast = [];
      historyFuture = [];
      updateHistoryUI();
      updateSelectedPanel();
      render();
      persist();
      setStatus(`Loaded ${selectedEntry.name}.`);
    }
    updateSaveButtonLabel();
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
        setStatus('Enter an email to receive a magic link.');
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
        setStatus('Unable to send magic link.');
        return;
      }
      setStatus('Magic link sent. Check your email.');
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
        setStatus('Unable to sign in with Google.');
        return;
      }
      close();
    });
  }

  function openPlaybookModal(options?: {
    title?: string;
    subtitle?: string;
    submitLabel?: string;
    defaultName?: string;
  }): Promise<string | null> {
    if (document.querySelector('.auth-modal')) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const title = options?.title ?? 'New playbook';
      const subtitle = options?.subtitle ?? 'Create a fresh playbook to organize plays.';
      const submitLabel = options?.submitLabel ?? 'Create playbook';
      const defaultName = options?.defaultName ?? '';
      const overlay = document.createElement('div');
      overlay.className = 'auth-modal';
      overlay.innerHTML = `
        <div class="auth-modal-card" role="dialog" aria-modal="true" aria-label="New playbook">
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
              Playbook name
              <input type="text" data-playbook-name placeholder="My playbook" />
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
          setStatus('Enter a playbook name.');
          return;
        }
        close(name);
      });
    });
  }

  function setupContextMenu(toggle: HTMLButtonElement, menu: HTMLElement) {
    const close = () => {
      menu.classList.add('is-hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isHidden = menu.classList.toggle('is-hidden');
      toggle.setAttribute('aria-expanded', String(!isHidden));
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
    if (!session) {
      playbooks = [];
      selectedPlaybookId = null;
      savedPlays = [];
      selectedSavedPlayId = null;
    currentRole = null;
    setEditorMode(true);
    renderPlaybookSelect();
    renderSavedPlaysSelect();
    updateSelectedPanel();
    return;
  }
    renderPlaybookSelect();
    renderSavedPlaysSelect();
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
      setStatus('Unable to sign out.');
    }
  });

  playbookSelect.addEventListener('change', async () => {
    const value = playbookSelect.value;

    if (value === NEW_PLAYBOOK_VALUE) {
      playbookSelect.value = selectedPlaybookId ?? '';
      if (!currentUserId) {
        return;
      }
      const name = await openPlaybookModal({
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
        setStatus('Unable to create playbook.');
        return;
      }
      const entry: Playbook = { id: data.id, name: data.name, role: 'coach' };
      playbooks = [entry, ...playbooks];
      selectedPlaybookId = entry.id;
      currentRole = entry.role;
      setEditorMode(true);
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
      setEditorMode(true);
      return;
    }
    const current = playbooks.find((item) => item.id === selectedPlaybookId);
    currentRole = current?.role ?? null;
    setEditorMode(!currentUserId || currentRole === 'coach');
    updateSelectedPanel();
    await loadPlaysForPlaybook(selectedPlaybookId);
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
    const name = await openPlaybookModal({
      title: 'Rename playbook',
      subtitle: '',
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
      setStatus('Unable to rename playbook.');
      return;
    }
    playbooks = playbooks.map((item) =>
      item.id === entry.id ? { ...item, name: data.name } : item
    );
    renderPlaybookSelect();
    setStatus(`Renamed to ${data.name}.`);
  });

  deletePlaybookButton.addEventListener('click', async () => {
    closePlaybookMenu();
    if (!selectedPlaybookId || currentRole !== 'coach') {
      return;
    }
    const entry = playbooks.find((item) => item.id === selectedPlaybookId);
    if (!entry) {
      return;
    }
    const { error } = await supabase.from('playbooks').delete().eq('id', entry.id);
    if (error) {
      console.error('Failed to delete playbook', error);
      setStatus('Unable to delete playbook.');
      return;
    }
    playbooks = playbooks.filter((item) => item.id !== entry.id);
    selectedPlaybookId = playbooks[0]?.id ?? null;
    selectedSavedPlayId = null;
    savedPlays = [];
    if (selectedPlaybookId) {
      const current = playbooks.find((item) => item.id === selectedPlaybookId);
      currentRole = current?.role ?? null;
      setEditorMode(!currentUserId || currentRole === 'coach');
      renderPlaybookSelect();
      await loadPlaysForPlaybook(selectedPlaybookId);
    } else {
      currentRole = null;
      setEditorMode(true);
      renderPlaybookSelect();
      renderSavedPlaysSelect();
    }
    setStatus(`Deleted ${entry.name}.`);
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
  showWaypointsToggle.checked = settings.showWaypointMarkers;
  showWaypointsToggle.addEventListener('change', () => {
    saveSettings({ ...settings, showWaypointMarkers: showWaypointsToggle.checked });
    render();
  });
  renderSavedPlaysSelect();
  renderPlaybookSelect();
  render();
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

function buildShareUrl(play: Play): string | null {
  try {
    const raw = serializePlay(play);
    const encoded = encodeBase64Url(raw);
    const url = new URL(window.location.href);
    url.searchParams.set('play', encoded);
    return url.toString();
  } catch {
    return null;
  }
}

function loadSharedPlay(): Play | null {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('play');
  if (!encoded) {
    return null;
  }
  try {
    const decoded = decodeBase64Url(encoded);
    return deserializePlay(decoded);
  } catch {
    return null;
  }
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
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
