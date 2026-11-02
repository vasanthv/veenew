const { isValidObjectId } = require("mongoose");
const {
	httpError,
	getPostDate,
	isPublished,
	getPostPath,
	markdownToHtml,
	getValidSlug,
	slugify,
	getHashtagsFromText,
	hasCommentsTag,
	escapeHtml,
	toDateString,
	formatPostDate,
	formatShortPostDate,
} = require("./utils");
const config = require("../../config");
const constants = require("../constants");
const { Users, Posts, Images, Comments, Subscribers } = require("../model").getInstance();

/**
 * Builds a case-insensitive regex that matches the whole value literally.
 * @param {string} value - Text to match, with any regex characters taken literally
 * @returns {RegExp}
 */
const exactMatch = (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

/**
 * Checks if a username is available for registration or update.
 * @param {string} username - The username to check
 * @param {string} [currentUserId] - Optional ID of the current channel (for updates)
 * @returns {Promise<string>} The username if available
 * @throws {Error} If username is already taken
 */
const isNewUsername = async (username, currentUserId) => {
	let query = { username: { $regex: exactMatch(username) } };
	if (currentUserId) {
		query["_id"] = { $ne: currentUserId };
	}

	const existingUsername = await Users.findOne(query).select("username favicon").exec();
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
	let query = { email: { $regex: exactMatch(email) } };
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
 * This is the single source of truth for host routing.
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
		const user = await Users.findOne({ username: subdomain }).select("username favicon").lean().exec();
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
	// Credentials and session tokens must never reach the templates that render a blog.
	return await Users.findOne({ username: { $regex: exactMatch(username) } })
		.select("-password -devices -passwordResetToken -passwordResetExpires -emailVerificationCode")
		.lean()
		.exec();
};

/**
 * Retrieves every post matching a query, newest first, without pagination.
 * Sorted by published date, then creation time.
 * @param {Object} query - Mongo query to execute on Posts collection
 * @param {string} [fields] - Space-separated fields to select
 * @param {Object} [options]
 * @param {boolean} [options.publishedOnly] - Leave out posts whose published date is still in the future
 * @returns {Promise<Object>} Object containing the posts list
 */
const getAllPosts = async (
	query,
	fields = "title text slug createdOn timezone publishedDate",
	{ publishedOnly = false } = {}
) => {
	let posts = await Posts.find(query).select(fields).lean().exec();
	if (publishedOnly) posts = posts.filter((post) => isPublished(post));
	posts.sort((a, b) => getPostDate(b).localeCompare(getPostDate(a)) || b.createdOn - a.createdOn);
	return { posts };
};

/**
 * Whether a slug is already used by any of the author's posts or pages.
 * The empty slug (the custom homepage) is not checked here.
 */
const isSlugTaken = async (userId, slug, excludeId = null) => {
	const query = { user: userId, slug };
	if (excludeId) query._id = { $ne: excludeId };
	return Boolean(await Posts.exists(query));
};

/**
 * Resolves the slug for a post. An explicit slug must be unused by the author's other posts and pages;
 * a title-derived one gets a numeric suffix until it is unique.
 */
const getUniquePostSlug = async (userId, title, requestedSlug, excludeId = null) => {
	const explicitSlug = getValidSlug(requestedSlug);
	if (explicitSlug) {
		if (await isSlugTaken(userId, explicitSlug, excludeId)) {
			return httpError(400, "Slug is already used by another post or page");
		}
		return explicitSlug;
	}

	const base = slugify(title);
	let slug = base;
	for (let suffix = 2; await isSlugTaken(userId, slug, excludeId); suffix++) slug = `${base}-${suffix}`;
	return slug;
};

/**
 * Gives a new blog something to start with: a home page with an intro, the list of posts and an email
 * subscription form, and a "Hello, world!" post with a comment box at the bottom.
 * The author can edit or delete all of it like any other post or page.
 * @param {string} userId - Owner of the content
 * @returns {Promise<void>}
 */
const createStarterContent = async (userId) => {
	const createdOn = new Date();
	const page = (title, slug, text) => ({
		user: userId,
		type: "page",
		title,
		slug,
		text,
		html: markdownToHtml(text),
		createdOn,
	});

	await Posts.insertMany([
		page("Home", "", constants.STARTER_HOME_PAGE_TEXT),
		{
			user: userId,
			type: "post",
			title: constants.STARTER_POST_TITLE,
			slug: slugify(constants.STARTER_POST_TITLE),
			text: constants.STARTER_POST_TEXT,
			html: markdownToHtml(constants.STARTER_POST_TEXT),
			hashtags: getHashtagsFromText(constants.STARTER_POST_TEXT),
			createdOn,
			publishedDate: toDateString(createdOn),
		},
	]);
	await Users.updateOne({ _id: userId }, { $set: { menu: constants.STARTER_MENU } });
};

/**
 * Whether a blog shows a given form on one of its pages. Used to refuse submissions to
 * blogs that don't have the form, since those could only come from someone bypassing it.
 * @param {string} userId - Blog owner
 * @param {"subscription.form"} tag - Dynamic content tag that renders the form
 * @returns {Promise<boolean>} True when a page of the blog contains the tag
 */
const blogHasForm = async (userId, tag) => {
	const pattern = `\\{\\{\\s*${tag.replace(".", "\\.")}\\s*\\}\\}`;
	return Boolean(await Posts.exists({ user: userId, type: "page", text: { $regex: pattern } }));
};

const LATEST_POSTS_COUNT = 5;
const DYNAMIC_CONTENT_TAG =
	/\{\{\s*(posts\.all|posts\.latest|posts\.tag\.[a-zA-Z0-9]+|tags\.all|images\.grid|comments|subscription\.form)\s*\}\}/;

/**
 * Renders a list of post links as HTML.
 * @param {Object[]} posts - Posts with title, text, slug and _id
 * @returns {string} HTML list, or an empty-state message when there are no posts
 */
const renderPostList = (posts) => {
	if (posts.length === 0) return '<div class="empty">No posts to show.</div>';
	const items = posts.map((post) => {
		const label = post.title || (post.text || "").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
		const date = getPostDate(post);
		return `<li><time class="post-date" datetime="${date}">${formatShortPostDate(date)}</time><a href="/${getPostPath(post)}">${escapeHtml(label)}</a></li>`;
	});
	return `<ul class="plain-list">${items.join("")}</ul>`;
};

/**
 * Counts the hashtags used across a user's posts, sorted alphabetically.
 * @param {string} userId - Author whose posts are counted
 * @returns {Promise<{_id: string, count: number}[]>} Each tag with the number of posts using it
 */
const getGroupedTags = async (userId) => {
	const { posts } = await getAllPosts({ user: userId, type: "post" }, "hashtags createdOn timezone publishedDate", {
		publishedOnly: true,
	});
	const counts = new Map();
	posts.forEach((post) => (post.hashtags || []).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
	return [...counts].map(([_id, count]) => ({ _id, count })).sort((a, b) => a._id.localeCompare(b._id));
};

/**
 * Renders tags as links to the posts filtered by that tag.
 * @param {{_id: string, count: number}[]} tags - Tags with their post counts
 * @returns {string} HTML tags, or an empty-state message when there are no tags
 */
const renderTagList = (tags) => {
	if (tags.length === 0) return '<div class="empty">No tags to show.</div>';
	return tags
		.map(
			(tag) =>
				`<div class="tag"><a href="/posts/tag/${encodeURIComponent(tag._id)}">#${escapeHtml(tag._id)}</a><small>(${tag.count})</small></div>`
		)
		.join("");
};

/**
 * Renders images as a grid of square thumbnails. Each one opens the raw image in a new tab.
 * @param {Object[]} images - Images with _id
 * @returns {string} HTML grid, or an empty-state message when there are no images
 */
const renderImageGrid = (images) => {
	if (images.length === 0) return '<div class="empty">No images to show.</div>';
	const items = images.map(
		(image) =>
			`<a href="/images/${image._id}" target="_blank" rel="noopener noreferrer"><img src="/images/${image._id}" alt="" loading="lazy" /></a>`
	);
	return `<div class="image-grid">${items.join("")}</div>`;
};

/**
 * Renders the form visitors use to comment on a post or page. It posts to the blog itself, so it works
 * without JavaScript. The hidden "website" field is a honeypot: people leave it empty, bots fill it in.
 * @param {string} postId - Post or page the comment belongs to
 * @returns {string} HTML form
 */
const renderCommentForm = (postId) =>
	`<form class="comment-form" method="post" action="/comments">
<input type="hidden" name="post" value="${escapeHtml(String(postId))}" />
<textarea name="text" placeholder="Write your comment" aria-label="Comment" maxlength="1000" required style="min-height: 6rem"></textarea>
<div class="comment-form-row">
<input type="text" name="name" placeholder="Your name" aria-label="Name" maxlength="80" required />
<input type="email" name="email" placeholder="Your email" aria-label="Email" maxlength="254" required />
</div>
<small class="help">We will email you a link to confirm your comment before it is sent to the author.</small>
<div style="position: absolute; left: -9999px" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off" /></div>
<button type="submit">Post comment</button>
</form>`;

/**
 * Renders the form visitors use to subscribe to new posts by email. It posts to the blog itself, so it works
 * without JavaScript. The hidden "website" field is a honeypot: people leave it empty, bots fill it in.
 * @returns {string} HTML form
 */
const renderSubscriptionForm = () =>
	`<form class="subscription-form flex" method="post" action="/subscribe">
<input type="email" name="email" placeholder="Your email" aria-label="Email" maxlength="254" required style="flex: 1; min-width: 0" />
<div style="position: absolute; left: -9999px" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off" /></div>
<button type="submit">Subscribe</button>
</form>`;

/**
 * Renders the blog owner's reply under a comment, if there is one.
 * @param {Object} comment - Comment with an optional reply
 * @returns {string} HTML, empty when there is no reply
 */
const renderCommentReply = (comment) =>
	comment.reply
		? `<div class="comment-reply"><div><strong>Author</strong></div><div style="white-space: pre-wrap;">${escapeHtml(comment.reply)}</div></div>`
		: "";

/**
 * Renders approved comments, oldest first. Only the name, comment and date are shown, never the email.
 * @param {Object[]} comments - Comments with name, text and createdOn
 * @returns {string} HTML list, empty when there are no comments
 */
const renderCommentList = (comments) =>
	comments
		.map((comment) => {
			const date = new Date(comment.createdOn);
			const time = `<time datetime="${date.toISOString()}">${formatPostDate(toDateString(date))}</time>`;
			return `<article class="comment"><div><strong>${escapeHtml(comment.name)}</strong> &middot; <small>${time}</small></div><div style="white-space: pre-wrap;">${escapeHtml(comment.text)}</div>${renderCommentReply(comment)}</article>`;
		})
		.join("");

/**
 * Renders the comments of a post or page followed by the form to add one.
 * @param {string} postId - Post or page the comments belong to
 * @returns {Promise<string>} HTML section
 */
const renderComments = async (postId) => {
	const comments = await getAllComments({ post: postId, isConfirmed: true, isApproved: true }, "createdOn");
	return `<section class="comments"><h3>Comments</h3>${renderCommentList(comments)}${renderCommentForm(postId)}</section>`;
};

/**
 * Replaces dynamic content tags in page HTML with live content: {{posts.all}} lists every
 * post, {{posts.latest}} the most recent five, {{tags.all}} every tag
 * and {{images.grid}} a grid of the images,
 * {{comments}} the approved comments of the post or page with a form to add one,
 * and {{subscription.form}} a form to subscribe to new posts by email.
 * {{posts.tag.name}} lists only the posts tagged #name.
 * A tag is only replaced when it stands alone as a paragraph, so it can still be shown inside
 * a code span or block.
 * @param {string} html - Rendered page HTML
 * @param {string} userId - Author whose content is listed
 * @param {string} postId - The post or page being rendered, which {{comments}} belongs to
 * @returns {Promise<string>} HTML with the tags replaced
 */
const renderDynamicContent = async (html, userId, postId) => {
	if (!html || !DYNAMIC_CONTENT_TAG.test(html)) return html;

	const renderers = {
		"posts.all": async () =>
			renderPostList((await getAllPosts({ user: userId, type: "post" }, undefined, { publishedOnly: true })).posts),
		"posts.latest": async () =>
			renderPostList(
				(await getAllPosts({ user: userId, type: "post" }, undefined, { publishedOnly: true })).posts.slice(
					0,
					LATEST_POSTS_COUNT
				)
			),
		"tags.all": async () => renderTagList(await getGroupedTags(userId)),
		"images.grid": async () => renderImageGrid(await getAllImages({ user: userId })),
		comments: async () => renderComments(postId),
		"subscription.form": async () => renderSubscriptionForm(),
	};

	const render = async (name) => {
		const [, tag] = name.match(/^posts\.tag\.(.+)$/) || [];
		if (!tag) return renderers[name]();
		const hashtags = tag.toLowerCase();
		return renderPostList(
			(await getAllPosts({ user: userId, type: "post", hashtags }, undefined, { publishedOnly: true })).posts
		);
	};

	const standalone = new RegExp(`^\\s*${DYNAMIC_CONTENT_TAG.source}\\s*$`);
	const single = html.match(standalone);
	if (single) return render(single[1]);

	const tags = new RegExp(`<p>\\s*${DYNAMIC_CONTENT_TAG.source}\\s*</p>`, "g");
	const names = [...new Set([...html.matchAll(tags)].map((match) => match[1]))];
	const rendered = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await render(name)])));
	return html.replace(tags, (_, name) => rendered[name]);
};

