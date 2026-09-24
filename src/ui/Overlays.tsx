import { useEffect, useState } from 'react';
import type { Game } from '../game/game';
import { useUI } from '../game/store';
import { audio } from '../game/audio';
import { MEMORY_IDS } from '../game/story/memories';
import { Settings } from './Settings';

/** Letterbox, fades, flashes, damage vignette. */
export function Fx() {
  const letterbox = useUI((s) => s.letterbox);
  const fade = useUI((s) => s.fade);
  const flash = useUI((s) => s.flash);
  const damage = useUI((s) => s.damage);
  const skippable = useUI((s) => s.cinematicSkippable);
  const [dmg, setDmg] = useState(0);
  useEffect(() => {
    if (!damage) return;
    setDmg((d) => d + 1);
  }, [damage]);
  return (
    <>
      <div className={`letterbox ${letterbox ? 'on' : ''}`}><div /><div /></div>
      {letterbox && skippable && <div className="skip">Space · skip</div>}
      <div className="fade" style={{ opacity: fade }} />
      {flash && <div key={flash.id} className="flash" style={{ background: flash.color }} />}
      {dmg > 0 && <div key={dmg} className="damage" />}
      <div className="grain" />
    </>
  );
}

export function Card() {
  const card = useUI((s) => s.card);
  if (!card) return null;
  return (
    <div className="card">
      <div className="card-art" style={{ backgroundImage: `url(${card.art})` }} />
      <div className="card-shade" />
      <div className="card-text">
        <div className="card-act">{card.act}</div>
        <h1>{card.title}</h1>
        <div className="card-rule" />
        <p className="card-sub">{card.subtitle}</p>
        {card.quote && <p className="card-quote">{card.quote}</p>}
      </div>
      <div className="card-loading"><span /></div>
    </div>
  );
}

