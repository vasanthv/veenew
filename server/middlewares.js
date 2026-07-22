const rateLimiter = require("express-rate-limit");
const mongoStore = require("connect-mongo");
const session = require("express-session");
const geoip = require("geoip-lite");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");

const config = require("../config");
const utils = require("./utils");
const { Users } = require("./model").getInstance();

dayjs.extend(relativeTime);

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
	if (req.session.token) {
		const token = req.session.token;
		req["token"] = token;
		req["user"] = await Users.findOne({ "devices.token": token }).lean();
	}
	next();
};

/**
 * Resolves the profile owner for the request host and sets req.userDomain.
 * Falls through on the base domain, resolves `username.<base>` subdomains, and
 * looks up user-configured custom domains. Responds with 404 for unknown hosts.
 */
const attachUserDomainToRequest = async (req, res, next) => {
	try {
		const hostname = (req.hostname || "").toLowerCase();
		const baseDomain = config.DOMAIN.split(":")[0].toLowerCase();

		if (!hostname || hostname === baseDomain) return next();
		if (hostname === `www.${baseDomain}`) return next();

		const domainSuffix = `.${baseDomain}`;
		if (hostname.endsWith(domainSuffix)) {
			// A subdomain of the base domain maps to a username handle.
			const subdomain = hostname.slice(0, -domainSuffix.length);
			if (!subdomain || subdomain.includes(".")) return res.status(404).render("404");

			const username = subdomain.toLowerCase();
			if (!/^([a-zA-Z0-9]){3,18}$/.test(username) || config.INVALID_HANDLES.includes(username)) {
				return res.status(404).render("404");
			}
			const user = await Users.findOne({ username }).select("username").lean().exec();

			if (!user) return res.status(404).render("404");
			req.userDomain = user.username;
			return next();
		}

		// Any other host is treated as a user's custom domain. Also match the
		// apex/`www.` counterpart so a single CNAME serves both variants.
		const bareHost = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
		const user = await Users.findOne({ domain: { $in: [hostname, bareHost] } })
			.select("username")
			.lean()
			.exec();

		if (!user) return res.status(404).render("404");
		req.userDomain = user.username;

		next();
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

	// Only protect state-changing requests
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
		// Ensure token exists for the client
		if (!req.cookies[CSRF_COOKIE]) {
			const token = utils.createCsrfToken();
			res.cookie(CSRF_COOKIE, token, {
				httpOnly: false, // must be readable by JS
				sameSite: "lax",
				secure: process.env.NODE_ENV === "production",
				maxAge: config.CSRF_TOKEN_EXPIRY * 1000,
			});
			req.csrfToken = token;
		}
		req.csrfToken = req.cookies[CSRF_COOKIE];
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

const setUserTimezone = (req, res, next) => {
	const ip = (req.get("cf-connecting-ip") || req.ip || "").split(",")[0].trim();
	if (ip) {
		const geo = geoip.lookup(ip);
		if (geo?.timezone) {
			req.timezone = geo.timezone;
		}
	}
	next();
};

/**
 * Attaches shared dayjs instance to res.locals for EJS templates.
 */
const attachDayjsToLocals = (req, res, next) => {
	res.locals.dayjs = dayjs;
	next();
};

/**
 * Parses `tag` query params and stores normalized tags on req.tags.
 */
const attachTagsFromQuery = (req, res, next) => {
	const rawTags = req.query.tag;
	if (rawTags) {
		req.tags = (Array.isArray(rawTags) ? rawTags : [rawTags]).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
	}
	next();
};

module.exports = {
	sessionMiddleWare,
	attachUsertoRequest,
	attachUserDomainToRequest,
	isUserAuthed,
	csrfMiddleware,
	rateLimit,
	setUserTimezone,
	attachDayjsToLocals,
	attachTagsFromQuery,
};
