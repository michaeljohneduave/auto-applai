import type { Sessions } from "@auto-apply/core/src/types";
import {
	CheckCircle,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	FileText,
	HelpCircle,
} from "lucide-react";
import { useState } from "react";

export default function ApplicationForm({
	form,
}: {
	form: Sessions["answeredForm"];
}) {
	const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(
		new Set(),
	);

	const toggleAnswer = (index: number) => {
		const newExpanded = new Set(expandedAnswers);
		if (newExpanded.has(index)) {
			newExpanded.delete(index);
		} else {
			newExpanded.add(index);
		}
		setExpandedAnswers(newExpanded);
	};

	// Handle completely empty form
	if (!form) {
		return (
			<div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
				<div className="flex flex-col items-center gap-4 max-w-md">
					<div className="p-4 bg-gray-100 rounded-full">
						<ClipboardList className="w-12 h-12 text-gray-400" />
					</div>
					<div className="space-y-2">
						<h3 className="text-xl font-semibold text-gray-900">
							No Form Data Available
						</h3>
						<p className="text-gray-600">
							This application form hasn't been processed yet or contains no
							data.
						</p>
					</div>
					<div className="mt-4 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 w-full">
						<div className="space-y-3">
							<div className="h-4 bg-gray-200 rounded animate-pulse"></div>
							<div className="h-3 bg-gray-200 rounded w-3/4 animate-pulse"></div>
							<div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Handle form with no answers but potentially clarification requests
	if (!form.formAnswers || form.formAnswers.length === 0) {
		return (
			<div className="flex flex-col gap-6 p-6">
				{/* Empty answers section */}
				<div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
					<div className="flex flex-col items-center gap-3">
						<FileText className="w-10 h-10 text-gray-400" />
						<h3 className="text-lg font-semibold text-gray-900">
							No Answers Yet
						</h3>
						<p className="text-gray-600 max-w-sm">
							The form questions haven't been answered yet. Check below for any
							clarification requests.
						</p>
					</div>
				</div>

				{/* Clarification requests section */}
				{form.clarificationRequests &&
					form.clarificationRequests.length > 0 && (
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<HelpCircle className="w-5 h-5 text-orange-500" />
								<h3 className="text-lg font-semibold text-gray-900">
									Pending Questions
								</h3>
							</div>
							<div className="space-y-4">
								{form.clarificationRequests.map((request, index) => (
									<div
										key={`clarification-${request.originalQuestion.slice(0, 20)}-${index}`}
										className="p-4 border border-orange-200 rounded-lg bg-orange-50"
									>
										<div className="space-y-2">
											<p className="font-medium text-gray-900">
												{request.originalQuestion}
											</p>
											<p className="text-sm text-gray-700">
												{request.questionForUser}
											</p>
											<p className="text-xs text-orange-600 italic">
												{request.reasoning}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

				{/* Cover letter section if available */}
				{form.coverLetter && (
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<FileText className="w-5 h-5 text-blue-500" />
							<h3 className="text-lg font-semibold text-gray-900">
								Cover Letter
							</h3>
						</div>
						<div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
							<p className="text-sm text-gray-700 whitespace-pre-wrap">
								{form.coverLetter}
							</p>
						</div>
					</div>
				)}
			</div>
		);
	}

	// Handle form with answers (existing behavior)
	return (
		<div className="flex flex-col gap-6 p-6">
			{/* Completed answers section */}
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<CheckCircle className="w-5 h-5 text-green-500" />
					<h3 className="text-lg font-semibold text-gray-900">
						Completed Answers
					</h3>
				</div>
				<div className="space-y-4">
					{form.formAnswers.map((answer, index) => {
						const isExpanded = expandedAnswers.has(index);
						const answerPreview =
							answer.answer.length > 100
								? `${answer.answer.slice(0, 100)}...`
								: answer.answer;

						return (
							<div
								key={`answer-${index}-${answer.question.slice(0, 20)}`}
								className="border border-green-200 rounded-lg bg-green-50 overflow-hidden"
							>
								<button
									type="button"
									onClick={() => toggleAnswer(index)}
									className="w-full p-4 text-left hover:bg-green-100 transition-colors flex items-center justify-between"
								>
									<div className="flex-1 min-w-0">
										<p className="font-medium text-gray-900 truncate">
											{answer.question}
										</p>
										{!isExpanded && (
											<p className="text-sm text-gray-600 mt-1 truncate">
												{answerPreview}
											</p>
										)}
									</div>
									<div className="flex items-center gap-2 ml-4">
										{answer.confidence && (
											<div className="flex items-center gap-1">
												{Array.from({ length: 10 }, (_, i) => (
													<div
														key={`confidence-${answer.question}`}
														className={`w-1.5 h-1.5 rounded-full ${
															i < answer.confidence
																? "bg-green-400"
																: "bg-gray-200"
														}`}
													/>
												))}
											</div>
										)}
										{isExpanded ? (
											<ChevronDown className="w-4 h-4 text-gray-500" />
										) : (
											<ChevronRight className="w-4 h-4 text-gray-500" />
										)}
									</div>
								</button>
								{isExpanded && (
									<div className="px-4 pb-4 border-t border-green-200 bg-white">
										<div className="pt-4 space-y-3">
											<p className="text-sm text-gray-700 whitespace-pre-wrap">
												{answer.answer}
											</p>
											{answer.confidence && (
												<div className="flex items-center gap-2 pt-2 border-t border-gray-100">
													<span className="text-xs text-gray-500">
														Confidence:
													</span>
													<div className="flex gap-1">
														{Array.from({ length: 10 }, (_, i) => (
															<div
																key={`confidence-${answer.question}`}
																className={`w-2 h-2 rounded-full ${
																	i < answer.confidence
																		? "bg-green-400"
																		: "bg-gray-200"
																}`}
															/>
														))}
													</div>
													<span className="text-xs text-gray-500">
														({answer.confidence}/10)
													</span>
												</div>
											)}
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>

			{/* Clarification requests section */}
			{form.clarificationRequests && form.clarificationRequests.length > 0 && (
				<div className="space-y-4">
					<div className="flex items-center gap-2">
						<HelpCircle className="w-5 h-5 text-orange-500" />
						<h3 className="text-lg font-semibold text-gray-900">
							Pending Questions
						</h3>
					</div>
					<div className="space-y-4">
						{form.clarificationRequests.map((request, index) => (
							<div
								key={`clarification-${request.originalQuestion.slice(0, 20)}-${index}`}
								className="p-4 border border-orange-200 rounded-lg bg-orange-50"
							>
								<div className="space-y-2">
									<p className="font-medium text-gray-900">
										{request.originalQuestion}
									</p>
									<p className="text-sm text-gray-700">
										{request.questionForUser}
									</p>
									<p className="text-xs text-orange-600 italic">
										{request.reasoning}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Cover letter section */}
			{form.coverLetter && (
				<div className="space-y-4">
					<div className="flex items-center gap-2">
						<FileText className="w-5 h-5 text-blue-500" />
						<h3 className="text-lg font-semibold text-gray-900">
							Cover Letter
						</h3>
					</div>
					<div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
						<p className="text-sm text-gray-700 whitespace-pre-wrap">
							{form.coverLetter}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
