/* Game flow: load / restart / play-pause, song clock, main loop, end-of-song results */
'use strict';

function loadSong(song) {
  Synth.allOff();
  S.song = song;
  $('#curSong').textContent = song.name;
  $('#builtin').value = ''; $('#builtin').title = song.name;
  $('#results').classList.add('hidden');
  renderParts();
  computeRange();
  restart();
  toast('Loaded “' + song.name + '” — ' + song.notes.length + ' notes. Press Space to start.');
}

function computeRange() {
  if (S.rangeMode === '88') { S.lo = 21; S.hi = 108; }
  else if (S.rangeMode === '61') { S.lo = 36; S.hi = 96; }
  else {
    let mn = 127, mx = 0;
    if (S.song) {
      let src = S.song.notes.filter(n => n.p.mode === 'play');
      if (!src.length) src = S.song.notes.filter(n => n.p.mode !== 'mute');
      for (const n of src) { mn = Math.min(mn, n.pitch); mx = Math.max(mx, n.pitch); }
    }
    if (mn > mx) { mn = 48; mx = 83; }
    let lo = Math.floor(mn / 12) * 12, hi = Math.floor(mx / 12) * 12 + 11;
    let flip = true;
    while (hi - lo + 1 < 36) { if (flip && lo >= 24) lo -= 12; else hi += 12; flip = !flip; }
    S.lo = Math.max(21, lo); S.hi = Math.min(108, hi);
  }
  // PC keyboard base: C at or below the lowest played note
  if (S.song) {
    const pl = S.song.notes.filter(n => n.p.mode === 'play');
    if (pl.length) S.pcBase = clamp(Math.floor(Math.min(...pl.map(n => n.pitch)) / 12) * 12, 24, 96);
  }
  updateOct();
  layoutKeys();
}

function restart(from = null) {
  S.playing = false; S.finished = false; S.started = false; S.waiting = null;
  for (const n of holding.values()) n.holding = false;
  holding.clear(); Synth.allOff();
  S.score = 0; S.shown = 0; S.finalized = 0; S.combo = 0; S.bestCombo = 0; S.lastJudge = null;
  S.counts = { perfect: 0, great: 0, good: 0, okay: 0, miss: 0, wrong: 0 };
  popups = [];
  if (!S.song) { updatePlayBtn(); return; }
  const notes = S.song.notes;
  // dynamic keyboard window: computed once, before the song starts
  computeWindows();
  updateWinWarn();
  for (const n of notes) {
    const w = n.p.mode === 'play' && S.windows.length ? windowAt(n.start + BAR_SLACK) : null;
    n.out = !!w && (n.pitch < w.lo || n.pitch > w.hi);   // outside the window: dimmed, auto-played, not scored
  }
  const isPlay = n => n.p.mode === 'play' && !S.listen && !n.out;
  const isAuto = n => n.p.mode === 'auto' || (n.p.mode === 'play' && (S.listen || n.out));
  const ref = notes.filter(isPlay).length ? notes.filter(isPlay) : notes.filter(n => n.p.mode !== 'mute');
  S.firstStart = ref.length ? ref[0].start : 0;
  S.songEnd = Math.max(0, ...notes.filter(n => n.p.mode !== 'mute').map(n => n.end));
  const startAt = from != null ? from : S.firstStart;
  S.partial = from != null && from > S.firstStart + 0.3;
  for (const n of notes) {
    n.state = n.start < startAt - 0.01 ? 'skip' : 'pending';
    n.reachedReal = null; n.timing = 0; n.final = null; n.holding = false; n.holdFrac = 1;
  }
  S.playList = notes.filter(isPlay);
  S.autoList = notes.filter(isAuto);
  S.total = S.playList.filter(n => n.state === 'pending').length;
  S.pendIdx = 0; advancePend();
  S.autoIdx = 0; while (S.autoIdx < S.autoList.length && S.autoList[S.autoIdx].state === 'skip') S.autoIdx++;
  S.songTime = startAt - (from != null ? Math.min(1.5, S.look) : S.look + 0.4);
  updatePlayBtn();
}
function togglePlay() {
  if (!S.song) { toast('Load a MIDI file or pick a built-in song first'); return; }
  if (S.finished) { restart(); }
  Synth.resume();
  S.playing = !S.playing;
  if (S.playing) { S.started = true; S.lastNow = performance.now(); $('#results').classList.add('hidden'); }
  updatePlayBtn();
}
function updatePlayBtn() { $('#playBtn').textContent = S.playing ? 'Pause' : (S.started && !S.finished ? 'Resume' : 'Start'); }

function advancePend() { const L = S.playList; while (S.pendIdx < L.length && L[S.pendIdx].state !== 'pending') S.pendIdx++; }

