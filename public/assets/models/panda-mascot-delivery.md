# Panda Mascot GLB Delivery Notes

## Asset
- File: `public/assets/models/panda-mascot.glb`
- Size: `389.33 KB` (target `< 2 MB`, hard limit `< 5 MB`)
- Animation clips:
  - `Idle` (loop)
  - `Eat` (one-shot)

## Build Command
- Generate/rebuild model:
  - `node scripts/generate-panda-mascot.mjs`

## Export Parameters
- Format: `glb` (binary glTF 2.0)
- Embedded resources: `true`
- Exporter: `THREE.GLTFExporter`
- Animation export: enabled (`Idle`, `Eat`)
- Material system: PBR (`MeshStandardMaterial` + `MeshPhysicalMaterial`)

## Runtime Loading Config
- Model URL: `/assets/models/panda-mascot.glb`
- Breakpoint: enable 3D at `min-width: 960px`
- Fallback: CSS panda remains active when loading fails or WebGL unsupported
- Loader: `GLTFLoader` (Three.js module runtime in `public/vendor/three`)

## Control Contract
- Feed action: trigger `Eat`, then crossFade back to `Idle`
- Pointer hover: lightweight look reaction + tap impulse response
