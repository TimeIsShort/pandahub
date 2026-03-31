# v1.5 功能规划

> 规划时间：2026-03-31

---

## P1 功能

### 1.1 防机器人措施增强
**目标**：增强现有防机器人机制，阻止批量注册和暴力破解

**功能**：
- [x] 登录失败锁定：同一账号或IP连续5次登录失败，锁定1小时
- [x] `login_attempts` 表：记录每次登录尝试（IP/user_id/username/success/时间）
- [x] IP注册频率限制：同一IP 1小时内最多注册5个账号
- [x] 注册表单蜜罐字段：隐藏的 `website` 字段，机器人会填写、人类不会
- [x] 注册时间检测：表单显示到提交需超过2秒（机器人提交极快）
- [ ] 管理后台查看被锁定的账号/IP（查看 login_attempts 表）

**涉及文件**：
- `models/database.js` - login_attempts 表
- `routes/auth.js` - checkLoginAttempts / recordLoginAttempt / checkRegistrationRate / recordRegistrationAttempt / getClientIp
- `public/index.html` - 蜜罐字段
- `public/js/app.js` - showRegister() 初始化时间戳，sendRegCode() 发送蜜罐+时间戳
