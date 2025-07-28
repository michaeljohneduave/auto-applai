import { useQuery } from "@tanstack/react-query";
import { useFetchBaseAssets } from "../api";
import { useUI } from "../contexts/UIContext";
import Spinner from "./Spinner";
import { Button } from "./ui/button";

export default function BaseAssetTabs() {
	const fetchBaseAssets = useFetchBaseAssets();
	const {
		data: assets,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["baseAssets"],
		queryFn: fetchBaseAssets,
	});
	const { setAsset } = useUI();

	if (isLoading) return <Spinner />;
	if (isError) return <div>Error loading assets</div>;

	return (
		<div className="flex gap-1">
			<Button
				variant="outline"
				className="cursor-pointer"
				onClick={() =>
					setAsset({
						id: "base-resume.md",
						content: assets.baseResumeMd,
						source: "base",
						type: "md",
						name: "Base Resume (MD)",
					})
				}
			>
				Resume.md
			</Button>
			<Button
				variant="outline"
				className="cursor-pointer"
				onClick={() =>
					setAsset({
						id: "base-resume.tex",
						content: assets.baseResumeLatex,
						source: "base",
						type: "latex",
						name: "Base Resume (Tex)",
					})
				}
			>
				Resume.tex
			</Button>
			<Button
				variant="outline"
				className="cursor-pointer"
				onClick={() =>
					setAsset({
						id: "personal-info.md",
						content: assets.personalInfoMd,
						source: "base",
						type: "md",
						name: "Personal Info",
					})
				}
			>
				Personal Info
			</Button>
		</div>
	);
}
