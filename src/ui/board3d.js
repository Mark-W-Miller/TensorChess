import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { getPieceAttacks, getMoveRays } from '../model/chess.js';

const SQUARE_SIZE = 1;
const BOARD_OFFSET = (8 * SQUARE_SIZE) / 2;
const SAFE_COLOR = { r: 34 / 255, g: 197 / 255, b: 94 / 255 };
const HOT_COLOR = { r: 239 / 255, g: 68 / 255, b: 68 / 255 };
const HEAT_MIN_VALUE = 0.02;
const HEAT_BASE_OFFSET = 0.012;
const HEAT_MIN_HEIGHT = 0.12;
const HEAT_HEIGHT_SCALE = 3.8;
const HEAT_EDGE_BLEND = 0.6;
const HEAT_BASE_SCALE = 1.4;
const MOVE_RING_COLOR = 0xfbbf24;
const SUPPORT_ARROW_COLOR = 0x7dd3fc;
const THREAT_ARROW_COLOR = 0xf87171;
const TRAVEL_COLOR = 0xfacc15;
const TRAVEL_HEIGHT = 0.04;
const PIECE_VALUE = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 12,
};
const KNIGHT_OFFSETS = [
  { df: 1, dr: 2 },
  { df: 2, dr: 1 },
  { df: -1, dr: 2 },
  { df: -2, dr: 1 },
  { df: 1, dr: -2 },
  { df: 2, dr: -1 },
  { df: -1, dr: -2 },
  { df: -2, dr: -1 },
];
const KING_STEPS = [
  { df: 1, dr: 0 },
  { df: -1, dr: 0 },
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
  { df: 1, dr: 1 },
  { df: -1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: -1 },
];

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
const heatHeights = new Array(64).fill(0);
const kingRingGeometry = new THREE.RingGeometry(0.3, 0.45, 28);
const meshHeatResolution = 64;
let meshHeatMesh = null;
let meshHeatGrid = null;
const EMPTY_HEAT_CELL = { threat: 0, support: 0 };
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
const HEAT_LERP = 0.2;
function clampMeshExtent(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.05, value));
}
const travelMaterial = createTravelMaterial();
let boardMetrics = createBoardMetrics(8 * SQUARE_SIZE, 8 * SQUARE_SIZE, 0, 0, 0);
let boardBounds = null;
let requestRelayout = () => {};
let materialMode = 'wooden';
let currentBoardMesh = null;
let simulationMesh = null;
let simulationPieceKey = null;
let simulationMeshLoading = null;
let kingRingMesh = null;

