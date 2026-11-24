// police.js — wanted level + police pursuit for Solmar Bay.
//
// Wanted stars 0-5. Hitting a police car, hitting a pedestrian, or stealing
// a car in view raises heat; heat decays slowly while the player stays out
// of trouble. At wanted >= 1, police cars spawn at the edge of view and
// chase the player; at wanted >= 3 a second unit joins. Police ram the
// player; a hard enough ram costs the player cash and drops one star.

var Police = (function () {
  var units = [];
  var heat = 0;            // 0..100, maps to stars
  var spawnTimer = 0;
  var rng = makeRng(424242);

  function stars() {
    if (heat < 12) return 0;
    if (heat < 30) return 1;
    if (heat < 50) return 2;
    if (heat < 70) return 3;
    if (heat < 88) return 4;
    return 5;
  }

  function addHeat(n) {
    heat = clamp(heat + n, 0, 100);
  }

  function wantedLevel() { return stars(); }

  function spawnUnit(px, pz) {
    var a = rng() * Math.PI * 2;
    var d = 55 + rng() * 20;
    units.push({
      x: clamp(px + Math.cos(a) * d, -CITY.BOUND, CITY.BOUND),
      z: clamp(pz + Math.sin(a) * d, -CITY.BOUND, CITY.BOUND),
      heading: a,
      speed: 0,
      topSpeed: 16 + stars() * 1.6,
      sirenPhase: rng() * Math.PI * 2
    });
  }

  function update(dt, player, onBusted) {
    var want = stars();
    // Heat decays when the player is calm and not speeding through crowds.
    heat = clamp(heat - dt * (want === 0 ? 1.2 : 0.4), 0, 100);

    var target = want >= 3 ? 2 : (want >= 1 ? 1 : 0);
    spawnTimer -= dt;
    if (units.length < target && spawnTimer <= 0) {
      spawnUnit(player.x, player.z);
      spawnTimer = 4;
    }
    if (units.length > target) units.length = target;

    units.forEach(function (u) {
      var dx = player.x - u.x, dz = player.z - u.z;
      var dist = Math.sqrt(dx * dx + dz * dz) || 1;
      var wantHeading = Math.atan2(dz, dx);
      u.heading = angLerp(u.heading, wantHeading, clamp(dt * 2.2, 0, 1));
      var targetSpeed = dist > 4 ? u.topSpeed : u.topSpeed * 0.4;
      u.speed = lerp(u.speed, targetSpeed, clamp(dt * 1.5, 0, 1));
      u.x += Math.cos(u.heading) * u.speed * dt;
      u.z += Math.sin(u.heading) * u.speed * dt;
      u.sirenPhase += dt * 6;
      // Ram: close contact shoves the player and costs cash.
      if (dist < 3.2 && u.speed > 4) {
        var push = 6;
        player.x += (dx / dist) * push * dt * 3;
        player.z += (dz / dist) * push * dt * 3;
        if (player.speed !== undefined) player.speed *= 0.82;
        if (onBusted) onBusted(dist);
        u.speed *= 0.5;
      }
    });
  }

  function reset() {
    units.length = 0;
    heat = 0;
    spawnTimer = 0;
  }

  return {
    units: units, stars: stars, addHeat: addHeat,
    wantedLevel: wantedLevel, update: update, reset: reset,
    heat: function () { return heat; }
  };
})();
