const express = require("express");

const config = require("../../config");
const { Users } = require("../model").getInstance();

const router = express.Router();

// Split-domain setup: the WebFinger handle is `@user@<DOMAIN>` (root domain),
// but the actor's AP id and all federation endpoints live on the user's
// subdomain (`<user>.<DOMAIN>`). We answer WebFinger ourselves on both hosts
// so the canonical subject is the root-domain handle regardless of which host
// was queried, and Mastodon's same-origin check on the actor's `url` field
// passes (because `id` and `url` share the subdomain host).
router.get("/.well-known/webfinger", async (req, res) => {
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

module.exports = router;