export function initBoard3D(container) {
  if (!container) return null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(5.5, 9, 5.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.minDistance = 4;
  controls.maxDistance = 30;
  controls.target.set(0, 0.4, 0);
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
  const moveRingGroup = new THREE.Group();
  moveRingGroup.renderOrder = 24;
  scene.add(moveRingGroup);
  const attackVectorGroup = new THREE.Group();
  attackVectorGroup.renderOrder = 26;
  scene.add(attackVectorGroup);
  const travelGroup = new THREE.Group();
  travelGroup.renderOrder = 28;
  scene.add(travelGroup);
  const simulationGroup = new THREE.Group();
  simulationGroup.renderOrder = 30;
  scene.add(simulationGroup);
  const kingRingGroup = new THREE.Group();
  kingRingGroup.renderOrder = 32;
  scene.add(kingRingGroup);
  const meshHeatGroup = new THREE.Group();
  meshHeatGroup.renderOrder = 18;
  scene.add(meshHeatGroup);
  let travelMesh = null;
  const ringGroup = new THREE.Group();
  ringGroup.renderOrder = 30;
  scene.add(ringGroup);
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
    const previousOptions = lastBoardOptions || {};
    const mergedOptions = {
      showHeat: options.showHeat ?? true,
      heatValues: options.heatValues,
      heatHeightScale: options.heatHeightScale,
      showMoveRings: options.showMoveRings ?? false,
      showAttackVectors: options.showAttackVectors ?? false,
      vectorHeightScale: options.vectorHeightScale,
      moveRingHeightScale: options.moveRingHeightScale,
      vectorScale: options.vectorScale ?? previousOptions.vectorScale ?? 0.5,
      vectorState: options.vectorState ?? boardStateToGame(board),
      simulationAnimation: options.simulationAnimation ?? null,
      checkmatedColor: options.checkmatedColor ?? null,
      showMeshHeat: options.showMeshHeat ?? previousOptions.showMeshHeat ?? false,
      meshExtentScale: options.meshExtentScale ?? previousOptions.meshExtentScale ?? 1,
    };
    lastBoardState = board;
    lastBoardOptions = mergedOptions;
    const token = ++updateToken;
    while (pieceGroup.children.length) {
      const child = pieceGroup.children.pop();
      pieceGroup.remove(child);
    }
    const hiddenIndices = new Set();
    if (mergedOptions.simulationAnimation) {
      hiddenIndices.add(mergedOptions.simulationAnimation.fromIdx);
      if (mergedOptions.simulationAnimation.capturedPiece) {
        hiddenIndices.add(mergedOptions.simulationAnimation.toIdx);
      }
    }
    board.forEach((piece, idx) => {
      if (hiddenIndices.has(idx)) return;
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
      heatValues: mergedOptions.heatValues,
      showHeat: mergedOptions.showHeat && !mergedOptions.showMeshHeat,
      heightScale: mergedOptions.heatHeightScale,
      checkmatedColor: mergedOptions.checkmatedColor,
      vectorState: mergedOptions.vectorState,
    });
    updateMeshHeat({
      group: meshHeatGroup,
      heatValues: mergedOptions.heatValues,
      showMeshHeat: mergedOptions.showMeshHeat,
      heightScale: mergedOptions.meshExtentScale ?? 1,
      vectorState: mergedOptions.vectorState,
    });
    updateMoveRings({
      group: moveRingGroup,
      state: mergedOptions.vectorState,
      showMoveRings: mergedOptions.showMoveRings,
      heightScale: mergedOptions.moveRingHeightScale,
      lengthScale: mergedOptions.vectorHeightScale,
    });
    updateAttackVectors({
      group: attackVectorGroup,
      state: mergedOptions.vectorState,
      showAttackVectors: mergedOptions.showAttackVectors,
      heightScale: mergedOptions.vectorHeightScale,
      vectorScale: mergedOptions.vectorScale,
    });
    updateTravelStrip({
      group: travelGroup,
      animation: mergedOptions.simulationAnimation,
    });
    updateSimulationPiece({
      group: simulationGroup,
      animation: mergedOptions.simulationAnimation,
      token,
    });
    updateKingRing({
      group: kingRingGroup,
      state: mergedOptions.vectorState,
      checkmatedColor: mergedOptions.checkmatedColor,
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
        updateCameraTarget();
        replaceBoardMesh(boardMesh);
      })
      .catch(() => {
        const fallback = createFallbackBoard();
        updateBoardMetricsFromMesh(fallback);
        updateCameraTarget();
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

  function updateCameraTarget() {
    const targetY = (boardMetrics?.surfaceY ?? 0) + 0.4;
    controls.target.set(0, targetY, 0);
    controls.update();
  }
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

function updateHeatVolumes({ group, heatValues, showHeat, heightScale, checkmatedColor, vectorState }) {
  if (!group) return;
  const hasValues = Array.isArray(heatValues) && heatValues.length === 64;
  let anyVisible = false;
  const active = Boolean(showHeat && hasValues);
  const maxExtents = hasValues ? getHeatExtents(heatValues) : { maxThreat: 0, maxSupport: 0 };
  const unit = Math.min(boardMetrics.squareSizeX, boardMetrics.squareSizeZ);
  const heightMultiplier = clampHeatHeightScale(heightScale ?? 1);
  const baseOffset = unit * HEAT_BASE_OFFSET;
  const minHeight = unit * HEAT_MIN_HEIGHT;
  const scaledHeight = unit * HEAT_HEIGHT_SCALE * heightMultiplier;
  const scaleX = boardMetrics.squareSizeX * HEAT_BASE_SCALE;
  const scaleZ = boardMetrics.squareSizeZ * HEAT_BASE_SCALE;
  const { maxThreat, maxSupport } = maxExtents;
  const kingIdx =
    checkmatedColor && vectorState
      ? (vectorState.board ? vectorState.board : vectorState).findIndex((p) => p === `${checkmatedColor}K`)
      : -1;
  for (let idx = 0; idx < 64; idx++) {
    const cell = hasValues ? heatValues[idx] ?? EMPTY_HEAT_CELL : EMPTY_HEAT_CELL;
    const threatIntensity = maxThreat > 0 ? clampUnit((cell.threat ?? 0) / maxThreat) : 0;
    const supportIntensity = maxSupport > 0 ? clampUnit((cell.support ?? 0) / maxSupport) : 0;
    const value = active ? Math.max(threatIntensity, supportIntensity) : 0;
    let targetHeight = 0;
    let edgeValue = value;
    if (value > HEAT_MIN_VALUE && active) {
      const neighborAvg = computeNeighborAverage(idx, heatValues, maxThreat, maxSupport);
      edgeValue = Number.isFinite(neighborAvg)
        ? clampUnit(HEAT_EDGE_BLEND * neighborAvg + (1 - HEAT_EDGE_BLEND) * value)
        : value;
      const centerHeight = minHeight + value * scaledHeight;
      const shoulderHeight = (minHeight * 0.6) + edgeValue * scaledHeight * 0.85;
      const topHeight = Math.max(centerHeight, shoulderHeight + unit * 0.05);
      const bottomHeight = Math.max(0, Math.min(centerHeight, shoulderHeight * 0.85));
      targetHeight = Math.max(minHeight * 0.7, topHeight - bottomHeight);
      if (idx === kingIdx) {
        targetHeight = Math.max(targetHeight, minHeight * 1.4);
      }
    }

    const existing = heatMeshes[idx];
    if (!existing && targetHeight <= 0) {
      heatHeights[idx] = 0;
      continue;
    }
    const mesh = ensureHeatMesh(idx, group);
    const current = heatHeights[idx] ?? 0;
    const nextHeight = current + (targetHeight - current) * HEAT_LERP;
    heatHeights[idx] = nextHeight;
    if (nextHeight <= 0.0001) {
      mesh.visible = false;
      continue;
    }
    const { file, rank } = idxToCoord(idx);
    const x = boardMetrics.startX + file * boardMetrics.squareSizeX;
    const z = boardMetrics.startZ + rank * boardMetrics.squareSizeZ;
    mesh.visible = true;
    mesh.scale.set(scaleX, nextHeight, scaleZ);
    mesh.position.set(x, boardMetrics.surfaceY + baseOffset + nextHeight / 2, z);
    if (idx === kingIdx && checkmatedColor) {
      mesh.material.color.set(0x000000);
      mesh.material.opacity = 0.95;
    } else {
      applyHeatColor(mesh.material, threatIntensity, supportIntensity);
      mesh.material.opacity = HEAT_MATERIAL_TEMPLATE.opacity;
    }
    anyVisible = true;
  }
  group.visible = showHeat || anyVisible;
}

function updateMoveRings({ group, state, showMoveRings, heightScale, lengthScale }) {
  if (!group || !state) return;
  group.visible = Boolean(showMoveRings);
  clearArrowGroup(group);
  if (!showMoveRings) return;
  const workingState = state.board ? state : boardStateToGame(state);
  const board = workingState.board;
  const elevation = clampMoveRingHeightScale(heightScale ?? 0.2);
  const height = boardMetrics.surfaceY + elevation * boardMetrics.squareSizeX;
  const lengthScaleValue = clampVectorHeightScale(lengthScale ?? 0.5);
  const baseLength = Math.min(boardMetrics.squareSizeX, boardMetrics.squareSizeZ) * (0.2 + lengthScaleValue * 0.5);
  board.forEach((piece, idx) => {
    if (!piece) return;
    const start = squarePosition3D(idx);
    start.y = height;
    const directions = computeMoveDirections(board, piece, idx);
    directions.forEach(({ dir, weight }) => {
      const len = baseLength * weight;
      const arrow = new THREE.ArrowHelper(dir, start.clone(), len, MOVE_RING_COLOR, len * 0.3, len * 0.2);
      if (arrow.line.material) {
        arrow.line.material.transparent = true;
        arrow.line.material.opacity = 0.75;
      }
      if (arrow.cone.material) {
        arrow.cone.material.transparent = true;
        arrow.cone.material.opacity = 0.9;
      }
      group.add(arrow);
    });
  });
}

function updateAttackVectors({ group, state, showAttackVectors, heightScale, vectorScale = 0.5 }) {
  if (!group || !state) return;
  group.visible = Boolean(showAttackVectors);
  clearArrowGroup(group);
  if (!showAttackVectors) return;
  const workingState = state.board ? state : boardStateToGame(state);
  const board = workingState.board;
  const baseHeight = boardMetrics.surfaceY + clampVectorHeightScale(heightScale ?? 0.5) * boardMetrics.squareSizeX;
  board.forEach((piece, idx) => {
    if (!piece) return;
    const start = squarePosition3D(idx);
    start.y = baseHeight;
    const targets = getPieceAttacks(board, idx);
    targets.forEach((targetIdx) => {
      const occupant = board[targetIdx];
      if (!occupant) return;
      const sameColor = occupant[0] === piece[0];
      if (sameColor && occupant[1] === 'K') return;
      const color = sameColor ? SUPPORT_ARROW_COLOR : THREAT_ARROW_COLOR;
      const end = squarePosition3D(targetIdx);
      end.y = baseHeight;
      const length = end.clone().sub(start).length();
      if (length < 0.1) return;
      const targetValue = (PIECE_VALUE[occupant[1]] || 1) * vectorScale;
      const sourceValue = (PIECE_VALUE[piece[1]] || 1) * vectorScale;
      const radiusTarget = 0.05 + Math.min(0.8, targetValue / 10);
      const radiusSource = 0.02 + Math.min(0.4, sourceValue / 12);
              const arrow = createArrowMesh(start, end, radiusSource, radiusTarget, color);
              if (arrow) {
                group.add(arrow);
              }
    });
  });
}

function updateSimulationPiece({ group, animation }) {
  if (!group) return;
  group.visible = Boolean(animation);
  if (!animation) {
    if (simulationMesh) simulationMesh.visible = false;
    simulationMeshLoading = null;
    return;
  }
  const pieceKey = animation.piece;
  if (!simulationMesh || simulationPieceKey !== pieceKey) {
    if (simulationMesh) {
      group.remove(simulationMesh);
      simulationMesh.geometry?.dispose?.();
    }
    simulationMesh = null;
    simulationPieceKey = pieceKey;
    const modelPath = PIECE_MODEL_PATHS[pieceKey[0]]?.[pieceKey[1]];
    if (!modelPath) return;
    if (!simulationMeshLoading) {
      const currentKey = pieceKey;
      simulationMeshLoading = loadModel(modelPath)
        .then((template) => {
          if (simulationPieceKey !== currentKey) {
            simulationMeshLoading = null;
            return;
          }
          const mesh = template.clone(true);
          mesh.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
            }
          });
          scalePieceMesh(mesh);
          group.add(mesh);
          simulationMesh = mesh;
          simulationMeshLoading = null;
          positionSimulationMesh(animation);
        })
        .catch(() => {
          simulationMeshLoading = null;
        });
    }
    return;
  }
  positionSimulationMesh(animation);
}

function positionSimulationMesh(animation) {
  if (!simulationMesh) return;
  const from = squarePosition3D(animation.fromIdx);
  const to = squarePosition3D(animation.toIdx);
  const pos = from.clone().lerp(to, animation.progress ?? 0);
  pos.y = boardMetrics.surfaceY + 0.02;
  simulationMesh.visible = true;
  simulationMesh.position.copy(pos);
}

function createArrowMesh(start, end, sourceRadius, targetRadius, color) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.01) return null;
  direction.normalize();
  const coneHeight = Math.max(0.05, length);
  const shaftMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const sphereMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const coneGeometry = new THREE.CylinderGeometry(targetRadius, sourceRadius, coneHeight, 14, 1, true);
  const sphereFront = new THREE.Mesh(new THREE.SphereGeometry(targetRadius, 14, 14), sphereMaterial);
  const sphereBack = new THREE.Mesh(new THREE.SphereGeometry(sourceRadius, 14, 14), sphereMaterial);
  const cone = new THREE.Mesh(coneGeometry, shaftMaterial);
  cone.position.y = coneHeight / 2;
  sphereFront.position.y = coneHeight;
  sphereBack.position.y = 0;
  const arrowGroup = new THREE.Group();
  arrowGroup.add(cone);
  arrowGroup.add(sphereFront);
  arrowGroup.add(sphereBack);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  arrowGroup.quaternion.copy(quaternion);
  arrowGroup.position.copy(start);
  return arrowGroup;
}

