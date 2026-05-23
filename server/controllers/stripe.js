const Stripe = require("stripe");

const utils = require("../utils");
const config = require("../../config");
const { Users } = require("../model").getInstance();

const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

const createStripePremiumCheckout = async (req, res, next) => {
	try {
		if (!stripe) return utils.httpError(500, "Stripe is not configured");
		if (req.user.usertype === "paid") return utils.httpError(400, "Account is already premium");

		const successUrl = `${config.URL}settings?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = `${config.URL}settings?stripe=cancelled`;

		const lineItems = [
			{
				price_data: {
					currency: "usd",
					product_data: { name: "Veenew Premium" },
					unit_amount: 3600,
				},
				quantity: 1,
			},
		];

		const session = await stripe.checkout.sessions.create({
			mode: "payment",
			customer_email: req.user.email,
			client_reference_id: String(req.user._id),
			success_url: successUrl,
			cancel_url: cancelUrl,
			line_items: lineItems,
			metadata: {
				userId: String(req.user._id),
				username: req.user.username,
			},
		});

		res.json({ checkoutUrl: session.url });
	} catch (error) {
		next(error);
	}
};

const confirmStripePremiumCheckout = async (req, res, next) => {
	try {
		if (!stripe) return utils.httpError(500, "Stripe is not configured");
		if (req.user.usertype === "paid") return res.json({ message: "Account already premium" });

		const sessionId = req.body.sessionId ? String(req.body.sessionId) : "";
		if (!sessionId) return utils.httpError(400, "Missing Stripe session id");

		const session = await stripe.checkout.sessions.retrieve(sessionId);
		const sessionUserId = session.client_reference_id || session.metadata?.userId;

		if (!sessionUserId || sessionUserId !== String(req.user._id)) {
			return utils.httpError(403, "Checkout session does not belong to this user");
		}

		if (session.mode !== "payment" || session.payment_status !== "paid") {
			return utils.httpError(400, "Payment has not been completed");
		}

		await Users.updateOne({ _id: req.user._id }, { usertype: "paid", updatedOn: new Date() });
		res.json({ message: "Premium activated" });
	} catch (error) {
		next(error);
	}
};

module.exports = {
	createStripePremiumCheckout,
	confirmStripePremiumCheckout,
};
