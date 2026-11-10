// Developer page: shows a GLB model from three sides, to check its size and direction. Open /modelpreview.html?f=/models/bikes/sv650.glb
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
const q = new URLSearchParams(location.search), file = q.get('f') || '/models/bikes/sv650.glb';
const canvas = document.getElementById('c') as HTMLCanvasElement, r = new THREE.WebGLRenderer({ canvas, antialias: true }); r.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x56627a);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(5, 10, 6); scene.add(sun);
const grid = new THREE.GridHelper(10, 20, 0xffffff, 0x888888); scene.add(grid); scene.add(new THREE.AxesHelper(2));
new GLTFLoader().load(file, (g) => {
  const m = g.scene; scene.add(m); const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  document.getElementById('i')!.textContent = `${file}  size x ${size.x.toFixed(2)} y ${size.y.toFixed(2)} z ${size.z.toFixed(2)}  min y ${box.min.y.toFixed(2)}  meshes ${(() => { let n = 0; m.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; })()}`;
  const s = 3 / Math.max(size.x, size.y, size.z); m.scale.setScalar(s); m.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100), view = q.get('v') || '3q';
  const pos: Record<string, [number, number, number]> = { '3q': [4.5, 2.6, 4.5], side: [7, 1.6, 0.01], front: [0.01, 1.8, 7], top: [0.01, 8, 0.5], back: [-4.5, 2.6, -4.5] };
  cam.position.set(...pos[view]); cam.lookAt(0, 1.4, 0); setTimeout(() => { r.render(scene, cam); document.title = 'ready'; }, 400);
});
