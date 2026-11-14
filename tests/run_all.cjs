/**
 * tests/run_all.cjs
 * 纯逻辑测试汇总入口：逐个执行 tests/*.test.cjs 并汇总退出码
 *
 * 说明：现有测试文件内部会调用 process.exit，不能直接 require，
 * 因此用 spawnSync 分进程执行。
 * 运行：npm test
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.cjs'))
  .sort();

if (!files.length) {
  console.log('未找到任何测试文件');
  process.exit(0);
}

let failedSuites = 0;

for (const file of files) {
  console.log('\n========== ' + file + ' ==========');
  const result = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
  if (result.status !== 0) failedSuites++;
}

console.log('\n----------------------------------------');
console.log(failedSuites === 0 ? `全部 ${files.length} 个测试套件通过` : `${failedSuites} / ${files.length} 个测试套件失败`);
process.exit(failedSuites === 0 ? 0 : 1);
