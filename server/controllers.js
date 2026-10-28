const crypto = require("crypto");
const mongoose = require("mongoose");
const uuid = require("uuid").v4;

const utils = require("./utils");
const s3 = require("./utils/s3");
const config = require("../config");
const constants = require("./constants");
const { Users, Posts, Bookmarks, Photos, Microblogs, GuestbookEntries, Subscribers } = require("./model").getInstance();

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

		const user = await new Users({
			username,
			email,
			password,
			emailVerificationCode,
			devices: [{ token, userAgent }],
			createdOn: date,
		}).save();
		await utils.createStarterContent(user._id);
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
		const matched = await utils.verifyPassword(req.body.password, user.password);
		if (!matched) return utils.httpError(400, "Invalid user credentials");

		const userAgent = req.get("user-agent");

		const token = uuid();
		const devices = { token, userAgent };

		await Users.updateOne({ _id: user._id }, { $push: { devices }, $set: { lastLoginOn: new Date() } });

		req.session.token = token;
		res.json({ message: "Logged in", username: user.username });

		try {
			if (user.deletionDate) await Users.updateOne({ _id: user._id }, { $unset: { deletionDate: 1 } });
		} catch {
			// Best-effort undelete; a failure here must not fail the login.
		}
	} catch (error) {
		next(error);
	}
};

const verifyEmail = async (req, res, next) => {
	try {
		const code = req.params.code;

		const user = await Users.findOne({ emailVerificationCode: code }).exec();
		if (!user) return utils.httpError(400, "Invalid email verification code");

		await Users.updateOne({ _id: user._id }, { $unset: { emailVerificationCode: 1 }, updatedOn: new Date() });

		res.json({ message: "Email verified" });
	} catch (error) {
		next(error);
	}
};

/**
 * Starts a password reset by emailing a single-use link. The response is identical whether
 * or not the account exists, so usernames can't be probed. Only a hash of the token is stored.
 */
const resetPassword = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);

		const user = await Users.findOne({ username }).exec();
		const lastIssuedAt = user?.passwordResetExpires ? user.passwordResetExpires - constants.PASSWORD_RESET_TTL_MS : 0;
		if (user && Date.now() - lastIssuedAt > constants.PASSWORD_RESET_COOLDOWN_MS) {
			const token = crypto.randomBytes(32).toString("hex");
			await Users.updateOne(
				{ _id: user._id },
				{
					passwordResetToken: utils.hashResetToken(token),
					passwordResetExpires: new Date(Date.now() + constants.PASSWORD_RESET_TTL_MS),
				}
			);
			utils.resetPasswordEmail(user.username, user.email, token);
		}

		res.json({ message: "If the account exists, a password reset link has been emailed" });
	} catch (error) {
		next(error);
	}
};

/**
 * Completes a password reset with the emailed token. The token is single-use,
 * and every existing session is signed out.
 */
const completePasswordReset = async (req, res, next) => {
	try {
		const password = await utils.getValidPassword(req.body.password);
		const user = await Users.findOneAndUpdate(
			{
				passwordResetToken: utils.hashResetToken(String(req.params.token)),
				passwordResetExpires: { $gt: new Date() },
			},
			{
				$set: { password, updatedOn: new Date(), devices: [] },
				$unset: { passwordResetToken: "", passwordResetExpires: "" },
			}
		).exec();
		if (!user) return utils.httpError(400, "This reset link is invalid or has expired");

		res.json({ message: "Password updated. Please log in." });
	} catch (error) {
		next(error);
	}
};

const resendEmailVerification = async (req, res, next) => {
	try {
		const { username, email, emailVerificationCode } = req.user;
		if (!emailVerificationCode) return utils.httpError(400, "Email has already been verified");

		utils.verificationEmail(username, email, emailVerificationCode);

		res.json({ message: "Re-sent verification email." });
	} catch (error) {
		next(error);
	}
};

