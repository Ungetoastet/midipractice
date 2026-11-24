/* Scoring constants, saved settings and the shared game state (S) */
'use strict';

const WINDOW = 0.22;     // seconds (real time) — outside this a note is missed
const PERFECT = 0.04;    // seconds — within this the timing score is 100
const HOLD_MIN = 0.45;   // notes at least this long (real time) also score holding
const HUES = [195, 135, 320, 38, 265, 8, 170, 85];
const JUDGE = [
  { min: 90, label: 'Perfect', color: '#ffd166', key: 'perfect' },
  { min: 70, label: 'Great',   color: '#4ee38b', key: 'great' },
  { min: 45, label: 'Good',    color: '#5ad1ff', key: 'good' },
  { min: 1,  label: 'Okay',    color: '#b59cff', key: 'okay' },
];
const MISS = { label: 'Miss', color: '#ff5a6e', key: 'miss' };
const judgeOf = s => JUDGE.find(j => s >= j.min) || MISS;
function timingScore(dt) {
  if (dt <= PERFECT) return 100;
  return clamp(Math.round(100 - 90 * (dt - PERFECT) / (WINDOW - PERFECT)), 10, 100);
}

/* ================= state ================= */
const saved = store.get('keyfall:settings', {});
const S = {
  song: null, playList: [], autoList: [],
  songTime: 0, lastNow: performance.now(), playing: false, started: false, finished: false,
  speed: saved.speed || 1, look: saved.look || 3, waitMode: !!saved.waitMode, listen: false,
  sound: saved.sound !== false, names: saved.names !== false, letters: saved.letters !== false, winOn: !!saved.winOn, lvol: saved.lvol != null ? saved.lvol : 1, winOct: saved.winOct || 2, rangeMode: saved.rangeMode || 'fit',
  lo: 48, hi: 83, keys: {}, keyList: [],
  score: 0, shown: 0, finalized: 0, total: 0, combo: 0, bestCombo: 0, counts: null,
  pendIdx: 0, autoIdx: 0, partial: false, pulse: 0, waiting: null, lastJudge: null,
  firstStart: 0, songEnd: 0, pcBase: 60, pcHints: true,
  W: 0, H: 0, dpr: 1, kbY: 0, kbH: 0, lineY: 0,
};
const holding = new Map();   // pitch -> note being held for hold-scoring
const down = new Map();      // pitch -> {ok:null|true|false}
let popups = [];
