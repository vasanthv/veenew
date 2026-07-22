const router = require("express").Router();
const { attachDayjsToLocals, attachTagsFromQuery } = require("../middlewares");
const { Users, Posts } = require("../model").getInstance();
const { getPagedPosts, getPagedUsers, getUserBaseUrl } = require("../utils");
const config = require("../../config");

const staticViews = ["/terms", "/privacy"];
router.get(staticViews, (req, res) => res.render(req.path.substring(1), { user: req.user }));

router.get("/directory", async (req, res, next) => {
	try {
		const pagination = await getPagedUsers(
			req,
			{
				deletionDate: { $exists: false },
				$or: [{ hideFromDirectory: { $exists: false } }, { hideFromDirectory: false }],
			},
			{ lastPostedOn: -1, createdOn: -1 }
		);
		const users = pagination.users.map((user) => ({
			...user,
			baseUrl: getUserBaseUrl(user),
		}));

		res.render("directory", {
			user: req.user,
			users,
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

router.get("/settings", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		const baseDomain = config.DOMAIN.split(":")[0];
		res.render("settings", {
			user: req.user,
			csrfToken: req.csrfToken,
			domain: baseDomain,
			cnameTarget: `cname.${baseDomain}`,
		});
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

router.get("/import", async (req, res, next) => {
	try {
		if (!req.user) return res.redirect("/login");
		res.render("import", { user: req.user, csrfToken: req.csrfToken });
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
