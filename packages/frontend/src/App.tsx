import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import ApplicationList from "./components/ApplicationList";
import AssetDisplay from "./components/AssetDisplay";
import BaseAssetTabs from "./components/BaseAssetTabs";
import Header from "./components/Header";
import { UIProvider } from "./contexts/UIContext";

function App() {
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
					<div className="flex flex-1 overflow-hidden">
						<aside className="w-1/2 border-r overflow-auto p-4">
							<BaseAssetTabs />
							<ApplicationList />
						</aside>
						<main className="flex-1 overflow-auto p-4">
							<AssetDisplay />
						</main>
					</div>
				</div>
			</SignedIn>
			/
		</UIProvider>
	);
}

export default App;