/**
 * Finds the post or page a visitor is commenting on. It must belong to the blog being viewed, be published
 * and contain the {{comments}} tag, since a submission to any other post could only come from someone
 * bypassing the form. Private notes never accept comments.
 * @param {Object} profileUser - Owner of the blog being viewed
 * @param {*} postId - Post id from the request body
 * @returns {Promise<Object>} The post, with _id and title
 * @throws {Error} 404 when the post does not accept comments
 */
const getCommentablePost = async (profileUser, postId) => {
	const post = isValidObjectId(postId)
		? await Posts.findOne({ _id: String(postId), user: profileUser._id, type: { $in: ["post", "page"] } })
				.select("title text publishedDate createdOn timezone")
				.lean()
				.exec()
		: null;
	if (!post || !isPublished(post) || !hasCommentsTag(post.text)) {
		return httpError(404, "Comments are not enabled here");
	}
	return post;
};

/**
 * Retrieves every comment matching a query, without pagination. The confirmation code is never selected.
 * @param {Object} query - Mongo query to execute on Comments collection
 * @param {string} [sort] - Mongo sort, newest first by default
 * @returns {Promise<Object[]>} The comments
 */
const getAllComments = (query, sort = "-createdOn") =>
	Comments.find(query).select("-confirmationCode").sort(sort).lean().exec();

