import { format, isToday as dateFnsIsToday } from "date-fns";

const cache = new Map<string, (date: Date) => string>();

function compile(pattern: string) {
	let tpl = cache.get(pattern);
	if (!tpl) {
		// Convert tinydate patterns to date-fns format
		const dateFnsPattern = pattern
			.replace(/{YYYY}/g, 'yyyy')
			.replace(/{MM}/g, 'MM')
			.replace(/{DD}/g, 'dd')
			.replace(/{HH}/g, 'HH')
			.replace(/{mm}/g, 'mm')
			.replace(/{ss}/g, 'ss');
		
		tpl = (date: Date) => format(date, dateFnsPattern);
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
	return dateFnsIsToday(d);
}

export function formatSmartDate(input: Date | string | number): string {
	return isToday(input) ? formatTime(input) : formatDateTime(input);
}
