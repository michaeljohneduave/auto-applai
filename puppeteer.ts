import puppeteer, { type LaunchOptions, type Browser } from "puppeteer";

const defaultLaunchOptions: LaunchOptions = {
	headless: true,
	userDataDir: "/tmp/puppeteer_user_data",
};

export default class Muppeteer {
	// @ts-ignore
	private browser: Browser;

	async initialize(args?: LaunchOptions) {
		this.browser = await puppeteer.launch({
			...defaultLaunchOptions,
			...args,
		});
	}

	async newPage(url?: string) {
		const page = await this.browser.newPage();

		if (url) {
			await page.goto(url, {
				waitUntil: "networkidle0",
			});
		}

		return page;
	}

	async close() {
		await this.browser.close();
	}
}