/**
 * Retrieves every subscriber matching a query, newest first, without pagination.
 * The confirmation code and unsubscribe token are never selected.
 * @param {Object} query - Mongo query to execute on Subscribers collection
 * @returns {Promise<Object[]>} The subscribers
 */
const getAllSubscribers = (query) =>
	Subscribers.find(query).select("-confirmationCode -unsubscribeToken").sort("-createdOn").lean().exec();

/**
 * Retrieves the confirmed subscribers of a blog, with the token each one uses to unsubscribe.
 * @param {string} userId - Author whose subscribers are listed
 * @returns {Promise<{email: string, unsubscribeToken: string}[]>} The confirmed subscribers
 */
const getConfirmedSubscribers = (userId) =>
	Subscribers.find({ user: userId, isConfirmed: true }).select("email unsubscribeToken").lean().exec();

/**
 * Lists the content a user still has, which must be deleted before the account can be.
 * The home page is not counted, since it cannot be deleted on its own.
 * @param {Object} user - The account owner, with _id and favicon
 * @returns {Promise<string[]>} Counts such as "2 posts", empty when nothing is left
 */
const getRemainingContent = async (user) => {
	const owner = { user: user._id };
	const counts = await Promise.all([
		Posts.countDocuments({ ...owner, type: "post" }),
		Posts.countDocuments({ ...owner, type: "page", slug: { $ne: "" } }),
		Posts.countDocuments({ ...owner, type: "note" }),
		Images.countDocuments(owner),
		Comments.countDocuments(owner),
		Subscribers.countDocuments(owner),
	]);
	const labels = [
		["post", "posts"],
		["page", "pages"],
		["note", "notes"],
		["image", "images"],
		["comment", "comments"],
		["subscriber", "subscribers"],
	];
	const remaining = counts.flatMap((count, i) => (count > 0 ? [`${count} ${labels[i][count === 1 ? 0 : 1]}`] : []));
	if (user.favicon?.updatedOn) remaining.push("your favicon");
	return remaining;
};

/**
 * Retrieves every image matching a query, newest first. The S3 location is not selected.
 * @param {Object} query - Mongo query to execute on Images collection
 * @returns {Promise<Object[]>} The images
 */
const getAllImages = (query) => Images.find(query).sort("-createdOn").lean().exec();

module.exports = {
	exactMatch,
	isNewUsername,
	isNewEmail,
	isNewDomain,
	getHostOwner,
	getUserByUsername,
	getAllPosts,
	renderDynamicContent,
	getAllImages,
	getAllComments,
	getCommentablePost,
	getAllSubscribers,
	getConfirmedSubscribers,
	getRemainingContent,
	createStarterContent,
	blogHasForm,
	getUniquePostSlug,
};