function updateKingRing({ group, state, checkmatedColor }) {
  if (!group || !state || !checkmatedColor) {
    group.visible = false;
    return;
  }
  const workingState = state.board ? state : boardStateToGame(state);
  const kingIdx = workingState.board.findIndex((p) => p === `${checkmatedColor}K`);
  if (kingIdx === -1) {
    group.visible = false;
    return;
  }
  const size = Math.min(boardMetrics.squareSizeX, boardMetrics.squareSizeZ);
  const outer = size * 0.62;
  if (!kingRingMesh) {
    const geom = kingRingGeometry.clone();
    kingRingMesh = new THREE.Mesh(
      geom,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const outline = new THREE.Mesh(
      geom.clone(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    outline.scale.set(1.05, 1.05, 1);
    kingRingMesh.add(outline);
    kingRingMesh.rotation.x = -Math.PI / 2;
    group.add(kingRingMesh);
  }
  kingRingMesh.scale.set(outer, outer, 1);
  const pos = squarePosition3D(kingIdx);
  kingRingMesh.position.set(pos.x, boardMetrics.surfaceY + 0.05, pos.z);
  group.visible = true;
}

function updateMeshHeat({ group, heatValues, showMeshHeat, heightScale, vectorState }) {
  if (!group) return;
  const hasValues = Array.isArray(heatValues) && heatValues.length === 64;
  const active = Boolean(showMeshHeat && hasValues);
  group.visible = active;
  if (!active) {
    if (meshHeatMesh) meshHeatMesh.visible = false;
    if (meshHeatGrid) meshHeatGrid.visible = false;
    return;
  }
  const squareSizeX = boardMetrics.squareSizeX;
  const squareSizeZ = boardMetrics.squareSizeZ;
  const widthX = 8 * squareSizeX;
  const widthZ = 8 * squareSizeZ;
  const centerX = boardMetrics.startX + squareSizeX * 3.5;
  const centerZ = boardMetrics.startZ + squareSizeZ * 3.5;
  const extentScale = clampMeshExtent(heightScale ?? 1);
  const unit = Math.min(squareSizeX, squareSizeZ);
  const baseOffset = unit * HEAT_BASE_OFFSET;
  const maxHeight = Math.max(squareSizeX, squareSizeZ) * 2.5 * extentScale;
  const { maxThreat, maxSupport } = getHeatExtents(heatValues);

  // Precompute square heights (8x8)
  const squareHeights = new Array(8).fill(0).map(() => new Array(8).fill(0));
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const idx = rank * 8 + file;
      const cell = heatValues[idx] ?? EMPTY_HEAT_CELL;
      const threat = maxThreat > 0 ? clampUnit((cell.threat ?? 0) / maxThreat) : 0;
      const support = maxSupport > 0 ? clampUnit((cell.support ?? 0) / maxSupport) : 0;
      const value = Math.max(threat, support);
      squareHeights[rank][file] = value * maxHeight;
    }
  }

  if (meshHeatMesh) {
    group.remove(meshHeatMesh);
    meshHeatMesh.geometry?.dispose?.();
    meshHeatMesh = null;
  }
  if (meshHeatGrid) {
    group.remove(meshHeatGrid);
    meshHeatGrid.geometry?.dispose?.();
    meshHeatGrid = null;
  }

  const geom = new THREE.PlaneGeometry(widthX, widthZ, meshHeatResolution, meshHeatResolution);
  const positions = geom.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const origX = positions.getX(i);
    const origZ = positions.getY(i); // plane uses Y for second axis
    const u = clampUnit((origX + widthX / 2) / widthX); // 0..1
    const v = clampUnit((origZ + widthZ / 2) / widthZ); // 0..1
    const xSample = u * 7;
    const ySample = v * 7;
    const heightVal = smoothSample(squareHeights, xSample, ySample);
    const y = boardMetrics.surfaceY + baseOffset + heightVal;
    positions.setX(i, origX);
    positions.setZ(i, origZ);
    positions.setY(i, y);
  }
  positions.needsUpdate = true;

  const wire = new THREE.WireframeGeometry(geom);
  meshHeatMesh = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  meshHeatMesh.position.set(centerX, 0, centerZ);
  group.add(meshHeatMesh);
}