const updateAccount = async (req, res, next) => {
	try {
		const username =
			req.body.username && req.body.username.toLowerCase() !== req.user.username
				? utils.getValidUsername(req.body.username)
				: null;
		if (username) await utils.isNewUsername(username, req.user._id);

		const email =
			req.body.email && req.body.email !== req.user.email ? await utils.getValidEmail(req.body.email) : null;
		if (email) await utils.isNewEmail(email, req.user._id);

		const password = req.body.password ? await utils.getValidPassword(req.body.password) : null;

		// Settings and Customize submit different subsets of fields, so only touch the ones that were sent.
		const has = (key) => typeof req.body[key] !== "undefined";
		const updateFields = {};
		if (username) updateFields["username"] = username;
		if (email) {
			const emailVerificationCode = uuid();
			updateFields["email"] = email;
			updateFields["emailVerificationCode"] = emailVerificationCode;
			await utils.verificationEmail(req.user.username, email, emailVerificationCode);
		}
		if (password) updateFields["password"] = password;

		if (has("name")) {
			updateFields["name"] = req.body.name ? await utils.getValidString(req.body.name, 1, 50, "Name") : null;
		}
		if (has("description")) {
			updateFields["description"] = req.body.description
				? await utils.getValidString(req.body.description, 1, 300, "Description")
				: "";
		}
		if (has("menu")) updateFields["menu"] = utils.getValidMenus(req.body.menu);
		if (has("theme")) updateFields["theme"] = utils.getValidTheme(req.body.theme);
		if (has("customStyle")) {
			updateFields["customStyle"] = req.body.customStyle
				? await utils.getValidString(req.body.customStyle, 1, 5000, "Custom Style")
				: null;
		}
		if (has("customScriptUrl")) {
			updateFields["customScriptUrl"] = req.body.customScriptUrl
				? await utils.getValidString(req.body.customScriptUrl, 1, 500, "Custom Script URL")
				: null;
		}

		// A custom domain is optional: set it when provided, clear it when blank.
		const unsetFields = {};
		if (typeof req.body.domain !== "undefined") {
			if (req.body.domain && req.body.domain.trim()) {
				const domain = utils.getValidDomain(req.body.domain);
				await utils.isNewDomain(domain, req.user._id);
				updateFields["domain"] = domain;
			} else if (req.user.domain) {
				unsetFields["domain"] = 1;
			}
		}

		const update = { $set: { ...updateFields, updatedOn: new Date() } };
		if (Object.keys(unsetFields).length) update["$unset"] = unsetFields;

		await Users.updateOne({ _id: req.user._id }, update);
		res.json({
			message: `Account updated. ${updateFields["emailVerificationCode"] ? "Please verify your email" : ""}`,
		});
	} catch (error) {
		next(error);
	}
};

/**
 * Schedules the account for deletion in 7 days, and only once the user has deleted all their content.
 * Logging in again within those days cancels it.
 */
