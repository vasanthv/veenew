const {
	createFederation,
	MemoryKvStore,
	generateCryptoKeyPair,
	exportJwk,
	importJwk,
} = require("@fedify/fedify");
const {
	Person,
	Note,
	Create,
	Update,
	Delete,
	Follow,
	Accept,
	Reject,
	Undo,
	Endpoints,
	Image,
	Hashtag,
	Tombstone,
	PUBLIC_COLLECTION,
} = require("@fedify/fedify/vocab");
const { toTemporalInstant } = require("@js-temporal/polyfill");

const config = require("../config");
const { Users, Posts, RemoteUsers, RemotePosts } = require("./model").getInstance();
const { sanitizeString } = require("./utils");

const PAGE_SIZE = 20;

const toInstant = (date) => (date ? toTemporalInstant.call(new Date(date)) : null);

const userBlogUrl = (username) => {
	const proto = config.IS_PROD ? "https" : "http";
	return new URL(`${proto}://${username}.${config.DOMAIN}/`);
};

const parseLocalUsernameFromActorUrl = (actorUrl) => {
	if (!actorUrl) return null;
	const href = typeof actorUrl === "string" ? actorUrl : actorUrl.href;
	const match = href.match(/\/users\/([a-zA-Z0-9]{3,18})(?:[/?#]|$)/);
	return match ? match[1].toLowerCase() : null;
};

const upsertRemoteUserFromActor = async (actor) => {
	if (!actor?.id) return null;
	const actorUrl = actor.id.href;
	const host = actor.id.host;
	const username = actor.preferredUsername || "";
	const handle = username && host ? `${username}@${host}` : "";

	let iconUrl = "";
	try {
		const icon = await actor.getIcon();
		if (icon?.url) iconUrl = icon.url.href || String(icon.url);
	} catch (e) {
		// ignore
	}

	const publicKey = actor.publicKeyId ? await actor.getPublicKey() : null;
	let publicKeyPem = "";
	let publicKeyId = "";
	if (publicKey) {
		publicKeyId = publicKey.id?.href || "";
		try {
			const jwk = await exportJwk(publicKey.publicKey);
			publicKeyPem = JSON.stringify(jwk);
		} catch (e) {
			// ignore
		}
	}

	let inboxUrl = actor.inboxId?.href || "";
	let sharedInboxUrl = "";
	try {
		const endpoints = await actor.getEndpoints();
		if (endpoints?.sharedInbox) sharedInboxUrl = endpoints.sharedInbox.href;
	} catch (e) {
		// ignore
	}

	const profileUrl = actor.url?.href || actor.urls?.[0]?.href || actorUrl;

	const fields = {
		actorUrl,
		url: profileUrl,
		username,
		domain: host,
		handle,
		name: actor.name || username,
		iconUrl,
		summary: sanitizeString(actor.summary || ""),
		inboxUrl,
		sharedInboxUrl,
		outboxUrl: actor.outboxId?.href || "",
		followersUrl: actor.followersId?.href || "",
		followingUrl: actor.followingId?.href || "",
		publicKey: publicKeyPem,
		publicKeyId,
		lastFetchedOn: new Date(),
	};

	const existing = await RemoteUsers.findOne({ actorUrl }).select("_id").lean().exec();
	if (existing) {
		await RemoteUsers.updateOne({ _id: existing._id }, { $set: fields });
		return RemoteUsers.findById(existing._id).lean().exec();
	}
	return (await new RemoteUsers({ ...fields, discoveredOn: new Date() }).save()).toObject();
};

const extractImageUrls = async (note) => {
	const urls = [];
	try {
		for await (const attachment of note.getAttachments({ suppressError: true })) {
			if (!attachment) continue;
			const mediaType = attachment.mediaType || "";
			const isImage = attachment instanceof Image || (typeof mediaType === "string" && mediaType.startsWith("image/"));
			if (!isImage) continue;
			const candidates = attachment.urls?.length ? attachment.urls : attachment.url ? [attachment.url] : [];
			for (const u of candidates) {
				const href = u?.href || (typeof u === "string" ? u : null);
				if (href && !urls.includes(href)) urls.push(href);
			}
		}
	} catch (e) {
		// best-effort
	}
	return urls;
};

const ingestRemoteNote = async (remoteUser, note) => {
	if (!note?.id) return null;
	const activityPubId = note.id.href;
	const url = note.url?.href || note.urls?.[0]?.href || activityPubId;
	const content = sanitizeString(note.content || "");
	const createdOn = note.published ? new Date(note.published.toString()) : new Date();
	const updatedOn = note.updated ? new Date(note.updated.toString()) : null;
	const imageUrls = await extractImageUrls(note);
	const fields = { remoteUser: remoteUser._id, activityPubId, url, content, imageUrls, createdOn, updatedOn };

	const existing = await RemotePosts.findOne({ activityPubId }).select("_id").lean().exec();
	if (existing) {
		await RemotePosts.updateOne({ _id: existing._id }, { $set: fields });
		return existing._id;
	}
	return (await new RemotePosts(fields).save())._id;
};

const buildNoteObject = (ctx, identifier, post) => {
	const baseBlog = userBlogUrl(identifier);
	return new Note({
		id: ctx.getObjectUri(Note, { identifier, id: String(post._id) }),
		attribution: ctx.getActorUri(identifier),
		content: post.html || "",
		published: toInstant(post.createdOn),
		updated: post.updatedOn ? toInstant(post.updatedOn) : null,
		url: new URL(`post/${post._id}`, baseBlog),
		tos: [PUBLIC_COLLECTION],
		ccs: [ctx.getFollowersUri(identifier)],
		tags: (post.hashtags || []).map(
			(tag) =>
				new Hashtag({
					name: `#${tag}`,
					href: new URL(`?tag=${encodeURIComponent(tag)}`, baseBlog),
				})
		),
	});
};

const buildCreateActivity = (ctx, identifier, post) => {
	const noteUri = ctx.getObjectUri(Note, { identifier, id: String(post._id) });
	return new Create({
		id: new URL(`${noteUri.href}#create`),
		actor: ctx.getActorUri(identifier),
		object: buildNoteObject(ctx, identifier, post),
		published: toInstant(post.createdOn),
		tos: [PUBLIC_COLLECTION],
		ccs: [ctx.getFollowersUri(identifier)],
	});
};

const buildUpdateActivity = (ctx, identifier, post) => {
	const noteUri = ctx.getObjectUri(Note, { identifier, id: String(post._id) });
	return new Update({
		id: new URL(`${noteUri.href}#update-${Date.now()}`),
		actor: ctx.getActorUri(identifier),
		object: buildNoteObject(ctx, identifier, post),
		published: toInstant(new Date()),
		tos: [PUBLIC_COLLECTION],
		ccs: [ctx.getFollowersUri(identifier)],
	});
};

const buildDeleteActivity = (ctx, identifier, postId) => {
	const noteUri = ctx.getObjectUri(Note, { identifier, id: String(postId) });
	return new Delete({
		id: new URL(`${noteUri.href}#delete-${Date.now()}`),
		actor: ctx.getActorUri(identifier),
		object: new Tombstone({ id: noteUri }),
		published: toInstant(new Date()),
		tos: [PUBLIC_COLLECTION],
	});
};

const federation = createFederation({ kv: new MemoryKvStore() });

federation
	.setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
		const user = await Users.findOne({ username: identifier }).lean().exec();
		if (!user) return null;
		const keys = await ctx.getActorKeyPairs(identifier);
		return new Person({
			id: ctx.getActorUri(identifier),
			preferredUsername: identifier,
			name: user.name || identifier,
			summary: user.bioHTML || "",
			url: userBlogUrl(identifier),
			inbox: ctx.getInboxUri(identifier),
			outbox: ctx.getOutboxUri(identifier),
			followers: ctx.getFollowersUri(identifier),
			following: ctx.getFollowingUri(identifier),
			endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
			publicKey: keys[0]?.cryptographicKey,
			assertionMethods: keys.map((k) => k.multikey).filter(Boolean),
			icon: user.iconUrl ? new Image({ url: new URL(user.iconUrl) }) : null,
		});
	})
	.setKeyPairsDispatcher(async (ctx, identifier) => {
		const user = await Users.findOne({ username: identifier })
			.select("_id publicKey privateKey")
			.lean()
			.exec();
		if (!user) return [];
		if (!user.publicKey || !user.privateKey) {
			const kp = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
			const pubJwk = await exportJwk(kp.publicKey);
			const privJwk = await exportJwk(kp.privateKey);
			await Users.updateOne(
				{ _id: user._id },
				{ $set: { publicKey: JSON.stringify(pubJwk), privateKey: JSON.stringify(privJwk) } }
			);
			return [kp];
		}
		try {
			const publicKey = await importJwk(JSON.parse(user.publicKey), "public");
			const privateKey = await importJwk(JSON.parse(user.privateKey), "private");
			return [{ publicKey, privateKey }];
		} catch (e) {
			console.error("Failed to import keypair for", identifier, e.message);
			return [];
		}
	});

federation
	.setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier, cursor) => {
		const user = await Users.findOne({ username: identifier }).select("_id").lean().exec();
		if (!user) return null;
		const skip = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
		const posts = await Posts.find({ user: user._id, type: "post" })
			.sort("-createdOn")
			.skip(skip)
			.limit(PAGE_SIZE + 1)
			.lean()
			.exec();
		const hasMore = posts.length > PAGE_SIZE;
		const items = posts.slice(0, PAGE_SIZE).map((post) => buildCreateActivity(ctx, identifier, post));
		return { items, nextCursor: hasMore ? String(skip + PAGE_SIZE) : null };
	})
	.setFirstCursor(async () => "0")
	.setCounter(async (ctx, identifier) => {
		const user = await Users.findOne({ username: identifier }).select("_id").lean().exec();
		if (!user) return 0;
		return Posts.countDocuments({ user: user._id, type: "post" });
	});

