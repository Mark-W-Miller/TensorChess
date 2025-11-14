import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

const SQUARE_SIZE = 1;
const BOARD_OFFSET = (8 * SQUARE_SIZE) / 2;

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
let boardMetrics = createBoardMetrics(8 * SQUARE_SIZE, 8 * SQUARE_SIZE, 0, 0, 0);
let boardBounds = null;
let requestRelayout = () => {};

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

  loadModel(BOARD_MODEL_PATH)
    .then((template) => {
      const boardMesh = template.clone(true);
      centerMesh(boardMesh);
      fitBoardToGrid(boardMesh);
      updateBoardMetricsFromMesh(boardMesh);
      boardBounds = new THREE.Box3().setFromObject(boardMesh);
      scene.add(boardMesh);
    })
    .catch(() => {
      const fallback = createFallbackBoard();
      updateBoardMetricsFromMesh(fallback);
      boardBounds = new THREE.Box3().setFromObject(fallback);
      scene.add(fallback);
    });

  const pieceGroup = new THREE.Group();
  scene.add(pieceGroup);
  let updateToken = 0;
  let lastBoardState = null;
  requestRelayout = () => {
    if (lastBoardState) {
      updateBoard(lastBoardState);
    }
  };

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  function updateBoard(board) {
    if (!board) return;
    lastBoardState = board;
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
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
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

function loadModel(objPath) {
  if (modelCache.has(objPath)) {
    return Promise.resolve(modelCache.get(objPath));
  }
  if (pendingLoads.has(objPath)) {
    return pendingLoads.get(objPath);
  }
  const basePath = objPath.replace(/\.obj$/i, '');
  const mtlPath = `${basePath}_wooden.mtl`;
  const promise = new Promise((resolve, reject) => {
    mtlLoader.load(
      mtlPath,
      (materials) => {
        materials.preload();
        objLoader.setMaterials(materials);
        objLoader.load(
          objPath,
          (obj) => {
            finalizeLoad(objPath, obj, resolve);
          },
          undefined,
          (err) => {
            pendingLoads.delete(objPath);
            reject(err);
          },
        );
      },
      undefined,
      () => {
        objLoader.load(
          objPath,
          (obj) => {
            finalizeLoad(objPath, obj, resolve);
          },
          undefined,
          (err) => {
            pendingLoads.delete(objPath);
            reject(err);
          },
        );
      },
    );
  });
  pendingLoads.set(objPath, promise);
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
