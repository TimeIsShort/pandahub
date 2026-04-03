// Disposable email domain blocklist + registration rate limiting

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'throwaway.email', 'fakeinbox.com', 'trashmail.com', 'getnada.com',
  'maildrop.cc', 'dispostable.com', 'mintemail.com', 'sharklasers.com',
  'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de', 'grr.la',
  'spam4.me', 'temp-mail.org', 'yopmail.com', 'yopmail.fr', 'cool.fr.nf',
  'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj',
  'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'monmail.fr.nf', 'hide.biz.st', 'mymail.infos.st', 'emailondeck.com',
  'tempail.com', 'tempemailco.com', 'discard.email', 'tmpmail.org',
  'tmpmail.net', 'fakemailgenerator.com', 'emailfake.com', 'mailcatch.com',
]);

// Registration attempt rate limiting (per IP)
const regAttempts = new Map();
const REG_MAX = 5;
const REG_WINDOW = 60 * 60 * 1000; // 5 attempts per hour per IP

function checkRegistration(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || 'unknown';

  const now = Date.now();
  if (!regAttempts.has(ip)) {
    regAttempts.set(ip, { count: 0, windowStart: now });
  }

  const record = regAttempts.get(ip);

  // Reset if window expired
  if (now - record.windowStart > REG_WINDOW) {
    record.count = 0;
    record.windowStart = now;
  }

  if (record.count >= REG_MAX) {
    const retryAfter = Math.ceil((REG_WINDOW - (now - record.windowStart)) / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({
      error: '该 IP 注册过于频繁，请 ' + Math.ceil(retryAfter / 60) + ' 分钟后再试'
    });
  }

  record.count++;
  next();
}

function checkDisposableEmail(req, res, next) {
  const { email } = req.body || {};

  if (!email || typeof email !== 'string') {
    return next(); // Let the main validation handle missing email
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    return res.status(400).json({
      error: '暂不支持该邮箱域名，请使用常用邮箱注册'
    });
  }

  next();
}

// Username blacklist (reserved / offensive)
const USERNAME_BLACKLIST = new Set([
  'admin', 'administrator', 'root', 'system', 'moderator', 'moderator',
  'support', 'help', 'staff', '官方', '管理员', '系统', '斑竹', '超级版主',
  'test', 'demo', 'guest', 'anonymous', 'null', 'undefined',
]);

function checkUsername(req, res, next) {
  const { username } = req.body || {};
  if (!username || typeof username !== 'string') return next();

  const clean = username.trim().toLowerCase();
  if (USERNAME_BLACKLIST.has(clean)) {
    return res.status(400).json({
      error: '该用户名不可用，请换一个'
    });
  }
  next();
}

// Inject guards into auth routes
function registerGuardMiddleware(req, res, next) {
  checkRegistration(req, res, (err) => {
    if (err) return next(err);
    checkDisposableEmail(req, res, (err2) => {
      if (err2) return next(err2);
      checkUsername(req, res, next);
    });
  });
}

module.exports = { registerGuardMiddleware, checkDisposableEmail, checkUsername, checkRegistration };
