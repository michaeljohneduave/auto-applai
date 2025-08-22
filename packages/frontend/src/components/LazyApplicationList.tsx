import { lazy, Suspense } from "react";

// Lazy load the heavy ApplicationList component
const ApplicationList = lazy(() => import("./ApplicationList"));

// Loading component specifically for the application list
const ListLoadingSpinner = () => (
	<div className="flex justify-center items-center p-8">
		<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
		<span className="ml-2 text-gray-600">Loading applications...</span>
	</div>
);

export default function LazyApplicationList() {
	return (
		<Suspense fallback={<ListLoadingSpinner />}>
			<ApplicationList />
		</Suspense>
	);
}
