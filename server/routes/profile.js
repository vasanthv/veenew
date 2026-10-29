const Feed = require("feed").Feed;
const express = require("express");
const { isValidObjectId } = require("mongoose");
const router = express.Router();

const { Posts, Photos, Microblogs } = require("../model").getInstance();
const { getObjectStream } = require("../utils/s3");
const { rateLimit, requireSameOrigin } = require("../middlewares");
const {
	createGuestbookEntry,
	previewGuestbookEntry,
	confirmGuestbookEntry,
	createSubscriber,
	previewSubscription,
	confirmSubscription,
	previewUnsubscribe,
	unsubscribe,
} = require("../controllers");
const {
	getAllPosts,
	renderDynamicContent,
	getUserBaseUrl,
	getUserByUsername,
	getValidUsername,
	formatPostDate,
	getPostDate,
	isPublished,
	getPostPath,
	getRelativeTime,
	getThemeStyleTag,
	getCustomStyleTag,
} = require("../utils");
const config = require("../../config");

const renderPage = async (res, page, userId) => {
	const html = await renderDynamicContent(page.html, userId);
	return res.render("pages/show", {
		page: { ...page, html },
		title: page.title,
	});
};

router.use(express.urlencoded({ extended: false }));
router.use(async (req, res, next) => {
	try {
		const handle = getValidUsername(req.userDomain);
		const profileUser = await getUserByUsername(handle);
		if (!profileUser) return res.status(404).render("404");
		req.profileUser = profileUser;
		res.locals.profile = profileUser;
		res.locals.themeStyleTag = getThemeStyleTag(profileUser.theme);
		res.locals.customStyleTag = getCustomStyleTag(profileUser.customStyle);
		next();
	} catch (error) {
		next(error);
	}
});
router.use(requireSameOrigin);

