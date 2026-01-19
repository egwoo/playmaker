import {
  FIELD_LENGTH_YARDS,
  FIELD_WIDTH_YARDS,
  createEmptyPlay,
  deserializePlay,
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
import { loadDraftPlay, loadSavedPlays, saveDraftPlay, saveSavedPlays, type SavedPlay } from './storage';

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

export function initApp() {
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
  const showWaypointsToggle = document.getElementById('show-waypoints-toggle') as
    | HTMLInputElement
    | null;
  const savedPlaysSelect = document.getElementById('saved-plays-select') as HTMLSelectElement | null;
  const renamePlayButton = document.getElementById('rename-play') as HTMLButtonElement | null;
  const deletePlayButton = document.getElementById('delete-play') as HTMLButtonElement | null;
  const controlsPanel = document.querySelector<HTMLDetailsElement>('details[data-panel="controls"]');
  const panelWrapper = document.querySelector<HTMLElement>('section.panel');
  const fieldOverlay = document.getElementById('field-overlay');
  const playerSelect = document.getElementById('selected-player-select') as HTMLSelectElement | null;
  const playerActions = document.getElementById('player-actions');
  const waypointSection = document.querySelector<HTMLElement>('.waypoint-section');
  const waypointList = document.getElementById('waypoint-list');
  const playerNameField = document.querySelector<HTMLElement>('.player-name');
  const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement | null;
  const startActionField = document.querySelector<HTMLElement>('.start-action');
  const startActionSelect = document.getElementById('start-action-select') as HTMLSelectElement | null;
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
    !savedPlaysSelect ||
    !renamePlayButton ||
    !deletePlayButton ||
    !showWaypointsToggle ||
    !playerSelect ||
    !playerActions ||
    !waypointSection ||
    !waypointList ||
    !playerNameField ||
    !playerNameInput ||
    !startActionField ||
    !startActionSelect ||
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
  let savedPlays: SavedPlay[] = loadSavedPlays();
  let selectedSavedPlayId: string | null = null;
  let settings = loadSettings();

  let play = sharedPlay ?? savedPlay ?? createEmptyPlay();
  let selectedPlayerId: string | null = null;
  let activeTeam: Team = 'offense';
  let playTime = 0;
  let isPlaying = false;
  let lastTimestamp = 0;
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
        return { showWaypointMarkers: true };
      }
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return {
        showWaypointMarkers: parsed.showWaypointMarkers !== false
      };
    } catch {
      return { showWaypointMarkers: true };
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
      waypointList.replaceChildren();
      const emptyRow = document.createElement('div');
      emptyRow.className = 'waypoint-empty';
      emptyRow.textContent = 'No player selected.';
      waypointList.append(emptyRow);
      setSectionHidden(playerActions, true);
      setSectionHidden(waypointSection, true);
      setSectionHidden(playerNameField, true);
      playerNameInput.disabled = true;
      startActionSelect.replaceChildren();
      startActionSelect.disabled = true;
      setSectionHidden(startActionField, true);
      setSectionHidden(coveragePanel, true);
      return;
    }

    if (player.team === 'defense') {
      ensureDefenseAssignment(player);
    }

    deletePlayerButton.disabled = false;
    deselectPlayerButton.disabled = false;
    setSectionHidden(playerActions, false);
    setSectionHidden(playerNameField, player.team === 'defense');
    playerNameInput.disabled = player.team === 'defense';
    if (player.team === 'offense') {
      playerNameInput.value = player.label;
    } else {
      playerNameInput.value = '';
    }
    setSectionHidden(startActionField, player.team !== 'offense');
    setSectionHidden(waypointSection, player.team === 'defense');
    if (player.team === 'offense') {
      renderStartAction(player);
      renderWaypointList(player);
    } else {
      startActionSelect.replaceChildren();
      startActionSelect.disabled = true;
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

  function renderSavedPlaysSelect() {
    savedPlaysSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'New play';
    savedPlaysSelect.append(placeholder);

    const sorted = [...savedPlays].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const entry of sorted) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      savedPlaysSelect.append(option);
    }

    if (selectedSavedPlayId && savedPlays.some((entry) => entry.id === selectedSavedPlayId)) {
      savedPlaysSelect.value = selectedSavedPlayId;
      renamePlayButton.disabled = false;
      deletePlayButton.disabled = false;
    } else {
      savedPlaysSelect.value = '';
      renamePlayButton.disabled = true;
      deletePlayButton.disabled = true;
    }

    savedPlaysSelect.disabled = false;
  }

  function updateSavedPlaysStorage() {
    saveSavedPlays(savedPlays);
    renderSavedPlaysSelect();
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
    updateHistoryUI();
    updateSelectedPanel();
    updateTimelineUI();
    render();
    persist();
  }

  function savePlayAsNew(name: string) {
    const now = Date.now();
    const entry: SavedPlay = {
      id: createId(),
      name,
      play: clonePlay(play),
      createdAt: now,
      updatedAt: now
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

  function updateSelectedPlay(name: string) {
    if (!selectedSavedPlayId) {
      savePlayAsNew(name);
      return;
    }
    let updated = false;
    savedPlays = savedPlays.map((entry) => {
      if (entry.id !== selectedSavedPlayId) {
        return entry;
      }
      updated = true;
      return {
        ...entry,
        name,
        play: clonePlay(play),
        updatedAt: Date.now()
      };
    });
    if (!updated) {
      savePlayAsNew(name);
      return;
    }
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

  function renderStartAction(player: Player) {
    if (player.team !== 'offense') {
      startActionSelect.replaceChildren();
      startActionSelect.disabled = true;
      return;
    }
    startActionSelect.replaceChildren();
    const candidates = play.players.filter(
      (candidate) => candidate.team === 'offense' && candidate.id !== player.id
    );

    if (candidates.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'Add an offensive player to pass/hand off to';
      emptyOption.disabled = true;
      emptyOption.selected = true;
      startActionSelect.append(emptyOption);
      startActionSelect.disabled = true;
      return;
    }

    const actionNone = document.createElement('option');
    actionNone.value = '';
    actionNone.textContent = 'None';
    startActionSelect.append(actionNone);

    for (const candidate of candidates) {
      const handoffOption = document.createElement('option');
      handoffOption.value = `handoff:${candidate.id}`;
      handoffOption.textContent = `Handoff → ${candidate.label}`;
      startActionSelect.append(handoffOption);

      const passOption = document.createElement('option');
      passOption.value = `pass:${candidate.id}`;
      passOption.textContent = `Pass → ${candidate.label}`;
      startActionSelect.append(passOption);
    }

    if (player.startAction && candidates.some((candidate) => candidate.id === player.startAction?.targetId)) {
      startActionSelect.value = `${player.startAction.type}:${player.startAction.targetId}`;
    } else {
      startActionSelect.value = '';
    }

    startActionSelect.disabled = false;
  }

  function renderCoverageControls(player: Player) {
    if (player.team !== 'defense') {
      setSectionHidden(coveragePanel, true);
      return;
    }

    setSectionHidden(coveragePanel, false);
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
        coverageSpeedInput.disabled = false;
      } else {
        coverageTargetSelect.value = candidates[0]?.id ?? '';
        coverageSpeedInput.value = DEFAULT_DEFENSE_SPEED.toString();
        coverageSpeedInput.disabled = false;
      }

      coverageTargetSelect.disabled = currentType !== 'man';
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

    zoneRadiusXInput.disabled = currentType !== 'zone';
    zoneRadiusYInput.disabled = currentType !== 'zone';
    zoneSpeedInput.disabled = currentType !== 'zone';
  }

  function renderWaypointList(player: Player) {
    waypointList.replaceChildren();
    const route = player.route ?? [];

    if (route.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.className = 'waypoint-empty';
      emptyRow.textContent = 'No waypoints yet.';
      waypointList.append(emptyRow);
      return;
    }

    route.forEach((leg, index) => {
      const row = document.createElement('div');
      row.className = 'waypoint-row';

      const label = document.createElement('div');
      label.className = 'waypoint-label';
      label.textContent = `Leg ${index + 1}`;

      const speed = document.createElement('input');
      speed.type = 'number';
      speed.min = '0.1';
      speed.step = '0.1';
      speed.value = leg.speed.toString();
      speed.className = 'waypoint-speed';
      speed.addEventListener('change', () => {
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

      const actionSelect = document.createElement('select');
      actionSelect.className = 'waypoint-action';

      const candidates = play.players.filter(
        (candidate) => candidate.team === 'offense' && candidate.id !== player.id
      );
      if (candidates.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'Add an offensive player to pass/hand off to';
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
          const handoffOption = document.createElement('option');
          handoffOption.value = `handoff:${candidate.id}`;
          handoffOption.textContent = `Handoff → ${candidate.label}`;
          actionSelect.append(handoffOption);

          const passOption = document.createElement('option');
          passOption.value = `pass:${candidate.id}`;
          passOption.textContent = `Pass → ${candidate.label}`;
          actionSelect.append(passOption);
        }

        if (leg.action && candidates.some((candidate) => candidate.id === leg.action?.targetId)) {
          actionSelect.value = `${leg.action.type}:${leg.action.targetId}`;
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
        applyMutation(() => {
          const target = getSelectedPlayer();
          if (!target?.route) {
            return;
          }
          if (!value) {
            target.route[index].action = undefined;
            return;
          }
          const [type, targetId] = value.split(':');
          if (type !== 'pass' && type !== 'handoff') {
            return;
          }
          target.route[index].action = { type, targetId };
        });
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'tertiary icon-button';
      deleteButton.setAttribute('aria-label', 'Remove waypoint');
      deleteButton.title = 'Remove waypoint';
      deleteButton.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path
            d="M8 6l1-2h6l1 2"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <rect
            x="6"
            y="6"
            width="12"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
          />
          <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      `;
      deleteButton.addEventListener('click', () => {
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

      const actionField = document.createElement('label');
      actionField.className = 'waypoint-field waypoint-action-field';
      actionField.textContent = 'Action';
      actionField.append(actionSelect);

      row.append(label, speedField, actionField, deleteButton);
      waypointList.append(row);
    });
  }

  function updateTimelineUI() {
    const duration = getPlaybackDuration();
    scrubber.max = duration.toString();
    playTime = Math.min(playTime, duration);
    scrubber.value = playTime.toString();
    playToggle.disabled = duration <= 0;
  }

  function getPlaybackDuration() {
    return Math.max(getPlayDuration(play), getBallEndTime(play, DEFAULT_BALL_SPEED_YPS));
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
    playTime = Math.max(0, nextTime);
    updateTimelineUI();
    render();
  }

  function stopPlayback() {
    isPlaying = false;
    playToggle.textContent = 'Play';
  }

  function startPlayback() {
    const duration = getPlaybackDuration();
    if (duration <= 0) {
      return;
    }
    if (playTime >= duration) {
      playTime = 0;
    }
    isPlaying = true;
    lastTimestamp = 0;
    playToggle.textContent = 'Pause';
    requestAnimationFrame(tickPlayback);
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

    const duration = getPlaybackDuration();
    playTime = Math.min(playTime + delta, duration);

    if (playTime >= duration) {
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
    const leg: RouteLeg = { to: point, speed };
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

    const zoneAxis = renderer.hitTestZoneHandle(point, play, selectedPlayerId);
    if (zoneAxis) {
      startZoneDrag(event.pointerId, zoneAxis);
      return;
    }

    const selectedForWaypoint = getSelectedPlayer();
    if (selectedForWaypoint?.team === 'offense') {
      const waypointIndex = renderer.hitTestWaypoint(point, selectedPlayerId, play);
      if (waypointIndex !== null) {
        startWaypointDrag(event.pointerId, waypointIndex);
        return;
      }
    }

    const hitId = renderer.hitTest(point, play, playTime);
    if (hitId) {
      startPlayerDrag(event.pointerId, hitId, point);
      return;
    }

    const world = renderer.canvasToWorld(point);
    if (!world) {
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
      setPlayTime(value);
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
    setPlayTime(0);
    setStatus('Playback reset.');
  });

  deletePlayerButton.addEventListener('click', () => {
    const player = getSelectedPlayer();
    if (!player) {
      return;
    }
    applyMutation(() => {
      play.players = play.players.filter((item) => item.id !== player.id);
      selectedPlayerId = null;
      setStatus('Player removed.');
    });
  });

  deselectPlayerButton.addEventListener('click', () => {
    selectPlayer(null);
  });

  startActionSelect.addEventListener('change', () => {
    const value = startActionSelect.value;
    applyMutation(() => {
      const target = getSelectedPlayer();
      if (!target) {
        return;
      }
      if (!value) {
        target.startAction = undefined;
        return;
      }
      const [type, targetId] = value.split(':');
      if (type !== 'pass' && type !== 'handoff') {
        return;
      }
      target.startAction = { type, targetId };
    });
  });

  coverageTypeSelect.addEventListener('change', () => {
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

  savePlayButton.addEventListener('click', () => {
    const name = promptForPlayName(getCurrentPlayName());
    if (!name) {
      return;
    }
    updateSelectedPlay(name);
  });

  newPlayButton.addEventListener('click', () => {
    resetPlayState();
    selectedSavedPlayId = null;
    renderSavedPlaysSelect();
    setStatus('Started a new play.');
  });

  flipPlayButton.addEventListener('click', () => {
    applyMutation(() => {
      flipPlay();
    });
    setStatus('Flipped play.');
  });

  saveAsNewButton.addEventListener('click', () => {
    const name = promptForPlayName(getCurrentPlayName());
    if (!name) {
      return;
    }
    savePlayAsNew(name);
    closeSaveMenu();
  });

  sharePlayButton.addEventListener('click', () => {
    copyShareLink();
    closeSaveMenu();
  });

  renamePlayButton.addEventListener('click', () => {
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
    savedPlays = savedPlays.map((item) =>
      item.id === entry.id ? { ...item, name, updatedAt: Date.now() } : item
    );
    updateSavedPlaysStorage();
    setStatus(`Renamed to ${name}.`);
  });

  deletePlayButton.addEventListener('click', () => {
    if (!selectedSavedPlayId) {
      return;
    }
    const entry = savedPlays.find((item) => item.id === selectedSavedPlayId);
    if (!entry) {
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
      return;
    }
    selectedSavedPlayId = value;
    const selectedEntry = savedPlays.find((entry) => entry.id === value);
    if (selectedEntry) {
      renamePlayButton.disabled = false;
      deletePlayButton.disabled = false;
      play = clonePlay(selectedEntry.play);
      playTime = 0;
      historyPast = [];
      historyFuture = [];
      updateHistoryUI();
      updateSelectedPanel();
      render();
      persist();
      setStatus(`Loaded ${selectedEntry.name}.`);
    }
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

  playerNameInput.addEventListener('change', () => {
    const target = getSelectedPlayer();
    if (!target || target.team !== 'offense') {
      return;
    }
    const nextLabel = playerNameInput.value.trim();
    if (!nextLabel) {
      playerNameInput.value = target.label;
      return;
    }
    if (nextLabel === target.label) {
      return;
    }
    applyMutation(() => {
      const selected = getSelectedPlayer();
      if (!selected || selected.team !== 'offense') {
        return;
      }
      selected.label = nextLabel;
    });
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

  setActiveTeam(activeTeam);
  updateHistoryUI();
  updateSelectedPanel();
  updateTimelineUI();
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

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
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
