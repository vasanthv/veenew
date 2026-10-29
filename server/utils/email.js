const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const config = require("../../config");
const { escapeHtml, getUserBaseUrl, getPostPath } = require("./utils");
const { getConfirmedSubscribers } = require("./db");
const { Posts } = require("../model").getInstance();

let client;
const getClient = () => {
	client ??= new SESClient({
		region: config.AWS_REGION,
		credentials: {
			accessKeyId: config.AWS_ACCESS_KEY,
			secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
		},
	});
	return client;
};

/**
 * Sends an email using AWS SES.
 * @param {Object} email
 * @param {string} email.to - Recipient email address
 * @param {string} email.subject - Subject line
 * @param {string} email.html - HTML body
 * @param {string} email.text - Plain-text body
 * @returns {Promise<Object>} The response from AWS SES
 */
const sendEmail = ({ to, subject, html, text }) =>
	getClient().send(
		new SendEmailCommand({
			Source: config.NO_REPLY_EMAIL,
			Destination: { ToAddresses: [to] },
			Message: {
				Subject: { Charset: "UTF-8", Data: subject },
				Body: { Html: { Charset: "UTF-8", Data: html }, Text: { Charset: "UTF-8", Data: text } },
			},
		})
	);

// Transactional emails are sent without waiting. A failure is only logged, so it never fails the request.
const sendInBackground = (email) => sendEmail(email).catch((error) => console.error(error));

/**
 * Sends an email verification message with a verification link.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} code - Verification code used in the URL.
 * @returns {void}
 */
const verificationEmail = (username, email, code) => {
	const link = `${config.URL}verify/${code}`;
	sendInBackground({
		to: email,
		subject: "Please verify your email",
		html: `Hello @${username}<br/><br/>Please click on the link below to verify your email.<br/><a href="${link}" target='_blank'>${link}</a><br/><br/>Thanks<br/>`,
		text: `Hello @${username}\n\nPlease click on the link below to verify your email.\n${link}\n\nThanks\n`,
	});
};

/**
 * Sends a password reset email containing a single-use reset link.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} token - Raw reset token used in the URL.
 * @returns {void}
 */
const resetPasswordEmail = (username, email, token) => {
	const link = `${config.URL}reset/${token}`;
	sendInBackground({
		to: email,
		subject: "Reset your Veenew password",
		html: `Hello @${username}<br/><br/>Click the link below to choose a new password. It expires in 1 hour and can be used once.<br/><a href="${link}" target='_blank'>${link}</a><br/><br/>If you didn't request this, you can ignore this email.<br/><br/>Thanks<br/>`,
		text: `Hello @${username}\n\nOpen the link below to choose a new password. It expires in 1 hour and can be used once.\n${link}\n\nIf you didn't request this, you can ignore this email.\n\nThanks\n`,
	});
};

/**
 * Asks a guestbook visitor to confirm their email before the entry is sent to the blog's author.
 * @param {string} blogName - Name of the blog being signed.
 * @param {string} name - Name the visitor entered.
 * @param {string} email - Visitor's email address.
 * @param {string} confirmLink - Single-use link that confirms the entry.
 * @returns {void}
 */
const guestbookConfirmationEmail = (blogName, name, email, confirmLink) => {
	sendInBackground({
		to: email,
		subject: `Confirm your guestbook entry on ${blogName}`,
		html: `Hello ${escapeHtml(name)}<br/><br/>Please click on the link below to confirm your guestbook entry on ${escapeHtml(blogName)}. Your entry is only sent to the author once you confirm.<br/><a href="${confirmLink}" target='_blank'>${confirmLink}</a><br/><br/>If you didn't write in this guestbook, you can ignore this email.<br/><br/>Thanks<br/>`,
		text: `Hello ${name}\n\nPlease open the link below to confirm your guestbook entry on ${blogName}. Your entry is only sent to the author once you confirm.\n${confirmLink}\n\nIf you didn't write in this guestbook, you can ignore this email.\n\nThanks\n`,
	});
};

