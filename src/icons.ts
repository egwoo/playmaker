import {
  ChevronDown,
  Pause,
  PencilLine,
  Play,
  Redo,
  RotateCcw,
  Trash2,
  Undo,
  createIcons
} from 'lucide';

const ICONS = {
  ChevronDown,
  Pause,
  PencilLine,
  Play,
  Redo,
  RotateCcw,
  Trash2,
  Undo
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
