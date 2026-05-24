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
const webfingerRoutes = require("./server/routes/webfinger");
const { federation, isFederationPath } = require("./server/federation");
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

app.use(morgan("dev")); // for dev logging

app.use(mw.attachUserDomainToRequest);

app.use(webfingerRoutes);

// ActivityPub endpoints (actor, inbox, outbox, followers, following) are only
// served on a user's subdomain so that the actor id host matches the human
// profile URL host — Mastodon's same-origin check on the `url` field requires
// that, otherwise it discards `url` and shows the actor id instead.
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
