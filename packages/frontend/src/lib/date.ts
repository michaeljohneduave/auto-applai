import tinydate from "tinydate";

const cache = new Map<string, ReturnType<typeof tinydate>>();

function compile(pattern: string) {
	let tpl = cache.get(pattern);
	if (!tpl) {
		tpl = tinydate(pattern);
		cache.set(pattern, tpl);
	}
	return tpl;
}

export function formatDateTime(
	input: Date | string | number,
	pattern = "{YYYY}-{MM}-{DD} {HH}:{mm}",
): string {
	const date = input instanceof Date ? input : new Date(input);
	return compile(pattern)(date);
}

export function formatTime(
	input: Date | string | number,
	pattern = "{HH}:{mm}",
): string {
	const date = input instanceof Date ? input : new Date(input);
	return compile(pattern)(date);
}

export function isToday(input: Date | string | number): boolean {
	const d = input instanceof Date ? input : new Date(input);
	const now = new Date();
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	);
}

export function formatSmartDate(input: Date | string | number): string {
	return isToday(input) ? formatTime(input) : formatDateTime(input);
}
