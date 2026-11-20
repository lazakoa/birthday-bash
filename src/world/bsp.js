import { Rng } from './rng.js';

export const MAP_SIZE = 144;
export const ROOM_TARGET = 50;
export const MIN_LEAF_SIZE = 14;
export const ROOM_PADDING = 2;
export const MIN_ROOM_SIZE = 5;
export const MAX_ROOM_SIZE = 12;
export const HALLWAY_WIDTH = 2;

function isSplittable(node) {
  return node.w >= MIN_LEAF_SIZE * 2 || node.h >= MIN_LEAF_SIZE * 2;
}

function splitNode(node, rng) {
  let vertical;
  if (node.w >= node.h * 1.25) vertical = true;
  else if (node.h >= node.w * 1.25) vertical = false;
  else vertical = rng.chance(0.5);

  if (vertical && node.w < MIN_LEAF_SIZE * 2) vertical = false;
  if (!vertical && node.h < MIN_LEAF_SIZE * 2) vertical = true;

  const size = vertical ? node.w : node.h;
  const minCut = MIN_LEAF_SIZE;
  const maxCut = size - MIN_LEAF_SIZE;
  const cut = rng.int(minCut, maxCut);

  node.left = {
    x: node.x,
    y: node.y,
    w: vertical ? cut : node.w,
    h: vertical ? node.h : cut,
    left: null,
    right: null,
    room: null,
  };
  node.right = {
    x: vertical ? node.x + cut : node.x,
    y: vertical ? node.y : node.y + cut,
    w: vertical ? node.w - cut : node.w,
    h: vertical ? node.h : node.h - cut,
    left: null,
    right: null,
    room: null,
  };
}

function chooseFloorRoom(node, rng, rooms) {
  const availableW = node.w - ROOM_PADDING * 2;
  const availableH = node.h - ROOM_PADDING * 2;
  if (availableW < MIN_ROOM_SIZE || availableH < MIN_ROOM_SIZE) {
    rooms.push({ x: node.x + ROOM_PADDING, y: node.y + ROOM_PADDING, w: Math.max(3, availableW), h: Math.max(3, availableH) });
    return rooms[rooms.length - 1];
  }
  const maxW = Math.min(MAX_ROOM_SIZE, availableW);
  const maxH = Math.min(MAX_ROOM_SIZE, availableH);
  const w = rng.int(Math.min(MIN_ROOM_SIZE, maxW), maxW);
  const h = rng.int(Math.min(MIN_ROOM_SIZE, maxH), maxH);
  const x = rng.int(node.x + ROOM_PADDING, node.x + node.w - ROOM_PADDING - w);
  const y = rng.int(node.y + ROOM_PADDING, node.y + node.h - ROOM_PADDING - h);
  const room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
  rooms.push(room);
  return room;
}

function hallwayRects(a, b, rng) {
  const rects = [];
  const width = HALLWAY_WIDTH;
  const horizontalFirst = rng.chance(0.5);

  if (horizontalFirst) {
    rects.push({
      x: Math.min(a.x, b.x),
      y: a.y,
      w: Math.abs(b.x - a.x) + width,
      h: width,
    });
    rects.push({
      x: b.x,
      y: Math.min(a.y, b.y),
      w: width,
      h: Math.abs(b.y - a.y) + width,
    });
  } else {
    rects.push({
      x: a.x,
      y: Math.min(a.y, b.y),
      w: width,
      h: Math.abs(b.y - a.y) + width,
    });
    rects.push({
      x: Math.min(a.x, b.x),
      y: b.y,
      w: Math.abs(b.x - a.x) + width,
      h: width,
    });
  }

  return rects;
}

function connectTree(node, rng, rects) {
  if (!node.left) return node.room;
  const left = connectTree(node.left, rng, rects);
  const right = connectTree(node.right, rng, rects);
  const from = { x: left.cx, y: left.cy };
  const to = { x: right.cx, y: right.cy };
  rects.push(...hallwayRects(from, to, rng));
  return rng.chance(0.5) ? left : right;
}

export function generateLayout(seed) {
  const rng = new Rng(seed);
  const root = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE, left: null, right: null, room: null };
  const leaves = [root];

  while (leaves.length < ROOM_TARGET) {
    const candidates = leaves.filter(isSplittable);
    if (candidates.length === 0) {
      throw new Error('BSP could not reach the target room count');
    }
    let best = candidates[0];
    for (const candidate of candidates) {
      if (candidate.w * candidate.h > best.w * best.h) best = candidate;
    }
    const index = leaves.indexOf(best);
    splitNode(best, rng);
    leaves.splice(index, 1, best.left, best.right);
  }

  const rooms = [];
  for (const leaf of leaves) {
    leaf.room = chooseFloorRoom(leaf, rng, rooms);
  }

  const hallwayRectsList = [];
  connectTree(root, rng, hallwayRectsList);

  const corridors = hallwayRectsList.map((rect) => ({
    x: Math.max(1, Math.min(MAP_SIZE - 2 - rect.w, rect.x)),
    y: Math.max(1, Math.min(MAP_SIZE - 2 - rect.h, rect.y)),
    w: rect.w,
    h: rect.h,
  }));

  return { rooms, corridors, roomCount: rooms.length };
}
