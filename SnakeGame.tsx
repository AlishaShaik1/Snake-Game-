import React, { useState } from 'react';
import SnakeGame from './components/SnakeGame';
import MusicPlayer from './components/MusicPlayer';
import { Music, Gamepad2, Zap } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [score, setScore] = useState(0);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="static-noise" />
      <div className="scanline" />
      
      {/* Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-between mb-12 z-10 gap-6"
      >
        <div className="flex items-center gap-4">
          <div className="p-1 bg-glitch-magenta">
            <Zap className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-pixel text-glitch-cyan glitch-text" data-text="VOID_RUNNER_v1.0">
            VOID_RUNNER_v1.0
          </h1>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-[8px] text-glitch-magenta uppercase mb-1">DATA_HARVEST</span>
          <span className="text-2xl font-pixel text-glitch-cyan">
            {score.toString().padStart(6, '0')}
          </span>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        
        {/* Left Panel - Status */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-3 space-y-8 order-2 lg:order-1"
        >
          <div className="p-4 border-2 border-glitch-cyan bg-black">
            <div className="flex items-center gap-2 mb-4 text-glitch-magenta">
              <Gamepad2 size={14} />
              <h2 className="text-[10px] font-pixel uppercase">CMD_LIST</h2>
            </div>
            <div className="space-y-4 text-[8px] text-glitch-cyan leading-loose">
              <p>DIR_UP: ARROW_UP</p>
              <p>DIR_DN: ARROW_DN</p>
              <p>DIR_LT: ARROW_LT</p>
              <p>DIR_RT: ARROW_RT</p>
              <p>HALT: SPACE</p>
            </div>
          </div>

          <div className="p-4 border-2 border-glitch-magenta bg-black">
            <div className="flex items-center gap-2 mb-4 text-glitch-cyan">
              <Music size={14} />
              <h2 className="text-[10px] font-pixel uppercase">AUDIO_LINK</h2>
            </div>
            <p className="text-[8px] leading-relaxed text-glitch-magenta animate-pulse">
              WARNING: NEURAL_OVERLOAD_DETECTED. PROCEED_WITH_CAUTION.
            </p>
          </div>
        </motion.div>

        {/* Center Panel - Grid */}
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-6 flex justify-center order-1 lg:order-2"
        >
          <SnakeGame onScoreChange={setScore} />
        </motion.div>

        {/* Right Panel - Control */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-3 flex flex-col gap-8 order-3"
        >
          <MusicPlayer />
          
          <div className="p-4 bg-glitch-cyan text-black text-[8px] font-pixel text-center">
            CONNECTION_STABLE // 0x00FF_ACTIVE
          </div>
        </motion.div>

      </main>

      {/* Footer */}
      <footer className="mt-16 text-glitch-magenta/30 text-[8px] font-pixel uppercase tracking-widest z-10">
        [REDACTED] // MACHINE_INTERFACE_v2.0
      </footer>
    </div>
  );
}
