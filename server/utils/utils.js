const crypto = require("crypto");
const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const { URL } = require("url");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

const marked = require("./marked");

const config = require("../../config");
const PASSWORD_BCRYPT_ROUNDS = 12;

// String sanitizer initialization
const { window } = new JSDOM("");
const DOMPurify = createDOMPurify(window);

/**
 * Validates and returns a username if it meets the criteria.
 * @param {string} username - The username to validate
 * @returns {string} The validated username in lowercase
 * @throws {Error} If username is invalid, empty, or contains invalid characters
 */
const getValidUsername = (username) => {
	if (!username) return httpError(400, "Invalid username");
	if (config.INVALID_HANDLES.includes(username.toLowerCase())) return httpError(400, "Invalid username");
	const usernameRegex = /^([a-zA-Z0-9]){3,18}$/;
	if (!usernameRegex.test(username)) return httpError(400, "Invalid username. 3 - 18 alphanumeric chars.");
	return username.toLowerCase();
};

/**
 * Validates and returns an email address.
 * @param {string} email - The email address to validate
 * @returns {string} The validated email address
 * @throws {Error} If email is invalid or empty
 */
const getValidEmail = (email) => {
	if (!email) return httpError(400, "Empty email");
	if (!isValidEmail(email)) return httpError(400, "Invalid email");
	return email;
};

/**
 * Validates and returns a URL.
 * @param {string} url - The URL to validate
 * @returns {string} The validated URL
 * @throws {Error} If URL is invalid, empty, or exceeds 2000 characters
 */
const getValidURL = (url) => {
	if (!url) return httpError(400, "Empty URL");
	if (!isValidUrl(url) || url.length > 2000) return httpError(400, "Invalid URL");
	return url;
};

/**
 * Validates an email address format.
 * @param {string} email - The email address to validate
 * @returns {boolean} True if email is valid, false otherwise
 */
const isValidEmail = (email) => {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validates a URL format.
 * @param {string} url - The URL to validate
 * @returns {boolean} True if URL is valid and uses http/https protocol, false otherwise
 */
const isValidUrl = (url) => {
	try {
		const _url = new URL(url);
		return ["http:", "https:"].includes(_url.protocol) ? Boolean(_url) : false;
	} catch {
		return false;
	}
};

/**
 * Validates allowed menu link formats.
 * Allows relative links that start with "/" or absolute http/https URLs.
 * @param {string} link - Menu link to validate
 * @returns {boolean}
 */
const isValidMenuLink = (link) => {
	if (typeof link !== "string") return false;
	const trimmed = link.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith("/")) return true;
	return isValidUrl(trimmed);
};

/**
 * Sanitizes a string by removing HTML tags and attributes.
 * @param {string} str - The string to sanitize
 * @returns {string} The sanitized string
 */
const sanitizeString = (str) => {
	if (typeof str !== "string") return "";
	return DOMPurify.sanitize(str, { ADD_ATTR: ["rel", "target"] });
};

/**
 * Validates and sanitizes a string with min/max length requirements.
 * @param {string} str - The string to validate
 * @param {number} minLength - Minimum length required
 * @param {number} maxLength - Maximum length allowed
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string} The validated and sanitized string
 * @throws {Error} If string is invalid, empty, or doesn't meet length requirements
 */
const getValidString = (str, minLength, maxLength, fieldName = "Field") => {
	const trimmed = str?.trim();
	if (!trimmed) return httpError(400, `${fieldName} is required`);
	if (trimmed.length < minLength || trimmed.length > maxLength) {
		return httpError(400, `${fieldName} must be between ${minLength} and ${maxLength} characters`);
	}
	return sanitizeString(trimmed);
};

/**
 * Validates and normalizes user menu items.
 * Accepts either an array of objects or a JSON string of that array.
 * @param {unknown} rawMenu - Incoming menu payload
 * @returns {Array<{name: string, link: string}>}
 */
