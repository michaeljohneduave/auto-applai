import { useQuery } from "@tanstack/react-query";
import { useFetchBaseAssets } from "../api";
import { useUI } from "../contexts/UIContext";
import Spinner from "./Spinner";

export default function BaseAssetTabs() {
	const fetchBaseAssets = useFetchBaseAssets();
	const {
		data: asset,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["baseAssets"],
		queryFn: fetchBaseAssets,
	});
	const { selected, selectBaseAsset } = useUI();

	if (isLoading) return <Spinner />;
	if (isError) return <div>Error loading assets</div>;

	return (
		<div className="flex border-b">
			<button
				type="button"
				key={asset.baseResume}
				onClick={() => selectBaseAsset(asset.baseResume)}
				className={`px-4 py-2 -mb-px border-b-2 ${
					selected?.id === asset.id && selected?.source === "base"
						? "border-blue-500 text-blue-500"
						: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
				}`}
			>
				{asset.name}
			</button>
			<button
				type="button"
				key={asset.personalInfo}
				onClick={() => selectBaseAsset(asset.personalInfo)}
				className={`px-4 py-2 -mb-px border-b-2 ${
					selected?.id === asset.id && selected?.source === "base"
						? "border-blue-500 text-blue-500"
						: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
				}`}
			>
				{asset.name}
			</button>
		</div>
	);
}
