import { create } from 'zustand';

export type Screen =
  | 'title'
  | 'card'
  | 'playing'
  | 'paused'
  | 'dead'
  | 'choice'
  | 'ending'
  | 'credits';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface Settings {
  quality: Quality;
  master: number;
  music: number;
  sfx: number;
  camera: 'chase' | 'classic';
  subtitles: boolean;
  shake: boolean;
}

export interface SaveData {
  unlocked: number; // highest chapter index unlocked
  fragments: string[];
  oceanChoice: 'wake' | 'die' | null;
  endings: string[];
  ngPlus: number;
  lastChapter: number;
  lastSection: number;
  settings: Settings;
}

const KEY = 'serpent-last-cycle-save-v1';

export const defaultSettings = (): Settings => ({
  quality: /Mobi|Android/i.test(navigator.userAgent) ? 'low' : 'high',
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  camera: 'chase',
  subtitles: true,
  shake: true,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        unlocked: 0, fragments: [], oceanChoice: null, endings: [], ngPlus: 0, lastChapter: 0, lastSection: 0,
        ...s,
        settings: { ...defaultSettings(), ...(s.settings || {}) },
      };
    }
  } catch { /* ignore */ }
  return { unlocked: 0, fragments: [], oceanChoice: null, endings: [], ngPlus: 0, lastChapter: 0, lastSection: 0, settings: defaultSettings() };
}

export function writeSave(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface Subtitle { who: string; text: string; id: number }
export interface Toast { id: number; title: string; text?: string; kind: 'memory' | 'ability' | 'info' | 'warn' | 'boss' }
export interface ChoiceOption { id: string; label: string; desc: string; locked?: boolean }
export interface Ability { id: string; name: string; color: string; t: number; dur: number }

export interface UIState {
  screen: Screen;
  save: SaveData;
  chapter: number;
  card: { act: string; title: string; subtitle: string; art: string; quote?: string } | null;
  loadingProgress: number;
  objective: string | null;
  objectiveSub: string | null;
  length: number;
  sizeLabel: string;
  stamina: number;
  abilities: Ability[];
  boss: { name: string; title: string; hp: number; color: string } | null;
  subtitle: Subtitle | null;
  letterbox: boolean;
  cinematicSkippable: boolean;
  toasts: Toast[];
  memory: { title: string; text: string; index: number } | null;
  choice: { prompt: string; sub?: string; options: ChoiceOption[] } | null;
  prompt: string | null;
  hint: string | null;
  damage: number;
  flash: { color: string; id: number } | null;
  fade: number; // 0..1 black overlay
  ending: { id: string; title: string; lines: string[] } | null;
  markerScreen: { x: number; y: number; onScreen: boolean; angle: number; dist: number } | null;
  fps: number;
  compassLabel: string | null;
}

export const useUI = create<UIState>(() => ({
  screen: 'title',
  save: loadSave(),
  chapter: 0,
  card: null,
  loadingProgress: 0,
  objective: null,
  objectiveSub: null,
  length: 0,
  sizeLabel: '',
  stamina: 1,
  abilities: [],
  boss: null,
  subtitle: null,
  letterbox: false,
  cinematicSkippable: false,
  toasts: [],
  memory: null,
  choice: null,
  prompt: null,
  hint: null,
  damage: 0,
  flash: null,
  fade: 0,
  ending: null,
  markerScreen: null,
  fps: 60,
  compassLabel: null,
}));

let toastId = 1;
export function toast(title: string, text?: string, kind: Toast['kind'] = 'info', ms = 4200) {
  const id = toastId++;
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, title, text, kind }] }));
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function updateSave(fn: (s: SaveData) => void) {
  const s = structuredClone(useUI.getState().save);
  fn(s);
  writeSave(s);
  useUI.setState({ save: s });
}
