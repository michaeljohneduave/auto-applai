import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useNewSession } from "./api";
import ApplicationList from "./components/ApplicationList";
import AssetDisplayDialog from "./components/AssetDisplayDialog";
import BaseAssetTabs from "./components/BaseAssetTabs";
import Header from "./components/Header";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { UIProvider } from "./contexts/UIContext";

function App() {
	const newSession = useNewSession();
	const [url, setUrl] = useState("");
	const [showReturnToExtension, setShowReturnToExtension] = useState(false);
	const [returnTabId, setReturnTabId] = useState<string | null>(null);
	const [returnTabUrl, setReturnTabUrl] = useState<string | null>(null);

	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const tabId = urlParams.get("returnTabId");
		const tabUrl = urlParams.get("returnTabUrl");
		if (tabId && tabUrl) {
			setReturnTabId(tabId);
			setReturnTabUrl(tabUrl);
			setShowReturnToExtension(true);
		}
	}, []);

	const handleNewSession = () => {
		newSession({ jobUrl: url });
		setUrl("");
	};

	const handleCloseBanner = () => {
		setShowReturnToExtension(false);
		setReturnTabId(null);
		setReturnTabUrl(null);
		history.replaceState(null, "", window.location.pathname);
	};

	return (
		<UIProvider>
			<SignedOut>
				<div className="flex justify-center items-center h-screen">
					<SignInButton />
				</div>
			</SignedOut>
			<SignedIn>
				<div className="flex flex-col h-screen">
					<Header />
					{showReturnToExtension && (
						<div className="bg-green-50 border-b border-green-200 p-4 relative">
							<button
								onClick={handleCloseBanner}
								className="absolute top-2 right-2 text-green-700 hover:text-green-900 focus:outline-none"
								aria-label="Close banner"
								type="button"
							>
								&times;
							</button>
							<div className="flex items-center space-x-3">
								<div className="flex-shrink-0">
									<svg
										className="h-5 w-5 text-green-400"
										fill="currentColor"
										viewBox="0 0 20 20"
										aria-hidden="true"
									>
										<title>Success</title>
										<path
											fillRule="evenodd"
											d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
											clipRule="evenodd"
										/>
									</svg>
								</div>
								<div>
									<p className="text-sm font-medium text-green-800">
										Login successful!
									</p>
									<p className="text-xs text-green-600 mt-1">
										Please return to your extension popup to continue.
									</p>
									{returnTabUrl && (
										<p className="text-xs text-green-600 mt-1">
											Original tab: {new URL(returnTabUrl).hostname}
										</p>
									)}
								</div>
							</div>
						</div>
					)}
					<div className="flex flex-1 justify-center overflow-hidden">
						<aside className="max-w-[1200px] w-full overflow-auto p-4">
							<div className="flex flex-col gap-y-4">
								<div className="flex flex-col gap-y-1">
									<span>Enter URL:</span>
									<div className="flex gap-2">
										<Input
											value={url}
											onChange={(evt) => setUrl(evt.target.value.trim())}
										/>
										<Button onClick={handleNewSession}>Go!</Button>
									</div>
								</div>
								<BaseAssetTabs />
								<ApplicationList />
							</div>
						</aside>
						{/* <main className="flex-1 overflow-auto p-">
							<AssetDisplay />
						</main> */}
					</div>
					<AssetDisplayDialog />
				</div>
			</SignedIn>
		</UIProvider>
	);
}

export default App;
