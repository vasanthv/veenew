const rateLimiter = require("express-rate-limit");
const mongoStore = require("connect-mongo");
const session = require("express-session");

const config = require("../config");
const utils = require("./utils");
const { Users } = require("./model").getInstance();

/**
 * Configures session storage in MongoDB and keeps sessions active with rolling cookies.
 */
const sessionMiddleWare = session({
	secret: config.SECRET,
	store: mongoStore.create({ mongoUrl: config.MONGODB_URI }),
	cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
	resave: false,
	saveUninitialized: false,
	rolling: true,
});

/**
 * Loads the signed-in user from session token and attaches it to req.user.
 */
const attachUsertoRequest = async (req, res, next) => {
	try {
		if (req.session.token) {
			const token = req.session.token;
			req["token"] = token;
			req["user"] = await Users.findOne({ "devices.token": token }).lean();
		}
		// Expose admin status to routes and templates.
		res.locals.isAdmin = utils.isAdmin(req.user);
		next();
	} catch (error) {
		next(error);
	}
};

/**
 * Guards routes that require an admin user and returns 403 otherwise.
 */
const isUserAdmin = (req, res, next) => {
	if (utils.isAdmin(req.user)) return next();
	res.status(403).json({ message: "Not authorized" });
};

/**
 * Resolves the profile owner for the request host and sets req.userDomain.
 * Falls through on the base domain, resolves `username.<base>` subdomains and
 * user-configured custom domains, and 404s for unknown hosts.
 */
const attachUserDomainToRequest = async (req, res, next) => {
	try {
		const owner = await utils.getHostOwner(req.hostname);

		if (owner.type === "base") return next();
		if (owner.type === "user") {
			req.userDomain = owner.user.username;
			return next();
		}

		return res.status(404).render("404");
	} catch (error) {
		next(error);
	}
};

/**
 * Guards routes that require authentication and returns 401 when req.user is missing.
 */
const isUserAuthed = (req, res, next) => {
	if (req.user) return next();
	res.status(401).json({ message: "Please log in" });
};

/**
 * Issues CSRF token cookies for safe methods and validates tokens for state-changing requests.
 */
const csrfMiddleware = (req, res, next) => {
	if (config.DISABLE_CSRF) return next();
	const CSRF_COOKIE = config.CSRF_COOKIE;

	// Safe methods only need a token to exist for the client; state-changing ones must present it.
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
		let token = req.cookies[CSRF_COOKIE];
		if (!token) {
			token = utils.createCsrfToken();
			res.cookie(CSRF_COOKIE, token, {
				httpOnly: false, // must be readable by JS
				sameSite: "lax",
				secure: config.IS_PROD,
				maxAge: config.CSRF_TOKEN_EXPIRY * 1000,
			});
		}
		req.csrfToken = token;
		return next();
	}

	const cookieToken = req.cookies[CSRF_COOKIE];
	const requestToken = req.headers["x-csrf-token"] || req.body?.csrfToken;

	if (!cookieToken || !requestToken || cookieToken !== requestToken || !utils.verifyCsrfToken(requestToken)) {
		return res.status(403).json({ message: "Page expired. Please refresh and try again" });
	}

	next();
};

/**
 * CSRF protection for the forms on a blog, which has no cookies or session to hold a token. A browser
 * always says where a form post came from, so state-changing requests must come from the blog's own host.
 * Requests that say nothing about where they came from are not browser form posts, so they cannot be CSRF.
 */
const requireSameOrigin = (req, res, next) => {
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

	const source = req.get("origin") || req.get("referer");
	let isSameOrigin = req.get("sec-fetch-site") !== "cross-site";
	if (source) {
		try {
			isSameOrigin = new URL(source).hostname === req.hostname;
		} catch {
			isSameOrigin = false;
		}
	}
	if (isSameOrigin) return next();

	res.status(403).render("profile/form-message", {
		title: "Blocked",
		message: "This request came from another website and was blocked. Please use the form on this blog.",
	});
};

/**
 * Builds a rate limiter with token-based keys for signed-in users and IP+UA fallback for guests.
 */
const rateLimit = (options) => {
	return rateLimiter({
		max: 50,
		...options,
		windowMs: (options?.windowMs || 15) * 60 * 1000, // in minutes
		// Use a combination of factors for rate limiting
		keyGenerator: (req) => {
			// If user is authenticated, use their session token
			if (req.session?.token) return req.session.token;

			// Otherwise use a combination of IP and user agent
			const userAgent = req.get("user-agent") || "unknown";
			return `${req.ip}-${userAgent}`;
		},
		handler: (req, res) =>
			res.status(429).json({
				message: `Too many requests. Try again after ${options?.windowMs || 15} mins`,
			}),
	});
};

module.exports = {
	sessionMiddleWare,
	attachUsertoRequest,
	attachUserDomainToRequest,
	isUserAuthed,
	isUserAdmin,
	csrfMiddleware,
	requireSameOrigin,
	rateLimit,
};
