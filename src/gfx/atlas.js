import { TILE_WIDTH, TILE_HEIGHT } from './iso.js';

export const ATLAS_SIZE = 512;

const cell = (x, y, w, h, ax, ay) => ({ x, y, w, h, ax, ay });

export const SPRITE_DEFS = {
  floor: cell(0, 0, 64, 32, 32, 16),
  floorAlt: cell(0, 32, 64, 32, 32, 16),
  wall: cell(64, 0, 64, 96, 32, 80),
  wizard: cell(128, 0, 64, 64, 32, 56),
  warrior: cell(192, 0, 64, 64, 32, 56),
  dummy: cell(0, 64, 64, 64, 32, 56),
  shadow: cell(64, 96, 64, 32, 32, 16),
  highlight: cell(128, 64, 64, 32, 32, 16),
  stairs: cell(192, 64, 64, 32, 32, 16),
  bar: cell(0, 128, 2, 2, 0, 2),
  slash: cell(16, 128, 64, 64, 32, 32),
  totem: cell(0, 192, 64, 64, 32, 56),
  golem: cell(64, 192, 64, 64, 32, 56),
  blood: cell(128, 192, 32, 32, 16, 24),
  spark: cell(160, 192, 2, 2, 0, 2),
  skeleton: cell(0, 256, 64, 64, 32, 56),
  skeletonArcher: cell(64, 256, 64, 64, 32, 56),
  skeletonMage: cell(128, 256, 64, 64, 32, 56),
  zombie: cell(192, 256, 64, 64, 32, 56),
  bat: cell(256, 256, 64, 64, 32, 56),
  vampire: cell(320, 256, 64, 64, 32, 56),
  shrineHealth: cell(0, 320, 64, 64, 32, 56),
  shrineMana: cell(64, 320, 64, 64, 32, 56),
  shrineSpeed: cell(128, 320, 64, 64, 32, 56),
  boss: cell(192, 320, 64, 64, 32, 56),
  exitPortal: cell(256, 320, 64, 64, 32, 56),
};

const COLORS = {
  floor: '#2c3340',
  floorEdge: '#232935',
  floorAlt: '#313a49',
  floorAltEdge: '#272f3c',
  mortar: '#1b2029',
  wallTop: '#5b6476',
  wallLeft: '#3b4251',
  wallRight: '#4a5263',
  wallEdge: '#262c37',
  robe: '#3f63c8',
  robeDark: '#2c4794',
  skin: '#e8c39a',
  wood: '#7a5a3a',
  steel: '#aab4c6',
  steelDark: '#6d7786',
  leather: '#8a5a34',
  cloth: '#8f3b3b',
  straw: '#c9b26a',
  bone: '#d9d2c2',
  boneDark: '#8f897a',
  rot: '#6f8f4f',
  rotDark: '#475f31',
  bat: '#3b2f45',
  batWing: '#2a2133',
  vampCape: '#4a1f33',
  vampSkin: '#e6dce8',
};

function poly(g, points, fill, stroke, close = true) {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  if (close) g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1;
    g.stroke();
  }
}

function diamond(g, cx, cy, fill, stroke) {
  poly(
    g,
    [
      [cx, cy - TILE_HEIGHT / 2],
      [cx + TILE_WIDTH / 2, cy],
      [cx, cy + TILE_HEIGHT / 2],
      [cx - TILE_WIDTH / 2, cy],
    ],
    fill,
    stroke,
  );
}

function drawFloorTile(g, ox, oy, base, edge) {
  const cx = ox + 32;
  diamond(g, cx, oy + 16, base);
  g.strokeStyle = edge;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx, oy + 2);
  g.lineTo(cx + 29, oy + 16);
  g.lineTo(cx, oy + 30);
  g.lineTo(cx - 29, oy + 16);
  g.closePath();
  g.stroke();
  g.fillStyle = edge;
  g.globalAlpha = 0.55;
  g.fillRect(cx - 9, oy + 13, 7, 1);
  g.fillRect(cx + 4, oy + 20, 10, 1);
  g.fillRect(cx + 1, oy + 8, 1, 5);
  g.globalAlpha = 1;
}