federation
	.setFollowersDispatcher("/users/{identifier}/followers", async (ctx, identifier, cursor) => {
		const user = await Users.findOne({ username: identifier }).select("followers").lean().exec();
		if (!user) return null;
		const followers = user.followers || [];
		const skip = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
		const pageIds = followers.slice(skip, skip + PAGE_SIZE).map((f) => f.remoteUser);
		const remotes = await RemoteUsers.find({ _id: { $in: pageIds } })
			.select("actorUrl inboxUrl sharedInboxUrl")
			.lean()
			.exec();
		const byId = new Map(remotes.map((r) => [String(r._id), r]));
		const items = pageIds
			.map((id) => byId.get(String(id)))
			.filter(Boolean)
			.map((r) => ({
				id: new URL(r.actorUrl),
				inboxId: r.inboxUrl ? new URL(r.inboxUrl) : new URL(r.actorUrl),
				endpoints: r.sharedInboxUrl ? { sharedInbox: new URL(r.sharedInboxUrl) } : null,
			}));
		const hasMore = skip + PAGE_SIZE < followers.length;
		return { items, nextCursor: hasMore ? String(skip + PAGE_SIZE) : null };
	})
	.setFirstCursor(async () => "0")
	.setCounter(async (ctx, identifier) => {
		const user = await Users.findOne({ username: identifier }).select("followers").lean().exec();
		return user?.followers?.length || 0;
	});

