const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');

// Configure MinIO S3-compatible service using AWS SDK v3
const s3Client = new S3Client({
  endpoint: 'https://s3.nightdrive.ai', // MinIO S3 endpoint
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // required for MinIO
  region: 'us-east-1', // MinIO doesn't need this but AWS SDK requires it
});

/**
 * Upload image to MinIO bucket with quality preservation
 * @param {string} imageUrl - The URL of the image to download and upload
 * @param {string} advertId - The advert ID to use in filename
 * @returns {Promise<string|null>} - The MinIO URL of the uploaded image or null if failed
 */
async function uploadImage(imageUrl, advertId) {
  try {
    if (!imageUrl) {
      console.log('No image URL found');
      return null;
    }

    console.log(`Downloading image from: ${imageUrl}`);

    // Download the image with headers to preserve quality
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000 // 30 second timeout
    });

    // Determine content type from response headers or URL
    let contentType = imageResponse.headers['content-type'];
    let fileExtension = 'jpg'; // default

    if (contentType) {
      if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
        fileExtension = 'jpg';
      } else if (contentType.includes('image/png')) {
        fileExtension = 'png';
      } else if (contentType.includes('image/webp')) {
        fileExtension = 'webp';
      } else if (contentType.includes('image/gif')) {
        fileExtension = 'gif';
      }
    } else {
      // Fallback: determine from URL
      const urlLower = imageUrl.toLowerCase();
      if (urlLower.includes('.png')) {
        contentType = 'image/png';
        fileExtension = 'png';
      } else if (urlLower.includes('.webp')) {
        contentType = 'image/webp';
        fileExtension = 'webp';
      } else if (urlLower.includes('.gif')) {
        contentType = 'image/gif';
        fileExtension = 'gif';
      } else {
        contentType = 'image/jpeg';
        fileExtension = 'jpg';
      }
    }

    // Generate unique filename with proper extension
    const timestamp = Date.now();
    const filename = `autoscout/${advertId}_${timestamp}.${fileExtension}`;
    
    // Upload to MinIO with quality preservation settings
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET || process.env.AWS_S3_BUCKET,
      Key: filename,
      Body: imageResponse.data,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000', // Cache for 1 year
      Metadata: {
        'original-url': imageUrl,
        'upload-timestamp': timestamp.toString(),
        'advert-id': advertId
      }
    });

    const uploadResult = await s3Client.send(uploadCommand);
    
    // Construct the URL manually since AWS SDK v3 doesn't return Location in the same way
    const bucketName = process.env.MINIO_BUCKET || process.env.AWS_S3_BUCKET;
    const objectUrl = `https://s3.nightdrive.ai/${bucketName}/${filename}`;
    
    console.log(`Image uploaded to MinIO with quality preserved: ${objectUrl}`);
    console.log(`Original size: ${(imageResponse.data.length / 1024).toFixed(2)} KB`);
    
    return objectUrl;
  } catch (error) {
    console.error('Error uploading image to MinIO:', error.message);
    return null;
  }
}

/**
 * Delete image from MinIO bucket
 * @param {string} imageUrl - The MinIO URL of the image to delete
 * @returns {Promise<boolean>} - True if deleted successfully, false otherwise
 */
async function deleteImage(imageUrl) {
  try {
    if (!imageUrl) {
      return false;
    }

    // Extract key from S3 URL
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1); // Remove leading slash

    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.MINIO_BUCKET || process.env.AWS_S3_BUCKET,
      Key: key
    });

    await s3Client.send(deleteCommand);
    console.log(`Image deleted from MinIO: ${imageUrl}`);
    
    return true;
  } catch (error) {
    console.error('Error deleting image from MinIO:', error.message);
    return false;
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  // Backwards compatibility
  uploadImageToS3: uploadImage,
  deleteImageFromS3: deleteImage
}; 