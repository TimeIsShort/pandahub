import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const copies = [
  {
    from: path.join(projectRoot, 'node_modules', 'three', 'build', 'three.module.js'),
    to: path.join(projectRoot, 'public', 'vendor', 'three', 'build', 'three.module.js')
  },
  {
    from: path.join(projectRoot, 'node_modules', 'three', 'examples', 'jsm', 'loaders', 'GLTFLoader.js'),
    to: path.join(projectRoot, 'public', 'vendor', 'three', 'examples', 'jsm', 'loaders', 'GLTFLoader.js')
  },
  {
    from: path.join(projectRoot, 'node_modules', 'three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'),
    to: path.join(projectRoot, 'public', 'vendor', 'three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js')
  }
];

async function main() {
  for (const item of copies) {
    await fs.mkdir(path.dirname(item.to), { recursive: true });
    await fs.copyFile(item.from, item.to);
    console.log(`Synced: ${path.relative(projectRoot, item.to).replace(/\\/g, '/')}`);
  }

  const rewriteTargets = [
    path.join(projectRoot, 'public', 'vendor', 'three', 'examples', 'jsm', 'loaders', 'GLTFLoader.js'),
    path.join(projectRoot, 'public', 'vendor', 'three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js')
  ];

  for (const target of rewriteTargets) {
    const source = await fs.readFile(target, 'utf8');
    const patched = source.replace(
      /from\s+['"]three['"]/g,
      "from '/vendor/three/build/three.module.js'"
    );
    await fs.writeFile(target, patched, 'utf8');
    console.log(`Patched imports: ${path.relative(projectRoot, target).replace(/\\/g, '/')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
