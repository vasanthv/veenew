const { httpError } = require("./utils");
const config = require("../../config");

const { Users, Posts } = require("../model").getInstance();

/**
 * Checks if a username is available for registration or update.
 * @param {string} username - The username to check
 * @param {string} [currentUserId] - Optional ID of the current channel (for updates)
 * @returns {Promise<string>} The username if available
 * @throws {Error} If username is already taken
 */
const isNewUsername = async (username, currentUserId) => {
	let query = { username: { $regex: new RegExp(`^${username}$`, "i") } };
	if (currentUserId) {
		query["_id"] = { $ne: currentUserId };
	}

	const existingUsername = await Users.findOne(query).select("username").exec();
	return existingUsername ? httpError(400, "Username already taken") : username;
};

/**
 * Checks if an email address is available for registration or update.
 * @param {string} email - The email address to check
 * @param {string} [currentUserId] - Optional ID of the current user (for updates)
 * @returns {Promise<string>} The email if available
 * @throws {Error} If email is already taken
 */
const isNewEmail = async (email, currentUserId) => {
	let query = { email: { $regex: new RegExp(`^${email}$`, "i") } };
	if (currentUserId) {
		query["_id"] = { $ne: currentUserId };
	}

	const existingEmail = await Users.findOne(query).select("email").exec();
	return existingEmail ? httpError(400, "Email already taken") : email;
};

/**
 * Checks if a custom domain is available for a user.
 * @param {string} domain - The normalized domain to check
 * @param {string} [currentUserId] - Optional ID of the current user (for updates)
 * @returns {Promise<string>} The domain if available
 * @throws {Error} If the domain is already claimed by another user
 */
const isNewDomain = async (domain, currentUserId) => {
	let query = { domain };
	if (currentUserId) {
		query["_id"] = { $ne: currentUserId };
	}

	const existingDomain = await Users.findOne(query).select("domain").exec();
	return existingDomain ? httpError(400, "Domain already taken") : domain;
};

/**
 * Resolves which account (if any) owns a request hostname.
 *
 * This is the single source of truth for host routing. Both the request
 * middleware and Caddy's on-demand TLS check use it, so a certificate is never
 * issued for a hostname the app would refuse to serve.
 *
 * @param {string} hostname - The request hostname
 * @returns {Promise<{type: "base"|"user"|"unknown", user?: Object}>}
 */
const getHostOwner = async (hostname) => {
	const host = (hostname || "").toLowerCase();
	const baseDomain = config.DOMAIN.split(":")[0].toLowerCase();

	if (!host) return { type: "unknown" };
	if (host === baseDomain || host === `www.${baseDomain}`) return { type: "base" };

	const domainSuffix = `.${baseDomain}`;
	if (host.endsWith(domainSuffix)) {
		// A subdomain of the base domain maps to a username handle.
		const subdomain = host.slice(0, -domainSuffix.length);
		if (!subdomain || subdomain.includes(".")) return { type: "unknown" };
		if (!/^([a-zA-Z0-9]){3,18}$/.test(subdomain) || config.INVALID_HANDLES.includes(subdomain)) {
			return { type: "unknown" };
		}
		const user = await Users.findOne({ username: subdomain }).select("username").lean().exec();
		return user ? { type: "user", user } : { type: "unknown" };
	}

	// Any other host is a user's custom domain. Also match the apex/`www.`
	// counterpart so a single CNAME serves both variants.
	const bareHost = host.startsWith("www.") ? host.slice(4) : host;
	const user = await Users.findOne({ domain: { $in: [host, bareHost] } })
		.select("username")
		.lean()
		.exec();
	return user ? { type: "user", user } : { type: "unknown" };
};

/**
 * Retrieves a user by their username.
 * @param {string} username - The username to search for
 * @returns {Promise<Object|null>} The user object if found, null otherwise
 */
const getUserByUsername = async (username) => {
	let query = { username: { $regex: new RegExp(`^${username}$`, "i") } };

	return await Users.findOne(query).lean().exec();
};

/**
 * Retrieves paginated posts and page metadata for a request.
 * @param {Object} req - The request object containing query params
 * @param {Object} query - Mongo query to execute on Posts collection
 * @param {string} [sortBy] - Sort string passed to Mongoose
 * @returns {Promise<Object>} Pagination details and posts list
 */
const getPagedPosts = async (req, query, sortBy = "-createdOn") => {
	const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
	const limit = config.PAGE_LIMIT;
	const skip = (page - 1) * limit;
	const [posts, totalPosts] = await Promise.all([
		Posts.find(query).sort(sortBy).skip(skip).limit(limit).populate("user", "username").lean().exec(),
		Posts.countDocuments(query),
	]);
	const totalPages = Math.max(1, Math.ceil(totalPosts / limit));

	return {
		posts,
		page,
		totalPages,
		prevPage: page > 1 ? page - 1 : 0,
		nextPage: page < totalPages ? page + 1 : 0,
		queryParams: req.query,
	};
};

/**
 * Retrieves paginated users and page metadata for a request.
 * @param {Object} req - The request object containing query params
 * @param {Object} query - Mongo query to execute on Users collection
 * @param {string} [sortBy] - Sort string passed to Mongoose
 * @returns {Promise<Object>} Pagination details and users list
 */
const getPagedUsers = async (req, query, sortBy = "-createdOn") => {
	const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
	const limit = config.PAGE_LIMIT;
	const skip = (page - 1) * limit;
	const [users, totalUsers] = await Promise.all([
		Users.find(query).sort(sortBy).skip(skip).limit(limit).lean().exec(),
		Users.countDocuments(query),
	]);
	const totalPages = Math.max(1, Math.ceil(totalUsers / limit));

	return {
		users,
		page,
		totalPages,
		prevPage: page > 1 ? page - 1 : 0,
		nextPage: page < totalPages ? page + 1 : 0,
		queryParams: req.query,
	};
};

/**
 * Builds consistent pagination metadata for list pages.
 * @param {Object} req - Express request object
 * @param {number} totalItems - Total number of items
 * @returns {{page: number, totalPages: number, prevPage: number, nextPage: number, queryParams: Object, limit: number, skip: number}}
 */
const getPaginationMeta = (req, totalItems) => {
	const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
	const limit = config.PAGE_LIMIT;
	const totalPages = Math.max(1, Math.ceil(totalItems / limit));
	const page = Math.min(requestedPage, totalPages);
	const skip = (page - 1) * limit;
	return {
		page,
		totalPages,
		prevPage: page > 1 ? page - 1 : 0,
		nextPage: page < totalPages ? page + 1 : 0,
		queryParams: req.query,
		limit,
		skip,
	};
};

module.exports = {
	isNewUsername,
	isNewEmail,
	isNewDomain,
	getHostOwner,
	getUserByUsername,
	getPagedPosts,
	getPagedUsers,
};
