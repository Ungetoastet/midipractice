/* Canvas: layout, key geometry, drawing helpers and the falling-notes play field */
'use strict';

const cv = $('#cv'), ctx = cv.getContext('2d'), stage = $('#stage');
let whiteGrad, blackGrad;

function layout() {
  const r = stage.getBoundingClientRect();
  S.W = r.width; S.H = r.height; S.dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr);
  S.kbH = clamp(S.H * 0.2, 80, 170);
  S.kbY = S.H - S.kbH;
  S.lineY = S.kbY;   // the hit line sits at the bottom, right on top of the keyboard
  const top = S.kbY + 4;
  whiteGrad = ctx.createLinearGradient(0, top, 0, S.H);
  whiteGrad.addColorStop(0, '#e9e9e9'); whiteGrad.addColorStop(0.12, '#fbfbfb'); whiteGrad.addColorStop(1, '#d6d6d6');
  blackGrad = ctx.createLinearGradient(0, top, 0, top + S.kbH * 0.62);
  blackGrad.addColorStop(0, '#161616'); blackGrad.addColorStop(0.85, '#2c2c2c'); blackGrad.addColorStop(1, '#3b3b3b');
  layoutKeys();
}
function layoutKeys() {
  S.keys = {}; S.keyList = [];
  const whites = [];
  for (let p = S.lo; p <= S.hi; p++) if (!isBlack(p)) whites.push(p);
  const ww = S.W / Math.max(1, whites.length), bw = ww * 0.6;
  whites.forEach((p, i) => { const k = { p, x: i * ww, w: ww, black: false }; S.keys[p] = k; S.keyList.push(k); });
  const OFF = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
  for (let p = S.lo; p <= S.hi; p++) if (isBlack(p)) {
    const L = S.keys[p - 1]; if (!L) continue;
    const k = { p, x: L.x + ww - bw / 2 + OFF[p % 12] * ww, w: bw, black: true };
    S.keys[p] = k; S.keyList.push(k);
  }
}

function rr(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function keyPath(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.closePath();
}
function lowerBound(arr, t) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].start < t) lo = m + 1; else hi = m; } return lo; }