/**
 * Tells a blog's author that someone confirmed a new guestbook entry.
 * @param {string} username - Author's username.
 * @param {string} email - Author's email address.
 * @param {string} name - Name the visitor entered.
 * @param {string} text - The visitor's comment.
 * @returns {void}
 */
const guestbookEntryEmail = (username, email, name, text) => {
	const guestbookLink = `${config.URL}guestbook`;
	sendInBackground({
		to: email,
		subject: `New guestbook entry from ${name}`,
		html: `Hello @${username}<br/><br/><strong>${escapeHtml(name)}</strong> signed your guestbook:<br/><blockquote style="white-space: pre-wrap;">${escapeHtml(text)}</blockquote>Approve or delete it from your guestbook.<br/><a href="${guestbookLink}" target='_blank'>${guestbookLink}</a><br/><br/>Thanks<br/>`,
		text: `Hello @${username}\n\n${name} signed your guestbook:\n\n${text}\n\nApprove or delete it from your guestbook.\n${guestbookLink}\n\nThanks\n`,
	});
};

/**
 * Asks a visitor to confirm their email before they start receiving a blog's new posts.
 * @param {string} blogName - Name of the blog being subscribed to.
 * @param {string} email - Visitor's email address.
 * @param {string} confirmLink - Single-use link that confirms the subscription.
 * @returns {void}
 */
const subscriptionConfirmationEmail = (blogName, email, confirmLink) => {
	sendInBackground({
		to: email,
		subject: `Confirm your subscription to ${blogName}`,
		html: `Hello<br/><br/>Please click on the link below to confirm your subscription to ${escapeHtml(blogName)}. You will get an email whenever there is a new post.<br/><a href="${confirmLink}" target='_blank'>${confirmLink}</a><br/><br/>If you didn't subscribe, you can ignore this email.<br/><br/>Thanks<br/>`,
		text: `Hello\n\nPlease open the link below to confirm your subscription to ${blogName}. You will get an email whenever there is a new post.\n${confirmLink}\n\nIf you didn't subscribe, you can ignore this email.\n\nThanks\n`,
	});
};

/**
 * Sends a account deletion email to a user.
 * @param {string} name - The name of the recipient
 * @param {string} email - The email address of the recipient
 * @returns {void}
 */
const accountDeletionEmail = (name, email) => {
	sendInBackground({
		to: email,
		subject: "Your Veenew account is scheduled for deletion",
		html: `Hello @${name}<br/><br/>We wanted to let you know that your Veenew account is scheduled for deletion in <strong>7 days</strong>. After that, all your data, including your posts and account information will be permanently removed from our systems.<br/><br/>If you didn't request this or would like to keep your account active, simply log in to Veenew before the 7-day period ends.<br/><br/>Thanks for being part of Veenew<br/>Veenew Team`,
		text: `Hello @${name}\n\nWe wanted to let you know that your Veenew account is scheduled for deletion in 7 days. After that, all your data, including your posts and account information will be permanently removed from our systems.\n\nIf you didn't request this or would like to keep your account active, simply log in to Veenew before the 7-day period ends.\n\nThanks for being part of Veenew\nVeenew Team`,
	});
};

/**
 * Tells a user that an admin deleted their blog, along with the admin's reason.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} reason - Why the blog was deleted, written by the admin.
 * @returns {void}
 */
const blogDeletedByAdminEmail = (username, email, reason) => {
	sendInBackground({
		to: email,
		subject: "Your Veenew blog has been deleted",
		html: `Hello @${username}<br/><br/>Your Veenew blog and all of its content have been deleted by an administrator.<br/><br/><strong>Reason:</strong><br/>${escapeHtml(reason).replace(/\n/g, "<br/>")}<br/><br/>Veenew Team`,
		text: `Hello @${username}\n\nYour Veenew blog and all of its content have been deleted by an administrator.\n\nReason:\n${reason}\n\nVeenew Team`,
	});
};

