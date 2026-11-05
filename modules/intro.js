// intro - E3 match intro (seal): two banners unroll (team names), a wax seal "VS" is stamped, a parchment scroll "Map - <name>" opens.
// Ported from prototypes/intro.js. Mounted by overlay.html; plays on bus 'match-start' (real poller event or panel test), once per match id.
// No WebGL while idle: the scene is created on play and disposed when the intro ends.
import { createScene } from '../core/scene.js';
import { introFromMatch, introCivs, fitSize, nextAction, stretchTime } from '../core/intrologic.js';

const BASE_DUR = 5.2;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const eIn = (x) => x * x * x;
const eIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const sm = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rnd32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
async function loadFonts() {
  const fs = ['600 100px Cinzel', '700 100px Cinzel', 'italic 600 40px "Cormorant Garamond"', '600 40px "Cormorant Garamond"'];
  try { await Promise.race([Promise.all(fs.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3500))]); } catch (e) { /* fallback fonts */ }
}
const TITLE = '"Cinzel", "Cormorant Garamond", Georgia, serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const spaced = (s, on) => (on ? s.split('').join(' ') : s);

function ensureCss() {
  if (document.getElementById('intro-css')) return;
  const l = document.createElement('link');
  l.id = 'intro-css'; l.rel = 'stylesheet';
  l.href = new URL('./intro.css', import.meta.url).href;
  document.head.appendChild(l);
}

