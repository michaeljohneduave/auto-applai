import type { GetSessionsResponse } from "@auto-apply/api/src/server.ts";
import type { Sessions } from "@auto-apply/core/src/db/schema";
import { rankItem } from "@tanstack/match-sorter-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ColumnDef,
	type FilterFn,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
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
	ScrollText,
	Settings2,
	Trash2,
} from "lucide-react";
import Papa from "papaparse";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as R from "remeda";
import { formatSmartDate } from "@/lib/date";
import {
	useDeleteSession,
	useFetchResumePdf,
	useFetchSessions,
	useUpdateJobStatus,
} from "../api";
import { useUI } from "../contexts/UIContext";
import { useApplicationsTablePrefs } from "../stores/tablePrefs";
import Spinner from "./Spinner";
import StatusIcon from "./StatusIcon";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

// Skeleton component for loading states
const Skeleton = ({ className = "" }: { className?: string }) => (
	<div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

export default function ApplicationList() {
	const fetchApplications = useFetchSessions();
	const fetchResumePdf = useFetchResumePdf();
	const updateJobStatus = useUpdateJobStatus();
	const deleteSession = useDeleteSession();
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
	const { setAsset } = useUI();

	useEffect(() => {
		let eventSource: EventSource | null;

		try {
			eventSource = new EventSource("/api/events");

			eventSource.addEventListener("session:update", () => {
				queryClient.invalidateQueries({ queryKey: ["applications"] });
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
					const pdfBlob = new Uint8Array(await fetchResumePdf(id));
					let binary = "";

					for (let i = 0; i < pdfBlob.byteLength; i++) {
						binary += String.fromCharCode(pdfBlob[i]);
					}

					setAsset({
						id,
						content: btoa(binary),
						name: R.toKebabCase(
							[
								session.personalInfo.fullName,
								session.companyInfo?.shortName,
								session.jobInfo?.shortTitle,
								"resume",
							]
								.filter(Boolean)
								.join(" ")
								.replace(/[.,]/gi, ""),
						),
						source: "list",
						type: "pdf",
					});

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
		[sessions, setAsset, fetchResumePdf],
	);

	const handleChangeJobStatus = useCallback(
		async (sessionId: string, nextStatus: Sessions["jobStatus"]) => {
			try {
				await updateJobStatus(sessionId, { jobStatus: nextStatus });
				queryClient.invalidateQueries({ queryKey: ["applications"] });
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
				} catch (error) {
					console.error("Error deleting session:", error);
				}
			}
		},
		[deleteSession, queryClient],
	);

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
								<Skeleton className="h-4 w-28" />
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
				enableGlobalFilter: true,
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
					<Button
						size="sm"
						variant="ghost"
						className="cursor-pointer hover:scale-125 text-red-600 hover:text-red-700"
						onClick={() => handleDeleteSession(row.original.id)}
					>
						<Trash2 size={20} />
					</Button>
				),
				enableSorting: false,
				size: 100,
			},
		],
		[handleAssetClick, handleChangeJobStatus, handleDeleteSession, fuzzyFilter],
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
		getPaginationRowModel: getPaginationRowModel(),
		filterFns: { fuzzy: fuzzyFilter },
		globalFilterFn: fuzzyFilter,
		columnResizeMode: "onChange",
		enableColumnResizing: true,
		defaultColumn: {
			minSize: 60,
			size: 150,
			maxSize: 800,
		},
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

	if (isLoading) return <Spinner />;
	if (isError) return <div>Error loading sessions</div>;

	if (sessions.length === 0) {
		return <div>No sessions yet</div>;
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

			<div className="overflow-auto rounded-md border">
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
						{table.getRowModel().rows.map((row) => (
							<tr key={row.id} className="border-b hover:bg-gray-50">
								{row.getVisibleCells().map((cell) => (
									<td
										key={cell.id}
										className={
											(prefs.columnDensity === "compact"
												? "p-1"
												: prefs.columnDensity === "comfortable"
													? "p-3"
													: "p-2") + " align-middle"
										}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))}
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
						className="border-input h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[1px]"
					>
						{[10, 25, 50, 100].map((pageSize) => (
							<option key={pageSize} value={pageSize}>
								Show {pageSize}
							</option>
						))}
					</select>
					<span className="text-sm text-gray-600">
						Page {table.getState().pagination.pageIndex + 1} of{" "}
						{table.getPageCount()}
					</span>
				</div>

				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						<ChevronLeft className="h-4 w-4" />
						Previous
					</Button>
					<div className="flex items-center gap-1">
						{Array.from(
							{ length: Math.min(5, table.getPageCount()) },
							(_, i) => {
								const pageIndex = table.getState().pagination.pageIndex;
								const pageCount = table.getPageCount();
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
										disabled={pageNumber >= pageCount}
									>
										{pageNumber + 1}
									</Button>
								);
							},
						)}
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						Next
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
