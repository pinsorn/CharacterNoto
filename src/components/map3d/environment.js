// Environment system for the voxel 3D map: sky dome, sun/ambient/hemisphere lighting driven by
// time-of-day, a star field at night, weather particles (rain/snow), and exponential fog.
//
// Design contract (imported verbatim by the overseer in Map3DTab.svelte):
//   createEnvironment(scene, THREE) -> { apply(env), update(dt, env) -> {minuteOfDay}, dispose() }
//
// IMPORTANT — only `Sky` is imported here. EVERY other three.js class comes from the injected
// `THREE` param so the module imports cleanly in node (no WebGL) and so the test can inject a fake
// THREE. Do NOT add `import * as THREE from 'three'`. In the real app the injected THREE is the
// same `three` instance Sky was built from, so copying an injected Vector3 into a Sky uniform is
// safe (no dual-module hazard). All THREE object creation is lazy (inside createEnvironment), so
// `import()` of this file succeeds under node where WebGL is unavailable.
//
// SEASON SCOPE LIMITATION: this layer only tints the SKY / LIGHTS / FOG mood per season (warmer in
// autumn, cooler/whiter in winter, fresh in spring, vivid in summer). Per-biome terrain palette
// recolouring is NOT done here — that belongs to a later voxel-material layer.

import { Sky } from 'three/addons/objects/Sky.js';

const TAU = Math.PI * 2;
const DEG2RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Per-season mood tweaks (multiplicative tint applied to sun/ambient/hemi/fog + small sky nudges).
// `light` scales overall light intensity; `turb`/`ray` nudge the sky's turbidity/rayleigh.
const SEASON = {
  spring: { tint: 0xeefff1, light: 1.0, turb: 0, ray: 0.0 },
  summer: { tint: 0xfff6e0, light: 1.08, turb: -1, ray: -0.2 },
  autumn: { tint: 0xffd6a6, light: 0.98, turb: 1, ray: 0.3 },
  winter: { tint: 0xe6efff, light: 0.9, turb: 1, ray: -0.1 },
};

// Weather -> extra fog density added on top of the radius-derived base.
const WEATHER_FOG = { fog: 0.06, storm: 0.03, rain: 0.015, snow: 0.02 };

const STAR_COUNT = 1400;
const MAP = 32; // world is 32x32 voxels, centred on (16, *, 16)

/**
 * Create the environment. Builds & adds all objects to `scene`; returns the control API.
 * @param {object} scene - THREE.Scene (or a forgiving stub in tests).
 * @param {object} THREE - the live three.js namespace (injected by the overseer).
 * @returns {{ apply:(env:object)=>void, update:(dt:number, env:object)=>{minuteOfDay:number}, dispose:()=>void }}
 */
