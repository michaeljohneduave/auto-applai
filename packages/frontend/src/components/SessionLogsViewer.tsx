import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle,
	Clock,
	DollarSign,
	FileText,
	Loader2,
	Play,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { useFetchSessionLogs } from "../api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface SessionLogsViewerProps {
	sessionId: string;
}

export default function SessionLogsViewer({
	sessionId,
}: SessionLogsViewerProps) {
	const fetchSessionLogs = useFetchSessionLogs();
	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

	const {
		data: logs,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["sessionLogs", sessionId],
		queryFn: () => fetchSessionLogs(sessionId),
		enabled: !!sessionId,
	});

	const toggleStep = (stepId: string) => {
		const newExpanded = new Set(expandedSteps);
		if (newExpanded.has(stepId)) {
			newExpanded.delete(stepId);
		} else {
			newExpanded.add(stepId);
		}
		setExpandedSteps(newExpanded);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-8">
				<Loader2 className="h-8 w-8 animate-spin" />
				<span className="ml-2">Loading session logs...</span>
			</div>
		);
	}

	if (isError || !logs) {
		return (
			<div className="flex items-center justify-center p-8 text-red-600">
				<XCircle className="h-8 w-8" />
				<span className="ml-2">Error loading session logs</span>
			</div>
		);
	}

	// Hide workflow steps with no requests
	const visibleSteps = logs.workflowSteps.filter(
		(step) => step.logs.length > 0,
	);

	const formatDuration = (ms: number) => {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)} secs`;
		return `${(ms / 60000).toFixed(1)} mins`;
	};

	const formatCost = (cost: number) => {
		const cents = cost.toPrecision(4);
		return `${cents.toLocaleString()}¢`;
	};

	const getStepStatusIcon = (status: string) => {
		switch (status) {
			case "completed":
				return <CheckCircle className="h-5 w-5 text-green-600" />;
			case "in-progress":
				return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
			case "failed":
				return <XCircle className="h-5 w-5 text-red-600" />;
			case "pending":
				return <Play className="h-5 w-5 text-gray-400" />;
			default:
				return <Clock className="h-5 w-5 text-gray-400" />;
		}
	};

	const getStepStatusColor = (status: string) => {
		switch (status) {
			case "completed":
				return "border-green-200 bg-green-50";
			case "in-progress":
				return "border-blue-200 bg-blue-50";
			case "failed":
				return "border-red-200 bg-red-50";
			case "pending":
				return "border-gray-200 bg-gray-50";
			default:
				return "border-gray-200 bg-gray-50";
		}
	};

	return (
		<div className="space-y-6">
			{/* Summary Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span>Session Summary</span>
						<div className="flex items-center space-x-4 text-sm">
							<div className="flex items-center space-x-1">
								<Clock className="h-4 w-4" />
								<span>{formatDuration(logs.totalDuration)}</span>
							</div>
							<div className="flex items-center space-x-1">
								<DollarSign className="h-4 w-4" />
								<span>{formatCost(logs.totalCost)}</span>
							</div>
							<div className="flex items-center space-x-1">
								<FileText className="h-4 w-4" />
								<span>{logs.summary.totalRequests} requests</span>
							</div>
						</div>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<strong>Total Tokens:</strong>{" "}
							{logs.totalTokens.input.toLocaleString()} input,{" "}
							{logs.totalTokens.output.toLocaleString()} output
						</div>
						<div>
							<strong>Average Duration:</strong>{" "}
							{formatDuration(logs.summary.averageRequestDuration)}
						</div>
						<div>
							<strong>Models Used:</strong>{" "}
							{logs.summary.uniqueModels.join(", ")}
						</div>
						<div>
							<strong>Cost per Request:</strong>{" "}
							{formatCost(logs.totalCost / logs.summary.totalRequests)}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Workflow Steps */}
			<div className="space-y-4">
				<h3 className="text-lg font-semibold">Workflow Steps</h3>
				{visibleSteps.map((step) => (
					<Card key={step.id} className={getStepStatusColor(step.status)}>
						<CardHeader className="pb-3">
							<Button
								variant="ghost"
								className="w-full justify-between p-0 h-auto cursor-pointer"
								onClick={() => toggleStep(step.id)}
							>
								<div className="flex items-center space-x-3">
									{getStepStatusIcon(step.status)}
									<div className="text-left">
										<div className="font-semibold">{step.displayName}</div>
										<div className="text-sm text-gray-600">
											{step.logs.length} requests
											{step.duration ? (
												<> • {formatDuration(step.duration)}</>
											) : null}
											{step.totalCost > 0 ? (
												<> • {formatCost(step.totalCost)}</>
											) : null}
										</div>
									</div>
								</div>
							</Button>
						</CardHeader>
						{expandedSteps.has(step.id) && (
							<CardContent className="pt-0">
								{step.logs.length === 0 ? (
									<div className="text-gray-500 text-sm py-2">
										No logs for this step
									</div>
								) : (
									<div className="space-y-3">
										{/* Model Usage Summary */}
										{Object.keys(step.modelUsage).length > 0 && (
											<div className="bg-gray-50 p-3 rounded-lg">
												<div className="text-sm font-medium mb-2">
													Model Usage:
												</div>
												<div className="space-y-1">
													{Object.entries(step.modelUsage).map(
														([model, usage]) => (
															<div
																key={model}
																className="flex justify-between text-xs"
															>
																<span>{model}</span>
																<span>
																	{usage.count} requests •{" "}
																	{formatCost(usage.totalCost)}
																</span>
															</div>
														),
													)}
												</div>
											</div>
										)}

										{/* Individual Logs */}
										<div className="space-y-2">
											{step.logs.map((log) => (
												<div
													key={log.id}
													className="border rounded-lg p-3 bg-white"
												>
													<div className="flex justify-between items-start mb-2">
														<div className="text-sm font-medium">
															{log.model}
														</div>
														<div className="text-xs text-gray-500 space-x-2">
															<span>{formatDuration(log.duration)}</span>
															<span>•</span>
															<span>{formatCost(log.cost)}</span>
															<span>•</span>
															<span>
																{log.tokens.input} → {log.tokens.output} tokens
															</span>
														</div>
													</div>
													<div className="text-xs space-y-1">
														<div>
															<strong>Request:</strong> {log.requestPreview}
														</div>
														<div>
															<strong>Response:</strong> {log.responsePreview}
														</div>
													</div>
												</div>
											))}
										</div>
									</div>
								)}
							</CardContent>
						)}
					</Card>
				))}
			</div>
		</div>
	);
}