const getValidMenus = (rawMenu) => {
	let parsedMenu = rawMenu;

	if (!Array.isArray(parsedMenu)) return httpError(400, "Menu must be an array");
	if (parsedMenu.length > 20) return httpError(400, "Menu can have up to 20 items");

	const menu = [];
	for (const item of parsedMenu) {
		if (!item || typeof item !== "object") return httpError(400, "Each menu item must be an object");
		const name = getValidString(item.name, 1, 50, "Menu item name");
		const link = getValidString(item.link, 1, 500, "Menu item link");
		if (!isValidMenuLink(link)) {
			return httpError(400, "Menu item link must be a relative path or an http/https URL");
		}
		menu.push({ name, link });
	}

	return menu;
};

/**
 * Sanitizes and validates a post message.
 * @param {string} text - The post message to validate
 * @returns {string} The sanitized post message
 * @throws {Error} If text is empty or exceeds 10000 characters
 */
const getValidPost = (text) => {
	if (!text) httpError(400, "Empty post");
	if (text.length > 10000) httpError(400, "Post is too long. Max. 10000 chars");
	const sanitizedString = sanitizeString(text);
	if (!sanitizedString) httpError(400, "Empty post");
	return sanitizedString;
};

/**
 * Validates a page or post slug.
 * @param {string} slug - Slug to validate
 * @returns {string} Normalized slug
 */
const getValidSlug = (slug) => {
	const trimmedSlug = typeof slug === "string" ? slug.trim() : "";
	if (!trimmedSlug) return "";
	const value = getValidString(trimmedSlug, 1, 120, "Slug").toLowerCase();
	if (!/^[a-z0-9-]+$/.test(value)) {
		return httpError(400, "Slug can only contain letters, numbers, and hyphens");
	}
	if (value.startsWith("-") || value.endsWith("-")) {
		return httpError(400, "Slug cannot start or end with a hyphen");
	}
	return value;
};

/**
 * Whether a post is the user's home page, the page with an empty slug served at "/".
 * @param {Object} post - Post with type and slug
 * @returns {boolean}
 */
const isHomePage = (post) => post.type === "page" && !post.slug;

/**
 * Builds a URL slug from a title, e.g. "Hello, World!" becomes "hello-world".
 * @param {string} title - Post title
 * @returns {string} Slug, or "post" when the title has no usable characters
 */
const slugify = (title) =>
	String(title)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80)
		.replace(/-+$/, "") || "post";

/**
 * Returns the path of a post relative to its blog. Posts created before slugs existed
 * fall back to their id.
 * @param {Object} post - Post with slug and _id
 * @returns {string} Path such as "post/hello-world"
 */
const getPostPath = (post) => `post/${post.slug || post._id}`;

/**
 * Hashes a password reset token for storage. Tokens are 256-bit random values,
 * so a plain SHA-256 is enough and no app secret is involved.
 * @param {string} token - Raw reset token
 * @returns {string} Hex digest
 */
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Validates and hashes a password using bcrypt.
 * @param {string} password - The password to validate and hash
 * @returns {string} The hashed password
 * @throws {Error} If password is empty or less than 8 characters
 */
const getValidPassword = async (password) => {
	if (!password) return httpError(400, "Invalid password");
	if (password.length < 8) return httpError(400, "Password length should be at least 8 characters");
	return await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
};

/**
 * Verifies plaintext password against a bcrypt hash.
 * @param {string} plaintext - Plaintext password
 * @param {string} savedHash - Hash saved in DB
 * @returns {Promise<boolean>}
 */
const verifyPassword = async (plaintext, savedHash) => {
	if (!plaintext || !savedHash) return false;

	try {
		return await bcrypt.compare(plaintext, savedHash);
	} catch {
		return false;
	}
};

/**
 * Extracts unique hashtags from a text string.
 * @param {string} text - The text to scan for hashtags
 * @returns {string[]} Array of unique, lowercase hashtag strings without the "#" prefix
 */
