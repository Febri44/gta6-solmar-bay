// traffic.js — pedestrians, traffic cars and parked cars for Solmar Bay.
//
// Pedestrians walk ON sidewalks: each one follows a sidewalk line along a
// road and turns onto another road at the intersection, so they never cut
// across blocks. Traffic cars drive in lanes (right-hand side, offset 3
// from the road centre) and wrap around the world edge.

var Traffic = (function () {
  var rng = makeRng(777001);

  var PED_COUNT = 215;
  var TRAFFIC_COUNT = 70;
  var PARKED_COUNT = 20;

  var CAR_COLORS = [
    0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x1a1a1a, 0x7d3c98,
    0x16a085, 0xe67e22, 0x95a5a6, 0x8e44ad, 0x27ae60, 0xd35400
  ];
  var SHIRT_COLORS = [
    0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6, 0xecf0f1,
    0x1abc9c, 0xe67e22, 0xfd79a8, 0x00cec9, 0x6c5ce7, 0xdfe6e9
  ];
  var SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

  var peds = [];
  var cars = [];
  var parked = [];

  function init() {
    var lines = CITY.sidewalkLines();
    for (var i = 0; i < PED_COUNT; i++) {
      var line = lines[Math.floor(rng() * lines.length)];
      var t = range(rng, line.from + 4, line.to - 4);
      peds.push({
        line: line,
        t: t,
        dir: choice2(rng, 1, -1),
        speed: range(rng, 1.1, 2.4),
        phase: rng() * Math.PI * 2,
        shirt: pick(rng, SHIRT_COLORS),
        skin: pick(rng, SKIN_COLORS),
        pants: pick(rng, [0x2c3e50, 0x34495e, 0x7f8c8d, 0x5d4037]),
        height: range(rng, 1.65, 1.9)
      });
    }
    for (var j = 0; j < TRAFFIC_COUNT; j++) {
      var road = pick(rng, CITY.ROADS);
      var alongX = rng() < 0.5;
      cars.push({
        axis: alongX ? 'x' : 'z',
        road: road,
        pos: range(rng, -CITY.BOUND, CITY.BOUND),
        lane: choice2(rng, 3, -3),
        speed: range(rng, 7, 13),
        color: pick(rng, CAR_COLORS),
        sport: rng() < 0.35,
        wobble: rng() * Math.PI * 2
      });
    }
    for (var k = 0; k < PARKED_COUNT; k++) {
      var pr = pick(rng, CITY.ROADS);
      var pAlongX = rng() < 0.5;
      parked.push({
        axis: pAlongX ? 'x' : 'z',
        road: pr,
        pos: range(rng, -150, 150),
        lane: choice2(rng, 4.6, -4.6),
        color: pick(rng, CAR_COLORS),
        sport: rng() < 0.4
      });
    }
  }

  function pedPos(p) {
    if (p.line.axis === 'x') return { x: p.t, z: p.line.at };
    return { x: p.line.at, z: p.t };
  }

  function carPos(c) {
    if (c.axis === 'x') return { x: c.pos, z: c.road + c.lane };
    return { x: c.road + c.lane, z: c.pos };
  }

  function carHeading(c) {
    // Right-hand traffic: on an x-road, lane +3 (south side) heads -x.
    if (c.axis === 'x') return c.lane > 0 ? Math.PI : 0;
    return c.lane > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  function update(dt, time) {
    var lines = CITY.sidewalkLines();
    peds.forEach(function (p) {
      p.t += p.dir * p.speed * dt;
      p.phase += dt * p.speed * 4.2;
      if (p.t > CITY.BOUND - 4 || p.t < -CITY.BOUND + 4) {
        // Reached the end of the street: pick a fresh sidewalk line and
        // re-anchor at a random point on it, walking either direction.
        p.line = lines[Math.floor(rng() * lines.length)];
        p.t = range(rng, -CITY.BOUND + 10, CITY.BOUND - 10);
        p.dir = choice2(rng, 1, -1);
      }
    });
    cars.forEach(function (c) {
      c.pos += c.speed * dt;
      if (c.pos > CITY.BOUND + 10) c.pos = -CITY.BOUND - 10;
      if (c.pos < -CITY.BOUND - 10) c.pos = CITY.BOUND + 10;
    });
  }

  // ---- dynamic meshes ----------------------------------------------------
  // A car: long low body, sloped hood + windshield (thin rotated boxes),
  // cabin, and four round multi-segment wheels on the wheelbase.
  function appendCar(mb, x, z, heading, color, sport, opts) {
    opts = opts || {};
    var L = sport ? 4.6 : 4.2;      // length
    var W = sport ? 1.9 : 1.8;      // width
    var bodyH = sport ? 0.62 : 0.72;
    var bodyY = 0.55;
    var white = TEX.TILES.white;
    // Main body.
    mb.boxRot(x, bodyY, z, L, bodyH, W, heading, color, white, {});
    // Hood: low sloped slab at the front.
    var fx = Math.cos(heading), fz = Math.sin(heading);
    var hx = x + fx * (L / 2 - 0.55), hz = z + fz * (L / 2 - 0.55);
    mb.boxRot(hx, bodyY + 0.28, hz, 1.1, 0.22, W - 0.15, heading, color, white, {});
    // Windshield: sloped glass slab.
    var wx = x + fx * 0.35, wz = z + fz * 0.35;
    mb.boxRot(wx, bodyY + 0.55, wz, 0.9, 0.16, W - 0.25, heading, 0x22303f, white, {});
    // Cabin / roof.
    var cx = x - fx * 0.55, cz = z - fz * 0.55;
    mb.boxRot(cx, bodyY + 0.62, cz, 1.7, 0.5, W - 0.3, heading, 0x1c2733, white, {});
    // Wheels: round, 10 segments, placed on the wheelbase.
    var ax = L / 2 - 0.85;
    var perpX = -fz, perpZ = fx;
    var wheelR = 0.36, wheelW = 0.28;
    [[ax, 1], [ax, -1], [-ax, 1], [-ax, -1]].forEach(function (w) {
      var wlx = x + fx * w[0] + perpX * (W / 2 - 0.1) * w[1];
      var wlz = z + fz * w[0] + perpZ * (W / 2 - 0.1) * w[1];
      mb.wheel(wlx, wheelR, wlz, wheelR, wheelW, heading, 0x141414);
      // Hub cap.
      mb.wheel(wlx, wheelR, wlz, wheelR * 0.55, wheelW + 0.02, heading, 0xbbbbbb);
    });
    if (opts.police) {
      // Light bar.
      mb.boxRot(cx, bodyY + 0.95, cz, 0.5, 0.14, W - 0.6, heading, 0xff2222, white, {});
      mb.boxRot(cx + fx * 0.28, bodyY + 0.95, cz + fz * 0.28, 0.22, 0.14, 0.5, heading, 0x2244ff, white, {});
    }
  }

  // A pedestrian, 1:7 head-to-body, legs half the height, swinging while
  // walking. ~5 boxes each: 2 legs, torso, head, (arms folded into torso).
  function appendPed(mb, p, time) {
    var pos = pedPos(p);
    var heading = p.line.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    var h = p.height;
    var legH = h * 0.5;
    var torsoH = h * 0.32;
    var headR = h / 14; // 1:7 head-to-body
    var white = TEX.TILES.white;
    var swing = Math.sin(p.phase) * 0.5;
    var fx = Math.cos(heading), fz = Math.sin(heading);
    var px = -fz, pz = fx; // perpendicular
    // Legs swing fore/aft around the hip.
    [[1, swing], [-1, -swing]].forEach(function (leg) {
      var side = leg[0], sw = leg[1];
      var lx = pos.x + px * 0.11 * side + fx * sw * 0.28;
      var lz = pos.z + pz * 0.11 * side + fz * sw * 0.28;
      mb.boxRot(lx, legH / 2, lz, 0.16, legH, 0.16, heading, p.pants, white, {});
    });
    // Torso.
    mb.boxRot(pos.x, legH + torsoH / 2, pos.z, 0.34, torsoH, 0.42, heading, p.shirt, white, {});
    // Head (1:7 proportion) + hair cap.
    var hy = legH + torsoH + headR;
    mb.boxRot(pos.x, hy, pos.z, headR * 1.5, headR * 2, headR * 1.5, heading, p.skin, white, {});
    mb.boxRot(pos.x, hy + headR * 0.9, pos.z, headR * 1.55, headR * 0.5, headR * 1.55, heading, 0x2b2118, white, {});
  }

  function buildVehicleMesh(mb, playerCar, policeCars) {
    cars.forEach(function (c) {
      var p = carPos(c);
      appendCar(mb, p.x, p.z, carHeading(c), c.color, c.sport, {});
    });
    parked.forEach(function (c) {
      var p = carPos(c);
      appendCar(mb, p.x, p.z, carHeading(c), c.color, c.sport, {});
    });
    if (policeCars) {
      policeCars.forEach(function (pc) {
        appendCar(mb, pc.x, pc.z, pc.heading, 0xf5f5f5, false, { police: true });
      });
    }
    if (playerCar && playerCar.inCar) {
      appendCar(mb, playerCar.x, playerCar.z, playerCar.heading, 0xff2d55, true, {});
    }
  }

  function buildPedMesh(mb, time) {
    peds.forEach(function (p) { appendPed(mb, p, time); });
  }

  return {
    init: init, update: update, peds: peds, cars: cars, parked: parked,
    pedPos: pedPos, carPos: carPos, carHeading: carHeading,
    buildVehicleMesh: buildVehicleMesh, buildPedMesh: buildPedMesh,
    appendCar: appendCar,
    counts: function () { return { peds: peds.length, traffic: cars.length, parked: parked.length }; }
  };
})();