export function createEnvironment(scene, THREE) {
  const CENTER = new THREE.Vector3(MAP / 2, 0, MAP / 2);
  const sunDir = new THREE.Vector3();

  // lerp two hex colours into a fresh THREE.Color.
  const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));

  // --- sky dome ----------------------------------------------------------
  const sky = new Sky();
  sky.scale.setScalar(4000);
  scene.add(sky);

  // --- lights ------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(60, 100, 60);
  sun.target.position.copy(CENTER);
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0x668bbf, 0.3);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x88aaff, 0x444433, 0.3);
  scene.add(hemi);

  // --- star field (hidden by day) ---------------------------------------
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * TAU;
    const polar = Math.acos(Math.random()); // upper hemisphere (y >= 0), uniform on the dome
    const r = 1800;
    const sp = Math.sin(polar);
    starPos[i * 3] = CENTER.x + r * sp * Math.sin(theta);
    starPos[i * 3 + 1] = CENTER.y + r * Math.cos(polar);
    starPos[i * 3 + 2] = CENTER.z + r * sp * Math.cos(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 2.0, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);

  // --- weather particles (rain / snow) ----------------------------------
  // PONYTAIL SHORTCUT: rain is drawn as fast small points, not true line streaks (the spec calls
  // for a THREE.Points system); fast downward motion reads as streaks at typical frame rates.
  const precipGeo = new THREE.BufferGeometry();
  let precipPos = new Float32Array(0);
  let precipAttr = new THREE.BufferAttribute(precipPos, 3);
  precipGeo.setAttribute('position', precipAttr);
  const precipMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.3, transparent: true, opacity: 0.8,
    depthWrite: false, sizeAttenuation: true,
  });
  const precip = new THREE.Points(precipGeo, precipMat);
  precip.frustumCulled = false;
  precip.visible = false;
  scene.add(precip);

  // --- internal state ----------------------------------------------------
  let minute = 720; // internal clock (minutes 0..1439); noon default
  let time = 0; // seconds accumulator for twinkle / drift
  let starBaseOpacity = 0;
  let precipMode = null; // 'rain' | 'snow' | null
  let precipCount = 0;
  let fallSpeed = 0;

  // Sun azimuth/elevation + sky uniforms + light/star mood for a given minute. Pure of weather.
  function recompute(min, env) {
    const season = SEASON[env && env.season] || SEASON.summer;
    const moonPhase = (env && env.moonPhase) || 0;

    const t = ((((min % 1440) + 1440) % 1440)) / 1440; // 0..1
    const elev = Math.sin((t - 0.25) * TAU); // -1 (midnight) .. +1 (noon)
    const elevDeg = elev * 80; // cap below true zenith so the top-down light reads better
    const aziDeg = t * 360; // sunrise(t=.25)->east(+X), noon->south(-Z), sunset(t=.75)->west(-X)
    sunDir.setFromSphericalCoords(1, (90 - elevDeg) * DEG2RAD, aziDeg * DEG2RAD);

    const day = clamp(elev, 0, 1); // 0 at/under horizon .. 1 at noon

    // sky uniforms: thicker/redder near the horizon, clearer/bluer at noon.
    const u = sky.material.uniforms;
    u.sunPosition.value.copy(sunDir);
    u.turbidity.value = clamp(8 + (1 - day) * 4 + season.turb, 1, 20);
    u.rayleigh.value = clamp(1.5 + (1 - day) * 1.8 + season.ray, 0.1, 4);
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;

    const tint = new THREE.Color(season.tint);

    // sun light: warm at dawn/dusk, white at noon, ~0 intensity at night.
    const sunColor = mix(0xfff4e2, 0xff7a33, (1 - day) * 0.9);
    sunColor.multiply(tint);
    sun.color.copy(sunColor);
    sun.intensity = clamp(elev, 0, 1) * 1.4 * season.light;
    sun.position.copy(sunDir).multiplyScalar(120).add(CENTER);
    sun.target.position.copy(CENTER);

    // ambient: dim blue at night, brighter neutral by day.
    const amb = mix(0x223a5e, 0xbfd4f2, day);
    amb.multiply(tint);
    ambient.color.copy(amb);
    ambient.intensity = lerp(0.14, 0.5, day) * season.light;

    // hemisphere: sky/ground gradient, same day/night swing.
    const hemiSky = mix(0x0a1430, 0x9ec4ff, day);
    hemiSky.multiply(tint);
    hemi.color.copy(hemiSky);
    hemi.groundColor.copy(mix(0x0a0a14, 0x6b6450, day));
    hemi.intensity = lerp(0.12, 0.55, day) * season.light;

    // stars: only below the horizon; brightness rises with a fuller moon, fades in as the sun sinks.
    const night = elev < 0;
    stars.visible = night;
    const moonFull = 1 - Math.abs(((((moonPhase % 8) + 8) % 8)) - 4) / 4; // 0 new .. 1 full
    starBaseOpacity = night ? (0.45 + 0.5 * moonFull) * clamp(-elev * 3, 0, 1) : 0;
  }

  // Horizon-ish sky colour for fog tint at a given minute.
  function horizonColor(min, seasonKey) {
    const t = ((((min % 1440) + 1440) % 1440)) / 1440;
    const elev = Math.sin((t - 0.25) * TAU);
    const day = clamp(elev, 0, 1);
    const c = mix(0x0b1020, 0xaec6e0, day);
    const dusk = clamp(1 - Math.abs(elev) * 4, 0, 1); // warm band around sunrise/sunset
    c.lerp(new THREE.Color(0xd98c5f), dusk * 0.55);
    c.multiply(new THREE.Color((SEASON[seasonKey] || SEASON.summer).tint));
    return c;
  }

  // (Re)allocate the precip buffer for a new particle count, scattered over the map box.
  function rebuildPrecip(count) {
    precipPos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      precipPos[i * 3] = Math.random() * MAP;
      precipPos[i * 3 + 1] = Math.random() * 50;
      precipPos[i * 3 + 2] = Math.random() * MAP;
    }
    precipAttr = new THREE.BufferAttribute(precipPos, 3);
    precipGeo.setAttribute('position', precipAttr);
    precipCount = count;
  }

  /**
   * Seek the whole environment to an env state object (the overseer's voxelEnv value).
   * @param {object} env - { mode, timeScale, minuteOfDay, day, season, moonPhase, weather, weatherIntensity, fogRadiusFt }
   */
  function apply(env) {
    // apply == "seek": time, sky, lights, stars all follow env.minuteOfDay (even in animated mode;
    // update() then plays forward from here — the overseer coordinates the two).
    minute = env.minuteOfDay;
    recompute(minute, env);

    const inten = clamp(env.weatherIntensity == null ? 0.5 : env.weatherIntensity, 0, 1);
    const horizon = horizonColor(minute, env.season);
    const r = env.fogRadiusFt || 0;
    const wAdd = WEATHER_FOG[env.weather] || 0;

    // Fog: larger radius -> thinner fog (density ~ 1/radius); weather thickens it. Weather 'fog'
    // forces a visible fog even at radius 0; otherwise radius 0 means no atmospheric fog.
    if (r > 0) {
      const d = clamp(5 / r, 0.002, 0.6) + wAdd * (0.5 + inten);
      scene.fog = new THREE.FogExp2(horizon, d);
    } else if (env.weather === 'fog') {
      scene.fog = new THREE.FogExp2(horizon, 0.04 + 0.06 * inten);
    } else {
      scene.fog = null;
    }

    // Weather particles: rain for rain/storm, snow for snow, hidden otherwise. Count scales with
    // intensity; rebuild the geometry only when the count changes (update() just moves points).
    const mode = (env.weather === 'rain' || env.weather === 'storm') ? 'rain'
      : env.weather === 'snow' ? 'snow' : null;
    let count = 0;
    if (mode === 'rain') count = Math.round(lerp(300, 2200, inten));
    else if (mode === 'snow') count = Math.round(lerp(150, 1200, inten));
    if (count !== precipCount) rebuildPrecip(count);

    precipMode = mode;
    precip.visible = mode !== null;
    if (mode === 'rain') {
      fallSpeed = env.weather === 'storm' ? 48 : 34;
      precipMat.color.set(0x9fb6ff);
      precipMat.size = 0.18;
      precipMat.opacity = 0.55;
    } else if (mode === 'snow') {
      fallSpeed = 3.2;
      precipMat.color.set(0xffffff);
      precipMat.size = 0.5;
      precipMat.opacity = 0.85;
    }
    precipMat.needsUpdate = true;
  }

  /**
   * Per-frame tick. Advances the internal clock in animated mode and recomputes time-driven
   * visuals; always animates weather particles and a subtle star twinkle.
   * @param {number} dt - seconds since last frame.
   * @param {object} env - current env state (read for mode/timeScale/season/moonPhase/minuteOfDay).
   * @returns {{minuteOfDay:number}} the internal minute (for the overseer's clock).
   */
  function update(dt, env) {
    time += dt;

    if (env && env.mode === 'animated') {
      minute = ((((minute + dt * (env.timeScale || 0)) % 1440) + 1440) % 1440);
      recompute(minute, env);
    } else if (env && typeof env.minuteOfDay === 'number') {
      // static: clock stays pinned to the env value (the last .apply() minute).
      minute = env.minuteOfDay;
    }

    // Always animate precipitation (recycle points to the top once they fall through the floor).
    if (precipMode && precipCount > 0) {
      const a = precipPos;
      for (let i = 0; i < precipCount; i++) {
        const o = i * 3;
        a[o + 1] -= fallSpeed * dt;
        if (precipMode === 'snow') {
          a[o] += Math.sin(time * 0.7 + i) * 0.6 * dt;
          a[o + 2] += Math.cos(time * 0.5 + i) * 0.6 * dt;
        }
        if (a[o + 1] < 0) {
          a[o + 1] = 50 + Math.random() * 6;
          a[o] = Math.random() * MAP;
          a[o + 2] = Math.random() * MAP;
        }
      }
      if (precipAttr) precipAttr.needsUpdate = true;
    }

    // Subtle star twinkle on top of the moon-driven base opacity.
    starMat.opacity = starBaseOpacity * (0.82 + 0.18 * Math.sin(time * 2.0));

    return { minuteOfDay: minute };
  }

  /** Remove all created objects from the scene and free GPU resources. */
  function dispose() {
    scene.remove(sky);
    scene.remove(sun);
    scene.remove(sun.target);
    scene.remove(ambient);
    scene.remove(hemi);
    scene.remove(stars);
    scene.remove(precip);
    if (sky.geometry && sky.geometry.dispose) sky.geometry.dispose();
    if (sky.material && sky.material.dispose) sky.material.dispose();
    starGeo.dispose();
    starMat.dispose();
    precipGeo.dispose();
    precipMat.dispose();
    scene.fog = null;
  }

  return { apply, update, dispose };
}
