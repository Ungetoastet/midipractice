/* Small helpers: DOM lookup, note names, clamp, localStorage, toast messages */
'use strict';

const $ = s => document.querySelector(s);
const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK = new Set([1,3,6,8,10]);
const isBlack = p => BLACK.has(((p % 12) + 12) % 12);
const noteName = p => NAMES[p % 12] + (Math.floor(p / 12) - 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
