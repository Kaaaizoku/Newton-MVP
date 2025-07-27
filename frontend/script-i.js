import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// === SETUP for canvas and scene===
const container = document.querySelector('.canvas');
// scene parameters
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // light gray background
scene.rotation.x = -Math.PI / 2; // Rotate the scene to have Y up (default is Z up in Three.js)
// camera parameters
// PerspectiveCamera: (fov, aspect, near, far)
// fov: field of view in degrees, aspect: aspect ratio, near: near clipping
const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);

// WebGLRenderer: creates the canvas and renders the scene
// antialias: smooths the edges of the rendered objects
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// === CONTROLS ===
// OrbitControls: allows the camera to orbit around a target point
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // an animation effect
controls.dampingFactor = 0.25; // how much damping to apply 
controls.enableZoom = true; // allow zooming
controls.minDistance = 2; // minimum zoom distance
controls.maxDistance = 20; // maximum zoom distance
controls.enablePan = true; // allow panning
controls.update(); // update controls to apply settings

//axis helper
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// === GRID HELPER ===
const gridHelper = new THREE.GridHelper(10, 10); // size, divisions
gridHelper.rotation.x = -Math.PI / 2; // rotate to align with the ground
scene.add(gridHelper);

// === LIGHT ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10).normalize();
scene.add(light);

// list of added objects
// This will hold the objects added to the scene for display in the UI and for sending to the backend
// Each object will have a mesh, name, and type
const addedObjects = [];


//creating a cylinder geometry in three.js and pybullet
document.getElementById('addCylinder').addEventListener('click', () => {
  // Create a cylinder geometry and mesh
  // Parameters: radiusTop, radiusBottom, height, radialSegments
  const radiusTop = 1;
  const radiusBottom = 1;
  const height = 2;
  const radialSegments = 32;

  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
  const material = new THREE.MeshStandardMaterial({ color: 0xff5733 });
  const cylinder = new THREE.Mesh(geometry, material);

  cylinder.position.set(0, 0, height/2); // Position the cylinder above the ground
  const quat = new THREE.Quaternion();
  quat.setFromEuler(new THREE.Euler(0, 0, 0)); // Rotate to stand upright (Z up → Y up for PyBullet)
  cylinder.applyQuaternion(quat);

  scene.add(cylinder); // Add the cylinder to the scene
  console.log('Cylinder added to the scene');
  addedObjects.push({ mesh: cylinder, name: 'Cylinder', type: 'mesh' }); // Add to the list of added objects
  updateObjectPanel(); // Update the object panel to show the new object for UI purposes
  updateConstraintObjectDropdown(); // Update the dropdown for constraints for UI purposes

  // Send to backend once the shape is created
  sendShape(cylinder);
});

//creating constraint type
document.getElementById('constraintType').addEventListener('change', (e) => {
  const selected = e.target.value;
  const hingeOptions = document.getElementById('hingeOptions');
  hingeOptions.style.display = (selected === 'hinge') ? 'block' : 'none';
});

// === Resize Handling ===
window.addEventListener('resize', () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// Creating the socket connection and declaring it to connect to the address
const socket = new WebSocket("ws://localhost:8000/ws");

// Map object index to mesh, 
// Maps object indices (as assigned in addedObjects) to their corresponding Three.js mesh objects.
// This is used to track and update meshes by their index when receiving updates from the backend.
const objectMeshMap = {};

//socket is started, recieve message
socket.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (e) {
    console.error("❌ Failed to parse message:", event.data);
    return;
  }

  console.log("📦 Message received:", data);

  // Check if message has an ID and corresponds to a known mesh
  if (!('id' in data)) {
    console.log("ℹ️ Message has no ID, skipping mesh update.");
  }

  const mesh = objectMeshMap[data.id];
  if (!mesh) {
    console.warn(`⚠️ Mesh not found for ID ${data.id}`);
  }

  // ✅ Apply position if present
  if (data.position && 'x' in data.position && 'y' in data.position && 'z' in data.position) {
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    console.log(`✅ Position updated for ID ${data.id}:`, mesh.position);
  } else {
    console.log(`ℹ️ No position data for ID ${data.id}, skipping position update.`);
  }

  // ✅ Apply orientation if present
  if (
    data.quaternion &&
    'x' in data.quaternion &&
    'y' in data.quaternion &&
    'z' in data.quaternion &&
    'w' in data.quaternion
  ) {
    const receivedQuat = new THREE.Quaternion(
      data.quaternion.x,
      data.quaternion.y,
      data.quaternion.z,
      data.quaternion.w
    );

    const rotQuat = new THREE.Quaternion();
    rotQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0); // convert to Y-up
    receivedQuat.premultiply(rotQuat);

    mesh.quaternion.copy(receivedQuat);
  } else {
    console.log(`ℹ️ No quaternion data for ID ${data.id}, skipping rotation update.`);
  }
};



animate();

//====FUNCTIONS===//

// Extract shape data for sending to backend
// This function should be updated to handle different shapes as needed
// used in the sendMesh function
function extractShapeData(mesh) {
  if (mesh.geometry.type === 'CylinderGeometry') {
    const params = mesh.geometry.parameters;
    const pos = mesh.position;
    const rot = new THREE.Euler().setFromQuaternion(mesh.quaternion);

    return {
      type: 'cylinder',
      radiusTop: params.radiusTop,
      radiusBottom: params.radiusBottom,
      height: params.height,
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { x: rot.x, y: rot.y, z: rot.z }
    };
  }

  // Fallback or other shapes
  return {};
}


// === ANIMATE ===
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  controls.update(); // only required if controls.enableDamping = true, or if controls.autoRotate = true
}

//updates object panel of the objects added
function updateObjectPanel() {
  const panel = document.querySelector('.objects-panel ul'); // correct class + target the <ul>
  panel.innerHTML = ''; // Clear old items

  addedObjects.forEach((obj, index) => {
    const item = document.createElement('li'); // use <li> since you're inserting into a <ul>
    item.className = 'object-item';
    item.innerText = `Object ${index + 1}: ${obj.name}`;
    panel.appendChild(item);
  });
}

function updateConstraintObjectDropdown() {
  const select = document.getElementById('objectSelect');
  select.innerHTML = '<option value="">-- Select an Object --</option>';

  addedObjects.forEach((obj, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.text = `Object ${index + 1}: ${obj.name}`;
    select.appendChild(option);
  });
}

// Send shape (already implemented)
function sendShape(mesh) {
  const data = extractShapeData(mesh);
  const index = addedObjects.length - 1; // Fix: Use last added index
  objectMeshMap[index] = mesh;
  type = 'mesh'; // Set type to 'mesh' for the backend
  payload = data;
  const msg = {
    type: type,
    payload: payload
  };

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  } else {
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(msg));
    }, { once: true }); // send once socket is open!
  }
}