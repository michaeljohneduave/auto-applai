import type { Sessions } from "@auto-apply/core/src/db/schema";

export default function ApplicationForm({
	form,
}: {
	form: Sessions["answeredForm"];
}) {
	return (
		<div className="flex flex-col gap-4 overflow-y-auto">
			{form?.formAnswers?.map((answer) => (
				<div key={answer.answer} className="flex flex-col">
					<span className="text-lg font-bold">{answer.question}</span>
					<span className="italic">{answer.answer}</span>
				</div>
			))}
		</div>
	);
}
