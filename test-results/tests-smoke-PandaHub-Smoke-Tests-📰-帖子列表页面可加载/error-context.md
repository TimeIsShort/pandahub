# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/smoke.spec.js >> PandaHub Smoke Tests >> 📰 帖子列表页面可加载
- Location: tests/smoke.spec.js:131:3

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 1
Received array:  ["Failed to load resource: the server responded with a status of 500 (Internal Server Error)"]
```

# Test source

```ts
  45  |     await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  46  |     await p.waitForTimeout(2000);
  47  |     const title = await p.title();
  48  |     expect(title).toContain('熊猫社区');
  49  |     await p.close();
  50  |   });
  51  | 
  52  |   test('🔐 登录弹层正常打开', async () => {
  53  |     const p = await browser.newPage();
  54  |     await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  55  |     await p.waitForTimeout(2000);
  56  |     // Click login button
  57  |     const loginBtn = p.locator('button:has-text("登录")').first();
  58  |     if (await loginBtn.count() > 0) {
  59  |       await loginBtn.click();
  60  |       await p.waitForTimeout(500);
  61  |       const modal = p.locator('#auth-modal');
  62  |       await expect(modal).toBeVisible();
  63  |     }
  64  |     await p.close();
  65  |   });
  66  | 
  67  |   test('📝 申请内测页面正常加载', async () => {
  68  |     const p = await browser.newPage();
  69  |     await p.goto(BASE_URL + '/apply.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  70  |     await p.waitForTimeout(2000);
  71  |     const title = await p.title();
  72  |     expect(title.length).toBeGreaterThan(0);
  73  |     // Check form exists
  74  |     const emailInput = p.locator('#email');
  75  |     await expect(emailInput).toBeVisible();
  76  |     await p.close();
  77  |   });
  78  | 
  79  |   test('🧰 工具箱页面正常加载', async () => {
  80  |     const p = await browser.newPage();
  81  |     await p.goto(BASE_URL + '/toolbox.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  82  |     await p.waitForTimeout(2000);
  83  |     const title = await p.title();
  84  |     expect(title).toContain('工具箱');
  85  |     await p.close();
  86  |   });
  87  | 
  88  |   test('📋 登录表单可填写并提交', async () => {
  89  |     const p = await browser.newPage();
  90  |     await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  91  |     await p.waitForTimeout(2000);
  92  |     const loginBtn = p.locator('button:has-text("登录")').first();
  93  |     if (await loginBtn.count() > 0) {
  94  |       await loginBtn.click();
  95  |       await p.waitForTimeout(500);
  96  |       // Fill username
  97  |       const userInput = p.locator('#login-username');
  98  |       if (await userInput.count() > 0) {
  99  |         await userInput.fill('testuser');
  100 |         const passInput = p.locator('#login-password');
  101 |         await passInput.fill('testpass');
  102 |         // Check form structure - button should be type=submit
  103 |         const submitBtn = p.locator('#btn-login-submit');
  104 |         const btnType = await submitBtn.getAttribute('type');
  105 |         expect(btnType).toBe('submit');
  106 |       }
  107 |     }
  108 |     await p.close();
  109 |   });
  110 | 
  111 |   test('🔤 i18n 英文模式切换', async () => {
  112 |     const p = await browser.newPage();
  113 |     await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  114 |     await p.waitForTimeout(2000);
  115 |     // Switch to English via JS (i18n module)
  116 |     await p.evaluate(() => {
  117 |       if (window.i18nLang === 'en') return;
  118 |       // Find and change the lang select if available
  119 |       var sel = document.getElementById('settings-lang') || document.getElementById('lang-select');
  120 |       if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change')); }
  121 |       else if (typeof handleLangChange === 'function') handleLangChange('en');
  122 |       else if (window.i18n) { window.i18nLang = 'en'; localStorage.setItem('i18nLang', 'en'); }
  123 |     });
  124 |     await p.waitForTimeout(1000);
  125 |     const title = await p.title();
  126 |     expect(title).toBeTruthy();
  127 |     // No JS errors
  128 |     await p.close();
  129 |   });
  130 | 
  131 |   test('📰 帖子列表页面可加载', async () => {
  132 |     const p = await browser.newPage();
  133 |     const errors = [];
  134 |     p.on('console', msg => {
  135 |       if (msg.type() === 'error') errors.push(msg.text());
  136 |     });
  137 |     await p.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  138 |     await p.waitForTimeout(3000);
  139 |     // Check no critical errors
  140 |     const critErrors = errors.filter(e =>
  141 |       !e.includes('favicon') &&
  142 |       !e.includes('sw.js') &&
  143 |       !e.includes('ServiceWorker')
  144 |     );
> 145 |     expect(critErrors).toHaveLength(0);
      |                        ^ Error: expect(received).toHaveLength(expected)
  146 |     await p.close();
  147 |   });
  148 | });
  149 | 
  150 | test.describe('P2 Regression - 双语UI', () => {
  151 |   let browser;
  152 | 
  153 |   test.beforeAll(async () => {
  154 |     browser = await chromium.launch({ headless: true });
  155 |   });
  156 | 
  157 |   test.afterAll(async () => {
  158 |     if (browser) await browser.close();
  159 |   });
  160 | 
  161 |   test('🌐 英文环境下核心文案显示', async () => {
  162 |     const p = await browser.newPage();
  163 |     await p.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  164 |     await p.waitForTimeout(2000);
  165 | 
  166 |     // Switch to English via JS
  167 |     await p.evaluate(() => {
  168 |       var sel = document.getElementById('settings-lang') || document.getElementById('lang-select');
  169 |       if (sel) { sel.value = 'en'; sel.dispatchEvent(new Event('change')); }
  170 |       else if (typeof handleLangChange === 'function') handleLangChange('en');
  171 |     });
  172 |     await p.waitForTimeout(1000);
  173 | 
  174 |     // Check for key UI elements
  175 |     const bodyText = await p.locator('body').innerText();
  176 |     expect(bodyText.length).toBeGreaterThan(50);
  177 |     await p.close();
  178 |   });
  179 | });
  180 | 
```