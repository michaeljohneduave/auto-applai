import type {
	ColumnSizingState,
	SortingState,
	VisibilityState,
} from "@tanstack/react-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ApplicationsTablePrefs = {
	columnVisibility: VisibilityState;
	columnOrder: string[];
	columnSizing: ColumnSizingState;
	sorting: SortingState;
	globalSearch?: string;
	columnDensity?: "compact" | "normal" | "comfortable";
	pagination: {
		pageIndex: number;
		pageSize: number;
	};
};

type Store = {
	prefs: ApplicationsTablePrefs;
	setPrefs: (partial: Partial<ApplicationsTablePrefs>) => void;
	reset: () => void;
};

const defaultPrefs: ApplicationsTablePrefs = {
	columnVisibility: {},
	columnOrder: [],
	columnSizing: {},
	sorting: [],
	globalSearch: "",
	columnDensity: "normal",
	pagination: {
		pageIndex: 0,
		pageSize: 25,
	},
};

export const useApplicationsTablePrefs = create<Store>()(
	persist(
		(set) => ({
			prefs: defaultPrefs,
			setPrefs: (partial) =>
				set((state) => ({
					prefs: { ...state.prefs, ...partial },
				})),
			reset: () => set({ prefs: defaultPrefs }),
		}),
		{
			name: "applicationsTablePrefs",
			version: 1,
			partialize: (state) => state, // persist entire store
		},
	),
);
