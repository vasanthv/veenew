const express = require("express");
const morgan = require("morgan");
const path = require("path");
const cookieParser = require("cookie-parser");
const pkg = require("./package.json");

const config = require("./config");
const apiRoutes = require("./server/routes/api");
const viewRoutes = require("./server/routes/view");
const profileRoutes = require("./server/routes/profile");
const internalRoutes = require("./server/routes/internal");
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

// Internal endpoints for the reverse proxy / platform health checks. Mounted
// before host resolution because these requests arrive with the container's
// own hostname, which is not a routable public domain. The reverse proxy must
// block /internal/* from public traffic.
app.use("/internal", internalRoutes);

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
