/* Key input and scoring: matching presses to notes, chords, holds, misses, rating popups */
'use strict';

const CHORD_EPS = 0.06;   // notes starting within 60 ms of each other (song time) form one chord
// timing of a key press against a note: dt = seconds off (real time), early > 0 means before the note
function pressTiming(n, ts, st) {
  const early = n.start - st;
  const dt = early > 0 ? early / S.speed
    : (n.reachedReal != null ? Math.max(0, (ts - n.reachedReal) / 1000) : -early / S.speed);
  return { dt, early };
}
// unplayed notes you play (inside the keyboard window) that start together with n
function chordOf(n) {
  const L = S.playList, out = [];
  for (let i = S.pendIdx; i < L.length && L[i].start <= n.start + CHORD_EPS; i++)
    if (L[i].state === 'pending' && L[i].start >= n.start - CHORD_EPS) out.push(L[i]);
  return out;
}
function noteOn(p, vel = 100, ts = performance.now()) {
  if (S.sound) { Synth.resume(); Synth.on('u' + p, p, vel); }
  Synth.sustained.delete(p);
  const d = { ok: null, ts, st: null, used: false }; down.set(p, d);   // used: this press already counted for a note
  if (!S.song || !S.playing || S.listen) return;
  const st = songTimeAt(ts); d.st = st;
  const prev = holding.get(p); if (prev) finishHold(prev, st);
  let best = null, bestDt = Infinity, bestEarly = false;
  const L = S.playList, lim = st + WINDOW * S.speed + 1e-4;
  for (let i = S.pendIdx; i < L.length; i++) {
    const n = L[i]; if (n.start > lim) break;
    if (n.state !== 'pending' || n.pitch !== p) continue;
    const { dt, early } = pressTiming(n, ts, st);
    if ((dt <= WINDOW || (S.waitMode && early <= 0)) && dt < bestDt) { best = n; bestDt = dt; bestEarly = early > 0; }
  }
  if (!best) { if (st >= S.firstStart - WINDOW * S.speed) { d.ok = false; wrong(p); } return; }
  d.ok = true;
  if (!S.waitMode) { d.used = true; hit(best, bestDt, bestEarly, st); return; }
  // Wait for me: a chord only counts when all of its notes are held down at the same time.
  // Each key must be a fresh press (not one already used for an earlier note) and not too early.
  const ready = chordOf(best).map(n => {
    const k = down.get(n.pitch);
    if (!k || k.used || k.st == null) return null;
    const t = pressTiming(n, k.ts, k.st);
    return t.early / S.speed > WINDOW ? null : { n, k, t };
  });
  if (ready.every(Boolean)) for (const r of ready) { r.k.used = true; hit(r.n, r.t.dt, r.t.early > 0, r.k.st); }
}
function noteOff(p, ts = performance.now()) {
  down.delete(p);
  if (Synth.sustain) Synth.sustained.add(p); else Synth.off('u' + p);
  const n = holding.get(p); if (n) finishHold(n, songTimeAt(ts));
}

function hit(n, dt, early, st) {
  n.state = 'hit';
  n.timing = timingScore(dt);
  const j = judgeOf(n.timing);
  S.counts[j.key]++; S.combo++; S.bestCombo = Math.max(S.bestCombo, S.combo); S.lastJudge = j;
  bumpCombo();
  addPopup(n.pitch, j.label, j.color);
  S.pulse = 1;
  if ((n.end - n.start) / S.speed >= HOLD_MIN) { n.holding = true; holding.set(n.pitch, n); }
  else finalize(n, n.timing);
  advancePend();
}
function finishHold(n, st) {
  holding.delete(n.pitch); n.holding = false;
  // releasing a little early (normal legato / re-articulation) still counts as a full hold
  const frac = clamp((st - n.start) / ((n.end - n.start) * 0.85), 0, 1);
  n.holdFrac = frac;
  finalize(n, Math.round(n.timing * (0.7 + 0.3 * frac)));
}
function finalize(n, score) {
  n.final = score; S.score += score; S.finalized++;
}
function miss(n) {
  n.state = 'miss'; n.final = 0; S.finalized++; S.counts.miss++; S.combo = 0; S.lastJudge = MISS;
  addPopup(n.pitch, 'Miss', MISS.color);
  advancePend();
}
function wrong(p) {
  S.counts.wrong++; S.combo = 0;
}

/* ---------- effects ---------- */
function laneX(p) { const k = S.keys[p]; return k ? k.x + k.w / 2 : S.W / 2; }
function addPopup(p, text, color) {
  popups.push({ x: laneX(p), y: S.lineY - 30, text, color, life: 1 });
  if (popups.length > 40) popups.shift();
}
let comboEl;
function bumpCombo() { comboEl = comboEl || $('#combo'); comboEl.classList.remove('bump'); void comboEl.offsetWidth; comboEl.classList.add('bump'); }
