/* Built-in Web Audio synth: voices, release fade, accompaniment volume, sustain pedal */
'use strict';

const Synth = {
  ctx: null, master: null, voices: new Map(), sustain: false, sustained: new Set(),
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.45;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.autoBus = this.ctx.createGain(); this.autoBus.gain.value = S.lvol;   // notes played by the game (Listen / accompaniment)
    this.autoBus.connect(this.master);
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  on(key, p, vel = 96, dur = null, mul = 1) {
    if (!this.ctx) return;
    this.off(key);
    if (this.voices.size > 56) this.off(this.voices.keys().next().value);
    const c = this.ctx, t = c.currentTime, f = 440 * Math.pow(2, (p - 69) / 12);
    const peak = (0.10 + 0.22 * (vel / 127)) * mul, sus = peak * 0.35;
    const D = 1.0 + 3.0 * clamp((96 - p) / 60, 0, 1);
    const g = c.createGain(), gp = g.gain;
    gp.setValueAtTime(0.0001, t);
    gp.exponentialRampToValueAtTime(peak, t + 0.005);
    let stopAt;
    if (dur == null) {
      gp.exponentialRampToValueAtTime(sus, t + 0.3);
      gp.exponentialRampToValueAtTime(0.0001, t + D);
      stopAt = t + D + 0.05;
    } else {
      const rel = Math.max(0.03, dur);
      if (rel <= 0.3) gp.exponentialRampToValueAtTime(peak * Math.pow(sus / peak, rel / 0.3), t + rel);
      else if (rel < D) {
        gp.exponentialRampToValueAtTime(sus, t + 0.3);
        gp.exponentialRampToValueAtTime(Math.max(0.0001, sus * Math.pow(0.0001 / sus, (rel - 0.3) / (D - 0.3))), t + rel);
      } else { gp.exponentialRampToValueAtTime(sus, t + 0.3); gp.exponentialRampToValueAtTime(0.0001, t + D); }
      gp.setTargetAtTime(0.0001, t + rel, 0.06);
      stopAt = t + Math.min(rel, D) + 0.5;
    }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(12000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(8000, f * 3) + 200, t + 0.6);
    const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const o3 = c.createOscillator(); o3.type = 'sawtooth'; o3.frequency.value = f; o3.detune.value = 5;
    const g2 = c.createGain(); g2.gain.value = 0.22;
    const g3 = c.createGain(); g3.gain.value = 0.05;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp);
    // Separate release stage: the envelope (g) is never interrupted; releasing a key only fades
    // this node, which always sits at exactly 1 until then. No reading back of automated values,
    // so there is no jump in loudness (that jump was the "pop", mostly in Firefox).
    const rel = c.createGain(); rel.gain.value = 1;
    lp.connect(g); g.connect(rel); rel.connect(key[0] === 'a' && this.autoBus ? this.autoBus : this.master);
    const oscs = [o1, o2, o3];
    oscs.forEach(o => { o.start(t); o.stop(stopAt); });
    const v = { g, rel, oscs };
    this.voices.set(key, v);
    o1.onended = () => { if (this.voices.get(key) === v) this.voices.delete(key); try { rel.disconnect(); g.disconnect(); } catch (e) {} };
  },
  off(key, fade = 0.1) {
    const v = this.voices.get(key); if (!v || !this.ctx) return;
    this.voices.delete(key);
    const t = this.ctx.currentTime, rp = v.rel.gain;
    rp.cancelScheduledValues(t);
    rp.setValueAtTime(1, t);            // known starting point: full volume
    rp.setTargetAtTime(0, t, fade);     // smooth exponential fade (≈ 0.3 s to near silence)
    v.oscs.forEach(o => { try { o.stop(t + fade * 12); } catch (e) {} });   // stop once inaudible
  },
  allOff() { [...this.voices.keys()].forEach(k => this.off(k)); this.sustained.clear(); },
  setAutoVolume(v) { if (this.autoBus) this.autoBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); },   // smooth, no clicks
  setSustain(on) {
    this.sustain = on;
    if (!on) { for (const p of this.sustained) if (!down.has(p)) this.off('u' + p); this.sustained.clear(); }
  }
};
