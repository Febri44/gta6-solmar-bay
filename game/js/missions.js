// missions.js — the three Solmar Bay missions.
//
// 1. Courier Run — drive the package to the drop marker before the timer.
// 2. Hot Pickup — collect 5 packages around the city while wanted climbs.
// 3. Beach Sprint — checkpoint race along the beach road.
// Each mission has a target marker, an arrow direction, a distance readout,
// a timer and a cash reward. Completing one starts the next; finishing all
// three loops back to mission 1 with a bonus.

var Missions = (function () {
  var defs = [
    {
      id: 1, name: 'Courier Run',
      brief: 'Take the package to the drop-off at the marina. Don\'t be late.',
      reward: 150, timeLimit: 110,
      target: { x: 150, z: -130, label: 'Marina Drop' },
      start: { x: 0, z: 0 }
    },
    {
      id: 2, name: 'Hot Pickup',
      brief: 'Grab all 5 packages. The cops noticed — wanted is climbing.',
      reward: 300, timeLimit: 150,
      packages: [
        { x: -120, z: -80 }, { x: 80, z: -120 }, { x: 120, z: 80 },
        { x: -80, z: 120 }, { x: 40, z: 0 }
      ],
      start: { x: 150, z: -130 }
    },
    {
      id: 3, name: 'Beach Sprint',
      brief: 'Checkpoint race down the beach road. Hit every gate in order.',
      reward: 500, timeLimit: 120,
      checkpoints: [
        { x: 175, z: -140 }, { x: 175, z: -60 }, { x: 175, z: 20 },
        { x: 175, z: 100 }, { x: 150, z: 150 }
      ],
      start: { x: 175, z: -160 }
    }
  ];

  var state = {
    index: 0,            // current mission (0-based)
    active: false,
    timeLeft: 0,
    collected: 0,        // packages / checkpoints collected
    done: 0,             // missions completed this loop
    message: '',
    messageTimer: 0,
    failed: false
  };

  function current() { return defs[state.index]; }

  function targetPos() {
    var m = current();
    if (m.id === 1) return m.target;
    if (m.id === 2) return m.packages[state.collected] || null;
    if (m.id === 3) return m.checkpoints[state.collected] || null;
    return null;
  }

  function targetLabel() {
    var m = current();
    if (m.id === 1) return m.target.label;
    if (m.id === 2) return 'Package ' + (state.collected + 1) + ' of 5';
    return 'Gate ' + (state.collected + 1) + ' of ' + m.checkpoints.length;
  }

  function start(index) {
    state.index = index % defs.length;
    state.active = true;
    state.timeLeft = current().timeLimit;
    state.collected = 0;
    state.failed = false;
    state.message = current().name + ' — ' + current().brief;
    state.messageTimer = 5;
    if (current().id === 2) Police.addHeat(25); // pickup starts hot
  }

  function fail(reason) {
    state.active = false;
    state.failed = true;
    state.message = 'Mission failed — ' + reason + '. Head to the marker to retry.';
    state.messageTimer = 6;
  }

  // Returns earned cash (0 if nothing) — game.js adds it to the wallet.
  function update(dt, px, pz) {
    if (!state.active) return 0;
    state.timeLeft -= dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.timeLeft <= 0) {
      fail('out of time');
      return 0;
    }
    var t = targetPos();
    if (!t) return 0;
    if (dist2d(px, pz, t.x, t.z) < 6) {
      state.collected++;
      var m = current();
      var total = m.id === 1 ? 1 : (m.id === 2 ? m.packages.length : m.checkpoints.length);
      if (state.collected >= total) {
        var reward = m.reward;
        state.done++;
        state.active = false;
        state.message = m.name + ' complete! +' + formatMoney(reward);
        state.messageTimer = 5;
        var next = (state.index + 1) % defs.length;
        setTimeout(function () { start(next); }, 4500);
        return reward;
      }
      state.message = targetLabel() + ' — ' + Math.round(state.timeLeft) + 's left';
      state.messageTimer = 2.5;
      if (m.id === 2) Police.addHeat(8);
    }
    return 0;
  }

  function reset() {
    state.index = 0; state.active = false; state.timeLeft = 0;
    state.collected = 0; state.done = 0; state.message = '';
    state.messageTimer = 0; state.failed = false;
  }

  return {
    defs: defs, state: state, current: current, targetPos: targetPos,
    targetLabel: targetLabel, start: start, fail: fail, update: update, reset: reset
  };
})();
