/* Dynamic keyboard window: per-bar octave windows, move warnings, many-moves notice.
   For every bar, pick the octave-aligned window (C to C) that covers the most notes you play in that bar.
   Ties: keep the current window if it is one of the best (avoids needless moves), else take the highest. */
'use strict';

const BAR_SLACK = 0.03;   // a note starting a hair before a bar line (humanised MIDI) belongs to that bar
S.windows = []; S.winChanges = []; S.bars = [];
function barTimes() {
  let bars = (S.song.beats || []).filter(b => b.bar).map(b => b.t);
  if (bars.length < 2) { bars = []; for (let t = 0; t <= S.song.duration + 2; t += 2) bars.push(t); }  // no bar info: 2 s blocks
  return bars;
}
function idxAt(arr, t, key) { let lo = 0, hi = arr.length - 1; if (hi < 0 || (key ? arr[0][key] : arr[0]) > t) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if ((key ? arr[m][key] : arr[m]) <= t) lo = m; else hi = m - 1; } return lo; }
function computeWindows() {
  S.windows = []; S.winChanges = []; S.bars = [];
  if (!S.song || !S.winOn || S.listen) return;
  const size = S.winOct * 12, bars = barTimes();
  const play = S.song.notes.filter(n => n.p.mode === 'play');
  if (!play.length) return;
  S.bars = bars;
  const groups = bars.map(() => []);
  for (const n of play) groups[Math.max(0, idxAt(bars, n.start + BAR_SLACK))].push(n.pitch);
  const maxLo = Math.floor((127 - size) / 12) * 12;
  const per = new Array(bars.length).fill(null);
  let prev = null;
  for (let i = 0; i < bars.length; i++) {
    const ps = groups[i]; if (!ps.length) continue;
    let best = -1, cands = [];
    for (let lo = 0; lo <= maxLo; lo += 12) {
      let c = 0; for (const p of ps) if (p >= lo && p <= lo + size) c++;
      if (c > best) { best = c; cands = [lo]; } else if (c === best) cands.push(lo);
    }
    per[i] = prev != null && cands.includes(prev) ? prev : Math.max(...cands);
    prev = per[i];
  }
  let cur = per.find(v => v != null);
  for (let i = 0; i < per.length; i++) { if (per[i] == null) per[i] = cur; else cur = per[i]; }
  S.windows.push({ t: -Infinity, lo: per[0], hi: per[0] + size, bar: 0 });
  for (let i = 1; i < per.length; i++) if (per[i] !== per[i - 1]) {
    const w = { t: bars[i], lo: per[i], hi: per[i] + size, bar: i, warnT: bars[Math.max(0, i - 4)], up: per[i] > per[i - 1] };
    S.windows.push(w); S.winChanges.push(w);
  }
}
// Warn (top right) when a song needs many moves: 3+ moves and on average one every 8 bars or more often.
function updateWinWarn() {
  const el = $('#winWarn'), moves = S.winChanges.length, bars = S.bars.length;
  if (!S.winOn || S.listen || moves < 3 || moves * 8 <= bars) { el.hidden = true; return; }
  el.textContent = moves + ' keyboard moves in ' + bars + ' bars';
  el.hidden = false;
}
function windowAt(t) { const i = idxAt(S.windows, t, 't'); return i < 0 ? null : S.windows[i]; }
const winName = w => noteName(w.lo) + ' – ' + noteName(w.hi);
function windowBanner() {
  if (!S.song || !S.windows.length || S.finished) return null;
  const t = S.songTime;
  if (!S.started || t < S.firstStart) return { text: 'Set your keyboard to ' + winName(windowAt(Math.max(t, S.firstStart) + BAR_SLACK)), color: '#e6e6e6' };
  const next = S.winChanges.find(w => w.t > t);
  if (next && t >= next.warnT) {
    const left = Math.max(1, next.bar - idxAt(S.bars, t));
    return { text: 'Move keyboard ' + (next.up ? 'up ↑' : 'down ↓') + ' to ' + winName(next) + ' in ' + left + ' bar' + (left > 1 ? 's' : ''), color: '#ffd166', next };
  }
  const i = idxAt(S.winChanges, t, 't'), last = i >= 0 ? S.winChanges[i] : null;
  if (last && t - last.t < 1.5 * S.speed) return { text: 'Keyboard now: ' + winName(last), color: '#4ee38b' };
  return null;
}
