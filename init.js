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
app.use((req, res, next) => {
	if (req.userDomain) return profileRoutes(req, res, next);
	return next();
});

// redirect the fediverse actor url to the user subdomain
app.get("/users/:username", (req, res, next) => {
	const username = String(req.params.username || "")
		.toLowerCase()
		.trim();
	if (!/^([a-zA-Z0-9]){3,18}$/.test(username)) return next();
	res.redirect(301, `http${config.IS_PROD ? "s" : ""}://${username}.${config.DOMAIN}/`);
});

// Federation (ActivityPub) is only served on the root domain. Subdomain
// requests have already been handled by profileRoutes above.
// Express 4 strips the port from req.host; @fedify/express uses req.host to
// reconstruct the request URL, so we override it with the raw Host header.
// Fedify also consumes the request body stream for any non-GET request, so we
// must only invoke it for paths it actually owns to avoid breaking body parsing
// in downstream routers.
const isFederationPath = (req) => {
	const p = req.path;
	return p.startsWith("/.well-known/") || p.startsWith("/users/") || p === "/inbox" || p.startsWith("/nodeinfo");
};
const federationMiddleware = integrateFederation(federation, () => undefined);
app.use((req, res, next) => {
	if (!isFederationPath(req)) return next();
	const rawHost = req.headers.host;
	if (rawHost) Object.defineProperty(req, "host", { value: rawHost, configurable: true });
	return federationMiddleware(req, res, next);
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