function smoothSample(grid, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(7, x0 + 1);
  const y1 = Math.min(7, y0 + 1);
  const tx = smoothStep(x - x0);
  const ty = smoothStep(y - y0);
  const h00 = grid[y0][x0];
  const h10 = grid[y0][x1];
  const h01 = grid[y1][x0];
  const h11 = grid[y1][x1];
  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * ty;
}

function smoothStep(t) {
  const clamped = clampUnit(t);
  return clamped * clamped * (3 - 2 * clamped);
}

function ensureMeshHeatGeometry() {
  const geom = new THREE.PlaneGeometry(
    8 * boardMetrics.squareSizeX,
    8 * boardMetrics.squareSizeZ,
    meshHeatResolution,
    meshHeatResolution,
  ).toNonIndexed();
  const vertexCount = geom.attributes.position.count;
  geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  return geom;
}

function updateTravelStrip({ group, animation }) {
  if (!group) return;
  if (!animation) {
    group.visible = false;
    if (group.children[0]) {
      group.children[0].visible = false;
    }
    return;
  }
  group.visible = true;
  const mesh = ensureTravelMesh(group);
  const from = squarePosition3D(animation.fromIdx);
  const to = squarePosition3D(animation.toIdx);
  const current = from.clone().lerp(to, animation.progress ?? 0);
  const delta = current.clone().sub(from).setY(0);
  const length = Math.max(delta.length(), 0.001);
  const width = Math.max(Math.min(boardMetrics.squareSizeX, boardMetrics.squareSizeZ) * 0.25, 0.05);
  const dir = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  const mid = from.clone().add(current).multiplyScalar(0.5);
  mesh.visible = true;
  mesh.position.set(mid.x, boardMetrics.surfaceY + TRAVEL_HEIGHT * 0.5, mid.z);
  mesh.quaternion.copy(quaternion);
  mesh.scale.set(length, TRAVEL_HEIGHT, width);
  if (mesh.material.map) {
    mesh.material.map.repeat.set(Math.max(1, length * 3), Math.max(1, width * 3));
    mesh.material.map.needsUpdate = true;
  }
}

function clearArrowGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    group.remove(child);
    if (child.line?.geometry) child.line.geometry.dispose();
    if (child.line?.material) child.line.material.dispose();
    if (child.cone?.geometry) child.cone.geometry.dispose();
    if (child.cone?.material) child.cone.material.dispose();
  }
}

function computeMoveDirections(board, piece, idx) {
  const directions = [];
  const type = piece[1];
  const color = piece[0];
  if (type === 'N') {
    KNIGHT_OFFSETS.forEach(({ df, dr }) => {
      if (targetIndex(idx, df, dr) === -1) return;
      const dir = directionFromOffset(df, dr, 1);
      if (dir) directions.push(dir);
    });
    return directions;
  }
  if (type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const rank = Math.floor(idx / 8);
    const startRank = color === 'w' ? 6 : 1;
    const forward = targetIndex(idx, 0, dir);
    if (forward !== -1 && !board[forward]) {
      const vec = directionFromOffset(0, dir, 0.8);
      if (vec) directions.push(vec);
      const doubleForward = targetIndex(idx, 0, dir * 2);
      if (rank === startRank && doubleForward !== -1 && !board[doubleForward]) {
        const vecDouble = directionFromOffset(0, dir * 2, 0.7);
        if (vecDouble) directions.push(vecDouble);
      }
    }
    [-1, 1].forEach((df) => {
      const target = targetIndex(idx, df, dir);
      if (target === -1) return;
      const occupant = board[target];
      if (!occupant || occupant[0] === color) return;
      const vec = directionFromOffset(df, dir, 0.75);
      if (vec) directions.push(vec);
    });
    return directions;
  }
  if (type === 'K') {
    KING_STEPS.forEach(({ df, dr }) => {
      if (targetIndex(idx, df, dr) === -1) return;
      const vec = directionFromOffset(df, dr, 0.8);
      if (vec) directions.push(vec);
    });
    return directions;
  }
  const rays = getMoveRays(board, idx, piece);
  rays.forEach(({ df, dr, length }) => {
    if (!length) return;
    const vec = directionFromOffset(df, dr, Math.min(1, length / 3));
    if (vec) directions.push(vec);
  });
  return directions;
}

