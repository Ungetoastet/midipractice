/* Settings menus, parts list, keyboard / mouse / drag-and-drop input, file loading */
'use strict';

function syncSlider(inp) {
  const f = (inp.value - inp.min) / (inp.max - inp.min);
  inp.parentElement.querySelector('.fill').style.width = (f * 100) + '%';
}
function updateOct() { const o = document.getElementById('octOut'); if (o) o.textContent = noteName(S.pcBase) + ' – ' + noteName(S.pcBase + 17); }
function shiftOctave(d) {
  S.pcBase = clamp(S.pcBase + d, 12, 96); S.pcHints = true; updateOct();
  toast('Computer keys: ' + noteName(S.pcBase) + ' – ' + noteName(S.pcBase + 17), 1200);
}
function renderParts() {
  const el = $('#partsList'); el.innerHTML = '';
  if (!S.song) { el.innerHTML = '<div class="hint">No song loaded.</div>'; return; }
  for (const p of S.song.parts) {
    const row = document.createElement('div'); row.className = 'part';
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = `hsl(${p.hue},85%,58%)`;
    const nm = document.createElement('div'); nm.className = 'nm';
    const b = document.createElement('b'); b.textContent = p.name;
    const sm = document.createElement('small'); sm.textContent = `${p.count} notes · ${noteName(p.min)}–${noteName(p.max)}${p.isDrum ? ' · drums' : ''}`;
    nm.append(b, sm);
    const sel = document.createElement('select');
    for (const [v, t] of [['play', 'Play'], ['auto', 'Auto'], ['mute', 'Mute']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
    sel.value = p.mode;
    sel.onchange = () => { p.mode = sel.value; computeRange(); restart(); sel.blur(); };
    row.append(sw, nm, sel); el.appendChild(row);
  }
}

function saveSettings() { store.set('keyfall:settings', { speed: S.speed, look: S.look, waitMode: S.waitMode, sound: S.sound, names: S.names, letters: S.letters, winOn: S.winOn, winOct: S.winOct, lvol: S.lvol, rangeMode: S.rangeMode }); }

function initUi() {
  $('#speed').value = Math.round(S.speed * 100); $('#speedOut').textContent = Math.round(S.speed * 100) + '%';
  $('#look').value = S.look; $('#lookOut').textContent = S.look + ' s';
  $('#letters').checked = S.letters;
  $('#lvol').value = Math.round(S.lvol * 100); $('#lvolOut').textContent = Math.round(S.lvol * 100) + '%';
  $('#winOn').checked = S.winOn; $('#winOct').value = String(S.winOct);
  document.querySelectorAll('.slider input').forEach(syncSlider);
  $('#waitMode').checked = S.waitMode; $('#sound').checked = S.sound; $('#names').checked = S.names; $('#range').value = S.rangeMode;

  $('#file').addEventListener('change', e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
  $('#builtin').addEventListener('change', e => { const v = e.target.value; if (BUILTIN[v]) loadSong(BUILTIN[v]()); e.target.value = ''; e.target.blur(); });
  $('#playBtn').addEventListener('click', togglePlay);
  $('#restartBtn').addEventListener('click', () => { restart(); });
  const menus = [['#gameBtn', '#gameMenu'], ['#devBtn', '#devMenu']];
  window.closeMenus = () => menus.forEach(([b, m]) => { $(m).hidden = true; $(b).setAttribute('aria-expanded', 'false'); });
  menus.forEach(([b, m]) => $(b).addEventListener('click', () => {
    const open = $(m).hidden; closeMenus();
    if (open) { $(m).hidden = false; $(b).setAttribute('aria-expanded', 'true'); }
  }));
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.pop')) closeMenus(); });
  $('#octDown').addEventListener('click', () => shiftOctave(-12));
  $('#octUp').addEventListener('click', () => shiftOctave(12));
  $('#speed').addEventListener('input', e => { S.speed = e.target.value / 100; $('#speedOut').textContent = e.target.value + '%'; syncSlider(e.target); saveSettings(); });
  $('#look').addEventListener('input', e => { S.look = +e.target.value; $('#lookOut').textContent = S.look + ' s'; syncSlider(e.target); saveSettings(); });
  $('#lvol').addEventListener('input', e => { S.lvol = e.target.value / 100; $('#lvolOut').textContent = e.target.value + '%'; syncSlider(e.target); Synth.setAutoVolume(S.lvol); saveSettings(); });
  $('#letters').addEventListener('change', e => { S.letters = e.target.checked; saveSettings(); });
  const winChanged = () => {
    saveSettings(); restart();
    if (S.winOn && S.windows.length) toast('Keyboard window on — ' + S.winChanges.length + ' move' + (S.winChanges.length === 1 ? '' : 's') + ' in this song. Start at ' + winName(S.windows[0]));
  };
  $('#winOn').addEventListener('change', e => { S.winOn = e.target.checked; winChanged(); });
  $('#winOct').addEventListener('change', e => { S.winOct = +e.target.value; winChanged(); });
  $('#range').addEventListener('change', e => { S.rangeMode = e.target.value; computeRange(); saveSettings(); });
  $('#waitMode').addEventListener('change', e => { S.waitMode = e.target.checked; saveSettings(); });
  $('#listen').addEventListener('change', e => { S.listen = e.target.checked; restart(); toast(S.listen ? 'Listen mode: the game plays your part — press Space' : 'Listen mode off — your turn!'); });
  $('#sound').addEventListener('change', e => { S.sound = e.target.checked; saveSettings(); });
  $('#names').addEventListener('change', e => { S.names = e.target.checked; saveSettings(); });
  $('#rAgain').addEventListener('click', () => { restart(); togglePlay(); });
  $('#rClose').addEventListener('click', () => $('#results').classList.add('hidden'));
  $('#midiRetry').addEventListener('click', () => initMidi(true));
  $('#midiInput').addEventListener('change', e => e.target.blur());
  $('#progress').addEventListener('click', e => {
    if (!S.song) return;
    const r = e.currentTarget.getBoundingClientRect(), f = clamp((e.clientX - r.left) / r.width, 0, 1);
    const wasPlaying = S.playing;
    restart(f < 0.02 ? null : S.firstStart + f * (S.songEnd - S.firstStart));
    if (wasPlaying) togglePlay();
  });
  // keep keyboard focus on the game
  document.addEventListener('click', e => { const t = e.target.closest('button'); if (t) t.blur(); });
  document.addEventListener('change', e => { if (e.target.type !== 'file') e.target.blur && e.target.blur(); });

  // drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('#drop').classList.add('show'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('show'); } });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('show');
    const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f);
  });

  // computer keyboard
  const pcHeld = new Map();
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'select' || (tag === 'input' && e.target.type === 'range')) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
    if (e.code === 'Escape') { $('#results').classList.add('hidden'); closeMenus(); return; }
    if (e.code === 'KeyR' && !e.repeat) { restart(); return; }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault(); shiftOctave(e.code === 'ArrowUp' ? 12 : -12); return;
    }
    const i = PC_CODES.indexOf(e.code);
    if (i >= 0) { e.preventDefault(); if (e.repeat || pcHeld.has(e.code)) return; const p = S.pcBase + i; pcHeld.set(e.code, p); noteOn(p, 100); }
  });
  window.addEventListener('keyup', e => { const p = pcHeld.get(e.code); if (p != null) { pcHeld.delete(e.code); noteOff(p); } });
  window.addEventListener('blur', () => { for (const p of pcHeld.values()) noteOff(p); pcHeld.clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing) togglePlay(); });

  // mouse / touch on the on-screen keyboard
  const ptr = new Map();
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), p = pitchAt(e.clientX - r.left, e.clientY - r.top);
    if (p == null) return;
    cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, p); Synth.resume(); noteOn(p, 90);
  });
  cv.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return;
    const r = cv.getBoundingClientRect(), p = pitchAt(e.clientX - r.left, e.clientY - r.top), old = ptr.get(e.pointerId);
    if (p != null && p !== old) { noteOff(old); ptr.set(e.pointerId, p); noteOn(p, 90); }
  });
  const up = e => { const p = ptr.get(e.pointerId); if (p != null) { ptr.delete(e.pointerId); noteOff(p); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  new ResizeObserver(layout).observe(stage);
}

async function loadFile(f) {
  try {
    const buf = await f.arrayBuffer();
    loadSong(parseMidi(buf, f.name.replace(/\.(mid|midi|kar)$/i, '')));
  } catch (err) { console.error(err); toast('Could not read “' + f.name + '”: ' + err.message, 4000); }
}
