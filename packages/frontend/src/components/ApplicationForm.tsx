import type { formCompleterSchema } from "@auto-apply/core/src/schema";
import type z from "zod";

export default function ApplicationForm({
	form,
}: {
	form: z.infer<typeof formCompleterSchema>;
}) {
	return (
		<div className="flex flex-col gap-4 overflow-y-auto">
			{form.formAnswers.map((answer) => (
				<div key={answer.answer} className="flex flex-col">
					<span className="text-lg font-bold">{answer.question}</span>
					<span className="italic">{answer.answer}</span>
				</div>
			))}
		</div>
	);
}