export function Subtitles() {
  const sub = useUI((s) => s.subtitle);
  const on = useUI((s) => s.save.settings.subtitles);
  const letterbox = useUI((s) => s.letterbox);
  if (!sub || (!on && sub.who)) return null;
  return (
    <div className={`subtitle ${letterbox ? 'cine' : ''} ${sub.who ? '' : 'narration'}`} key={sub.id}>
      {sub.who && <b>{sub.who}</b>}
      <span>{sub.text}</span>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const big = toasts.filter((t) => t.kind === 'boss');
  const small = toasts.filter((t) => t.kind !== 'boss');
  return (
    <>
      {big.slice(-1).map((t) => (
        <div key={t.id} className="boss-banner">
          <div className="bb-rule" />
          <h1>{t.title}</h1>
          {t.text && <p>{t.text}</p>}
          <div className="bb-rule" />
        </div>
      ))}
      <div className="toasts">
        {small.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <b>{t.title}</b>
            {t.text && <span>{t.text}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

export function MemoryPopup({ game }: { game: Game }) {
  const m = useUI((s) => s.memory);
  if (!m) return null;
  return (
    <div className="memory-pop" onClick={() => game.closeMemory()}>
      <div className="memory-card">
        <div className="memory-art" />
        <small>Memory Fragment · {m.index} / {MEMORY_IDS.length}</small>
        <h2>{m.title}</h2>
        <p>{m.text}</p>
        <button className="btn">Continue <kbd>E</kbd></button>
      </div>
    </div>
  );
}

export function Choice() {
  const choice = useUI((s) => s.choice);
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [choice]);
  useEffect(() => {
    if (!choice) return;
    const n = choice.options.length;
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowRight', 's', 'd'].includes(e.key)) { setSel((v) => (v + 1) % n); audio.sfx('ui'); }
      if (['ArrowUp', 'ArrowLeft', 'w', 'a'].includes(e.key)) { setSel((v) => (v + n - 1) % n); audio.sfx('ui'); }
      if (e.key === 'Enter' || e.key === ' ') {
        const o = choice.options[sel];
        if (o && !o.locked) (window as any).__serpentChoose?.(o.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choice, sel]);
  if (!choice) return null;
  return (
    <div className="choice">
      <h2>{choice.prompt}</h2>
      {choice.sub && <p className="choice-sub">{choice.sub}</p>}
      <div className={`choice-options n${choice.options.length}`}>
        {choice.options.map((o, i) => (
          <button
            key={o.id}
            className={`opt ${i === sel ? 'sel' : ''} ${o.locked ? 'locked' : ''} opt-${o.id}`}
            onMouseEnter={() => setSel(i)}
            onClick={() => !o.locked && (window as any).__serpentChoose?.(o.id)}
          >
            <b>{o.label}</b>
            <span>{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Pause({ game }: { game: Game }) {
  const [settings, setSettings] = useState(false);
  const objective = useUI((s) => s.objective);
  const ch = game.chapters[useUI.getState().chapter];
  return (
    <div className="overlay pause">
      {settings ? (
        <Settings game={game} onClose={() => setSettings(false)} />
      ) : (
        <div className="panel">
          <small className="kicker">{ch?.act}</small>
          <h2>{ch?.title}</h2>
          {objective && <p className="note">Objective: {objective}</p>}
          <nav className="menu">
            <button onClick={() => game.setPaused(false)}>Resume</button>
            <button onClick={() => game.retry()}>Restart checkpoint</button>
            <button onClick={() => setSettings(true)}>Settings</button>
            <button onClick={() => game.quitToTitle()}>Quit to title</button>
          </nav>
        </div>
      )}
    </div>
  );
}

export function Dead({ game }: { game: Game }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') game.retry(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);
  return (
    <div className="overlay dead">
      <h1>The Cycle Continues</h1>
      <p>Every serpent returns to the egg.</p>
      <nav className="menu row">
        <button onClick={() => game.retry()}>Rise again <kbd>Enter</kbd></button>
        <button onClick={() => game.quitToTitle()}>Title</button>
      </nav>
    </div>
  );
}

const CREDITS = [
  ['SERPENT: THE LAST CYCLE', ''],
  ['Story', 'Based on the original story “SERPENT: The Last Cycle”'],
  ['Engine', 'Three.js · WebGL2 · postprocessing'],
  ['Rendering', 'Physically-based materials · SSAO · bloom · depth of field · procedural worlds'],
  ['Music & sound', 'Procedurally synthesised with the Web Audio API'],
  ['Key art', 'Generated for this project'],
  ['Starring', 'AEREN, the last hatchling'],
  ['The Seven', 'Ignis · Thalassa · Zephyra · Sylvara · Korrath · Nihil · Chronos-Astra'],
  ['And', 'The First Serpent'],
  ['', '“Every beginning is a memory of an ending.”'],
];

export function Ending({ game }: { game: Game }) {
  const ending = useUI((s) => s.ending);
  const screen = useUI((s) => s.screen);
  const save = useUI((s) => s.save);
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!ending) return;
    const iv = setInterval(() => setN((v) => v + 1), 3400);
    return () => clearInterval(iv);
  }, [ending]);
  if (!ending) return null;
  const done = n >= ending.lines.length;
  if (screen === 'credits') {
    return (
      <div className="overlay ending credits">
        <div className="credits-roll">
          {CREDITS.map(([a, b], i) => (
            <div key={i} className="credit"><small>{a}</small><b>{b}</b></div>
          ))}
          <div className="credit"><small>Endings witnessed</small><b>{save.endings.length} / 4</b></div>
          <div className="credit"><small>Memory fragments</small><b>{save.fragments.length} / {MEMORY_IDS.length}</b></div>
        </div>
        <nav className="menu row fixed">
          {ending.id === 'ouroboros' && <button onClick={() => game.startChapter(0)}>Begin NG+{save.ngPlus}</button>}
          <button onClick={() => game.quitToTitle()}>Return to title</button>
        </nav>
      </div>
    );
  }
  return (
    <div className={`overlay ending e-${ending.id}`}>
      <h1>{ending.title}</h1>
      <div className="ending-lines">
        {ending.lines.slice(0, n + 1).map((l, i) => <p key={i} className="line">{l}</p>)}
      </div>
      <nav className="menu row">
        {done ? (
          <button onClick={() => useUI.setState({ screen: 'credits' })}>Credits</button>
        ) : (
          <button className="ghost" onClick={() => setN(ending.lines.length)}>Skip</button>
        )}
      </nav>
    </div>
  );
}
