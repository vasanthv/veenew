const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const { Users, Posts, Images, Comments } = require("../model").getInstance();
const {
	getAllPosts,
	getAllSubscribers,
	getAllImages,
	getUserBaseUrl,
	getAllComments,
	getPostDate,
	getPostPath,
	getRelativeTime,
	getAvailableThemes,
} = require("../utils");
const config = require("../../config");

// Pages that need a signed-in user send everyone else to the login page.
const requireLogin = (req, res, next) => (req.user ? next() : res.redirect("/login"));

const staticViews = ["/terms", "/privacy"];
router.get(staticViews, (req, res) => res.render(`legal${req.path}`, { user: req.user }));

router.get("/", async (req, res, next) => {
	try {
		if (!req.user) return res.render("index");
		const pagination = await getAllPosts({ user: req.user._id, type: "page" });
		res.render("pages/index", { user: req.user, ...pagination, userBaseUrl: getUserBaseUrl(req.user) });
	} catch (error) {
		next(error);
	}
});

router.get("/posts", requireLogin, async (req, res, next) => {
	try {
		const userBaseUrl = getUserBaseUrl(req.user);
		const pagination = await getAllPosts(
			{ user: req.user._id, type: "post" },
			"title text slug createdOn timezone publishedDate subscribersNotified"
		);
		res.render("posts/index", { user: req.user, ...pagination, userBaseUrl });
	} catch (error) {
		next(error);
	}
});

router.get("/notes", requireLogin, async (req, res, next) => {
	try {
		const notes = await Posts.find({ user: req.user._id, type: "note" })
			.select("title createdOn updatedOn")
			.sort("-createdOn")
			.lean()
			.exec();
		res.render("notes/index", { user: req.user, notes, getRelativeTime });
	} catch (error) {
		next(error);
	}
});

