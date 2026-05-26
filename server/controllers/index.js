const randomString = require("randomstring");
const uuid = require("uuid").v4;

const utils = require("../utils");
const {
	followRemoteUser,
	unfollowRemoteUser,
	broadcastPostCreate,
	broadcastPostUpdate,
	broadcastPostDelete,
} = require("../federation");
const { createStripePremiumCheckout, confirmStripePremiumCheckout, stripeWebhook } = require("./stripe");

const { Users, Posts } = require("../model").getInstance();

const ensureUniquePageSlug = async (userId, slug, excludeId = null) => {
	const query = { user: userId, type: "page", slug };
	if (excludeId) query._id = { $ne: excludeId };
	const existingPage = await Posts.findOne(query).select("_id").lean().exec();
	if (existingPage) return utils.httpError(400, "Slug is already used by another page");
};

const signUp = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);
		await utils.isNewUsername(username);
		const email = utils.getValidEmail(req.body.email);
		await utils.isNewEmail(email);
		const password = await utils.getValidPassword(req.body.password);
		const userAgent = req.get("user-agent");
		const date = new Date();

		const emailVerificationCode = uuid();
		const token = uuid();

		await new Users({
			username,
			email,
			password,
			emailVerificationCode,
			devices: [{ token, userAgent }],
			createdOn: date,
		}).save();
		req.session.token = token;

		res.json({
			message: "Account created. Please verify your email.",
			username,
		});

		utils.verificationEmail(username, email, emailVerificationCode);
	} catch (error) {
		next(error);
	}
};

const logIn = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);
		const user = await Users.findOne({
			username: { $regex: new RegExp(`^${username}$`, "i") },
		}).exec();

		if (!user) return utils.httpError(400, "Invalid user credentials");
		const { matched, needsUpgrade } = await utils.verifyPassword(req.body.password, user.password);
		if (!matched) return utils.httpError(400, "Invalid user credentials");

		const userAgent = req.get("user-agent");

		const token = uuid();
		const devices = { token, userAgent };

		const setFields = { lastLoginAt: new Date() };
		if (needsUpgrade) setFields.password = await utils.getValidPassword(req.body.password);

		await Users.updateOne({ _id: user._id }, { $push: { devices }, $set: setFields });

		req.session.token = token;
		res.json({ message: "Logged in", username: user.username });

		try {
			if (user.deletionDate) {
				await Promise.all([
					Users.updateOne({ _id: user._id }, { $unset: { deletionDate: 1 } }),
					Posts.updateOne({ user: user._id }, { $unset: { deletionDate: 1 } }),
				]);
			}
		} catch (err) {}
	} catch (error) {
		next(error);
	}
};

const verifyEmail = async (req, res, next) => {
	try {
		const code = req.params.code;

		const user = await Users.findOne({ emailVerificationCode: code }).exec();
		if (!user) return res.status(400).send("Invalid email verification code");

		await Users.updateOne({ _id: user._id }, { $unset: { emailVerificationCode: 1 }, lastUpdatedAt: new Date() });

		res.send("Email verified");
	} catch (error) {
		next(error);
	}
};

const resetPassword = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);

		const user = await Users.findOne({ username }).exec();
		if (!user) return utils.httpError(400, "Invalid username");

		const passwordString = randomString.generate(8);
		const password = await utils.getValidPassword(passwordString);

		await Users.updateOne({ _id: user._id }, { password, lastUpdatedOn: new Date() });
		await utils.resetPasswordEmail(user.username, user.email, passwordString);

		res.json({ message: "Password resetted" });
	} catch (error) {
		next(error);
	}
};

const resendEmailVerification = async (req, res, next) => {
	try {
		const { username, email, emailVerificationCode } = req.user;
		if (!emailVerificationCode) return utils.httpError(400, "Email has beed already verified");

		utils.verificationEmail(username, email, emailVerificationCode);

		res.json({ message: "Re-sent verification email." });
	} catch (error) {
		next(error);
	}
};

