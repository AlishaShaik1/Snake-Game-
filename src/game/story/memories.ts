/** The Memory Fragments. Collect all fourteen to unlock the secret ending. */
export const MEMORIES: Record<string, { title: string; text: string; where: string }> = {
  protect: {
    title: 'I. The Shepherd',
    text: '"You were created to protect humanity." A warm voice. Hands — human hands — placing an egg into the dark. Someone is crying. Someone says: "Keep them safe when we cannot."',
    where: 'The Hatchling — the shrine mural',
  },
  destroy: {
    title: 'II. The Executioner',
    text: '"You were created to destroy humanity." Fire over a city. A crowd of lights going out one by one. The same voice, colder now: "When they break the Cycle, you will end them."',
    where: 'The Memory — the dreaming dunes',
  },
  never: {
    title: 'III. The Unmade',
    text: '"You were never created." No hands. No voice. Only a circle of scales, turning, turning. You were not made. You were remembered.',
    where: 'The Memory — beneath the broken mirror',
  },
  gentle: {
    title: 'IV. The Gentle Death',
    text: 'The trees remember when dying did not hurt. Leaves fell and became soil; soil became seed. Then the Core was opened, and nothing was allowed to end. The forest has been dying for a thousand years without being permitted to die.',
    where: 'The Dead Forest — hidden in the dark (Moon Sight)',
  },
  engineers: {
    title: 'V. The Engineers',
    text: 'A human notebook, the ink faded: "Day 912. The Core is not a weapon. It is a lock. We tried to repair the seal, but the pressure behind it is... alive. Whatever sleeps beneath the ocean is dreaming of us."',
    where: 'City of Bones — the collapsed library',
  },
  ignis: {
    title: 'VI. Ignis Remembers',
    text: 'Ignis burned the first forests so that new ones could grow. "I was never cruel," the flames whisper. "Only honest. Everything that burns was always going to."',
    where: 'The Burning Coil — among the lava flows',
  },
  thalassa: {
    title: 'VII. The Song of the Deep',
    text: 'Thalassa sang the tides in and out for ten thousand years. Her song had one verse: "Return." Every river returns to the sea. Every serpent returns to the egg.',
    where: 'Mother of the Deep — in the sunken arch',
  },
  zephyra: {
    title: 'VIII. The Wind Forgets',
    text: 'The wind carries seeds, ash and prayers, and forgets them all. Zephyra envied it. "To forget is to be free. I remember every storm. It is so heavy, little one."',
    where: 'Breath Between Worlds — on the farthest island',
  },
  sylvara: {
    title: 'IX. What the Roots Hold',
    text: 'Beneath every tree, the roots hold the bones of what came before. Sylvara fed on the dead and gave back green. "Hunger is not evil. Hunger is how the world says: continue."',
    where: 'The Grove That Hungers — at the old stump',
  },
  korrath: {
    title: 'X. The Patient Mountain',
    text: 'Korrath slept so long that humans built villages on his back. He let them. "They were so brief," he rumbles. "Like sparks. I could not bear to shake them off."',
    where: 'The Mountain That Moves — upon the highest ridge',
  },
  nihil: {
    title: "XI. Your Shadow's Name",
    text: 'The Void spoke only once: "I am what you will be if you stop choosing. A shape that only follows. Eat me, and never become me."',
    where: 'Your Shadow, Hungry — at the edge of the dark water',
  },
  astra: {
    title: "XII. Time's Confession",
    text: 'Astra saw every ending of the world. In each one, a small black serpent stands before a great one. In each one, it chooses differently. "I never learned which ending was true. Perhaps all of them."',
    where: 'Keeper of the Hours — between the obelisks',
  },
  sleeper: {
    title: 'XIII. The Sleeper',
    text: 'The ring beneath the ocean is not a structure. It is a vertebra. The planet is a body curled around a dream, and the dream is afraid of waking up.',
    where: 'The Ocean — beneath the great ring',
  },
  fear: {
    title: 'XIV. The First Fear',
    text: 'Before the world, there was one serpent and one thought: "I do not want to end." From that thought came the Cycle, the Eternals, the Core... and you. Every fear builds something. This one built everything.',
    where: 'Inside the Serpent — the drowned memory',
  },
};

export const MEMORY_IDS = Object.keys(MEMORIES);
