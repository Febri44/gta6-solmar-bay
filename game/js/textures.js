// textures.js — procedural texture atlas for Solmar Bay.
//
// One 512x512 canvas atlas, drawn once at boot with 2D canvas calls, then
// uploaded as the single WebGL texture. Static geometry UVs point into the
// atlas tiles below; plain-coloured quads sample the white tile so vertex
// colour passes through unchanged. No network, no external images.
// All speckle is seeded (makeRng with a fixed seed), so the atlas paints
// identically on every load.

var TEX = (function () {
  // Atlas layout: 4 columns x 4 rows of 128px tiles.
  //  col 0: white (plain colour) | col 1: windows A | col 2: windows B | col 3: shop front
  //  row 0: facades            | row 1: facades (variant) | row 2: road / sidewalk | row 3: zebra / sand
  var TILE = 128;
  var SIZE = 512;

  // UV rect of a tile (col,row) in atlas space, with a small inset to avoid
  // bleeding between tiles.
  function tileUV(col, row) {
    var pad = 2 / SIZE;
    return {
      u0: col * TILE / SIZE + pad, v0: row * TILE / SIZE + pad,
      u1: (col + 1) * TILE / SIZE - pad, v1: (row + 1) * TILE / SIZE - pad
    };
  }

  var TILES = {
    white: tileUV(0, 0),
    facadeA: tileUV(1, 0),
    facadeB: tileUV(2, 0),
    shop: tileUV(3, 0),
    facadeC: tileUV(1, 1),
    facadeD: tileUV(2, 1),
    road: tileUV(1, 2),
    sidewalk: tileUV(2, 2),
    zebra: tileUV(1, 3),
    sand: tileUV(2, 3)
  };

  function drawWindows(ctx, x0, y0, cols, rows, lit) {
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var wx = x0 + 8 + c * ((TILE - 16) / cols);
        var wy = y0 + 8 + r * ((TILE - 16) / rows);
        var w = (TILE - 16) / cols - 5;
        var h = (TILE - 16) / rows - 5;
        var warm = lit && ((c * 7 + r * 13) % 5 === 0);
        ctx.fillStyle = warm ? '#ffd27a' : (lit ? '#2b3a55' : '#1d2739');
        ctx.fillRect(wx, wy, w, h);
        if (warm) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(wx, wy, w, 2);
        }
      }
    }
  }

  function makeAtlas() {
    var cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    var ctx = cv.getContext('2d');

    // Seeded speckle: the atlas must paint identically on every load,
    // so all randomness here comes from a fixed-seed PRNG, never Math.random.
    var rng = makeRng(0xA71A5);

    // (0,0) white tile — plain vertex colour.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, TILE, TILE);

    // Facade A — warm concrete with lit windows.
    ctx.fillStyle = '#e8b48a'; ctx.fillRect(TILE, 0, TILE, TILE);
    drawWindows(ctx, TILE, 0, 5, 7, true);
    // Facade B — pale blue-grey glass.
    ctx.fillStyle = '#9fb4c8'; ctx.fillRect(TILE * 2, 0, TILE, TILE);
    drawWindows(ctx, TILE * 2, 0, 6, 8, false);
    // Shop front — awning stripes + big glass.
    ctx.fillStyle = '#f2e3c9'; ctx.fillRect(TILE * 3, 0, TILE, TILE);
    for (var i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#c94f3d' : '#f6ead2';
      ctx.fillRect(TILE * 3 + i * 16, 6, 16, 22);
    }
    ctx.fillStyle = '#22303f';
    ctx.fillRect(TILE * 3 + 10, 36, TILE - 20, 70);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(TILE * 3 + 10, 36, TILE - 20, 6);

    // Facade C — sunset pink stucco.
    ctx.fillStyle = '#e59a7e'; ctx.fillRect(TILE, TILE, TILE, TILE);
    drawWindows(ctx, TILE, TILE, 4, 6, true);
    // Facade D — deep teal tower glass.
    ctx.fillStyle = '#3d6b7a'; ctx.fillRect(TILE * 2, TILE, TILE, TILE);
    drawWindows(ctx, TILE * 2, TILE, 7, 9, true);

    // Road tile — dark asphalt with centre dashes.
    ctx.fillStyle = '#33333a'; ctx.fillRect(TILE, TILE * 2, TILE, TILE);
    ctx.fillStyle = '#26262b';
    for (var n = 0; n < 40; n++) {
      ctx.fillRect(TILE + rng() * TILE, TILE * 2 + rng() * TILE, 3, 3);
    }
    ctx.fillStyle = '#d8c25a';
    ctx.fillRect(TILE + TILE / 2 - 2, TILE * 2 + 8, 4, 26);
    ctx.fillRect(TILE + TILE / 2 - 2, TILE * 2 + TILE - 34, 4, 26);

    // Sidewalk tile — pale concrete slabs.
    ctx.fillStyle = '#b9b2a4'; ctx.fillRect(TILE * 2, TILE * 2, TILE, TILE);
    ctx.strokeStyle = '#9a927f'; ctx.lineWidth = 2;
    ctx.strokeRect(TILE * 2 + 4, TILE * 2 + 4, TILE - 8, TILE - 8);
    ctx.beginPath();
    ctx.moveTo(TILE * 2 + TILE / 2, TILE * 2 + 4);
    ctx.lineTo(TILE * 2 + TILE / 2, TILE * 2 + TILE - 4);
    ctx.moveTo(TILE * 2 + 4, TILE * 2 + TILE / 2);
    ctx.lineTo(TILE * 2 + TILE - 4, TILE * 2 + TILE / 2);
    ctx.stroke();

    // Zebra tile — white stripes on asphalt.
    ctx.fillStyle = '#33333a'; ctx.fillRect(TILE, TILE * 3, TILE, TILE);
    ctx.fillStyle = '#e8e8e2';
    for (var s = 0; s < 5; s++) {
      ctx.fillRect(TILE + 10 + s * 24, TILE * 3 + 8, 14, TILE - 16);
    }

    // Sand tile — warm beach sand, slightly denser speckle.
    ctx.fillStyle = '#e6c98f'; ctx.fillRect(TILE * 2, TILE * 3, TILE, TILE);
    ctx.fillStyle = '#d9b878';
    for (var g = 0; g < 90; g++) {
      ctx.fillRect(TILE * 2 + rng() * TILE, TILE * 3 + rng() * TILE, 2, 2);
    }

    return cv;
  }

  // Sunset sky gradient for the page background (behind the transparent
  // WebGL canvas) and for the title screen.
  function skyGradientCSS() {
    return 'linear-gradient(180deg,#2b1d4e 0%,#7a2d5e 28%,#e2574c 52%,' +
      '#ff9e5e 68%,#ffc46b 82%,#3d2b52 100%)';
  }

  return { makeAtlas: makeAtlas, TILES: TILES, skyGradientCSS: skyGradientCSS };
})();
