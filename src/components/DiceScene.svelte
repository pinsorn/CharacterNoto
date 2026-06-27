<script>
  // Real 3D dice: Three.js render + cannon-es physics tumble.
  // Symmetric face counts (4/6/8/12/20) render as the matching Platonic solid
  // (tetra/cube/octa/dodeca/icosa) with one label plane per face; every other count
  // (incl. d10 — a fair d10 is a pentagonal trapezohedron, not a Platonic solid, so it'd
  // need custom geometry) falls back to the N-gon barrel.
  // The OUTCOME is predetermined (fair RNG, see lib/dice3d); the physics only tumbles, then
  // each die eases to a reveal pose computed from that face's frame so it squares up upright.
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import * as CANNON from 'cannon-es';

  let { dice = [], onSettled } = $props();

  const R = 0.62; // visual circumradius (barrel radius)
  const H = 0.95; // barrel height (axis)
  const THROW_MS = 1300;
  const REVEAL_MS = 550;
  // slight downward tilt at reveal so the top of the face reads toward the camera
  const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.25);
  // circumradius ≈ R for visual parity (cube side = 2R/√3); sizes are cosmetic.
  const PLATONIC = {
    4: () => new THREE.TetrahedronGeometry(R * 1.30),
    6: () => new THREE.BoxGeometry(R * 1.15, R * 1.15, R * 1.15),
    8: () => new THREE.OctahedronGeometry(R * 1.12),
    12: () => new THREE.DodecahedronGeometry(R * 1.05),
    20: () => new THREE.IcosahedronGeometry(R * 1.00),
  };

  let container;
  let renderer, scene, camera, world, raf;
  let dieObjs = []; // { mesh, body, faces: [{ normal, qFace }] }
  let phase = 'idle'; // 'throw' | 'reveal' | 'idle'
  let phaseStart = 0;
  let pending = null;

  // --- orientation frame for one face -------------------------------------
  // Full basis (right, up, normal): up = world-up projected onto the face (→ +X ref when the
  // face is near-horizontal). Used for BOTH label placement and reveal, so the chosen face
  // lands upright by construction — reveal = TILT · qFace⁻¹.
  function frameQuat(normal) {
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.y) > 0.95) up.set(1, 0, 0);
    up.sub(normal.clone().multiplyScalar(up.dot(normal))).normalize();
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    up.crossVectors(normal, right).normalize(); // re-orthogonalize
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, normal)
    );
  }

  // Group a solid's triangles into flat faces. dot>0.99 is bulletproof (face normals are
  // >60° apart) and won't split one polygon from float drift. → [{ center, normal, qFace }].
  function faceAnchors(geo) {
    if (geo.index) geo = geo.toNonIndexed();
    const pos = geo.attributes.position;
    const tris = pos.count / 3;
    const groups = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const n = new THREE.Vector3(), cen = new THREE.Vector3();
    for (let t = 0; t < tris; t++) {
      a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      let g = groups.find((g) => g.normal.dot(n) > 0.99);
      if (!g) { g = { normal: n.clone(), sum: new THREE.Vector3(), count: 0 }; groups.push(g); }
      g.sum.add(cen); g.count++;
    }
    const faces = groups.map((g) => {
      const normal = g.normal.clone().normalize();
      return { center: g.sum.clone().multiplyScalar(1 / g.count), normal, qFace: frameQuat(normal) };
    });
    // stable label assignment across rebuilds: top faces first, then by azimuth
    faces.sort((p, q) => (q.normal.y - p.normal.y) || (Math.atan2(p.normal.x, p.normal.z) - Math.atan2(q.normal.x, q.normal.z)));
    return faces;
  }

  // --- textures ------------------------------------------------------------
  // Barrel: one strip texture, N cells across (one per face).
  function labelTexture(faces) {
    const n = faces.length, cell = 256;
    const cv = document.createElement('canvas');
    cv.width = cell * n; cv.height = cell;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#f3f4f6' : '#ffffff';
      ctx.fillRect(i * cell, 0, cell, cell);
      ctx.fillStyle = '#111827';
      ctx.font = `bold ${Math.min(140, Math.floor(420 / Math.max(1, String(faces[i]).length)))}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(faces[i]), i * cell + cell / 2, cell / 2);
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 4;
      ctx.strokeRect(i * cell, 0, cell, cell);
    }
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
  }
  // Platonic: one label on a white pad (readable on any die colour).
  function labelTex1(text) {
    const s = 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(14, 14, s - 28, s - 28, 36); ctx.fill(); }
    else ctx.fillRect(14, 14, s - 28, s - 28);
    ctx.fillStyle = '#111827';
    ctx.font = `bold ${Math.min(150, Math.floor(300 / Math.max(1, String(text).length)))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(text), s / 2, s / 2 + 6);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; return tex;
  }

  function labelPlane(text, face) {
    const size = R * 0.85;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: labelTex1(text), transparent: true })
    );
    m.position.copy(face.center).multiplyScalar(1.015);
    m.quaternion.copy(face.qFace);
    return m;
  }

  function makeBody(halfY = R) {
    const b = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(new CANNON.Vec3(R, halfY, R)),
      position: new CANNON.Vec3(0, R, 0),
      allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.3,
    });
    world.addBody(b);
    return b;
  }

  function buildBarrel(faces, colorHex) {
    const n = Math.max(3, faces.length);
    const geo = new THREE.CylinderGeometry(R, R, H, n);
    const side = new THREE.MeshStandardMaterial({ map: labelTexture(faces), roughness: 0.5, metalness: 0.1 });
    const cap = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
    const mesh = new THREE.Mesh(geo, [side, cap, cap]); // [torso, top, bottom]
    scene.add(mesh);
    const faceData = Array.from({ length: n }, (_, i) => {
      const A = (i + 0.5) * (2 * Math.PI / n);
      const normal = new THREE.Vector3(Math.sin(A), 0, Math.cos(A)); // matches CylinderGeometry thetaStart
      return { normal, qFace: frameQuat(normal) };
    });
    return { mesh, body: makeBody(H / 2), faces: faceData };
  }

  function buildDie(faces, colorHex) {
    const make = PLATONIC[faces.length];
    if (!make) return buildBarrel(faces, colorHex);
    const geo = make();
    const faceData = faceAnchors(geo);
    if (faceData.length !== faces.length) { geo.dispose(); return buildBarrel(faces, colorHex); } // geometry didn't tessellate as expected
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, metalness: 0.15, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    faceData.forEach((f, i) => mesh.add(labelPlane(String(faces[i] ?? ''), f)));
    scene.add(mesh);
    return { mesh, body: makeBody(R), faces: faceData };
  }

  // Quaternion that brings face's frame to the tilted reveal pose (upright, facing camera).
  function revealQuat(face) {
    return TILT.clone().multiply(face.qFace.clone().conjugate());
  }

  function disposeMesh(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
  }

  function layout(n) {
    return (i) => (i - (n - 1) / 2) * (R * 2.4);
  }

  function rebuildDice() {
    for (const d of dieObjs) {
      scene.remove(d.mesh);
      disposeMesh(d.mesh);
      world.removeBody(d.body);
    }
    dieObjs = [];
    const colors = [0x7c3aed, 0xdb2777, 0x06b6d4, 0x36d399, 0xfbbd23, 0xf87272, 0x3abff8];
    const xAt = layout(dice.length);
    dice.forEach((d, i) => {
      const obj = buildDie(d.faces?.length ? d.faces : ['?'], colors[i % colors.length]);
      // resting reveal pose at start so the dice are visible before the first roll
      obj.mesh.position.set(xAt(i), R, 1);
      obj.mesh.quaternion.copy(revealQuat(obj.faces[0]));
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
      const face = d.faces[res ? res.idx : 0] || d.faces[0];
      d._fromPos = d.mesh.position.clone();
      d._fromQuat = d.mesh.quaternion.clone();
      d._toPos = new THREE.Vector3(xAt(i), R, 1);
      d._toQuat = revealQuat(face);
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
