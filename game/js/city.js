// city.js — Solmar Bay layout: roads, blocks, buildings, palms, lamps,
// zebra crossings, shops and the safehouse. Pure data + static geometry.
//
// World: x east, z south, y up. Roads form a grid every 40 units from
// -160 to +160. Road half-width 6, sidewalk band 6..10. The east edge
// (x > 170) is beach sand and the bay water beyond x = 205.

var CITY = (function () {
  var ROAD_STEP = 40;
  var ROADS = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
  var ROAD_HALF = 6;
  var WALK_OUT = 10;          // outer edge of sidewalk
  var BOUND = 180;            // drivable / walkable world bound
  var BEACH_X = 170;          // sand starts here
  var WATER_X = 205;          // water plane starts here

  var rng = makeRng(20261124);

  var buildings = [];   // {x,z,w,d,h,type,roof,awning}
  var colliders = [];   // {minx,minz,maxx,maxz} — AABBs for cars/peds
  var palms = [];       // {x,z,h,lean}
  var lamps = [];       // {x,z}
  var zebras = [];      // {x,z,axis} axis 'x' = stripes run along x
  var shops = [];       // {x,z,name,price,kind}
  var parks = [];

  var FACADES = ['facadeA', 'facadeB', 'facadeC', 'facadeD'];

  function addBuilding(x, z, w, d, h, type) {
    var b = { x: x, z: z, w: w, d: d, h: h, type: type,
      facade: pick(rng, FACADES), roof: pick(rng, [0x8a7a68, 0x6e6a72, 0x7d7468]),
      awning: type === 'shop' };
    buildings.push(b);
    colliders.push({ minx: x - w / 2, minz: z - d / 2, maxx: x + w / 2, maxz: z + d / 2 });
    return b;
  }

  // One city block sits between four roads. Fill it with 1-4 buildings or
  // leave it as a palm park / parking lot.
  function fillBlock(bx0, bz0, bx1, bz1) {
    var roll = rng();
    var cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    var bw = bx1 - bx0, bd = bz1 - bz0;
    if (roll < 0.14) {
      parks.push({ x: cx, z: cz, w: bw, d: bd });
      for (var i = 0; i < 7; i++) {
        palms.push({ x: range(rng, bx0 + 3, bx1 - 3), z: range(rng, bz0 + 3, bz1 - 3),
          h: range(rng, 7, 10), lean: range(rng, -0.08, 0.08) });
      }
      return;
    }
    if (roll < 0.22) {
      // Parking lot: low curbs, a few parked cars are placed by traffic.js.
      parks.push({ x: cx, z: cz, w: bw, d: bd, lot: true });
      return;
    }
    if (roll < 0.42) {
      // Slim tower, centred, with setback from the street.
      addBuilding(cx, cz, range(rng, 10, 13), range(rng, 10, 13),
        range(rng, 26, 48), 'tower');
    } else if (roll < 0.72) {
      // Mid block: two buildings side by side.
      addBuilding(bx0 + bw * 0.26, cz, range(rng, 8, 11), range(rng, 12, 16),
        range(rng, 10, 18), 'block');
      addBuilding(bx0 + bw * 0.74, cz, range(rng, 8, 11), range(rng, 12, 16),
        range(rng, 8, 15), 'block');
    } else {
      // Low shop row facing the street, with awnings.
      addBuilding(bx0 + bw * 0.25, bz0 + 5, range(rng, 9, 12), 8,
        range(rng, 4.5, 6), 'shop');
      addBuilding(bx0 + bw * 0.75, bz0 + 5, range(rng, 9, 12), 8,
        range(rng, 4.5, 6), 'shop');
      addBuilding(cx, bz1 - 6, range(rng, 10, 13), 9,
        range(rng, 9, 14), 'block');
    }
  }

  for (var ix = 0; ix < ROADS.length - 1; ix++) {
    for (var iz = 0; iz < ROADS.length - 1; iz++) {
      fillBlock(ROADS[ix] + WALK_OUT, ROADS[iz] + WALK_OUT,
        ROADS[ix + 1] - WALK_OUT, ROADS[iz + 1] - WALK_OUT);
    }
  }

  // Palms along every sidewalk, lamps + zebra at every intersection.
  ROADS.forEach(function (r) {
    for (var p = -160; p <= 160; p += 26) {
      if (Math.abs(p - r) < 12) continue;
      palms.push({ x: r + 8.6, z: p + range(rng, -4, 4), h: range(rng, 7, 10), lean: range(rng, -0.06, 0.06) });
      palms.push({ x: p + range(rng, -4, 4), z: r + 8.6, h: range(rng, 7, 10), lean: range(rng, -0.06, 0.06) });
    }
  });
  ROADS.forEach(function (rx) {
    ROADS.forEach(function (rz) {
      lamps.push({ x: rx + 8, z: rz + 8 });
      lamps.push({ x: rx - 8, z: rz - 8 });
      zebras.push({ x: rx, z: rz - 11, axis: 'x' });
      zebras.push({ x: rx, z: rz + 11, axis: 'x' });
      zebras.push({ x: rx - 11, z: rz, axis: 'z' });
      zebras.push({ x: rx + 11, z: rz, axis: 'z' });
    });
  });

  // Beach palms in a loose row.
  for (var bp = -150; bp <= 150; bp += 22) {
    palms.push({ x: 186 + range(rng, -4, 4), z: bp + range(rng, -5, 5),
      h: range(rng, 8, 11), lean: range(rng, -0.05, 0.1) });
  }

  // Named shops (fixed, so missions can point at them) and the safehouse.
  var shopDefs = [
    { x: -52, z: -92, name: 'Ammu-Nation', kind: 'health', price: 50 },
    { x: 28, z: 52, name: 'Burger Shot', kind: 'health', price: 30 },
    { x: -132, z: 28, name: 'Binco Clothing', kind: 'cash', price: 0 },
    { x: 108, z: -52, name: 'Pay n Spray', kind: 'repair', price: 80 },
    { x: 68, z: 132, name: '24/7 Market', kind: 'health', price: 25 }
  ];
  shopDefs.forEach(function (s) {
    // Nudge the shop onto the nearest sidewalk edge if a building is there.
    shops.push(s);
  });
  var safehouse = { x: -148, z: 148, name: 'Safehouse — Ocean Apt 3' };

  // Sidewalk walking lines: for each road, two lines at +/-8 offset.
  function sidewalkLines() {
    var lines = [];
    ROADS.forEach(function (r) {
      lines.push({ axis: 'x', at: r - 8, from: -BOUND, to: BOUND });
      lines.push({ axis: 'x', at: r + 8, from: -BOUND, to: BOUND });
      lines.push({ axis: 'z', at: r - 8, from: -BOUND, to: BOUND });
      lines.push({ axis: 'z', at: r + 8, from: -BOUND, to: BOUND });
    });
    return lines;
  }

  function nearestRoadCoord(v) {
    var best = ROADS[0], bd = 1e9;
    ROADS.forEach(function (r) {
      var d = Math.abs(v - r);
      if (d < bd) { bd = d; best = r; }
    });
    return best;
  }

  // ---- static geometry -------------------------------------------------
  // Appends the whole city into a MeshBuilder (see renderer.js).
  // Colours are 0xRRGGBB; the builder multiplies them by the atlas tile.
  function buildStatic(mb) {
    var T = TEX.TILES;
    // Ground base (grass/dirt under everything) + sand + water handled by
    // renderer (water is a separate animated plane).
    mb.flatQuad(0, 0, 2 * BOUND + 60, 2 * BOUND + 60, -0.05, 0x4a6b46, T.white);
    // Sand strip on the east edge.
    mb.flatQuad((BEACH_X + WATER_X) / 2, 0, WATER_X - BEACH_X, 2 * BOUND + 60, 0.0, 0xe6c98f, T.sand);
    // Roads: dark strips along every grid line, both directions.
    // flatQuad(cx, cz, w, d, y, ...): an x-road at z=r is wide in x,
    // a z-road at x=r is wide in z.
    ROADS.forEach(function (r) {
      mb.flatQuad(0, r, 2 * BOUND, 12, 0.02, 0xffffff, T.road);
      mb.flatQuad(r, 0, 12, 2 * BOUND, 0.02, 0xffffff, T.road);
    });
    // Sidewalks: pale strips flanking every road, both sides.
    ROADS.forEach(function (r) {
      mb.flatQuad(0, r - 8, 2 * BOUND, 4, 0.04, 0xffffff, T.sidewalk);
      mb.flatQuad(0, r + 8, 2 * BOUND, 4, 0.045, 0xffffff, T.sidewalk);
      mb.flatQuad(r - 8, 0, 4, 2 * BOUND, 0.04, 0xffffff, T.sidewalk);
      mb.flatQuad(r + 8, 0, 4, 2 * BOUND, 0.045, 0xffffff, T.sidewalk);
    });
    // Zebra crossings at intersections: a crossing over the x-road is
    // narrow in x and spans the road width in z, and vice versa.
    zebras.forEach(function (zb) {
      if (zb.axis === 'x') mb.flatQuad(zb.x, zb.z, 5, 12, 0.06, 0xffffff, T.zebra);
      else mb.flatQuad(zb.x, zb.z, 12, 5, 0.06, 0xffffff, T.zebra);
    });
    // Parks: green lawns.
    parks.forEach(function (pk) {
      if (!pk.lot) mb.flatQuad(pk.x, pk.z, pk.w, pk.d, 0.03, 0x55794a, T.white);
      else mb.flatQuad(pk.x, pk.z, pk.w, pk.d, 0.03, 0x55555c, T.white);
    });
    // Buildings.
    buildings.forEach(function (b) {
      var tile = T[b.facade];
      mb.box(b.x, b.h / 2, b.z, b.w, b.h, b.d, 0xffffff, tile, { top: b.roof });
      // Rooftop AC box + antenna on taller buildings.
      if (b.h > 9) {
        mb.box(b.x + b.w * 0.2, b.h + 0.5, b.z - b.d * 0.15, 1.6, 1.0, 1.6, 0x9a9a92, T.white, {});
        mb.cylinder(b.x - b.w * 0.25, b.h, b.z + b.d * 0.2, 0.08, 0.08, 3.2, 5, 0x555560, T.white);
      }
      if (b.awning) {
        // Shop awning: striped sloped slab over the front.
        mb.box(b.x, 3.1, b.z - b.d / 2 - 0.9, b.w + 0.6, 0.25, 2.0, 0xffffff, T.shop, { rotY: 0 });
      }
    });
    // Palms: tapered trunk + 6 frond blades (flat crossed quads, cheap).
    palms.forEach(function (p) {
      mb.cylinder(p.x, 0, p.z, 0.28, 0.16, p.h, 7, 0x8a6b45, T.white, p.lean);
      var top = p.h;
      for (var f = 0; f < 6; f++) {
        var a = f * Math.PI / 3;
        var dx = Math.cos(a) * 1.6, dz = Math.sin(a) * 1.6;
        mb.quad3(p.x, top, p.z, p.x + dx, top - 1.1, p.z + dz,
          p.x + dx * 0.4, top + 0.5, p.z + dz * 0.4, 0x3f8f4a, T.white);
      }
    });
    // Street lamps: pole + arm + warm head.
    lamps.forEach(function (l) {
      mb.cylinder(l.x, 0, l.z, 0.09, 0.07, 6.5, 5, 0x3a3a40, T.white);
      mb.box(l.x, 6.5, l.z, 0.5, 0.25, 0.5, 0xffd27a, T.white, {});
    });
    // Safehouse marker post + shop signs are drawn as HUD/minimap markers;
    // the safehouse itself is a low pink block at the corner.
    mb.box(safehouse.x, 3, safehouse.z, 12, 6, 10, 0xffffff, T.facadeC, { top: 0xd98a7a });
  }

  return {
    ROAD_STEP: ROAD_STEP, ROADS: ROADS, ROAD_HALF: ROAD_HALF,
    WALK_OUT: WALK_OUT, BOUND: BOUND, BEACH_X: BEACH_X, WATER_X: WATER_X,
    buildings: buildings, colliders: colliders, palms: palms, lamps: lamps,
    zebras: zebras, shops: shops, parks: parks, safehouse: safehouse,
    sidewalkLines: sidewalkLines, nearestRoadCoord: nearestRoadCoord,
    buildStatic: buildStatic
  };
})();
