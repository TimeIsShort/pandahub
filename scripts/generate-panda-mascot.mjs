import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'assets', 'models');
const outputGlb = path.join(outputDir, 'panda-mascot.glb');
const outputMeta = path.join(outputDir, 'panda-mascot.meta.json');

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReaderPolyfill {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }

    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        if (typeof this.onloadend === 'function') this.onloadend();
      } catch (error) {
        if (typeof this.onerror === 'function') this.onerror(error);
      }
    }
  };
}

function qTrack(nodeName, times, eulers) {
  const tempEuler = new THREE.Euler();
  const tempQuat = new THREE.Quaternion();
  const values = [];
  for (const e of eulers) {
    tempEuler.set(e[0], e[1], e[2], 'XYZ');
    tempQuat.setFromEuler(tempEuler);
    values.push(tempQuat.x, tempQuat.y, tempQuat.z, tempQuat.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

function vTrack(nodeName, property, times, vectors) {
  const values = vectors.flat();
  return new THREE.VectorKeyframeTrack(`${nodeName}.${property}`, times, values);
}

function createMaterialSet() {
  const whiteFur = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.05,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4
  });

  const blackFur = new THREE.MeshPhysicalMaterial({
    color: 0x1f2329,
    roughness: 0.75,
    metalness: 0.05,
    clearcoat: 0.1,
    clearcoatRoughness: 0.5
  });

  const neonGreen = new THREE.MeshPhysicalMaterial({
    color: 0x00ffcc,
    roughness: 0.15,
    metalness: 0.85,
    emissive: 0x00ffcc,
    emissiveIntensity: 2.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  });

  const bamboo = new THREE.MeshPhysicalMaterial({
    color: 0x4caf50,
    roughness: 0.4,
    metalness: 0.1,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25
  });

  const goggles = new THREE.MeshPhysicalMaterial({
    color: 0x5ee8d5,
    transmission: 0.85,
    roughness: 0.1,
    metalness: 0.3,
    thickness: 0.2,
    transparent: true,
    opacity: 0.85,
    emissive: 0x0abf99,
    emissiveIntensity: 0.5,
    clearcoat: 1.0
  });

  const fluffy = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.08
  });

  return { whiteFur, blackFur, neonGreen, bamboo, goggles, fluffy };
}

function capsule(radius, length, radialSegments = 16, capSegments = 8) {
  return new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments);
}

