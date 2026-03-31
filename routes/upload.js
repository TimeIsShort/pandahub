const express = require('express');
const multer = require('multer');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const { uploadToCOS } = require('../lib/cos');

const router = express.Router();

// Use memory storage (file content in RAM), then upload to COS
const memoryStorage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('只支持图片格式：jpg, png, gif, webp'));
  }
});

// Upload single image → COS
router.post('/image', authMiddleware, memoryStorage.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片文件' });
  }

  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const key = `uploads/img-${uniqueSuffix}${ext}`;

    const url = await uploadToCOS(req.file.buffer, key);
    res.json({ url });
  } catch (err) {
    console.error('[COS] Upload failed:', err);
    res.status(500).json({ error: '上传失败：' + err.message });
  }
});

module.exports = router;
