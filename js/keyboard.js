/* On-screen piano: computer-key labels, key drawing, window shading, hit testing */
'use strict';

const PC_CODES = ['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon','Quote'];
let pcLabels = ['A','W','S','E','D','F','T','G','Y','H','U','J','K','O','L','P',';',"'"];
try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { pcLabels = PC_CODES.map((c, i) => (m.get(c) || pcLabels[i]).toUpperCase()); }).catch(() => {}); } catch (e) {}
const GAME_KEY = '#3b9eff';   // outline for keys the game is playing (Listen / accompaniment)
function keySpan(lo, hi) {
  let a = Infinity, b = -Infinity;
  for (let p = lo; p <= hi; p++) { const k = S.keys[p]; if (k && !k.black) { a = Math.min(a, k.x); b = Math.max(b, k.x + k.w); } }
  return a < b ? [a, b] : null;
}
function drawKeyboard(active) {
  const W = S.W, H = S.H, kbY = S.kbY, top = kbY + 4, kh = H - top;
  ctx.fillStyle = '#0e0e0e'; ctx.fillRect(0, kbY, W, H - kbY);
    const pcMap = {};
  if (S.pcHints && S.letters) PC_CODES.forEach((c, i) => { pcMap[S.pcBase + i] = pcLabels[i]; });
  const cw = S.windows.length ? windowAt(S.songTime + BAR_SLACK) : null;
  const pressedColor = d => d.ok === true ? '#4ee38b' : d.ok === false ? '#ff6b7d' : '#b5b5b5';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const k of S.keyList) {
    if (k.black) continue;
    const d = down.get(k.p), a = active.get(k.p);
    keyPath(k.x + 0.75, top, k.w - 1.5, kh - 2, Math.min(5, k.w / 4));
    const target = a && !a.byGame;
    ctx.fillStyle = d ? pressedColor(d) : target ? `hsl(${a.hue},85%,72%)` : whiteGrad;
    ctx.fill();
    if (cw && (k.p < cw.lo || k.p > cw.hi)) { ctx.fillStyle = 'rgba(12,12,12,0.55)'; ctx.fill(); }
    if (a && a.byGame && !d) { keyPath(k.x + 2.5, top + 1.5, k.w - 5, kh - 5.5, Math.min(4, k.w / 4)); ctx.strokeStyle = GAME_KEY; ctx.lineWidth = 3; ctx.stroke(); }
    if (k.w >= 15 && k.p % 12 === 0) { ctx.font = '600 10px system-ui,sans-serif'; ctx.fillStyle = '#888888'; ctx.fillText(noteName(k.p), k.x + k.w / 2, H - 8); }
    if (pcMap[k.p] && k.w >= 14) { ctx.font = '700 11px ui-monospace,monospace'; ctx.fillStyle = '#6e6e6e'; ctx.fillText(pcMap[k.p], k.x + k.w / 2, H - (k.p % 12 === 0 && k.w >= 15 ? 22 : 9)); }
  }
  const bh = kh * 0.62;
  for (const k of S.keyList) {
    if (!k.black) continue;
    const d = down.get(k.p), a = active.get(k.p);
    keyPath(k.x, top, k.w, bh, Math.min(3, k.w / 4));
    const target = a && !a.byGame;
    ctx.fillStyle = d ? pressedColor(d) : target ? `hsl(${a.hue},80%,50%)` : blackGrad;
    ctx.fill();
    if (cw && (k.p < cw.lo || k.p > cw.hi)) { ctx.fillStyle = 'rgba(12,12,12,0.45)'; ctx.fill(); }
    if (a && a.byGame && !d) { keyPath(k.x + 1.5, top + 1, k.w - 3, bh - 2.5, Math.min(3, k.w / 4)); ctx.strokeStyle = GAME_KEY; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (!d && !target) { ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(k.x + k.w * 0.2, top + 2, k.w * 0.6, bh * 0.75); }
    if (pcMap[k.p] && k.w >= 10) { ctx.font = '700 10px ui-monospace,monospace'; ctx.fillStyle = '#a6a6a6'; ctx.fillText(pcMap[k.p], k.x + k.w / 2, top + bh - 7); }
  }
  // upcoming window: amber bar along the bottom of the keys it will cover
  const ban = windowBanner();
  if (ban && ban.next) {
    const span = keySpan(ban.next.lo, ban.next.hi);
    if (span) {
      ctx.fillStyle = '#ffd166'; ctx.fillRect(span[0] + 1, H - 5, span[1] - span[0] - 2, 5);
      // how many octaves to shift, e.g. +1 / −2, in a tag sitting on the bar
      const from = windowAt(S.songTime + BAR_SLACK), oct = Math.round((ban.next.lo - from.lo) / 12);
      const txt = (oct > 0 ? '+' : '−') + Math.abs(oct);
      ctx.font = '800 13px system-ui,sans-serif';
      const tw = Math.max(30, ctx.measureText(txt).width + 14), tx = (span[0] + span[1]) / 2 - tw / 2;
      rr(tx, H - 25, tw, 22, 5); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, tx + tw / 2, H - 13.5);
    }
  }
}

function pitchAt(x, y) {
  const top = S.kbY + 4; if (y < top) return null;
  if (y < top + (S.H - top) * 0.62) for (const k of S.keyList) if (k.black && x >= k.x && x < k.x + k.w) return k.p;
  for (const k of S.keyList) if (!k.black && x >= k.x && x < k.x + k.w) return k.p;
  return null;
}
