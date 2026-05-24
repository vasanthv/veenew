const router = require("express").Router();
const { attachDayjsToLocals, attachTagsFromQuery } = require("../middlewares");
const { Users, Posts, RemotePosts } = require("../model").getInstance();
const { getPagedPosts, getUserBaseUrl, getPagedUserRelations, getFediverseHandle } = require("../utils");
const config = require("../../config");

const staticViews = ["/terms", "/privacy"];
router.get(staticViews, (req, res) => res.render(req.path.substring(1), { user: req.user }));

router.use(attachDayjsToLocals);
router.use(attachTagsFromQuery);

router.get("/", async (req, res, next) => {
	try {
		if (!req.user) return res.render("index");
		const query = { user: req.user._id, type: "post" };
		if (req.tags?.length > 0) query.hashtags = { $all: req.tags };

		const userBaseUrl = getUserBaseUrl(req.user);
		const pagination = await getPagedPosts(req, query);
		res.render("home", { user: req.user, tags: req.tags, ...pagination, userBaseUrl });
	} catch (error) {
		next(error);
	}
});

router.get(["/login", "/signup"], (req, res, next) => {
	try {
		if (req.user) return res.redirect("/");

		const view = req.path.substring(1);
		res.render(view, { csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/new", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("post", { user: req.user, csrfToken: req.csrfToken, contentType: "post" });
	} catch (error) {
		next(error);
	}
});

router.get("/edit/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");

		const query = { _id: req.params.id, type: "post" };

		const post = await Posts.findOne(query).lean();

		if (!post.user.equals(req.user._id)) return res.status(404).render("404", { user: req.user });

		res.render("post", { user: req.user, post, csrfToken: req.csrfToken, contentType: "post" });
	} catch (error) {
		next(error);
	}
});

router.get("/pages", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const pagination = await getPagedPosts(req, { user: req.user._id, type: "page" });
		res.render("pages", { user: req.user, ...pagination });
	} catch (error) {
		next(error);
	}
});

router.get("/pages/new", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("post", { user: req.user, csrfToken: req.csrfToken, contentType: "page" });
	} catch (error) {
		next(error);
	}
});

router.get("/pages/edit/:id", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const page = await Posts.findOne({ _id: req.params.id, user: req.user._id, type: "page" }).lean();
		if (!page) return res.status(404).render("404", { user: req.user });
		res.render("post", { user: req.user, post: page, csrfToken: req.csrfToken, contentType: "page" });
	} catch (error) {
		next(error);
	}
});

router.get("/followings", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const pagination = await getPagedUserRelations(req, req.user._id, "follows");
		const myHandle = getFediverseHandle(req.user);

		res.render("followings", {
			user: req.user,
			csrfToken: req.csrfToken,
			myHandle,
			follows: pagination.items,
			page: pagination.page,
			totalPages: pagination.totalPages,
			prevPage: pagination.prevPage,
			nextPage: pagination.nextPage,
			queryParams: pagination.queryParams,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/followers", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const pagination = await getPagedUserRelations(req, req.user._id, "followers");
		const followDoc = await Users.findById(req.user._id).select("follows").lean().exec();
		const myHandle = getFediverseHandle(req.user);
		const followStateByRemoteId = new Map(
			(followDoc?.follows || []).map((f) => [String(f.remoteUser), Boolean(f.accepted)])
		);
		const followers = pagination.items.map((f) => ({
			...f,
			accepted: followStateByRemoteId.get(String(f._id)) || false,
		}));

		res.render("followers", {
			user: req.user,
			csrfToken: req.csrfToken,
			myHandle,
			followers,
			page: pagination.page,
			totalPages: pagination.totalPages,
			prevPage: pagination.prevPage,
			nextPage: pagination.nextPage,
			queryParams: pagination.queryParams,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/timeline", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const userDoc = await Users.findById(req.user._id).select("follows").lean().exec();
		const followingIds = (userDoc?.follows || []).map((f) => f.remoteUser);
		const myHandle = getFediverseHandle(req.user);

		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const limit = config.PAGE_LIMIT;
		const skip = (page - 1) * limit;
		const query = { remoteUser: { $in: followingIds } };
		const [posts, totalPosts] = await Promise.all([
			RemotePosts.find(query)
				.sort("-createdOn")
				.skip(skip)
				.limit(limit)
				.populate("remoteUser", "handle name iconUrl actorUrl")
				.lean()
				.exec(),
			RemotePosts.countDocuments(query),
		]);
		const totalPages = Math.max(1, Math.ceil(totalPosts / limit));
		res.render("timeline", {
			user: req.user,
			csrfToken: req.csrfToken,
			myHandle,
			posts,
			page,
			totalPages,
			prevPage: page > 1 ? page - 1 : 0,
			nextPage: page < totalPages ? page + 1 : 0,
			queryParams: req.query,
		});
	} catch (error) {
		next(error);
	}
});

router.get("/settings", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("settings", { user: req.user, csrfToken: req.csrfToken });
	} catch (error) {
		next(error);
	}
});

router.get("/export", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");

		const posts = await Posts.find({ user: req.user._id }).lean().exec();

		const exportData = {
			name: req.user.name,
			username: req.user.username,
			email: req.user.email,
			bio: req.user.bio,
			footer: req.user.footer,
			createdOn: req.user.createdOn,
			follows: req.user.follows,
			posts: posts.map((post) => ({
				_id: post._id,
				text: post.text,
				tags: post.hashtags,
				date: post.createdOn,
				updatedOn: post.updatedOn,
			})),
		};

		const jsonString = JSON.stringify(exportData, null, 2); // 'null, 2' for pretty-printing

		// Set headers to prompt download
		res.setHeader("Content-disposition", `attachment; filename=veenew_${req.user.username}.json`);
		res.setHeader("Content-Type", "application/json");

		// Send the JSON string as the response body
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

router.get("/*", async (req, res, next) => res.status(404).render("404", { user: req.user }));

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
