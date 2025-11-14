import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

const SQUARE_SIZE = 1;
const BOARD_OFFSET = (8 * SQUARE_SIZE) / 2;
const SAFE_COLOR = { r: 13 / 255, g: 148 / 255, b: 136 / 255 };
const HOT_COLOR = { r: 239 / 255, g: 68 / 255, b: 68 / 255 };
const HEAT_MIN_VALUE = 0.02;
const HEAT_BASE_OFFSET = 0.012;
const HEAT_MIN_HEIGHT = 0.12;
const HEAT_HEIGHT_SCALE = 3.8;
const HEAT_EDGE_BLEND = 0.6;

const BOARD_MODEL_PATH = '/OBJ/GEO_ChessBoard.obj';

const PIECE_MODEL_PATHS = {
  w: {
    P: '/OBJ/GEO_WhitePawn.obj',
    N: '/OBJ/GEO_WhiteKnight.obj',
    B: '/OBJ/GEO_WhiteBishop.obj',
    R: '/OBJ/GEO_WhiteRook.obj',
    Q: '/OBJ/GEO_WhiteQueen.obj',
    K: '/OBJ/GEO_WhiteKing.obj',
  },
  b: {
    P: '/OBJ/GEO_BlackPawn.obj',
    N: '/OBJ/GEO_BlackKnight.obj',
    B: '/OBJ/GEO_BlackBishop.obj',
    R: '/OBJ/GEO_BlackRook.obj',
    Q: '/OBJ/GEO_BlackQueen.obj',
    K: '/OBJ/GEO_BlackKing.obj',
  },
};

const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();
mtlLoader.setResourcePath('/Textures/');
const modelCache = new Map();
const pendingLoads = new Map();
const heatGeometry = new THREE.CylinderGeometry(0.2, 0.5, 1, 4, 1, false);
heatGeometry.computeVertexNormals();
const heatMeshes = new Array(64).fill(null);
const HEAT_MATERIAL_TEMPLATE = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.45,
  roughness: 0.35,
  metalness: 0.05,
  transmission: 0.35,
  side: THREE.DoubleSide,
  depthWrite: false,
});
let boardMetrics = createBoardMetrics(8 * SQUARE_SIZE, 8 * SQUARE_SIZE, 0, 0, 0);
let boardBounds = null;
let requestRelayout = () => {};
let materialMode = 'wooden';
let currentBoardMesh = null;

export function initBoard3D(container) {
  if (!container) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(5.5, 6.5, 5.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 30;
  controls.target.set(0, 0, 0);
  controls.update();

  const ambient = new THREE.AmbientLight(0x94a3b8, 0.6);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.9);
  directional.position.set(5, 10, 2);
  directional.castShadow = true;
  scene.add(directional);

  loadBoardModel();

  const pieceGroup = new THREE.Group();
  scene.add(pieceGroup);
  const heatGroup = new THREE.Group();
  heatGroup.renderOrder = 20;
  scene.add(heatGroup);
  let updateToken = 0;
  let lastBoardState = null;
  let lastBoardOptions = null;
  requestRelayout = () => {
    if (lastBoardState) {
      updateBoard(lastBoardState, lastBoardOptions);
    }
  };

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  function updateBoard(board, options = {}) {
    if (!board) return;
    lastBoardState = board;
    lastBoardOptions = options;
    const token = ++updateToken;
    while (pieceGroup.children.length) {
      const child = pieceGroup.children.pop();
      pieceGroup.remove(child);
    }
    board.forEach((piece, idx) => {
      if (!piece) return;
      const modelPath = PIECE_MODEL_PATHS[piece[0]]?.[piece[1]];
      if (!modelPath) return;
      const file = idx % 8;
      const rank = Math.floor(idx / 8);
      loadModel(modelPath)
        .then((template) => {
          if (token !== updateToken) return;
          const mesh = template.clone(true);
          mesh.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          scalePieceMesh(mesh);
          placePieceOnBoard(mesh, file, rank);
          pieceGroup.add(mesh);
        })
        .catch(() => {});
    });
    updateHeatVolumes({
      group: heatGroup,
      heatValues: options.heatValues,
      showHeat: options.showHeat,
      baseScale: options.heatBaseScale,
    });
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
  }

  function replaceBoardMesh(mesh) {
    if (currentBoardMesh) {
      scene.remove(currentBoardMesh);
    }
    currentBoardMesh = mesh;
    boardBounds = new THREE.Box3().setFromObject(currentBoardMesh);
    scene.add(currentBoardMesh);
  }

  function loadBoardModel() {
    const targetMode = materialMode;
    loadModel(BOARD_MODEL_PATH, targetMode)
      .then((template) => {
        if (targetMode !== materialMode) return;
        const boardMesh = template.clone(true);
        centerMesh(boardMesh);
        fitBoardToGrid(boardMesh);
        updateBoardMetricsFromMesh(boardMesh);
        replaceBoardMesh(boardMesh);
      })
      .catch(() => {
        const fallback = createFallbackBoard();
        updateBoardMetricsFromMesh(fallback);
        replaceBoardMesh(fallback);
      });
  }

  window.addEventListener('resize', resize);

  return {
    updateBoard,
    show: () => {
      container.style.display = 'block';
      resize();
    },
    hide: () => {
      container.style.display = 'none';
    },
    setMaterialMode: (mode) => {
      if (materialMode === mode) return;
      materialMode = mode;
      loadBoardModel();
      requestRelayout();
    },
    getMaterialMode: () => materialMode,
  };
}