function drawWall(g, ox, oy) {
  const h = 48;
  const cx = ox + 32;
  const baseY = oy + 64;
  const topY = baseY - h;
  poly(g, [[cx - 32, baseY], [cx, baseY + 16], [cx, topY + 16], [cx - 32, topY]], COLORS.wallLeft);
  poly(g, [[cx, baseY + 16], [cx + 32, baseY], [cx + 32, topY], [cx, topY + 16]], COLORS.wallRight);
  diamond(g, cx, topY, COLORS.wallTop, COLORS.wallEdge);
  g.strokeStyle = COLORS.mortar;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx - 32, topY);
  g.lineTo(cx, topY + 16);
  g.lineTo(cx + 32, topY);
  g.moveTo(cx - 32, baseY);
  g.lineTo(cx, baseY + 16);
  g.lineTo(cx + 32, baseY);
  g.stroke();
  g.globalAlpha = 0.4;
  g.beginPath();
  for (let i = 1; i <= 3; i++) {
    const y = baseY - (h / 4) * i;
    g.moveTo(cx - 32, y);
    g.lineTo(cx, y + 16);
    g.moveTo(cx, y + 16);
    g.lineTo(cx + 32, y);
  }
  g.stroke();
  g.globalAlpha = 1;
}

function drawWizard(g, ox, oy) {
  const cx = ox + 32;
  const feet = oy + 56;
  poly(g, [[cx - 11, oy + 30], [cx + 11, oy + 30], [cx + 15, feet], [cx - 15, feet]], COLORS.robe, COLORS.robeDark);
  poly(g, [[cx - 6, oy + 10], [cx + 6, oy + 10], [cx + 2, oy - 2], [cx - 2, oy - 2]], COLORS.robeDark);
  poly(g, [[cx - 13, oy + 12], [cx + 13, oy + 12], [cx, oy + 2]], COLORS.robe);
  g.fillStyle = COLORS.skin;
  g.beginPath();
  g.arc(cx, oy + 20, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#20140c';
  g.fillRect(cx - 4, oy + 18, 2, 2);
  g.fillRect(cx + 2, oy + 18, 2, 2);
  g.strokeStyle = COLORS.wood;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx + 15, feet);
  g.lineTo(cx + 15, oy + 12);
  g.stroke();
  g.fillStyle = '#7ce7ff';
  g.beginPath();
  g.arc(cx + 15, oy + 10, 3, 0, Math.PI * 2);
  g.fill();
}

function drawWarrior(g, ox, oy) {
  const cx = ox + 32;
  const feet = oy + 56;
  poly(g, [[cx - 10, oy + 30], [cx + 10, oy + 30], [cx + 12, feet], [cx - 12, feet]], COLORS.cloth, '#5d2626');
  g.fillStyle = COLORS.steel;
  g.fillRect(cx - 11, oy + 22, 22, 11);
  g.fillStyle = COLORS.steelDark;
  g.fillRect(cx - 11, oy + 31, 22, 2);
  g.fillStyle = COLORS.skin;
  g.beginPath();
  g.arc(cx, oy + 18, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = COLORS.steel;
  g.beginPath();
  g.arc(cx, oy + 16, 7, Math.PI, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 7, oy + 15, 14, 2);
  g.strokeStyle = COLORS.steel;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx + 15, feet);
  g.lineTo(cx + 15, oy + 14);
  g.stroke();
  g.strokeStyle = COLORS.leather;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 14, feet - 2);
  g.lineTo(cx - 18, oy + 30);
  g.stroke();
}

function drawDummy(g, ox, oy) {
  const cx = ox + 32;
  const feet = oy + 56;
  g.fillStyle = COLORS.wood;
  g.fillRect(cx - 3, oy + 18, 6, feet - (oy + 18));
  g.fillRect(cx - 14, oy + 28, 28, 4);
  g.fillStyle = COLORS.straw;
  g.beginPath();
  g.arc(cx, oy + 16, 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8d7a3f';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx - 8, oy + 16);
  g.lineTo(cx + 8, oy + 16);
  g.stroke();
  g.fillStyle = '#3a2a18';
  g.fillRect(cx - 4, oy + 13, 2, 2);
  g.fillRect(cx + 2, oy + 13, 2, 2);
}

function drawShadow(g, ox, oy) {
  g.fillStyle = 'rgba(0, 0, 0, 0.38)';
  g.beginPath();
  g.ellipse(ox + 32, oy + 16, 17, 8, 0, 0, Math.PI * 2);
  g.fill();
}

function drawStairs(g, ox, oy) {
  const cx = ox + 32;
  diamond(g, cx, oy + 16, '#0d1016', '#05070a');
  for (let i = 0; i < 4; i++) {
    const halfW = 14 - i * 3;
    const y = oy + 9 + i * 4;
    g.fillStyle = i % 2 === 0 ? '#3a4454' : '#2a323e';
    g.beginPath();
    g.moveTo(cx - halfW, y);
    g.lineTo(cx + halfW, y);
    g.lineTo(cx + halfW - 3, y + 4);
    g.lineTo(cx - halfW + 3, y + 4);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(120, 210, 255, 0.7)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx, oy + 30);
  g.lineTo(cx, oy + 24);
  g.moveTo(cx - 3, oy + 27);
  g.lineTo(cx, oy + 30);
  g.lineTo(cx + 3, oy + 27);
  g.stroke();
}

function drawHighlight(g, ox, oy) {
  const cx = ox + 32;
  g.strokeStyle = 'rgba(255, 224, 120, 0.95)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, oy + 3);
  g.lineTo(cx + 28, oy + 16);
  g.lineTo(cx, oy + 29);
  g.lineTo(cx - 28, oy + 16);
  g.closePath();
  g.stroke();
  g.fillStyle = 'rgba(255, 224, 120, 0.14)';
  g.fill();
}

function drawBar(g, ox, oy) {
  g.fillStyle = '#ffffff';
  g.fillRect(ox, oy, 2, 2);
}

function drawSlash(g, ox, oy) {
  const cx = ox + 32;
  const cy = oy + 32;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(cx, cy, 23, Math.PI * -0.72, Math.PI * 0.28);
  g.stroke();
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, 15, Math.PI * -0.62, Math.PI * 0.16);
  g.stroke();
  g.globalAlpha = 1;
  g.lineCap = 'butt';
}

