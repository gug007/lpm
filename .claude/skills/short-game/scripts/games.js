// The games a race can ask for. Each prompt keeps short-race's rules: index.html
// at the project root, one file, a 420x740 stage with sizes as shares of it,
// scaled to fit and never cropped, "Don't run or test it". A game plays itself,
// so the reveal is live gameplay with nobody at the controls.
const GAMES = {
  runner: {
    slug: "3d-runner",
    build: "a 3D endless runner game that plays itself",
    play: "A runner sprints down a 3D track that stretches to the horizon, and the game steers itself: it switches lanes, jumps over obstacles and grabs coins on its own, with a score that keeps climbing.",
    layout: "the track's vanishing point sits about 30% from the top, and the runner stands about 75% of the way down, about 15% of the stage's height tall",
    restart: "if the runner ever crashes, restart at once.",
    subject: "a 3D game that plays itself",
    noun: "a 3D game",
    headline: "build a 3D game 🎮",
    caption: "making a 3D game with AI",
    what: "a self-playing endless runner",
  },
  racer: {
    slug: "3d-racer",
    build: "a 3D racing game that drives itself",
    play: "A car speeds down a 3D highway that stretches to the horizon, and the game drives itself: it weaves between lanes past slower traffic and grabs boosts on its own, with a speedometer and a distance counter that keep climbing.",
    layout: "the road's vanishing point sits about 30% from the top, and the player's car sits about 80% of the way down, about 25% of the stage's width wide",
    restart: "if the car ever crashes, restart at once.",
    subject: "a racing game that drives itself",
    noun: "a 3D racing game",
    headline: "build a 3D racing game 🏎️",
    caption: "making a 3D racing game with AI",
    what: "a self-driving 3D racer",
  },
  flappy: {
    slug: "flappy-bird",
    build: "a Flappy Bird game that plays itself",
    play: "A bird flaps through the gaps between scrolling pipes on its own, over a parallax background, with a score that keeps climbing.",
    layout: "the bird flies about 30% from the left, about 10% of the stage's width wide, and each gap between the pipes is about 25% of the stage's height",
    restart: "if the bird ever hits a pipe, restart at once.",
    subject: "Flappy Bird that plays itself",
    noun: "Flappy Bird",
    headline: "build Flappy Bird 🐦",
    caption: "making Flappy Bird with AI",
    what: "a self-playing Flappy Bird",
  },
  snake: {
    slug: "snake",
    build: "a Snake game that plays itself",
    play: "The snake steers itself to each piece of food, grows with every bite and never runs into itself, with a score that keeps climbing.",
    layout: "a square board of 20 by 20 cells spans about 90% of the stage's width, centered about 55% of the way down, with the score above it",
    restart: "when the board fills up or the snake gets stuck, restart at once.",
    subject: "Snake that plays itself",
    noun: "Snake",
    headline: "build Snake 🐍",
    caption: "making Snake with AI",
    what: "a self-playing Snake",
  },
  shooter: {
    slug: "space-shooter",
    build: "a space shooter game that plays itself",
    play: "A ship dodges and blasts waves of enemies and asteroids on its own, with explosions, power-ups and a score that keeps climbing.",
    layout: "the ship sits about 85% of the way down, about 15% of the stage's width wide, and the enemies come in from the top",
    restart: "if the ship is ever destroyed, restart at once.",
    subject: "a space shooter that plays itself",
    noun: "a space shooter",
    headline: "build a space shooter 🚀",
    caption: "making a space shooter with AI",
    what: "a self-playing space shooter",
  },
  breakout: {
    slug: "breakout",
    build: "a Breakout game that plays itself",
    play: "The paddle follows the ball on its own, the ball smashes rows of bricks into particles, and a fresh wall drops in each time one is cleared, with a score that keeps climbing.",
    layout: "the bricks fill the band from about 15% to 40% of the stage's height, and the paddle sits about 90% of the way down, about 22% of the stage's width wide",
    restart: "if the ball is ever missed, restart at once.",
    subject: "Breakout that plays itself",
    noun: "Breakout",
    headline: "build Breakout 🧱",
    caption: "making Breakout with AI",
    what: "a self-playing Breakout",
  },
};

const prompt = (g) =>
  `Build ${g.build}, in index.html at the project root. One file, no libraries or images. ${g.play} ` +
  "It's shown in a tall, narrow panel and the window can be any size. " +
  `Lay the game out on a 420x740 stage: ${g.layout}. ` +
  "Scale the whole stage to fit the panel, centered, never cropped; the background fills the rest. No scrolling. " +
  `Play forever: ${g.restart} Don't open it. Don't run or test it. No questions, just write it.`;

module.exports = { GAMES, prompt };