const getHashtagsFromText = (text) => {
	if (typeof text !== "string") return [];
	// Remove markdown titles (lines starting with #, ##, ###, etc.)
	const textWithoutHeadings = text.replace(/^#{1,6}\s+.*$/gm, "");
	const matches = textWithoutHeadings.match(/\B#[a-zA-Z0-9]+/g) || [];
	return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
};

const BOOKMARK_TITLE_MAX = 160;
const BOOKMARK_NOTES_MAX = 640;

/**
 * Validates plain text for a bookmark field. Markdown is left as typed (it is never rendered)
 * and anything that looks like an HTML tag is stripped.
 * @param {string} value - Raw input
 * @param {number} maxLength - Maximum length allowed
 * @param {string} fieldName - Name of the field for error messages
 * @returns {string} Trimmed plain text, empty when the input is empty
 */
const getValidPlainText = (value, maxLength, fieldName) => {
	if (value === undefined || value === null) return "";
	if (typeof value !== "string") return httpError(400, `${fieldName} must be text`);
	const text = value.replace(/<\/?[a-z!][^>]*>/gi, "").trim();
	if (text.length > maxLength) return httpError(400, `${fieldName} must be at most ${maxLength} characters`);
	return text;
};

const getValidBookmarkTitle = (title) => getValidPlainText(title, BOOKMARK_TITLE_MAX, "Title");
const getValidBookmarkNotes = (notes) => getValidPlainText(notes, BOOKMARK_NOTES_MAX, "Notes");

const MICROBLOG_TEXT_MAX = 500;

/**
 * Validates the text of a microblog and extracts its hashtags.
 * @param {Object} body - Request body
 * @returns {{text: string, hashtags: string[]}} Validated plain text and its unique hashtags
 * @throws {Error} If the text is empty, not text or longer than the limit
 */
const getValidMicroblogFields = (body) => {
	const text = getValidPlainText(body.text, MICROBLOG_TEXT_MAX, "Microblog");
	if (!text) return httpError(400, "Microblog cannot be empty");
	return { text, hashtags: getHashtagsFromText(text) };
};

const GUESTBOOK_NAME_MAX = 80;
const GUESTBOOK_EMAIL_MAX = 254;
const GUESTBOOK_TEXT_MAX = 1000;

/**
 * Validates a guestbook submission from a visitor.
 * @param {Object} body - Request body
 * @returns {{name: string, email: string, text: string}} Validated plain text name and comment, and a lowercased email
 * @throws {Error} If a field is empty, not text, too long or the email is invalid
 */
const getValidGuestbookFields = (body) => {
	const name = getValidPlainText(body.name, GUESTBOOK_NAME_MAX, "Name");
	if (!name) return httpError(400, "Name is required");
	const text = getValidPlainText(body.text, GUESTBOOK_TEXT_MAX, "Comment");
	if (!text) return httpError(400, "Comment is required");
	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	if (email.length > GUESTBOOK_EMAIL_MAX) return httpError(400, "Invalid email");
	return { name, email: getValidEmail(email), text };
};

/**
 * Validates an email submitted through a subscription form.
 * @param {Object} body - Request body
 * @returns {string} The lowercased email
 * @throws {Error} If the email is missing, too long or invalid
 */
const getValidSubscriberEmail = (body) => {
	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	if (email.length > GUESTBOOK_EMAIL_MAX) return httpError(400, "Invalid email");
	return getValidEmail(email);
};

/**
 * Escapes text for safe use inside HTML content and attribute values.
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
const escapeHtml = (value) =>
	String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

/**
 * Detects the image type from the file's leading bytes. The client-supplied type is never trusted.
 * @param {Buffer} buffer - File contents
 * @returns {{contentType: string, extension: string}} Detected type
 * @throws {Error} If the file is not a JPEG, PNG, GIF or WebP image
 */
const getValidPhotoType = (buffer) => {
	let contentType;
	if (buffer.length > 12) {
		if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) contentType = "image/jpeg";
		else if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) contentType = "image/png";
		else if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("latin1"))) contentType = "image/gif";
		else if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") contentType = "image/webp";
	}
	if (!contentType) return httpError(400, "Only JPEG, PNG, GIF and WebP photos are supported");
	return { contentType, extension: PHOTO_TYPES[contentType] };
};

