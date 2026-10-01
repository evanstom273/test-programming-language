import {
  Undo2,
  Redo2,
  IndentIncrease,
  IndentDecrease,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { EditorHandle } from '../Editor';
export function TouchKeys({
  editor,
}: {
  editor: React.RefObject<EditorHandle>;
}) {
  const snippets = [
    ['Insert…', ''],
    ['Print', 'print("Hello").'],
    ['Input', 'input integer: amount = 1.'],
    ['Button', 'button "Go", do.\n    print("Go!").\nend button.'],
    ['Scene', 'scene Main.\n    heading "My app".\nend scene.'],
    ['If', 'if true, do.\n    \nend if.'],
  ];
  return (
    <div
      className="lab-touchkeys"
      aria-label="Touch editing tools"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) e.preventDefault();
      }}
    >
      {[
        [Undo2, 'Undo', 'undo'],
        [Redo2, 'Redo', 'redo'],
        [IndentIncrease, 'Indent', 'indent'],
        [IndentDecrease, 'Outdent', 'outdent'],
        [ChevronLeft, 'Cursor left', 'left'],
        [ChevronRight, 'Cursor right', 'right'],
      ].map(([Icon, label, cmd]) => {
        const Glyph = Icon as typeof Undo2;
        return (
          <button
            key={String(cmd)}
            aria-label={String(label)}
            title={String(label)}
            onClick={() => editor.current?.command(String(cmd))}
          >
            <Glyph size={17} />
          </button>
        );
      })}
      <span className="lab-key-divider" />
      {[':', '=', '"', '(', ')', '[', ']', '.'].map((key) => (
        <button
          key={key}
          aria-label={'Insert ' + key}
          onClick={() => editor.current?.insert(key)}
        >
          {key}
        </button>
      ))}
      <select
        aria-label="Insert snippet"
        value=""
        onChange={(e) => editor.current?.insert(e.target.value)}
      >
        {snippets.map(([label, value]) => (
          <option key={label} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
