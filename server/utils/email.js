const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const config = require("../../config");
const { escapeHtml, getUserBaseUrl, getPostPath } = require("./utils");
const { getConfirmedSubscribers } = require("./db");

/**
 * Sends an email verification message with a verification link.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} code - Verification code used in the URL.
 * @returns {void}
 */
const verificationEmail = (username, email, code) => {
	const verificationEmailLink = `${config.URL}verify/${code}`;

	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Please verify your email` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Please click on the link below to verify your email.<br/><a href="${verificationEmailLink}" target='_blank'>${verificationEmailLink}</a><br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nPlease click on the link below to verify your email.\n${verificationEmailLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params).catch((error) => console.error(error));
};

/**
 * Sends a password reset email containing a single-use reset link.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} token - Raw reset token used in the URL.
 * @returns {void}
 */
const resetPasswordEmail = (username, email, token) => {
	const resetLink = `${config.URL}reset/${token}`;
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Reset your Veenew password` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Click the link below to choose a new password. It expires in 1 hour and can be used once.<br/><a href="${resetLink}" target='_blank'>${resetLink}</a><br/><br/>If you didn't request this, you can ignore this email.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nOpen the link below to choose a new password. It expires in 1 hour and can be used once.\n${resetLink}\n\nIf you didn't request this, you can ignore this email.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params).catch((error) => console.error(error));
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
	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Confirm your guestbook entry on ${blogName}` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello ${escapeHtml(name)}<br/><br/>Please click on the link below to confirm your guestbook entry on ${escapeHtml(blogName)}. Your entry is only sent to the author once you confirm.<br/><a href="${confirmLink}" target='_blank'>${confirmLink}</a><br/><br/>If you didn't write in this guestbook, you can ignore this email.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello ${name}\n\nPlease open the link below to confirm your guestbook entry on ${blogName}. Your entry is only sent to the author once you confirm.\n${confirmLink}\n\nIf you didn't write in this guestbook, you can ignore this email.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params).catch((error) => console.error(error));
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
	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `New guestbook entry from ${name}` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/><strong>${escapeHtml(name)}</strong> signed your guestbook:<br/><blockquote style="white-space: pre-wrap;">${escapeHtml(text)}</blockquote>Approve or delete it from your guestbook.<br/><a href="${guestbookLink}" target='_blank'>${guestbookLink}</a><br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\n${name} signed your guestbook:\n\n${text}\n\nApprove or delete it from your guestbook.\n${guestbookLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params).catch((error) => console.error(error));
};

/**
 * Asks a visitor to confirm their email before they start receiving a blog's new posts.
 * @param {string} blogName - Name of the blog being subscribed to.
 * @param {string} email - Visitor's email address.
 * @param {string} confirmLink - Single-use link that confirms the subscription.
 * @returns {void}
 */
const subscriptionConfirmationEmail = (blogName, email, confirmLink) => {
	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Confirm your subscription to ${blogName}` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello<br/><br/>Please click on the link below to confirm your subscription to ${escapeHtml(blogName)}. You will get an email whenever there is a new post.<br/><a href="${confirmLink}" target='_blank'>${confirmLink}</a><br/><br/>If you didn't subscribe, you can ignore this email.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello\n\nPlease open the link below to confirm your subscription to ${blogName}. You will get an email whenever there is a new post.\n${confirmLink}\n\nIf you didn't subscribe, you can ignore this email.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params).catch((error) => console.error(error));
};

/**
 * Sends a account deletion email to a user.
 * @param {string} name - The name of the recipient
 * @param {string} email - The email address of the recipient
 * @returns {void}
 */
const accountDeletionEmail = (name, email) => {
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: {
				Charset: "UTF-8",
				Data: `Your Veenew account is scheduled for deletion`,
			},
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${name}<br/><br/>We wanted to let you know that your Veenew account is scheduled for deletion in <strong>7 days</strong>. After that, all your data, including your posts and account information will be permanently removed from our systems.<br/><br/>If you didn't request this or would like to keep your account active, simply log in to Veenew before the 7-day period ends.<br/><br/>Thanks for being part of Veenew<br/>Veenew Team`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${name}\n\nWe wanted to let you know that your Veenew account is scheduled for deletion in 7 days. After that, all your data, including your posts and account information will be permanently removed from our systems.\n\nIf you didn't request this or would like to keep your account active, simply log in to Veenew before the 7-day period ends.\n\nThanks for being part of Veenew\nVeenew Team`,
				},
			},
		},
	};
	sendEmail(params).catch((error) => console.error(error));
};

/**
 * Sends a newsletter email to a single recipient.
 * @param {string} email - Recipient email address.
 * @param {string} subject - Email subject line.
 * @param {string} html - HTML body (already converted from markdown).
 * @param {string} text - Plain-text body fallback.
 * @returns {Promise<Object>} The response from AWS SES.
 */
const newsletterEmail = (email, subject, html, text) => {
	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: subject },
			Body: {
				Html: { Charset: "UTF-8", Data: html },
				Text: { Charset: "UTF-8", Data: text },
			},
		},
	};
	return sendEmail(params);
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
			await newsletterEmail(email, subject, html, text);
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
			Source: config.NO_REPLY_EMAIL,
			Destination: { ToAddresses: [email] },
			Message: {
				Subject: { Charset: "UTF-8", Data: `${post.title} - ${blogName}` },
				Body: {
					Html: {
						Charset: "UTF-8",
						Data: `<h2><a href="${postLink}" target='_blank'>${escapeHtml(post.title)}</a></h2>${post.html}<hr/><small>You are getting this because you subscribed to ${escapeHtml(blogName)}. <a href="${unsubscribeLink}" target='_blank'>Unsubscribe</a></small>`,
					},
					Text: {
						Charset: "UTF-8",
						Data: `${post.title}\n${postLink}\n\n${post.text}\n\n--\nYou are getting this because you subscribed to ${blogName}. Unsubscribe: ${unsubscribeLink}\n`,
					},
				},
			},
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
 * Emails a new post to the author's confirmed subscribers. Runs after the response, so a slow
 * or failing send never holds up or fails publishing; errors are only logged.
 */
const notifySubscribers = async (user, post) => {
	try {
		const subscribers = await getConfirmedSubscribers(user._id);
		if (subscribers.length === 0) return;
		const baseUrl = getUserBaseUrl(user);
		await sendNewPostEmails(
			user.name ?? user.username,
			post,
			`${baseUrl}${getPostPath(post)}`,
			baseUrl,
			subscribers
		);
	} catch (error) {
		console.error(error);
	}
};

/**
 * Sends an email using AWS SES.
 * @param {Object} params - The email parameters
 * @param {string} params.Source - The sender's email address
 * @param {Object} params.Destination - The recipient information
 * @param {string[]} params.Destination.ToAddresses - Array of recipient email addresses
 * @param {Object} params.Message - The email message content
 * @param {Object} params.Message.Subject - The email subject
 * @param {Object} params.Message.Body - The email body in HTML and text formats
 * @returns {Promise<Object>} The response from AWS SES
 */
const sendEmail = async (params) => {
	const client = new SESClient({
		region: config.AWS_REGION,
		credentials: {
			accessKeyId: config.AWS_ACCESS_KEY,
			secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
		},
	});
	const command = new SendEmailCommand(params);
	const response = await client.send(command);
	return response;
};

module.exports = {
	verificationEmail,
	accountDeletionEmail,
	resetPasswordEmail,
	guestbookConfirmationEmail,
	guestbookEntryEmail,
	subscriptionConfirmationEmail,
	notifySubscribers,
	sendNewsletterEmails,
};
