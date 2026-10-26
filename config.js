const IS_PROD = process.env.NODE_ENV === "production";
const DOMAIN = IS_PROD ? "veenew.com" : "veenew.local:3000";

if (!process.env.SECRET) {
	throw new Error(
		"SECRET is not set. Generate one with `openssl rand -hex 32` and add it to your environment or .env file."
	);
}

module.exports = {
	DOMAIN,
	IS_PROD,
	PORT: process.env.PORT || 3000,
	FEED_ITEMS_LIMIT: 20,
	URL: IS_PROD ? `https://${DOMAIN}/` : `http://${DOMAIN}/`,
	MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/veenew-dev",
	DISABLE_CSRF: process.env.DISABLE_CSRF === "true",
	CSRF_COOKIE: "csrf_cookie",
	CSRF_TOKEN_EXPIRY: 60 * 30, // 30 mins
	SECRET: process.env.SECRET,
	AWS_REGION: process.env.AWS_REGION || "us-west-2",
	AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
	AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
	PHOTO_MAX_BYTES: 1024 * 1024, // 1MB
	PHOTO_MAX_PER_USER: 100,
	FAVICON_MAX_BYTES: 512 * 1024, // 512KB
	NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL ?? "Veenew <noreply@email.veenew.com>",
	// Comma-separated list of admin usernames (case-insensitive).
	ADMIN_USERNAMES: (process.env.ADMIN_USERNAMES ?? "")
		.split(",")
		.map((username) => username.trim().toLowerCase())
		.filter(Boolean),
	INVALID_HANDLES: [
		"administrator",
		"admin",
		"bot",
		"veenew",
		"hello",
		"hey",
		"hi",
		"demo",
		"test",
		"status",
		"analytics",
		"cabin",
		"cname",
	],
	// Analytics should be enabled only for the production env
	ANALYTICS_URL: IS_PROD ? process.env.ANALYTICS_URL : null,
};
