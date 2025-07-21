const AWS = require('aws-sdk');
const axios = require('axios');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

/**
 * Upload image to S3 bucket
 * @param {string} imageUrl - The URL of the image to download and upload
 * @param {string} advertId - The advert ID to use in filename
 * @returns {Promise<string|null>} - The S3 URL of the uploaded image or null if failed
 */
async function uploadImageToS3(imageUrl, advertId) {
  try {
    if (!imageUrl) {
      console.log('No image URL found');
      return null;
    }

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `autoscout/${advertId}_${timestamp}.jpg`;
    
    // Upload to S3
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: filename,
      Body: imageResponse.data,
      ContentType: 'image/jpeg'
    };

    const uploadResult = await s3.upload(uploadParams).promise();
    console.log(`Image uploaded to S3: ${uploadResult.Location}`);
    
    return uploadResult.Location;
  } catch (error) {
    console.error('Error uploading image to S3:', error.message);
    return null;
  }
}

/**
 * Delete image from S3 bucket
 * @param {string} imageUrl - The S3 URL of the image to delete
 * @returns {Promise<boolean>} - True if deleted successfully, false otherwise
 */
async function deleteImageFromS3(imageUrl) {
  try {
    if (!imageUrl) {
      return false;
    }

    // Extract key from S3 URL
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1); // Remove leading slash

    const deleteParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    };

    await s3.deleteObject(deleteParams).promise();
    console.log(`Image deleted from S3: ${imageUrl}`);
    
    return true;
  } catch (error) {
    console.error('Error deleting image from S3:', error.message);
    return false;
  }
}

module.exports = {
  uploadImageToS3,
  deleteImageFromS3
}; 