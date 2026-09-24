import { useEffect, useState } from 'react';
import type { Game } from '../game/game';
import { useUI, updateSave } from '../game/store';
import { audio } from '../game/audio';
import { MEMORIES, MEMORY_IDS } from '../game/story/memories';
import { Settings } from './Settings';

type Panel = 'main' | 'chapters' | 'memories' | 'settings' | 'controls';

export function Title({ game }: { game: Game }) {
  const save = useUI((s) => s.save);
  const [panel, setPanel] = useState<Panel>('main');
  const [leaving, setLeaving] = useState(false);
  const hasSave = save.lastChapter > 0 || save.lastSection > 0;

  const go = (chapter: number, section = 0) => {
    audio.init();
    audio.sfx('uiConfirm');
    setLeaving(true);
    setTimeout(() => game.startChapter(chapter, section), 700);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panel !== 'main') setPanel('main');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const open = (p: Panel) => { audio.init(); audio.sfx('ui'); setPanel(p); };

  return (
    <div className={`title ${leaving ? 'leaving' : ''}`}>
      <div className="title-art" />
      <div className="title-embers" />
      <div className="title-vignette" />
      {panel === 'main' && (
        <div className="title-main">
          <div className="logo">
            <div className="logo-top">SERPENT</div>
            <div className="logo-rule"><span /></div>
            <div className="logo-sub">The Last Cycle</div>
          </div>
          <nav className="menu">
            {hasSave && (
              <button onClick={() => go(save.lastChapter, save.lastSection)}>
                Continue <small>{game.chapters[save.lastChapter]?.title}</small>
              </button>
            )}
            <button onClick={() => {
              if (hasSave && !confirm('Start a new story? Your chapter progress stays unlocked; memory fragments are kept.')) return;
              updateSave((s) => { s.lastChapter = 0; s.lastSection = 0; });
              go(0);
            }}>{save.ngPlus > 0 ? `New Cycle  ·  NG+${save.ngPlus}` : 'New Story'}</button>
            <button onClick={() => open('chapters')}>Chapters</button>
            <button onClick={() => open('memories')}>Memories <small>{save.fragments.length}/{MEMORY_IDS.length}</small></button>
            <button onClick={() => open('controls')}>Controls</button>
            <button onClick={() => open('settings')}>Settings</button>
          </nav>
          <div className="title-foot">
            {save.endings.length > 0 && <span>Endings witnessed: {save.endings.length}/4</span>}
            <span>Best with headphones · WebGL2</span>
          </div>
        </div>
      )}
      {panel === 'chapters' && (
        <div className="panel chapters">
          <h2>Chapters</h2>
          <div className="chapter-grid">
            {game.chapters.map((c, i) => {
              const locked = i > save.unlocked;
              return (
                <button key={c.id} className={`chapter ${locked ? 'locked' : ''}`} disabled={locked} onClick={() => go(i)}>
                  <div className="chapter-art" style={{ backgroundImage: locked ? undefined : `url(${c.art})` }} />
                  <div className="chapter-info">
                    <small>{c.act}</small>
                    <b>{locked ? '— sealed —' : c.title}</b>
                  </div>
                </button>
              );
            })}
          </div>
          <button className="btn" onClick={() => setPanel('main')}>Back</button>
        </div>
      )}
      {panel === 'memories' && (
        <div className="panel memories">
          <h2>Memory Fragments <small>{save.fragments.length}/{MEMORY_IDS.length}</small></h2>
          <p className="note">Losing segments costs you memories. Collect every fragment to reveal a fourth ending.</p>
          <div className="memory-list">
            {MEMORY_IDS.map((id) => {
              const m = MEMORIES[id];
              const got = save.fragments.includes(id);
              return (
                <div key={id} className={`memory-item ${got ? 'got' : ''}`}>
                  <b>{got ? m.title : '???'}</b>
                  <p>{got ? m.text : `Hint: ${m.where}`}</p>
                </div>
              );
            })}
          </div>
          <button className="btn" onClick={() => setPanel('main')}>Back</button>
        </div>
      )}
      {panel === 'controls' && (
        <div className="panel controls">
          <h2>Controls</h2>
          <table>
            <tbody>
              <tr><td>Steer</td><td><kbd>A</kbd> <kbd>D</kbd> · <kbd>←</kbd> <kbd>→</kbd> · touch left / right third</td></tr>
              <tr><td>Surge (uses stamina)</td><td><kbd>W</kbd> · <kbd>Shift</kbd> · <kbd>↑</kbd> · touch the middle</td></tr>
              <tr><td>Interact</td><td><kbd>E</kbd> · <kbd>Enter</kbd> · tap</td></tr>
              <tr><td>Skip cutscene</td><td><kbd>Space</kbd> · <kbd>Enter</kbd></td></tr>
              <tr><td>Camera</td><td><kbd>V</kbd> — cinematic chase / classic overhead</td></tr>
              <tr><td>Pause</td><td><kbd>Esc</kbd> · <kbd>P</kbd></td></tr>
              <tr><td>Gamepad</td><td>Left stick steers · A / RT surges</td></tr>
            </tbody>
          </table>
          <h3>The body is everything</h3>
          <ul>
            <li><b>Eat</b> to grow. Length is power, and every segment is a wall that blocks shots.</li>
            <li><b>Coil</b>: circle an enemy and touch your own body to close the loop and crush it.</li>
            <li>Your own body never kills you — but losing segments tears away memories. Below 3 segments, you die.</li>
            <li>Fruits: <span style={{ color: '#ff7a2a' }}>Ember</span> fire immunity · <span style={{ color: '#9ad0ff' }}>Moon</span> night sight · <span style={{ color: '#ff2a4a' }}>Blood Root</span> regeneration · <span style={{ color: '#ffe84a' }}>Storm</span> speed · <span style={{ color: '#b06aff' }}>Void</span> phase.</li>
          </ul>
          <button className="btn" onClick={() => setPanel('main')}>Back</button>
        </div>
      )}
      {panel === 'settings' && <Settings game={game} onClose={() => setPanel('main')} />}
    </div>
  );
}