function placePieceOnBoard(mesh, file, rank) {
  const x = boardMetrics.startX + file * boardMetrics.squareSizeX;
  const z = boardMetrics.startZ + rank * boardMetrics.squareSizeZ;
  mesh.position.set(x, boardMetrics.surfaceY, z);
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const desiredBase = boardMetrics.surfaceY + 0.01;
  const delta = desiredBase - bounds.min.y;
  mesh.position.y += delta;
}

function scalePieceMesh(mesh) {
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const size = bounds.getSize(new THREE.Vector3());
  const target = Math.min(boardMetrics.squareSizeX, boardMetrics.squareSizeZ) * 0.8;
  const maxDiameter = Math.max(size.x, size.z) || 1;
  const scale = target / maxDiameter;
  mesh.scale.multiplyScalar(scale);
  mesh.updateMatrixWorld(true);
}

function centerMesh(mesh) {
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const center = bounds.getCenter(new THREE.Vector3());
  mesh.position.sub(center);
}

function updateHeatVolumes({ group, heatValues, showHeat, baseScale }) {
  if (!group) return;
  const hasValues = Array.isArray(heatValues) && heatValues.length === 64;
  const active = Boolean(showHeat && hasValues);
  group.visible = active;
  for (let i = 0; i < heatMeshes.length; i++) {
    if (heatMeshes[i]) {
      heatMeshes[i].visible = false;
    }
  }
  if (!active) {
    return;
  }
  const unit = Math.min(boardMetrics.squareSizeX, boardMetrics.squareSizeZ);
  const normalizedScale = clampHeatBaseScale(baseScale ?? 1);
  const baseOffset = unit * HEAT_BASE_OFFSET;
  const minHeight = unit * HEAT_MIN_HEIGHT;
  const heightScale = unit * HEAT_HEIGHT_SCALE;
  const scaleX = boardMetrics.squareSizeX * normalizedScale;
  const scaleZ = boardMetrics.squareSizeZ * normalizedScale;
  for (let idx = 0; idx < 64; idx++) {
    const value = clampUnit(heatValues[idx] ?? 0);
    if (value <= HEAT_MIN_VALUE) continue;
    const mesh = ensureHeatMesh(idx, group);
    if (!mesh) continue;
    const neighborAvg = computeNeighborAverage(idx, heatValues);
    const edgeValue = Number.isFinite(neighborAvg)
      ? clampUnit(HEAT_EDGE_BLEND * neighborAvg + (1 - HEAT_EDGE_BLEND) * value)
      : value;
    const centerHeight = minHeight + value * heightScale;
    const shoulderHeight = (minHeight * 0.6) + edgeValue * heightScale * 0.85;
    const topHeight = Math.max(centerHeight, shoulderHeight + unit * 0.05);
    const bottomHeight = Math.max(0, Math.min(centerHeight, shoulderHeight * 0.85));
    const height = Math.max(minHeight * 0.7, topHeight - bottomHeight);
    const { file, rank } = idxToCoord(idx);
    const x = boardMetrics.startX + file * boardMetrics.squareSizeX;
    const z = boardMetrics.startZ + rank * boardMetrics.squareSizeZ;
    mesh.visible = true;
    mesh.scale.set(scaleX, height, scaleZ);
    mesh.position.set(x, boardMetrics.surfaceY + baseOffset + height / 2, z);
    applyHeatColor(mesh.material, value);
  }
}