function createMascotScene() {
  const materials = createMaterialSet();

  const root = new THREE.Group();
  root.name = 'PandaRig';

  const nodeRoot = new THREE.Object3D();
  nodeRoot.name = 'Root';
  nodeRoot.position.set(0, 0.98, 0);
  root.add(nodeRoot);

  const spine = new THREE.Object3D();
  spine.name = 'Spine';
  spine.position.set(0, 0.26, 0);
  nodeRoot.add(spine);

  const chest = new THREE.Object3D();
  chest.name = 'Chest';
  chest.position.set(0, 0.2, 0);
  spine.add(chest);

  const neck = new THREE.Object3D();
  neck.name = 'Neck';
  neck.position.set(0, 0.34, 0.05);
  chest.add(neck);

  const head = new THREE.Object3D();
  head.name = 'Head';
  head.position.set(0, 0.16, 0.04);
  neck.add(head);

  const armL = new THREE.Object3D();
  armL.name = 'Arm_L';
  armL.position.set(0.33, 0.22, 0.02);
  armL.rotation.z = 0.26;
  chest.add(armL);

  const forearmL = new THREE.Object3D();
  forearmL.name = 'Forearm_L';
  forearmL.position.set(0, -0.28, 0);
  forearmL.rotation.z = -0.15;
  armL.add(forearmL);

  const handL = new THREE.Object3D();
  handL.name = 'Hand_L';
  handL.position.set(0, -0.22, 0.01);
  forearmL.add(handL);

  const armR = new THREE.Object3D();
  armR.name = 'Arm_R';
  armR.position.set(-0.33, 0.22, 0.02);
  armR.rotation.z = -0.26;
  chest.add(armR);

  const forearmR = new THREE.Object3D();
  forearmR.name = 'Forearm_R';
  forearmR.position.set(0, -0.28, 0);
  forearmR.rotation.z = 0.15;
  armR.add(forearmR);

  const handR = new THREE.Object3D();
  handR.name = 'Hand_R';
  handR.position.set(0, -0.22, 0.01);
  forearmR.add(handR);

  const legL = new THREE.Object3D();
  legL.name = 'Leg_L';
  legL.position.set(0.19, -0.38, 0.05);
  legL.rotation.z = 0.1;
  spine.add(legL);

  const legR = new THREE.Object3D();
  legR.name = 'Leg_R';
  legR.position.set(-0.19, -0.38, 0.05);
  legR.rotation.z = -0.1;
  spine.add(legR);

  const bambooJoint = new THREE.Object3D();
  bambooJoint.name = 'Bamboo_CTRL';
  bambooJoint.position.set(0.03, -0.03, 0.06);
  handR.add(bambooJoint);

  const torso = new THREE.Mesh(capsule(0.42, 0.38, 26, 14), materials.whiteFur);
  torso.name = 'Torso';
  torso.position.set(0, -0.03, 0);
  torso.scale.setScalar(0.92);
  spine.add(torso);

  const torsoBelly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 18), materials.whiteFur);
  torsoBelly.name = 'Belly';
  torsoBelly.position.set(0, -0.13, 0.24);
  torsoBelly.scale.setScalar(0.92);
  spine.add(torsoBelly);

  const torsoFurShell = new THREE.Mesh(capsule(0.45, 0.38, 24, 10), materials.fluffy);
  torsoFurShell.name = 'FurShell_Torso';
  torsoFurShell.position.copy(torso.position);
  torsoFurShell.scale.setScalar(0.92);
  spine.add(torsoFurShell);

  const headMain = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 28), materials.whiteFur);
  headMain.name = 'HeadMesh';
  headMain.position.set(0, 0.02, 0.07);
  headMain.scale.set(1.15, 0.9, 1.05);
  head.add(headMain);

  const headFurShell = new THREE.Mesh(new THREE.SphereGeometry(0.295, 30, 26), materials.fluffy);
  headFurShell.name = 'FurShell_Head';
  headFurShell.position.copy(headMain.position);
  headFurShell.scale.copy(headMain.scale);
  head.add(headFurShell);

  const earGeom = new THREE.SphereGeometry(0.1, 20, 16);
  const earL = new THREE.Mesh(earGeom, materials.blackFur);
  earL.name = 'Ear_L';
  earL.position.set(0.17, 0.19, -0.02);
  head.add(earL);
  const earR = earL.clone();
  earR.name = 'Ear_R';
  earR.position.x = -0.17;
  head.add(earR);

  const eyePatchGeom = new THREE.SphereGeometry(0.095, 18, 16);
  const eyePatchL = new THREE.Mesh(eyePatchGeom, materials.blackFur);
  eyePatchL.name = 'EyePatch_L';
  eyePatchL.position.set(0.115, 0.01, 0.25);
  eyePatchL.scale.set(1, 1.22, 0.56);
  eyePatchL.rotation.z = -0.08;
  head.add(eyePatchL);
  const eyePatchR = eyePatchL.clone();
  eyePatchR.name = 'EyePatch_R';
  eyePatchR.position.x = -0.115;
  eyePatchR.rotation.z = 0.08;
  head.add(eyePatchR);

  const eyeBallGeom = new THREE.SphereGeometry(0.035, 12, 10);
  const eyeBallL = new THREE.Mesh(eyeBallGeom, materials.whiteFur);
  eyeBallL.name = 'EyeBall_L';
  eyeBallL.position.set(0.115, 0.035, 0.305);
  head.add(eyeBallL);
  const eyeBallR = eyeBallL.clone();
  eyeBallR.name = 'EyeBall_R';
  eyeBallR.position.x = -0.115;
  head.add(eyeBallR);

  const pupilGeom = new THREE.SphereGeometry(0.018, 12, 10);
  const pupilL = new THREE.Mesh(pupilGeom, materials.blackFur);
  pupilL.name = 'Pupil_L';
  pupilL.position.set(0, -0.002, 0.024);
  eyeBallL.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.name = 'Pupil_R';
  eyeBallR.add(pupilR);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 12), materials.blackFur);
  nose.name = 'Nose';
  nose.scale.set(1.2, 0.7, 0.85);
  nose.position.set(0, -0.06, 0.30);
  head.add(nose);

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 10, 22, Math.PI), materials.blackFur);
  mouth.name = 'Mouth';
  mouth.rotation.set(Math.PI * 0.54, 0, 0);
  mouth.position.set(0, -0.12, 0.285);
  head.add(mouth);

  const armGeom = capsule(0.095, 0.14, 16, 10);
  const forearmGeom = capsule(0.085, 0.12, 14, 10);
  const handGeom = new THREE.SphereGeometry(0.09, 18, 14);

  const upperArmLMesh = new THREE.Mesh(armGeom, materials.blackFur);
  upperArmLMesh.name = 'UpperArm_L';
  upperArmLMesh.position.set(0, -0.12, 0);
  armL.add(upperArmLMesh);
  const forearmLMesh = new THREE.Mesh(forearmGeom, materials.blackFur);
  forearmLMesh.name = 'ForearmMesh_L';
  forearmLMesh.position.set(0, -0.11, 0);
  forearmL.add(forearmLMesh);
  const handLMesh = new THREE.Mesh(handGeom, materials.blackFur);
  handLMesh.name = 'HandMesh_L';
  handLMesh.position.set(0, -0.05, 0);
  handL.add(handLMesh);

  const upperArmRMesh = upperArmLMesh.clone();
  upperArmRMesh.name = 'UpperArm_R';
  armR.add(upperArmRMesh);
  const forearmRMesh = forearmLMesh.clone();
  forearmRMesh.name = 'ForearmMesh_R';
  forearmR.add(forearmRMesh);
  const handRMesh = handLMesh.clone();
  handRMesh.name = 'HandMesh_R';
  handR.add(handRMesh);

  const legGeom = capsule(0.12, 0.14, 16, 10);
  const legLMesh = new THREE.Mesh(legGeom, materials.blackFur);
  legLMesh.name = 'LegMesh_L';
  legLMesh.position.set(0, -0.14, 0);
  legL.add(legLMesh);
  const footGeom = new THREE.SphereGeometry(0.125, 18, 14);
  const footL = new THREE.Mesh(footGeom, materials.blackFur);
  footL.name = 'Foot_L';
  footL.scale.set(1.2, 0.85, 1.5);
  footL.position.set(0, -0.25, 0.12);
  legL.add(footL);

  const legRMesh = legLMesh.clone();
  legRMesh.name = 'LegMesh_R';
  legR.add(legRMesh);
  const footR = footL.clone();
  footR.name = 'Foot_R';
  legR.add(footR);

  // Removed goggles and neon rings for a cleaner, cuter look

  const bambooStem = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.65, 14), materials.bamboo);
  bambooStem.name = 'Bamboo_Stem';
  bambooStem.rotation.z = Math.PI * 0.5;
  bambooJoint.add(bambooStem);

  const bambooNodeGeo = new THREE.TorusGeometry(0.045, 0.006, 8, 18);
  const nodeA = new THREE.Mesh(bambooNodeGeo, materials.neonGreen);
  nodeA.name = 'Bamboo_Node_A';
  nodeA.rotation.y = Math.PI * 0.5;
  nodeA.position.x = -0.18;
  bambooJoint.add(nodeA);
  const nodeB = nodeA.clone();
  nodeB.name = 'Bamboo_Node_B';
  nodeB.position.x = 0.18;
  bambooJoint.add(nodeB);

  root.scale.setScalar(1.0);
  head.scale.set(1.4, 1.4, 1.4);
  head.position.y += 0.04;
  head.position.z += 0.04;

  return {
    root,
    nodes: {
      spine,
      head,
      armL,
      armR,
      forearmL,
      forearmR,
      bambooJoint,
      eyeBallL,
      eyeBallR
    }
  };
}

