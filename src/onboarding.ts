import type { Team } from './model';
import type { PlayMode } from './ui-state';

const ONBOARDING_KEY = 'playmaker.onboarding.v1';

export type TourStepId = 'run' | 'select' | 'waypoint' | 'rerun' | 'save';
export type HintId =
  | 'empty-field'
  | 'defense'
  | 'coverage'
  | 'waypoint-details'
  | 'motion'
  | 'game-mode'
  | 'fullscreen';
export type TipId = TourStepId | HintId;

export type OnboardingEvent =
  | { type: 'playback-started' }
  | { type: 'player-selected'; team: Team | null }
  | { type: 'player-added'; team: Team }
  | { type: 'waypoint-added' }
  | { type: 'play-cleared' }
  | { type: 'team-changed'; team: Team }
  | { type: 'mode-changed'; mode: PlayMode }
  | { type: 'fullscreen-changed'; active: boolean }
  | { type: 'save-clicked' }
  | { type: 'start-delay-focused' };

export interface OnboardingContext {
  selectedTeam: Team | null;
}

export interface OnboardingState {
  tourDone: boolean;
  tipsEnabled: boolean;
  seenHints: HintId[];
  tourStep: number | null;
  activeHint: HintId | null;
}

type StoredOnboarding = Pick<OnboardingState, 'tourDone' | 'tipsEnabled' | 'seenHints'>;

interface TourStep {
  id: TourStepId;
  advancesOn: (event: OnboardingEvent) => boolean;
  // Falls back to the previous step when this step's setup is undone (e.g. the player is deselected).
  requires?: (context: OnboardingContext) => boolean;
  // Skipped when the user already did it ahead of time.
  satisfiedBy?: (context: OnboardingContext) => boolean;
}

interface HintRule {
  showOn: (event: OnboardingEvent) => boolean;
  doneOn?: (event: OnboardingEvent) => boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { id: 'run', advancesOn: (event) => event.type === 'playback-started' },
  {
    id: 'select',
    advancesOn: (event) => event.type === 'player-selected' && event.team === 'offense',
    satisfiedBy: (context) => context.selectedTeam === 'offense'
  },
  {
    id: 'waypoint',
    advancesOn: (event) => event.type === 'waypoint-added',
    requires: (context) => context.selectedTeam === 'offense'
  },
  { id: 'rerun', advancesOn: (event) => event.type === 'playback-started' },
  { id: 'save', advancesOn: (event) => event.type === 'save-clicked' }
];

const HINT_RULES: Record<HintId, HintRule> = {
  'empty-field': {
    showOn: (event) => event.type === 'play-cleared',
    doneOn: (event) => event.type === 'player-added'
  },
  defense: {
    showOn: (event) => event.type === 'team-changed' && event.team === 'defense',
    doneOn: (event) =>
      (event.type === 'player-added' && event.team === 'defense') ||
      (event.type === 'team-changed' && event.team === 'offense')
  },
  coverage: {
    showOn: (event) => event.type === 'player-selected' && event.team === 'defense',
    doneOn: (event) => event.type === 'player-selected' && event.team !== 'defense'
  },
  'waypoint-details': {
    showOn: (event) => event.type === 'waypoint-added',
    doneOn: (event) => event.type === 'player-selected' && event.team !== 'offense'
  },
  motion: {
    showOn: (event) => event.type === 'start-delay-focused',
    doneOn: (event) => event.type === 'player-selected'
  },
  'game-mode': {
    showOn: (event) => event.type === 'mode-changed' && event.mode === 'game',
    doneOn: (event) => event.type === 'mode-changed' && event.mode === 'design'
  },
  fullscreen: {
    showOn: (event) => event.type === 'fullscreen-changed' && event.active,
    doneOn: (event) => event.type === 'fullscreen-changed' && !event.active
  }
};

export const HINT_IDS = Object.keys(HINT_RULES) as HintId[];

export interface TipCopy {
  title: string;
  body: string;
}

