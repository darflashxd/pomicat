// Offline regression: exact notices must survive extension packaging.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const [name, hash] of [
  ['ONNX-Runtime-MIT.txt', '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c'],
  ['ONNX-Runtime-ThirdPartyNotices.txt', '143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3']
]) {
  const bytes = fs.readFileSync(path.join(root, 'extension/licenses', name));
  // Checkout line endings may differ; upstream notices are hashed with LF.
  assert.equal(crypto.createHash('sha256').update(bytes.toString().replace(/\r\n/g, '\n')).digest('hex'), hash);
}
assert(fs.readFileSync(path.join(root, 'extension/licenses/Apache-2.0.txt'), 'utf8').includes('END OF TERMS AND CONDITIONS'));
const build = fs.readFileSync(path.join(root, 'tools/build_extension.py'), 'utf8');
assert(build.includes('z.write(os.path.join(ROOT, "LICENSE"), "LICENSE")'));
assert(build.includes('for path, rel in files():'));
console.log('PASS: bundled license texts and project-license packaging');
