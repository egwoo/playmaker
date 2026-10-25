export interface CoachMarkContent {
  title: string;
  body: string;
  stepLabel?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export interface CoachMarkRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CoachMarkTarget {
  // Viewport rect of the thing the tip points at; null docks the card instead.
  rect: CoachMarkRect | null;
  ring?: 'circle' | 'rounded';
  // Viewport point that suggests where to tap.
  ghost?: { x: number; y: number } | null;
}

interface CoachMarkHandlers {
  onPrimary: () => void;
  onSecondary: () => void;
}

const DOCKED_QUERY = '(max-width: 640px)';
const GAP = 14;
const MARGIN = 12;

// A non-blocking callout: everything except the card ignores pointer events,
// so the user keeps interacting with the real app underneath.
export function createCoachMark(handlers: CoachMarkHandlers) {
  const layer = document.createElement('div');
  layer.className = 'coach-layer is-hidden';
  layer.innerHTML = `
    <div class="coach-ring is-hidden"></div>
    <div class="coach-ghost is-hidden"></div>
    <div class="coach-card" role="status" aria-live="polite">
      <span class="coach-arrow"></span>
      <p class="coach-step"></p>
      <p class="coach-title"></p>
      <p class="coach-body"></p>
      <div class="coach-actions">
        <button type="button" class="coach-secondary"></button>
        <button type="button" class="primary coach-primary"></button>
      </div>
    </div>
  `;
  document.body.append(layer);

  const ring = layer.querySelector('.coach-ring') as HTMLElement;
  const ghost = layer.querySelector('.coach-ghost') as HTMLElement;
  const card = layer.querySelector('.coach-card') as HTMLElement;
  const arrow = layer.querySelector('.coach-arrow') as HTMLElement;
  const stepLabel = layer.querySelector('.coach-step') as HTMLElement;
  const title = layer.querySelector('.coach-title') as HTMLElement;
  const body = layer.querySelector('.coach-body') as HTMLElement;
  const primary = layer.querySelector('.coach-primary') as HTMLButtonElement;
  const secondary = layer.querySelector('.coach-secondary') as HTMLButtonElement;

  primary.addEventListener('click', () => handlers.onPrimary());
  secondary.addEventListener('click', () => handlers.onSecondary());

  function show(content: CoachMarkContent) {
    stepLabel.textContent = content.stepLabel ?? '';
    stepLabel.classList.toggle('is-hidden', !content.stepLabel);
    title.textContent = content.title;
    body.textContent = content.body;
    primary.textContent = content.primaryLabel ?? '';
    primary.classList.toggle('is-hidden', !content.primaryLabel);
    secondary.textContent = content.secondaryLabel ?? '';
    secondary.classList.toggle('is-hidden', !content.secondaryLabel);
    layer.classList.remove('is-hidden');
    layer.classList.remove('is-entered');
    requestAnimationFrame(() => layer.classList.add('is-entered'));
  }

  function hide() {
    layer.classList.add('is-hidden');
    layer.classList.remove('is-entered');
  }

  function place(target: CoachMarkTarget, visible: boolean) {
    layer.classList.toggle('is-suspended', !visible);
    if (!visible) {
      return;
    }
    placeRing(target);
    placeGhost(target.ghost ?? null);
    placeCard(target.rect);
  }

  function placeRing(target: CoachMarkTarget) {
    if (!target.rect || !target.ring) {
      ring.classList.add('is-hidden');
      return;
    }
    const { rect } = target;
    ring.classList.remove('is-hidden');
    ring.classList.toggle('is-circle', target.ring === 'circle');
    if (target.ring === 'circle') {
      const size = Math.max(rect.width, rect.height) + 12;
      setBox(ring, rect.left + rect.width / 2 - size / 2, rect.top + rect.height / 2 - size / 2, size, size);
      return;
    }
    setBox(ring, rect.left - 4, rect.top - 4, rect.width + 8, rect.height + 8);
  }

  function placeGhost(point: { x: number; y: number } | null) {
    ghost.classList.toggle('is-hidden', !point);
    if (point) {
      ghost.style.left = `${point.x}px`;
      ghost.style.top = `${point.y}px`;
    }
  }

  function placeCard(rect: CoachMarkRect | null) {
    const docked = !rect || window.matchMedia(DOCKED_QUERY).matches;
    if (docked) {
      // Dock away from the anchor so the card never covers it.
      const anchorLow = rect ? rect.top + rect.height / 2 > window.innerHeight * 0.55 : false;
      card.dataset.placement = anchorLow ? 'dock-top' : 'dock-bottom';
      card.style.left = '';
      card.style.top = '';
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const centerX = rect.left + rect.width / 2;
    const bottom = rect.top + rect.height;

    let placement: 'below' | 'above' | 'inside';
    let top: number;
    if (viewportHeight - bottom >= cardHeight + GAP + MARGIN) {
      placement = 'below';
      top = bottom + GAP;
    } else if (rect.top >= cardHeight + GAP + MARGIN) {
      placement = 'above';
      top = rect.top - GAP - cardHeight;
    } else {
      placement = 'inside';
      top = Math.max(MARGIN, Math.min(bottom, viewportHeight) - cardHeight - MARGIN * 2);
    }
    const left = clamp(centerX - cardWidth / 2, MARGIN, viewportWidth - cardWidth - MARGIN);

    card.dataset.placement = placement;
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    arrow.style.left = `${clamp(centerX - left, 18, cardWidth - 18)}px`;
  }

  return { show, hide, place };
}

function setBox(element: HTMLElement, left: number, top: number, width: number, height: number) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