router.get("/notes/new", requireLogin, (req, res, next) => {
	try {
		res.render("notes/editor", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/notes/edit/:id", requireLogin, async (req, res, next) => {
	try {
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const note = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "note" })
			.select("title text")
			.lean();
		if (!note) return res.status(404).render("404", { user: req.user });
		res.render("notes/editor", { user: req.user, note, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/verify/:code", async (req, res, next) => {
	try {
		const user = await Users.exists({ emailVerificationCode: String(req.params.code) });
		if (!user) return res.status(400).send("Invalid email verification code");
		res.render("auth/verify", { user: req.user, code: req.params.code, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get(["/login", "/signup"], (req, res, next) => {
	try {
		if (req.user) return res.redirect("/");

		const view = req.path.substring(1);
		res.render(`auth/${view}`, { csrfToken: req.csrfToken, turnstileSiteKey: config.TURNSTILE_SITE_KEY });
	} catch (error) {
		next(error);
	}
});

router.get("/reset/:token", (req, res, next) => {
	try {
		if (req.user) return res.redirect("/");
		res.render("auth/reset", { csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/new", requireLogin, async (req, res, next) => {
	try {
		res.render("posts/editor", { user: req.user, csrfToken: req.csrfToken, contentType: "post" });
	} catch (error) {
		next(error);
	}
});

router.get("/edit/:id", requireLogin, async (req, res, next) => {
	try {
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const post = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "post" }).lean();
		if (!post) return res.status(404).render("404", { user: req.user });

		res.render("posts/editor", {
			user: req.user,
			post,
			publishedDate: getPostDate(post),
			csrfToken: req.csrfToken,
			contentType: "post",
		});
	} catch (error) {
		next(error);
	}
});

router.get("/pages", (req, res) => res.redirect("/"));

router.get("/pages/new", requireLogin, async (req, res, next) => {
	try {
		res.render("posts/editor", { user: req.user, csrfToken: req.csrfToken, contentType: "page" });
	} catch (error) {
		next(error);
	}
});

router.get("/pages/edit/:id", requireLogin, async (req, res, next) => {
	try {
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const page = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "page" }).lean();
		if (!page) return res.status(404).render("404", { user: req.user });
		res.render("posts/editor", { user: req.user, post: page, csrfToken: req.csrfToken, contentType: "page" });
	} catch (error) {
		next(error);
	}
});

router.get("/comments", requireLogin, async (req, res, next) => {
	try {
		const comments = await Comments.find({ user: req.user._id, isConfirmed: true })
			.select("-confirmationCode")
			.sort("-createdOn")
			.populate("post", "title slug type")
			.lean()
			.exec();
		res.render("comments/index", {
			user: req.user,
			comments,
			baseUrl: getUserBaseUrl(req.user),
			getPostPath,
			getRelativeTime,
			csrfToken: req.csrfToken,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/subscribers", requireLogin, async (req, res, next) => {
	try {
		const subscribers = await getAllSubscribers({ user: req.user._id });
		res.render("subscribers/index", { user: req.user, subscribers, getRelativeTime, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/images", requireLogin, async (req, res, next) => {
	try {
		const images = await getAllImages({ user: req.user._id });
		res.render("images/index", {
			user: req.user,
			images,
			userBaseUrl: getUserBaseUrl(req.user),
			maxImages: config.IMAGE_MAX_PER_USER,
			csrfToken: req.csrfToken,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/images/:id", requireLogin, async (req, res, next) => {
	try {
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const image = await Images.findOne({ _id: req.params.id, user: req.user._id }).lean();
		if (!image) return res.status(404).render("404", { user: req.user });
		res.render("images/single", {
			user: req.user,
			image,
			userBaseUrl: getUserBaseUrl(req.user),
			csrfToken: req.csrfToken,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/settings", requireLogin, async (req, res, next) => {
	try {
		const baseDomain = config.DOMAIN.split(":")[0];
		res.render("account/settings", {
			user: req.user,
			csrfToken: req.csrfToken,
			domain: baseDomain,
			userBaseUrl: getUserBaseUrl(req.user),
			cnameTarget: `cname.${baseDomain}`,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/customize", requireLogin, async (req, res, next) => {
	try {
		res.render("account/customize", {
			user: req.user,
			csrfToken: req.csrfToken,
			themes: getAvailableThemes(req.user.theme),
		});
	} catch (error) {
		next(error);
	}
});

router.get("/newsletter", requireLogin, async (req, res, next) => {
	try {
		if (!res.locals.isAdmin) return res.status(404).render("404", { user: req.user });
		res.render("admin/newsletter", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/admin", requireLogin, async (req, res, next) => {
	try {
		if (!res.locals.isAdmin) return res.status(404).render("404", { user: req.user });
		res.render("admin/index", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/export", requireLogin, async (req, res, next) => {
	try {
		const owner = { user: req.user._id };
		const [allPosts, images, comments, subscribers] = await Promise.all([
			Posts.find(owner).lean().exec(),
			getAllImages(owner),
			getAllComments(owner),
			getAllSubscribers(owner),
		]);
		const baseUrl = getUserBaseUrl(req.user);

		const toItem = (post) => ({
			_id: post._id,
			title: post.title,
			slug: post.slug,
			text: post.text,
			tags: post.hashtags,
			date: post.createdOn,
			publishedDate: getPostDate(post),
			updatedOn: post.updatedOn,
		});

		const exportData = {
			name: req.user.name,
			username: req.user.username,
			email: req.user.email,
			description: req.user.description,
			createdOn: req.user.createdOn,
			posts: allPosts.filter((post) => post.type === "post").map(toItem),
			pages: allPosts.filter((post) => post.type === "page").map(toItem),
			notes: allPosts
				.filter((post) => post.type === "note")
				.map((note) => ({
					title: note.title,
					text: note.text,
					date: note.createdOn,
					updatedOn: note.updatedOn,
				})),
			// The image files can't be put in a JSON file, so each image is listed with the link to download it.
			images: images.map((image) => ({
				url: `${baseUrl}images/${image._id}`,
				contentType: image.contentType,
				size: image.size,
				date: image.createdOn,
			})),
			comments: comments.map((comment) => ({
				post: comment.post,
				name: comment.name,
				email: comment.email,
				text: comment.text,
				reply: comment.reply,
				isConfirmed: comment.isConfirmed,
				isApproved: comment.isApproved,
				date: comment.createdOn,
			})),
			subscribers: subscribers.map((subscriber) => ({
				email: subscriber.email,
				isConfirmed: subscriber.isConfirmed,
				date: subscriber.createdOn,
			})),
		};

		const jsonString = JSON.stringify(exportData, null, 2);

		// Set headers to prompt download
		res.setHeader("Content-disposition", `attachment; filename=veenew_${req.user.username}.json`);
		res.setHeader("Content-Type", "application/json");

		res.end(jsonString);
	} catch (error) {
		next(error);
	}
});

router.get("/logout", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/");
		await Users.updateOne({ _id: req.user._id }, { $pull: { devices: { token: req.token } } });
		req.session.destroy();
		res.redirect("/");
	} catch (error) {
		next(error);
	}
});

router.get("/*", async (req, res) => res.status(404).render("404", { user: req.user }));

// Handle the known errors
router.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).send(err.message || "Something went wrong");
	} else {
		next(err);
	}
});

// Handle the unknown errors
// eslint-disable-next-line
router.use((err, req, res, next) => {
	console.error(err);
	res.status(500).send("Something went wrong");
});

module.exports = router;