function ensureHeatMesh(idx, group) {
  if (heatMeshes[idx]) {
    return heatMeshes[idx];
  }
  const material = HEAT_MATERIAL_TEMPLATE.clone();
  const mesh = new THREE.Mesh(heatGeometry, material);
  mesh.rotation.y = Math.PI / 4;
  mesh.renderOrder = 25;
  heatMeshes[idx] = mesh;
  group.add(mesh);
  return mesh;
}

function computeNeighborAverage(idx, heatValues) {
  const neighbors = [];
  const file = idx % 8;
  const rank = Math.floor(idx / 8);
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const f = file + df;
      const r = rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const neighborIdx = r * 8 + f;
      const val = heatValues[neighborIdx];
      if (typeof val === 'number') {
        neighbors.push(val);
      }
    }
  }
  if (!neighbors.length) return null;
  return neighbors.reduce((sum, val) => sum + val, 0) / neighbors.length;
}

function applyHeatColor(material, value) {
  if (!material) return;
  const clamped = clampUnit(value);
  const r = SAFE_COLOR.r + (HOT_COLOR.r - SAFE_COLOR.r) * clamped;
  const g = SAFE_COLOR.g + (HOT_COLOR.g - SAFE_COLOR.g) * clamped;
  const b = SAFE_COLOR.b + (HOT_COLOR.b - SAFE_COLOR.b) * clamped;
  material.color.setRGB(r, g, b);
  material.emissive.setRGB(r * 0.2, g * 0.2, b * 0.2);
  material.opacity = 0.35 + clamped * 0.25;
}

function clampUnit(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampHeatBaseScale(value) {
  if (!Number.isFinite(value)) return 1;
  if (value < 0.5) return 0.5;
  if (value > 1.5) return 1.5;
  return value;
}

function idxToCoord(idx) {
  return {
    file: idx % 8,
    rank: Math.floor(idx / 8),
  };
}

function createBoardMetrics(width, depth, surfaceY, borderX = 0, borderZ = 0) {
  const playableWidth = Math.max(0.0001, width - 2 * borderX);
  const playableDepth = Math.max(0.0001, depth - 2 * borderZ);
  const squareSizeX = playableWidth / 8;
  const squareSizeZ = playableDepth / 8;
  return {
    width,
    depth,
    squareSizeX,
    squareSizeZ,
    startX: -width / 2 + borderX + squareSizeX / 2,
    startZ: -depth / 2 + borderZ + squareSizeZ / 2,
    surfaceY,
    borderX,
    borderZ,
  };
}

function loadModel(objPath, mode = materialMode) {
  const cacheKey = `${objPath}|${mode}`;
  if (modelCache.has(cacheKey)) {
    return Promise.resolve(modelCache.get(cacheKey));
  }
  if (pendingLoads.has(cacheKey)) {
    return pendingLoads.get(cacheKey);
  }
  const basePath = objPath.replace(/\.obj$/i, '');
  const candidates = [`${basePath}_${mode}.mtl`, `${basePath}.mtl`];
  const promise = new Promise((resolve, reject) => {
    const tryLoad = (index) => {
      if (index >= candidates.length) {
        new OBJLoader().load(
          objPath,
          (obj) => finalizeLoad(cacheKey, obj, resolve),
          undefined,
          (err) => {
            pendingLoads.delete(cacheKey);
            reject(err);
          },
        );
        return;
      }
      const mtlPath = candidates[index];
      mtlLoader.load(
        mtlPath,
        (materials) => {
          materials.preload();
          const loader = new OBJLoader();
          loader.setMaterials(materials);
          loader.load(
            objPath,
            (obj) => finalizeLoad(cacheKey, obj, resolve),
            undefined,
            () => tryLoad(index + 1),
          );
        },
        undefined,
        () => tryLoad(index + 1),
      );
    };
    tryLoad(0);
  });
  pendingLoads.set(cacheKey, promise);
  return promise;
}

function finalizeLoad(key, object, resolve) {
  pendingLoads.delete(key);
  modelCache.set(key, object);
  resolve(object);
}

function createFallbackBoard() {
  const group = new THREE.Group();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const color = (rank + file) % 2 === 0 ? 0xf5f5f4 : 0x475569;
      const geo = new THREE.BoxGeometry(SQUARE_SIZE, 0.05, SQUARE_SIZE);
      const mat = new THREE.MeshPhongMaterial({ color });
      const tile = new THREE.Mesh(geo, mat);
      tile.position.set(file * SQUARE_SIZE - BOARD_OFFSET + SQUARE_SIZE / 2, -0.025, rank * SQUARE_SIZE - BOARD_OFFSET + SQUARE_SIZE / 2);
      group.add(tile);
    }
  }
  return group;
}

