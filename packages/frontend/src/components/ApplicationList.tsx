import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle,
	Circle,
	ClipboardList,
	FileClock,
	FileText,
	FileUser,
	Link2,
	ScrollText,
	Trash2,
} from "lucide-react";
import { useEffect } from "react";
import * as R from "remeda";
import {
	useDeleteSession,
	useFetchResumePdf,
	useFetchSessions,
	useUpdateSessionApplied,
} from "../api";
import { useUI } from "../contexts/UIContext";
import Spinner from "./Spinner";
import { Button } from "./ui/button";

export default function ApplicationList() {
	const fetchApplications = useFetchSessions();
	const fetchResumePdf = useFetchResumePdf();
	const updateSessionApplied = useUpdateSessionApplied();
	const deleteSession = useDeleteSession();
	const queryClient = useQueryClient();
	const {
		data: sessions,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["applications"],
		queryFn: fetchApplications,
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

	const handleAssetClick = async (
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
	};

	const handleToggleApplied = async (
		sessionId: string,
		currentApplied: boolean,
	) => {
		try {
			await updateSessionApplied(sessionId, { applied: !currentApplied });
			queryClient.invalidateQueries({ queryKey: ["applications"] });
		} catch (error) {
			console.error("Error updating applied status:", error);
		}
	};

	const handleDeleteSession = async (sessionId: string) => {
		if (confirm("Are you sure you want to delete this session?")) {
			try {
				await deleteSession(sessionId);
				queryClient.invalidateQueries({ queryKey: ["applications"] });
			} catch (error) {
				console.error("Error deleting session:", error);
			}
		}
	};

	if (isLoading) return <Spinner />;
	if (isError) return <div>Error loading sessions</div>;

	if (sessions.length === 0) {
		return <div>No sessions yet</div>;
	}

	return (
		<table className="w-full text-left">
			<thead>
				<tr>
					<th className="p-2">Company</th>
					<th className="p-2">Title</th>
					<th className="p-2 text-center">Assets</th>
					<th className="p-2">Status</th>
					<th className="p-2">Step</th>
					<th className="p-2">URL</th>
					<th className="p-2">Created At</th>
					<th className="p-2">Logs</th>
					<th className="p-2">Applied</th>
					<th className="p-2">Actions</th>
				</tr>
			</thead>
			<tbody>
				{sessions.map((session) => (
					<tr key={session.id} className="border-b hover:bg-gray-50">
						<td className="p-2">{session.companyInfo?.name}</td>
						<td className="p-2">{session.title}</td>
						<td className="p-2">
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
						</td>
						<td className="p-2">
							<span className={`p-2`}>{R.capitalize(session.status)}</span>
						</td>
						<td className="p-2">
							{R.pipe(
								session.currentStep,
								R.split("_"),
								R.map(R.capitalize()),
								R.join(" "),
							)}
						</td>
						<td>
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125"
								asChild
							>
								<a href={session.url} target="_blank">
									<Link2 size={20} />
								</a>
							</Button>
						</td>
						<td>{new Date(session.createdAt).toLocaleString()}</td>
						<td>
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125"
								onClick={() => handleAssetClick(session.id, "logs")}
							>
								<FileClock />
							</Button>
						</td>
						<td className="p-2">
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125"
								onClick={() =>
									handleToggleApplied(session.id, session.applied || false)
								}
							>
								{session.applied ? (
									<CheckCircle className="text-green-600" size={20} />
								) : (
									<Circle size={20} />
								)}
							</Button>
						</td>
						<td className="p-2">
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125 text-red-600 hover:text-red-700"
								onClick={() => handleDeleteSession(session.id)}
							>
								<Trash2 size={20} />
							</Button>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
