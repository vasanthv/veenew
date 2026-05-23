const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const config = require("../../config");

/**
 * Sends an email verification message with a verification link.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} code - Verification code used in the URL.
 * @returns {void}
 */
const verificationEmail = (username, email, code) => {
	const verificartionEmailLink = `${config.URL}api/verify/${code}`;

	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Please verify your email` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Please click on the link below to verify your email.<br/><a href="${verificartionEmailLink}" target='_blank'>${verificartionEmailLink}</a><br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nPlease click on the link below to verify your email.\n${verificartionEmailLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

/**
 * Sends a password reset email containing a temporary password.
 * @param {string} username - Username shown in the message.
 * @param {string} email - Recipient email address.
 * @param {string} password - Temporary password.
 * @returns {void}
 */
const resetPasswordEmail = (username, email, password) => {
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Your password has been resetted.` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Your password to log in to your Veenew account is: <b>${password}</b><br/><br/>Note: Please change your password immediately after logging in.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nYour password to log in to Veenew account is: ${password}\n\nNote: Please change your password immediately after logging in.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
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
	sendEmail(params);
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
		region: "us-west-2",
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
};