function buildClips() {
  const idleTimes = [0, 1.5, 3, 4.5, 6];
  const idleTracks = [
    vTrack('Spine', 'position', idleTimes, [
      [0, 0.26, 0],
      [0, 0.275, 0],
      [0, 0.26, 0],
      [0, 0.245, 0],
      [0, 0.26, 0]
    ]),
    qTrack('Head', idleTimes, [
      [0.05, -0.22, 0],
      [0.02, 0.12, 0],
      [0.04, 0.24, 0],
      [0.03, -0.04, 0],
      [0.05, -0.22, 0]
    ]),
    qTrack('Arm_L', idleTimes, [
      [0, 0, 0.24],
      [0.03, 0, 0.27],
      [0, 0, 0.24],
      [-0.03, 0, 0.22],
      [0, 0, 0.24]
    ]),
    qTrack('Arm_R', idleTimes, [
      [0, 0, -0.24],
      [0.03, 0, -0.27],
      [0, 0, -0.24],
      [-0.03, 0, -0.22],
      [0, 0, -0.24]
    ]),
    vTrack('EyeBall_L', 'scale', [0, 1.86, 1.95, 2.08, 3.8, 3.9, 4.04, 6], [
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.08, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.12, 1],
      [1, 1, 1],
      [1, 1, 1]
    ]),
    vTrack('EyeBall_R', 'scale', [0, 1.86, 1.95, 2.08, 3.8, 3.9, 4.04, 6], [
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.08, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.12, 1],
      [1, 1, 1],
      [1, 1, 1]
    ])
  ];
  const idle = new THREE.AnimationClip('Idle', 6, idleTracks);

  const eatTimes = [0, 0.18, 0.42, 0.72, 1.04, 1.42, 1.8];
  const eatTracks = [
    qTrack('Arm_L', eatTimes, [
      [0, 0, 0.24],
      [-0.12, 0.05, 0.7],
      [-0.26, 0.12, 1.1],
      [-0.18, 0.08, 0.92],
      [-0.24, 0.1, 1.05],
      [-0.1, 0.04, 0.56],
      [0, 0, 0.24]
    ]),
    qTrack('Forearm_L', eatTimes, [
      [0, 0, -0.15],
      [0.1, 0.08, -0.44],
      [0.25, 0.16, -0.82],
      [0.18, 0.11, -0.64],
      [0.22, 0.13, -0.76],
      [0.09, 0.06, -0.36],
      [0, 0, -0.15]
    ]),
    qTrack('Arm_R', eatTimes, [
      [0, 0, -0.24],
      [-0.08, -0.04, -0.65],
      [-0.18, -0.09, -1.05],
      [-0.15, -0.06, -0.88],
      [-0.2, -0.09, -1.02],
      [-0.06, -0.03, -0.52],
      [0, 0, -0.24]
    ]),
    qTrack('Forearm_R', eatTimes, [
      [0, 0, 0.15],
      [0.1, -0.08, 0.42],
      [0.22, -0.16, 0.86],
      [0.17, -0.11, 0.66],
      [0.2, -0.13, 0.78],
      [0.08, -0.05, 0.34],
      [0, 0, 0.15]
    ]),
    qTrack('Head', eatTimes, [
      [0.05, -0.22, 0],
      [0.2, -0.1, 0],
      [0.34, 0, 0],
      [0.18, 0.02, 0],
      [0.32, -0.02, 0],
      [0.12, -0.12, 0],
      [0.05, -0.22, 0]
    ]),
    qTrack('Bamboo_CTRL', eatTimes, [
      [0, 0, 0],
      [0.1, 0.08, 0.16],
      [0.22, 0.12, 0.32],
      [0.18, 0.09, 0.25],
      [0.22, 0.11, 0.3],
      [0.08, 0.04, 0.14],
      [0, 0, 0]
    ]),
    vTrack('EyeBall_L', 'scale', [0, 0.55, 0.62, 0.72, 1.05, 1.14, 1.25, 1.8], [
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.12, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.16, 1],
      [1, 1, 1],
      [1, 1, 1]
    ]),
    vTrack('EyeBall_R', 'scale', [0, 0.55, 0.62, 0.72, 1.05, 1.14, 1.25, 1.8], [
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.12, 1],
      [1, 1, 1],
      [1, 1, 1],
      [1, 0.16, 1],
      [1, 1, 1],
      [1, 1, 1]
    ])
  ];
  const eat = new THREE.AnimationClip('Eat', 1.8, eatTracks);
  return [idle, eat];
}

