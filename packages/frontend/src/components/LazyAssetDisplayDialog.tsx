import { lazy, Suspense } from "react";

// Lazy load the heavy AssetDisplayDialog component
const AssetDisplayDialog = lazy(() => import("./AssetDisplayDialog"));

// Loading component specifically for the dialog
const DialogLoadingSpinner = () => (
	<div className="flex justify-center items-center p-4">
		<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
	</div>
);

export default function LazyAssetDisplayDialog() {
	return (
		<Suspense fallback={<DialogLoadingSpinner />}>
			<AssetDisplayDialog />
		</Suspense>
	);
}
