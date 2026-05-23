const express = require("express");
const morgan = require("morgan");
const path = require("path");
const cookieParser = require("cookie-parser");
const { integrateFederation } = require("@fedify/express");

const pkg = require("./package.json");

const config = require("./config");
const apiRoutes = require("./server/routes/api");
const viewRoutes = require("./server/routes/view");
const profileRoutes = require("./server/routes/profile");
const { federation } = require("./server/federation");
const mw = require("./server/middlewares");
const { Users } = require("./server/model").getInstance();

const app = express();

app.set("view engine", "ejs");
app.set("trust proxy", true);
app.locals.appVersion = pkg.version;
app.locals.analytics = config.ANALYTICS_URL;

// Serve vue.js, page.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "assets/icons")));

app.use(mw.attachUserDomainToRequest);

// Split-domain setup: the WebFinger handle is `@user@<DOMAIN>` (root domain),
// but the actor's AP id and all federation endpoints live on the user's
// subdomain (`<user>.<DOMAIN>`). We answer WebFinger ourselves on both hosts
// so the canonical subject is the root-domain handle regardless of which host
// was queried, and Mastodon's same-origin check on the actor's `url` field
// passes (because `id` and `url` share the subdomain host).
app.get("/.well-known/webfinger", async (req, res) => {
	try {
		const resource = req.query.resource;
		if (!resource) return res.status(400).end();

		const baseDomain = config.DOMAIN.toLowerCase();
		const proto = config.IS_PROD ? "https" : "http";

		let username;
		let queriedHost;
		if (resource.startsWith("acct:")) {
			const m = resource.slice(5).match(/^([^@]+)@(.+)$/);
			if (!m) return res.status(400).end();
			username = m[1].toLowerCase();
			queriedHost = m[2].toLowerCase();
		} else {
			let url;
			try {
				url = new URL(resource);
			} catch (e) {
				return res.status(400).end();
			}
			const pathMatch = url.pathname.match(/^\/users\/([a-zA-Z0-9]+)\/?$/);
			if (pathMatch) username = pathMatch[1].toLowerCase();
			else if (url.pathname === "/" || url.pathname === "") {
				const hostPrefix = url.host.toLowerCase().replace(new RegExp(`\\.${baseDomain.replace(/[.]/g, "\\.")}$`), "");
				if (hostPrefix && hostPrefix !== url.host.toLowerCase()) username = hostPrefix;
			}
			if (!username) return res.status(404).end();
			queriedHost = url.host.toLowerCase();
		}

		const subdomainHost = `${username}.${baseDomain}`;
		if (queriedHost !== baseDomain && queriedHost !== subdomainHost) return res.status(404).end();

		const user = await Users.findOne({ username }).select("_id username").lean().exec();
		if (!user) return res.status(404).end();

		const actorUrl = `${proto}://${subdomainHost}/users/${username}`;
		const profileUrl = `${proto}://${subdomainHost}/`;

		res.type("application/jrd+json").json({
			subject: `acct:${username}@${baseDomain}`,
			aliases: [actorUrl, profileUrl, `acct:${username}@${subdomainHost}`],
			links: [
				{ rel: "self", type: "application/activity+json", href: actorUrl },
				{ rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: profileUrl },
			],
		});
	} catch (e) {
		res.status(500).end();
	}
});

// ActivityPub endpoints (actor, inbox, outbox, followers, following) are only
// served on a user's subdomain so that the actor id host matches the human
// profile URL host — Mastodon's same-origin check on the `url` field requires
// that, otherwise it discards `url` and shows the actor id instead.
const isFederationPath = (req) => {
	const p = req.path;
	return p.startsWith("/users/") || p === "/inbox" || p.startsWith("/nodeinfo");
};
const federationMiddleware = integrateFederation(federation, () => undefined);
app.use((req, res, next) => {
	if (!req.userDomain) return next();
	if (!isFederationPath(req)) return next();
	const rawHost = req.headers.host;
	if (rawHost) Object.defineProperty(req, "host", { value: rawHost, configurable: true });
	return federationMiddleware(req, res, next);
});

app.use((req, res, next) => {
	if (req.userDomain) return profileRoutes(req, res, next);
	return next();
});

app.use(morgan("dev")); // for dev logging

// Attach cookie middleware
app.use(cookieParser());

// Attach the session middleware
app.use(mw.sessionMiddleWare);
app.use(mw.attachUsertoRequest);

// Custom CSRF middleware
app.use(mw.csrfMiddleware);

// Handle API requests
app.use("/api", apiRoutes);

app.use("/", viewRoutes);

// Start the server
app.listen(config.PORT, null, function () {
	console.log("Node version", process.version);
	console.log("Veenew server running on port", config.PORT);
});