function directionFromOffset(df, dr, weight = 1) {
  const dir = new THREE.Vector3(df * boardMetrics.squareSizeX, 0, dr * boardMetrics.squareSizeZ);
  const len = dir.length();
  if (!len) {
    return null;
  }
  dir.normalize();
  return { dir, weight };
}

function squarePosition3D(idx) {
  const file = idx % 8;
  const rank = Math.floor(idx / 8);
  const x = boardMetrics.startX + file * boardMetrics.squareSizeX;
  const z = boardMetrics.startZ + rank * boardMetrics.squareSizeZ;
  return new THREE.Vector3(x, boardMetrics.surfaceY, z);
}

function ensureTravelMesh(group) {
  if (group.children[0]) {
    return group.children[0];
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, travelMaterial);
  mesh.visible = false;
  group.add(mesh);
  return mesh;
}

function createTravelMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    map: texture,
  });
}

function boardStateToGame(boardState) {
  if (boardState && boardState.board) {
    return {
      board: boardState.board.slice(),
      turn: boardState.turn ?? 'w',
    };
  }
  return {
    board: Array.isArray(boardState) ? boardState.slice() : [],
    turn: 'w',
  };
}

function targetIndex(fromIdx, df, dr) {
  const file = fromIdx % 8;
  const rank = Math.floor(fromIdx / 8);
  const nextFile = file + df;
  const nextRank = rank + dr;
  if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) {
    return -1;
  }
  return nextRank * 8 + nextFile;
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