router.get("/", async (req, res, next) => {
	try {
		const profileUser = req.profileUser;
		const homePage = await Posts.findOne({
			user: profileUser._id,
			type: "page",
			slug: "",
		})
			.select("title text html slug hideTitle")
			.lean();
		if (homePage) return await renderPage(res, homePage, profileUser._id);

		const pagination = await getAllPosts({ user: profileUser._id, type: "post" }, undefined, { publishedOnly: true });

		res.render("profile/index", {
			url: config.URL,
			...pagination,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/post/:slug", async (req, res, next) => {
	try {
		const query = { user: req.profileUser._id, type: "post", slug: req.params.slug };
		let post = await Posts.findOne(query).populate("user", "username name").lean();

		// Links made before slugs existed used the post id.
		if (!post && isValidObjectId(req.params.slug)) {
			post = await Posts.findOne({ _id: req.params.slug, user: req.profileUser._id, type: "post" })
				.populate("user", "username name")
				.lean();
			if (post?.slug) return res.redirect(301, `/post/${post.slug}`);
		}

		if (!post || !isPublished(post)) return res.status(404).render("404");

		const publishedDate = getPostDate(post);
		const postDate = formatPostDate(publishedDate);

		res.render("posts/single", { post, title: post.title, postDate, publishedDate });
	} catch (error) {
		next(error);
	}
});

router.get("/posts/tag/:tag", async (req, res, next) => {
	try {
		const tag = req.params.tag.trim().toLowerCase();
		const pagination = await getAllPosts({ user: req.profileUser._id, type: "post", hashtags: tag }, undefined, {
			publishedOnly: true,
		});

		res.render("profile/index", {
			tags: [tag],
			url: config.URL,
			...pagination,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/microblog/:id", async (req, res, next) => {
	try {
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404");
		const microblog = await Microblogs.findOne({ _id: req.params.id, user: req.profileUser._id })
			.populate("user", "username name")
			.lean();
		if (!microblog) return res.status(404).render("404");

		res.render("microblogs/single", { microblog, title: "Microblog", getRelativeTime });
	} catch (error) {
		next(error);
	}
});

// Form errors are shown on a page, since they come from a plain form post or an emailed link.
const showErrorsOnPage = (title) => (handler) => async (req, res, next) => {
	await handler(req, res, (error) => {
		if (!error?.httpErrorCode) return next(error);
		res.status(error.httpErrorCode).render("profile/form-message", { title, message: error.message });
	});
};
const guestbookErrors = showErrorsOnPage("Guestbook");
const subscribeErrors = showErrorsOnPage("Subscribe");
const unsubscribeErrors = showErrorsOnPage("Unsubscribe");

router.post("/guestbook", rateLimit({ max: 5 }), guestbookErrors(createGuestbookEntry));

router.get("/guestbook/submitted", (req, res) =>
	res.render("profile/form-message", {
		title: "Guestbook",
		message: "Thanks! We emailed you a link. Open it to confirm your entry, and it will be sent to the author.",
	})
);

router.get("/guestbook/confirm/:code", guestbookErrors(previewGuestbookEntry));
router.post("/guestbook/confirm/:code", guestbookErrors(confirmGuestbookEntry));

router.post("/subscribe", rateLimit({ max: 5 }), subscribeErrors(createSubscriber));

router.get("/subscribe/submitted", (req, res) =>
	res.render("profile/form-message", {
		title: "Subscribe",
		message: "Thanks! We emailed you a link. Open it to confirm your subscription.",
	})
);

router.get("/subscribe/confirm/:code", subscribeErrors(previewSubscription));
router.post("/subscribe/confirm/:code", subscribeErrors(confirmSubscription));

router.get("/unsubscribe/:token", unsubscribeErrors(previewUnsubscribe));
router.post("/unsubscribe/:token", unsubscribeErrors(unsubscribe));

router.get(["/feed.xml", "/feed.json"], async (req, res, next) => {
	try {
		const profileUser = req.profileUser;

		const { posts: allPosts } = await getAllPosts(
			{ user: profileUser._id, type: "post" },
			"title text html slug createdOn timezone publishedDate",
			{ publishedOnly: true }
		);
		const posts = allPosts.slice(0, config.FEED_ITEMS_LIMIT);

		const baseUrl = getUserBaseUrl(profileUser);

		const feed = new Feed({
			title: profileUser.name ?? profileUser.username,
			description: profileUser.description,
			id: baseUrl,
			link: baseUrl,
			generator: config.URL,
			author: {
				name: profileUser.name ?? profileUser.username,
				link: baseUrl,
			},
		});

		posts.forEach((post) => {
			feed.addItem({
				title: post.title,
				id: `${baseUrl}${getPostPath(post)}`,
				link: `${baseUrl}${getPostPath(post)}`,
				description: post.text,
				content: post.html,
				date: new Date(`${getPostDate(post)}T00:00:00Z`),
			});
		});

		if (req.path.endsWith(".json")) {
			return res.type("application/feed+json").send(feed.json1());
		}
		return res.type("application/rss+xml").send(feed.rss2());
	} catch (error) {
		next(error);
	}
});

// The raw photo. The S3 location stays on the server; the bytes are streamed from it.
router.get("/photos/:id", async (req, res, next) => {
	try {
		if (!isValidObjectId(req.params.id)) return res.status(404).render("404");
		const photo = await Photos.findOne({ _id: req.params.id, user: req.profileUser._id }).select("+s3Key").lean();
		if (!photo) return res.status(404).render("404");

		let stream;
		try {
			stream = await getObjectStream(photo.s3Key);
		} catch (error) {
			if (error.name === "NoSuchKey") return res.status(404).render("404");
			throw error;
		}

		res.set({
			"Content-Type": photo.contentType,
			"Content-Length": photo.size,
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
});

router.get("/:slug", async (req, res, next) => {
	try {
		const page = await Posts.findOne({
			user: req.profileUser._id,
			type: "page",
			slug: req.params.slug,
		})
			.select("title text html slug hideTitle")
			.lean();

		if (!page) return res.status(404).render("404");

		return await renderPage(res, page, req.profileUser._id);
	} catch (error) {
		next(error);
	}
});

router.get("/*", async (req, res) => res.status(404).render("404"));

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
