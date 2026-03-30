import {
  CircleQuestionMark,
  ChevronDown,
  FlipHorizontal2,
  GripHorizontal,
  Lock,
  Maximize2,
  Minimize2,
  MoreVertical,
  Pause,
  PencilLine,
  Play,
  Redo,
  RotateCcw,
  Settings2,
  Trash2,
  Undo,
  Unlock,
  User,
  X,
  createIcons
} from 'lucide';

const ICONS = {
  CircleQuestionMark,
  ChevronDown,
  FlipHorizontal2,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  PencilLine,
  Play,
  X,
  MoreVertical,
  GripHorizontal,
  Redo,
  RotateCcw,
  Settings2,
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
