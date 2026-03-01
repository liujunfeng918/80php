const WEST = 108;
const EAST = 132;
const SOUTH = 15;
const NORTH = 42;
const GRID_W = 240;
const GRID_H = 180;

const viewer = new Cesium.Viewer('cesiumContainer', {
  animation: false,
  timeline: false,
  sceneModePicker: false,
  geocoder: false,
  baseLayerPicker: false,
  navigationHelpButton: false,
  homeButton: false,
  infoBox: false,
  selectionIndicator: false,
  shouldAnimate: true
});

viewer.scene.globe.depthTestAgainstTerrain = false;
viewer.scene.skyAtmosphere.show = true;
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.showGroundAtmosphere = true;

viewer.camera.setView({
  destination: Cesium.Rectangle.fromDegrees(WEST, SOUTH, EAST, NORTH)
});

viewer.entities.add({
  name: '模拟区域',
  rectangle: {
    coordinates: Cesium.Rectangle.fromDegrees(WEST, SOUTH, EAST, NORTH),
    material: new Cesium.Color(0.1, 0.42, 0.6, 0.12),
    outline: true,
    outlineColor: new Cesium.Color(0.4, 0.8, 1.0, 0.8),
    outlineWidth: 2
  }
});

const windCanvas = document.getElementById('windCanvas');
const ctx = windCanvas.getContext('2d', { alpha: true });

const ui = {
  particleCount: document.getElementById('particleCount'),
  speedFactor: document.getElementById('speedFactor'),
  trailFade: document.getElementById('trailFade'),
  particleCountValue: document.getElementById('particleCountValue'),
  speedFactorValue: document.getElementById('speedFactorValue'),
  trailFadeValue: document.getElementById('trailFadeValue')
};

const settings = {
  particleCount: Number(ui.particleCount.value),
  speedFactor: Number(ui.speedFactor.value),
  trailFade: Number(ui.trailFade.value)
};

const flowField = createFlowField();
let particles = createParticles(settings.particleCount);

function resizeCanvas() {
  const { clientWidth, clientHeight } = viewer.scene.canvas;
  windCanvas.width = clientWidth;
  windCanvas.height = clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function createFlowField() {
  const field = new Float32Array(GRID_W * GRID_H * 2);

  for (let y = 0; y < GRID_H; y += 1) {
    for (let x = 0; x < GRID_W; x += 1) {
      const nx = x / (GRID_W - 1);
      const ny = y / (GRID_H - 1);
      const lon = Cesium.Math.lerp(WEST, EAST, nx);
      const lat = Cesium.Math.lerp(SOUTH, NORTH, ny);

      const typhoon = vortex(lon, lat, 121.5, 23.5, 8.5, 22.0);
      const gyre = vortex(lon, lat, 115.0, 31.0, -6.2, 13.0);
      const jet = {
        u: 5.8 * Math.exp(-Math.pow((lat - 29.0) / 4.8, 2)),
        v: 1.1 * Math.sin((lon - WEST) * 0.55)
      };
      const coastalShear = {
        u: 0.9 * Math.sin(lat * 0.4),
        v: 0.8 * Math.cos(lon * 0.5)
      };

      const u = typhoon.u + gyre.u + jet.u + coastalShear.u;
      const v = typhoon.v + gyre.v + jet.v + coastalShear.v;

      const i = (y * GRID_W + x) * 2;
      field[i] = u;
      field[i + 1] = v;
    }
  }

  return field;
}

function vortex(lon, lat, centerLon, centerLat, strength, radius) {
  const dx = lon - centerLon;
  const dy = lat - centerLat;
  const r = Math.hypot(dx, dy) + 0.0001;
  const envelope = Math.exp(-(r * r) / (radius * radius));
  return {
    u: (-dy / r) * strength * envelope,
    v: (dx / r) * strength * envelope
  };
}

function sampleField(lon, lat) {
  const fx = Cesium.Math.clamp((lon - WEST) / (EAST - WEST), 0, 1) * (GRID_W - 1);
  const fy = Cesium.Math.clamp((lat - SOUTH) / (NORTH - SOUTH), 0, 1) * (GRID_H - 1);

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, GRID_W - 1);
  const y1 = Math.min(y0 + 1, GRID_H - 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const p00 = vectorAt(x0, y0);
  const p10 = vectorAt(x1, y0);
  const p01 = vectorAt(x0, y1);
  const p11 = vectorAt(x1, y1);

  const u0 = Cesium.Math.lerp(p00.u, p10.u, tx);
  const v0 = Cesium.Math.lerp(p00.v, p10.v, tx);
  const u1 = Cesium.Math.lerp(p01.u, p11.u, tx);
  const v1 = Cesium.Math.lerp(p01.v, p11.v, tx);

  return {
    u: Cesium.Math.lerp(u0, u1, ty),
    v: Cesium.Math.lerp(v0, v1, ty)
  };
}

function vectorAt(x, y) {
  const i = (y * GRID_W + x) * 2;
  return { u: flowField[i], v: flowField[i + 1] };
}

function createParticles(count) {
  return Array.from({ length: count }, () => spawnParticle());
}

function spawnParticle() {
  return {
    lon: Cesium.Math.lerp(WEST, EAST, Math.random()),
    lat: Cesium.Math.lerp(SOUTH, NORTH, Math.random()),
    life: Math.random() * 160 + 30
  };
}

function resetParticle(particle) {
  Object.assign(particle, spawnParticle());
}

function lonLatToScreen(lon, lat) {
  const cart = Cesium.Cartesian3.fromDegrees(lon, lat, 5000);
  return Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart);
}

function animate() {
  ctx.fillStyle = `rgba(4, 17, 30, ${settings.trailFade})`;
  ctx.fillRect(0, 0, windCanvas.width, windCanvas.height);

  const dt = 0.016 * settings.speedFactor;

  for (const p of particles) {
    const from = lonLatToScreen(p.lon, p.lat);
    const flow = sampleField(p.lon, p.lat);

    p.lon += flow.u * dt * 0.16;
    p.lat += flow.v * dt * 0.16;
    p.life -= 1;

    const outside = p.lon < WEST || p.lon > EAST || p.lat < SOUTH || p.lat > NORTH;
    if (outside || p.life <= 0) {
      resetParticle(p);
      continue;
    }

    const to = lonLatToScreen(p.lon, p.lat);
    if (!from || !to) continue;

    const mag = Math.min(1, Math.hypot(flow.u, flow.v) / 8);
    const hue = 180 - mag * 150;
    const alpha = 0.3 + mag * 0.6;

    ctx.strokeStyle = `hsla(${hue}, 95%, 65%, ${alpha})`;
    ctx.lineWidth = 0.7 + mag * 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  requestAnimationFrame(animate);
}

function bindUI() {
  ui.particleCount.addEventListener('input', () => {
    settings.particleCount = Number(ui.particleCount.value);
    ui.particleCountValue.textContent = String(settings.particleCount);
    particles = createParticles(settings.particleCount);
    ctx.clearRect(0, 0, windCanvas.width, windCanvas.height);
  });

  ui.speedFactor.addEventListener('input', () => {
    settings.speedFactor = Number(ui.speedFactor.value);
    ui.speedFactorValue.textContent = `${settings.speedFactor.toFixed(1)}x`;
  });

  ui.trailFade.addEventListener('input', () => {
    settings.trailFade = Number(ui.trailFade.value);
    ui.trailFadeValue.textContent = settings.trailFade.toFixed(2);
  });
}

bindUI();
animate();