/* Scene: rig lights + banners + seal + scroll. data = introFromMatch(), civs = introCivs(), THREE/CLOTH from lazy imports. */
function buildSeal(wt, THREE, CLOTH, data, civs) {
  const tex = (canvas, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8; t.needsUpdate = true; return t;
  };
  const hexStr = (c, k = 0) => { const col = new THREE.Color(c); if (k < 0) col.lerp(new THREE.Color(0x0a0604), -k); else if (k > 0) col.lerp(new THREE.Color(0xf4e6c8), k); return '#' + col.getHexString(); };
  // light dyes (yellow, grey, orange) are darkened so the gold embroidery stays legible (blue/green already use the deep cloth presets)
  const clothOf = (name) => {
    const base = CLOTH && CLOTH[name] != null ? CLOTH[name] : 0x8c2c22;
    const c = new THREE.Color(base);
    const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear-space luma of the sRGB-authored hex
    const k = Math.min(0.72, Math.max(0, (Math.pow(luma, 1 / 2.2) - 0.30) * 3.2));
    return k > 0 ? c.lerp(new THREE.Color(0x120a05), k).getHex() : base;
  };

  // rig (transparent canvas, own lights)
  wt.hemi.color.set(0x9a7c5a); wt.hemi.groundColor.set(0x1d1209);
  const key = new THREE.SpotLight(0xffc88a, 330, 0, 0.9, 1, 2);
  key.position.set(-3.8, 4.2, 7.2); key.target.position.set(0, -0.3, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  wt.scene.add(key, key.target);
  const rimL = new THREE.DirectionalLight(0x9fb6da, 0.9); rimL.position.set(5, 5, -6); wt.scene.add(rimL);
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.5); fill.position.set(4, 2, 7); wt.scene.add(fill);

  const root = new THREE.Group(); wt.scene.add(root);
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc29a58, metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const LMAX = 4.05, BH = 1.62;
  const FIT_W = 1300; // text width inside the free cloth region (texture px), clear of the dowel and the free end

  /* ---- banner cloth texture ---- */
  function clothCanvas(side, sideCivs, dir) {
    const cw = 2048, ch = Math.round(cw * BH / LMAX);
    const c = mkCanvas(cw, ch), g = c.getContext('2d');
    const cloth = clothOf(side.colour);
    g.fillStyle = hexStr(cloth, 0); g.fillRect(0, 0, cw, ch);
    const rr = rnd32(side.names.join('').length * 17 + 3);
    for (let i = 0; i < 26; i++) {
      const x = rr() * cw, w = 90 + rr() * 280, gr = g.createLinearGradient(x - w, 0, x + w, 0);
      const dark = rr() < 0.5; gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, dark ? 'rgba(0,0,0,0.09)' : 'rgba(255,240,210,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - w, 0, 2 * w, ch);
    }
    const gv = g.createLinearGradient(0, 0, 0, ch); gv.addColorStop(0, 'rgba(0,0,0,0.30)'); gv.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gv.addColorStop(1, 'rgba(0,0,0,0.34)');
    g.fillStyle = gv; g.fillRect(0, 0, cw, ch);
    g.save(); g.globalAlpha = 0.075; g.strokeStyle = '#d8b878'; g.lineWidth = 2;
    const step = 90;
    for (let y = -step; y < ch + step; y += step) for (let x = -step; x < cw + step; x += step) { g.beginPath(); g.moveTo(x, y - step / 2); g.lineTo(x + step / 2, y); g.lineTo(x, y + step / 2); g.lineTo(x - step / 2, y); g.closePath(); g.stroke(); }
    g.restore();
    g.save(); g.globalAlpha = 0.07;
    for (let x = 0; x < cw; x += 3) { g.fillStyle = x % 6 ? '#000' : '#fff'; g.fillRect(x, 0, 1, ch); }
    for (let y = 0; y < ch; y += 3) { g.fillStyle = y % 6 ? '#000' : '#fff'; g.fillRect(0, y, cw, 1); }
    g.restore();
    for (const y0 of [0.055, 1 - 0.055 - 0.05]) {
      const y = ch * y0, h = ch * 0.05;
      const gb = g.createLinearGradient(0, y, 0, y + h); gb.addColorStop(0, '#e3c48a'); gb.addColorStop(0.5, '#b08a4c'); gb.addColorStop(1, '#7d6036');
      g.fillStyle = gb; g.fillRect(0, y, cw, h);
      g.fillStyle = 'rgba(40,26,8,0.5)'; for (let x = 0; x < cw; x += 14) g.fillRect(x, y, 3, h);
      g.fillStyle = '#c9a56a'; g.fillRect(0, y - 10, cw, 3); g.fillRect(0, y + h + 7, cw, 3);
    }
    // embroidered names (+ civ for a 1v1), centred in the free region, shrunk to fit
    const s0 = 1.1, s1 = LMAX - 0.2; const cxs = ((s0 + s1) / 2) / LMAX * cw;
    const tx = dir > 0 ? cxs : cw - cxs;
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const gg = g.createLinearGradient(0, ch * 0.2, 0, ch * 0.8); gg.addColorStop(0, '#f4dea4'); gg.addColorStop(0.55, '#d3ad66'); gg.addColorStop(1, '#a07f43');
    const fitText = (text, base, min, maxW = FIT_W) => {
      const px = fitSize((p) => { g.font = `700 ${p}px ${TITLE}`; return g.measureText(text).width; }, maxW, base, min);
      g.font = `700 ${px}px ${TITLE}`; return px;
    };
    // names carry a thin dark outline so the gold stays legible on every dye
    const inked = (text, x, y) => {
      g.save(); g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = 'rgba(22,12,4,0.6)'; g.strokeText(text, x, y); g.restore();
      g.fillStyle = gg; g.fillText(text, x, y);
    };
    g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 6; g.shadowOffsetY = 5;
    g.fillStyle = gg;
    const n = side.names.length;
    if (n === 1) {
      const nm = side.names[0];
      const text = spaced(nm.toUpperCase(), nm.length <= 12);
      const hasCiv = !!sideCivs[0];
      const y = hasCiv ? ch * 0.545 : ch * 0.585;
      fitText(text, nm.length > 7 ? 168 : 200, 38);
      inked(text, tx, y);
      if (hasCiv) {
        g.shadowBlur = 4; g.shadowOffsetY = 3;
        g.fillStyle = '#e9dcc0'; g.font = `italic 600 88px ${SERIF}`;
        g.fillText(sideCivs[0], tx, y + 118);
        g.shadowColor = 'transparent';
        g.strokeStyle = 'rgba(214,180,110,0.7)'; g.lineWidth = 3; const hw = 330;
        g.beginPath(); g.moveTo(tx - hw - 130, y + 90); g.lineTo(tx - 130, y + 90); g.moveTo(tx + 130, y + 90); g.lineTo(tx + hw + 130, y + 90); g.stroke();
      }
    } else {
      const slot = Math.min(150, 560 / n), base = Math.min(124, slot * 0.8);
      const y0 = ch * 0.5 - ((n - 1) * slot) / 2;
      side.names.forEach((nm, i) => {
        const text = nm.toUpperCase();
        const px = fitText(text, base, 34);
        g.fillStyle = gg;
        inked(text, tx, y0 + i * slot + px * 0.35);
      });
    }
    g.shadowColor = 'transparent';
    return c;
  }
  const wb = mkCanvas(256, 256), wg = wb.getContext('2d'); wg.fillStyle = '#808080'; wg.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 2) { wg.fillStyle = x % 4 ? '#6a6a6a' : '#9a9a9a'; wg.fillRect(x, 0, 1, 256); }
  for (let y = 0; y < 256; y += 2) { wg.fillStyle = y % 4 ? 'rgba(80,80,80,.5)' : 'rgba(170,170,170,.5)'; wg.fillRect(0, y, 256, 1); }
  const weave = tex(wb, false); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(24, 10);

  const NS = 460, NY = 10;
  function banner(side, sideCivs, dir) {
    const cloth = clothOf(side.colour);
    const mat = new THREE.MeshPhysicalMaterial({ map: tex(clothCanvas(side, sideCivs, dir)), side: dir > 0 ? THREE.FrontSide : THREE.BackSide, roughness: 0.8, sheen: 0.7, sheenColor: new THREE.Color(cloth).lerp(new THREE.Color(0xe8d4a0), 0.35), sheenRoughness: 0.5, bumpMap: weave, bumpScale: 0.5 });
    const geo = new THREE.PlaneGeometry(1, 1, NS, NY);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uv.setX(i, dir > 0 ? u : 1 - u); }
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh);
    const bc = mkCanvas(256, 104), bg = bc.getContext('2d'); bg.fillStyle = hexStr(cloth, -0.18); bg.fillRect(0, 0, 256, 104);
    bg.fillStyle = '#9a7a45'; bg.fillRect(0, 6, 256, 5); bg.fillRect(0, 93, 256, 5);
    const backMat = new THREE.MeshPhysicalMaterial({ map: tex(bc), side: dir > 0 ? THREE.BackSide : THREE.FrontSide, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0xe8d4a0), sheenRoughness: 0.45 });
    const back = new THREE.Mesh(geo, backMat); back.castShadow = false; back.receiveShadow = true; back.frustumCulled = false; root.add(back);
    const dw = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, BH + 0.16, 20), brass); rod.castShadow = true; dw.add(rod);
    for (const sy of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), brass); b.position.y = sy * (BH / 2 + 0.1); b.castShadow = true; dw.add(b); }
    root.add(dw);
    const pos = geo.attributes.position;
    const r0 = 0.07, cc = 0.0036;
    function set(L, t) {
      L = Math.max(0.0001, L);
      for (let j = 0; j <= NY; j++) {
        const yy = (0.5 - j / NY) * BH;
        for (let i = 0; i <= NS; i++) {
          const s = (i / NS) * LMAX;
          let x, z;
          if (s <= L) {
            x = s;
            const fade = sm(clamp01(s / 0.6)) * (0.35 + 0.65 * sm(clamp01((L - s) / 1.0)));
            z = fade * (0.026 * Math.sin(s * 4.6 - t * 1.3 + yy * 0.8) + 0.01 * Math.sin(s * 9.5 - t * 2.1 + yy * 1.6));
          } else {
            const d = s - L;
            const th = (-r0 + Math.sqrt(r0 * r0 + 2 * cc * d)) / cc;
            const rho = r0 + cc * th;
            x = L + rho * Math.sin(th); z = rho * (1 - Math.cos(th));
          }
          pos.setXYZ(j * (NS + 1) + i, dir * x, yy, z);
        }
      }
      pos.needsUpdate = true; geo.computeVertexNormals();
      dw.position.set(dir * L, 0, r0 + 0.01);
    }
    return { set };
  }
  const BL = banner(data.left, civs.left, -1), BR = banner(data.right, civs.right, +1);

  /* ---- wax seal: polar heightfield with embossed ring + "VS" ---- */
  function sealMesh() {
    const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(S / 2, S / 2, S * 0.345, 0, 7); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.arc(S / 2, S / 2, S * 0.37, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${S * 0.36}px ${TITLE}`; g.fillText('VS', S / 2, S / 2 + S * 0.02);
    const c2 = mkCanvas(S, S), g2 = c2.getContext('2d'); g2.filter = 'blur(3px)'; g2.drawImage(c, 0, 0);
    const d = g2.getImageData(0, 0, S, S).data;
    const hf = (x, y) => { const ix = Math.min(S - 1, Math.max(0, Math.round((x * 0.5 + 0.5) * (S - 1)))), iy = Math.min(S - 1, Math.max(0, Math.round((y * 0.5 + 0.5) * (S - 1)))); return d[(iy * S + ix) * 4] / 255; };
    const NR = 80, NA = 192, R = 0.78;
    const verts = [], idx = [];
    for (let ri = 0; ri <= NR; ri++) {
      const rr = ri / NR;
      for (let ai = 0; ai <= NA; ai++) {
        const a = (ai / NA) * Math.PI * 2;
        const lob = 1 + 0.045 * Math.sin(a * 3 + 1.1) + 0.03 * Math.sin(a * 5 + 2.3) + 0.018 * Math.sin(a * 9 + 0.4);
        const rad = rr * R * lob;
        const ux = (rad * Math.cos(a)) / R, uy = (rad * Math.sin(a)) / R;
        const e = rr;
        let h = 0.075;
        h += 0.045 * sm(clamp01((e - 0.72) / 0.12)) * (1 - sm(clamp01((e - 0.88) / 0.08)));
        h *= Math.sqrt(Math.max(0, 1 - Math.pow(clamp01((e - 0.9) / 0.1), 2)));
        h += 0.05 * hf(ux * 0.93, uy * 0.93) * (1 - sm(clamp01((e - 0.82) / 0.08)));
        verts.push(rad * Math.cos(a), h, rad * Math.sin(a));
      }
    }
    for (let ri = 0; ri < NR; ri++) for (let ai = 0; ai < NA; ai++) { const a = ri * (NA + 1) + ai, b = a + NA + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x4c1713, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.22, sheen: 0.4, sheenColor: new THREE.Color(0xff7a5a), sheenRoughness: 0.5, emissive: 0x2a0604, emissiveIntensity: 0.55, side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true;
    const g3 = new THREE.Group(); mesh.rotation.x = Math.PI / 2; g3.add(mesh);
    return { g: g3, mat };
  }
  const seal = sealMesh(); root.add(seal.g);

  /* ---- map scroll ---- */
  const SW = 2.7, SH = 0.64, SY = -1.26, SZ = 0.05; // SY/scale: lowest knob pixel >= 8 px above the band bottom (measured; prototype had 4 px)
  function parchmentCanvases() {
    const cw = 2048, ch = Math.round(cw * SH / SW);
    const c = mkCanvas(cw, ch), g = c.getContext('2d'), r = rnd32(77);
    const bc = mkCanvas(cw, ch), bg = bc.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, '#e6d3a4'); gr.addColorStop(0.5, '#ddc790'); gr.addColorStop(1, '#cdb078');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    bg.fillStyle = '#808080'; bg.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 900; i++) { const x = r() * cw, y = r() * ch, rad = 6 + r() * 60; const a = 0.015 + r() * 0.035; g.fillStyle = r() < 0.7 ? `rgba(120,84,36,${a})` : `rgba(255,244,210,${a})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    for (let i = 0; i < 26; i++) { const x = r() * cw, y = r() * ch, rad = 3 + r() * 14; g.fillStyle = `rgba(110,64,24,${0.07 + r() * 0.1})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(90,60,28,0.10)'; g.lineWidth = 1;
    for (let i = 0; i < 520; i++) { const x = r() * cw, y = r() * ch, l = 6 + r() * 26, a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4); g.stroke(); }
    bg.strokeStyle = 'rgba(40,40,40,0.35)'; for (let i = 0; i < 700; i++) { const x = r() * cw, y = r() * ch, l = 6 + r() * 30, a = r() * 6.28; bg.lineWidth = 1 + r() * 1.4; bg.beginPath(); bg.moveTo(x, y); bg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.5); bg.stroke(); }
    for (const [y0, y1] of [[0, ch * 0.2], [ch, ch * 0.78]]) {
      const eg = g.createLinearGradient(0, y0, 0, y1); eg.addColorStop(0, 'rgba(86,48,16,0.55)'); eg.addColorStop(1, 'rgba(86,48,16,0)'); g.fillStyle = eg; g.fillRect(0, Math.min(y0, y1), cw, Math.abs(y1 - y0));
    }
    g.strokeStyle = 'rgba(52,32,12,0.72)'; g.lineWidth = 5; g.strokeRect(70, 44, cw - 140, ch - 88);
    g.lineWidth = 2; g.strokeRect(86, 60, cw - 172, ch - 120);
    g.fillStyle = 'rgba(52,32,12,0.82)';
    for (const sx of [-1, 1]) {
      const ox = cw / 2 + sx * 835, oy = ch / 2;
      g.beginPath(); g.moveTo(ox, oy - 24); g.lineTo(ox + 18, oy); g.lineTo(ox, oy + 24); g.lineTo(ox - 18, oy); g.closePath(); g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(52,32,12,0.7)'; g.beginPath(); g.moveTo(ox + sx * 36, oy); g.lineTo(ox + sx * 80, oy); g.stroke();
    }
    // "Map - NAME" in iron-gall ink; the whole line shrinks for long map names
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const name = spaced(String(data.map).toUpperCase(), String(data.map).length <= 10);
    const gap0 = 54;
    const layout = (k) => {
      const fMap = `italic 600 ${196 * k}px ${SERIF}`, fDot = `600 ${190 * k}px ${TITLE}`, fName = `600 ${186 * k}px ${TITLE}`;
      g.font = fMap; const w1 = g.measureText('Map').width; g.font = fDot; const w2 = g.measureText('·').width;
      g.font = fName; const w3 = g.measureText(name).width;
      return { fMap, fDot, fName, w1, w2, w3, gap: gap0 * k, total: w1 + w2 + w3 + 2 * gap0 * k };
    };
    let L = layout(1);
    const maxTotal = 1500;
    if (L.total > maxTotal) L = layout(Math.max(0.3, maxTotal / L.total));
    let x = (cw - L.total) / 2; const yb = ch / 2 + 60;
    g.shadowColor = 'rgba(255,244,214,0.55)'; g.shadowOffsetY = 2; g.shadowBlur = 0;
    g.fillStyle = '#2d1c0a'; g.font = L.fMap; g.fillText('Map', x, yb); x += L.w1 + L.gap;
    g.font = L.fDot; g.fillStyle = '#7a1e14'; g.fillText('·', x, yb); x += L.w2 + L.gap;
    g.font = L.fName; g.fillStyle = '#2d1c0a'; g.fillText(name, x, yb);
    g.shadowColor = 'transparent';
    g.globalAlpha = 0.12; g.fillText(name, x + 1.5, yb + 1); g.globalAlpha = 1;
    return { map: c, bump: bc };
  }
  const pc = parchmentCanvases();
  const parMat = new THREE.MeshPhysicalMaterial({ map: tex(pc.map), bumpMap: tex(pc.bump, false), bumpScale: 0.9, roughness: 0.88, sheen: 0.35, sheenColor: new THREE.Color(0xfff0c8), sheenRoughness: 0.8, side: THREE.DoubleSide });
  const SNX = 90, SNY = 6;
  const sGeo = new THREE.PlaneGeometry(1, 1, SNX, SNY);
  const sPos = sGeo.attributes.position, sUv = sGeo.attributes.uv;
  const scroll = new THREE.Group(); scroll.position.set(0, SY, SZ); scroll.scale.setScalar(0.95); root.add(scroll);
  const sheet = new THREE.Mesh(sGeo, parMat); sheet.castShadow = sheet.receiveShadow = true; sheet.frustumCulled = false; scroll.add(sheet);
  const rollMat = new THREE.MeshPhysicalMaterial({ color: 0xcdb078, roughness: 0.9, bumpMap: tex(pc.bump, false), bumpScale: 0.6, sheen: 0.3, sheenColor: new THREE.Color(0xfff0c8) });
  const woodMat = new THREE.MeshPhysicalMaterial({ color: 0x3b2416, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  const rollR = 0.088;
  function roll() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rollR, rollR, SH + 0.02, 36), rollMat); body.castShadow = body.receiveShadow = true; g.add(body);
    const ring = mkCanvas(256, 256), rg = ring.getContext('2d'); rg.fillStyle = '#d6bc84'; rg.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 14; k++) { rg.strokeStyle = k % 2 ? 'rgba(90,58,24,0.55)' : 'rgba(255,240,200,0.25)'; rg.lineWidth = 3; rg.beginPath(); rg.arc(128, 128, 14 + k * 8.2, 0, 7); rg.stroke(); }
    const capMat = new THREE.MeshPhysicalMaterial({ map: tex(ring), roughness: 0.9 });
    for (const sy of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(rollR * 0.995, 36), capMat); cap.rotation.x = sy * -Math.PI / 2; cap.position.y = sy * (SH / 2 + 0.01); g.add(cap);
      const dow = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 14), woodMat); dow.position.y = sy * (SH / 2 + 0.055); dow.castShadow = true; g.add(dow);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 12), brass); kn.position.y = sy * (SH / 2 + 0.11); kn.castShadow = true; g.add(kn);
    }
    scroll.add(g); return g;
  }
  const rollL = roll(), rollRt = roll();
  function setScroll(open, t) {
    const w = Math.max(0.0001, SW * open), half = w / 2;
    for (let j = 0; j <= SNY; j++) {
      const yy = (0.5 - j / SNY) * SH;
      for (let i = 0; i <= SNX; i++) {
        const u = i / SNX, x = (u - 0.5) * w;
        const edge = sm(clamp01(Math.abs(x) / Math.max(half, 0.001)));
        const z = 0.014 * Math.sin(x * 5.2 + t * 0.9 + yy * 2.0) * (0.3 + 0.7 * edge) + 0.022 * (1 - open) * Math.sin(x * 12) + 0.01 * (Math.abs(yy) / (SH / 2)) ** 2;
        sPos.setXYZ(j * (SNX + 1) + i, x, yy, z);
        sUv.setXY(j * (SNX + 1) + i, 0.5 + x / SW, 1 - j / SNY);
      }
    }
    sPos.needsUpdate = true; sUv.needsUpdate = true; sGeo.computeVertexNormals();
    rollL.position.set(-half, 0, 0); rollRt.position.set(half, 0, 0);
    rollL.rotation.y = rollRt.rotation.y = 0;
    rollL.children[0].rotation.y = -open * 9; rollRt.children[0].rotation.y = open * 9;
    scroll.visible = open > 0.002;
  }

  // camera: banners sit below the top 30 px so the finials stay clear of the game timer
  wt.camera.position.set(0, 0.28, 6.4);
  wt.camera.lookAt(0, -0.2, 0);
  wt.camera.updateMatrixWorld(); wt.camera.updateProjectionMatrix();

  const stampT = 2.5;
  function update(t) {
    const unroll = eIO(seg(t, 0.35, 2.3));
    const reroll = eIO(seg(t, 4.3, 5.0));
    const L = LMAX * unroll * (1 - reroll);
    BL.set(L, t); BR.set(L, t);
    const arrive = eIn(seg(t, stampT - 0.42, stampT));
    const lift = eIn(seg(t, 4.2, 4.45));
    const zS = lerp(1.7, 0.012, arrive) + 1.3 * lift;
    const vis = sm(seg(t, stampT - 0.42, stampT - 0.3)) * (1 - sm(seg(t, 4.25, 4.45)));
    const sq = t > stampT ? Math.exp(-(t - stampT) * 7) * Math.cos((t - stampT) * 16) : 0;
    const scl = lerp(1.5, 1, arrive) * (1 + 0.25 * lift);
    seal.g.position.set(0, 0, zS);
    seal.g.scale.set(scl * (1 + 0.07 * sq), scl * (1 + 0.07 * sq), scl * (1 - 0.35 * sq));
    seal.g.rotation.z = lerp(-0.18, -0.04, arrive);
    seal.mat.opacity = vis; seal.g.visible = vis > 0.002;
    const open = eIO(seg(t, 2.95, 3.65)) * (1 - eIO(seg(t, 4.1, 4.6)));
    setScroll(open, t);
  }
  return { update };
}

// transparent rig options (from the prototype's buildSeal rig call)
const TABLE_OPTS = {
  transparent: true, candle: false, dust: false, board: false, table: false, shadows: true,
  bloom: { strength: 0.16, radius: 0.25, threshold: 1.5 }, vignette: false, exposure: 1.0,
  env: 0.45, fov: 27.7, rim: 0, ambient: 0.6, pixelRatio: 1,
};

// ctx: { settings, bus, cfg }  -> { unmount, play(match, opts), freezeAt(match, t) }
export function mount(root, ctx = {}) {
  ensureCss();
  const cfg = ctx.cfg || {};
  const bus = ctx.bus;
  const total = Math.max(BASE_DUR, Number(cfg.minSeconds) || 0);
  root.innerHTML = '<div class="band"><div class="gl"></div></div>';
  const band = root.querySelector('.band'), gl = root.querySelector('.gl');
  let sc = null, busy = false, dead = false, safety = 0, pending = null;

  const bandOpacity = (tt) => { band.style.opacity = sm(seg(tt, 0, 0.25)) * (1 - sm(seg(tt, 4.95, 5.2))); };
  function finish() {
    clearTimeout(safety); safety = 0;
    band.style.opacity = 0;
    if (sc) { sc.dispose(); sc = null; }
    release();
  }
  // a match that arrived while an intro was busy is kept (latest wins) and shown when the current one ends
  function release() {
    busy = false;
    if (pending && !dead) { const m = pending; pending = null; setTimeout(() => request(m), 0); }
  }
  function request(match) {
    const a = nextAction(globalThis.sessionStorage, match, busy);
    if (a === 'queue') pending = match;
    else if (a === 'play') play(match);
  }

  async function prepare(match) {
    const data = introFromMatch(match);
    if (!data) return null;
    const civs = introCivs(match);
    const [wtMod, camMod] = await Promise.all([import('../shared/war-table.js'), import('../shared/campaign.js')]);
    await loadFonts();
    const pc = camMod.PLAYER_COLOURS || {};
    return { data, civs, THREE: wtMod.THREE, CLOTH: { ...pc, ...(pc.cloth || {}) } }; // banner silk: cloth presets win over the pigment colour
  }

  async function play(match, opts = {}) {
    if (busy || dead) return false;
    busy = true;
    try {
      const prep = await prepare(match);
      if (!prep || dead) { release(); return false; }
      let T = 0, inst = null;
      sc = createScene({
        canvasHost: gl, maxFps: 60, tableOpts: TABLE_OPTS,
        build: (wt) => { inst = buildSeal(wt, prep.THREE, prep.CLOTH, prep.data, prep.civs); inst.update(0); },
        onFrame: (dt) => {
          if (opts.freeze != null) return;
          T += dt;
          const tt = stretchTime(T, total, BASE_DUR);
          inst.update(tt); bandOpacity(tt);
          if (T >= total) finish();
        },
      });
      sc.start();
      safety = setTimeout(finish, (total + 12) * 1000); // hidden tab / failed start: never leave a context behind
      if (opts.freeze != null) { // review capture: jump to timeline time `freeze`, render one frame, keep the scene
        let n = 0;
        while (!sc.wt && n++ < 200) await new Promise((r) => setTimeout(r, 25));
        if (!sc.wt) throw new Error('scene did not start');
        sc.stop();
        sc.wt.advance(opts.freeze);
        inst.update(opts.freeze); bandOpacity(opts.freeze); sc.wt.renderOnce();
        const gx = sc.wt.renderer.getContext(); gx.readPixels(0, 0, 1, 1, gx.RGBA, gx.UNSIGNED_BYTE, new Uint8Array(4));
        clearTimeout(safety); safety = 0;
      }
      return true;
    } catch (e) {
      console.warn('intro failed', (e && e.message) || e);
      finish();
      return false;
    }
  }

  const offs = [];
  if (bus && bus.on) {
    offs.push(bus.on('match-start', (p) => {
      const match = p && p.match;
      request(match);
    }));
  }

  return {
    play,
    freezeAt: (match, t) => play(match, { freeze: t }),
    unmount() {
      dead = true;
      for (const off of offs) { try { if (off) off(); } catch (e) { /* ignore */ } }
      finish();
      root.innerHTML = '';
    },
  };
}
