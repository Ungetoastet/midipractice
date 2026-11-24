/* Top bar numbers: score, accuracy, combo, notes, last rating, progress */
'use strict';

const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; document.getElementById(id).textContent = v; } }
function updateHud() {
  setText('score', Math.round(S.shown).toLocaleString());
  setText('scoreMax', 'of ' + (S.total * 100).toLocaleString());
  setText('acc', S.finalized ? (S.score / (S.finalized * 100) * 100).toFixed(1) + '%' : '—');
  setText('combo', S.combo ? '×' + S.combo : '0');
  setText('notesCount', (S.finalized + holding.size) + ' / ' + S.total);
  const j = S.lastJudge;
  const lastEl = $('#last');
  if (hudCache.lastJ !== j) { hudCache.lastJ = j; lastEl.textContent = j ? j.label : '—'; lastEl.style.color = j ? j.color : ''; }
  if (S.song) {
    const span = Math.max(0.01, S.songEnd - S.firstStart);
    const w = clamp((S.songTime - S.firstStart) / span, 0, 1) * 100;
    const ws = w.toFixed(1) + '%';
    if (hudCache.prog !== ws) { hudCache.prog = ws; $('#progressFill').style.width = ws; }
  }
}
