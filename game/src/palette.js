// DUSTLINE PROTOCOL — the look plan in one place. Golden-hour desert canyon:
// sun-baked sand, rust-red rock, pale sky and one signal-orange accent. The same
// names are the CSS custom properties in index.html. No other colour appears in
// the code.
export const PALETTE = {
  canvas: '#1c130a',
  floor: '#a97e4f',
  wall: '#8a5a38',
  cover: '#6e4a2e',
  rock: '#7c4a2c',
  rust: '#b4552d',
  hazard: '#ffb347',
  accent: '#ff7a1a',
  sky: '#e8b06a',
  ink: '#f2e8d5',
  muted: '#b09a7a',
  ally: '#2fd6a3',
  enemy: '#ff5a2a',
};

export const NAMES = {
  game: 'DUSTLINE PROTOCOL',
  map: 'DUSTLINE CANYON',
  teamUs: 'SABLE',
  teamThem: 'DUSTJACKALS',
  relay: 'RELAY TERMINAL',
  mode: 'RELAY SIEGE',
};

export function shade(name) {
  return PALETTE[name];
}
