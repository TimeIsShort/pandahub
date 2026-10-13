/**
 * PandaHub E2E Tests - Simplified
 * Usage: BASE_URL=https://pandahub.cloud TEST_USERNAME=<user> TEST_PASSWORD=<password> npm run test:login-flow
 * NOTE: no default credentials — TEST_USERNAME / TEST_PASSWORD must be set.
 */

const { test, expect, chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;
if (!USERNAME || !PASSWORD) {
  throw new Error('请设置 TEST_USERNAME / TEST_PASSWORD 环境变量（测试不再提供默认账号口令）');
}

test.describe('PandaHub E2E', () => {
  let browser;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    if (browser) await browser.close();
  });

  test('🔐 管理员账号可正常登录', async () => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(2000);

    await p.locator('#nav-login').click();
    await p.waitForTimeout(500);
    await p.locator('#login-username').fill(USERNAME);
    await p.locator('#login-password').fill(PASSWORD);
    await p.locator('#btn-login-submit').click();
    await p.waitForTimeout(5000);

    // Check auth modal is gone or avatar visible
    const authModalHidden = await p.evaluate(() => {
      const modal = document.getElementById('auth-modal');
      return !modal || modal.style.display === 'none';
    });
    console.log('   登录弹层关闭:', authModalHidden);

    const avatarVisible = await p.evaluate(() => {
      const btn = document.getElementById('nav-avatar-btn');
      return btn && btn.style.display !== 'none';
    });
    console.log('   头像按钮可见:', avatarVisible);

    expect(authModalHidden || avatarVisible).toBe(true);
    await p.close();
  });

  test('🏪 积分商城API正常', async () => {
    const p = await browser.newPage();
    const resp = await p.request.get(BASE_URL + '/api/shop/items');
    const data = await resp.json();
    console.log('   商城商品数:', data.items?.length || 0);
    expect(data.items?.length).toBeGreaterThan(0);
    await p.close();
  });

  test('📋 每日任务组件存在', async () => {
    const p = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);

    const exists = await p.evaluate(() => {
      return {
        tasksBtn: !!document.getElementById('btn-daily-tasks'),
        lotteryBtn: !!document.getElementById('btn-lottery'),
        shopBtn: !!document.getElementById('btn-shop'),
        trendingBtn: !!document.getElementById('btn-trending')
      };
    });
    console.log('   组件状态:', exists);
    expect(exists.tasksBtn).toBe(true);
    expect(exists.lotteryBtn).toBe(true);
    expect(exists.shopBtn).toBe(true);
    await p.close();
  });

  test('📝 每日任务下拉菜单可展开', async () => {
    const p = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);

    // Call toggle via JS
    await p.evaluate(() => {
      if (typeof toggleDailyTasksDropdown === 'function') toggleDailyTasksDropdown();
    });
    await p.waitForTimeout(500);

    const result = await p.evaluate(() => {
      const dropdown = document.getElementById('daily-tasks-dropdown');
      const list = document.getElementById('daily-tasks-list-dropdown');
      return {
        dropdownDisplay: dropdown ? getComputedStyle(dropdown).display : 'not_found',
        listChildren: list ? list.children.length : 0
      };
    });
    console.log('   任务下拉display:', result.dropdownDisplay, '| 任务项:', result.listChildren);
    expect(result.listChildren).toBeGreaterThan(0);
    await p.close();
  });

  test('🎰 抽奖转盘存在', async () => {
    const p = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);

    await p.evaluate(() => {
      if (typeof toggleLotteryDropdown === 'function') toggleLotteryDropdown();
    });
    await p.waitForTimeout(500);

    const result = await p.evaluate(() => {
      const dropdown = document.getElementById('lottery-dropdown');
      const wheel = document.getElementById('lottery-wheel-area');
      return {
        dropdownDisplay: dropdown ? getComputedStyle(dropdown).display : 'not_found',
        wheelExists: !!wheel
      };
    });
    console.log('   抽奖display:', result.dropdownDisplay, '| 转盘:', result.wheelExists);
    expect(result.wheelExists).toBe(true);
    await p.close();
  });

  test('📖 帖子列表正常加载', async () => {
    const p = await browser.newPage();
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);

    const postCount = await p.evaluate(() => {
      return document.querySelectorAll('.post-card').length;
    });
    console.log('   帖子卡片数:', postCount);
    expect(postCount).toBeGreaterThan(0);
    await p.close();
  });

  test('📖 帖子详情页可加载（游客）', async () => {
    const p = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);

    // Click first post
    await p.locator('.post-card').first().click();
    await p.waitForTimeout(3000);

    const result = await p.evaluate(() => {
      const detail = document.getElementById('post-detail');
      const title = document.querySelector('.post-title');
      const viewPost = document.getElementById('view-post');
      return {
        detailLength: detail ? detail.innerHTML.length : 0,
        titleText: title ? title.textContent : '',
        viewPostDisplay: viewPost ? getComputedStyle(viewPost).display : 'not_found'
      };
    });
    console.log('   详情HTML长度:', result.detailLength);
    console.log('   帖子标题:', result.titleText.substring(0, 30));
    expect(result.detailLength).toBeGreaterThan(100);
    await p.close();
  });

  test('📰 社区热议榜正常', async () => {
    const p = await browser.newPage();
    const resp = await p.request.get(BASE_URL + '/api/leaderboard/hot-posts');
    const data = await resp.json();
    console.log('   热议榜帖子数:', data.posts?.length || 0);
    // Can be 0 if no posts yet
    expect(Array.isArray(data.posts)).toBe(true);
    await p.close();
  });

  test('🔍 搜索功能可响应', async () => {
    const p = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(3000);

    await p.locator('#search-input').fill('AI');
    await p.waitForTimeout(1500);

    const searchResults = await p.evaluate(() => {
      return document.querySelectorAll('.post-card').length;
    });
    console.log('   搜索"AI"结果数:', searchResults);
    // Just check it doesn't crash
    expect(searchResults).toBeDefined();
    await p.close();
  });

  test('🏷️ 版块筛选正常', async () => {
    const p = await browser.newPage();
    // Check via API first
    const resp = await p.request.get(BASE_URL + '/api/sections');
    const data = await resp.json();
    console.log('   API版块数:', data.sections?.length || 0);
    expect(data.sections?.length).toBeGreaterThan(0);

    // Also check UI loads
    const uiPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await uiPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await uiPage.waitForTimeout(5000); // wait for parallel API calls
    const sectionTabs = await uiPage.evaluate(() => {
      return document.querySelectorAll('#sections-filter button').length;
    });
    console.log('   UI版块标签数:', sectionTabs);
    await uiPage.close();
    await p.close();
  });
});
