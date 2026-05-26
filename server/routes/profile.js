const Feed = require("feed").Feed;
const express = require("express");
const router = express.Router();

const { Posts } = require("../model").getInstance();
const { attachDayjsToLocals, attachTagsFromQuery, setUserTimezone } = require("../middlewares");
const {
	getPagedPosts,
	getUserBaseUrl,
	getUserByUsername,
	getValidUsername,
	getTitle,
	formatPostDate,
	getCustomStyleTag,
} = require("../utils");
const config = require("../../config");

const renderPage = (res, page) => {
	return res.render("page", {
		page,
		title: getTitle(page.text),
	});
};

router.use(express.urlencoded({ extended: false }));
router.use(attachDayjsToLocals);
router.use(attachTagsFromQuery);
router.use(async (req, res, next) => {
	try {
		const handle = getValidUsername(req.userDomain);
		const profileUser = await getUserByUsername(handle);
		if (!profileUser) return res.status(404).render("404");
		req.profileUser = profileUser;
		res.locals.profile = profileUser;
		res.locals.customStyleTag = getCustomStyleTag(profileUser.customStyle);
		next();
	} catch (error) {
		next(error);
	}
});

router.get("/", async (req, res, next) => {
	try {
		const profileUser = req.profileUser;
		const homePage = await Posts.findOne({
			user: profileUser._id,
			type: "page",
			slug: "",
		})
			.select("text html slug")
			.lean();
		if (homePage) return renderPage(res, homePage);

		const query = { user: profileUser._id, type: "post" };
		if (req.tags?.length > 0) query.hashtags = { $all: req.tags };

		const pagination = await getPagedPosts(req, query);

		res.render("profile", {
			tags: req.tags,
			url: config.URL,
			...pagination,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/blog", async (req, res, next) => {
	try {
		const profileUser = req.profileUser;

		const query = { user: profileUser._id, type: "post" };
		if (req.tags?.length > 0) query.hashtags = { $all: req.tags };

		const pagination = await getPagedPosts(req, query);

		res.render("profile", {
			tags: req.tags,
			url: config.URL,
			...pagination,
		});
	} catch (error) {
		next(error);
	}
});
router.get("/post/:id", setUserTimezone, async (req, res, next) => {
	try {
		const handle = req.profileUser.username;
		const query = { _id: req.params.id, type: "post" };

		const post = await Posts.findOne(query).populate("user").lean();

		if (post?.user?.username !== handle) return res.status(404).render("404");

		let postDate = post.createdOn.toString();

		if (req.timezone) {
			postDate = formatPostDate(post.createdOn, req.timezone);
		}

		res.render("single", { post, title: getTitle(post.text), postDate });
	} catch (error) {
		next(error);
	}
});

router.get("/tags", async (req, res, next) => {
	try {
		const profileUser = req.profileUser;

		const groupedTags = await Posts.aggregate([
			{ $match: { user: profileUser._id, type: "post" } },
			{ $unwind: "$hashtags" },
			{ $group: { _id: "$hashtags", count: { $sum: 1 } } },
			{ $sort: { _id: 1 } },
		]);

		res.render("tags", { groupedTags });
	} catch (error) {
		next(error);
	}
});

router.get(["/feed/rss", "/feed/json"], async (req, res, next) => {
	try {
		const profileUser = req.profileUser;

		const query = { user: profileUser._id, type: "post" };
		if (req.tags?.length > 0) query.hashtags = { $all: req.tags };

		const { posts } = await getPagedPosts(req, query);

		const baseUrl = getUserBaseUrl(profileUser);

		const feed = new Feed({
			title: profileUser.name ?? profileUser.username,
			description: profileUser.bio,
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
				title: getTitle(post.text),
				id: `${baseUrl}post/${post._id}`,
				link: `${baseUrl}post/${post._id}`,
				description: post.text,
				content: post.html,
				date: post.createdOn,
			});
		});

		if (req.path.endsWith("/json")) {
			return res.type("application/feed+json").send(feed.json1());
		}
		return res.type("application/rss+xml").send(feed.rss2());
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
			.select("text html slug")
			.lean();

		if (!page) return res.status(404).render("404");

		return renderPage(res, page);
	} catch (error) {
		next(error);
	}
});

router.get("/*", async (req, res, next) => res.status(404).render("404"));

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
