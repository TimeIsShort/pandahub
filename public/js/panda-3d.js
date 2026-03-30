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
    this.timeoutMs = Number(options.timeoutMs || 9000);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this.mixer = null;
    this.modelRoot = null;
    this.actions = {};
    this.idleAction = null;
    this.eatAction = null;
    this.pendingIdle = false;

    this.pointer = { x: 0.5, y: 0.5 };
    this.hovering = false;
    this.tapImpulse = 0;

    this._raf = 0;
    this._running = false;
    this._onResize = () => this.resize();
    this._onMixerFinished = (event) => {
      if (event.action === this.eatAction) {
        this.playIdle(0.2);
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
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(0, 1.08, 3.0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    this.mount.innerHTML = '';
    this.mount.appendChild(this.renderer.domElement);

    this.addLights();
    await this.loadModel();

    this.resize();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.mount.parentElement || this.mount);
    this._running = true;
    this.renderLoop();
  }

  addLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.2, 3.5, 2.4);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8fe8ff, 0.55);
    fill.position.set(-2.0, 1.6, 1.8);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x24f0a8, 0.45);
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
    this.modelRoot.position.set(0, 0.02, 0);
    this.modelRoot.scale.setScalar(1.18);
    this.modelRoot.rotation.y = 0.12;

    this.modelRoot.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      if (node.material) {
        node.material.envMapIntensity = 0.8;
      }
    });

    this.scene.add(this.modelRoot);

    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    this.mixer.addEventListener('finished', this._onMixerFinished);

    for (const clip of gltf.animations || []) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }

    this.idleAction = this.actions.Idle || null;
    this.eatAction = this.actions.Eat || null;
    if (this.idleAction) {
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
      this.idleAction.enabled = true;
      this.idleAction.play();
    }
  }

  playIdle(fadeDuration = 0.2) {
    if (!this.idleAction) return;

    this.pendingIdle = false;
    this.idleAction.reset();
    this.idleAction.enabled = true;
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);

    if (this.eatAction && this.eatAction.isRunning()) {
      this.idleAction.crossFadeFrom(this.eatAction, fadeDuration, true);
    }
    this.idleAction.play();
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
    if (this.idleAction) {
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

  updateLook(delta) {
    if (!this.modelRoot) return;

    const targetYaw = this.hovering ? (this.pointer.x - 0.5) * 0.32 : 0.0;
    const targetPitch = this.hovering ? (0.5 - this.pointer.y) * 0.12 : 0.0;

    const smooth = clamp(delta * 7.5, 0.05, 0.28);
    this.modelRoot.rotation.y += (0.12 + targetYaw - this.modelRoot.rotation.y) * smooth;
    this.modelRoot.rotation.x += (targetPitch - this.modelRoot.rotation.x) * smooth;

    const tapBounce = Math.sin(Date.now() * 0.012) * this.tapImpulse * 0.03;
    this.modelRoot.position.y = 0.02 + tapBounce;
    this.tapImpulse *= 0.93;
  }

  resize() {
    if (!this.renderer || !this.camera || !this.mount) return;

    // Use getBoundingClientRect for accurate rendered size (works with CSS transforms and absolute positioning)
    const rect = this.mount.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(width, height, false);
  }

  renderLoop() {
    if (!this._running) return;
    const delta = this.clock.getDelta();
    if (this.mixer) this.mixer.update(delta);
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

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

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
    this.actions = {};
  }
}

window.PandaMascot3D = PandaMascot3D;

export { PandaMascot3D };
