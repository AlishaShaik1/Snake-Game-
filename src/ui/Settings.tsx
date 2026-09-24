import type { Game } from '../game/game';
import { useUI, updateSave, type Quality, type Settings as S } from '../game/store';
import { audio } from '../game/audio';

export function Settings({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = useUI((st) => st.save.settings);
  const set = (patch: Partial<S>) => {
    updateSave((sv) => { Object.assign(sv.settings, patch); });
    const n = { ...s, ...patch };
    if (patch.quality) game.engine.setQuality(patch.quality);
    if (patch.shake !== undefined) game.engine.shakeEnabled = patch.shake;
    if (patch.camera) game.userCam = patch.camera;
    audio.setVolumes(n.master, n.music, n.sfx);
    audio.sfx('ui');
  };
  const qs: Quality[] = ['low', 'medium', 'high', 'ultra'];
  return (
    <div className="panel settings" onClick={(e) => e.stopPropagation()}>
      <h2>Settings</h2>
      <div className="row">
        <label>Graphics</label>
        <div className="seg">
          {qs.map((q) => <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => set({ quality: q })}>{q}</button>)}
        </div>
      </div>
      <div className="row"><label>Master volume</label><input type="range" min={0} max={1} step={0.05} value={s.master} onChange={(e) => set({ master: +e.target.value })} /></div>
      <div className="row"><label>Music</label><input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => set({ music: +e.target.value })} /></div>
      <div className="row"><label>Effects &amp; voice</label><input type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => set({ sfx: +e.target.value })} /></div>
      <div className="row">
        <label>Camera</label>
        <div className="seg">
          <button className={s.camera === 'chase' ? 'on' : ''} onClick={() => set({ camera: 'chase' })}>Cinematic</button>
          <button className={s.camera === 'classic' ? 'on' : ''} onClick={() => set({ camera: 'classic' })}>Classic</button>
        </div>
      </div>
      <div className="row">
        <label>Screen shake</label>
        <div className="seg"><button className={s.shake ? 'on' : ''} onClick={() => set({ shake: true })}>On</button><button className={!s.shake ? 'on' : ''} onClick={() => set({ shake: false })}>Off</button></div>
      </div>
      <div className="row">
        <label>Subtitles</label>
        <div className="seg"><button className={s.subtitles ? 'on' : ''} onClick={() => set({ subtitles: true })}>On</button><button className={!s.subtitles ? 'on' : ''} onClick={() => set({ subtitles: false })}>Off</button></div>
      </div>
      <p className="note">Quality adapts automatically if the frame rate drops below 30 fps. Current: {useUI.getState().fps} fps.</p>
      <button className="btn" onClick={onClose}>Back</button>
    </div>
  );
}
