const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const config = require("../../config");

let client;
const getClient = () => {
	client ??= new S3Client({
		region: config.AWS_REGION,
		credentials: {
			accessKeyId: config.AWS_ACCESS_KEY,
			secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
		},
	});
	return client;
};

/**
 * Uploads an object to the bucket.
 * @param {string} key - Object key
 * @param {Buffer} body - File contents
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} The s3:// location of the object
 */
const putObject = async (key, body, contentType) => {
	await getClient().send(
		new PutObjectCommand({ Bucket: config.AWS_S3_BUCKET, Key: key, Body: body, ContentType: contentType })
	);
	return `s3://${config.AWS_S3_BUCKET}/${key}`;
};

/**
 * Opens an object for reading.
 * @param {string} key - Object key
 * @returns {Promise<import("stream").Readable>} The object's byte stream
 */
const getObjectStream = async (key) => {
	const response = await getClient().send(new GetObjectCommand({ Bucket: config.AWS_S3_BUCKET, Key: key }));
	return response.Body;
};

/**
 * Deletes an object from the bucket. Deleting a missing key succeeds.
 * @param {string} key - Object key
 * @returns {Promise<void>}
 */
const deleteObject = async (key) => {
	await getClient().send(new DeleteObjectCommand({ Bucket: config.AWS_S3_BUCKET, Key: key }));
};

module.exports = { putObject, getObjectStream, deleteObject };