function songTimeAt(ts) {
  if (!S.playing) return S.songTime;
  let t = S.songTime + clamp((ts - S.lastNow) / 1000, -0.1, 0.1) * S.speed;
  if (S.waitMode && !S.listen) { const f = S.playList[S.pendIdx]; if (f && t > f.start) t = Math.max(S.songTime, f.start); }
  return t;
}
function frame(now) {
  const dt = clamp((now - S.lastNow) / 1000, 0, 0.1);
  S.lastNow = now;
  if (S.playing && S.song) step(now, dt);
  popups.forEach(p => { p.y -= 34 * dt; p.life -= dt * 1.1; });
  popups = popups.filter(p => p.life > 0);
  S.pulse = Math.max(0, S.pulse - dt * 3);
  S.shown += (S.score - S.shown) * Math.min(1, dt * 10);
  if (Math.abs(S.score - S.shown) < 0.5) S.shown = S.score;
  updateHud();
  render();
  requestAnimationFrame(frame);
}

function step(now, dt) {
  let nt = S.songTime + dt * S.speed;
  S.waiting = null;
  if (S.waitMode && !S.listen) {
    const f = S.playList[S.pendIdx];
    if (f && nt >= f.start) { nt = Math.max(S.songTime, f.start); S.waiting = f; }
  }
  S.songTime = nt;

  // notes reaching the line & misses
  const L = S.playList;
  for (let i = S.pendIdx; i < L.length; i++) {
    const n = L[i]; if (n.start > S.songTime) break;
    if (n.state !== 'pending') continue;
    if (n.reachedReal == null) n.reachedReal = now - (S.songTime - n.start) / S.speed * 1000;
    if (!S.waitMode && (now - n.reachedReal) / 1000 > WINDOW) miss(n);
  }
  advancePend();

  // holds that reached their end
  for (const n of [...holding.values()]) if (S.songTime >= n.end) finishHold(n, n.end);

  // accompaniment / listen mode
  const A = S.autoList;
  while (S.autoIdx < A.length && A[S.autoIdx].start <= S.songTime) {
    const n = A[S.autoIdx++];
    if (n.state === 'skip') continue;
    n.state = 'auto';
    Synth.on('a' + n.pitch, n.pitch, n.vel || 90, (n.end - n.start) / S.speed, n.p.mode === 'play' && !n.out ? 1 : 0.7);
  }

  // end of song
  if (S.pendIdx >= L.length && !holding.size && S.autoIdx >= A.length && S.songTime > S.songEnd + 0.8) finish();
}

function finish() {
  S.playing = false; S.finished = true; updatePlayBtn();
  if (S.listen) { toast('Finished listening — untick “Listen” to play it yourself'); return; }
  if (!S.total) return;
  const acc = S.finalized ? S.score / (S.finalized * 100) * 100 : 0;
  const grade = acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
  const c = S.counts;
  $('#rSong').textContent = S.song.name;
  $('#rGrade').textContent = grade;
  $('#rScore').textContent = S.score.toLocaleString();
  $('#rMax').textContent = '/ ' + (S.total * 100).toLocaleString();
  $('#rMode').textContent = [S.waitMode ? 'Wait-for-me mode' : '', S.winOn ? S.winOct + '-octave keyboard window' : '', S.speed !== 1 ? Math.round(S.speed * 100) + '% speed' : '', S.partial ? 'partial run' : ''].filter(Boolean).join(' · ');
  $('#rAcc').textContent = acc.toFixed(1) + '%';
  $('#rCombo').textContent = S.bestCombo;
  $('#rWrong').textContent = c.wrong;
  $('#rPerfect').textContent = c.perfect; $('#rGreat').textContent = c.great; $('#rGood').textContent = c.good;
  $('#rOkay').textContent = c.okay; $('#rMiss').textContent = c.miss; $('#rNotes').textContent = S.total;
  let bestMsg = '';
  if (!S.partial) {
    const key = 'keyfall:best:' + S.song.name + '|' + S.song.parts.map(p => p.mode[0]).join('') + (S.waitMode ? '|wait' : '') + (S.winOn ? '|w' + S.winOct : '') + '|' + Math.round(S.speed * 100);
    const best = store.get(key, null);
    if (!best || acc > best.acc) { store.set(key, { acc, score: S.score, grade }); bestMsg = best ? '★ New personal best! (was ' + best.acc.toFixed(1) + '%)' : '★ First run recorded — beat it next time!'; }
    else bestMsg = 'Personal best: ' + best.acc.toFixed(1) + '% (' + best.grade + ')';
  }
  $('#rBest').textContent = bestMsg;
  $('#results').classList.remove('hidden');
}
