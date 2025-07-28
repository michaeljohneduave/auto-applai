import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { useState } from "react";
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

	const handleNewSession = () => {
		newSession({ jobUrl: url });
		setUrl("");
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
					<div className="flex flex-1 justify-center overflow-hidden">
						<aside className="w-[900px] overflow-auto p-4">
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
