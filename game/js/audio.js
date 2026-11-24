// audio.js — WebAudio for Solmar Bay: engine hum, 3 synth radio stations,
// siren, crash thud and pickup chime. Everything starts only after a user
// gesture (the title screen click), per autoplay policy.

var AudioSys = (function () {
  var ctx = null;
  var master = null;
  var engineOsc = null, engineGain = null, engineFilter = null;
  var radioGain = null;
  var radioTimer = null;
  var radioStep = 0;
  var sirenOsc = null, sirenGain = null;
  var started = false;
  var muted = false;

  var STATIONS = [
    { name: 'SOLMAR FM 88.5 — Sunset Pop', bpm: 96, wave: 'triangle', root: 220, minor: false },
    { name: 'VICE 102.1 — Synthwave', bpm: 112, wave: 'sawtooth', root: 110, minor: true },
    { name: 'BAY 97.3 — Latin Nights', bpm: 128, wave: 'square', root: 165, minor: false }
  ];
  var stationIndex = 0;

  function init() {
    if (started) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      // Engine: two detuned oscillators through a lowpass; pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      var engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      engineOsc._sub = engineOsc2;

      // Radio bus (kept quiet under the engine + siren).
      radioGain = ctx.createGain();
      radioGain.gain.value = 0.12;
      radioGain.connect(master);

      // Siren: alternating two-tone.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();

      started = true;
      startRadioLoop();
    } catch (e) {
      started = false;
    }
  }

  function noteFreq(root, semitone) {
    return root * Math.pow(2, semitone / 12);
  }

  // Tiny step sequencer: a looping bass + lead pattern per station.
  function startRadioLoop() {
    var st = STATIONS[stationIndex];
    var stepDur = 60 / st.bpm / 2;
    var bassLine = st.minor ? [0, 0, 3, 0, 5, 0, 3, 7] : [0, 0, 4, 0, 5, 0, 7, 4];
    var leadLine = st.minor
      ? [12, 15, 12, 10, 12, 15, 19, 15]
      : [12, 16, 19, 16, 12, 14, 16, 12];
    radioStep = 0;
    if (radioTimer) clearInterval(radioTimer);
    radioTimer = setInterval(function () {
      if (!ctx || muted) return;
      var i = radioStep % 8;
      var t = ctx.currentTime;
      // Bass note.
      var b = ctx.createOscillator();
      b.type = st.wave;
      b.frequency.value = noteFreq(st.root / 2, bassLine[i]);
      var bg = ctx.createGain();
      bg.gain.setValueAtTime(0.5, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
      b.connect(bg); bg.connect(radioGain);
      b.start(t); b.stop(t + stepDur);
      // Lead note every other step.
      if (i % 2 === 0) {
        var l = ctx.createOscillator();
        l.type = 'sine';
        l.frequency.value = noteFreq(st.root, leadLine[i]);
        var lg = ctx.createGain();
        lg.gain.setValueAtTime(0.35, t);
        lg.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
        l.connect(lg); lg.connect(radioGain);
        l.start(t); l.stop(t + stepDur * 1.9);
      }
      radioStep++;
    }, stepDur * 1000);
  }

  function setEngine(speedNorm, inCar) {
    if (!ctx || !engineOsc) return;
    var t = ctx.currentTime;
    var rpm = 50 + speedNorm * 160;
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    if (engineOsc._sub) engineOsc._sub.frequency.setTargetAtTime(rpm / 2, t, 0.08);
    engineFilter.frequency.setTargetAtTime(300 + speedNorm * 1400, t, 0.1);
    engineGain.gain.setTargetAtTime(inCar ? 0.10 + speedNorm * 0.10 : 0.0, t, 0.1);
  }

  function setSiren(on) {
    if (!ctx || !sirenOsc) return;
    var t = ctx.currentTime;
    if (on) {
      sirenGain.gain.setTargetAtTime(0.05, t, 0.2);
      // Wail: LFO on the siren frequency.
      sirenOsc.frequency.setTargetAtTime(950, t, 0.4);
      setTimeout(function () {
        if (sirenGain.gain.value > 0.01) sirenOsc.frequency.setTargetAtTime(650, ctx.currentTime, 0.4);
      }, 450);
    } else {
      sirenGain.gain.setTargetAtTime(0.0, t, 0.2);
    }
  }

  function crash(intensity) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var dur = 0.18 + intensity * 0.15;
    var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    var g = ctx.createGain();
    g.gain.value = 0.25 + intensity * 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function chime() {
    if (!ctx) return;
    var t = ctx.currentTime;
    [880, 1320].forEach(function (fr, i) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.35);
      o.connect(g); g.connect(master);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.4);
    });
  }

  function nextStation() {
    stationIndex = (stationIndex + 1) % STATIONS.length;
    if (started) startRadioLoop();
    return STATIONS[stationIndex].name;
  }

  function stationName() { return STATIONS[stationIndex].name; }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return {
    init: init, setEngine: setEngine, setSiren: setSiren,
    crash: crash, chime: chime, nextStation: nextStation,
    stationName: stationName, toggleMute: toggleMute,
    isStarted: function () { return started; }
  };
})();