/**
 * Gets the S3 key a user's uploaded favicon is stored under.
 * @param {string} userId - Owner of the favicon
 * @returns {string} Object key such as "favicons/<userId>.png"
 */
const getFaviconKey = (userId) => `favicons/${userId}.png`;

/**
 * Checks that an uploaded favicon is a PNG, going by its leading bytes and never the client-supplied type.
 * @param {Buffer} buffer - File contents
 * @throws {Error} If the file is not a PNG image
 */
const assertFaviconIsPng = (buffer) => {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const isPng = buffer.length > 33 && buffer.subarray(0, 8).equals(signature) && buffer.subarray(12, 16).toString("latin1") === "IHDR";
	if (!isPng) return httpError(400, "Favicon must be a PNG image");
};

/**
 * Validates the fields of a bookmark request body.
 * @param {Object} body - Request body
 * @returns {Object} Validated url, title, notes, hashtags and isPrivate
 */
const getValidBookmarkFields = (body) => {
	const notes = getValidBookmarkNotes(body.notes);
	return {
		url: getValidURL(typeof body.url === "string" ? body.url.trim() : ""),
		title: getValidBookmarkTitle(body.title),
		notes,
		hashtags: getHashtagsFromText(notes),
		isPrivate: body.isPrivate === true || body.isPrivate === "true",
	};
};

/**
 * Whether an IP address is loopback, private, link-local or otherwise not publicly routable.
 * @param {string} address - IPv4 or IPv6 address
 * @returns {boolean}
 */
const isPrivateIp = (address) => {
	if (net.isIPv4(address)) {
		const [a, b] = address.split(".").map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			a >= 224
		);
	}
	const ip = address.toLowerCase();
	if (ip.startsWith("::ffff:")) return isPrivateIp(ip.slice(7));
	return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
};

// DNS lookup that refuses private addresses, so page fetches cannot reach internal services
// (this also covers redirects, since every connection resolves through it).
const publicOnlyLookup = (hostname, options, callback) => {
	dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) return callback(error);
		const allowed = addresses.filter(({ address }) => !isPrivateIp(address));
		if (allowed.length === 0) return callback(new Error("Address is not allowed"));
		if (options?.all) return callback(null, allowed);
		callback(null, allowed[0].address, allowed[0].family);
	});
};

/**
 * Fetches the title of a web page. Never throws; returns an empty string when the page
 * cannot be fetched or has no title.
 * @param {string} url - http/https URL of the page
 * @returns {Promise<string>} Plain text title, at most 160 characters
 */
const fetchPageTitle = async (url) => {
	try {
		const response = await axios.get(url, {
			timeout: 5000,
			maxRedirects: 3,
			maxContentLength: 1024 * 1024,
			maxBodyLength: 1024 * 1024,
			responseType: "text",
			headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; VeenewBot/1.0)" },
			httpAgent: new http.Agent({ lookup: publicOnlyLookup }),
			httpsAgent: new https.Agent({ lookup: publicOnlyLookup }),
		});
		if (!String(response.headers["content-type"] || "").includes("html")) return "";
		const { document } = new JSDOM(String(response.data)).window;
		const title = document.querySelector("title")?.textContent || "";
		return title.replace(/\s+/g, " ").trim().slice(0, BOOKMARK_TITLE_MAX);
	} catch {
		return "";
	}
};

/**
 * Converts markdown content into HTML.
 * @param {string} markdown - The markdown input to convert
 * @returns {string} HTML output
 */
