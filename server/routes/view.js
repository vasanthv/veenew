const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const { Users, Posts, Bookmarks, Photos, Microblogs } = require("../model").getInstance();
const {
	getAllPosts,
	getAllBookmarks,
	getAllMicroblogs,
	getAllGuestbookEntries,
	getAllSubscribers,
	getAllPhotos,
	getUserBaseUrl,
	getPostDate,
	getRelativeTime,
	THEMES,
} = require("../utils");
const config = require("../../config");

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

router.get("/posts", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const userBaseUrl = getUserBaseUrl(req.user);
		const pagination = await getAllPosts({ user: req.user._id, type: "post" });
		res.render("posts/index", { user: req.user, ...pagination, userBaseUrl });
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
		res.render(`auth/${view}`, { csrfToken: req.csrfToken });
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

router.get("/new", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("posts/editor", { user: req.user, csrfToken: req.csrfToken, contentType: "post" });
	} catch (error) {
		next(error);
	}
});

router.get("/edit/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");

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

router.get("/pages/new", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("posts/editor", { user: req.user, csrfToken: req.csrfToken, contentType: "page" });
	} catch (error) {
		next(error);
	}
});

router.get("/pages/edit/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const page = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "page" }).lean();
		if (!page) return res.status(404).render("404", { user: req.user });
		res.render("posts/editor", { user: req.user, post: page, csrfToken: req.csrfToken, contentType: "page" });
	} catch (error) {
		next(error);
	}
});

router.get("/bookmarks", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const bookmarks = await getAllBookmarks({ user: req.user._id });
		res.render("bookmarks/index", { user: req.user, bookmarks, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/bookmarks/new", (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("bookmarks/editor", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/bookmarks/edit/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const bookmark = await Bookmarks.findOne({ _id: req.params.id, user: req.user._id }).lean();
		if (!bookmark) return res.status(404).render("404", { user: req.user });
		res.render("bookmarks/editor", { user: req.user, bookmark, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/microblogs", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const microblogs = await getAllMicroblogs({ user: req.user._id });
		res.render("microblogs/index", { user: req.user, microblogs, getRelativeTime, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/microblogs/new", (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("microblogs/editor", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/microblogs/edit/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const microblog = await Microblogs.findOne({ _id: req.params.id, user: req.user._id }).lean();
		if (!microblog) return res.status(404).render("404", { user: req.user });
		res.render("microblogs/editor", { user: req.user, microblog, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/guestbook", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const entries = await getAllGuestbookEntries({ user: req.user._id, isConfirmed: true });
		res.render("guestbook/index", { user: req.user, entries, getRelativeTime, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/subscribers", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const subscribers = await getAllSubscribers({ user: req.user._id });
		res.render("subscribers/index", { user: req.user, subscribers, getRelativeTime, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/photos", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const photos = await getAllPhotos({ user: req.user._id });
		res.render("photos/index", {
			user: req.user,
			photos,
			userBaseUrl: getUserBaseUrl(req.user),
			maxPhotos: config.PHOTO_MAX_PER_USER,
			csrfToken: req.csrfToken,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/photos/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404", { user: req.user });
		const photo = await Photos.findOne({ _id: req.params.id, user: req.user._id }).lean();
		if (!photo) return res.status(404).render("404", { user: req.user });
		res.render("photos/single", { user: req.user, photo, userBaseUrl: getUserBaseUrl(req.user), csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/settings", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
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

router.get("/customize", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("account/customize", { user: req.user, csrfToken: req.csrfToken, themes: THEMES });
	} catch (error) {
		next(error);
	}
});

router.get("/newsletter", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		if (!res.locals.isAdmin) return res.status(404).render("404", { user: req.user });
		res.render("admin/newsletter", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/admin", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		if (!res.locals.isAdmin) return res.status(404).render("404", { user: req.user });
		res.render("admin/index", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/export", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");

		const owner = { user: req.user._id };
		const [allPosts, bookmarks, microblogs, photos, guestbookEntries, subscribers] = await Promise.all([
			Posts.find(owner).lean().exec(),
			getAllBookmarks(owner),
			getAllMicroblogs(owner),
			getAllPhotos(owner),
			getAllGuestbookEntries(owner),
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
			posts: allPosts.filter((post) => post.type !== "page").map(toItem),
			pages: allPosts.filter((post) => post.type === "page").map(toItem),
			bookmarks: bookmarks.map((bookmark) => ({
				title: bookmark.title,
				url: bookmark.url,
				notes: bookmark.notes,
				tags: bookmark.hashtags,
				isPrivate: bookmark.isPrivate,
				date: bookmark.createdOn,
			})),
			microblogs: microblogs.map((microblog) => ({
				text: microblog.text,
				tags: microblog.hashtags,
				date: microblog.createdOn,
			})),
			// The image files can't be put in a JSON file, so each photo is listed with the link to download it.
			photos: photos.map((photo) => ({
				url: `${baseUrl}photos/${photo._id}`,
				contentType: photo.contentType,
				size: photo.size,
				date: photo.createdOn,
			})),
			guestbookEntries: guestbookEntries.map((entry) => ({
				name: entry.name,
				email: entry.email,
				text: entry.text,
				isConfirmed: entry.isConfirmed,
				isApproved: entry.isApproved,
				date: entry.createdOn,
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
