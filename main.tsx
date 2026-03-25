import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2 } from 'lucide-react';

const TRACKS = [
  {
    id: 1,
    title: "VOID_SIGNAL",
    artist: "MACHINE_01",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    color: "#00ffff"
  },
  {
    id: 2,
    title: "STATIC_PULSE",
    artist: "MACHINE_02",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    color: "#ff00ff"
  },
  {
    id: 3,
    title: "GRID_ERROR",
    artist: "MACHINE_03",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    color: "#ffff00"
  }
];

export default function MusicPlayer() {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrack = TRACKS[currentTrackIndex];

  useEffect(() => {
    if (isPlaying) {
      audioRef.current?.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current?.pause();
    }
  }, [isPlaying, currentTrackIndex]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const nextTrack = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % TRACKS.length);
    setProgress(0);
  };

  const prevTrack = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + TRACKS.length) % TRACKS.length);
    setProgress(0);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      setProgress((current / duration) * 100);
    }
  };

  const handleEnded = () => {
    nextTrack();
  };

  return (
    <div className="w-full max-w-md bg-black p-6 pixel-border">
      <audio
        ref={audioRef}
        src={currentTrack.url}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
      
      <div className="flex items-center gap-4 mb-8">
        <div 
          className="w-12 h-12 flex items-center justify-center border-2 border-glitch-cyan animate-glitch"
          style={{ backgroundColor: currentTrack.color }}
        >
          <Volume2 className="text-black w-6 h-6" />
        </div>
        <div>
          <h3 className="font-pixel text-[10px] text-glitch-cyan uppercase mb-1">{currentTrack.title}</h3>
          <p className="text-[8px] text-glitch-magenta uppercase tracking-tighter">{currentTrack.artist}</p>
        </div>
      </div>

      <div className="relative w-full h-2 bg-white/5 mb-8">
        <div 
          className="absolute top-0 left-0 h-full bg-glitch-cyan"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <button onClick={prevTrack} className="text-glitch-cyan hover:text-glitch-magenta">
          <SkipBack size={20} />
        </button>
        
        <button 
          onClick={togglePlay}
          className="px-4 py-2 bg-glitch-magenta text-black font-pixel text-[10px] hover:bg-glitch-cyan transition-colors"
        >
          {isPlaying ? "HALT" : "EXEC"}
        </button>

        <button onClick={nextTrack} className="text-glitch-cyan hover:text-glitch-magenta">
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
}