function render() {
  const W = S.W, H = S.H; if (!W || !H) return;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  const kbY = S.kbY, lineY = S.lineY, pps = lineY / S.look, t0 = S.songTime;
  const yOf = t => lineY - (t - t0) * pps;

  ctx.fillStyle = '#242424'; ctx.fillRect(0, 0, W, kbY);
  // lanes: black-key columns a touch darker
  ctx.fillStyle = '#1d1d1d';
  for (const k of S.keyList) if (k.black) ctx.fillRect(k.x, 0, k.w, kbY);
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  for (const k of S.keyList) if (!k.black && (k.p % 12 === 0 || k.p % 12 === 5)) ctx.fillRect(Math.round(k.x), 0, 1, kbY);

  const active = new Map();
  if (S.song) {
    const tMin = t0 - (kbY - lineY) / pps, tMax = t0 + lineY / pps;
    // beat / bar lines
    ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    for (const b of S.song.beats) {
      if (b.t < tMin) continue; if (b.t > tMax) break;
      const y = Math.round(yOf(b.t)) + 0.5;
      ctx.fillStyle = b.bar ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.035)';
      ctx.fillRect(0, y, W, 1);
      if (b.bar) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillText(b.num, 4, y - 2); }
    }
    // keyboard-window change markers
    if (S.winChanges.length) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = '600 11px system-ui,sans-serif';
      for (const w of S.winChanges) {
        if (w.t < tMin || w.t > tMax) continue;
        const y = Math.round(yOf(w.t));
        ctx.fillStyle = 'rgba(255,209,102,0.85)';
        for (let x = 0; x < W; x += 14) ctx.fillRect(x, y - 1, 8, 2);
        ctx.fillText('Keyboard ' + (w.up ? '↑ ' : '↓ ') + winName(w), W - 8, y - 4);
      }
    }
    // notes
    const notes = S.song.notes;
    ctx.textAlign = 'center';
    for (let i = lowerBound(notes, tMin - S.song.maxDur); i < notes.length; i++) {
      const n = notes[i]; if (n.start > tMax) break;
      const part = n.p; if (part.mode === 'mute') continue;
      const k = S.keys[n.pitch]; if (!k) continue;
      const yB = yOf(n.start), yT = yOf(n.end);
      if (yT > lineY || yB < 0) continue;
      const atLine = n.start <= t0 + 0.015 && n.end > t0;
      const accompaniment = part.mode === 'auto' || n.out;
      if (atLine && (n.state === 'pending' || n.holding || n.state === 'auto')) {
        const byGame = n.state === 'auto' || accompaniment, prev = active.get(n.pitch);
        if (!prev || (prev.byGame && !byGame)) active.set(n.pitch, { hue: part.hue, byGame });
      }
      const pad = k.black ? 1 : 2.5, x = k.x + pad, w = k.w - pad * 2;
      const y = Math.max(-4, yT), h = Math.max(3, Math.min(yB, lineY) - y);
      const hue = part.hue, light = k.black ? 46 : 60;
      let fill, alpha = 1;
      if (n.state === 'skip') { fill = `hsl(${hue},20%,35%)`; alpha = 0.18; }
      else if (n.state === 'miss') { fill = 'rgb(190,60,80)'; alpha = 0.5; }
      else if (n.holding) fill = `hsl(${hue},90%,74%)`;
      else if (n.state === 'hit') { fill = `hsl(${hue},70%,${light}%)`; alpha = 0.32; }
      else if (accompaniment) { fill = `hsl(${hue},30%,${light - 12}%)`; alpha = n.state === 'auto' && atLine ? 0.75 : 0.45; }
      else fill = n.state === 'auto' && atLine ? `hsl(${hue},90%,74%)` : `hsl(${hue},82%,${light}%)`;
      if (n.out && n.state !== 'skip') { fill = `hsl(${hue},70%,${light}%)`; alpha = 0.25; }   // outside keyboard window
      ctx.globalAlpha = alpha;
      rr(x, y, w, h, Math.min(5, w / 3));
      ctx.fillStyle = fill; ctx.fill();
      if (S.names && (!accompaniment || n.out) && w >= 13 && h >= 15 && n.state !== 'skip') {
        const fs = Math.min(12, Math.max(8, w * 0.42));
        ctx.font = `700 ${fs}px system-ui,sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        const label = w >= 24 ? noteName(n.pitch) : NAMES[n.pitch % 12];
        ctx.fillText(label, x + w / 2, Math.min(yB, lineY) - 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  // hit line (bottom of the play field, on top of the keyboard)
  for (const [p, a] of active) {
    const k = S.keys[p]; if (!k || a.byGame) continue;
    ctx.fillStyle = `hsla(${a.hue},90%,65%,0.35)`; ctx.fillRect(k.x, lineY - 8, k.w, 8);
  }
  const lw = 3 + Math.round(2 * S.pulse), cw = S.windows.length ? windowAt(S.songTime + BAR_SLACK) : null;
  if (cw) {
    const span = keySpan(cw.lo, cw.hi);
    ctx.fillStyle = 'rgba(235,235,235,0.18)'; ctx.fillRect(0, lineY - 2, W, lw);
    if (span) { ctx.fillStyle = `rgba(235,235,235,${0.75 + 0.25 * S.pulse})`; ctx.fillRect(span[0], lineY - 2, span[1] - span[0], lw); }
  } else {
    ctx.fillStyle = `rgba(235,235,235,${0.75 + 0.25 * S.pulse})`;
    ctx.fillRect(0, lineY - 2, W, lw);
  }

  // rating popups (text only)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 17px system-ui,sans-serif';
  for (const p of popups) {
    ctx.globalAlpha = clamp(p.life * 1.6, 0, 1);
    ctx.fillStyle = p.color; ctx.fillText(p.text, clamp(p.x, 40, W - 40), p.y);
  }
  ctx.globalAlpha = 1;

  // keyboard-window banner (start position, 4-bar warning, confirmation)
  const ban = windowBanner();
  if (ban) {
    ctx.font = '600 14px system-ui,sans-serif';
    const tw = ctx.measureText(ban.text).width + 32, bx = (W - tw) / 2, by = 14;
    ctx.fillStyle = 'rgba(30,30,30,0.95)'; rr(bx, by, tw, 32, 8); ctx.fill();
    ctx.strokeStyle = ban.color; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = ban.color; ctx.fillText(ban.text, W / 2, by + 16.5);
  }

  // status text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (S.waiting && S.playing) {
    const need = [...new Set(chordOf(S.waiting).map(n => noteName(n.pitch)))];
    ctx.font = '600 13px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,209,102,.95)';
    ctx.fillText((need.length > 1 ? 'Play together: ' : 'Waiting for you: ') + need.join('  '), W / 2, lineY - 84);
  }
  if (!S.playing && S.song && !S.finished) {
    ctx.font = '700 22px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(S.started ? 'Paused' : 'Ready', W / 2, lineY * 0.42);
    ctx.font = '500 14px system-ui,sans-serif'; ctx.fillStyle = 'rgba(210,210,210,.8)';
    ctx.fillText('Press Space to ' + (S.started ? 'resume' : 'start'), W / 2, lineY * 0.42 + 26);
  }
  if (!S.song) {
    ctx.font = '600 16px system-ui,sans-serif'; ctx.fillStyle = 'rgba(210,210,210,.8)';
    ctx.fillText('Open a MIDI file or pick a built-in song', W / 2, lineY * 0.42);
  }

  drawKeyboard(active);
}
