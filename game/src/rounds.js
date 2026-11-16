// Rounds and money. One round: a buy freeze, live play against the clock, then a
// win by elimination, by capturing the relay, or by the clock (the team ahead
// on capture progress, then on living fighters, holds the round). The round state
// machine lives here; main.js feeds it the alive counts and the relay each tick.
// Money: kills pay at once, the round bonus pays at the end, and capturing the
// relay pays the team that takes it.
import {
  PHASE, ROUND_TIME, FREEZE_TIME, CAPTURE_TIME, ROUNDS_TO_WIN, MAX_ROUNDS,
  WIN_BONUS, LOSS_BONUS, KILL_BONUS, CAPTURE_BONUS, START_MONEY, resetRelay,
} from './state.js';
import { WEAPONS, FRAG_PRICE, FLASH_PRICE, ARMOR_PRICE } from './weapons.js';

export const SHOP = [
  { id: 'rifle', name: 'RAPTOR-5 burst rifle', detail: '3-round burst · 30 dmg · 30 rounds', price: WEAPONS.rifle.price, key: '2' },
  { id: 'smg', name: 'SANDVIPER-9 SMG', detail: 'Auto · 25 dmg · fast', price: WEAPONS.smg.price, key: '3' },
  { id: 'shotgun', name: 'MAULER-12 shotgun', detail: 'Pump · 8 pellets · close range', price: WEAPONS.shotgun.price, key: '4' },
  { id: 'dmr', name: 'HAWKEYE-50 DMR', detail: 'Semi · 88 dmg · scope on right-click', price: WEAPONS.dmr.price, key: '5' },
  { id: 'frag', name: 'Frag grenade', detail: 'Throw with G · 120 max damage', price: FRAG_PRICE, key: '6' },
  { id: 'flash', name: 'Flashbang', detail: 'Throw with H · blinds for 2.5s', price: FLASH_PRICE, key: '7' },
  { id: 'armor', name: 'Kevlar vest', detail: 'Absorbs half of damage · 50 points', price: ARMOR_PRICE, key: '8' },
];

export function createRounds(state, hooks) {
  function setPhase(phase) {
    state.phase = phase;
  }

  function startMatch() {
    state.round = 1;
    state.winsUs = 0;
    state.winsThem = 0;
    state.money = START_MONEY;
    state.kills = 0;
    state.deaths = 0;
    state.matchWinner = null;
    state.stats = { shots: 0, hits: 0, headshots: 0, damage: 0 };
    startRound();
  }

  function startRound() {
    resetRelay(state);
    state.roundTime = ROUND_TIME;
    state.freezeTime = FREEZE_TIME;
    state.roundKills = 0;
    state.capturedThisRound = false;
    setPhase(PHASE.FREEZE);
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.ROUND_END || state.phase === PHASE.MATCH_END) return;
    const won = winner === 'us';
    if (won) state.winsUs += 1;
    else state.winsThem += 1;
    state.money += won ? WIN_BONUS : LOSS_BONUS;
    state.endText = won ? 'ROUND WON' : 'ROUND LOST';
    state.endSub = reason;
    state.endTimer = 4;
    setPhase(PHASE.ROUND_END);
    hooks.onRoundEnd(winner, reason);
    if (state.winsUs >= ROUNDS_TO_WIN || state.winsThem >= ROUNDS_TO_WIN || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.winsUs > state.winsThem ? 'us' : 'them';
      state.endText = state.matchWinner === 'us' ? 'MATCH WON' : 'MATCH LOST';
      state.endSub = `${state.winsUs} — ${state.winsThem} · ${reason}`;
      state.endTimer = 6;
      setPhase(PHASE.MATCH_END);
      hooks.onMatchEnd(state.matchWinner);
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function tick(dt, alive) {
    if (state.phase === PHASE.FREEZE) {
      state.freezeTime -= dt;
      if (state.freezeTime <= 0) setPhase(PHASE.LIVE);
      return;
    }
    if (state.phase === PHASE.ROUND_END) {
      state.endTimer -= dt;
      if (state.endTimer <= 0) nextRound();
      return;
    }
    if (state.phase === PHASE.MATCH_END) {
      state.endTimer -= dt;
      return;
    }
    if (state.phase !== PHASE.LIVE) return;
    state.roundTime -= dt;
    if (state.relay.capturedBy === 'us') {
      endRound('us', 'SABLE captured the relay.');
      return;
    }
    if (state.relay.capturedBy === 'them') {
      endRound('them', 'DUSTJACKALS captured the relay.');
      return;
    }
    if (state.roundTime <= 0) {
      // the clock decides: capture progress first, living fighters second
      const diff = state.relay.us - state.relay.them;
      let winner;
      let reason;
      if (Math.abs(diff) > 0.02) {
        winner = diff > 0 ? 'us' : 'them';
        reason = 'Time ran out — SABLE held more of the relay.';
        if (winner === 'them') reason = 'Time ran out — DUSTJACKALS held more of the relay.';
      } else if (alive.us !== alive.them) {
        winner = alive.us > alive.them ? 'us' : 'them';
        reason = 'Time ran out — SABLE had more fighters standing.';
        if (winner === 'them') reason = 'Time ran out — DUSTJACKALS had more fighters standing.';
      } else {
        winner = 'them';
        reason = 'Time ran out — the defenders hold the canyon.';
      }
      endRound(winner, reason);
      return;
    }
    if (alive.us === 0 && alive.them > 0) {
      endRound('them', 'Your team was eliminated.');
      return;
    }
    if (alive.them === 0 && alive.us > 0) {
      endRound('us', 'Enemy team eliminated.');
    }
  }

  return {
    startMatch,
    startRound,
    endRound,
    tick,
    addMoney(amount) {
      state.money += amount;
      hooks.onMoney(state.money);
    },
    killReward() {
      state.money += KILL_BONUS;
      state.kills += 1;
      state.roundKills += 1;
      hooks.onMoney(state.money);
    },
    captureReward() {
      state.money += CAPTURE_BONUS;
      state.capturedThisRound = true;
      hooks.onMoney(state.money);
    },
  };
}