function drawTotem(g, ox, oy) {
  const cx = ox + 32;
  const base = oy + 54;
  poly(g, [[cx - 8, base], [cx + 8, base], [cx + 5, oy + 32], [cx - 5, oy + 32]], '#4a5263', '#262c37');
  diamond(g, cx, oy + 32, '#6b7488', '#2b3140');
  g.fillStyle = '#d9d2b8';
  g.beginPath();
  g.arc(cx, oy + 24, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a2a18';
  g.fillRect(cx - 4, oy + 23, 2, 2);
  g.fillRect(cx + 2, oy + 23, 2, 2);
  g.fillStyle = 'rgba(140, 230, 255, 0.85)';
  g.beginPath();
  g.arc(cx, oy + 40, 4, 0, Math.PI * 2);
  g.fill();
}

function drawGolem(g, ox, oy) {
  const cx = ox + 32;
  const feet = oy + 56;
  poly(g, [[cx - 16, oy + 34], [cx + 16, oy + 34], [cx + 20, feet], [cx - 20, feet]], '#6b6250', '#3d3728');
  g.fillStyle = '#7a7059';
  g.fillRect(cx - 24, oy + 30, 9, 22);
  g.fillRect(cx + 15, oy + 30, 9, 22);
  g.fillStyle = '#857b62';
  g.beginPath();
  g.arc(cx, oy + 24, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9fe8ff';
  g.fillRect(cx - 5, oy + 22, 3, 3);
  g.fillRect(cx + 2, oy + 22, 3, 3);
  g.strokeStyle = 'rgba(40, 34, 24, 0.8)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx - 10, oy + 42);
  g.lineTo(cx - 4, oy + 48);
  g.lineTo(cx - 7, feet - 2);
  g.stroke();
}

function drawBlood(g, ox, oy) {
  const cx = ox + 16;
  const cy = oy + 18;
  poly(g, [[cx, oy + 4], [cx + 8, cy], [cx, cy + 10], [cx - 8, cy]], '#c42b4c', '#7d1029');
  g.fillStyle = 'rgba(255, 170, 190, 0.8)';
  g.beginPath();
  g.arc(cx - 2, cy - 2, 2, 0, Math.PI * 2);
  g.fill();
}

function drawSpark(g, ox, oy) {
  g.fillStyle = '#ffffff';
  g.fillRect(ox, oy, 2, 2);
}

function drawBoneFigure(g, cx, oy, { robe = false, bow = false, staff = false } = {}) {
  const feet = oy + 56;
  if (robe) {
    poly(g, [[cx - 12, oy + 28], [cx + 12, oy + 28], [cx + 16, feet], [cx - 16, feet]], '#3c3550', '#211c2e');
    poly(g, [[cx - 9, oy + 14], [cx + 9, oy + 14], [cx + 4, oy + 26], [cx - 4, oy + 26]], '#4b4266');
  } else {
    g.strokeStyle = COLORS.bone;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 4, oy + 38);
    g.lineTo(cx - 6, feet);
    g.moveTo(cx + 4, oy + 38);
    g.lineTo(cx + 6, feet);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 10, oy + 40);
    g.lineTo(cx + 10, oy + 40);
    g.stroke();
  }

  g.fillStyle = COLORS.bone;
  g.fillRect(cx - 8, oy + 26, 16, 12);
  g.strokeStyle = COLORS.boneDark;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    g.moveTo(cx - 7, oy + 29 + i * 3);
    g.lineTo(cx + 7, oy + 29 + i * 3);
  }
  g.stroke();

  g.fillStyle = COLORS.bone;
  g.beginPath();
  g.arc(cx, oy + 17, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1a1510';
  g.beginPath();
  g.arc(cx - 3, oy + 16, 2, 0, Math.PI * 2);
  g.arc(cx + 3, oy + 16, 2, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 2, oy + 23, 4, 2);

  if (bow) {
    g.strokeStyle = '#8a5a34';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx + 14, oy + 34, 11, -Math.PI * 0.55, Math.PI * 0.55);
    g.stroke();
    g.strokeStyle = 'rgba(230, 230, 220, 0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx + 17, oy + 25);
    g.lineTo(cx + 17, oy + 43);
    g.stroke();
  } else if (staff) {
    g.strokeStyle = COLORS.wood;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + 14, feet);
    g.lineTo(cx + 14, oy + 14);
    g.stroke();
    g.fillStyle = '#c39bff';
    g.beginPath();
    g.arc(cx + 14, oy + 12, 4, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = COLORS.steelDark;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + 12, feet);
    g.lineTo(cx + 14, oy + 20);
    g.stroke();
  }
}

