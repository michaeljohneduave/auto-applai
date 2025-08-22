import type { formCompleterSchema } from "@auto-apply/core/src/types";
// Lazy load heavy CodeMirror dependencies
import { markdown } from "@codemirror/lang-markdown";
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
import {
	useGeneratePdf,
	useGetLatexVariant,
	useListLatexVariants,
	useMutateBaseAssets,
	useUpdateLatexVariant,
} from "../api";
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
	const [isAutoGenerating, setIsAutoGenerating] = useState(false);
	const queryClient = useQueryClient();
	const mutateBaseAssets = useMutateBaseAssets();
	const generatePdf = useGeneratePdf();

	// Session LaTeX variants support (DB only)
	const listLatexVariants = useListLatexVariants(selected?.id || "");
	const getLatexVariant = useGetLatexVariant(selected?.id || "");
	const updateLatexVariant = useUpdateLatexVariant(selected?.id || "");
	const [sessionLatexFiles, setSessionLatexFiles] = useState<
		Array<{
			id: string;
			name: string;
			score: number | null;
			downloadFileName?: string;
		}>
	>([]);

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

	// Save DB variant only
	const { mutate: saveDbVariant, isPending: isSavingDbVariant } = useMutation({
		mutationFn: async (params: { variantId: string; latex: string }) => {
			return updateLatexVariant(params.variantId, params.latex);
		},
		onSuccess: () => setIsDirty(false),
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

		// Auto-generate PDF for session resumes
		if (
			selected?.source === "list" &&
			selected?.type === "latex" &&
			!derivedContent
		) {
			setIsAutoGenerating(true);
			getPdf(
				{ latex: selected.content },
				{
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
						setIsAutoGenerating(false);
					},
					onError: () => {
						setIsAutoGenerating(false);
					},
				},
			);
		}

		setIsDirty(false);
	}, [selected, derivedContent, getPdf]);

	// Load variants (DB only)
	useEffect(() => {
		(async () => {
			if (
				selected?.source === "list" &&
				selected?.type === "latex" &&
				selected?.id
			) {
				try {
					const variants = await listLatexVariants();
					const names = Array.isArray(variants)
						? variants.map((v: any) => ({
								id: v.id,
								name: v.name,
								score: typeof v.score === "number" ? v.score : null,
								downloadFileName: v.downloadFileName,
							}))
						: [];
					setSessionLatexFiles(names);
				} catch (e) {
					console.error("Failed to load session latex files", e);
				}
			} else {
				setSessionLatexFiles([]);
			}
		})();
		// Important: avoid including function identities to prevent infinite loops
	}, [selected?.id, selected?.source, selected?.type]);

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

		setContent("");
		setDerivedContent(null);
		setIsDirty(false);
		setIsAutoGenerating(false);
		setEditorView(null);
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
		// Save user base assets
		if (selected.source === "base") {
			const { id } = selected;
			const key =
				id === "base-resume.md"
					? "baseResumeMd"
					: id === "personal-info.md"
						? "personalInfoMd"
						: "baseResumeLatex";
			saveBaseAssets({ [key]: content });
			return;
		}

		// Save session-scoped LaTeX only (DB only)
		if (selected.source === "list" && selected.type === "latex") {
			if (selected.isDbVariant && selected.variantId) {
				saveDbVariant({ variantId: selected.variantId, latex: content });
			}
		}

		if (selected.type === "latex") {
			getPdf({
				latex: content,
			});
		}
	}, [isDirty, selected, content, saveBaseAssets, saveDbVariant, getPdf]);

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

		if (isDirty) {
			window.alert("You have unsaved changes. Please save before downloading.");
			return;
		}

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

		const computePdfFileName = () => {
			if (selected?.fileName) {
				const base = selected.fileName.replace(/\.pdf$/i, "");
				return `${base}.pdf`;
			}
			return "resume.pdf";
		};

		switch (selected.type) {
			case "md":
				return (
					<div className="grid grid-cols-10 gap-4 h-full">
						<div className="col-span-5 overflow-y-auto">
							<CodeMirrorEditor
								value={content || "\n".repeat(49)}
								onChange={handleEditorChange}
								extensions={extensions}
								onCreateEditor={setEditorView}
							/>
						</div>
						<div className="flex col-span-5 overflow-y-auto max-w-full">
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
						<div className="col-span-5 overflow-auto">
							<CodeMirrorEditor
								value={content || "\n".repeat(49)}
								onChange={handleEditorChange}
								extensions={extensions}
								onCreateEditor={setEditorView}
							/>
						</div>
						<div className="flex col-span-5 overflow-y-auto relative">
							{derivedContent ? (
								<>
									<iframe
										title={`${selected.name} PDF`}
										src={`data:application/pdf;base64,${derivedContent}#view=FitH`}
										className="w-full h-full"
									/>
									<Button
										onClick={() =>
											handleDownloadPdf(derivedContent, computePdfFileName())
										}
										variant="outline"
										size="lg"
										className="absolute top-2 right-2 z-10 cursor-pointer"
									>
										<Download className="w-4 h-4 mr-2" />
										Download
									</Button>
								</>
							) : isAutoGenerating ? (
								<div className="flex flex-1 justify-center items-center bg-gray-50">
									<div className="flex flex-col items-center gap-2">
										<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
										<span className="text-lg text-gray-600">
											Generating PDF...
										</span>
									</div>
								</div>
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
							src={`data:application/pdf;base64,${selected.content}#view=FitH`}
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

	const canShowFooter =
		(selected.type === "md" || selected.type === "latex") &&
		(selected.source === "base" ||
			(selected.source === "list" && selected.type === "latex"));

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
							{typeof selected.score === "number" ? (
								<span className="ml-2 text-sm text-muted-foreground">
									({selected.score})
								</span>
							) : null}
							{isDirty && <span className="text-destructive ml-2">*</span>}
						</DialogTitle>
						{selected.source === "list" &&
						selected.type === "latex" &&
						sessionLatexFiles.length > 0 ? (
							<div className="flex items-center gap-2">
								<select
									className={cn("border rounded px-2 py-1 text-sm", {
										"opacity-50 cursor-not-allowed": isAutoGenerating,
									})}
									value={selected.name}
									disabled={isAutoGenerating}
									title={
										isAutoGenerating ? "Generating PDF..." : "Select variant"
									}
									onChange={async (e) => {
										const nextName = e.target.value;
										try {
											const match = sessionLatexFiles.find(
												(v) => v.name === nextName,
											);
											if (match) {
												const variant = await getLatexVariant(match.id);
												setContent(variant.latex || "");
												setIsDirty(false);
												setDerivedContent(null);

												// Auto-generate PDF for the new variant
												setIsAutoGenerating(true);
												getPdf(
													{ latex: variant.latex || "" },
													{
														onSuccess: (data) => {
															if (data instanceof ArrayBuffer) {
																const base64 = btoa(
																	new Uint8Array(data).reduce(
																		(data, byte) =>
																			data + String.fromCharCode(byte),
																		"",
																	),
																);
																setDerivedContent(base64);
															}
															setIsAutoGenerating(false);
														},
														onError: () => {
															setIsAutoGenerating(false);
														},
													},
												);

												setAsset({
													id: selected.id,
													content: variant.latex || "",
													name: nextName,
													fileName: match.downloadFileName,
													source: "list",
													type: "latex",
													variantId: match.id,
													isDbVariant: true,
													score: match.score ?? null,
												});
											}
										} catch (err) {
											console.error("Failed to switch latex variant", err);
										}
									}}
								>
									{sessionLatexFiles.map((v) => (
										<option key={v.id} value={v.name}>
											{v.name}
											{typeof v.score === "number" ? ` (${v.score})` : ""}
										</option>
									))}
								</select>
								{isAutoGenerating && (
									<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
								)}
							</div>
						) : null}
						<Button
							onClick={() => setWordWrap(!wordWrap)}
							variant="outline"
							size="sm"
							className={cn("h-7 cursor-pointer", {
								hidden: selected.type === "form" || selected.type === "logs",
							})}
						>
							{wordWrap ? "Unwrap" : "Wrap"}
						</Button>
						{selected.type === "latex" ? (
							<Button
								size="sm"
								className="h-7 cursor-pointer"
								onClick={handleGeneratePdf}
								disabled={getPdfPending || isAutoGenerating}
							>
								{getPdfPending || isAutoGenerating ? "Generating" : "Generate"}
							</Button>
						) : null}
					</div>
				</DialogHeader>
				<div className="flex-1 overflow-y-auto flex">{renderContent()}</div>
				{canShowFooter ? (
					<DialogFooter>
						<Button variant="outline" onClick={handleReset} disabled={!isDirty}>
							Reset
						</Button>
						<Button
							onClick={handleSave}
							disabled={!isDirty || isPending || isSavingDbVariant}
						>
							{isPending || isSavingDbVariant ? "Saving..." : "Save"}
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
