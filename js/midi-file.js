/* Standard MIDI file parser: tracks, tempo map, parts, bar/beat grid */
'use strict';

const GM_FAMILY = ['Piano','Chromatic perc.','Organ','Guitar','Bass','Strings','Ensemble','Brass','Reed','Pipe','Synth lead','Synth pad','Synth FX','Ethnic','Percussive','SFX'];

function parseMidi(buf, name) {
  const d = new DataView(buf); let pos = 0;
  const u8 = () => d.getUint8(pos++);
  const u16 = () => { const v = d.getUint16(pos); pos += 2; return v; };
  const u32 = () => { const v = d.getUint32(pos); pos += 4; return v; };
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(pos + i)); pos += n; return s; };
  const vlq = () => { let v = 0, b, i = 0; do { b = u8(); v = (v << 7) | (b & 0x7f); } while ((b & 0x80) && ++i < 4); return v; };

  // locate header (some files have a RIFF wrapper)
  let start = 0;
  for (let i = 0; i + 4 <= Math.min(d.byteLength, 256); i++) {
    if (d.getUint32(i) === 0x4d546864) { start = i; break; }
    if (i === Math.min(d.byteLength, 256) - 4) throw new Error('Not a standard MIDI file');
  }
  pos = start + 4;
  const hlen = u32(); const format = u16(), ntrks = u16(), division = u16();
  pos = start + 8 + hlen;

  const tracks = [], tempos = [], sigs = [];
  while (tracks.length < ntrks && pos + 8 <= d.byteLength) {
    const id = str(4), len = u32(), end = Math.min(d.byteLength, pos + len);
    if (id !== 'MTrk') { pos = end; continue; }
    const tr = { name: '', notes: [], progs: {}, channels: new Set(), lastTick: 0 };
    const open = new Map();
    let tick = 0, running = 0;
    try {
      while (pos < end) {
        tick += vlq();
        let b = d.getUint8(pos);
        if (b & 0x80) pos++;
        else { if (!running) throw new Error('bad running status'); b = running; }
        if (b === 0xFF) {
          const type = u8(), l = vlq(), ds = pos;
          if (type === 0x51 && l >= 3) tempos.push({ tick, uspq: (d.getUint8(ds) << 16) | (d.getUint8(ds + 1) << 8) | d.getUint8(ds + 2) });
          else if (type === 0x58 && l >= 2) sigs.push({ tick, num: d.getUint8(ds), den: Math.pow(2, d.getUint8(ds + 1)) });
          else if (type === 0x03 && !tr.name) tr.name = str(l).replace(/\0/g, '').trim();
          else if (type === 0x2F) { pos = ds + l; break; }
          pos = ds + l;
        } else if (b === 0xF0 || b === 0xF7) {
          pos += vlq();
        } else {
          running = b;
          const type = b & 0xF0, ch = b & 0x0F;
          const a = u8(), c = (type === 0xC0 || type === 0xD0) ? 0 : u8();
          if (type === 0x90 && c > 0) {
            const k = ch * 128 + a; if (!open.has(k)) open.set(k, []);
            open.get(k).push({ tick, vel: c });
          } else if (type === 0x80 || (type === 0x90 && c === 0)) {
            const q = open.get(ch * 128 + a);
            if (q && q.length) { const o = q.shift(); tr.notes.push({ ch, pitch: a, t0: o.tick, t1: tick, vel: o.vel }); tr.channels.add(ch); }
          } else if (type === 0xC0) {
            if (tr.progs[ch] == null) tr.progs[ch] = a;
          }
        }
      }
    } catch (e) { /* truncated track: keep what we have */ }
    for (const [k, q] of open) for (const o of q) { tr.notes.push({ ch: k >> 7, pitch: k & 127, t0: o.tick, t1: Math.max(tick, o.tick + 1), vel: o.vel }); tr.channels.add(k >> 7); }
    tr.lastTick = tick;
    tracks.push(tr);
    pos = end;
  }

  // ticks -> seconds
  let toSec;
  if (division & 0x8000) {
    const fps = 256 - (division >> 8), tpf = division & 0xff;
    toSec = tick => tick / (fps * tpf);
  } else {
    const ppq = division || 480;
    tempos.sort((a, b) => a.tick - b.tick);
    const segs = [{ tick: 0, sec: 0, uspq: 500000 }];
    for (const t of tempos) {
      const L = segs[segs.length - 1];
      if (t.tick === L.tick) { L.uspq = t.uspq; continue; }
      segs.push({ tick: t.tick, sec: L.sec + (t.tick - L.tick) * L.uspq / 1e6 / ppq, uspq: t.uspq });
    }
    toSec = tick => {
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (segs[m].tick <= tick) lo = m; else hi = m - 1; }
      const s = segs[lo]; return s.sec + (tick - s.tick) * s.uspq / 1e6 / ppq;
    };
  }

  // parts: one per track+channel
  const parts = [], notes = [];
  let lastTick = 0;
  tracks.forEach((tr, ti) => {
    const chs = [...tr.channels].sort((a, b) => a - b);
    for (const ch of chs) {
      const id = ti + ':' + ch;
      const prog = tr.progs[ch];
      let nm = tr.name || ('Track ' + (ti + 1));
      if (chs.length > 1) nm += ' · ch ' + (ch + 1);
      if (!tr.name && ch !== 9 && prog != null) nm += ' (' + GM_FAMILY[prog >> 3] + ')';
      parts.push({ id, name: nm, isDrum: ch === 9 });
    }
    for (const n of tr.notes) {
      lastTick = Math.max(lastTick, n.t1);
      notes.push({ pitch: n.pitch, start: toSec(n.t0), end: toSec(n.t1), vel: n.vel, part: ti + ':' + n.ch });
    }
  });
  if (!notes.length) throw new Error('This MIDI file contains no notes');

  // beat & bar grid
  const beats = [];
  if (!(division & 0x8000)) {
    const ppq = division || 480;
    sigs.sort((a, b) => a.tick - b.tick);
    if (!sigs.length || sigs[0].tick > 0) sigs.unshift({ tick: 0, num: 4, den: 4 });
    let tick = 0, beat = 0, bar = 1, si = 0, cur = sigs[0];
    while (tick <= lastTick && beats.length < 40000) {
      while (si + 1 < sigs.length && sigs[si + 1].tick <= tick) { si++; cur = sigs[si]; if (beat) { beat = 0; bar++; } }
      beats.push({ t: toSec(tick), bar: beat === 0, num: bar });
      tick += ppq * 4 / (cur.den || 4);
      if (++beat >= (cur.num || 4)) { beat = 0; bar++; }
    }
  }
  return finalizeSong({ name, parts, notes, beats, format });
}
