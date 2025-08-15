import type { Sessions } from "@auto-apply/core/src/types";
import {
	CheckCircle,
	ChevronDown,
	Clock,
	Loader2,
	XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface JobStatusBadgeProps {
	status: Sessions["jobStatus"];
	onStatusChange: (newStatus: Sessions["jobStatus"]) => void;
	className?: string;
	disabled?: boolean;
}

export default function JobStatusBadge({
	status,
	onStatusChange,
	className = "",
	disabled = false,
}: JobStatusBadgeProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const getStatusConfig = (status: Sessions["jobStatus"]) => {
		switch (status) {
			case "in_progress":
				return {
					icon: Clock,
					color: "text-blue-600",
					bgColor: "bg-blue-50",
					borderColor: "border-blue-200",
					label: "Processing",
				};
			case "applied":
				return {
					icon: CheckCircle,
					color: "text-green-600",
					bgColor: "bg-green-50",
					borderColor: "border-green-200",
					label: "Applied",
				};
			case "not_applied":
				return {
					icon: XCircle,
					color: "text-gray-600",
					bgColor: "bg-gray-50",
					borderColor: "border-gray-200",
					label: "Not Applied",
				};
			default:
				return {
					icon: Clock,
					color: "text-gray-600",
					bgColor: "bg-gray-50",
					borderColor: "border-gray-200",
					label: "Unknown",
				};
		}
	};

	const config = getStatusConfig(status);
	const IconComponent = config.icon;

	const handleStatusChange = (newStatus: Sessions["jobStatus"]) => {
		onStatusChange(newStatus);
		setIsOpen(false);
	};

	return (
		<div className={cn("relative", className)} ref={dropdownRef}>
			<button
				type="button"
				onClick={() => !disabled && setIsOpen(!isOpen)}
				disabled={disabled}
				className={cn(
					"flex items-center justify-center gap-2 px-1 w-full py-1 rounded-md border text-sm font-medium transition-all duration-200",
					config.bgColor,
					config.borderColor,
					config.color,
					{
						"cursor-pointer hover:shadow-sm hover:scale-105": !disabled,
						"cursor-not-allowed opacity-60": disabled,
					},
				)}
			>
				<IconComponent size={16} />
				<span className="text-xs">{config.label}</span>
				<ChevronDown
					size={14}
					className={cn("transition-transform duration-200", {
						"rotate-180": isOpen,
					})}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
					<div className="py-1">
						{[
							{
								value: "in_progress",
								label: "Processing",
								icon: Clock,
								color: "text-blue-600",
							},
							{
								value: "applied",
								label: "Applied",
								icon: CheckCircle,
								color: "text-green-600",
							},
							{
								value: "not_applied",
								label: "Not Applied",
								icon: XCircle,
								color: "text-gray-600",
							},
						].map((option) => {
							const OptionIcon = option.icon;
							return (
								<button
									key={option.value}
									type="button"
									onClick={() =>
										handleStatusChange(option.value as Sessions["jobStatus"])
									}
									className={cn(
										"w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors duration-150",
										{
											"bg-blue-50 text-blue-700": status === option.value,
											"text-gray-700": status !== option.value,
										},
									)}
								>
									<OptionIcon size={16} className={option.color} />
									<span>{option.label}</span>
									{status === option.value && (
										<div className="ml-auto w-2 h-2 bg-blue-600 rounded-full" />
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
