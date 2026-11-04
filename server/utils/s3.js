const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const config = require("../../config");

let client;
const getClient = () => {
	// Cloudflare R2 speaks the S3 API, so the S3 client works with a custom endpoint and the "auto" region.
	client ??= new S3Client({
		region: "auto",
		endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: config.R2_ACCESS_KEY_ID,
			secretAccessKey: config.R2_SECRET_ACCESS_KEY,
		},
	});
	return client;
};

/**
 * Uploads an object to the bucket.
 * @param {string} key - Object key
 * @param {Buffer} body - File contents
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} The s3:// location (bucket and key) of the object
 */
const putObject = async (key, body, contentType) => {
	await getClient().send(
		new PutObjectCommand({ Bucket: config.R2_BUCKET, Key: key, Body: body, ContentType: contentType })
	);
	return `s3://${config.R2_BUCKET}/${key}`;
};

/**
 * Opens an object for reading.
 * @param {string} key - Object key
 * @returns {Promise<import("stream").Readable>} The object's byte stream
 */
const getObjectStream = async (key) => {
	const response = await getClient().send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
	return response.Body;
};

/**
 * Deletes an object from the bucket. Deleting a missing key succeeds.
 * @param {string} key - Object key
 * @returns {Promise<void>}
 */
const deleteObject = async (key) => {
	await getClient().send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
};

module.exports = { putObject, getObjectStream, deleteObject };