const updateAccount = async (req, res, next) => {
	try {
		const email =
			req.body.email && req.body.email !== req.user.email ? await utils.getValidEmail(req.body.email) : null;
		if (email) await utils.isNewEmail(email, req.user._id);

		const password = req.body.password ? await utils.getValidPassword(req.body.password) : null;

		const name = req.body.name ? await utils.getValidString(req.body.name, 1, 50, "Name") : null;
		const bio = req.body.bio ? await utils.getValidString(req.body.bio, 1, 640, "Bio") : null;
		const nav = req.body.nav ? await utils.getValidString(req.body.nav, 1, 640, "Top nav") : null;

		const iconUrl = req.body.iconUrl ? await utils.getValidString(req.body.iconUrl, 1, 800, "Favicon URL") : null;

		const customStyle = req.body.customStyle
			? await utils.getValidString(req.body.customStyle, 1, 5000, "Custom Style")
			: null;
		const rawMenu = req.body.menu;

		const updateFields = {};
		if (email && email !== req.user.email) {
			const emailVerificationCode = uuid();
			updateFields["email"] = email;
			updateFields["emailVerificationCode"] = emailVerificationCode;
			await utils.verificationEmail(req.user.username, email, emailVerificationCode);
		}
		if (password) updateFields["password"] = password;

		updateFields["name"] = name;
		updateFields["iconUrl"] = iconUrl;

		if (bio) {
			updateFields["bio"] = bio;
			updateFields["bioHTML"] = utils.markdownToHtml(bio);
		} else {
			updateFields["bio"] = "";
			updateFields["bioHTML"] = "";
		}

		if (nav) {
			updateFields["nav"] = nav;
			updateFields["navHTML"] = utils.markdownToHtml(nav);
		} else {
			updateFields["nav"] = "";
			updateFields["navHTML"] = "";
		}

		if (typeof rawMenu !== "undefined") {
			updateFields["menu"] = utils.getValidMenus(rawMenu);
		}

		updateFields["customStyle"] = customStyle;

		if (req.user.usertype !== "free") {
			const domain = req.body.domain ? await utils.getValidString(req.body.domain, 1, 100, "Domain") : null;
			const customScriptUrl = req.body.customScriptUrl
				? await utils.getValidString(req.body.customScriptUrl, 1, 500, "Custom Script URL")
				: null;

			updateFields["domain"] = domain;
			updateFields["customScriptUrl"] = customScriptUrl;
		}

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastUpdatedOn: new Date() });
		res.json({
			message: `Account updated. ${updateFields["emailVerificationCode"] ? "Please verify your email" : ""}`,
		});
	} catch (error) {
		next(error);
	}
};

const deleteAccount = async (req, res, next) => {
	try {
		await utils.accountDeletionEmail(req.user.username, req.user.email);

		const deletionDate = new Date(new Date().setDate(new Date().getDate() + 7));
		await Promise.all([
			Users.updateOne({ _id: req.user._id }, { deletionDate: deletionDate }),
			Posts.updateOne({ user: req.user._id }, { deletionDate: deletionDate }),
		]);

		return res.json({ message: "Your account will be deleted in 7 days." });
	} catch (error) {
		next(error);
	}
};

const logOut = async (req, res, next) => {
	try {
		await Users.updateOne({ _id: req.user._id }, { $pull: { devices: { token: req.token } } });
		req.session.destroy();
		res.json({ message: "Logged out" });
	} catch (error) {
		next(error);
	}
};

const createPost = async (req, res, next) => {
	try {
		if (req.user.emailVerificationCode) {
			return utils.httpError(400, "Please verify your email.");
		}

		const type = req.body.type === "page" ? "page" : "post";
		const text = utils.getValidPost(req.body.text);
		const html = utils.markdownToHtml(text);
		const postData = {
			user: req.user._id,
			type,
			text,
			html,
			hashtags: type === "post" ? utils.getHashtagsFromText(text) : [],
			createdOn: new Date(),
		};

		if (type === "page") {
			const slug = utils.getValidSlug(req.body.slug);
			await ensureUniquePageSlug(req.user._id, slug);
			postData.slug = slug;
		}

		const post = await new Posts(postData).save();
		res.json({ message: type === "page" ? "Page created" : "Post created", post });

		if (type === "post") {
			broadcastPostCreate(req.user, post.toObject ? post.toObject() : post).catch((err) =>
				console.error("Federation broadcast (create) failed:", err.message)
			);
			Users.updateOne({ _id: req.user._id }, { $set: { lastPostedOn: post.createdOn } }).catch((err) =>
				console.error(err)
			);
		}
	} catch (error) {
		next(error);
	}
};