federation
	.setFollowingDispatcher("/users/{identifier}/following", async (ctx, identifier, cursor) => {
		const user = await Users.findOne({ username: identifier }).select("follows").lean().exec();
		if (!user) return null;
		const follows = (user.follows || []).filter((f) => f.accepted);
		const skip = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
		const pageIds = follows.slice(skip, skip + PAGE_SIZE).map((f) => f.remoteUser);
		const remotes = await RemoteUsers.find({ _id: { $in: pageIds } })
			.select("actorUrl")
			.lean()
			.exec();
		const byId = new Map(remotes.map((r) => [String(r._id), r]));
		const items = pageIds
			.map((id) => byId.get(String(id)))
			.filter(Boolean)
			.map((r) => new URL(r.actorUrl));
		const hasMore = skip + PAGE_SIZE < follows.length;
		return { items, nextCursor: hasMore ? String(skip + PAGE_SIZE) : null };
	})
	.setFirstCursor(async () => "0")
	.setCounter(async (ctx, identifier) => {
		const user = await Users.findOne({ username: identifier }).select("follows").lean().exec();
		return (user?.follows || []).filter((f) => f.accepted).length;
	});

federation.setObjectDispatcher(Note, "/users/{identifier}/posts/{id}", async (ctx, { identifier, id }) => {
	const user = await Users.findOne({ username: identifier }).select("_id").lean().exec();
	if (!user) return null;
	let post;
	try {
		post = await Posts.findOne({ _id: id, user: user._id, type: "post" }).lean().exec();
	} catch (e) {
		return null;
	}
	if (!post) return null;
	return buildNoteObject(ctx, identifier, post);
});