function computeNeighborAverage(idx, heatValues, maxThreat, maxSupport) {
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
      if (val && (val.threat > 0 || val.support > 0)) {
        const t = maxThreat > 0 ? clampUnit((val.threat ?? 0) / maxThreat) : 0;
        const s = maxSupport > 0 ? clampUnit((val.support ?? 0) / maxSupport) : 0;
        neighbors.push(Math.max(t, s));
      }
    }
  }
  if (!neighbors.length) return null;
  return neighbors.reduce((sum, val) => sum + val, 0) / neighbors.length;
}

function getHeatExtents(heatValues) {
  let maxThreat = 0;
  let maxSupport = 0;
  heatValues.forEach((cell) => {
    if (!cell) return;
    if ((cell.threat ?? 0) > maxThreat) maxThreat = cell.threat;
    if ((cell.support ?? 0) > maxSupport) maxSupport = cell.support;
  });
  return {
    maxThreat,
    maxSupport,
  };
}

function applyHeatColor(material, threatIntensity, supportIntensity) {
  if (!material) return;
  const dominance = threatIntensity >= supportIntensity ? 'threat' : 'support';
  const intensity = dominance === 'threat' ? threatIntensity : supportIntensity;
  const target = dominance === 'threat' ? HOT_COLOR : SAFE_COLOR;
  const tone = 0.5 + intensity * 0.5;
  const r = clampUnit(target.r * tone);
  const g = clampUnit(target.g * tone);
  const b = clampUnit(target.b * tone);
  material.color.setRGB(r, g, b);
  material.emissive.setRGB(r * 0.25, g * 0.25, b * 0.25);
  material.opacity = 0.3 + intensity * 0.45;
}

function clampUnit(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampHeatHeightScale(value) {
  if (!Number.isFinite(value)) return 1;
  if (value < 0.05) return 0.05;
  if (value > 2) return 2;
  return value;
}

function clampVectorHeightScale(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0.1) return 0.1;
  if (value > 1.5) return 1.5;
  return value;
}

function clampMoveRingHeightScale(value) {
  if (!Number.isFinite(value)) return 0.2;
  if (value < 0.05) return 0.05;
  if (value > 1) return 1;
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

function heatColor(threatIntensity, supportIntensity) {
  const t = clampUnit(threatIntensity);
  const s = clampUnit(supportIntensity);
  const r = clampUnit(HOT_COLOR.r * t);
  const g = clampUnit(SAFE_COLOR.g * s);
  const b = clampUnit((HOT_COLOR.b * t + SAFE_COLOR.b * s) * 0.5);
  return { r, g, b };
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
