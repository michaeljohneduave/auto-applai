import type { formCompleterSchema } from "@auto-apply/core/src/schema";
import { markdown } from "@codemirror/lang-markdown";
// import { StreamLanguage } from "@codemirror/language";
// import { stex } from "@codemirror/legacy-modes/mode/stex";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import CodeMirror from "@uiw/react-codemirror";
import JsonView from "@uiw/react-json-view";
import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type z from "zod";
import { cn } from "@/lib/utils";
import { useGeneratePdf, useMutateBaseAssets } from "../api";
import { useUI } from "../contexts/UIContext";
import ApplicationForm from "./ApplicationForm";
import SessionLogsViewer from "./SessionLogsViewer";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";

export default function AssetDisplayDialog() {
	const { selected, setAsset } = useUI();
	const [wordWrap, setWordWrap] = useState(true);
	const [content, setContent] = useState(selected?.content || "");
	const [derivedContent, setDerivedContent] = useState(null);
	const queryClient = useQueryClient();
	const mutateBaseAssets = useMutateBaseAssets();
	const generatePdf = useGeneratePdf();

	const [editorView, setEditorView] = useState<EditorView | null>(null);
	const [isDirty, setIsDirty] = useState(false);

	const { mutate: saveBaseAssets, isPending } = useMutation({
		mutationFn: mutateBaseAssets,
		onSuccess: async (_data) => {
			if (editorView) {
				const extensions = getExtensions(selected.type, wordWrap);
				const newState = EditorState.create({
					doc: content,
					extensions,
				});
				editorView.setState(newState);
			}

			await queryClient.fetchQuery({ queryKey: ["baseAssets"] });
			setIsDirty(false);
		},
	});

	const { mutate: getPdf, isPending: getPdfPending } = useMutation({
		mutationFn: generatePdf,
		onSuccess: (data) => {
			if (data instanceof ArrayBuffer) {
				const base64 = btoa(
					new Uint8Array(data).reduce(
						(data, byte) => data + String.fromCharCode(byte),
						"",
					),
				);
				setDerivedContent(base64);
			}
		},
	});

	useEffect(() => {
		setContent(selected?.content || "");

		if (selected?.type === "json") {
			setDerivedContent(JSON.parse(selected.content));
		}

		setIsDirty(false);
	}, [selected]);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (isDirty) {
				event.preventDefault();
				event.returnValue = "";
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [isDirty]);

	const handleClose = () => {
		if (isDirty) {
			if (
				window.confirm(
					"You have unsaved changes. Are you sure you want to close?",
				)
			) {
				setAsset(null);
			}
		} else {
			setAsset(null);
		}
	};

	const handleEditorChange = (value) => {
		setContent(value);
		if (value !== selected?.content) {
			setIsDirty(true);
		}
	};

	const handleSave = useCallback(() => {
		if (!isDirty || !selected) {
			return;
		}
		const { id } = selected;
		const key =
			id === "base-resume.md"
				? "baseResumeMd"
				: id === "personal-info.md"
					? "personalInfoMd"
					: "baseResumeLatex";
		saveBaseAssets({ [key]: content });
	}, [isDirty, selected, content, saveBaseAssets]);

	const handleReset = () => {
		setContent(selected?.content || "");
		setIsDirty(false);
		if (editorView) {
			const extensions = getExtensions(selected.type, wordWrap);
			const newState = EditorState.create({
				doc: content,
				extensions,
			});
			editorView.setState(newState);
		}
	};

	const handleGeneratePdf = () => {
		getPdf({
			latex: content,
		});
	};

	const handleDownloadPdf = (content: string, filename?: string) => {
		if (!content) return;

		// Create a blob from the base64 data
		const byteCharacters = atob(content);
		const byteNumbers = new Array(byteCharacters.length);
		for (let i = 0; i < byteCharacters.length; i++) {
			byteNumbers[i] = byteCharacters.charCodeAt(i);
		}
		const byteArray = new Uint8Array(byteNumbers);
		const blob = new Blob([byteArray], { type: "application/pdf" });

		// Create download link
		const url = window.URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename || selected?.name || "document.pdf";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		window.URL.revokeObjectURL(url);
	};

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "s") {
				event.preventDefault();
				handleSave();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleSave]);

	if (!selected) {
		return null;
	}

	const getExtensions = (type: string, wordWrap: boolean) => {
		const extensions = [];
		if (wordWrap) {
			extensions.push(EditorView.lineWrapping);
		}

		extensions.push(lineNumbers());

		if (type === "md") {
			extensions.push(markdown());
		} else if (type === "latex") {
			// extensions.push(StreamLanguage.define(stex));
		}
		return extensions;
	};

	const renderContent = () => {
		const extensions = getExtensions(selected.type, wordWrap);

		switch (selected.type) {
			case "md":
				return (
					<div className="grid grid-cols-10 gap-4 h-full">
						<div className="col-span-6 overflow-y-auto">
							<CodeMirrorEditor
								value={content || "\n".repeat(49)}
								onChange={handleEditorChange}
								extensions={extensions}
								onCreateEditor={setEditorView}
							/>
						</div>
						<div className="flex col-span-4 overflow-y-auto max-w-full">
							{content ? (
								<div className="prose">
									<ReactMarkdown>{content}</ReactMarkdown>
								</div>
							) : (
								<div className="flex flex-1 justify-center items-center bg-gray-50">
									<span className="text-2xl">Content will be shown here</span>
								</div>
							)}
						</div>
					</div>
				);
			case "latex":
				return (
					<div className="grid grid-cols-10 gap-4 h-full">
						<div className="col-span-6 overflow-auto">
							<CodeMirrorEditor
								value={content || "\n".repeat(49)}
								onChange={handleEditorChange}
								extensions={extensions}
								onCreateEditor={setEditorView}
							/>
						</div>
						<div className="flex col-span-4 overflow-y-auto relative">
							{derivedContent ? (
								<>
									<iframe
										title={`${selected.name} PDF`}
										src={`data:application/pdf;base64,${derivedContent}`}
										className="w-full h-full"
									/>
									<Button
										onClick={() =>
											handleDownloadPdf(
												derivedContent,
												`${selected.name.replace(".tex", ".pdf")}`,
											)
										}
										variant="outline"
										size="sm"
										className="absolute top-2 right-2 z-10"
									>
										<Download className="w-4 h-4 mr-2" />
										Download
									</Button>
								</>
							) : (
								<div className="flex flex-1 justify-center items-center bg-gray-50">
									<span className="text-2xl">
										PDF version will be shown here
									</span>
								</div>
							)}
						</div>
					</div>
				);
			case "pdf":
				return (
					<div className="overflow-auto flex-1 relative">
						<iframe
							title={`${selected.name} PDF`}
							src={`data:application/pdf;base64,${selected.content}`}
							className="w-full h-full"
						/>
						<Button
							onClick={() => handleDownloadPdf(selected.content)}
							variant="outline"
							size="sm"
							className="absolute top-2 right-2 z-10 cursor-pointer"
						>
							<Download className="w-4 h-4 mr-2" />
							Download
						</Button>
					</div>
				);
			case "form": {
				const form = JSON.parse(selected.content) as z.infer<
					typeof formCompleterSchema
				>;
				return (
					<div className="overflow-y-auto">
						<ApplicationForm form={form} />
					</div>
				);
			}
			case "json":
				return <JsonView value={derivedContent} />;
			case "logs":
				return <SessionLogsViewer sessionId={selected.id} />;
			default:
				return <div>Unsupported format</div>;
		}
	};

	return (
		<Dialog
			open={Boolean(selected)}
			onOpenChange={(open) => !open && handleClose()}
		>
			<DialogContent className="h-[90vh] flex flex-col max-h-[90vh] md:w-full xl:w-[90%]">
				<DialogHeader>
					<div className="flex items-center gap-4">
						<DialogTitle>
							{selected.name}
							{isDirty && <span className="text-destructive ml-2">*</span>}
						</DialogTitle>
						<Button
							onClick={() => setWordWrap(!wordWrap)}
							variant="outline"
							size="sm"
							className={cn("h-7 cursor-pointer", {
								hidden: selected.type === "form",
							})}
						>
							{wordWrap ? "Unwrap" : "Wrap"}
						</Button>
						{selected.type === "latex" ? (
							<Button
								size="sm"
								className="h-7 cursor-pointer"
								onClick={handleGeneratePdf}
								disabled={getPdfPending}
							>
								{getPdfPending ? "Generating" : "Generate"}
							</Button>
						) : null}
					</div>
				</DialogHeader>
				<div className="flex-1 overflow-y-auto flex">{renderContent()}</div>
				{selected.type === "md" || selected.type === "latex" ? (
					<DialogFooter>
						<Button variant="outline" onClick={handleReset} disabled={!isDirty}>
							Reset
						</Button>
						<Button onClick={handleSave} disabled={!isDirty || isPending}>
							{isPending ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

const CodeMirrorEditor = ({
	value,
	onChange,
	extensions,
	onCreateEditor,
}: {
	value: string;
	onChange: (value: string) => void;
	extensions: any[];
	onCreateEditor: (view: EditorView) => void;
}) => {
	return (
		<CodeMirror
			value={value}
			height="100%"
			minHeight="500px"
			extensions={extensions}
			onChange={onChange}
			onCreateEditor={onCreateEditor}
		/>
	);
};