federation
	.setInboxListeners("/users/{identifier}/inbox", "/inbox")
	.on(Follow, async (ctx, follow) => {
		const sender = await follow.getActor(ctx);
		const target = await follow.getObject(ctx);
		if (!sender || !target) return;
		const localUsername = parseLocalUsernameFromActorUrl(target.id);
		if (!localUsername) return;
		const localUser = await Users.findOne({ username: localUsername }).select("_id").lean().exec();
		if (!localUser) return;

		const remote = await upsertRemoteUserFromActor(sender);
		if (!remote) return;

		await Users.updateOne(
			{ _id: localUser._id, "followers.remoteUser": { $ne: remote._id } },
			{ $push: { followers: { remoteUser: remote._id, since: new Date() } } }
		);

		await ctx.sendActivity(
			{ identifier: localUsername },
			sender,
			new Accept({
				id: new URL(`${ctx.getActorUri(localUsername).href}#accepts/${Date.now()}`),
				actor: ctx.getActorUri(localUsername),
				object: follow,
			})
		);
	})
	.on(Undo, async (ctx, undo) => {
		const inner = await undo.getObject(ctx);
		if (!(inner instanceof Follow)) return;
		const senderActor = await undo.getActor(ctx);
		if (!senderActor) return;
		const target = await inner.getObject(ctx);
		if (!target) return;
		const localUsername = parseLocalUsernameFromActorUrl(target.id);
		if (!localUsername) return;
		const localUser = await Users.findOne({ username: localUsername }).select("_id").lean().exec();
		if (!localUser) return;
		const remote = await RemoteUsers.findOne({ actorUrl: senderActor.id.href }).select("_id").lean().exec();
		if (!remote) return;
		await Users.updateOne({ _id: localUser._id }, { $pull: { followers: { remoteUser: remote._id } } });
	})
	.on(Accept, async (ctx, accept) => {
		const senderActor = await accept.getActor(ctx);
		if (!senderActor) return;
		const remote = await RemoteUsers.findOne({ actorUrl: senderActor.id.href }).select("_id").lean().exec();
		if (!remote) return;
		await Users.updateMany(
			{ "follows.remoteUser": remote._id },
			{ $set: { "follows.$.accepted": true } }
		);
	})
	.on(Reject, async (ctx, reject) => {
		const senderActor = await reject.getActor(ctx);
		if (!senderActor) return;
		const remote = await RemoteUsers.findOne({ actorUrl: senderActor.id.href }).select("_id").lean().exec();
		if (!remote) return;
		await Users.updateMany(
			{ "follows.remoteUser": remote._id },
			{ $pull: { follows: { remoteUser: remote._id } } }
		);
	})
	.on(Create, async (ctx, create) => {
		const note = await create.getObject(ctx);
		if (!(note instanceof Note)) return;
		const author = (await note.getAttribution(ctx)) || (await create.getActor(ctx));
		if (!author?.id) return;
		const remote = await RemoteUsers.findOne({ actorUrl: author.id.href }).select("_id").lean().exec();
		if (!remote) return;
		const localFollower = await Users.findOne({ "follows.remoteUser": remote._id })
			.select("_id")
			.lean()
			.exec();
		if (!localFollower) return;
		await ingestRemoteNote(remote, note);
	})
	.on(Update, async (ctx, update) => {
		const note = await update.getObject(ctx);
		if (!(note instanceof Note)) return;
		const author = (await note.getAttribution(ctx)) || (await update.getActor(ctx));
		if (!author?.id) return;
		const remote = await RemoteUsers.findOne({ actorUrl: author.id.href }).select("_id").lean().exec();
		if (!remote) return;
		await ingestRemoteNote(remote, note);
	})
	.on(Delete, async (ctx, del) => {
		const target = del.objectId;
		if (!target) return;
		await RemotePosts.deleteOne({ activityPubId: target.href });
	});

const ingestRemoteOutbox = async (ctx, remoteUser, limit = PAGE_SIZE) => {
	if (!remoteUser.outboxUrl) return 0;
	let outbox;
	try {
		outbox = await ctx.lookupObject(new URL(remoteUser.outboxUrl));
	} catch (e) {
		console.error("Failed to lookup outbox", e.message);
		return 0;
	}
	if (!outbox) return 0;

	let ingested = 0;
	try {
		for await (const item of ctx.traverseCollection(outbox)) {
			if (ingested >= limit) break;
			let note = null;
			if (item instanceof Note) note = item;
			else if (item instanceof Create) {
				const inner = await item.getObject(ctx);
				if (inner instanceof Note) note = inner;
			}
			if (!note) continue;
			try {
				const author = (await note.getAttribution(ctx)) || (item.getActor ? await item.getActor(ctx) : null);
				if (author?.id && author.id.href !== remoteUser.actorUrl) continue;
			} catch (e) {
				// proceed if attribution lookup fails
			}
			try {
				await ingestRemoteNote(remoteUser, note);
				ingested++;
			} catch (e) {
				console.error("Failed to ingest remote note", e.message);
			}
		}
	} catch (e) {
		console.error("Failed to traverse outbox", e.message);
	}
	return ingested;
};

