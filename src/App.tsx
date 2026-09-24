import { useEffect, useRef, useState } from 'react';
import { Game } from './game/game';
import { CHAPTERS } from './game/story/chapters';
import { useUI } from './game/store';
import { audio } from './game/audio';
import { Title } from './ui/Title';
import { Hud } from './ui/Hud';
import { Card, Subtitles, Toasts, MemoryPopup, Choice, Pause, Dead, Ending, Fx } from './ui/Overlays';

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const screen = useUI((s) => s.screen);

  useEffect(() => {
    if (!mount.current) return;
    let g: Game;
    try {
      g = new Game(mount.current);
    } catch (e) {
      console.error(e);
      setErr('WebGL could not be started on this device/browser. Try a recent desktop Chrome, Edge or Firefox with hardware acceleration enabled.');
      return;
    }
    g.chapters = CHAPTERS;
    const s = useUI.getState().save.settings;
    audio.setVolumes(s.master, s.music, s.sfx);
    setGame(g);
    (window as any).__serpent = g;
    return () => g.dispose();
  }, []);

  return (
    <div className="app">
      <div ref={mount} className="viewport" />
      {err && <div className="fatal"><h1>SERPENT</h1><p>{err}</p></div>}
      {game && (
        <>
          <Fx />
          {(screen === 'playing' || screen === 'paused' || screen === 'choice' || screen === 'dead') && <Hud game={game} />}
          <Subtitles />
          <Toasts />
          <MemoryPopup game={game} />
          {screen === 'title' && <Title game={game} />}
          {screen === 'card' && <Card />}
          {screen === 'choice' && <Choice />}
          {screen === 'paused' && <Pause game={game} />}
          {screen === 'dead' && <Dead game={game} />}
          {(screen === 'ending' || screen === 'credits') && <Ending game={game} />}
        </>
      )}
    </div>
  );
}
