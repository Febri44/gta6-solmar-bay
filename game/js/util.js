// util.js — small math + deterministic RNG helpers for Solmar Bay.
// No dependencies. Everything here is pure and side-effect free.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function deg2rad(d) { return d * Math.PI / 180; }

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist2d(ax, az, bx, bz) {
  var dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Angle helpers: headings are radians, 0 = +x (east), PI/2 = +z (south).
function angDiff(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function angLerp(a, b, t) {
  return a + angDiff(b, a) * t;
}

// Mulberry32 — tiny seeded PRNG so the city is identical every load.
function makeRng(seed) {
  var s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

function choice2(rng, a, b) {
  return rng() < 0.5 ? a : b;
}

// 2D vector helpers (plain objects {x, z}).
function vec2(x, z) { return { x: x, z: z }; }

function add2(a, b) { return { x: a.x + b.x, z: a.z + b.z }; }

function scale2(a, s) { return { x: a.x * s, z: a.z * s }; }

// Circle (cx,cz,r) vs AABB (minx,minz,maxx,maxz): returns push-out vector
// or null when there is no overlap. Used for car/building collisions.
function circleVsAabb(cx, cz, r, minx, minz, maxx, maxz) {
  var nx = clamp(cx, minx, maxx);
  var nz = clamp(cz, minz, maxz);
  var dx = cx - nx, dz = cz - nz;
  var d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    var d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
  }
  // Center inside the box: push out along the smallest penetration axis.
  var pl = cx - minx, pr = maxx - cx, pt = cz - minz, pb = maxz - cz;
  var m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: -(pl + r), z: 0 };
  if (m === pr) return { x: pr + r, z: 0 };
  if (m === pt) return { x: 0, z: -(pt + r) };
  return { x: 0, z: pb + r };
}

function formatClock(minutes) {
  var h = Math.floor(minutes / 60) % 24;
  var m = Math.floor(minutes % 60);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  var m = Math.floor(s / 60);
  var r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}