const markdownToHtml = (markdown = "") => {
	let htmlText = markdown;
	htmlText = htmlText
		.replace(/\r\n/g, "\n") // Windows → Unix
		.replace(/\n{2,}/g, "\n\n") // collapse 3+ newlines to 2
		.trim();
	if (!htmlText) return "";

	if (!htmlText.includes("\n")) {
		// Single line → inline parsing (no <p>, no <br/>)
		htmlText = marked.parseInline(htmlText);
	} else {
		// Multi-line
		htmlText = marked.parse(htmlText);
	}

	return sanitizeString(htmlText);
};

const getUserBaseUrl = (user) => {
	if (!user?.username) return httpError(400, "Invalid user");

	// Prefer the user's verified custom domain when one is configured.
	if (user.domain) return `https://${user.domain}/`;

	return `http${config.IS_PROD ? "s" : ""}://${user.username}.${config.DOMAIN}/`;
};

/**
 * Validates and normalizes a user's custom domain (a bare hostname).
 * Accepts values with an optional protocol/port/path and strips them.
 * @param {string} domain - The custom domain to validate
 * @returns {string} The normalized, lowercase hostname
 * @throws {Error} If the domain is empty, malformed, or points at the base domain
 */
const getValidDomain = (domain) => {
	if (!domain) return httpError(400, "Empty domain");

	// Strip anything the user may have pasted around the bare hostname.
	const value = String(domain)
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "")
		.replace(/:\d+$/, "");

	if (value.length > 253) return httpError(400, "Domain is too long");

	// Requires at least two dot-separated labels; no leading/trailing hyphens.
	const DOMAIN_REGEX = /^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
	if (!DOMAIN_REGEX.test(value)) return httpError(400, "Invalid domain");

	const baseDomain = config.DOMAIN.split(":")[0].toLowerCase();
	if (value === baseDomain || value.endsWith(`.${baseDomain}`)) {
		return httpError(400, `Domain cannot be a ${baseDomain} address`);
	}

	return value;
};

/**
 * Returns the IANA timezone if valid, otherwise null.
 * @param {string} timezone - Candidate IANA timezone (e.g., "America/Toronto")
 * @returns {string|null} The timezone, or null when missing or invalid
 */
const getValidTimezone = (timezone) => {
	if (typeof timezone !== "string" || !timezone) return null;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: timezone });
		return timezone;
	} catch {
		return null;
	}
};

/**
 * Converts a date to its calendar date (YYYY-MM-DD) in the given timezone, UTC by default.
 * @param {Date|string|number} dateValue - Date value to convert
 * @param {string} [timezone] - Optional IANA timezone (e.g., "America/Toronto")
 * @returns {string} Calendar date as YYYY-MM-DD
 */
const toDateString = (dateValue, timezone) =>
	new Intl.DateTimeFormat("en-CA", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		timeZone: getValidTimezone(timezone) || "UTC",
	}).format(dateValue);

/**
 * Validates a user-supplied published date (YYYY-MM-DD).
 * @param {string} value - Candidate calendar date
 * @returns {string|null} The date, or null when empty
 */
const getValidPublishedDate = (value) => {
	if (value === undefined || value === null || value === "") return null;
	const isValid =
		typeof value === "string" &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
	if (!isValid) return httpError(400, "Invalid published date");
	return value;
};

const RELATIVE_TIME_UNITS = [
	["year", 365 * 24 * 60 * 60],
	["month", 30 * 24 * 60 * 60],
	["week", 7 * 24 * 60 * 60],
	["day", 24 * 60 * 60],
	["hour", 60 * 60],
	["minute", 60],
];

/**
 * Describes how long ago a date was, e.g. "just now", "5 minutes ago" or "2 days ago".
 * @param {Date|string|number} date - The past date
 * @param {Date|number} [now] - The reference time, defaults to the current time
 * @returns {string} Relative time in English
 */
const getRelativeTime = (date, now = Date.now()) => {
	const seconds = Math.floor((new Date(now) - new Date(date)) / 1000);
	for (const [unit, size] of RELATIVE_TIME_UNITS) {
		if (seconds >= size) {
			const count = Math.floor(seconds / size);
			return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
		}
	}
	return "just now";
};