const followRemoteUser = async (localUser, handleOrUrl) => {
	const baseRequestUrl = new URL(config.URL);
	const ctx = federation.createContext(baseRequestUrl, undefined);
	const remoteActor = await ctx.lookupObject(handleOrUrl);
	if (!remoteActor?.id) throw new Error("Could not resolve remote actor");

	const remote = await upsertRemoteUserFromActor(remoteActor);
	if (!remote) throw new Error("Failed to store remote actor");

	await Users.updateOne(
		{ _id: localUser._id, "follows.remoteUser": { $ne: remote._id } },
		{ $push: { follows: { remoteUser: remote._id, since: new Date(), accepted: false } } }
	);

	const followActivityId = new URL(
		`${ctx.getActorUri(localUser.username).href}/follows/${remote._id}`
	);
	const followActivity = new Follow({
		id: followActivityId,
		actor: ctx.getActorUri(localUser.username),
		object: new URL(remote.actorUrl),
	});

	try {
		await ctx.sendActivity({ identifier: localUser.username }, remoteActor, followActivity);
	} catch (e) {
		console.error("Failed to send Follow", e.message);
	}

	const ingested = await ingestRemoteOutbox(ctx, remote, PAGE_SIZE);
	return { remoteUser: remote, postsIngested: ingested };
};

const unfollowRemoteUser = async (localUser, remoteUserId) => {
	const baseRequestUrl = new URL(config.URL);
	const ctx = federation.createContext(baseRequestUrl, undefined);
	const remote = await RemoteUsers.findById(remoteUserId).lean().exec();
	if (!remote) throw new Error("Remote user not found");

	let remoteActor = null;
	try {
		remoteActor = await ctx.lookupObject(new URL(remote.actorUrl));
	} catch (e) {
		// best-effort
	}

	const followActivityId = new URL(
		`${ctx.getActorUri(localUser.username).href}/follows/${remote._id}`
	);
	const followActivity = new Follow({
		id: followActivityId,
		actor: ctx.getActorUri(localUser.username),
		object: new URL(remote.actorUrl),
	});
	const undoActivity = new Undo({
		id: new URL(`${followActivityId.href}#undo-${Date.now()}`),
		actor: ctx.getActorUri(localUser.username),
		object: followActivity,
	});

	if (remoteActor) {
		try {
			await ctx.sendActivity({ identifier: localUser.username }, remoteActor, undoActivity);
		} catch (e) {
			console.error("Failed to send Undo Follow", e.message);
		}
	}

	await Users.updateOne({ _id: localUser._id }, { $pull: { follows: { remoteUser: remote._id } } });
	return { remoteUser: remote };
};

const broadcastPostActivity = async (localUser, activityBuilder) => {
	const baseRequestUrl = new URL(config.URL);
	const ctx = federation.createContext(baseRequestUrl, undefined);
	const activity = activityBuilder(ctx, localUser.username);
	try {
		await ctx.sendActivity({ identifier: localUser.username }, "followers", activity);
	} catch (e) {
		console.error("Failed to broadcast", e.message);
	}
};

const broadcastPostCreate = (localUser, post) =>
	broadcastPostActivity(localUser, (ctx, identifier) => buildCreateActivity(ctx, identifier, post));

const broadcastPostUpdate = (localUser, post) =>
	broadcastPostActivity(localUser, (ctx, identifier) => buildUpdateActivity(ctx, identifier, post));

const broadcastPostDelete = (localUser, postId) =>
	broadcastPostActivity(localUser, (ctx, identifier) => buildDeleteActivity(ctx, identifier, postId));

const isFederationPath = (req) => {
	const p = req.path;
	return p.startsWith("/users/") || p === "/inbox" || p.startsWith("/nodeinfo");
};

module.exports = {
	federation,
	followRemoteUser,
	unfollowRemoteUser,
	broadcastPostCreate,
	broadcastPostUpdate,
	broadcastPostDelete,
	isFederationPath,
};
