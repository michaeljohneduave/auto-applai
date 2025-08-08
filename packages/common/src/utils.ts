import * as R from "remeda";

export function getResumeFileName(
	fullName: string,
	shortName: string,
	shortTitle: string,
): string {
	return R.toKebabCase(
		[fullName, shortName, shortTitle, "resume"]
			.filter(Boolean)
			.join(" ")
			.replace(/[.,]/gi, ""),
	);
}
