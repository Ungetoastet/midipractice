/* Web MIDI input (Chrome, Edge, Opera, Firefox): connect, device list, messages.
   All browsers expose the same standard API (navigator.requestMIDIAccess). Firefox adds rules:
   - it is only exposed on https:// and http://localhost pages, never on file:// pages;
   - on https sites it asks you to install a small "site permission add-on" (needs a click),
     and it denies the request outright when no MIDI device is plugged in;
   - plugging a device in later may not be detected, so we poll and offer a Rescan. */
'use strict';

const IS_FIREFOX = /firefox|fxios/i.test(navigator.userAgent);
let midiAccess = null, midiBusy = false, midiPoll = 0, midiSig = '';

async function initMidi(fromClick = false) {
  if (midiBusy) return;
  const btn = $('#midiRetry');
  if (!navigator.requestMIDIAccess) {
    S.pcHints = true; btn.hidden = true;
    if (IS_FIREFOX && location.protocol === 'file:') setMidiStatus('Firefox does not allow MIDI on files opened from disk. Serve the folder instead: run “python3 -m http.server 8000” in it and open http://localhost:8000', 'warn', 'No MIDI');
    else if (IS_FIREFOX && !window.isSecureContext) setMidiStatus('Firefox only allows MIDI on https:// or localhost pages', 'warn', 'No MIDI');
    else if (IS_FIREFOX) setMidiStatus('MIDI needs Firefox 108+ on desktop (Windows, macOS, Linux)', 'warn', 'No MIDI');
    else setMidiStatus('Web MIDI is not supported in this browser — use Chrome, Edge or Firefox', 'warn', 'No MIDI');
    return;
  }
  // Firefox's add-on prompt needs a user click, and is pointless without a device: wait for a click.
  if (IS_FIREFOX && !fromClick && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    setMidiStatus('No MIDI device found', 'warn');
    btn.textContent = 'Connect MIDI'; btn.hidden = false;
    return;
  }
  midiBusy = true;
  setMidiStatus(IS_FIREFOX ? 'Waiting for Firefox permission…' : 'Requesting MIDI access…', 'warn');
  try {
    const acc = await navigator.requestMIDIAccess({ sysex: false });
    if (midiAccess) { for (const i of midiAccess.inputs.values()) i.onmidimessage = null; midiAccess.onstatechange = null; }
    midiAccess = acc;
    midiAccess.onstatechange = refreshInputs;
    refreshInputs();
    // hot-plug fallback: watch the input list ourselves (cheap, harmless in Chrome)
    clearInterval(midiPoll);
    midiPoll = setInterval(() => { if (inputSignature() !== midiSig) refreshInputs(); }, 1500);
  } catch (e) {
    console.warn('MIDI request failed:', e);
    S.pcHints = true;
    const msg = String((e && e.message) || e);
    if (IS_FIREFOX && /add-on|addon|site permission/i.test(msg))
      setMidiStatus('Firefox: no MIDI device found, or the add-on was declined — plug in and click again', 'warn');
    else setMidiStatus('MIDI access blocked — click “Connect MIDI” to try again', 'warn');
    btn.textContent = 'Connect MIDI'; btn.hidden = false;
  } finally { midiBusy = false; }
}
function inputSignature() {
  if (!midiAccess) return '';
  return [...midiAccess.inputs.values()].filter(i => i.state !== 'disconnected').map(i => i.id).sort().join('|');
}
function setMidiStatus(text, cls, short) {
  $('#midiStatus').textContent = text;
  if (cls !== 'on') $('#midiList').hidden = true;
  $('#midiDot').className = $('#midiDot2').className = 'dot ' + (cls || '');
  $('#devLabel').textContent = short || (cls === 'on' ? 'MIDI' : 'Connect MIDI');
  $('#devBtn').title = 'Device settings — ' + text;
}
// Port names vary by OS. Linux/ALSA: "MPK mini IV:MPK mini IV MIDI Port 28:0" -> device "MPK mini IV", port "MIDI Port".
function splitPortName(name) {
  name = (name || 'MIDI input').replace(/\s+\d+:\d+\s*$/, '').trim();
  let dev = name, port = '';
  const c = name.indexOf(':');
  if (c > 0) { dev = name.slice(0, c).trim(); port = name.slice(c + 1).trim(); }
  if (port.toLowerCase().startsWith(dev.toLowerCase())) port = port.slice(dev.length).trim();
  return { dev, port: port || 'Input' };
}
const isVirtual = dev => /midi through/i.test(dev);
const portRows = new Map();   // input id -> activity light element
function renderMidiList(ins) {
  const ul = $('#midiList'); ul.innerHTML = ''; portRows.clear();
  if (!ins.length) { ul.hidden = true; return; }
  const groups = new Map();
  for (const i of ins) { const { dev, port } = splitPortName(i.name); if (!groups.has(dev)) groups.set(dev, []); groups.get(dev).push({ i, port }); }
  // real devices first, virtual loopback ports last
  const devs = [...groups.keys()].sort((a, b) => isVirtual(a) - isVirtual(b));
  for (const dev of devs) {
    const h = document.createElement('li'); h.className = 'dev' + (isVirtual(dev) ? ' muted' : ''); h.textContent = dev; ul.appendChild(h);
    groups.get(dev).forEach(({ i, port }, k, arr) => {
      const li = document.createElement('li'); li.className = 'port' + (k === arr.length - 1 ? ' last' : '');
      const act = document.createElement('span'); act.className = 'act'; act.title = 'Lights up when this port sends notes';
      const nm = document.createElement('span'); nm.textContent = port;
      li.append(act, nm); ul.appendChild(li); portRows.set(i.id, act);
    });
  }
  ul.hidden = false;
}
let actTimers = new Map();
function flashPort(id) {
  const a = portRows.get(id); if (!a) return;
  a.classList.add('on'); clearTimeout(actTimers.get(id));
  actTimers.set(id, setTimeout(() => a.classList.remove('on'), 120));
}
function refreshInputs() {
  if (!midiAccess) return;
  midiSig = inputSignature();
  const sel = $('#midiInput'), cur = sel.value;
  const ins = [...midiAccess.inputs.values()].filter(i => i.state !== 'disconnected');
  sel.innerHTML = '<option value="all">All inputs</option>';
  for (const i of ins) { const { dev, port } = splitPortName(i.name); const o = document.createElement('option'); o.value = i.id; o.textContent = dev + ' · ' + port; sel.appendChild(o); }
  sel.value = ins.some(i => i.id === cur) ? cur : 'all';
  for (const i of midiAccess.inputs.values()) {
    i.onmidimessage = e => { flashPort(i.id); if (sel.value === 'all' || sel.value === i.id) onMidiMessage(e); };
    // setting onmidimessage opens the port implicitly per spec; open explicitly too for older engines
    if (i.connection !== 'open' && typeof i.open === 'function') i.open().catch(() => {});
  }
  S.pcHints = ins.length === 0;
  const btn = $('#midiRetry');
  if (ins.length) {
    const devs = [...new Set(ins.map(i => splitPortName(i.name).dev))], real = devs.filter(d => !isVirtual(d));
    const shown = real.length ? real : devs;
    setMidiStatus('Connected', 'on', shown.length === 1 ? shown[0] : shown.length + ' MIDI devices');
    renderMidiList(ins);
    btn.hidden = !IS_FIREFOX; btn.textContent = 'Rescan';   // Firefox may miss hot-plugged devices
  } else {
    setMidiStatus('No MIDI keyboard found — plug one in' + (IS_FIREFOX ? ', then click Rescan' : ''), 'warn', 'No keyboard');
    renderMidiList([]);
    btn.hidden = !IS_FIREFOX; btn.textContent = 'Rescan';
  }
}
function onMidiMessage(e) {
  const data = e.data; if (!data || data.length < 2) return;
  const now = performance.now();
  const ts = e.timeStamp && Math.abs(e.timeStamp - now) < 500 ? e.timeStamp : now;
  const type = data[0] & 0xF0, a = data[1], b = data.length > 2 ? data[2] : 0;
  if (type === 0x90 && b > 0) noteOn(a, b, ts);
  else if (type === 0x80 || (type === 0x90 && b === 0)) noteOff(a, ts);
  else if (type === 0xB0 && a === 64) Synth.setSustain(b >= 64);
  else if (type === 0xB0 && (a === 123 || a === 120)) { for (const p of [...down.keys()]) noteOff(p, ts); }
}