const deleteAccount = async (req, res, next) => {
	try {
		const remaining = await utils.getRemainingContent(req.user);
		if (remaining.length > 0) {
			return utils.httpError(400, `Delete your content before deleting your account. Still remaining: ${remaining.join(", ")}.`);
		}

		await utils.accountDeletionEmail(req.user.username, req.user.email);

		// The home page can't be deleted on its own, so it goes with the account.
		const deletionDate = new Date(new Date().setDate(new Date().getDate() + 7));
		await Promise.all([
			Users.updateOne({ _id: req.user._id }, { deletionDate: deletionDate }),
			Posts.deleteMany({ user: req.user._id, type: "page", slug: "" }),
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
		const title = utils.getValidString(req.body.title, 1, 160, "Title");
		const text = utils.getValidPost(req.body.text);
		const html = utils.markdownToHtml(text);
		const postData = {
			user: req.user._id,
			type,
			title,
			text,
			html,
			hashtags: type === "post" ? utils.getHashtagsFromText(text) : [],
			createdOn: new Date(),
		};
		const timezone = utils.getValidTimezone(req.body.timezone);
		if (timezone) postData.timezone = timezone;
		if (type === "post") {
			postData.slug = await utils.getUniquePostSlug(req.user._id, title, req.body.slug);
			postData.publishedDate =
				utils.getValidPublishedDate(req.body.publishedDate) || utils.toDateString(postData.createdOn, timezone);
		}

		if (type === "page") {
			const slug = utils.getValidSlug(req.body.slug);
			await utils.ensureUniquePageSlug(req.user._id, slug);
			postData.slug = slug;
		}

		const post = await new Posts(postData).save();
		res.json({ message: type === "page" ? "Page created" : "Post created", post });

		if (type === "post") {
			Users.updateOne({ _id: req.user._id }, { $set: { lastPostedOn: post.createdOn } }).catch((err) =>
				console.error(err)
			);
			utils.notifySubscribers(req.user, post);
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
		updateFields["title"] = utils.getValidString(req.body.title, 1, 160, "Title");
		updateFields["text"] = text;
		updateFields["html"] = utils.markdownToHtml(text);
		updateFields["hashtags"] = type === "post" ? utils.getHashtagsFromText(text) : [];
		if (type === "page") {
			const slug = utils.getValidSlug(req.body.slug);
			await utils.ensureUniquePageSlug(req.user._id, slug, post._id);
			updateFields["slug"] = slug;
		}

		if (type === "post") {
			const requestedSlug = req.body.slug || post.slug;
			updateFields["slug"] = await utils.getUniquePostSlug(req.user._id, updateFields["title"], requestedSlug, post._id);
			const publishedDate = utils.getValidPublishedDate(req.body.publishedDate);
			if (publishedDate) updateFields["publishedDate"] = publishedDate;
		}

		updateFields["updatedOn"] = new Date();
		await Posts.updateOne({ _id: post._id }, updateFields);

		res.json({ message: type === "page" ? "Page updated" : "Post updated" });
	} catch (error) {
		next(error);
	}
};

const deletePost = async (req, res, next) => {
	try {
		const post = await Posts.findOne({ _id: req.params.id, user: req.user._id }).exec();
		if (!post) return utils.httpError(404, "Post not found");
		if (utils.isHomePage(post)) return utils.httpError(400, "The home page cannot be deleted");
		await Posts.deleteOne({ _id: post._id });

		res.json({ message: "Post deleted" });
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
		const page = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "page" }).exec();
		if (!page) return utils.httpError(404, "Page not found");
		if (utils.isHomePage(page)) return utils.httpError(400, "The home page cannot be deleted");
		await Posts.deleteOne({ _id: page._id });
		res.json({ message: "Page deleted" });
	} catch (error) {
		next(error);
	}
};

const createBookmark = async (req, res, next) => {
	try {
		const fields = utils.getValidBookmarkFields(req.body);
		// Without a title, use the page's own title, or the host name when it has none.
		if (!fields.title) fields.title = (await utils.fetchPageTitle(fields.url)) || new URL(fields.url).hostname;
		const bookmark = await new Bookmarks({ ...fields, user: req.user._id, createdOn: new Date() }).save();
		res.json({ message: "Bookmark added", bookmark });
	} catch (error) {
		next(error);
	}
};

const updateBookmark = async (req, res, next) => {
	try {
		const bookmark = await Bookmarks.findOne({ _id: req.params.id, user: req.user._id }).exec();
		if (!bookmark) return utils.httpError(404, "Bookmark not found");

		const fields = utils.getValidBookmarkFields(req.body);
		if (!fields.title) fields.title = (await utils.fetchPageTitle(fields.url)) || new URL(fields.url).hostname;
		await Bookmarks.updateOne({ _id: bookmark._id }, { ...fields, updatedOn: new Date() });
		res.json({ message: "Bookmark updated" });
	} catch (error) {
		next(error);
	}
};

const deleteBookmark = async (req, res, next) => {
	try {
		const bookmark = await Bookmarks.findOneAndDelete({ _id: req.params.id, user: req.user._id }).exec();
		if (!bookmark) return utils.httpError(404, "Bookmark not found");
		res.json({ message: "Bookmark deleted" });
	} catch (error) {
		next(error);
	}
};

const createMicroblog = async (req, res, next) => {
	try {
		const fields = utils.getValidMicroblogFields(req.body);
		const microblog = await new Microblogs({ ...fields, user: req.user._id, createdOn: new Date() }).save();
		res.json({ message: "Microblog added", microblog });
	} catch (error) {
		next(error);
	}
};

const updateMicroblog = async (req, res, next) => {
	try {
		const microblog = await Microblogs.findOne({ _id: req.params.id, user: req.user._id }).exec();
		if (!microblog) return utils.httpError(404, "Microblog not found");

		const fields = utils.getValidMicroblogFields(req.body);
		await Microblogs.updateOne({ _id: microblog._id }, { ...fields, updatedOn: new Date() });
		res.json({ message: "Microblog updated" });
	} catch (error) {
		next(error);
	}
};

const deleteMicroblog = async (req, res, next) => {
	try {
		const microblog = await Microblogs.findOneAndDelete({ _id: req.params.id, user: req.user._id }).exec();
		if (!microblog) return utils.httpError(404, "Microblog not found");
		res.json({ message: "Microblog deleted" });
	} catch (error) {
		next(error);
	}
};

/**
 * Takes a visitor's guestbook entry for the blog being viewed. The entry is saved unconfirmed
 * and the visitor is emailed a link to confirm it; the author only hears about it after that.
 */
const createGuestbookEntry = async (req, res, next) => {
	try {
		const profileUser = req.profileUser;
		if (!(await utils.blogHasForm(profileUser._id, "guestbook.form"))) {
			return utils.httpError(404, "This blog does not have a guestbook");
		}
		// Bots fill in the hidden field. Pretend it worked so they don't adapt.
		if (req.body.website) return res.redirect(303, "/guestbook/submitted");

		const fields = utils.getValidGuestbookFields(req.body);

		const recent = await GuestbookEntries.exists({
			user: profileUser._id,
			email: fields.email,
			createdOn: { $gt: new Date(Date.now() - constants.GUESTBOOK_COOLDOWN_MS) },
		});
		if (recent) return utils.httpError(429, "Please wait a few minutes before signing again");

		const confirmationCode = crypto.randomBytes(32).toString("hex");
		await new GuestbookEntries({
			...fields,
			user: profileUser._id,
			confirmationCode,
			createdOn: new Date(),
			expiresOn: new Date(Date.now() + constants.GUESTBOOK_CONFIRM_TTL_MS),
		}).save();

		const blogName = profileUser.name ?? profileUser.username;
		utils.guestbookConfirmationEmail(
			blogName,
			fields.name,
			fields.email,
			`${utils.getUserBaseUrl(profileUser)}guestbook/confirm/${confirmationCode}`
		);

		res.redirect(303, "/guestbook/submitted");
	} catch (error) {
		next(error);
	}
};

/**
 * Shows the entry behind an emailed confirmation link, with a button to confirm it. Opening the link
 * changes nothing, so email scanners that prefetch links cannot confirm an entry; only the button does.
 */
const previewGuestbookEntry = async (req, res, next) => {
	try {
		const entry = await GuestbookEntries.findOne({
			user: req.profileUser._id,
			confirmationCode: String(req.params.code),
			isConfirmed: false,
		})
			.select("name text")
			.lean()
			.exec();
		if (!entry) return utils.httpError(400, "This confirmation link is invalid or has expired");

		res.render("guestbook/confirm", { title: "Guestbook", entry });
	} catch (error) {
		next(error);
	}
};

/**
 * Confirms a guestbook entry when the visitor presses the button on the confirmation page,
 * then tells the blog's author about it. The code is single-use: confirming again finds nothing.
 */
const confirmGuestbookEntry = async (req, res, next) => {
	try {
		const entry = await GuestbookEntries.findOneAndUpdate(
			{ user: req.profileUser._id, confirmationCode: String(req.params.code), isConfirmed: false },
			{ $set: { isConfirmed: true }, $unset: { confirmationCode: "", expiresOn: "" } }
		).exec();
		if (!entry) return utils.httpError(400, "This confirmation link is invalid or has expired");

		res.render("profile/form-message", {
			title: "Guestbook",
			message: "Thanks, your entry is confirmed. It has been sent to the author and will show once they approve it.",
		});

		utils.guestbookEntryEmail(req.profileUser.username, req.profileUser.email, entry.name, entry.text);
	} catch (error) {
		next(error);
	}
};

const updateGuestbookEntry = async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return utils.httpError(404, "Guestbook entry not found");
		if (typeof req.body.isApproved !== "boolean") return utils.httpError(400, "isApproved must be true or false");
		const entry = await GuestbookEntries.findOneAndUpdate(
			{ _id: req.params.id, user: req.user._id, isConfirmed: true },
			{ $set: { isApproved: req.body.isApproved } }
		).exec();
		if (!entry) return utils.httpError(404, "Guestbook entry not found");
		res.json({ message: req.body.isApproved ? "Guestbook entry approved" : "Guestbook entry unapproved" });
	} catch (error) {
		next(error);
	}
};

