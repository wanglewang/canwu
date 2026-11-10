'use strict';

// 常驻测试入口：顺序执行各测试文件，任一失败即以非零码退出。
const path = require('path');
const { spawnSync } = require('child_process');

const FILES = ['game.test.js', 'store.test.js', 'minigames.test.js'];
let failed = 0;

for (const file of FILES) {
  console.log('\n---- ' + file + ' ----');
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error('\n测试失败：' + failed + ' 个文件');
  process.exit(1);
}
console.log('\n全部常驻测试通过（' + FILES.length + ' 个文件）');
