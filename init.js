const express = require("express");
const morgan = require("morgan");
const path = require("path");
const cookieParser = require("cookie-parser");
const pkg = require("./package.json");

const config = require("./config");
const apiRoutes = require("./server/routes/api");
const viewRoutes = require("./server/routes/view");
const profileRoutes = require("./server/routes/profile");
const mw = require("./server/middlewares");
const { getPostDate, formatShortPostDate, toScriptJson } = require("./server/utils");
const { serveFavicon } = require("./server/controllers");

const app = express();

app.set("view engine", "ejs");
// An array lets EJS resolve includes such as "partials/header" from the views root, not just from the including file.
app.set("views", [path.join(__dirname, "views")]);
app.set("trust proxy", config.TRUST_PROXY);
app.disable("x-powered-by");
app.locals.appVersion = pkg.version;
app.locals.analytics = config.ANALYTICS_URL;
app.locals.getPostDate = getPostDate;
app.locals.formatShortPostDate = formatShortPostDate;
app.locals.toScriptJson = toScriptJson;

app.use(mw.securityHeaders);

// Serve vue.js & axios to the browser
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));

// A blog's uploaded favicon takes over /favicon.png on its own domain, ahead of the static default below.
app.get("/favicon.png", serveFavicon);

// Serve frontend assets & images to the browser
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "assets/icons")));

app.use(mw.attachUserDomainToRequest);
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
