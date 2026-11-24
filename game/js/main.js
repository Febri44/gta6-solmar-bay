// main.js — Solmar Bay bootstrap + render loop.
//
// Loads in order: util, textures, city, renderer, traffic, police,
// missions, audio, game, then this file. Starts on the title screen;
// audio unlocks on the first click ("CLICK TO START").
//
// Screenshot staging (?shot=title|driving|chase):
//   title   — title screen over the city at sunset
//   driving — player in the car mid-traffic on a busy street
//   chase   — wanted 2, two police units closing in behind the player

var Main = (function () {
  var canvas, renderer, arrowEl;
  var running = false;
  var lastT = 0;
  var shotMode = null;
  var vehMb = null, pedMb = null;
  var errors = [];

  window.addEventListener('error', function (e) {
    errors.push(String(e.message || e.error));
  });

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function stageShot(mode) {
    shotMode = mode;
    var p = Game.player;
    if (mode === 'driving') {
      p.x = 0; p.z = 40; p.heading = 0; p.inCar = true; p.speed = 9;
      Game.setDemoDrive(true); // hold the accelerator for the shot
      Game.showToast('', 0);
    } else if (mode === 'chase') {
      p.x = 0; p.z = 40; p.heading = 0; p.inCar = true; p.speed = 12;
      Game.setDemoDrive(true);
      Police.addHeat(45); // wanted 2
      Police.update(0.1, p, null);
      Police.update(0.1, p, null);
      // Put one unit visibly behind the player.
      if (Police.units.length > 0) {
        Police.units[0].x = p.x - 14;
        Police.units[0].z = p.z + 3;
        Police.units[0].heading = 0;
      }
    }
    // title: leave the player on foot at the spawn; the title overlay stays.
    // Stage nearby traffic on the player's street so the shot reads busy:
    // 9 cars on the same road, staggered ahead and behind the player.
    if (mode === 'driving' || mode === 'chase') {
      var staged = 0;
      Traffic.cars.forEach(function (c) {
        if (staged >= 9) return;
        c.axis = 'x'; c.road = 40; c.lane = staged % 2 ? 3 : -3;
        // Keep a clear band around the player so no staged car clips the
        // chase camera: four cars behind (-36..-12), five ahead (14..46).
        c.pos = staged < 4 ? -36 + staged * 8 : 14 + (staged - 4) * 8;
        c.speed = 8 + (staged % 3);
        staged++;
      });
    }
  }

  function boot() {
    document.body.style.background = TEX.skyGradientCSS();
    canvas = document.getElementById('game');
    arrowEl = document.getElementById('mission-arrow');
    renderer = Renderer.create(canvas);
    Game.init(canvas);

    function resize() {
      renderer.resize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', resize);
    resize();

    vehMb = new renderer.MeshBuilder();
    pedMb = new renderer.MeshBuilder();

    var shot = qs('shot');
    if (shot === 'driving' || shot === 'chase' || shot === 'title') {
      stageShot(shot);
    }

    var title = document.getElementById('title');
    var startBtn = document.getElementById('start-btn');
    function startGame() {
      AudioSys.init();
      title.style.display = 'none';
      if (!running) {
        running = true;
        lastT = performance.now();
        requestAnimationFrame(frame);
      }
      // In shot modes the loop also runs behind the title until clicked;
      // for screenshots we auto-start so the scene is live.
    }
    startBtn.addEventListener('click', startGame);
    title.addEventListener('click', startGame);

    // Shot modes auto-start (no click) so headless screenshots render the
    // live scene; title mode keeps the overlay visible.
    if (shot === 'driving' || shot === 'chase') {
      title.style.display = 'none';
      AudioSys.init();
      running = true;
      lastT = performance.now();
      requestAnimationFrame(frame);
    } else {
      // Title screen still renders the city behind the overlay.
      running = true;
      lastT = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    var titleVisible = document.getElementById('title').style.display !== 'none';
    if (!titleVisible) {
      Game.update(dt);
    } else {
      // Slow orbital camera behind the title so the city reads alive:
      // orbit downtown at height 14, looking at the centre.
      var t = now / 1000;
      var a = t * 0.05;
      var cp = Game.camPos(), ct = Game.camTarget();
      cp.x = Math.cos(a) * 60; cp.y = 14; cp.z = Math.sin(a) * 60;
      ct.x = 0; ct.y = 4; ct.z = 0;
      Traffic.update(dt, t);
      Game.updateHUD(); // keep HUD + minimap live behind the title
    }

    // Rebuild dynamic meshes every frame (Uint32 indices — see renderer.js).
    vehMb.pos.length = 0; vehMb.nor.length = 0; vehMb.col.length = 0;
    vehMb.uv.length = 0; vehMb.idx.length = 0;
    pedMb.pos.length = 0; pedMb.nor.length = 0; pedMb.col.length = 0;
    pedMb.uv.length = 0; pedMb.idx.length = 0;
    Traffic.buildVehicleMesh(vehMb, Game.player, Police.units);
    Traffic.buildPedMesh(pedMb, now / 1000);

    var eye = Game.camPos(), tgt = Game.camTarget();
    var proj = Renderer.perspective(62, canvas.width / canvas.height, 0.1, 900);
    var view = Renderer.lookAt(eye, tgt, { x: 0, y: 1, z: 0 });
    var vp = Renderer.multiply(proj, view);
    renderer.render(vp, vehMb, pedMb);

    // Mission arrow: points toward the target, rotates with the camera.
    if (arrowEl) {
      var ang = Game.targetAngle();
      if (ang !== null && !titleVisible) {
        var rel = ang - Math.atan2(tgt.z - eye.z, tgt.x - eye.x);
        arrowEl.style.display = 'block';
        arrowEl.style.transform = 'translateX(-50%) rotate(' + (rel * 180 / Math.PI + 90) + 'deg)';
      } else {
        arrowEl.style.display = 'none';
      }
    }

    requestAnimationFrame(frame);
  }

  // Exposed for headless play-tests.
  function testState() {
    return {
      errors: errors,
      player: { x: Game.player.x, z: Game.player.z, inCar: Game.player.inCar, money: Game.player.money, health: Game.player.health },
      wanted: Police.wantedLevel(),
      policeUnits: Police.units.length,
      mission: Missions.current().name,
      missionActive: Missions.state.active,
      peds: Traffic.peds.length,
      traffic: Traffic.cars.length,
      staticVerts: renderer ? renderer.staticVerts : 0
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
  return { testState: testState, errors: errors };
})();
