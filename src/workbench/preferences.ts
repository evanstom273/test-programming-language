import { useEffect, useState } from 'react';
export type Layout = 'code' | 'app' | 'split';
export interface Preferences {
  layout: Layout;
  fontSize: number;
  wrap: boolean;
  keys: boolean;
  split: number;
}
const defaults: Preferences = {
  layout: 'split',
  fontSize: 16,
  wrap: true,
  keys: true,
  split: 50,
};
export function readPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem('langlab.editor.v1') ?? '{}');
    return {
      layout: ['code', 'app', 'split'].includes(p.layout)
        ? p.layout
        : defaults.layout,
      fontSize: [14, 16, 18, 20].includes(p.fontSize)
        ? p.fontSize
        : defaults.fontSize,
      wrap: typeof p.wrap === 'boolean' ? p.wrap : true,
      keys: typeof p.keys === 'boolean' ? p.keys : true,
      split: Number.isFinite(p.split)
        ? Math.max(35, Math.min(65, p.split))
        : 50,
    };
  } catch {
    return defaults;
  }
}
export function usePreferences() {
  const [prefs, set] = useState(readPreferences);
  function update(patch: Partial<Preferences>) {
    set((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem('langlab.editor.v1', JSON.stringify(next));
      } catch {
        /* Optional preferences must not block editing. */
      }
      return next;
    });
  }
  return [prefs, update] as const;
}
export function useViewport() {
  const [size, setSize] = useState(() => ({
    width: innerWidth,
    height: window.visualViewport?.height ?? innerHeight,
  }));
  useEffect(() => {
    const update = () =>
      setSize({
        width: innerWidth,
        height: window.visualViewport?.height ?? innerHeight,
      });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return size;
}
