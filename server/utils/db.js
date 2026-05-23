const { httpError } = require("./utils");
const config = require("../../config");

const { Users, Items, Channels, Posts } = require("../model").getInstance();

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

module.exports = {
	isNewUsername,
	isNewEmail,
	getUserByUsername,
	getPagedPosts,
	getPagedUsers,
};
