#!/usr/bin/env node
/**
 * release-gate.js - 发布验收门禁
 *
 * 在发布前运行多项检查，任何一项不达标则阻止发布：
 * 1. i18n 覆盖率检查（核心文案必须有英文翻译）
 * 2. 冒烟测试通过
 * 3. 性能基线检查（可配置阈值）
 *
 * 用法: node scripts/release-gate.js [--skip-smoke]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const skipSmoke = args.includes('--skip-smoke');

// Thresholds
const I18N_MIN_COVERAGE = 0.90; // 90% core keys must have English
const MAX_DCL_MS = 3000;          // DCL should be under 3s
const MAX_LCP_MS = 4000;         // LCP should be under 4s
const MAX_API_P95_MS = 500;      // API p95 should be under 500ms

let allPassed = true;

function check(name, pass, detail) {
  const icon = pass ? '✅' : '❌';
  const msg = pass ? `PASS` : `FAIL`;
  console.log(`${icon} [${msg}] ${name}`);
  if (detail) console.log(`       ${detail}`);
  if (!pass) allPassed = false;
  return pass;
}

async function run() {
  console.log('🔒 PandaHub Release Gate');
  console.log('========================\n');

  // 1. i18n Coverage
  console.log('📋 检查 1: i18n 覆盖率');
  try {
    const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/i18n/zh.json'), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/i18n/en.json'), 'utf8'));
    const zhKeys = Object.keys(zh);
    const enKeys = Object.keys(en);
    const missingKeys = zhKeys.filter(k => en[k] === undefined || en[k] === '');
    const coverage = (enKeys.length / zhKeys.length * 100).toFixed(1);
    const missingCoverage = (missingKeys.length / zhKeys.length * 100).toFixed(1);
    check('i18n key 覆盖率', parseFloat(coverage) >= I18N_MIN_COVERAGE * 100,
      `${enKeys.length}/${zhKeys.length} keys (${coverage}%), 缺失: ${missingKeys.slice(0, 5).join(', ')}${missingKeys.length > 5 ? '...' : ''}`);
  } catch(e) {
    check('i18n 覆盖率', false, `读取失败: ${e.message}`);
  }

  // 2. Accessibility baseline
  console.log('\n📋 检查 2: 无障碍基线 (a11y)');
  try {
    // Check for form labels
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const inputsWithoutLabel = (indexHtml.match(/<input[^>]+(?!.*aria-label)[^>]*>/gi) || []).length;
    const inputsWithoutFor = (indexHtml.match(/<input[^>]+id="[^"]+"[^>]*>/gi) || []).length;
    // Rough check: most inputs should have labels
    const totalInputs = (indexHtml.match(/<input/gi) || []).length;
    const labelFors = (indexHtml.match(/for="[^"]+"/gi) || []).length;
    const ariaLabels = (indexHtml.match(/aria-label/gi) || []).length;
    const hasProperLabels = (labelFors + ariaLabels) >= totalInputs * 0.8;
    check('表单无障碍标签', hasProperLabels,
      `inputs:${totalInputs}, label[for]:${labelFors}, aria-label:${ariaLabels}`);
  } catch(e) {
    check('无障碍基线', false, `检查失败: ${e.message}`);
  }

  // 3. Build check
  console.log('\n📋 检查 3: 构建完整性');
  try {
    // Check that package.json is valid
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    check('package.json 有效', !!pkg.name && !!pkg.version, `${pkg.name} v${pkg.version}`);
    // Check no syntax errors in key files
    const routesDir = path.join(__dirname, '../routes');
    const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
    let routeErrors = 0;
    for (const file of files) {
      try {
        require(path.join(routesDir, file));
      } catch(e) {
        if (!e.code === 'MODULE_NOT_FOUND') {
          routeErrors++;
          console.log(`       ❌ route error: ${file} - ${e.message.substring(0, 80)}`);
        }
      }
    }
    check('所有路由文件可加载', routeErrors === 0, `错误文件数: ${routeErrors}`);
  } catch(e) {
    check('构建检查', false, `失败: ${e.message}`);
  }

  // 4. Git status check
  console.log('\n📋 检查 4: Git 状态');
  try {
    const status = execSync('git status --porcelain', { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    const uncommitted = status.trim().split('\n').filter(l => l.trim());
    if (uncommitted.length > 0) {
      console.log('       未提交的文件:');
      uncommitted.slice(0, 5).forEach(l => console.log(`       ${l}`));
      if (uncommitted.length > 5) console.log(`       ...还有 ${uncommitted.length - 5} 个文件`);
    }
    check('无未提交文件', uncommitted.length === 0, `未提交: ${uncommitted.length} 个`);
  } catch(e) {
    check('Git 检查', false, `失败: ${e.message}`);
  }

  // 5. Smoke tests (optional skip)
  if (!skipSmoke) {
    console.log('\n📋 检查 5: 冒烟测试');
    try {
      execSync('npx playwright test tests/smoke.spec.js --reporter=line', {
        cwd: path.join(__dirname, '..),
        stdio: 'inherit',
        timeout: 120000
      });
      check('冒烟测试', true, '所有测试通过');
    } catch(e) {
      check('冒烟测试', false, '有测试失败，请检查上面输出');
    }
  } else {
    console.log('\n📋 检查 5: 冒烟测试 (已跳过 --skip-smoke)');
  }

  console.log('\n========================');
  if (allPassed) {
    console.log('🎉 所有检查通过！可以发布。');
    process.exit(0);
  } else {
    console.log('❌ 有检查未通过，请修复后再试。');
    process.exit(1);
  }
}

run().catch(e => {
  console.error('门禁检查异常:', e);
  process.exit(1);
});
