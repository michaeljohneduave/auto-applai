import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
// import { Document, Page, pdfjs } from "react-pdf";
// import "react-pdf/dist/esm/Page/AnnotationLayer.css";
// import "react-pdf/dist/esm/Page/TextLayer.css";
import { useFetchAssetContent, useUpdateAssetContent } from "../api";
import { useUI } from "../contexts/UIContext";
import Spinner from "./Spinner";

// pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function AssetDisplay() {
	const { selected } = useUI();
	const queryClient = useQueryClient();

	const fetchAssetContent = useFetchAssetContent(selected?.id || "");
	const {
		data: content,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["asset", selected?.id],
		queryFn: fetchAssetContent,
		enabled: !!selected,
	});

	const [editableContent, setEditableContent] = useState(content);

	useEffect(() => {
		setEditableContent(content);
	}, [content]);

	const updateAssetContent = useUpdateAssetContent(selected?.id || "");
	const mutation = useMutation({
		mutationFn: (newContent: string) => {
			if (!selected) {
				throw new Error("No asset selected");
			}
			return updateAssetContent(newContent);
		},
		onSuccess: () => {
			if (selected) {
				queryClient.invalidateQueries({ queryKey: ["asset", selected.id] });
			}
		},
	});

	const handleSave = () => {
		mutation.mutate(editableContent);
	};

	if (!selected) {
		return (
			<div className="text-center text-gray-500">
				Select an asset to view its content
			</div>
		);
	}

	if (isLoading) return <Spinner />;
	if (isError) return <div>Error loading content</div>;

	const isMarkdown = selected.id.endsWith(".md");

	if (isMarkdown) {
		return (
			<div>
				<textarea
					value={editableContent}
					onChange={(e) => setEditableContent(e.target.value)}
					className="w-full h-96 p-2 border"
				/>
				<button
					type="button"
					onClick={handleSave}
					className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
				>
					Save
				</button>
				<ReactMarkdown>{editableContent}</ReactMarkdown>
			</div>
		);
	}

	switch (selected.type) {
		// case "pdf":
		// 	return (
		// 		<Document file={content}>
		// 			<Page pageNumber={1} />
		// 		</Document>
		// 	);
		case "form":
			return (
				<iframe
					src={selected.id}
					title={selected.id}
					className="w-full h-full"
				/>
			);
		default:
			return <div>Unsupported asset type</div>;
	}
}
