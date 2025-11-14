import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const SQUARE_SIZE = 1;
const BOARD_OFFSET = (8 * SQUARE_SIZE) / 2;

const PIECE_COLORS = {
  w: 0xf8f4e3,
  b: 0x111827,
};

const PIECE_HEIGHT = {
  P: 1.1,
  N: 1.4,
  B: 1.6,
  R: 1.4,
  Q: 1.9,
  K: 2.1,
};

function createBoardMesh() {
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

function createPieceMesh(piece) {
  const color = piece[0];
  const type = piece[1];
  const material = new THREE.MeshPhongMaterial({ color: PIECE_COLORS[color], shininess: 60 });
  let mesh;
  switch (type) {
    case 'P':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 24), material);
      mesh.add(createHead(0.18, material));
      break;
    case 'R':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.9, 32), material);
      break;
    case 'N':
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 24), material);
      break;
    case 'B':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.15, 24), material);
      mesh.add(createHead(0.15, material));
      break;
    case 'Q':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 32), material);
      mesh.add(createCrown(material));
      break;
    case 'K':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.5, 32), material);
      mesh.add(createCross(material));
      break;
    default:
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 24), material);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createHead(radius, material) {
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 24), material);
  sphere.position.y = 0.3;
  return sphere;
}

function createCrown(material) {
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 12, 24), material);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.65;
  return crown;
}

function createCross(material) {
  const cross = new THREE.Group();
  const upright = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), material);
  upright.position.y = 0.85;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.08), material);
  bar.position.y = 0.95;
  cross.add(upright);
  cross.add(bar);
  return cross;
}

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
  controls.maxDistance = 24;
  controls.target.set(0, 0, 0);
  controls.update();

  const ambient = new THREE.AmbientLight(0x94a3b8, 0.6);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.9);
  directional.position.set(5, 10, 2);
  directional.castShadow = true;
  scene.add(directional);

  const boardMesh = createBoardMesh();
  scene.add(boardMesh);

  const pieceGroup = new THREE.Group();
  scene.add(pieceGroup);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  function updateBoard(board) {
    if (!board) return;
    while (pieceGroup.children.length) {
      const child = pieceGroup.children.pop();
      pieceGroup.remove(child);
    }
    board.forEach((piece, idx) => {
      if (!piece) return;
      const mesh = createPieceMesh(piece).clone();
      const x = (idx % 8) * SQUARE_SIZE - BOARD_OFFSET + SQUARE_SIZE / 2;
      const z = Math.floor(idx / 8) * SQUARE_SIZE - BOARD_OFFSET + SQUARE_SIZE / 2;
      placePieceOnBoard(mesh, x, z);
      pieceGroup.add(mesh);
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

function placePieceOnBoard(mesh, x, z) {
  mesh.position.set(x, 0, z);
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const lift = -bounds.min.y + 0.02;
  mesh.position.y += lift;
}