export function getTipCopy(id: TipId, playerLabel: string): TipCopy {
  switch (id) {
    case 'run':
      return {
        title: 'Welcome to Playmaker',
        body: 'Here’s a starter play to get you going. Press play to watch it run.'
      };
    case 'select':
      return { title: 'Make it yours', body: `Tap ${playerLabel} to select them and edit their route.` };
    case 'waypoint':
      return {
        title: 'Add a waypoint',
        body: `Tap anywhere on the field and ${playerLabel} will run there next. Drag a waypoint to move it.`
      };
    case 'rerun':
      return { title: 'Run it again', body: 'Press play to see your new route.' };
    case 'save':
      return {
        title: 'Nice work',
        body: 'Save the play to your playbook so you can share it with your team.'
      };
    case 'empty-field':
      return {
        title: 'Blank field',
        body: 'Tap anywhere on the field to place a player. Switch to Defense to place defenders.'
      };
    case 'defense':
      return {
        title: 'Place defenders',
        body: 'Tap the field to add a defender, then tap them to choose man or zone coverage.'
      };
    case 'coverage':
      return {
        title: 'Coverage',
        body: 'Man follows one receiver. Zone guards an area — drag the zone’s edges on the field to resize it.'
      };
    case 'waypoint-details':
      return {
        title: 'Route timing',
        body: 'Each leg has its own speed. Open a waypoint to add a delay or throw a pass or handoff from there.'
      };
    case 'motion':
      return {
        title: 'Pre-snap motion',
        body: 'A negative delay on Waypoint 0 starts this player moving before the snap.'
      };
    case 'game-mode':
      return {
        title: 'Game day',
        body: 'Plays mode locks editing. Tap a play to pull it up and press play to show your team.'
      };
    case 'fullscreen':
      return {
        title: 'Fullscreen',
        body: 'Tap the field to play or pause. Drag left or right to scrub through the play.'
      };
  }
}

export function isTourStep(id: TipId): id is TourStepId {
  return TOUR_STEPS.some((step) => step.id === id);
}

export function createOnboardingState(
  stored: StoredOnboarding | null,
  options: { returningUser: boolean }
): OnboardingState {
  if (stored) {
    return { ...stored, tourStep: null, activeHint: null };
  }
  // People who used Playmaker before tips existed already know the basics.
  return {
    tourDone: options.returningUser,
    tipsEnabled: true,
    seenHints: options.returningUser ? [...HINT_IDS] : [],
    tourStep: null,
    activeHint: null
  };
}

export function getActiveTip(state: OnboardingState): TipId | null {
  if (state.tourStep !== null) {
    return TOUR_STEPS[state.tourStep]?.id ?? null;
  }
  return state.activeHint;
}

export function startTour(state: OnboardingState, context: OnboardingContext): OnboardingState {
  return { ...state, activeHint: null, tourStep: settleTourStep(0, context) };
}

export function endTour(state: OnboardingState): OnboardingState {
  return { ...state, tourDone: true, tourStep: null };
}

export function dismissHint(state: OnboardingState): OnboardingState {
  return { ...state, activeHint: null };
}

export function setTipsEnabled(state: OnboardingState, enabled: boolean): OnboardingState {
  return { ...state, tipsEnabled: enabled, activeHint: enabled ? state.activeHint : null };
}

export function reduceOnboarding(
  state: OnboardingState,
  event: OnboardingEvent,
  context: OnboardingContext
): OnboardingState {
  if (state.tourStep !== null) {
    return advanceTour(state, event, context);
  }

  let activeHint = state.activeHint;
  if (activeHint && HINT_RULES[activeHint].doneOn?.(event)) {
    activeHint = null;
  }
  if (!state.tipsEnabled) {
    return { ...state, activeHint };
  }
  const next = HINT_IDS.find((id) => !state.seenHints.includes(id) && HINT_RULES[id].showOn(event));
  if (!next) {
    return { ...state, activeHint };
  }
  return { ...state, activeHint: next, seenHints: [...state.seenHints, next] };
}

function advanceTour(state: OnboardingState, event: OnboardingEvent, context: OnboardingContext): OnboardingState {
  let step = state.tourStep ?? 0;
  if (TOUR_STEPS[step]?.advancesOn(event)) {
    step += 1;
  }
  step = settleTourStep(step, context);
  if (step >= TOUR_STEPS.length) {
    return endTour(state);
  }
  return { ...state, tourStep: step };
}

function settleTourStep(step: number, context: OnboardingContext): number {
  let next = step;
  while (next > 0 && next < TOUR_STEPS.length && TOUR_STEPS[next].requires?.(context) === false) {
    next -= 1;
  }
  while (next < TOUR_STEPS.length && TOUR_STEPS[next].satisfiedBy?.(context)) {
    next += 1;
  }
  return next;
}

export function loadStoredOnboarding(): StoredOnboarding | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw) as Partial<StoredOnboarding> | null;
    if (!data || typeof data !== 'object') {
      return null;
    }
    return {
      tourDone: data.tourDone === true,
      tipsEnabled: data.tipsEnabled !== false,
      seenHints: Array.isArray(data.seenHints)
        ? data.seenHints.filter((id): id is HintId => HINT_IDS.includes(id as HintId))
        : []
    };
  } catch {
    return null;
  }
}

export function saveStoredOnboarding(state: OnboardingState): void {
  try {
    const stored: StoredOnboarding = {
      tourDone: state.tourDone,
      tipsEnabled: state.tipsEnabled,
      seenHints: state.seenHints
    };
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage errors.
  }
}
