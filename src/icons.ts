import {
  ChevronDown,
  Pause,
  PencilLine,
  Play,
  X,
  MoreVertical,
  Redo,
  RotateCcw,
  Trash2,
  Undo,
  User,
  createIcons
} from 'lucide';

const ICONS = {
  ChevronDown,
  Pause,
  PencilLine,
  Play,
  X,
  MoreVertical,
  Redo,
  RotateCcw,
  Trash2,
  Undo,
  User
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