/**
 * Returns the calendar date (YYYY-MM-DD) a post is published on. Posts created before
 * publishedDate existed fall back to their creation date in the author's timezone.
 * @param {Object} post - Post with publishedDate, createdOn and timezone
 * @returns {string} Calendar date as YYYY-MM-DD
 */
const getPostDate = (post) => post.publishedDate || toDateString(post.createdOn, post.timezone);

/**
 * Formats a YYYY-MM-DD calendar date as: "August 12, 2012".
 * @param {string} dateString - Calendar date as YYYY-MM-DD
 * @returns {string} Formatted date string
 */
const formatPostDate = (dateString) =>
	new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${dateString}T00:00:00Z`));

/**
 * Available blog themes. Each key maps to /themes/<key>.css served from assets.
 * The empty key is the default (no theme stylesheet, base styles only).
 */
const THEMES = [
	{ key: "", label: "Default" },
	{ key: "sepia", label: "Sepia" },
	{ key: "dark", label: "Dark" },
	{ key: "nocturne", label: "Nocturne" },
	{ key: "forest", label: "Forest" },
	{ key: "mono", label: "Mono" },
	{ key: "scribble", label: "Scribble" },
];

const THEME_KEYS = THEMES.map((theme) => theme.key);

/**
 * Validates a theme key against the whitelist.
 * @param {string} theme - Theme key from user settings
 * @returns {string} The theme key when valid, otherwise "" (default)
 */
const getValidTheme = (theme) => (THEME_KEYS.includes(theme) ? theme : "");

/**
 * Builds a stylesheet link tag for the selected theme.
 * @param {string} theme - Theme key from user settings
 * @returns {string|undefined} Link tag string for a valid non-default theme, otherwise undefined
 */
const getThemeStyleTag = (theme) => {
	const validTheme = getValidTheme(theme);
	if (!validTheme) return undefined;
	return `<link href="/themes/${validTheme}.css" rel="stylesheet" />`;
};

/**
 * Wraps custom CSS in a style tag for HTML injection.
 * @param {string} customStyle - Raw CSS string from user settings
 * @returns {string|undefined} Style tag string when customStyle is provided, otherwise undefined
 */
const getCustomStyleTag = (customStyle) => {
	if (!customStyle) return undefined;
	return `<style>${customStyle}</style>`;
};

/**
 * Creates an error object with HTTP status code and message.
 * @param {number} code - HTTP error code
 * @param {string} message - HTTP error message
 * @returns {Error} Error object with httpErrorCode property
 * @throws {Error} The created error object
 */
const httpError = (code, message) => {
	code = code ? code : 500;
	message = message ? message : "Something went wrong";
	const errorObject = new Error(message);
	errorObject.httpErrorCode = code;
	throw errorObject;
};

/**
 * Checks whether the given user is a configured admin.
 * @param {Object} user - The user object (expects a `username`).
 * @returns {boolean} True when the user's username is in config.ADMIN_USERNAMES.
 */
const isAdmin = (user) => {
	if (!user?.username) return false;
	return config.ADMIN_USERNAMES.includes(user.username.toLowerCase());
};

module.exports = {
	getValidUsername,
	getValidEmail,
	getValidString,
	getValidMenus,
	getValidPost,
	getValidSlug,
	slugify,
	isHomePage,
	getPostPath,
	hashResetToken,
	getValidPassword,
	verifyPassword,
	getHashtagsFromText,
	getValidBookmarkFields,
	getValidMicroblogFields,
	getValidGuestbookFields,
	getValidSubscriberEmail,
	escapeHtml,
	fetchPageTitle,
	getValidPhotoType,
	assertFaviconIsPng,
	getFaviconKey,
	markdownToHtml,
	getUserBaseUrl,
	getValidDomain,

	formatPostDate,
	toDateString,
	getValidPublishedDate,
	getPostDate,
	getRelativeTime,
	getValidTimezone,
	THEMES,
	getValidTheme,
	getThemeStyleTag,
	getCustomStyleTag,
	httpError,
	isAdmin,
};
