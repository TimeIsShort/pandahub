const COS = require('cos-nodejs-sdk-v5');

// Initialize COS client from environment variables
const cos = new COS({
  SecretId: process.env.TENCENT_COS_SECRET_ID,
  SecretKey: process.env.TENCENT_COS_SECRET_KEY,
});

const BUCKET = process.env.TENCENT_COS_BUCKET || 'fly-1300576097';
const REGION = process.env.TENCENT_COS_REGION || 'ap-singapore';
const CDN_DOMAIN = process.env.TENCENT_COS_DOMAIN || ''; // Optional custom CDN domain

/**
 * Upload a buffer or file path to COS
 * @param {Buffer|string} fileContent - File buffer or path
 * @param {string} key - COS object key (e.g. 'uploads/img-xxx.jpg')
 * @returns {Promise<string>} - Public URL of uploaded file
 */
function uploadToCOS(fileContent, key) {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
      Body: fileContent,
      onProgress: () => {},
    };

    cos.putObject(params, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      // Build public URL
      const protocol = CDN_DOMAIN.startsWith('https') || CDN_DOMAIN.startsWith('http') ? '' : 'https://';
      const baseUrl = CDN_DOMAIN || `${BUCKET}.cos.${REGION}.myqcloud.com`;
      const url = `${protocol}${baseUrl}/${key}`;
      resolve(url);
    });
  });
}

/**
 * Delete a file from COS
 * @param {string} key - COS object key
 */
function deleteFromCOS(key) {
  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: key,
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

module.exports = { uploadToCOS, deleteFromCOS, BUCKET, REGION };