const updatePost = async (req, res, next) => {
	try {
		const post = await Posts.findOne({ _id: req.params.id, user: req.user._id }).exec();
		if (!post) return utils.httpError(404, "Post not found");

		const updateFields = {};

		const type = post.type || "post";
		const text = utils.getValidPost(req.body.text);
		updateFields["text"] = text;
		updateFields["html"] = utils.markdownToHtml(text);
		updateFields["hashtags"] = type === "post" ? utils.getHashtagsFromText(text) : [];
		if (type === "page") {
			const slug = utils.getValidSlug(req.body.slug);
			await ensureUniquePageSlug(req.user._id, slug, post._id);
			updateFields["slug"] = slug;
		}

		updateFields["updatedOn"] = new Date();
		await Posts.updateOne({ _id: post._id }, updateFields);

		res.json({ message: type === "page" ? "Page updated" : "Post updated" });

		if (type === "post") {
			const merged = { ...post.toObject(), ...updateFields };
			broadcastPostUpdate(req.user, merged).catch((err) =>
				console.error("Federation broadcast (update) failed:", err.message)
			);
		}
	} catch (error) {
		next(error);
	}
};

const deletePost = async (req, res, next) => {
	try {
		const post = await Posts.findOneAndDelete({ _id: req.params.id, user: req.user._id }).exec();
		if (!post) return utils.httpError(404, "Post not found");

		res.json({ message: "Post deleted" });

		if (post.type === "post") {
			broadcastPostDelete(req.user, post._id).catch((err) =>
				console.error("Federation broadcast (delete) failed:", err.message)
			);
		}
	} catch (error) {
		next(error);
	}
};

const createPage = async (req, res, next) => {
	req.body.type = "page";
	return createPost(req, res, next);
};

const updatePage = async (req, res, next) => {
	try {
		const page = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "page" }).exec();
		if (!page) return utils.httpError(404, "Page not found");
		req.body.type = "page";
		return updatePost(req, res, next);
	} catch (error) {
		next(error);
	}
};

const deletePage = async (req, res, next) => {
	try {
		const page = await Posts.findOneAndDelete({ _id: req.params.id, user: req.user._id, type: "page" }).exec();
		if (!page) return utils.httpError(404, "Page not found");
		res.json({ message: "Page deleted" });
	} catch (error) {
		next(error);
	}
};

const followUser = async (req, res, next) => {
	try {
		const handle = (req.body.handle || "").trim();
		if (!handle) return utils.httpError(400, "Handle is required");

		const result = await followRemoteUser(req.user, handle);
		res.json({
			message: `Following ${result.remoteUser.handle || result.remoteUser.actorUrl}. Ingested ${result.postsIngested} recent posts.`,
			remoteUser: {
				_id: result.remoteUser._id,
				handle: result.remoteUser.handle,
				name: result.remoteUser.name,
				actorUrl: result.remoteUser.actorUrl,
			},
		});
	} catch (error) {
		if (!error.httpErrorCode) {
			error.httpErrorCode = 400;
			error.message = error.message || "Could not follow user";
		}
		next(error);
	}
};

const unfollowUser = async (req, res, next) => {
	try {
		const remoteUserId = req.params.id;
		await unfollowRemoteUser(req.user, remoteUserId);
		res.json({ message: "Unfollowed" });
	} catch (error) {
		if (!error.httpErrorCode) {
			error.httpErrorCode = 400;
			error.message = error.message || "Could not unfollow";
		}
		next(error);
	}
};

module.exports = {
	signUp,
	logIn,
	verifyEmail,
	resetPassword,
	resendEmailVerification,
	updateAccount,
	logOut,
	deleteAccount,
	createPost,
	updatePost,
	deletePost,
	createPage,
	updatePage,
	deletePage,
	createStripePremiumCheckout,
	confirmStripePremiumCheckout,
	followUser,
	unfollowUser,
};