/**
 * Sends a newsletter to a list of recipients, one email per recipient so
 * addresses are never shared across users. Failures are logged and skipped.
 * @param {string[]} emails - Recipient email addresses.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML body (already converted from markdown).
 * @param {string} text - Plain-text body fallback.
 * @returns {Promise<{sent: number, failed: number}>} Delivery summary.
 */
const sendNewsletterEmails = async (emails, subject, html, text) => {
	let sent = 0;
	let failed = 0;
	for (const email of emails) {
		try {
			await sendEmail({ to: email, subject, html, text });
			sent++;
		} catch (error) {
			failed++;
			console.error(`Newsletter send failed for ${email}:`, error.message);
		}
	}
	return { sent, failed };
};

/**
 * Emails a new post to each subscriber, one email per recipient so addresses are never shared.
 * Every email carries that subscriber's own unsubscribe link. Failures are logged and skipped.
 * @param {string} blogName - Name of the blog the post is on.
 * @param {Object} post - The new post, with title, text and html.
 * @param {string} postLink - Absolute link to the post.
 * @param {string} baseUrl - The blog's base URL, ending in a slash.
 * @param {{email: string, unsubscribeToken: string}[]} subscribers - Confirmed subscribers.
 * @returns {Promise<{sent: number, failed: number}>} Delivery summary.
 */
const sendNewPostEmails = async (blogName, post, postLink, baseUrl, subscribers) => {
	let sent = 0;
	let failed = 0;
	for (const { email, unsubscribeToken } of subscribers) {
		const unsubscribeLink = `${baseUrl}unsubscribe/${unsubscribeToken}`;
		const params = {
			to: email,
			subject: `${post.title} - ${blogName}`,
			html: `<h2><a href="${postLink}" target='_blank'>${escapeHtml(post.title)}</a></h2>${post.html}<hr/><small>You are getting this because you subscribed to ${escapeHtml(blogName)}. <a href="${unsubscribeLink}" target='_blank'>Unsubscribe</a></small>`,
			text: `${post.title}\n${postLink}\n\n${post.text}\n\n--\nYou are getting this because you subscribed to ${blogName}. Unsubscribe: ${unsubscribeLink}\n`,
		};
		try {
			await sendEmail(params);
			sent++;
		} catch (error) {
			failed++;
			console.error(`New post email failed for ${email}:`, error.message);
		}
	}
	return { sent, failed };
};

/**
 * Emails a post to the author's confirmed subscribers, at most once per post. The post's
 * subscribersNotified flag is claimed before sending, so two requests can't both send it. A failure for
 * one subscriber is only logged and the post still counts as emailed; the flag is handed back only when
 * the send can't run at all (e.g. the subscribers can't be loaded), so it can be retried. Errors are
 * only logged, so a slow or failing send never fails the request that triggered it.
 * @param {Object} user - The post's author
 * @param {Object} post - The post to send
 * @returns {Promise<boolean>} False when the post was already emailed or the send failed
 */
const notifySubscribers = async (user, post) => {
	const claimed = await Posts.findOneAndUpdate(
		{ _id: post._id, user: user._id, type: "post", subscribersNotified: false },
		{ $set: { subscribersNotified: true } }
	).exec();
	if (!claimed) return false;
	try {
		const subscribers = await getConfirmedSubscribers(user._id);
		if (subscribers.length > 0) {
			const baseUrl = getUserBaseUrl(user);
			await sendNewPostEmails(user.name ?? user.username, post, `${baseUrl}${getPostPath(post)}`, baseUrl, subscribers);
		}
		return true;
	} catch (error) {
		console.error(error);
		await Posts.updateOne({ _id: post._id }, { $set: { subscribersNotified: false } }).exec();
		return false;
	}
};

module.exports = {
	verificationEmail,
	accountDeletionEmail,
	blogDeletedByAdminEmail,
	resetPasswordEmail,
	guestbookConfirmationEmail,
	guestbookEntryEmail,
	subscriptionConfirmationEmail,
	notifySubscribers,
	sendNewsletterEmails,
};
