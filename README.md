# Flying Japan — the 1903 Wright Flyer

A browser flight game built with [Three.js](https://threejs.org/). You fly the
1903 Wright Flyer, launched from its 60-foot rail into a headwind, through a
valley of cedar, pine and maple, under twelve giant torii gates, past a lakeside
village, a shrine and a five-storey pagoda, with a snow-capped volcano on the
horizon.

Everything you see is generated in the browser from a seed: the aircraft, the
trees, the torii, the houses and the mountains. There are no model files, no
textures and no sound files. The only download is the Three.js library itself
(from a CDN via an import map).

## Play

**Online:** the `Deploy to GitHub Pages` workflow publishes `main` to GitHub
Pages. Enable it once under *Settings → Pages → Build and deployment → Source:
GitHub Actions*, then every push to `main` deploys.

**Low-end GPUs:** add `?low` to the URL to turn off shadows and antialiasing.

**Locally:** ES modules do not load from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Controls

| Key | Action |
| --- | --- |
| `Shift` / `Ctrl` (or `Z` / `X`) | throttle up / down |
| `↑` `↓` or `W` `S` | elevator: pull up / push down (`I` inverts) |
| `←` `→` or `A` `D` | wing warping: bank left / right (the rudder is coupled, as on the real Flyer) |
| `Q` `E` | rudder |
| `C` | cycle camera: chase, pilot (prone, head forward), orbit |
| `R` | reset to the rail |
| `P` | pause, `M` mute, `H` toggle help |

Touch screens get an on-screen stick and throttle buttons; a gamepad works too
(left stick, triggers for throttle).

**Taking off:** hold `Shift` until the Flyer accelerates down the rail. It
rotates on its own at about 45 km/h; ease back on `↑` and climb gently. Above
roughly 15° angle of attack the wing stalls and the nose drops. Land on the
skids, level, with the throttle closed.

**The course:** fly under each glowing torii in order. The compass arrow at the
bottom points at the next gate. The timer starts when you open the throttle;
your best time is kept in `localStorage`.

## The aircraft

The model is built from primitives to the published dimensions of the
original, which hangs in the Smithsonian's National Air and Space Museum:

| | |
| --- | --- |
| Wingspan | 40 ft 4 in (12.29 m) |
| Chord / gap | 6 ft 6 in (1.98 m) / 6 ft 2 in (1.88 m) |
| Wing area | 510 sq ft (47 m²), camber 1-in-20, about 10 in of anhedral |
| Length | 21 ft 1 in (6.43 m) |
| Canard elevator | two surfaces, 12 ft × 2.5 ft, ahead of the wing |
| Rudder | twin surfaces, about 6.9 ft × 1.5 ft, behind the wing |
| Propellers | two 8 ft 6 in (2.59 m) pushers, counter-rotating through a crossed chain, about 348 rpm |
| Engine | Charles Taylor's 12 hp four-cylinder, mounted on the lower wing right of centre |
| Pilot | prone on the lower wing, left of centre, steering with a hip cradle |
| Weight | 605 lb empty, 745 lb with pilot |
| Speed | about 30 mph through the air on 17 December 1903 |

Details reproduced in the model: the interplane struts and cross-bracing wires,
the skids and the forward outriggers that carry the canard, the rudder booms,
the chain tubes to the propeller shafts, the tall narrow radiator on the inner
strut, the fuel can under the upper wing, the flywheel, the rib lines on the
muslin and the wing warping (the wing tips really twist when you bank).

The flight model is a simplified six-degree-of-freedom simulation using the
Flyer's mass, wing area, a cambered lift curve, a stall at ~15°, and high
parasite drag. The engine is a little stronger than the historic 12 hp so the
aircraft can climb out of the valley; the historic Flyer could barely sustain
level flight.

Sources: the [Smithsonian NASM](https://airandspace.si.edu/collection-objects/1903-wright-flyer/nasm_A19610048000)
record and the museum's [propeller](https://si.edu/object/wright-brothers-propeller-fixed-pitch-1903-wright-flyer:nasm_A19830381000),
the [wright-brothers.org](https://wright-brothers.org/Information_Desk/Just_the_Facts/Airplanes/Flyer_I.htm)
fact sheet and [specification drawing](https://wright-brothers.org/Information_Desk/Help_with_Homework/Wright_Plans/Wright_Plans_images/1903_Wright_Flyer_Specifications_Isometric_11x17.pdf),
the Flight Safety Foundation's [December 2003 Aviation Mechanics Bulletin](https://flightsafety.org/ap/ap_dec03.pdf),
Deters, Broughton & Selig, [*Dynamic Wind-Tunnel Testing of a Flight-Model of the 1903 Wright Flyer*](https://m-selig.web.engr.illinois.edu/pubs/DetersBroughtonSelig-2004-AIAA-2004-0211-WrightFlyers.pdf) (AIAA 2004-0211),
and [Wikipedia](https://en.wikipedia.org/wiki/Wright_Flyer).

## How the world is built

| Module | What it does |
| --- | --- |
| `src/rng.js` | seeded PRNG (mulberry32) and gradient noise with fBm and ridged variants |
| `src/terrain.js` | analytic height field: valley floor, hill belt, mountain ring, peaks, volcano, lake basin, launch meadow; a radially warped grid mesh with height/slope colouring |
| `src/trees.js` | five species (sugi cedar, matsu pine, momiji maple, ginkgo, bamboo) in several variants, drawn with chunked `InstancedMesh` and a spatial hash for collisions |
| `src/torii.js` | Myojin-style torii: leaning pillars, nuki, shimaki, curved black kasagi, gakuzuka |
| `src/buildings.js` | thatched and tiled minka with shoji walls, a five-storey pagoda, a shrine hall, stone lanterns, the launch rail and dolly, a hangar |
| `src/flyer.js` | the aircraft, with animated elevator, rudders, wing warping and propellers |
| `src/physics.js` | flight model, ground contact on twelve body points, the launch rail |
| `src/world.js` | places gates, village, shrine, pagoda, the torii path and about 18,000 trees |
| `src/sky.js` | gradient sky shader, sun with a shadow camera that follows the aircraft, drifting clouds |
| `src/audio.js` | engine thump, propeller wash and wind from Web Audio oscillators and filtered noise |
| `src/main.js` | game loop, cameras, gates, collisions, HUD |

## License

MIT, see `LICENSE`.
