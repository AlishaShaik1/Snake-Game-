@import "tailwindcss";

@theme {
  --color-glitch-cyan: #00ffff;
  --color-glitch-magenta: #ff00ff;
  --color-glitch-yellow: #ffff00;
  --font-pixel: 'Press Start 2P', cursive;
}

@layer base {
  body {
    @apply bg-black text-glitch-cyan selection:bg-glitch-magenta selection:text-black;
    font-family: var(--font-pixel);
    overflow-x: hidden;
  }
}

/* Glitch Animations */
@keyframes glitch {
  0% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(-2px, -2px); }
  60% { transform: translate(2px, 2px); }
  80% { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}

@keyframes noise {
  0% { transform: translateY(0); }
  100% { transform: translateY(-100%); }
}

.glitch-text {
  position: relative;
  display: inline-block;
}

.glitch-text::before,
.glitch-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: black;
}

.glitch-text::before {
  left: 2px;
  text-shadow: -2px 0 var(--color-glitch-magenta);
  clip: rect(44px, 450px, 56px, 0);
  animation: glitch 5s infinite linear alternate-reverse;
}

.glitch-text::after {
  left: -2px;
  text-shadow: -2px 0 var(--color-glitch-cyan);
  clip: rect(44px, 450px, 56px, 0);
  animation: glitch 5s infinite linear alternate-reverse;
}

.static-noise {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: url('https://upload.wikimedia.org/wikipedia/commons/5/5a/Static_noise.png');
  opacity: 0.05;
  pointer-events: none;
  z-index: 9999;
}

.scanline {
  width: 100%;
  height: 100px;
  z-index: 9998;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(255, 255, 255, 0.2) 50%, rgba(0, 0, 0, 0) 100%);
  opacity: 0.1;
  position: absolute;
  bottom: 100%;
  animation: scanline 10s linear infinite;
}

@keyframes scanline {
  0% { bottom: 100%; }
  100% { bottom: -100%; }
}

.pixel-border {
  border: 4px solid var(--color-glitch-cyan);
  box-shadow: 4px 4px 0 var(--color-glitch-magenta);
}

@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
