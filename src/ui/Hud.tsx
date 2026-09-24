import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import { useUI } from '../game/store';

export function Hud({ game }: { game: Game }) {
  const objective = useUI((s) => s.objective);
  const objectiveSub = useUI((s) => s.objectiveSub);
  const length = useUI((s) => s.length);
  const stamina = useUI((s) => s.stamina);
  const abilities = useUI((s) => s.abilities);
  const boss = useUI((s) => s.boss);
  const hint = useUI((s) => s.hint);
  const prompt = useUI((s) => s.prompt);
  const letterbox = useUI((s) => s.letterbox);
  const marker = useUI((s) => s.markerScreen);
  const chapter = useUI((s) => s.chapter);
  const fragments = useUI((s) => s.save.fragments.length);
  const ch = game.chapters[chapter];

  // pulse length counter when it changes
  const [pulse, setPulse] = useState(false);
  const last = useRef(length);
  useEffect(() => {
    if (length !== last.current) {
      setPulse(length > last.current);
      last.current = length;
      const t = setTimeout(() => setPulse(false), 250);
      return () => clearTimeout(t);
    }
  }, [length]);

  return (
    <div className={`hud ${letterbox ? 'hidden' : ''}`}>
      {objective && (
        <div className="objective" key={objective}>
          <small>{ch?.title}</small>
          <b>{objective}</b>
          {objectiveSub && <span>{objectiveSub}</span>}
        </div>
      )}
      <div className="frag-count" title="Memory fragments">◈ {fragments}</div>
      {boss && (
        <div className="bossbar" style={{ ['--c' as any]: boss.color }}>
          <div className="boss-name">{boss.name}<small>{boss.title}</small></div>
          <div className="boss-track"><div className="boss-fill" style={{ width: `${Math.max(0, Math.min(1, boss.hp)) * 100}%` }} /><div className="boss-ghost" style={{ width: `${Math.max(0, Math.min(1, boss.hp)) * 100}%` }} /></div>
        </div>
      )}
      <div className="vitals">
        <div className={`length ${pulse ? 'pulse' : ''} ${length < 6 ? 'danger' : ''}`}>
          <b>{length}</b><small>segments</small>
        </div>
        <div className="stamina"><div style={{ width: `${stamina * 100}%` }} className={stamina < 0.2 ? 'low' : ''} /></div>
        <div className="abilities">
          {abilities.map((a) => (
            <div key={a.id} className="ability" style={{ ['--c' as any]: a.color }}>
              <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" className="bg" /><circle cx="18" cy="18" r="15" className="fg" strokeDasharray={`${(a.t / a.dur) * 94.2} 94.2`} /></svg>
              <span>{a.name}</span>
            </div>
          ))}
        </div>
      </div>
      {hint && <div className="hint" key={hint}>{hint}</div>}
      {prompt && <div className="prompt"><kbd>E</kbd>{prompt.replace(/^E — /, '')}</div>}
      {marker && (
        marker.onScreen ? (
          <div className="marker" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}><div className="diamond" /><span>{marker.dist} m</span></div>
        ) : (
          <div className="marker edge" style={{ left: `${marker.x}%`, top: `${marker.y}%` }}>
            <div className="arrow" style={{ transform: `rotate(${-marker.angle}rad)` }} />
          </div>
        )
      )}
      <div className="touch-hint">◀ steer · surge · steer ▶</div>
    </div>
  );
}