function drawSkeleton(g, ox, oy) {
  const cx = ox + 32;
  drawBoneFigure(g, cx, oy);
}

function drawSkeletonArcher(g, ox, oy) {
  const cx = ox + 32;
  drawBoneFigure(g, cx, oy, { bow: true });
}

function drawSkeletonMage(g, ox, oy) {
  const cx = ox + 32;
  drawBoneFigure(g, cx, oy, { robe: true, staff: true });
}

function drawZombie(g, ox, oy) {
  const cx = ox + 32;
  const feet = oy + 56;
  poly(g, [[cx - 11, oy + 30], [cx + 11, oy + 30], [cx + 13, feet], [cx - 13, feet]], COLORS.rotDark, '#2f4022');
  g.strokeStyle = COLORS.rot;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx - 10, oy + 32);
  g.lineTo(cx - 18, oy + 44);
  g.moveTo(cx + 10, oy + 32);
  g.lineTo(cx + 18, oy + 40);
  g.stroke();
  g.fillStyle = COLORS.rot;
  g.beginPath();
  g.arc(cx, oy + 20, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8e8a8';
  g.fillRect(cx - 5, oy + 18, 3, 3);
  g.fillRect(cx + 2, oy + 18, 3, 3);
  g.fillStyle = '#2b2016';
  g.fillRect(cx - 4, oy + 24, 8, 2);
  g.fillStyle = '#5d3a3a';
  g.fillRect(cx - 6, oy + 34, 5, 8);
}

