import {
  ChevronDown,
  Lock,
  Maximize2,
  Minimize2,
  MoreVertical,
  Pause,
  PencilLine,
  Play,
  Redo,
  RotateCcw,
  Trash2,
  Undo,
  Unlock,
  User,
  X,
  createIcons
} from 'lucide';

const ICONS = {
  ChevronDown,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  PencilLine,
  Play,
  X,
  MoreVertical,
  Redo,
  RotateCcw,
  Trash2,
  Undo,
  Unlock,
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
