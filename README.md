# Solmar Bay — a GTA-style open-world game in the browser

A Vice City-style sunset coastal city, 3D in the browser. Walk the streets,
steal a car, outrun the cops, run three missions, and catch the sunset over
the bay. Built for the make.fun `gta6-01` bounty.

## Play

```sh
node serve.ts        # http://localhost:8080
```

Or build the distributable bundle:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Open `out/index.html` via any static server. No network, no external
assets — every texture is generated procedurally at boot, every script is a
relative classic `<script>` include.

## Controls

| Key | Action |
| --- | ------ |
| WASD / arrows | Walk / drive |
| E | Enter / exit nearest car |
| SPACE | Brake / handbrake |
| R | Next radio station |
| M | Mute |

## The city

- ~215 pedestrians walking the sidewalks (never cutting across blocks)
- ~70 moving traffic cars + ~20 parked cars
- 3 building types (slim towers, mid blocks, low shops with awnings),
  rooftop AC units and antennas, tapered palm trunks, real zebra crossings
- Sunset lighting: warm low sun, fog haze, gradient sky, bay water

## Missions

1. **Courier Run** — deliver a package to the marina before the timer ($150)
2. **Hot Pickup** — collect 5 packages while wanted climbs ($300)
3. **Beach Sprint** — checkpoint race down the beach road ($500)

Wanted level 0–5 stars: hitting pedestrians or police, or stealing a car,
raises heat. Police units chase and ram you at wanted ≥ 1. Shops heal you,
the safehouse restores health and cools wanted down.

## Tech notes

- Custom WebGL1 renderer, no libraries. One static city mesh + two
  dynamic meshes (vehicles, pedestrians) rebuilt every frame.
- Dynamic meshes exceed 65,536 vertices, so indices are **Uint32** —
  16-bit indices wrap and silently drop geometry.
- The chase camera sits close and low while driving so the near field
  (pedestrians, traffic, shop fronts) reads crowded.
- Audio is pure WebAudio: engine hum pitched to speed, three synth radio
  stations, siren, crash and pickup sounds. Starts after the first click.

## Files

```
game/index.html        entry point
game/css/style.css     HUD + title screen
game/js/util.js        math + seeded RNG + collisions
game/js/textures.js    procedural 512px texture atlas
game/js/city.js        city layout + static geometry
game/js/renderer.js    WebGL renderer + MeshBuilder
game/js/traffic.js     pedestrians, traffic, parked cars
game/js/police.js      wanted level + pursuit
game/js/missions.js    the three missions
game/js/audio.js       WebAudio engine / radio / siren
game/js/game.js        player, physics, camera, HUD, minimap
game/js/main.js        bootstrap, loop, ?shot= staging
main.ts                copy + validate game/ to $MAKEFUN_OUTPUT_DIR
serve.ts               static dev server on :8080
```

## Screenshot staging

`?shot=title` — title screen over the city.
`?shot=driving` — player driving mid-traffic.
`?shot=chase` — wanted 2, police closing in behind.

Screenshots live in `screenshots/` (1-chase.jpg, 2-driving.jpg, 3-title.jpg),
captured headless from the running game — never mocked.

## License

MIT — see LICENSE.
