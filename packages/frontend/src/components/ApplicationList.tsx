import type { GetSessionsResponse } from "@auto-apply/api/src/server.ts";
import { getResumeFileName } from "@auto-apply/common/src/utils";
import type { Sessions } from "@auto-apply/core/src/db/schema";
import { rankItem } from "@tanstack/match-sorter-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ColumnDef,
	type FilterFn,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	Download,
	FileClock,
	FileUser,
	Link2,
	MoveDownLeft,
	MoveUpRight,
	RotateCcw,
	ScrollText,
	Settings2,
	Trash2,
} from "lucide-react";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as R from "remeda";
import { formatSmartDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
	useDeleteSession,
	useFetchSessions,
	useFetchSessionsCount,
	useRetrySession,
	useUpdateJobStatus,
	useUpdateSessionNotes,
} from "../api";
import { useApiClient } from "../api/client";
import { useUI } from "../contexts/UIContext";
import { useApplicationsTablePrefs } from "../stores/tablePrefs";
import Spinner from "./Spinner";
import StatusIcon from "./StatusIcon";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

// Skeleton component for loading states
const Skeleton = ({ className = "" }: { className?: string }) => (
	<div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

export default function ApplicationList() {
	const fetchApplications = useFetchSessions();
	const fetchSessionsCount = useFetchSessionsCount();

	const updateJobStatus = useUpdateJobStatus();
	const deleteSession = useDeleteSession();
	const retrySession = useRetrySession();
	const updateSessionNotes = useUpdateSessionNotes();
	const queryClient = useQueryClient();
	const { prefs, setPrefs, reset } = useApplicationsTablePrefs();

	const fetchSessionsWithPagination = useCallback(() => {
		return fetchApplications({
			limit: prefs.pagination.pageSize,
			skip: prefs.pagination.pageIndex * prefs.pagination.pageSize,
		});
	}, [
		fetchApplications,
		prefs.pagination.pageSize,
		prefs.pagination.pageIndex,
	]);

	const {
		data: sessions,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["applications", prefs.pagination],
		queryFn: fetchSessionsWithPagination,
	});

	const { data: countData, isLoading: isCountLoading } = useQuery({
		queryKey: ["applications-count"],
		queryFn: fetchSessionsCount,
	});

	const totalCount = countData?.count ?? 0;
	const pageCount = Math.ceil(totalCount / prefs.pagination.pageSize);
	const { setAsset } = useUI();
	const apiClient = useApiClient();

	useEffect(() => {
		let eventSource: EventSource | null;

		try {
			eventSource = new EventSource("/api/events");

			eventSource.addEventListener("session:update", () => {
				queryClient.invalidateQueries({ queryKey: ["applications"] });
				queryClient.invalidateQueries({ queryKey: ["applications-count"] });
			});
		} catch (e) {
			console.error(e);
		}

		return () => {
			if (eventSource) {
				eventSource.close();
			}
		};
	}, [queryClient]);

	const handleAssetClick = useCallback(
		async (
			id: string,
			type: "resume" | "cover-letter" | "answered-form" | "logs",
		) => {
			const session = sessions.find((session) => session.id === id);

			if (!session) {
				console.error("Clicking on asset but session not found");
				return;
			}

			switch (type) {
				case "answered-form":
					setAsset({
						content: JSON.stringify(session.answeredForm),
						id: session.id,
						name: "answered-form",
						source: "list",
						type: "form",
					});
					break;
				case "cover-letter":
					setAsset({
						content: session.coverLetter,
						id: session.id,
						name: "coverLetter",
						source: "list",
						type: "md",
					});
					break;
				case "resume": {
					try {
						// Prefer DB-backed variants; fallback to file-based resume.tex
						const list = await apiClient.get(`/sessions/${id}/latex-variants`);
						if (Array.isArray(list) && list.length > 0) {
							const best = list[0];
							const variant = await apiClient.get(
								`/sessions/${id}/latex-variants/${best.id}`,
							);
							setAsset({
								id,
								content: variant.latex,
								name: best.name,
								fileName: best.downloadFileName,
								source: "list",
								type: "latex",
								variantId: best.id,
								isDbVariant: true,
								score: best.score ?? null,
							});
						}
					} catch (e) {
						console.error("Failed to load latex variant", e);
					}

					break;
				}
				case "logs":
					setAsset({
						id,
						content: "", // We'll use the SessionLogsViewer component instead
						name: "sessionLogs",
						source: "list",
						type: "logs", // New type for logs
					});
					break;
			}
		},
		[sessions, setAsset, apiClient],
	);

	const handleChangeJobStatus = useCallback(
		async (sessionId: string, nextStatus: Sessions["jobStatus"]) => {
			try {
				await updateJobStatus(sessionId, { jobStatus: nextStatus });
				queryClient.invalidateQueries({ queryKey: ["applications"] });
				queryClient.invalidateQueries({ queryKey: ["applications-count"] });
			} catch (error) {
				console.error("Error updating job status:", error);
			}
		},
		[updateJobStatus, queryClient],
	);

	const handleDeleteSession = useCallback(
		async (sessionId: string) => {
			if (confirm("Are you sure you want to delete this session?")) {
				try {
					await deleteSession(sessionId);
					queryClient.invalidateQueries({ queryKey: ["applications"] });
					queryClient.invalidateQueries({ queryKey: ["applications-count"] });
				} catch (error) {
					console.error("Error deleting session:", error);
				}
			}
		},
		[deleteSession, queryClient],
	);

	const handleRetrySession = useCallback(
		async (sessionId: string) => {
			if (confirm("Are you sure you want to retry this session?")) {
				try {
					await retrySession(sessionId);
					queryClient.invalidateQueries({ queryKey: ["applications"] });
					queryClient.invalidateQueries({ queryKey: ["applications-count"] });
				} catch (error) {
					console.error("Error retrying session:", error);
				}
			}
		},
		[retrySession, queryClient],
	);

	const [notesDialog, setNotesDialog] = useState<{
		open: boolean;
		sessionId: string | null;
		value: string;
	}>({ open: false, sessionId: null, value: "" });

	const openNotes = useCallback(
		(sessionId: string) => {
			const current = sessions.find((s) => s.id === sessionId);
			setNotesDialog({ open: true, sessionId, value: current?.notes ?? "" });
		},
		[sessions],
	);

	const closeNotes = useCallback(() => {
		setNotesDialog({ open: false, sessionId: null, value: "" });
	}, []);

	const handleSaveNotes = useCallback(async () => {
		if (!notesDialog.sessionId) return;
		try {
			await updateSessionNotes(notesDialog.sessionId, {
				notes: notesDialog.value,
			});
			closeNotes();
			queryClient.invalidateQueries({ queryKey: ["applications"] });
			queryClient.invalidateQueries({ queryKey: ["applications-count"] });
		} catch (e) {
			console.error(e);
		}
	}, [notesDialog, updateSessionNotes, closeNotes, queryClient]);

	const handleSaveAndRetryNotes = useCallback(async () => {
		if (!notesDialog.sessionId) return;
		try {
			await updateSessionNotes(notesDialog.sessionId, {
				notes: notesDialog.value,
			});
			await retrySession(notesDialog.sessionId);
			closeNotes();
			queryClient.invalidateQueries({ queryKey: ["applications"] });
			queryClient.invalidateQueries({ queryKey: ["applications-count"] });
		} catch (e) {
			console.error(e);
		}
	}, [notesDialog, updateSessionNotes, retrySession, closeNotes, queryClient]);

	const [columnMenuOpen, setColumnMenuOpen] = useState(false);
	const columnsBtnRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
		null,
	);

	useEffect(() => {
		if (!columnMenuOpen) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				menuRef.current &&
				!menuRef.current.contains(target) &&
				columnsBtnRef.current &&
				!columnsBtnRef.current.contains(target)
			) {
				setColumnMenuOpen(false);
			}
		};
		const refreshPos = () => {
			if (columnsBtnRef.current) {
				const rect = columnsBtnRef.current.getBoundingClientRect();
				setMenuPos({
					top: rect.bottom + 8 + window.scrollY,
					left: rect.left + window.scrollX,
				});
			}
		};
		document.addEventListener("mousedown", handler);
		window.addEventListener("resize", refreshPos);
		window.addEventListener("scroll", refreshPos, true);
		refreshPos();
		return () => {
			document.removeEventListener("mousedown", handler);
			window.removeEventListener("resize", refreshPos);
			window.removeEventListener("scroll", refreshPos, true);
		};
	}, [columnMenuOpen]);

	const data = useMemo(() => sessions ?? [], [sessions]);
	const [sorting, setSorting] = useState<SortingState>(prefs.sorting);
	const [globalFilter, setGlobalFilter] = useState(prefs.globalSearch ?? "");
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: prefs.pagination.pageIndex,
		pageSize: prefs.pagination.pageSize,
	});

	const fuzzyFilter = useCallback<FilterFn<GetSessionsResponse[number]>>(
		(row, columnId, value, addMeta) => {
			const itemRank = rankItem(
				String(row.getValue(columnId) ?? ""),
				String(value ?? ""),
			);
			addMeta?.({ itemRank });
			return itemRank.passed;
		},
		[],
	);

	const columns = useMemo<ColumnDef<GetSessionsResponse[number]>[]>(
		() => [
			{
				id: "notes",
				header: "Notes",
				cell: ({ row }) => {
					const hasNotes = Boolean(row.original.notes);
					return (
						<Button
							size="sm"
							variant="ghost"
							className="relative cursor-pointer hover:scale-125"
							onClick={() => openNotes(row.original.id)}
							title={hasNotes ? "Edit notes" : "Add notes"}
						>
							<ScrollText />
							{hasNotes ? (
								<span className="absolute right-1 top-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
							) : null}
						</Button>
					);
				},
				enableSorting: false,
				size: 80,
			},
			{
				id: "company",
				header: "Company",
				accessorFn: (row) =>
					row.companyInfo?.shortName ?? row.companyInfo?.name ?? "",
				cell: (info) => {
					const value = info.getValue<string>();
					return value ? (
						<span>{value}</span>
					) : (
						<Skeleton className="h-4 w-24" />
					);
				},
				size: 200,
				filterFn: fuzzyFilter,
				enableGlobalFilter: true,
			},
			{
				id: "title",
				header: "Title",
				accessorFn: (row) =>
					row.jobInfo?.shortTitle ?? row.jobInfo?.title ?? "",
				cell: (info) => {
					const value = info.getValue<string>();
					return value ? (
						<span>{value}</span>
					) : (
						<Skeleton className="h-4 w-32" />
					);
				},
				size: 220,
				filterFn: fuzzyFilter,
				enableGlobalFilter: true,
			},
			{
				id: "assets",
				header: "Assets",
				cell: ({ row }) => {
					const session = row.original;

					if (session.sessionStatus === "processing") {
						return (
							<div className="">
								<Skeleton className="h-4 w-24" />
							</div>
						);
					}

					return (
						<div className="grid grid-cols-3 gap-2">
							{session.assetPath && (
								<Button
									size="sm"
									variant="ghost"
									className="cursor-pointer hover:scale-125"
									onClick={() => handleAssetClick(session.id, "resume")}
								>
									<FileUser />
								</Button>
							)}
							{session.coverLetter && (
								<Button
									size="sm"
									variant="ghost"
									className="cursor-pointer hover:scale-125"
									onClick={() => handleAssetClick(session.id, "cover-letter")}
								>
									<ScrollText />
								</Button>
							)}
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125"
								onClick={() => handleAssetClick(session.id, "answered-form")}
							>
								<ClipboardList size={20} />
							</Button>
						</div>
					);
				},
				size: 160,
				enableSorting: false,
			},
			{
				id: "status",
				header: "Status",
				accessorFn: (row) => row.sessionStatus,
				cell: ({ row }) => <StatusIcon status={row.original.sessionStatus} />,
				size: 80,
				filterFn: fuzzyFilter,
				enableGlobalFilter: true,
			},
			{
				id: "step",
				header: "Step",
				accessorFn: (row) =>
					R.pipe(
						row.currentStep,
						R.split("_"),
						R.map(R.capitalize()),
						R.join(" "),
					),
				size: 180,
				filterFn: fuzzyFilter,
				enableGlobalFilter: false,
			},
			{
				id: "url",
				header: "URL",
				accessorFn: (row) => row.url,
				cell: ({ row }) => (
					<Button
						size="sm"
						variant="ghost"
						className="cursor-pointer hover:scale-125"
						asChild
					>
						<a href={row.original.url} target="_blank" rel="noreferrer">
							<Link2 size={20} />
						</a>
					</Button>
				),
				enableSorting: false,
				size: 80,
				filterFn: fuzzyFilter,
				enableGlobalFilter: true,
			},
			{
				id: "createdAt",
				header: "Created At",
				accessorFn: (row) => formatSmartDate(row.createdAt),
				size: 220,
				filterFn: fuzzyFilter,
				enableGlobalFilter: true,
			},
			{
				id: "logs",
				header: "Logs",
				cell: ({ row }) => (
					<Button
						size="sm"
						variant="ghost"
						className="cursor-pointer hover:scale-125"
						onClick={() => handleAssetClick(row.original.id, "logs")}
					>
						<FileClock />
					</Button>
				),
				enableSorting: false,
				size: 80,
			},
			{
				id: "jobStatus",
				header: "Job Status",
				accessorFn: (row) => row.jobStatus,
				cell: ({ row }) => (
					<select
						className="border rounded px-2 py-1 text-sm"
						value={row.original.jobStatus}
						onChange={(e) =>
							handleChangeJobStatus(
								row.original.id,
								e.target.value as Sessions["jobStatus"],
							)
						}
					>
						<option
							value="in_progress"
							disabled={row.original.jobStatus === "in_progress"}
						>
							Processing
						</option>
						<option
							value="applied"
							disabled={row.original.jobStatus === "applied"}
						>
							Applied
						</option>
						<option
							value="not_applied"
							disabled={row.original.jobStatus === "not_applied"}
						>
							Not applied
						</option>
					</select>
				),
				enableSorting: false,
				size: 150,
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<div className="grid grid-cols-2 gap-1">
						{
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125 text-blue-600 hover:text-blue-700"
								onClick={() => handleRetrySession(row.original.id)}
								title="Retry session"
								disabled={row.original.sessionStatus === "processing"}
							>
								<RotateCcw size={20} />
							</Button>
						}
						<Button
							size="sm"
							variant="ghost"
							className="cursor-pointer hover:scale-125 text-red-600 hover:text-red-700"
							onClick={() => handleDeleteSession(row.original.id)}
							title="Delete session"
						>
							<Trash2 size={20} />
						</Button>
					</div>
				),
				enableSorting: false,
				size: 120,
			},
		],
		[
			handleAssetClick,
			handleChangeJobStatus,
			handleDeleteSession,
			handleRetrySession,
			openNotes,
			fuzzyFilter,
		],
	);

	const table = useReactTable({
		data,
		columns,
		state: {
			sorting,
			globalFilter,
			pagination,
			columnVisibility: prefs.columnVisibility,
			columnOrder: prefs.columnOrder.length ? prefs.columnOrder : undefined,
			columnSizing: prefs.columnSizing,
		},
		onSortingChange: (updater) => {
			const next = typeof updater === "function" ? updater(sorting) : updater;
			setSorting(next);
			setPrefs({ sorting: next });
		},
		onGlobalFilterChange: (updater) => {
			const next =
				typeof updater === "function" ? updater(globalFilter) : updater;
			setGlobalFilter(next);
			setPrefs({ globalSearch: next });
		},
		onPaginationChange: (updater) => {
			const next =
				typeof updater === "function" ? updater(pagination) : updater;
			setPagination(next);
			setPrefs({ pagination: next });
		},
		onColumnVisibilityChange: (updater) => {
			const prev = prefs.columnVisibility;
			const next = typeof updater === "function" ? updater(prev) : updater;
			setPrefs({ columnVisibility: next });
		},
		onColumnOrderChange: (updater) => {
			const prev = prefs.columnOrder;
			const next = typeof updater === "function" ? updater(prev) : updater;
			setPrefs({ columnOrder: next });
		},
		onColumnSizingChange: (updater) => {
			const prev = prefs.columnSizing;
			const next = typeof updater === "function" ? updater(prev) : updater;
			setPrefs({ columnSizing: next });
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		filterFns: { fuzzy: fuzzyFilter },
		globalFilterFn: fuzzyFilter,
		columnResizeMode: "onChange",
		enableColumnResizing: false,
		defaultColumn: {
			minSize: 60,
			size: 150,
			maxSize: 800,
		},
		// Manual pagination configuration
		manualPagination: true,
		pageCount: pageCount,
	});

	const reorderColumn = (columnId: string, direction: "up" | "down") => {
		const order =
			table.getState().columnOrder ??
			table.getAllLeafColumns().map((c) => c.id);
		const idx = order.indexOf(columnId);
		if (idx === -1) return;
		const swapWith = direction === "up" ? idx - 1 : idx + 1;
		if (swapWith < 0 || swapWith >= order.length) return;
		const next = [...order];
		[next[idx], next[swapWith]] = [next[swapWith], next[idx]];
		table.setColumnOrder(next);
	};

	if (isLoading && !sessions) {
		return (
			<div className="flex items-center justify-center p-8">
				<Spinner />
				<span className="ml-2">Loading sessions...</span>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex items-center justify-center p-8 text-red-600">
				<div className="text-center">
					<div className="text-lg font-semibold">Error loading sessions</div>
					<div className="text-sm text-gray-600 mt-1">
						Please try refreshing the page
					</div>
				</div>
			</div>
		);
	}

	if (totalCount === 0) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="text-center">
					<div className="text-lg font-semibold text-gray-600">
						No sessions yet
					</div>
					<div className="text-sm text-gray-500 mt-1">
						Start by adding a job application to get started
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full">
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					ref={columnsBtnRef}
					onClick={() => {
						setColumnMenuOpen((prev) => {
							const next = !prev;
							if (next && columnsBtnRef.current) {
								const rect = columnsBtnRef.current.getBoundingClientRect();
								setMenuPos({
									top: rect.bottom + 8 + window.scrollY,
									left: rect.left + window.scrollX,
								});
							}
							return next;
						});
					}}
				>
					<Settings2 /> Columns
				</Button>
				{/* <Button variant="outline" size="sm" onClick={exportCsv}>
					<Download /> Export CSV
				</Button> */}
				<div className="ml-auto flex items-center gap-2">
					<Input
						placeholder="Search..."
						value={globalFilter}
						onChange={(e) => table.setGlobalFilter(e.target.value)}
						className="min-w-64"
					/>
					<select
						className="border-input h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[1px]"
						value={prefs.columnDensity ?? "normal"}
						onChange={(e) =>
							setPrefs({
								columnDensity: e.target.value as
									| "compact"
									| "normal"
									| "comfortable",
							})
						}
						aria-label="Column density"
					>
						<option value="compact">Compact columns</option>
						<option value="normal">Normal columns</option>
						<option value="comfortable">Comfortable columns</option>
					</select>
				</div>
				{columnMenuOpen && menuPos && (
					<div
						className="fixed z-[1000]"
						style={{ top: menuPos.top, left: menuPos.left }}
					>
						<div
							ref={menuRef}
							className="w-64 rounded-md border bg-white p-2 shadow-md"
						>
							<div className="mb-2 flex items-center justify-between">
								<span className="text-sm font-medium">Columns</span>
								<Button size="sm" variant="ghost" onClick={() => reset()}>
									Reset
								</Button>
							</div>
							<div className="max-h-64 space-y-1 overflow-auto text-sm">
								{table.getAllLeafColumns().map((column) => (
									<div
										key={column.id}
										className="flex items-center justify-between gap-2 py-1"
									>
										<label className="inline-flex items-center gap-2">
											<input
												type="checkbox"
												checked={column.getIsVisible()}
												onChange={column.getToggleVisibilityHandler()}
											/>
											<span>{column.columnDef.header as string}</span>
										</label>
										<div className="flex items-center gap-1">
											<Button
												size="sm"
												variant="ghost"
												onClick={() => reorderColumn(column.id, "up")}
												title="Move left"
											>
												<MoveUpRight className="-rotate-90" />
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => reorderColumn(column.id, "down")}
												title="Move right"
											>
												<MoveDownLeft className="-rotate-90" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</div>

			<div className="overflow-auto rounded-md border relative min-h-[400px]">
				{isLoading && sessions && (
					<div className="absolute inset-0 bg-white/50 flex items-center justify-center z-20">
						<div className="flex items-center">
							<Spinner />
							<span className="ml-2">Loading...</span>
						</div>
					</div>
				)}
				<table className="w-full text-left">
					<thead className="sticky top-0 z-10 bg-white">
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<th
										key={header.id}
										className={
											"relative select-none border-b bg-white align-middle text-sm font-semibold " +
											(prefs.columnDensity === "compact"
												? "p-1"
												: prefs.columnDensity === "comfortable"
													? "p-3"
													: "p-2")
										}
									>
										{header.isPlaceholder ? null : (
											<button
												type="button"
												className={
													"flex items-center gap-2 bg-transparent " +
													(header.column.getCanSort()
														? "cursor-pointer select-none"
														: "")
												}
												onClick={header.column.getToggleSortingHandler()}
												aria-label={
													header.column.getCanSort() ? "Toggle sort" : undefined
												}
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{{ asc: "▲", desc: "▼" }[
													header.column.getIsSorted() as string
												] ?? null}
											</button>
										)}
										{header.column.getCanResize() && (
											<button
												type="button"
												aria-label="Resize column"
												onMouseDown={header.getResizeHandler()}
												onTouchStart={header.getResizeHandler()}
												className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none bg-transparent hover:bg-gray-300"
												style={{
													transform: header.column.getIsResizing()
														? "translateX(1px)"
														: undefined,
												}}
											/>
										)}
									</th>
								))}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows.length === 0 ? (
							<tr>
								<td
									colSpan={table.getAllColumns().length}
									className="text-center py-8 text-gray-500 h-[320px] align-middle"
								>
									{isLoading ? (
										<div className="flex items-center justify-center">
											<Spinner />
											<span className="ml-2">Loading sessions...</span>
										</div>
									) : (
										<div>
											<div className="text-lg font-medium">
												No sessions on this page
											</div>
											<div className="text-sm mt-1">
												Try adjusting your search or navigating to a different
												page
											</div>
										</div>
									)}
								</td>
							</tr>
						) : (
							table.getRowModel().rows.map((row) => (
								<tr key={row.id} className="border-b hover:bg-gray-50">
									{row.getVisibleCells().map((cell) => (
										<td
											key={cell.id}
											className={cn("align-middle", {
												"p-1": prefs.columnDensity === "compact",
												"p-3": prefs.columnDensity === "comfortable",
												"p-2": prefs.columnDensity === "normal",
											})}
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</td>
									))}
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination Controls */}
			<div className="mt-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<select
						value={table.getState().pagination.pageSize}
						onChange={(e) => {
							table.setPageSize(Number(e.target.value));
						}}
						disabled={isLoading || isCountLoading}
						className="border-input h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{[10, 25, 50, 100].map((pageSize) => (
							<option key={pageSize} value={pageSize}>
								Show {pageSize}
							</option>
						))}
					</select>
					<span className="text-sm text-gray-600">
						{isCountLoading ? (
							<span className="flex items-center">
								<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1" />
								Loading...
							</span>
						) : (
							<>
								Page {table.getState().pagination.pageIndex + 1} of {pageCount}
								<span className="ml-2 text-gray-500">({totalCount} total)</span>
							</>
						)}
					</span>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage() || isLoading}
					>
						<ChevronLeft className="h-4 w-4" />
						Previous
					</Button>
					<div className="flex items-center gap-1">
						{isCountLoading ? (
							<div className="flex items-center gap-1">
								{[1, 2, 3, 4, 5].map((i) => (
									<div
										key={i}
										className="h-8 w-8 rounded border bg-gray-100 animate-pulse"
									/>
								))}
							</div>
						) : (
							Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
								const pageIndex = table.getState().pagination.pageIndex;
								let pageNumber: number;

								if (pageCount <= 5) {
									pageNumber = i;
								} else if (pageIndex < 3) {
									pageNumber = i;
								} else if (pageIndex >= pageCount - 3) {
									pageNumber = pageCount - 5 + i;
								} else {
									pageNumber = pageIndex - 2 + i;
								}

								return (
									<Button
										key={pageNumber}
										variant={pageNumber === pageIndex ? "default" : "outline"}
										size="sm"
										onClick={() => table.setPageIndex(pageNumber)}
										disabled={pageNumber >= pageCount || isLoading}
									>
										{pageNumber + 1}
									</Button>
								);
							})
						)}
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage() || isLoading}
					>
						Next
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
			<Dialog
				open={notesDialog.open}
				onOpenChange={(open) => !open && closeNotes()}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Session Notes</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<textarea
							value={notesDialog.value}
							onChange={(e) => {
								const v = e.target.value.slice(0, 1000);
								setNotesDialog((prev) => ({ ...prev, value: v }));
							}}
							placeholder="Add Markdown/plain text notes (<= 1000 chars)"
							className="w-full min-h-40 rounded-md border px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[1px]"
						/>
						<div className="text-right text-xs text-muted-foreground">
							{notesDialog.value.length}/1000
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={handleSaveNotes}>
							Save
						</Button>
						<Button onClick={handleSaveAndRetryNotes}>Save & Retry</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