const deleteGuestbookEntry = async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return utils.httpError(404, "Guestbook entry not found");
		const entry = await GuestbookEntries.findOneAndDelete({ _id: req.params.id, user: req.user._id }).exec();
		if (!entry) return utils.httpError(404, "Guestbook entry not found");
		res.json({ message: "Guestbook entry deleted" });
	} catch (error) {
		next(error);
	}
};

/**
 * Takes a visitor's subscription to the blog being viewed. The subscriber is saved unconfirmed and
 * emailed a link to confirm it, so nobody can be subscribed by someone else typing in their address.
 * Someone who already subscribed gets the same reply and no email, so the form does not reveal who is subscribed.
 */
const createSubscriber = async (req, res, next) => {
	try {
		const profileUser = req.profileUser;
		if (!(await utils.blogHasForm(profileUser._id, "subscription.form"))) {
			return utils.httpError(404, "This blog does not take subscriptions");
		}
		// Bots fill in the hidden field. Pretend it worked so they don't adapt.
		if (req.body.website) return res.redirect(303, "/subscribe/submitted");

		const email = utils.getValidSubscriberEmail(req.body);
		const existing = await Subscribers.findOne({ user: profileUser._id, email }).exec();
		if (existing?.isConfirmed) return res.redirect(303, "/subscribe/submitted");
		if (existing?.confirmationSentOn > new Date(Date.now() - constants.SUBSCRIPTION_COOLDOWN_MS)) {
			return utils.httpError(429, "Please wait a few minutes before subscribing again");
		}

		const confirmationCode = crypto.randomBytes(32).toString("hex");
		const now = new Date();
		const expiresOn = new Date(now.getTime() + constants.SUBSCRIPTION_CONFIRM_TTL_MS);
		if (existing) {
			await Subscribers.updateOne(
				{ _id: existing._id },
				{ $set: { confirmationCode, confirmationSentOn: now, expiresOn } }
			).exec();
		} else {
			await new Subscribers({
				user: profileUser._id,
				email,
				confirmationCode,
				unsubscribeToken: crypto.randomBytes(32).toString("hex"),
				createdOn: now,
				confirmationSentOn: now,
				expiresOn,
			}).save();
		}

		utils.subscriptionConfirmationEmail(
			profileUser.name ?? profileUser.username,
			email,
			`${utils.getUserBaseUrl(profileUser)}subscribe/confirm/${confirmationCode}`
		);

		res.redirect(303, "/subscribe/submitted");
	} catch (error) {
		next(error);
	}
};

