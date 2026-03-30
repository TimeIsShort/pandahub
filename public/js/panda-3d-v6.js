import * as THREE from '/vendor/three/build/three.module.js?v=20260327-5';
import { GLTFLoader } from '/vendor/three/examples/jsm/loaders/GLTFLoader.js?v=20260327-5';

const DEFAULT_MODEL_URL = '/assets/models/panda-mascot.glb';

function loadGLTF(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

class PandaMascot3D {
  constructor(options = {}) {
    this.mount = options.mount || null;
    this.modelUrl = options.modelUrl || DEFAULT_MODEL_URL;
    this.timeoutMs = Number(options.timeoutMs || 60000);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.mixer = null;
    this.modelRoot = null;
    this.actions = {};
    this.idleAction = null;
    this.eatAction = null;
    this.danceAction = null;
    this.pendingIdle = false;
    this.dancing = false;
    this.danceTime = 0;
    this.hoverBlend = 0;
    this.baseYaw = 0.12;
    this.baseX = 0;
    this.baseY = 0;
    this.baseZ = 0;
    this.lookAtY = 1.02;

    this.pointer = { x: 0.5, y: 0.5 };
    this.hovering = false;
    this.tapImpulse = 0;

    this._raf = 0;
    this._running = false;
    this._onResize = () => this.resize();
    this._onMixerFinished = (event) => {
      if (event.action === this.eatAction) {
        if (this.hovering && this.dancing) {
          this.startDance();
        } else {
          this.playIdle(0.2);
        }
      }
    };
  }

  static supportsWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
    } catch (err) {
      return false;
    }
  }

  async init() {
    if (!this.mount) {
      throw new Error('PandaMascot3D: mount container is required');
    }
    if (!PandaMascot3D.supportsWebGL()) {
      throw new Error('PandaMascot3D: WebGL is not supported');
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    this.camera.position.set(0, 1.08, 3.35);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.innerHTML = '';
    this.mount.appendChild(this.renderer.domElement);

    this.addLights();
    await this.loadModel();

    this.resize();
    window.addEventListener('resize', this._onResize);
    this._running = true;
    this.renderLoop();
  }

  addLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 4.0, 3.0);
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.bias = -0.001;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xaad4ff, 1.2);
    fill.position.set(-2.0, 1.6, 1.8);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffcce6, 0.8);
    rim.position.set(0.2, 1.3, -2.3);
    this.scene.add(rim);
  }

  async loadModel() {
    const loader = new GLTFLoader();
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PandaMascot3D: model load timeout')), this.timeoutMs);
    });
    const gltf = await Promise.race([loadGLTF(loader, this.modelUrl), timeout]);

    this.modelRoot = gltf.scene;
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.scale.setScalar(1);
    this.modelRoot.rotation.y = this.baseYaw;

    this.modelRoot.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        node.material.envMapIntensity = 1.0;
      }
    });

    this.scene.add(this.modelRoot);
    this.frameModelToView();

    const planeGeom = new THREE.PlaneGeometry(20, 20);
    planeGeom.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const plane = new THREE.Mesh(planeGeom, shadowMat);
    plane.position.y = this.baseY - 0.05;
    plane.receiveShadow = true;
    this.scene.add(plane);

    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    this.mixer.addEventListener('finished', this._onMixerFinished);

    for (const clip of gltf.animations || []) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }

    this.idleAction = this.actions.Idle || null;
    this.eatAction = this.actions.Eat || null;
    this.danceAction = this.pickDanceAction(gltf.animations || []);

    if (this.idleAction) {
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
      this.idleAction.enabled = true;
      this.idleAction.play();
    }
    if (this.danceAction) {
      this.danceAction.enabled = false;
      this.danceAction.setLoop(THREE.LoopRepeat, Infinity);
    }
  }

  pickDanceAction(clips) {
    if (!Array.isArray(clips) || clips.length === 0) return null;

    const byName = clips
      .map((clip) => ({ clip, name: String(clip?.name || '') }))
      .filter((entry) => !!entry.name);

    const preferred = byName.find((entry) => {
      const n = entry.name;
      return /(dance|dancing|groove|party|hip[-\s]?hop|loop)/i.test(n) && !/(idle|eat)/i.test(n);
    });
    if (preferred && this.actions[preferred.clip.name]) {
      return this.actions[preferred.clip.name];
    }

    const fallback = byName.find((entry) => !/(idle|eat)/i.test(entry.name));
    if (fallback && this.actions[fallback.clip.name]) {
      return this.actions[fallback.clip.name];
    }

    return null;
  }

  frameModelToView() {
    if (!this.modelRoot || !this.camera) return;

    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const targetHeight = 1.25;
    const height = Math.max(size.y, 0.001);
    const uniformScale = targetHeight / height;
    this.modelRoot.scale.setScalar(uniformScale);

    const scaledBox = new THREE.Box3().setFromObject(this.modelRoot);
    const scaledSize = scaledBox.getSize(new THREE.Vector3());
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

    // Keep paws close to the ground plane, while preserving center alignment.
    const desiredBottom = 0.08;
    const yShift = desiredBottom - scaledBox.min.y;
    this.modelRoot.position.y += yShift;
    this.modelRoot.position.x -= scaledCenter.x;
    this.modelRoot.position.z -= scaledCenter.z;

    const finalBox = new THREE.Box3().setFromObject(this.modelRoot);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    this.modelSize = finalSize;
    this.lookAtY = finalBox.min.y + finalSize.y * 0.54;
    this.baseX = this.modelRoot.position.x;
    this.baseY = this.modelRoot.position.y;
    this.baseZ = this.modelRoot.position.z;

    this.updateCameraToFit();
  }

  updateCameraToFit() {
    if (!this.modelSize || !this.camera || !this.mount) return;
    const finalSize = this.modelSize;
    const mountWidth = Math.max(this.mount?.clientWidth || 1, 1);
    const mountHeight = Math.max(this.mount?.clientHeight || 1, 1);
    const aspect = mountWidth / mountHeight;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.18));

    const fitHeightDistance = (finalSize.y * 0.5) / Math.tan(vFov / 2);
    const fitWidthDistance = (finalSize.x * 0.56) / Math.tan(hFov / 2);
    const fitDepthDistance = finalSize.z * 1.1;
    const distance = clamp(Math.max(fitHeightDistance * 1.35, fitWidthDistance * 1.6, fitDepthDistance + 3.25), 3.8, 20.0);

    this.camera.position.set(0, this.lookAtY + finalSize.y * 0.05, distance);
    this.camera.lookAt(0, this.lookAtY, 0);
  }

  playIdle(fadeDuration = 0.2) {
    if (!this.idleAction) {
      if (this.danceAction && this.danceAction.isRunning()) {
        this.danceAction.fadeOut(clamp(fadeDuration, 0.1, 0.6));
      }
      return;
    }

    this.pendingIdle = false;
    this.idleAction.reset();
    this.idleAction.enabled = true;
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);

    let fromAction = null;
    if (this.eatAction && this.eatAction.isRunning()) {
      fromAction = this.eatAction;
    } else if (this.danceAction && this.danceAction.isRunning()) {
      fromAction = this.danceAction;
    }
    if (fromAction) {
      this.idleAction.crossFadeFrom(fromAction, fadeDuration, true);
    }
    this.idleAction.play();
  }

  startDance() {
    this.dancing = true;
    if (!this.danceAction) return false;
    if (this.eatAction && this.eatAction.isRunning()) return true;

    this.pendingIdle = false;
    this.danceAction.reset();
    this.danceAction.enabled = true;
    this.danceAction.setLoop(THREE.LoopRepeat, Infinity);

    if (this.idleAction && this.idleAction.isRunning()) {
      this.danceAction.crossFadeFrom(this.idleAction, 0.22, true);
    }
    this.danceAction.play();
    return true;
  }

  stopDance(fadeDuration = 0.25) {
    this.dancing = false;
    if (this.eatAction && this.eatAction.isRunning()) return;
    if (!this.idleAction && this.danceAction && this.danceAction.isRunning()) {
      this.danceAction.fadeOut(clamp(fadeDuration, 0.1, 0.6));
      return;
    }
    this.playIdle(clamp(fadeDuration, 0.1, 0.6));
  }

  isDancing() {
    return !!this.dancing;
  }

  playEat() {
    if (!this.eatAction) {
      this.tapImpulse = clamp(this.tapImpulse + 0.12, 0, 0.45);
      return false;
    }

    this.tapImpulse = clamp(this.tapImpulse + 0.2, 0, 0.75);
    this.pendingIdle = true;
    this.eatAction.reset();
    this.eatAction.enabled = true;
    this.eatAction.setLoop(THREE.LoopOnce, 1);
    this.eatAction.clampWhenFinished = true;
    if (this.danceAction && this.danceAction.isRunning()) {
      this.eatAction.crossFadeFrom(this.danceAction, 0.16, true);
    } else if (this.idleAction) {
      this.eatAction.crossFadeFrom(this.idleAction, 0.18, true);
    }
    this.eatAction.play();
    return true;
  }

  reactTap() {
    this.tapImpulse = clamp(this.tapImpulse + 0.14, 0, 0.5);
  }

  setPointer(px, py) {
    this.pointer.x = clamp(px, 0, 1);
    this.pointer.y = clamp(py, 0, 1);
  }

  setHover(hovering) {
    this.hovering = !!hovering;
  }

  updateDance(delta) {
    const targetBlend = this.hovering ? 1 : 0;
    const blendEase = clamp(delta * 8.0, 0.04, 0.3);
    this.hoverBlend += (targetBlend - this.hoverBlend) * blendEase;
    if (!this.hovering && this.hoverBlend < 0.002) {
      this.hoverBlend = 0;
    }

    const speedScale = this.dancing ? 1 : 0.65;
    const hoverBoost = this.hovering ? 1.1 : 0.9;
    this.danceTime += delta * speedScale * hoverBoost;
  }

  updateLook(delta) {
    if (!this.modelRoot) return;

    const targetYaw = this.hovering ? (this.pointer.x - 0.5) * 0.32 : 0.0;
    const targetPitch = this.hovering ? (0.5 - this.pointer.y) * 0.12 : 0.0;
    const danceBlend = this.dancing ? this.hoverBlend : 0;
    const danceFactor = this.danceAction ? 0.42 : 1.0;
    const danceYaw = Math.sin(this.danceTime * 6.8) * 0.1 * danceBlend * danceFactor;
    const dancePitch = Math.cos(this.danceTime * 8.2) * 0.05 * danceBlend * danceFactor;
    const danceRoll = Math.sin(this.danceTime * 9.4) * 0.11 * danceBlend * danceFactor;

    const smooth = clamp(delta * 7.5, 0.05, 0.28);
    this.modelRoot.rotation.y += (this.baseYaw + targetYaw + danceYaw - this.modelRoot.rotation.y) * smooth;
    this.modelRoot.rotation.x += (targetPitch + dancePitch - this.modelRoot.rotation.x) * smooth;
    this.modelRoot.rotation.z += (danceRoll - this.modelRoot.rotation.z) * clamp(delta * 8.5, 0.05, 0.32);

    const tapBounce = Math.sin(Date.now() * 0.012) * this.tapImpulse * 0.03;
    const danceBob = Math.abs(Math.sin(this.danceTime * 15.0)) * 0.028 * danceBlend;
    this.modelRoot.position.x += (this.baseX + Math.sin(this.danceTime * 8.0) * 0.012 * danceBlend - this.modelRoot.position.x) * clamp(delta * 7.0, 0.05, 0.28);
    this.modelRoot.position.z += (this.baseZ + Math.cos(this.danceTime * 8.6) * 0.01 * danceBlend - this.modelRoot.position.z) * clamp(delta * 7.0, 0.05, 0.28);
    this.modelRoot.position.y = this.baseY + tapBounce + danceBob;
    this.tapImpulse *= 0.93;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.mount) return;
    const width = this.mount.clientWidth || 1;
    const height = this.mount.clientHeight || 1;

    this.updateCameraToFit();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(width, height, false);
  }

  renderLoop() {
    if (!this._running) return;
    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);
    this.updateDance(delta);
    this.updateLook(delta);
    this.renderer.render(this.scene, this.camera);
    this._raf = window.requestAnimationFrame(() => this.renderLoop());
  }

  dispose() {
    this._running = false;
    if (this._raf) {
      window.cancelAnimationFrame(this._raf);
      this._raf = 0;
    }

    window.removeEventListener('resize', this._onResize);

    if (this.mixer) {
      this.mixer.removeEventListener('finished', this._onMixerFinished);
    }

    if (this.scene) {
      this.scene.traverse((node) => {
        if (!node.isMesh) return;
        if (node.geometry) node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!material) continue;
          if (material.map) material.map.dispose();
          if (material.normalMap) material.normalMap.dispose();
          if (material.roughnessMap) material.roughnessMap.dispose();
          material.dispose();
        }
      });
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mixer = null;
    this.modelRoot = null;
    this.idleAction = null;
    this.eatAction = null;
    this.danceAction = null;
    this.dancing = false;
    this.hoverBlend = 0;
    this.actions = {};
  }
}

window.PandaMascot3D = PandaMascot3D;

export { PandaMascot3D };
