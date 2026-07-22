const router = require("express").Router();

const config = require("../../config");
const { getHostOwner } = require("../utils");

/**
 * Liveness probe for the container/platform health check.
 */
router.get("/health", (req, res) => res.json({ status: "ok" }));

/**
 * On-demand TLS gate for the reverse proxy.
 *
 * Caddy calls this before issuing a certificate for an unknown hostname and
 * only proceeds on a 200. Without this gate anyone could point DNS at the
 * server and burn through Let's Encrypt rate limits, so an unknown host must
 * always fail closed.
 */
router.get("/tls-check", async (req, res, next) => {
	try {
		if (config.TLS_CHECK_TOKEN && req.query.token !== config.TLS_CHECK_TOKEN) {
			return res.sendStatus(403);
		}

		const hostname = String(req.query.domain || "")
			.trim()
			.toLowerCase();

		const owner = await getHostOwner(hostname);

		return res.sendStatus(owner.type === "unknown" ? 404 : 200);
	} catch (error) {
		next(error);
	}
});

module.exports = router;