/**
 * Shows the subscription behind an emailed confirmation link, with a button to confirm it. Opening the link
 * changes nothing, so email scanners that prefetch links cannot confirm a subscription; only the button does.
 */
const previewSubscription = async (req, res, next) => {
	try {
		const subscriber = await Subscribers.exists({
			user: req.profileUser._id,
			confirmationCode: String(req.params.code),
			isConfirmed: false,
		});
		if (!subscriber) return utils.httpError(400, "This confirmation link is invalid or has expired");

		res.render("subscribers/confirm", { title: "Subscribe" });
	} catch (error) {
		next(error);
	}
};

/**
 * Confirms a subscription when the visitor presses the button on the confirmation page.
 * The code is single-use: confirming again finds nothing.
 */
const confirmSubscription = async (req, res, next) => {
	try {
		const subscriber = await Subscribers.findOneAndUpdate(
			{ user: req.profileUser._id, confirmationCode: String(req.params.code), isConfirmed: false },
			{ $set: { isConfirmed: true }, $unset: { confirmationCode: "", expiresOn: "" } }
		).exec();
		if (!subscriber) return utils.httpError(400, "This confirmation link is invalid or has expired");

		res.render("profile/form-message", {
			title: "Subscribe",
			message: "Thanks, you are subscribed. You will get an email whenever there is a new post.",
		});
	} catch (error) {
		next(error);
	}
};