function drawBat(g, ox, oy) {
  const cx = ox + 32;
  const cy = oy + 34;
  g.fillStyle = COLORS.batWing;
  poly(g, [[cx - 2, cy], [cx - 22, cy - 8], [cx - 18, cy + 4], [cx - 8, cy + 6]], COLORS.batWing);
  poly(g, [[cx + 2, cy], [cx + 22, cy - 8], [cx + 18, cy + 4], [cx + 8, cy + 6]], COLORS.batWing);
  g.fillStyle = COLORS.bat;
  g.beginPath();
  g.ellipse(cx, cy, 7, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(cx - 6, cy - 7);
  g.lineTo(cx - 2, cy - 14);
  g.lineTo(cx, cy - 7);
  g.moveTo(cx + 6, cy - 7);
  g.lineTo(cx + 2, cy - 14);
  g.lineTo(cx, cy - 7);
  g.fill();
  g.fillStyle = '#ff5b6e';
  g.fillRect(cx - 4, cy - 3, 2, 2);
  g.fillRect(cx + 2, cy - 3, 2, 2);
}

function drawVampire(g, ox, oy) {
  const cx = ox + 32;
  const feet = oy + 56;
  poly(g, [[cx - 14, oy + 26], [cx + 14, oy + 26], [cx + 20, feet], [cx - 20, feet]], COLORS.vampCape, '#2a101b');
  g.fillStyle = '#2a101b';
  g.fillRect(cx - 3, oy + 30, 6, feet - (oy + 30));
  g.fillStyle = COLORS.vampSkin;
  g.beginPath();
  g.arc(cx, oy + 18, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1c1018';
  g.beginPath();
  g.arc(cx, oy + 14, 8, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff4a66';
  g.fillRect(cx - 4, oy + 17, 2, 2);
  g.fillRect(cx + 2, oy + 17, 2, 2);
  g.fillStyle = '#ffffff';
  g.fillRect(cx - 3, oy + 22, 2, 3);
  g.fillRect(cx + 1, oy + 22, 2, 3);
  g.strokeStyle = COLORS.vampSkin;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 12, oy + 30);
  g.lineTo(cx - 20, oy + 40);
  g.moveTo(cx + 12, oy + 30);
  g.lineTo(cx + 20, oy + 40);
  g.stroke();
  g.fillStyle = '#c9d6ff';
  g.beginPath();
  g.arc(cx - 20, oy + 42, 2, 0, Math.PI * 2);
  g.arc(cx + 20, oy + 42, 2, 0, Math.PI * 2);
  g.fill();
}


function drawShrine(g, ox, oy, color) {
  const cx = ox + 32;
  const base = oy + 56;
  poly(g, [[cx - 16, base], [cx + 16, base], [cx + 12, base - 10], [cx - 12, base - 10]], '#3b4251', '#20252f');
  poly(g, [[cx - 8, base - 10], [cx + 8, base - 10], [cx + 6, base - 28], [cx - 6, base - 28]], '#5b6476', '#2b3140');
  diamond(g, cx, base - 30, '#4a5263', '#262c37');
  g.globalAlpha = 0.35;
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx, base - 42, 13, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx, base - 42, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.8)';
  g.beginPath();
  g.arc(cx - 2, base - 45, 2, 0, Math.PI * 2);
  g.fill();
}

function drawBoss(g, ox, oy) {
  const cx = ox + 32;
  g.fillStyle = 'rgba(126, 70, 210, 0.22)';
  g.beginPath();
  g.ellipse(cx, oy + 34, 24, 27, 0, 0, Math.PI * 2);
  g.fill();
  drawBoneFigure(g, cx, oy, { robe: true, staff: true });
  poly(g, [[cx - 9, oy + 10], [cx - 6, oy + 2], [cx - 2, oy + 8], [cx + 2, oy + 1], [cx + 6, oy + 8], [cx + 9, oy + 10]], '#d9b64a', '#8d7420');
  g.fillStyle = '#d68dff';
  g.fillRect(cx - 4, oy + 15, 3, 3);
  g.fillRect(cx + 2, oy + 15, 3, 3);
  g.strokeStyle = 'rgba(170, 110, 255, 0.65)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, oy + 48, 18, Math.PI * 0.1, Math.PI * 0.9);
  g.stroke();
}

function drawExitPortal(g, ox, oy) {
  const cx = ox + 32;
  const cy = oy + 34;
  g.strokeStyle = 'rgba(120, 210, 255, 0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(cx, cy, 16, 22, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(170, 240, 255, 0.6)';
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(cx, cy, 11, 16, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(90, 170, 255, 0.28)';
  g.beginPath();
  g.ellipse(cx, cy, 14, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(220, 250, 255, 0.9)';
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + 0.4;
    g.beginPath();
    g.arc(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 19, 1.6, 0, Math.PI * 2);
    g.fill();
  }
}

export function buildAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  drawFloorTile(g, 0, 0, COLORS.floor, COLORS.floorEdge);
  drawFloorTile(g, 0, 32, COLORS.floorAlt, COLORS.floorAltEdge);
  drawWall(g, 64, 0);
  drawWizard(g, 128, 0);
  drawWarrior(g, 192, 0);
  drawDummy(g, 0, 64);
  drawShadow(g, 64, 64);
  drawHighlight(g, 128, 64);
  drawStairs(g, 192, 64);
  drawBar(g, 0, 128);
  drawSlash(g, 16, 128);
  drawTotem(g, 0, 192);
  drawGolem(g, 64, 192);
  drawBlood(g, 128, 192);
  drawSpark(g, 160, 192);
  drawSkeleton(g, 0, 256);
  drawSkeletonArcher(g, 64, 256);
  drawSkeletonMage(g, 128, 256);
  drawZombie(g, 192, 256);
  drawBat(g, 256, 256);
  drawVampire(g, 320, 256);
  drawShrine(g, 0, 320, '#8ef2a6');
  drawShrine(g, 64, 320, '#9ec9ff');
  drawShrine(g, 128, 320, '#f3d68a');
  drawBoss(g, 192, 320);
  drawExitPortal(g, 256, 320);

  return canvas;
}

export function spriteUv(def) {
  return {
    u0: def.x / ATLAS_SIZE,
    v0: def.y / ATLAS_SIZE,
    u1: (def.x + def.w) / ATLAS_SIZE,
    v1: (def.y + def.h) / ATLAS_SIZE,
  };
}
