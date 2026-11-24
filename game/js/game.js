// game.js — Solmar Bay game state: player on foot / in car, arcade car
// physics, collisions (circle vs building AABBs + world bounds), the close
// low chase camera, HUD + minimap, shops and the safehouse.

var Game = (function () {
  var player = {
    x: 0, z: 0, heading: 0,
    speed: 0,           // signed forward speed (units/s)
    inCar: false,
    health: 100,
    money: 250,
    onFootSpeed: 6
  };
  var keys = {};
  var time = 0;             // seconds since start
  var clockMinutes = 18 * 60 + 12; // 18:12 — sunset
  var camYaw = 0, camPitch = 0.32;
  var camPos = { x: 0, y: 6, z: 12 };
  var camTarget = { x: 0, y: 1, z: 0 };
  var crashCooldown = 0;
  var shopCooldown = 0;
  var demoDrive = false;   // screenshot staging: hold the accelerator
  var toast = '';
  var toastTimer = 0;
  var nearCar = null;      // nearest enterable car
  var minimap = null;
  var hud = {};

  var CAR = {
    accel: 22, brake: 34, reverseMax: 9, topSpeed: 30,
    steer: 2.1, grip: 0.92, radius: 1.9
  };

  function init(canvas) {
    Traffic.init();
    Police.reset();
    Missions.reset();
    Missions.start(0);
    hud = {
      speed: document.getElementById('hud-speed'),
      money: document.getElementById('hud-money'),
      stars: document.getElementById('hud-stars'),
      mission: document.getElementById('hud-mission'),
      clock: document.getElementById('hud-clock'),
      radio: document.getElementById('hud-radio'),
      toast: document.getElementById('hud-toast'),
      hint: document.getElementById('hud-hint'),
      health: document.getElementById('hud-health')
    };
    minimap = document.getElementById('minimap');
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'KeyE') tryEnterExitCar();
      if (e.code === 'KeyR') setRadio(AudioSys.nextStation());
      if (e.code === 'KeyM') AudioSys.toggleMute();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { keys = {}; });
  }

  function setRadio(name) {
    if (hud.radio) hud.radio.textContent = name;
  }

  function showToast(msg, secs) {
    toast = msg; toastTimer = secs || 3;
  }

  // Nearest parked/traffic car within 4 units (only when on foot).
  function findNearCar() {
    if (player.inCar) return null;
    var best = null, bd = 4.5;
    Traffic.parked.forEach(function (c) {
      var p = Traffic.carPos(c);
      var d = dist2d(player.x, player.z, p.x, p.z);
      if (d < bd) { bd = d; best = { kind: 'parked', ref: c, x: p.x, z: p.z, heading: Traffic.carHeading(c) }; }
    });
    Traffic.cars.forEach(function (c) {
      if (Math.abs(c.speed) > 1) return; // only stopped traffic is stealable
      var p = Traffic.carPos(c);
      var d = dist2d(player.x, player.z, p.x, p.z);
      if (d < bd) { bd = d; best = { kind: 'traffic', ref: c, x: p.x, z: p.z, heading: Traffic.carHeading(c) }; }
    });
    return best;
  }

  function tryEnterExitCar() {
    if (!player.inCar) {
      if (nearCar) {
        player.inCar = true;
        player.heading = nearCar.heading;
        player.speed = 0;
        player.x = nearCar.x; player.z = nearCar.z;
        if (nearCar.kind === 'traffic') Police.addHeat(14);
        AudioSys.chime();
        showToast('You\'re driving. WASD to drive, SPACE to brake.', 3);
      }
    } else {
      player.inCar = false;
      player.speed = 0;
      // Step out to the side of the car.
      var px = -Math.sin(player.heading), pz = Math.cos(player.heading);
      player.x += px * 2.4; player.z += pz * 2.4;
      showToast('On foot. Walk to a parked car and press E.', 3);
    }
  }

  function collideBuildings(x, z, r) {
    var out = { x: x, z: z, hit: false, hard: 0 };
    CITY.colliders.forEach(function (c) {
      var push = circleVsAabb(out.x, out.z, r, c.minx, c.minz, c.maxx, c.maxz);
      if (push) {
        out.x += push.x; out.z += push.z;
        out.hit = true;
        out.hard = Math.max(out.hard, Math.abs(push.x) + Math.abs(push.z));
      }
    });
    out.x = clamp(out.x, -CITY.BOUND, CITY.BOUND);
    out.z = clamp(out.z, -CITY.BOUND, CITY.BOUND);
    return out;
  }

  function update(dt) {
    time += dt;
    clockMinutes += dt * 0.35; // a game hour every ~3 real minutes
    if (crashCooldown > 0) crashCooldown -= dt;
    if (shopCooldown > 0) shopCooldown -= dt;
    if (toastTimer > 0) toastTimer -= dt;

    var fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    if (demoDrive && player.inCar) fwd = 1;
    var steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
    var brake = keys.Space ? 1 : 0;

    if (player.inCar) {
      // Arcade car: accel / brake / reverse, steering scales with speed.
      if (fwd > 0) player.speed += CAR.accel * dt;
      else if (fwd < 0) {
        if (player.speed > 0.5) player.speed -= CAR.brake * dt;
        else player.speed -= CAR.accel * 0.6 * dt;
      } else {
        player.speed -= player.speed * 1.6 * dt;
      }
      if (brake) player.speed -= Math.sign(player.speed) * CAR.brake * 1.4 * dt;
      player.speed = clamp(player.speed, -CAR.reverseMax, CAR.topSpeed);
      if (Math.abs(player.speed) < 0.05 && fwd === 0) player.speed = 0;
      var steerAmt = steer * CAR.steer * clamp(Math.abs(player.speed) / 8, 0, 1);
      player.heading += steerAmt * dt * Math.sign(player.speed || 1) * -1;
      // Note: heading 0 = +x; steering left (A) turns toward -z, hence -1.
      var nx = player.x + Math.cos(player.heading) * player.speed * dt;
      var nz = player.z + Math.sin(player.heading) * player.speed * dt;
      var col = collideBuildings(nx, nz, CAR.radius);
      if (col.hit && Math.abs(player.speed) > 6 && crashCooldown <= 0) {
        AudioSys.crash(clamp(Math.abs(player.speed) / CAR.topSpeed, 0, 1));
        player.health = Math.max(0, player.health - 4);
        crashCooldown = 0.6;
        showToast('Crash! Health ' + Math.round(player.health), 2);
      }
      if (col.hit) player.speed *= 0.55;
      player.x = col.x; player.z = col.z;
      // Hitting a pedestrian is a crime.
      Traffic.peds.forEach(function (p) {
        var pp = Traffic.pedPos(p);
        if (dist2d(player.x, player.z, pp.x, pp.z) < 2.2 && Math.abs(player.speed) > 3) {
          if (crashCooldown <= 0) {
            Police.addHeat(22);
            AudioSys.crash(0.5);
            crashCooldown = 1.0;
            showToast('You hit a pedestrian! Wanted up.', 2.5);
          }
        }
      });
    } else {
      // On foot: WASD moves relative to camera yaw.
      var mx = 0, mz = 0;
      if (keys.KeyW || keys.ArrowUp) { mx += Math.cos(camYaw); mz += Math.sin(camYaw); }
      if (keys.KeyS || keys.ArrowDown) { mx -= Math.cos(camYaw); mz -= Math.sin(camYaw); }
      if (keys.KeyA || keys.ArrowLeft) { mx += Math.sin(camYaw); mz -= Math.cos(camYaw); }
      if (keys.KeyD || keys.ArrowRight) { mx -= Math.sin(camYaw); mz += Math.cos(camYaw); }
      var ml = Math.sqrt(mx * mx + mz * mz);
      if (ml > 0) {
        mx /= ml; mz /= ml;
        player.heading = Math.atan2(mz, mx);
        var nx2 = player.x + mx * player.onFootSpeed * dt;
        var nz2 = player.z + mz * player.onFootSpeed * dt;
        var col2 = collideBuildings(nx2, nz2, 0.6);
        player.x = col2.x; player.z = col2.z;
      }
      nearCar = findNearCar();
    }

    // World systems.
    Traffic.update(dt, time);
    var bustedCash = 0;
    Police.update(dt, player, function () {
      bustedCash = Math.min(player.money, 50);
      player.money -= bustedCash;
      Police.addHeat(-30);
      showToast('Busted! The cops shook you down for ' + formatMoney(bustedCash), 3);
    });

    // Missions.
    var earned = Missions.update(dt, player.x, player.z);
    if (earned > 0) {
      player.money += earned;
      AudioSys.chime();
    }
    if (Missions.state.messageTimer > 0) {
      // Mission banner text is shown through the HUD mission line.
    }

    // Shops & safehouse: stand close to use (5s cooldown so a shop
    // cannot drain the wallet once per frame while standing next to it).
    CITY.shops.forEach(function (s) {
      if (dist2d(player.x, player.z, s.x, s.z) < 5 && shopCooldown <= 0) {
        if (s.kind === 'health' && player.health < 100 && player.money >= s.price) {
          player.health = Math.min(100, player.health + 40);
          player.money -= s.price;
          shopCooldown = 5;
          showToast(s.name + ': patched up (-' + formatMoney(s.price) + ')', 2.5);
          AudioSys.chime();
        } else if (s.kind === 'repair' && player.inCar) {
          shopCooldown = 5;
          showToast(s.name + ': car detailed. Looking fresh.', 2.5);
          AudioSys.chime();
        } else if (s.kind === 'cash') {
          shopCooldown = 5;
          showToast(s.name + ': new threads. Looking sharp.', 2.5);
        }
      }
    });
    if (dist2d(player.x, player.z, CITY.safehouse.x, CITY.safehouse.z) < 6) {
      if (player.health < 100) {
        player.health = 100;
        showToast('Safehouse — health restored. Wanted cooling off.', 3);
      }
      Police.addHeat(-dt * 2);
    }

    // Camera: ROUND 4 CHANGE — chase cam is close and low while driving so
    // the near field (peds, traffic, shop fronts) reads crowded.
    // camYaw = heading puts the camera BEHIND the car (camPos subtracts the
    // forward vector); heading+PI would put it in front.
    var targetYaw = player.inCar ? player.heading : camYaw;
    if (player.inCar) {
      camYaw = angLerp(camYaw, targetYaw, clamp(dt * 3.2, 0, 1));
      var back = 7.5, up = 2.4;
      // Hard follow: the camera sits exactly `back` behind the car every
      // frame. A lerped follow lags ~speed/rate units at top speed and the
      // car shrinks out of the near field — the round-4 camera must stay
      // close and low.
      camPos.x = player.x - Math.cos(camYaw) * back;
      camPos.y = up;
      camPos.z = player.z - Math.sin(camYaw) * back;
      camTarget.x = player.x + Math.cos(player.heading) * 6;
      camTarget.y = 1.2;
      camTarget.z = player.z + Math.sin(player.heading) * 6;
    } else {
      camYaw = player.heading;
      var bx = player.x - Math.cos(camYaw) * 5.5;
      var bz = player.z - Math.sin(camYaw) * 5.5;
      camPos.x = lerp(camPos.x, bx, clamp(dt * 8, 0, 1));
      camPos.y = lerp(camPos.y, 3.0, clamp(dt * 8, 0, 1));
      camPos.z = lerp(camPos.z, bz, clamp(dt * 8, 0, 1));
      camTarget.x = player.x;
      camTarget.y = 1.4;
      camTarget.z = player.z;
    }

    // Audio follows state.
    AudioSys.setEngine(player.inCar ? Math.abs(player.speed) / CAR.topSpeed : 0, player.inCar);
    AudioSys.setSiren(Police.wantedLevel() >= 1);

    updateHUD();
  }

  function updateHUD() {
    if (!hud.speed) return;
    var kmh = Math.round(Math.abs(player.speed) * 3.6);
    hud.speed.textContent = player.inCar ? kmh + ' km/h' : 'ON FOOT';
    hud.money.textContent = formatMoney(player.money);
    hud.health.textContent = '♥ ' + Math.round(player.health);
    var st = Police.wantedLevel();
    hud.stars.textContent = st > 0 ? '★'.repeat(st) + '☆'.repeat(5 - st) : '☆☆☆☆☆';
    hud.stars.style.color = st >= 3 ? '#ff5252' : (st >= 1 ? '#ffb02e' : '#ffffff');
    hud.clock.textContent = formatClock(clockMinutes);
    var m = Missions.current();
    var t = Missions.targetPos();
    var dist = t ? Math.round(dist2d(player.x, player.z, t.x, t.z)) : 0;
    var missionLine = m.name + ' — ' + Missions.targetLabel() +
      (t ? ' · ' + dist + 'm' : '') +
      (Missions.state.active ? ' · ' + formatTime(Missions.state.timeLeft) : '');
    if (Missions.state.messageTimer > 0 && Missions.state.message) {
      missionLine = Missions.state.message;
    }
    hud.mission.textContent = missionLine;
    if (hud.radio) hud.radio.textContent = AudioSys.stationName();
    if (hud.toast) {
      hud.toast.textContent = toastTimer > 0 ? toast : '';
      hud.toast.style.opacity = toastTimer > 0 ? '1' : '0';
    }
    if (hud.hint) {
      hud.hint.textContent = player.inCar
        ? 'WASD drive · SPACE brake · E exit car · R radio'
        : (nearCar ? 'Press E to enter the car' : 'WASD walk · E enter car · R radio');
    }
    drawMinimap();
  }

  function drawMinimap() {
    if (!minimap) return;
    var ctx = minimap.getContext('2d');
    var S = minimap.width;
    var scale = S / (CITY.BOUND * 2 + 40);
    function toX(x) { return (x + CITY.BOUND + 20) * scale; }
    function toZ(z) { return (z + CITY.BOUND + 20) * scale; }
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(20,16,34,0.85)';
    ctx.fillRect(0, 0, S, S);
    // Roads.
    ctx.strokeStyle = '#8a8a92';
    ctx.lineWidth = 2;
    CITY.ROADS.forEach(function (r) {
      ctx.beginPath(); ctx.moveTo(toX(r), 0); ctx.lineTo(toX(r), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toZ(r)); ctx.lineTo(S, toZ(r)); ctx.stroke();
    });
    // Beach + water.
    ctx.fillStyle = '#e6c98f';
    ctx.fillRect(toX(CITY.BEACH_X), 0, (CITY.WATER_X - CITY.BEACH_X) * scale, S);
    ctx.fillStyle = '#2e5f8a';
    ctx.fillRect(toX(CITY.WATER_X), 0, S - toX(CITY.WATER_X), S);
    // Mission target.
    var t = Missions.targetPos();
    if (t) {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(toX(t.x), toZ(t.z), 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(toX(t.x), toZ(t.z), 8 + Math.sin(time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Police.
    ctx.fillStyle = '#4da3ff';
    Police.units.forEach(function (u) {
      ctx.beginPath(); ctx.arc(toX(u.x), toZ(u.z), 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // Shops.
    ctx.fillStyle = '#7dff8a';
    CITY.shops.forEach(function (s) {
      ctx.fillRect(toX(s.x) - 2, toZ(s.z) - 2, 4, 4);
    });
    // Player arrow.
    ctx.save();
    ctx.translate(toX(player.x), toZ(player.z));
    ctx.rotate(player.heading);
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Mission target arrow: screen-space direction is drawn by main.js as a
  // DOM arrow; this returns the world-space angle to the target.
  function targetAngle() {
    var t = Missions.targetPos();
    if (!t) return null;
    return Math.atan2(t.z - player.z, t.x - player.x);
  }

  function setDemoDrive(v) { demoDrive = v; }

  return {
    init: init, update: update, updateHUD: updateHUD, player: player, setDemoDrive: setDemoDrive,
    camPos: function () { return camPos; },
    camTarget: function () { return camTarget; },
    targetAngle: targetAngle, showToast: showToast,
    CAR: CAR
  };
})();
