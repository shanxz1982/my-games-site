/**
 * Canvas product stills for acrylic-brick designs.
 * Layer math matches the designer: stacked boxes (acrylic) and
 * horizontal pattern planes, with the same upright pose as the showcase.
 * One canvas context — no extra WebGL contexts — so a grid of bricks stays cheap.
 */

export const DEFAULT_YAW = 0.42;

const imageCache = new Map();

export function resolveAssetUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const markers = ["/my-games-site/games/acrylic-brick/", "/games/acrylic-brick/"];
  for (const marker of markers) {
    const index = url.indexOf(marker);
    if (index >= 0) return url.slice(index + marker.length);
  }
  return url;
}

function loadImage(url) {
  const resolved = resolveAssetUrl(url);
  if (!resolved) return Promise.resolve(null);
  const cached = imageCache.get(resolved);
  if (cached) return cached;
  const pending = new Promise((resolve) => {
    const img = new Image();
    if (!resolved.startsWith("data:") && !resolved.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = resolved;
  });
  imageCache.set(resolved, pending);
  return pending;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hue2rgb(p, q, t) {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

function adjustHex(hex, hueDeg, satMul, lightMul) {
  const hsl = rgbToHsl(hexToRgb(hex));
  let h = (hsl.h + (Number(hueDeg) || 0) / 360) % 1;
  if (h < 0) h += 1;
  return rgbToHex(hslToRgb({
    h,
    s: clamp(hsl.s * (Number(satMul) || 0), 0, 1),
    l: clamp(hsl.l * (Number(lightMul) || 0), 0, 1),
  }));
}

function shadeHex(hex, shade) {
  const rgb = hexToRgb(hex);
  return rgbToHex({ r: rgb.r * shade, g: rgb.g * shade, b: rgb.b * shade });
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${clamp(alpha, 0, 1)})`;
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function norm(a) {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function rotY(p, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
}

function stackPositions(layers) {
  const visible = layers.filter((layer) => layer && layer.visible !== false);
  let cursor = visible.reduce((sum, layer) => sum + (Number(layer.thickness) || 0.02), 0) / 2;
  const map = new Map();
  for (const layer of visible) {
    const thickness = Number(layer.thickness) || 0.02;
    cursor -= thickness / 2;
    map.set(layer.id, [
      Number(layer.offsetX) || 0,
      cursor + (Number(layer.offsetY) || 0),
      Number(layer.offsetZ) || 0,
    ]);
    cursor -= thickness / 2;
  }
  return map;
}

function acrylicLocal(x, y, z, layer) {
  const sx = layer.flipX ? -1 : 1;
  const sz = layer.flipY ? -1 : 1;
  const rot = ((Number(layer.rotationDeg) || 0) * Math.PI) / 180;
  return rotY([x * sx, y, z * sz], rot);
}

function patternLocal(px, py, layer) {
  const sx = layer.flipX ? -1 : 1;
  const sy = layer.flipY ? -1 : 1;
  const x = px * sx;
  const y = py * sy;
  const rot = ((Number(layer.rotationDeg) || 0) * Math.PI) / 180;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [c * x - s * y, 0, -s * x - c * y];
}

function applyPose(p, upright, liftY) {
  if (!upright) return p;
  return [p[0], -p[2] + liftY, p[1]];
}

const BOX_FACES = [
  [4, 5, 6, 7],
  [1, 0, 3, 2],
  [3, 2, 6, 7],
  [4, 0, 1, 5],
  [1, 5, 6, 2],
  [0, 4, 7, 3],
];

function buildModel(project) {
  const layers = Array.isArray(project?.layers) ? project.layers : [];
  const positions = stackPositions(layers);
  const upright = project?.stackPose === "upright";
  let maxLength = 0;
  for (const layer of layers) {
    if (layer?.visible === false) continue;
    maxLength = Math.max(maxLength, Number(layer.length) || 0);
  }
  const liftY = upright ? maxLength / 2 : 0;
  const faces = [];
  const points = [];

  for (const layer of layers) {
    if (!layer || layer.visible === false) continue;
    const position = positions.get(layer.id) || [0, 0, 0];
    const place = (local) => applyPose(add(local, position), upright, liftY);

    if (layer.kind === "pattern") {
      const w = Number(layer.width) || 1;
      const l = Number(layer.length) || 1;
      // Bilinear order: (u,v) = (0,0), (1,0), (1,1), (0,1). v=0 is the top of the image.
      const local = [
        [-w / 2, l / 2],
        [w / 2, l / 2],
        [w / 2, -l / 2],
        [-w / 2, -l / 2],
      ].map(([px, py]) => place(patternLocal(px, py, layer)));
      const uvs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      faces.push({
        kind: "pattern",
        verts: local,
        uvs,
        layer,
      });
      points.push(...local);
      continue;
    }

    const hw = (Number(layer.width) || 1) / 2;
    const hh = (Number(layer.thickness) || 0.2) / 2;
    const hl = (Number(layer.length) || 1) / 2;
    const corners = [
      [-hw, -hh, -hl],
      [hw, -hh, -hl],
      [hw, hh, -hl],
      [-hw, hh, -hl],
      [-hw, -hh, hl],
      [hw, -hh, hl],
      [hw, hh, hl],
      [-hw, hh, hl],
    ].map((corner) => place(acrylicLocal(corner[0], corner[1], corner[2], layer)));
    for (const indices of BOX_FACES) {
      faces.push({
        kind: "acrylic",
        verts: indices.map((index) => corners[index]),
        layer,
      });
    }
    points.push(...corners);
  }

  if (points.length === 0) return { faces, points, center: [0, 0.6, 0] };

  let minY = Infinity;
  for (const point of points) minY = Math.min(minY, point[1]);
  const drop = minY;
  for (const point of points) point[1] -= drop;
  for (const face of faces) {
    for (const vert of face.verts) vert[1] -= drop;
  }

  const center = [0, 0, 0];
  for (const point of points) {
    center[0] += point[0];
    center[1] += point[1];
    center[2] += point[2];
  }
  center[0] /= points.length;
  center[1] /= points.length;
  center[2] /= points.length;
  return { faces, points, center };
}

function projectPoint(world, cam, right, up, forward, fov, width, height) {
  const rel = sub(world, cam);
  const x = dot(rel, right);
  const y = dot(rel, up);
  const z = dot(rel, forward);
  const aspect = width / Math.max(1, height);
  const tan = Math.tan(fov / 2);
  return {
    x: (x / (z * tan * aspect)) * (width / 2) + width / 2,
    y: (-y / (z * tan)) * (height / 2) + height / 2,
    z,
  };
}

function frameCamera(points, center) {
  let radius = 0.2;
  for (const point of points) radius = Math.max(radius, len(sub(point, center)));
  const fov = (30 * Math.PI) / 180;
  const direction = norm([0.95, 0.62, 1.15]);
  const distance = (radius / Math.sin(fov * 0.5)) * 1.02;
  const cam = add(center, mul(direction, distance));
  const forward = norm(sub(center, cam));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { cam, forward, right, up, fov };
}

function tilePattern(img, scaleX, scaleY, offsetX, offsetY) {
  const sx = Number(scaleX) || 1;
  const sy = Number(scaleY) || 1;
  const ox = Number(offsetX) || 0;
  const oy = Number(offsetY) || 0;
  if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001 && Math.abs(ox) < 0.001 && Math.abs(oy) < 0.001) {
    return img;
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  const pw = img.width / sx;
  const ph = img.height / sy;
  const dx = ox * img.width;
  const dy = oy * img.height;
  for (let x = -pw * 2; x < canvas.width + pw; x += pw) {
    for (let y = -ph * 2; y < canvas.height + ph; y += ph) {
      ctx.drawImage(img, x + dx, y + dy, pw, ph);
    }
  }
  return canvas;
}

function bilerp(corners, u, v) {
  const x = (1 - u) * (1 - v) * corners[0].x + u * (1 - v) * corners[1].x + u * v * corners[2].x + (1 - u) * v * corners[3].x;
  const y = (1 - u) * (1 - v) * corners[0].y + u * (1 - v) * corners[1].y + u * v * corners[2].y + (1 - u) * v * corners[3].y;
  return { x, y };
}

function drawImageTriangle(ctx, img, p0, p1, p2, uv0, uv1, uv2) {
  const denom = uv0.u * (uv1.v - uv2.v) - uv0.v * (uv1.u - uv2.u) + (uv1.u * uv2.v - uv2.u * uv1.v);
  if (Math.abs(denom) < 1e-6) return;
  const det = (c0, c1, c2) => c0 * (uv1.v - uv2.v) - uv0.v * (c1 - c2) + (c1 * uv2.v - c2 * uv1.v);
  const detC = (c0, c1, c2) => uv0.u * (c1 - c2) - c0 * (uv1.u - uv2.u) + (uv1.u * c2 - uv2.u * c1);
  const detE = (c0, c1, c2) => uv0.u * (uv1.v * c2 - c1 * uv2.v) - uv0.v * (uv1.u * c2 - c1 * uv2.u) + c0 * (uv1.u * uv2.v - uv2.u * uv1.v);
  const a = det(p0.x, p1.x, p2.x) / denom;
  const c = detC(p0.x, p1.x, p2.x) / denom;
  const e = detE(p0.x, p1.x, p2.x) / denom;
  const b = det(p0.y, p1.y, p2.y) / denom;
  const d = detC(p0.y, p1.y, p2.y) / denom;
  const f = detE(p0.y, p1.y, p2.y) / denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawQuadImage(ctx, img, corners, uvs) {
  const steps = 4;
  const pix = uvs.map(([u, v]) => ({ x: u * img.width, y: v * img.height }));
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const u0 = i / steps;
      const u1 = (i + 1) / steps;
      const v0 = j / steps;
      const v1 = (j + 1) / steps;
      const p00 = bilerp(corners, u0, v0);
      const p10 = bilerp(corners, u1, v0);
      const p11 = bilerp(corners, u1, v1);
      const p01 = bilerp(corners, u0, v1);
      const s00 = bilerp(pix, u0, v0);
      const s10 = bilerp(pix, u1, v0);
      const s11 = bilerp(pix, u1, v1);
      const s01 = bilerp(pix, u0, v1);
      const uv = (point) => ({ u: point.x, v: point.y });
      drawImageTriangle(ctx, img, p00, p10, p11, uv(s00), uv(s10), uv(s11));
      drawImageTriangle(ctx, img, p00, p11, p01, uv(s00), uv(s11), uv(s01));
    }
  }
}

function average(verts) {
  const acc = [0, 0, 0];
  for (const vert of verts) {
    acc[0] += vert[0];
    acc[1] += vert[1];
    acc[2] += vert[2];
  }
  return mul(acc, 1 / verts.length);
}

async function collectTextures(project) {
  const map = new Map();
  const layers = Array.isArray(project?.layers) ? project.layers : [];
  await Promise.all(layers.map(async (layer) => {
    const url = layer?.pattern?.textureDataUrl;
    if (!url || map.has(url)) return;
    const img = await loadImage(url);
    map.set(url, img);
  }));
  return map;
}

/**
 * Draw one brick into an existing 2D context, covering width × height.
 * The backdrop stays transparent so the catalog background shows through.
 */
export async function drawBrick(ctx, project, yaw = DEFAULT_YAW, width, height, isStale) {
  const textures = await collectTextures(project);
  if (isStale?.()) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const model = buildModel(project);
  if (model.points.length === 0) {
    ctx.fillStyle = "rgba(120,130,145,0.8)";
    ctx.font = `${Math.max(12, Math.round(width / 16))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("—", width / 2, height / 2);
    return;
  }

  const spun = model.points.map((point) => {
    const shifted = sub(point, model.center);
    const turned = rotY(shifted, yaw);
    return add(turned, model.center);
  });
  const pointIndex = new Map();
  model.points.forEach((point, index) => pointIndex.set(point, spun[index]));

  const yawPoint = (point) => pointIndex.get(point) || add(rotY(sub(point, model.center), yaw), model.center);
  const camera = frameCamera(spun, model.center);
  const projectTo = (point) => projectPoint(point, camera.cam, camera.right, camera.up, camera.forward, camera.fov, width, height);

  const light = norm([0.25, 0.92, 0.38]);
  const drawable = [];
  for (const face of model.faces) {
    const world = face.verts.map(yawPoint);
    const centroid = average(world);
    let normal = cross(sub(world[1], world[0]), sub(world[2], world[0]));
    if (len(normal) < 1e-8) continue;
    normal = norm(normal);
    if (face.kind === "acrylic") {
      if (dot(normal, sub(centroid, model.center)) < 0) normal = mul(normal, -1);
      if (dot(normal, sub(camera.cam, centroid)) <= 0.02) continue;
    } else if (dot(normal, sub(camera.cam, centroid)) < 0) {
      normal = mul(normal, -1);
    }
    const depth = dot(sub(centroid, camera.cam), camera.forward);
    drawable.push({ face, world, normal, depth });
  }
  drawable.sort((a, b) => b.depth - a.depth);

  const shadowCenter = projectTo([model.center[0], 0, model.center[2]]);
  let span = 0;
  for (const point of spun) span = Math.max(span, Math.hypot(point[0] - model.center[0], point[2] - model.center[2]));
  const edge = projectTo([model.center[0] + span, 0, model.center[2]]);
  const rx = Math.max(8, Math.hypot(edge.x - shadowCenter.x, edge.y - shadowCenter.y));
  ctx.save();
  ctx.fillStyle = "rgba(40, 32, 24, 0.16)";
  ctx.beginPath();
  ctx.ellipse(shadowCenter.x, shadowCenter.y + rx * 0.08, rx, rx * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (const item of drawable) {
    const projected = item.world.map(projectTo);
    if (item.face.kind === "pattern") {
      const pattern = item.face.layer.pattern || {};
      const img = textures.get(pattern.textureDataUrl);
      ctx.save();
      ctx.globalAlpha = clamp(Number(pattern.opacity ?? 1), 0, 1);
      if (img) {
        const source = tilePattern(img, pattern.scaleX, pattern.scaleY, pattern.offsetX, pattern.offsetY);
        const ordered = [0, 1, 2, 3].map((index) => projected[index]);
        const uvs = item.face.uvs;
        drawQuadImage(ctx, source, ordered, uvs);
      } else {
        ctx.fillStyle = "rgba(190, 196, 204, 0.85)";
        ctx.beginPath();
        projected.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      continue;
    }

    const acrylic = item.face.layer.acrylic || {};
    const transmission = clamp(Number(acrylic.transmission ?? 1), 0, 1);
    const alpha = 0.14 + (1 - transmission) * 0.78;
    const shade = clamp(0.38 + 0.72 * Math.max(0, dot(item.normal, light)), 0.35, 1.15);
    const color = adjustHex(acrylic.color || "#ffffff", acrylic.hue, acrylic.saturation ?? 1, acrylic.brightness ?? 1);
    const color2 = adjustHex(acrylic.gradientColor2 || color, acrylic.hue, acrylic.saturation ?? 1, acrylic.brightness ?? 1);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    projected.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    if (acrylic.gradient && acrylic.gradient !== "none") {
      const minX = Math.min(...projected.map((p) => p.x));
      const maxX = Math.max(...projected.map((p) => p.x));
      const minY = Math.min(...projected.map((p) => p.y));
      const maxY = Math.max(...projected.map((p) => p.y));
      const gradient = acrylic.gradient === "radial"
        ? ctx.createRadialGradient((minX + maxX) / 2, (minY + maxY) / 2, 4, (minX + maxX) / 2, (minY + maxY) / 2, Math.max(8, (maxX - minX) / 2))
        : ctx.createLinearGradient(minX, minY, maxX, maxY);
      gradient.addColorStop(0, rgba(shadeHex(color, shade), alpha));
      gradient.addColorStop(1, rgba(shadeHex(color2, shade * 0.92), alpha));
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = rgba(shadeHex(color, shade), alpha);
    }
    ctx.fill();
    ctx.strokeStyle = rgba("#ffffff", 0.18 + (1 - transmission) * 0.28);
    ctx.lineWidth = Math.max(1, width / 280);
    ctx.stroke();
    ctx.restore();
  }
}
