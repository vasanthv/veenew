const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { URL } = require("url");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

const marked = require("./marked");

const config = require("../../config");
const PASSWORD_BCRYPT_ROUNDS = 12;
const BLOCKED_PAGE_SLUGS = new Set(["blog", "post", "tags", "feed"]);

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
	} catch (e) {
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
 * Validates a page slug.
 * @param {string} slug - Slug to validate
 * @returns {string} Normalized slug
 */
const getValidSlug = (slug) => {
	const trimmedSlug = typeof slug === "string" ? slug.trim() : "";
	if (!trimmedSlug) return "";
	const value = getValidString(trimmedSlug, 1, 120, "Slug").toLowerCase();
	if (!/^[a-z0-9-]+$/.test(value)) {
		return httpError(400, "Slug can only contain lowercase letters, numbers, and hyphens");
	}
	if (value.startsWith("-") || value.endsWith("-")) {
		return httpError(400, "Slug cannot start or end with a hyphen");
	}
	if (BLOCKED_PAGE_SLUGS.has(value)) {
		return httpError(400, "Slug is reserved");
	}
	return value;
};

/**
 * Creates a SHA-256 hash of a string using the app secret.
 * @param {string} str - The string to hash
 * @returns {string} The hashed string in hexadecimal format
 */
const hashString = (str) => {
	return crypto
		.createHash("sha256")
		.update(str + config.SECRET)
		.digest("hex");
};

/**
 * Returns true if the given hash matches the legacy SHA-256 format.
 * @param {string} hash - Persisted password hash
 * @returns {boolean}
 */
const isLegacyPasswordHash = (hash) => {
	return typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash);
};

/**
 * Validates and hashes a password using bcrypt.
 * @param {string} password - The password to validate and hash
 * @returns {string} The hashed password
 * @throws {Error} If password is empty or less than 8 characters
 */
const getValidPassword = async (password) => {
	if (!password) return httpError(400, "Invalid password");
	if (password.length < 8) return httpError(400, "Password length should be atleast 8 characters");
	return await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
};

/**
 * Verifies plaintext password against bcrypt hash, with legacy SHA-256 fallback.
 * @param {string} plaintext - Plaintext password
 * @param {string} savedHash - Hash saved in DB
 * @returns {Promise<{matched: boolean, needsUpgrade: boolean}>}
 */
const verifyPassword = async (plaintext, savedHash) => {
	if (!plaintext || !savedHash) return { matched: false, needsUpgrade: false };

	if (isLegacyPasswordHash(savedHash)) {
		const matched = hashString(plaintext) === savedHash;
		return { matched, needsUpgrade: matched };
	}

	try {
		const matched = await bcrypt.compare(plaintext, savedHash);
		return { matched, needsUpgrade: false };
	} catch (error) {
		return { matched: false, needsUpgrade: false };
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
	const matches = textWithoutHeadings.match(/\B#[a-zA-Z0-9_]+/g) || [];
	return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
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

/**
 * Extracts a title from the first line of markdown text.
 * @param {string} str - Raw markdown content.
 * @returns {string} First-line title with heading/link syntax stripped.
 */
const getTitle = (str) => {
	const firstLine = str
		.split(/\r?\n/)[0]
		.replace(/^#{1,6}\s*/, "")
		.trim();
	const markdownLinkMatch = firstLine.match(/^\[([^\]]+)\]\(([^)\s]+(?:\s+"[^"]*")?)\)$/);
	return markdownLinkMatch ? markdownLinkMatch[1].trim() : firstLine;
};

const getUserBaseUrl = (user) => {
	if (!user?.username) return httpError(400, "Invalid user");

	return `http${config.IS_PROD ? "s" : ""}://${user.username}.${config.DOMAIN}/`;
};

/**
 * Formats a date as: "wed aug 12 2012 02:09PM".
 * Uses the supplied IANA timezone if provided.
 * @param {Date|string|number} dateValue - Date value to format
 * @param {string} timezone - Optional IANA timezone (e.g., "America/Toronto")
 * @returns {string} Formatted date string
 */
const formatPostDate = (dateValue, timezone) => {
	const formatOptions = {
		weekday: "short",
		month: "short",
		day: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	};
	if (timezone) formatOptions.timeZone = timezone;

	const parts = new Intl.DateTimeFormat("en-US", formatOptions).formatToParts(dateValue);
	const get = (type) => parts.find((part) => part.type === type)?.value || "";
	return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get("minute")}${get("dayPeriod").toUpperCase()}`;
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

module.exports = {
	getValidUsername,
	getValidEmail,
	getValidURL,
	isValidEmail,
	isValidUrl,
	isValidMenuLink,
	sanitizeString,
	getValidString,
	getValidMenus,
	getValidPost,
	getValidSlug,
	hashString,
	isLegacyPasswordHash,
	getValidPassword,
	verifyPassword,
	getHashtagsFromText,
	markdownToHtml,
	getTitle,
	getUserBaseUrl,

	formatPostDate,
	getCustomStyleTag,
	httpError,
};