/**
 * Shows a button to unsubscribe, for the link in every email. Opening the link changes nothing,
 * so email scanners that prefetch links cannot unsubscribe anyone; only the button does.
 */
const previewUnsubscribe = async (req, res, next) => {
	try {
		const subscriber = await Subscribers.exists({
			user: req.profileUser._id,
			unsubscribeToken: String(req.params.token),
		});
		if (!subscriber) return utils.httpError(400, "This unsubscribe link is invalid or you are already unsubscribed");

		res.render("subscribers/unsubscribe", { title: "Unsubscribe" });
	} catch (error) {
		next(error);
	}
};

const unsubscribe = async (req, res, next) => {
	try {
		const subscriber = await Subscribers.findOneAndDelete({
			user: req.profileUser._id,
			unsubscribeToken: String(req.params.token),
		}).exec();
		if (!subscriber) return utils.httpError(400, "This unsubscribe link is invalid or you are already unsubscribed");

		res.render("profile/form-message", {
			title: "Unsubscribe",
			message: "You are unsubscribed. You will not get any more emails.",
		});
	} catch (error) {
		next(error);
	}
};

const deleteSubscriber = async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return utils.httpError(404, "Subscriber not found");
		const subscriber = await Subscribers.findOneAndDelete({ _id: req.params.id, user: req.user._id }).exec();
		if (!subscriber) return utils.httpError(404, "Subscriber not found");
		res.json({ message: "Subscriber deleted" });
	} catch (error) {
		next(error);
	}
};

const uploadPhoto = async (req, res, next) => {
	try {
		if (!config.AWS_S3_BUCKET) return utils.httpError(500, "Photo uploads are not configured");
		if (!req.file) return utils.httpError(400, "Choose a photo to upload");
		if (req.file.size > config.PHOTO_MAX_BYTES) return utils.httpError(400, "Photo must be 1MB or smaller");
		const { contentType, extension } = utils.getValidPhotoType(req.file.buffer);

		if ((await Photos.countDocuments({ user: req.user._id })) >= config.PHOTO_MAX_PER_USER) {
			return utils.httpError(400, `You can have at most ${config.PHOTO_MAX_PER_USER} photos. Delete one to upload another.`);
		}

		const _id = new mongoose.Types.ObjectId();
		const s3Key = `photos/${req.user._id}/${_id}.${extension}`;
		const s3Url = await s3.putObject(s3Key, req.file.buffer, contentType);
		try {
			await new Photos({ _id, user: req.user._id, s3Key, s3Url, contentType, size: req.file.size }).save();
		} catch (error) {
			await s3.deleteObject(s3Key).catch(() => {});
			throw error;
		}
		res.json({ message: "Photo uploaded", photo: { _id } });
	} catch (error) {
		next(error);
	}
};

const deletePhoto = async (req, res, next) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return utils.httpError(404, "Photo not found");
		const photo = await Photos.findOne({ _id: req.params.id, user: req.user._id }).select("+s3Key").exec();
		if (!photo) return utils.httpError(404, "Photo not found");
		// Delete from S3 first: if it fails the photo stays listed and can be deleted again.
		await s3.deleteObject(photo.s3Key);
		await Photos.deleteOne({ _id: photo._id });
		res.json({ message: "Photo deleted" });
	} catch (error) {
		next(error);
	}
};

/**
 * Stores the uploaded PNG as the blog's favicon, replacing any earlier one or legacy favicon URL.
 */