function fitBoardToGrid(boardMesh) {
  boardMesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(boardMesh);
  const size = bounds.getSize(new THREE.Vector3());
  const targetWidth = 8 * SQUARE_SIZE;
  const targetDepth = 8 * SQUARE_SIZE;
  const scaleX = targetWidth / (size.x || targetWidth);
  const scaleZ = targetDepth / (size.z || targetDepth);
  const scale = Math.min(scaleX, scaleZ);
  boardMesh.scale.multiplyScalar(scale);
  boardMesh.updateMatrixWorld(true);
  centerMesh(boardMesh);
}

function updateBoardMetricsFromMesh(boardMesh) {
  boardMesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(boardMesh);
  const size = bounds.getSize(new THREE.Vector3());
  const { borderX, borderZ } = computeBorderOffsets(boardMesh, bounds);
  boardMetrics = createBoardMetrics(size.x, size.z, bounds.max.y, borderX, borderZ);
  requestRelayout();
}

function computeBorderOffsets(boardMesh, bounds) {
  const targetSquares = determineSquarePositions(boardMesh, bounds);
  if (!targetSquares) {
    return { borderX: 0, borderZ: 0, squareSizeX: bounds.getSize(new THREE.Vector3()).x / 8, squareSizeZ: bounds.getSize(new THREE.Vector3()).z / 8 };
  }
  const { minFile, maxFile, minRank, maxRank } = targetSquares;
  const squareSizeX = (maxFile - minFile) / 7;
  const squareSizeZ = (maxRank - minRank) / 7;
  return {
    borderX: minFile - bounds.min.x,
    borderZ: minRank - bounds.min.z,
    squareSizeX,
    squareSizeZ,
  };
}

function determineSquarePositions(boardMesh, bounds) {
  const points = [];
  const vertex = new THREE.Vector3();
  boardMesh.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const position = child.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
      points.push({ x: vertex.x, z: vertex.z });
    }
  });
  if (!points.length) return null;
  const xs = Array.from(new Set(points.map((p) => Number(p.x.toFixed(4))))).sort((a, b) => a - b);
  const zs = Array.from(new Set(points.map((p) => Number(p.z.toFixed(4))))).sort((a, b) => a - b);
  const gapX = largestGap(xs);
  const gapZ = largestGap(zs);
  if (!gapX || !gapZ) return null;
  return {
    minFile: gapX.min,
    maxFile: gapX.max,
    minRank: gapZ.min,
    maxRank: gapZ.max,
  };
}

function largestGap(values) {
  if (values.length < 2) return null;
  let maxGap = -Infinity;
  let result = null;
  for (let i = 0; i < values.length - 1; i++) {
    const gap = values[i + 1] - values[i];
    if (gap > maxGap) {
      maxGap = gap;
      result = { min: values[i], max: values[i + 1], gap };
    }
  }
  return result;
}
