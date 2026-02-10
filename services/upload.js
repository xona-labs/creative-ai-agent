/**
 * Upload Service — Standalone for Xona Agent
 * Downloads AI-generated images/videos and uploads to DigitalOcean Spaces CDN
 */
const AWS = require('aws-sdk');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class UploadService {
  constructor() {
    this.bucketName = process.env.DO_SPACES_BUCKET;
    this.cdnUrl = process.env.DO_SPACES_CDN_URL || process.env.DO_SPACES_ENDPOINT;

    const spacesEndpoint = new AWS.Endpoint(
      process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com'
    );
    this.s3 = new AWS.S3({
      endpoint: spacesEndpoint,
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
      region: process.env.DO_SPACES_REGION || 'nyc3',
      s3ForcePathStyle: false,
      signatureVersion: 'v4'
    });
  }

  /**
   * Retry with exponential backoff
   */
  async retry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const backoff = delayMs * Math.pow(2, attempt - 1);
          console.log(`[Upload] Attempt ${attempt} failed, retrying in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }
    throw lastError;
  }

  /**
   * Upload buffer to DO Spaces
   */
  async uploadBuffer(buffer, folder, filename, contentType) {
    return this.retry(async () => {
      const key = `${folder}/${filename}`;
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ACL: 'public-read',
        ContentType: contentType
      };
      const result = await this.s3.upload(params).promise();
      const url = this.cdnUrl ? `${this.cdnUrl}/${key}` : result.Location;
      return { success: true, url, key };
    }, 3, 1000);
  }

  /**
   * Download image from URL and upload to CDN
   */
  async downloadAndUploadImage(imageUrl, folder = 'generated', filename = null) {
    try {
      return await this.retry(async () => {
        const response = await axios({
          url: imageUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 30000
        });

        const contentType = response.headers['content-type'] ||
          (imageUrl.endsWith('.png') ? 'image/png' :
           imageUrl.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

        const ext = contentType.split('/')[1] || 'jpg';
        const finalFilename = filename || `${Date.now()}-${uuidv4()}.${ext}`;

        return this.uploadBuffer(
          Buffer.from(response.data),
          folder,
          finalFilename,
          contentType
        );
      }, 3, 1000);
    } catch (error) {
      console.error('[Upload] Image upload failed:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Download video from URL and upload to CDN
   */
  async downloadAndUploadVideo(videoUrl, folder = 'generated', filename = null) {
    try {
      return await this.retry(async () => {
        const response = await axios({
          url: videoUrl,
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: 120000
        });

        const contentType = response.headers['content-type'] ||
          (videoUrl.endsWith('.webm') ? 'video/webm' : 'video/mp4');

        const ext = contentType.split('/')[1] || 'mp4';
        const finalFilename = filename || `${Date.now()}-${uuidv4()}.${ext}`;

        return this.uploadBuffer(
          Buffer.from(response.data),
          folder,
          finalFilename,
          contentType
        );
      }, 3, 1000);
    } catch (error) {
      console.error('[Upload] Video upload failed:', error.message);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new UploadService();
