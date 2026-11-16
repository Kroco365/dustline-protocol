// One place for the match state. Nothing else owns round phase, money, score or
// the relay; modules read this and main.js advances it. All times are seconds.
//
// RELAY SIEGE: one terminal stands at the middle of the canyon. A team that
// holds the relay zone alone fills its capture meter; the other team's presence
// contests it and freezes both meters. A full meter (8 seconds of uncontested
// hold) wins the round at once. Elimination wins too.
export const PHASE = {
  MENU: 'menu', // overlay up, waiting for the player to click in
  FREEZE: 'freeze', // buy time at the start of a round
  LIVE: 'live', // the round is being played
  ROUND_END: 'roundEnd', // banner up, short pause, then the next round
  MATCH_END: 'matchEnd', // one team reached the target
};

export const ROUND_TIME = 100;
export const FREEZE_TIME = 12;
export const CAPTURE_TIME = 8; // seconds of uncontested hold to take the relay
export const RELAY_RADIUS = 3.6;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const WIN_BONUS = 3250;
export const LOSS_BONUS = 1900;
export const KILL_BONUS = 300;
export const CAPTURE_BONUS = 300;

export function createGameState() {
  return {
    phase: PHASE.MENU,
    round: 1,
    winsUs: 0,
    winsThem: 0,
    roundTime: ROUND_TIME,
    freezeTime: FREEZE_TIME,
    endTimer: 0,
    endText: '',
    endSub: '',
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    relay: {
      us: 0, // 0..1 capture meter for SABLE
      them: 0, // 0..1 capture meter for DUSTJACKALS
      holder: null, // 'us' | 'them' | 'contested' | null
      capturedBy: null, // 'us' | 'them' | null
    },
    matchWinner: null, // 'us' | 'them' | null
    // per-round bookkeeping, reset by rounds.startRound
    roundKills: 0,
    capturedThisRound: false,
    stats: { shots: 0, hits: 0, headshots: 0, damage: 0 },
  };
}

export function resetRelay(state) {
  state.relay.us = 0;
  state.relay.them = 0;
  state.relay.holder = null;
  state.relay.capturedBy = null;
}
