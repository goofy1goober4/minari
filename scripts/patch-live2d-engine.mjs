// Patch untitled-pixi-live2d-engine for Cubism Core 5.3+ (moc3 v6) support.
//
// The bundled Cubism Framework reads `_model.drawables.renderOrders`, which the
// older Cubism Core (≤5.1) exposed but Cubism 5.3+ moved/dropped. Without this
// patch, doDrawModel throws "Cannot read properties of undefined (reading '0')"
// every frame and the model never draws. Falls back to drawOrders / top-level
// renderOrders so the renderer recovers across SDK versions.
//
// Re-run via `npm run postinstall` (wired in package.json) so npm i / ci /
// rebuild keep the patch applied. Idempotent: skips if already patched.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(
  process.cwd(),
  'node_modules/untitled-pixi-live2d-engine/dist/cubism.es.js',
);

const NEEDLE = `  getDrawableRenderOrders() {
    const renderOrders = this._model.drawables.renderOrders;
    return renderOrders;
  }`;

const REPLACEMENT = `  getDrawableRenderOrders() {
    const d = this._model.drawables;
    return d.renderOrders || d.drawOrders || this._model.renderOrders;
  }`;

let src;
try {
  src = readFileSync(target, 'utf8');
} catch (err) {
  console.warn('[patch-live2d-engine] target missing, skipping:', err.message);
  process.exit(0);
}

if (src.includes(REPLACEMENT)) {
  console.log('[patch-live2d-engine] already patched');
  process.exit(0);
}
if (!src.includes(NEEDLE)) {
  console.warn(
    '[patch-live2d-engine] needle not found — package version may have ' +
      'changed. Verify cubism.es.js still uses _model.drawables.renderOrders.',
  );
  process.exit(0);
}

writeFileSync(target, src.replace(NEEDLE, REPLACEMENT));
console.log('[patch-live2d-engine] applied');
