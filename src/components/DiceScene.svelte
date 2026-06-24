<script>
  // Real 3D dice: Three.js render + cannon-es physics tumble. Each die is an N-gon barrel
  // (CylinderGeometry, N radial segments) with a strip canvas-texture of its face labels.
  // The OUTCOME is predetermined (fair RNG, see lib/dice3d), then after the physics tumble
  // each die eases to a "reveal" pose so the chosen face squares up to the camera.
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import * as CANNON from 'cannon-es';

  let { dice = [], onSettled } = $props();

  const R = 0.62; // barrel radius
  const H = 0.95; // barrel height (axis)
  const THROW_MS = 1300;
  const REVEAL_MS = 550;

  let container;
  let renderer, scene, camera, world, raf;
  let dieObjs = []; // { mesh, body, faces }
  let phase = 'idle'; // 'throw' | 'reveal' | 'idle'
  let phaseStart = 0;
  let pending = null; // results to reveal

  // --- label strip texture (N cells across, one per face) -----------------
  function labelTexture(faces) {
    const n = faces.length;
    const cell = 256;
    const cv = document.createElement('canvas');
    cv.width = cell * n;
    cv.height = cell;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#f3f4f6' : '#ffffff';
      ctx.fillRect(i * cell, 0, cell, cell);
      ctx.fillStyle = '#111827';
      ctx.font = `bold ${Math.min(140, Math.floor(420 / Math.max(1, String(faces[i]).length)))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(faces[i]), i * cell + cell / 2, cell / 2);
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 4;
      ctx.strokeRect(i * cell, 0, cell, cell);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  function buildDie(faces, colorHex) {
    const n = Math.max(3, faces.length);
    const geo = new THREE.CylinderGeometry(R, R, H, n);
    const side = new THREE.MeshStandardMaterial({ map: labelTexture(faces), roughness: 0.5, metalness: 0.1 });
    const cap = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, [side, cap, cap]); // [torso, top, bottom]
    scene.add(mesh);

    const body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(new CANNON.Vec3(R, H / 2, R)),
      position: new CANNON.Vec3(0, R, 0),
      allowSleep: true,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.3,
    });
    world.addBody(body);
    return { mesh, body, faces };
  }

  // Local outward normal of face i's centre (cylinder axis = Y).
  function faceNormal(i, n) {
    const a = (i + 0.5) * (2 * Math.PI / n);
    return new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); // matches CylinderGeometry theta start
  }
  // Quaternion that turns face i to face the camera (+Z), with a slight downward tilt to read it.
  function revealQuat(i, n) {
    const q = new THREE.Quaternion().setFromUnitVectors(faceNormal(i, n), new THREE.Vector3(0, 0, 1));
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.25);
    return tilt.multiply(q);
  }

  function layout(n) {
    // centred row of n dice, spacing by radius
    return (i) => (i - (n - 1) / 2) * (R * 2.4);
  }

  function rebuildDice() {
    for (const d of dieObjs) {
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      world.removeBody(d.body);
    }
    dieObjs = [];
    const colors = [0x7c3aed, 0xdb2777, 0x06b6d4, 0x36d399, 0xfbbd23, 0xf87272, 0x3abff8];
    const xAt = layout(dice.length);
    dice.forEach((d, i) => {
      const obj = buildDie(d.faces?.length ? d.faces : ['?'], colors[i % colors.length]);
      // resting reveal pose at start so the dice are visible before the first roll
      obj.mesh.position.set(xAt(i), R, 1);
      obj.mesh.quaternion.copy(revealQuat(0, Math.max(3, (d.faces || ['?']).length)));
      obj.body.position.set(xAt(i), R, 1);
      obj.body.sleep();
      dieObjs.push(obj);
    });
  }

  // Throw the dice; `results` = [{ id, idx, label }] predetermined outcomes (same order as dice).
  export function roll(results) {
    pending = results;
    const xAt = layout(dieObjs.length);
    dieObjs.forEach((d, i) => {
      d.body.wakeUp();
      d.body.position.set(xAt(i) * 0.4, 4 + Math.random() * 1.5, -1 + Math.random());
      d.body.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.body.velocity.set((Math.random() - 0.5) * 3, -2, 3 + Math.random() * 2);
      d.body.angularVelocity.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    });
    phase = 'throw';
    phaseStart = performance.now();
  }

  function startReveal() {
    phase = 'reveal';
    phaseStart = performance.now();
    const xAt = layout(dieObjs.length);
    dieObjs.forEach((d, i) => {
      const res = pending[i];
      const n = Math.max(3, d.faces.length);
      d._fromPos = d.mesh.position.clone();
      d._fromQuat = d.mesh.quaternion.clone();
      d._toPos = new THREE.Vector3(xAt(i), R, 1);
      d._toQuat = revealQuat(res ? res.idx : 0, n);
    });
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (phase === 'throw') {
      world.step(1 / 60);
      let allAsleep = true;
      for (const d of dieObjs) {
        d.mesh.position.copy(d.body.position);
        d.mesh.quaternion.copy(d.body.quaternion);
        if (d.body.sleepState !== CANNON.Body.SLEEPING) allAsleep = false;
      }
      if (allAsleep || now - phaseStart > THROW_MS) startReveal();
    } else if (phase === 'reveal') {
      const t = Math.min(1, (now - phaseStart) / REVEAL_MS);
      const e = 1 - Math.pow(1 - t, 3); // ease-out
      for (const d of dieObjs) {
        d.mesh.position.lerpVectors(d._fromPos, d._toPos, e);
        d.mesh.quaternion.slerpQuaternions(d._fromQuat, d._toQuat, e);
        d.body.sleep();
        d.body.position.copy(d._toPos);
      }
      if (t >= 1) {
        phase = 'idle';
        onSettled?.(pending);
      }
    }
    renderer.render(scene, camera);
  }

  onMount(() => {
    const w = container.clientWidth || 600, h = container.clientHeight || 320;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 4.2, 6.5);
    camera.lookAt(0, 0.4, 0.5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(3, 8, 5);
    scene.add(dir);

    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    world.allowSleep = true;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    // invisible walls to keep dice in view
    const wall = (x, y, z, ax, ay, az) => {
      const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), position: new CANNON.Vec3(x, y, z) });
      b.quaternion.setFromEuler(ax, ay, az);
      world.addBody(b);
    };
    wall(0, 0, -2.5, 0, 0, 0); // back
    wall(0, 0, 3.5, 0, Math.PI, 0); // front
    wall(-4, 0, 0, 0, Math.PI / 2, 0); // left
    wall(4, 0, 0, 0, -Math.PI / 2, 0); // right

    rebuildDice();
    raf = requestAnimationFrame(tick);

    // ResizeObserver handles both window resize AND the tab going display:none → visible
    // (the component mounts while the Dice tab is hidden, so the container starts at 0×0).
    const ro = new ResizeObserver(() => {
      const ww = container.clientWidth, hh = container.clientHeight;
      if (!ww || !hh) return;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    });
    ro.observe(container);
    container._cleanup = () => ro.disconnect();
  });

  // Rebuild meshes/bodies when the dice set changes (count or faces).
  let lastKey = '';
  $effect(() => {
    const key = JSON.stringify(dice.map((d) => d.faces));
    if (scene && key !== lastKey) {
      lastKey = key;
      rebuildDice();
    }
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    container?._cleanup?.();
    renderer?.dispose();
  });
</script>

<div bind:this={container} class="w-full" style="height: 320px;"></div>
