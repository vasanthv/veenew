/* global axios, Vue */

const defaultState = function () {
	const params = new URLSearchParams(window.location.search);
	return {
		toast: [{ type: "", message: "" }],
		newAccount: { username: "", email: "", password: "" },
		authCreds: { username: "", password: "" },
		post: { text: params.has("text") ? params.get("text") : "", slug: "" },
		myAccount: { username: "", email: "", password: "", name: "", bio: "", menu: [] },
		followHandle: "",
		deleteConfirm: false,
		isLoading: false,
	};
};
function redirect(path, replace = false) {
	if (replace) window.location.replace(path);
	else window.location.href = path;
}
const App = Vue.createApp({
	data() {
		return defaultState();
	},
	methods: {
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 3500);
		},
		signUp() {
			if (!this.newAccount.username || !this.newAccount.email || !this.newAccount.password) {
				return this.setToast("All fields are mandatory");
			}
			axios.post("/api/signup", this.newAccount).then(this.authenticate);
		},
		signIn() {
			if (!this.authCreds.username || !this.authCreds.password) {
				return this.setToast("Please enter valid details");
			}
			axios.post("/api/login", this.authCreds).then(this.authenticate);
		},
		forgotPassword() {
			if (!this.authCreds.username) {
				return this.setToast("Please enter your username");
			}
			axios.post("/api/reset", { username: this.authCreds.username }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		authenticate(response) {
			this.setToast(response.data.message, "success");
			redirect(this.urlState ?? "/", true);
		},
		resendVerification() {
			axios.post("/api/resend").then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		updateAccount() {
			const payload = {
				...this.myAccount,
				menu: (this.myAccount.menu || [])
					.map((item) => ({
						name: (item?.name || "").trim(),
						link: (item?.link || "").trim(),
					}))
					.filter((item) => item.name || item.link),
			};
			axios.put("/api/account", payload).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		addMenuItem() {
			if (!Array.isArray(this.myAccount.menu)) this.myAccount.menu = [];
			this.myAccount.menu.push({ name: "", link: "" });
		},
		removeMenuItem(index) {
			this.myAccount.menu.splice(index, 1);
		},
		startPremiumCheckout() {
			axios.post("/api/premium/checkout").then((response) => {
				redirect(response.data.checkoutUrl);
			});
		},
		confirmPremiumFromUrl() {
			const params = new URLSearchParams(window.location.search);
			if (params.get("stripe") !== "success") return;
			const sessionId = params.get("session_id");
			if (!sessionId) return this.setToast("Missing Stripe checkout session");

			axios.post("/api/premium/confirm", { sessionId }).then((response) => {
				this.myAccount.isFreeUser = false;
				this.setToast(response.data.message, "success");
				params.delete("stripe");
				params.delete("session_id");
				const nextQuery = params.toString();
				const path = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
				window.history.replaceState({}, "", path);
			});
		},
		deleteAccount() {
			if (confirm("Are you sure you want to delete your account?")) {
				axios.delete("/api/account").then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/logout");
				});
			}
		},
		onPostChange() {
			const key = window.location.pathname === "/pages/new" ? "newPage" : "newPost";
			window.localStorage.setItem(key, this.post.text);
		},
		createPost() {
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const text = this.post.text.trim();
			axios.post("/api/posts", { text }).then((response) => {
				window.localStorage.removeItem("newPost");
				this.setToast(response.data.message, "success");
				redirect("/");
			});
		},
		updatePost(id) {
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const text = this.post.text.trim();
			axios.put("/api/posts/" + id, { text }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		deletePost(id) {
			if (confirm("Are you sure you want to delete this post? There is no undo")) {
				axios.delete(`/api/posts/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/");
				});
			}
		},
		createPage() {
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			if (!this.post.slug.trim()) return this.setToast("Slug cannot be empty");
			const text = this.post.text.trim();
			const slug = this.post.slug.trim();
			axios.post("/api/pages", { text, slug }).then((response) => {
				window.localStorage.removeItem("newPage");
				this.setToast(response.data.message, "success");
				redirect("/pages");
			});
		},
		updatePage(id) {
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			if (!this.post.slug.trim()) return this.setToast("Slug cannot be empty");
			const text = this.post.text.trim();
			const slug = this.post.slug.trim();
			axios.put("/api/pages/" + id, { text, slug }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		deletePage(id) {
			if (confirm("Are you sure you want to delete this page? There is no undo")) {
				axios.delete(`/api/pages/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/pages");
				});
			}
		},
		followRemote() {
			const handle = (this.followHandle || "").trim();
			if (!handle) return this.setToast("Enter a handle like user@instance");
			this.isLoading = true;
			axios
				.post("/api/follows", { handle })
				.then((response) => {
					this.setToast(response.data.message, "success");
					setTimeout(() => redirect("/timeline"), 1000);
				})
				.finally(() => {
					this.isLoading = false;
				});
		},
		unfollowRemote(id) {
			if (!confirm("Are you sure you want to unfollow this user?")) return;
			axios.delete(`/api/follows/${id}`).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		timeAgo(dateString) {
			const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
			let interval = seconds / 31536000;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} year${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 2592000;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} month${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 86400;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} day${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 3600;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} hour${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 60;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} minute${count === 1 ? "" : "s"} ago`;
			}
			return "now";
		},
	},
}).mount("#app");

(() => {
	const csrfToken = document.cookie
		.split("; ")
		.find((c) => c.startsWith("csrf_cookie="))
		?.split("=")[1];
	if (csrfToken) axios.defaults.headers.common["x-csrf-token"] = csrfToken;

	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			console.log(error);
			App.setToast(error.response.data.message || "Something went wrong. Please try again");
			throw error;
		}
	);

	if (window.location.pathname === "/settings") App.confirmPremiumFromUrl();
})();