async function exportGLB(scene, animations) {
  const exporter = new GLTFExporter();
  const options = {
    binary: true,
    animations,
    trs: false,
    onlyVisible: true,
    includeCustomExtensions: false
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(Buffer.from(result)),
      (error) => reject(error),
      options
    );
  });
}

function readJsonChunkFromGlb(buffer) {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error('Invalid GLB magic number');
  }
  let offset = 12;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(buffer.slice(start, end).toString('utf8'));
    }
    offset = end;
  }
  throw new Error('JSON chunk not found in GLB');
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const scene = new THREE.Scene();
  const mascot = createMascotScene();
  scene.add(mascot.root);
  const animations = buildClips();

  const glbBuffer = await exportGLB(scene, animations);
  await fs.writeFile(outputGlb, glbBuffer);

  const glbJson = readJsonChunkFromGlb(glbBuffer);
  const meta = {
    generatedAt: new Date().toISOString(),
    modelFile: path.relative(projectRoot, outputGlb).replace(/\\/g, '/'),
    fileSizeBytes: glbBuffer.byteLength,
    fileSizeKB: Number((glbBuffer.byteLength / 1024).toFixed(2)),
    animationClips: (glbJson.animations || []).map((anim) => anim.name),
    meshCount: (glbJson.meshes || []).length,
    nodeCount: (glbJson.nodes || []).length,
    materialCount: (glbJson.materials || []).length
  };
  await fs.writeFile(outputMeta, JSON.stringify(meta, null, 2), 'utf8');

  console.log(`Generated GLB: ${outputGlb}`);
  console.log(`Size: ${meta.fileSizeKB} KB`);
  console.log(`Animations: ${meta.animationClips.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
