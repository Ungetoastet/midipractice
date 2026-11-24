/* Built-in songs and song post-processing (part stats, colours, default part modes) */
'use strict';

function buildSong(name, bpm, perBar, defs) {
  const spb = 60 / bpm, parts = [], notes = []; let maxBeat = 0;
  defs.forEach((pd, i) => {
    parts.push({ id: 'b' + i, name: pd.name, isDrum: false });
    let b = pd.offset || 0;
    for (const [ps, len] of pd.seq) {
      if (ps != null) for (const p of [].concat(ps)) notes.push({ pitch: p, start: b * spb, end: (b + len * 0.9) * spb, vel: 90, part: 'b' + i });
      b += len;
    }
    maxBeat = Math.max(maxBeat, b);
  });
  const beats = [];
  for (let b = 0; b <= maxBeat; b++) beats.push({ t: b * spb, bar: b % perBar === 0, num: Math.floor(b / perBar) + 1 });
  return finalizeSong({ name, parts, notes, beats });
}
const BUILTIN = {
  scale: () => {
    const up = [60, 62, 64, 65, 67, 69, 71, 72], seq = [...up, ...up.slice(0, -1).reverse()];
    return buildSong('C major scale (warm-up)', 80, 4, [
      { name: 'Right hand', seq: [...seq.map(p => [p, 1]), [null, 1]] },
      { name: 'Left hand', offset: 16, seq: [...seq.map(p => [p - 12, 1]), [null, 1]] },
    ]);
  },
  triads: () => {
    const C = [60, 64, 67], F = [60, 65, 69], G = [59, 62, 67];
    const prog = [[C, 2], [F, 2], [G, 2], [C, 2]];
    return buildSong('Triads: C – F – G – C', 84, 4, [
      { name: 'Right hand', seq: [...prog, ...prog, [C, 4]] },
      { name: 'Left hand', seq: [[48, 2], [41, 2], [43, 2], [48, 2], [48, 2], [41, 2], [43, 2], [48, 2], [36, 4]] },
    ]);
  },
  ode: () => {
    const C = 60, D = 62, E = 64, F = 65, G = 67, G3 = 55;
    const A = [[E,1],[E,1],[F,1],[G,1],[G,1],[F,1],[E,1],[D,1],[C,1],[C,1],[D,1],[E,1]];
    const end1 = [[E,1.5],[D,.5],[D,2]], end2 = [[D,1.5],[C,.5],[C,2]];
    const B = [[D,1],[D,1],[E,1],[C,1],[D,1],[E,.5],[F,.5],[E,1],[C,1],[D,1],[E,.5],[F,.5],[E,1],[D,1],[C,1],[D,1],[G3,2]];
    const c3 = 48, g2 = 43;
    const lhA = [[c3,4],[g2,4],[c3,4],[g2,4]], lhA2 = [[c3,4],[g2,4],[c3,4],[g2,2],[c3,2]];
    return buildSong('Ode to Joy (Beethoven)', 100, 4, [
      { name: 'Right hand (melody)', seq: [...A, ...end1, ...A, ...end2, ...B, ...A, ...end2] },
      { name: 'Left hand (bass)', seq: [...lhA, ...lhA2, [g2,4],[c3,4],[g2,4],[g2,4], ...lhA2] },
    ]);
  },
};

function finalizeSong(song) {
  const notes = song.notes;
  notes.forEach(n => { if (n.end - n.start < 0.06) n.end = n.start + 0.06; });
  const st = new Map();
  for (const n of notes) {
    let s = st.get(n.part); if (!s) { s = { count: 0, min: 127, max: 0 }; st.set(n.part, s); }
    s.count++; s.min = Math.min(s.min, n.pitch); s.max = Math.max(s.max, n.pitch);
  }
  song.parts = song.parts.filter(p => st.has(p.id)).map((p, i) => Object.assign(p, st.get(p.id), { hue: HUES[i % HUES.length] }));
  const pm = new Map(song.parts.map(p => [p.id, p]));
  notes.forEach(n => { n.p = pm.get(n.part); });
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  song.duration = Math.max(...notes.map(n => n.end));
  song.maxDur = Math.max(...notes.map(n => n.end - n.start));
  // default part modes
  const mel = song.parts.filter(p => !p.isDrum);
  song.parts.forEach(p => { p.mode = p.isDrum ? 'mute' : (mel.length <= 2 ? 'play' : 'auto'); });
  if (mel.length > 2) mel.reduce((a, b) => (b.count > a.count ? b : a)).mode = 'play';
  if (!mel.length && song.parts.length) song.parts[0].mode = 'play';
  return song;
}
