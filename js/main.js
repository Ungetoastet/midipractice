/* Start-up: wire the UI, size the canvas, load a song, connect MIDI, start the loop */
'use strict';

initUi();
layout();
loadSong(BUILTIN.ode());
initMidi();
requestAnimationFrame(t => { S.lastNow = t; requestAnimationFrame(frame); });