const uploadFavicon = async (req, res, next) => {
	try {
		if (!config.AWS_S3_BUCKET) return utils.httpError(500, "Uploads are not configured");
		if (!req.file) return utils.httpError(400, "Choose a PNG image to upload");
		if (req.file.size > config.FAVICON_MAX_BYTES) return utils.httpError(400, "Favicon must be 512KB or smaller");
		utils.assertFaviconIsPng(req.file.buffer);

		await s3.putObject(utils.getFaviconKey(req.user._id), req.file.buffer, "image/png");
		// The uploaded favicon replaces any legacy favicon URL.
		await Users.updateOne({ _id: req.user._id }, { $set: { "favicon.updatedOn": new Date() }, $unset: { iconUrl: 1 } });
		res.json({ message: "Favicon uploaded" });
	} catch (error) {
		next(error);
	}
};

/**
 * Removes the blog's favicon, uploaded or legacy URL, so the default one is served again.
 */
const deleteFavicon = async (req, res, next) => {
	try {
		// Delete from S3 first: if it fails the favicon stays and can be removed again.
		if (req.user.favicon?.updatedOn) await s3.deleteObject(utils.getFaviconKey(req.user._id));
		await Users.updateOne({ _id: req.user._id }, { $unset: { favicon: 1, iconUrl: 1 } });
		res.json({ message: "Favicon removed" });
	} catch (error) {
		next(error);
	}
};

/**
 * Serves a blog's uploaded favicon at /favicon.png. Runs ahead of the static assets, so a blog without
 * an uploaded favicon (and the main site) falls through to the default one.
 */
const serveFavicon = async (req, res, next) => {
	try {
		const owner = await utils.getHostOwner(req.hostname);
		if (owner.type !== "user" || !owner.user.favicon?.updatedOn) return next();

		let stream;
		try {
			stream = await s3.getObjectStream(utils.getFaviconKey(owner.user._id));
		} catch (error) {
			if (error.name === "NoSuchKey") return next();
			throw error;
		}

		res.set({
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=3600",
			"X-Content-Type-Options": "nosniff",
		});
		stream.on("error", (error) => {
			console.error(error);
			res.destroy(error);
		});
		stream.pipe(res);
	} catch (error) {
		next(error);
	}
};

/**
 * Emails a newsletter to every verified user, or only to the admin when it is a test send.
 */
const sendNewsletter = async (req, res, next) => {
	try {
		// Route is already guarded by the isUserAdmin middleware.
		const subject = utils.getValidString(req.body.subject, 1, 320, "Subject");
		// Keep the raw markdown intact for the text body; markdownToHtml sanitizes the HTML output.
		const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
		if (!message) return utils.httpError(400, "Message is required");
		if (message.length > 20000) return utils.httpError(400, "Message is too long");
		const isTest = req.body.testEmail !== false; // default to a test send

		const html = utils.markdownToHtml(message);

		let recipients;
		if (isTest) {
			recipients = [req.user.email];
		} else {
			const users = await Users.find({
				emailVerificationCode: { $exists: false },
				deletionDate: { $exists: false },
			})
				.select("email")
				.lean()
				.exec();
			recipients = [...new Set(users.map((user) => user.email).filter(Boolean))];
		}

		if (recipients.length === 0) return utils.httpError(400, "No recipients found");

		res.json({
			message: isTest
				? `Test email sent to ${req.user.email}`
				: `Newsletter is being sent to ${recipients.length} user${recipients.length === 1 ? "" : "s"}`,
		});

		// Fire-and-forget: sending to many recipients can take a while.
		utils.sendNewsletterEmails(recipients, subject, html, message);
	} catch (error) {
		next(error);
	}
};

module.exports = {
	signUp,
	logIn,
	verifyEmail,
	resetPassword,
	completePasswordReset,
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
	createBookmark,
	updateBookmark,
	deleteBookmark,
	createMicroblog,
	updateMicroblog,
	deleteMicroblog,
	createGuestbookEntry,
	previewGuestbookEntry,
	confirmGuestbookEntry,
	updateGuestbookEntry,
	deleteGuestbookEntry,
	createSubscriber,
	previewSubscription,
	confirmSubscription,
	previewUnsubscribe,
	unsubscribe,
	deleteSubscriber,
	uploadPhoto,
	deletePhoto,
	uploadFavicon,
	deleteFavicon,
	serveFavicon,
	sendNewsletter,
};
