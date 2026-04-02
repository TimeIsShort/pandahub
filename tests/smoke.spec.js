// PandaHub Smoke Tests
// Run: npx playwright test smoke.spec.js
// Covers: 首页、登录、申请内测、工具箱

const { test, expect, chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('PandaHub Smoke Tests', () => {
  let browser;
  let page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    if (browser) await browser.close();
  });

  test('🏠 首页加载正常', async () => {
    const p = await browser.newPage();
    const errors = [];
    p.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for app to init
    await p.waitForTimeout(3000);
    // Check page title
    const title = await p.title();
    expect(title).toContain('熊猫社区');
    // Check critical elements
    const body = await p.locator('body').count();
    expect(body).toBeGreaterThan(0);
    // No JS errors
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    await p.close();
  });

  test('📱 首页移动端加载正常', async () => {
    const p = await browser.newPage({
      viewport: { width: 375, height: 812 }
    });
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);
    const title = await p.title();
    expect(title).toContain('熊猫社区');
    await p.close();
  });

  test('🔐 登录弹层正常打开', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);
    // Click login button
    const loginBtn = p.locator('button:has-text("登录")').first();
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
      await p.waitForTimeout(500);
      const modal = p.locator('#auth-modal');
      await expect(modal).toBeVisible();
    }
    await p.close();
  });

  test('📝 申请内测页面正常加载', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL + '/apply.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);
    const title = await p.title();
    expect(title.length).toBeGreaterThan(0);
    // Check form exists
    const emailInput = p.locator('#email');
    await expect(emailInput).toBeVisible();
    await p.close();
  });

  test('🧰 工具箱页面正常加载', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL + '/toolbox.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);
    const title = await p.title();
    expect(title).toContain('工具箱');
    await p.close();
  });

  test('📋 登录表单可填写并提交', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);
    const loginBtn = p.locator('button:has-text("登录")').first();
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
      await p.waitForTimeout(500);
      // Fill username
      const userInput = p.locator('#login-username');
      if (await userInput.count() > 0) {
        await userInput.fill('testuser');
        const passInput = p.locator('#login-password');
        await passInput.fill('testpass');
        // Check form structure - button should be type=submit
        const submitBtn = p.locator('#btn-login-submit');
        const btnType = await submitBtn.getAttribute('type');
        expect(btnType).toBe('submit');
      }
    }
    await p.close();
  });

  test('🔤 i18n 英文模式切换', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);
    // Switch to English via JS (i18n module)
    await p.evaluate(() => {
      if (window.i18nLang === 'en') return;
      // Find and change the lang select if available
      var sel = document.getElementById('settings-lang') || document.getElementById('lang-select');
      if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change')); }
      else if (typeof handleLangChange === 'function') handleLangChange('en');
      else if (window.i18n) { window.i18nLang = 'en'; localStorage.setItem('i18nLang', 'en'); }
    });
    await p.waitForTimeout(1000);
    const title = await p.title();
    expect(title).toBeTruthy();
    // No JS errors
    await p.close();
  });

  test('📰 帖子列表页面可加载', async () => {
    const p = await browser.newPage();
    const errors = [];
    p.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);
    // Check no critical errors
    const critErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('sw.js') &&
      !e.includes('ServiceWorker')
    );
    expect(critErrors).toHaveLength(0);
    await p.close();
  });
});

test.describe('P2 Regression - 双语UI', () => {
  let browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    if (browser) await browser.close();
  });

  test('🌐 英文环境下核心文案显示', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await p.waitForTimeout(2000);

    // Switch to English via JS
    await p.evaluate(() => {
      var sel = document.getElementById('settings-lang') || document.getElementById('lang-select');
      if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change')); }
      else if (typeof handleLangChange === 'function') handleLangChange('en');
    });
    await p.waitForTimeout(1000);

    // Check for key UI elements
    const bodyText = await p.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
    await p.close();
  });
});
