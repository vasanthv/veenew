// csrfToken.js
const crypto = require("crypto");
const config = require("../../config");

const CSRF_SECRET = config.SECRET;

/**
 * Encodes input as URL-safe base64.
 * @param {string} input - Plain text value.
 * @returns {string} URL-safe base64 string without padding.
 */
function base64urlEncode(input) {
	return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Decodes a URL-safe base64 string.
 * @param {string} input - URL-safe base64 string.
 * @returns {string} Decoded plain text.
 */
function base64urlDecode(input) {
	const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
	return Buffer.from(b64, "base64").toString();
}

/**
 * Creates an HMAC signature for a payload segment.
 * @param {string} data - Payload segment to sign.
 * @returns {string} URL-safe base64 HMAC signature.
 */
function sign(data) {
	return base64urlEncode(crypto.createHmac("sha256", CSRF_SECRET).update(data).digest());
}

/**
 * Creates a signed CSRF token with nonce and expiry.
 * @returns {string} Token in `payload.signature` format.
 */
const createCsrfToken = () => {
	const payload = {
		n: crypto.randomBytes(16).toString("hex"),
		exp: Math.floor(Date.now() / 1000) + config.CSRF_TOKEN_EXPIRY,
	};

	const payloadB64 = base64urlEncode(JSON.stringify(payload));
	const signature = sign(payloadB64);

	return `${payloadB64}.${signature}`;
};

/**
 * Verifies CSRF token structure, signature, and expiry.
 * @param {string} token - Token from cookie/header/body.
 * @returns {boolean} `true` when token is valid.
 */
const verifyCsrfToken = (token) => {
	if (!token || typeof token !== "string") return false;

	const parts = token.split(".");
	if (parts.length !== 2) return false;

	const [payloadB64, signature] = parts;

	const expectedSig = sign(payloadB64);
	const sigBuf = Buffer.from(signature);
	const expectedBuf = Buffer.from(expectedSig);
	if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
		return false;
	}

	let payload;
	try {
		payload = JSON.parse(base64urlDecode(payloadB64));
	} catch {
		return false;
	}

	if (payload.exp < Math.floor(Date.now() / 1000)) return false;

	return true;
};

module.exports = {
	createCsrfToken,
	verifyCsrfToken,
};
