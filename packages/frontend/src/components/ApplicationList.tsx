import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ClipboardList,
	FileClock,
	FileUser,
	Link2,
	ScrollText,
} from "lucide-react";
import { useEffect } from "react";
import * as R from "remeda";
import { useFetchResumePdf, useFetchSessions } from "../api";
import { useUI } from "../contexts/UIContext";
import Spinner from "./Spinner";
import { Button } from "./ui/button";

export default function ApplicationList() {
	const fetchApplications = useFetchSessions();
	const fetchResumePdf = useFetchResumePdf();
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
		type: "resume" | "cover-letter" | "application-form" | "logs",
	) => {
		const session = sessions.find((session) => session.id === id);

		if (!session) {
			console.error("Clicking on asset but session not found");
			return;
		}

		switch (type) {
			case "application-form":
				setAsset({
					content: JSON.stringify(session.applicationForm),
					id: session.id,
					name: "application-form",
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
					name: "generatedResume",
					source: "list",
					type: "pdf",
				});

				break;
			}
			case "logs":
				setAsset({
					id,
					content: JSON.stringify(session.logs),
					name: "sessionLogs",
					source: "list",
					type: "json",
				});
				break;
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
					<th className="p-2">Resume</th>
					<th className="p-2">Cover Letter</th>
					<th className="p-2">Form</th>
					<th className="p-2">Status</th>
					<th className="p-2">Step</th>
					<th className="p-2">URL</th>
					<th className="p-2">Created At</th>
					<th className="p-2">Logs</th>
				</tr>
			</thead>
			<tbody>
				{sessions.map((session) => (
					<tr key={session.id} className="border-b hover:bg-gray-50">
						<td className="p-2">{session.companyName}</td>
						<td className="p-2">{session.title}</td>
						<td className="p-2">
							{session.assetPath && (
								<Button
									size="sm"
									variant="outline"
									className="cursor-pointer hover:scale-125"
									onClick={() => handleAssetClick(session.id, "resume")}
								>
									<FileUser />
								</Button>
							)}
						</td>
						<td className="p-2">
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
						</td>
						<td className="p-2">
							<Button
								size="sm"
								variant="ghost"
								className="cursor-pointer hover:scale-125"
								onClick={() => handleAssetClick(session.id, "application-form")}
							>
								<ClipboardList size={20} />
							</Button>
						</td>
						<td className="p-2">
							{R.pipe(
								session.currentStep,
								R.split("_"),
								R.map(R.capitalize()),
								R.join(" "),
							)}
						</td>
						<td className="p-2">
							<span className={`p-2`}>{R.capitalize(session.status)}</span>
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
					</tr>
				))}
			</tbody>
		</table>
	);
}
