import { ChevronDown, Pause, PencilLine, Play, RotateCcw, Trash2, createIcons } from 'lucide';

const ICONS = {
  ChevronDown,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  Trash2
};

export function renderIcons(root: ParentNode = document) {
  createIcons({
    icons: ICONS,
    root,
    attrs: {
      class: 'icon'
    }
  });
}
