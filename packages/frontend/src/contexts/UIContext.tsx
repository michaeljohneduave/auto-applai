import { createContext, type ReactNode, useContext, useState } from "react";

export type AssetType = "md" | "pdf" | "form" | "latex" | "json";

export type SelectedItem = {
	id: string;
	source: "base" | "list";
	type: AssetType;
	content: string;
	name: string;
} | null;

type UIContextType = {
	selected: SelectedItem;
	setAsset: (params: SelectedItem) => void;
};

const UIContext = createContext<UIContextType>({
	selected: null,
	setAsset: () => {},
});

export const UIProvider = ({ children }: { children: ReactNode }) => {
	const [selected, setSelected] = useState<SelectedItem>(null);

	const setAsset = (params: SelectedItem) => {
		setSelected(params);
	};

	return (
		<UIContext.Provider value={{ selected, setAsset }}>
			{children}
		</UIContext.Provider>
	);
};

export const useUI = () => useContext(UIContext);
