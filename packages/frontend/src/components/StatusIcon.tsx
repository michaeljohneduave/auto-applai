import type { Sessions } from "@auto-apply/core/src/types";
import {
	Briefcase,
	Building2,
	CheckCircle,
	FileText,
	Loader2,
	XCircle,
} from "lucide-react";
import { useState } from "react";

interface StatusIconProps {
	status: Sessions["sessionStatus"];
	className?: string;
}

export default function StatusIcon({
	status,
	className = "",
}: StatusIconProps) {
	const [showTooltip, setShowTooltip] = useState(false);

	const getStatusConfig = (status: Sessions["sessionStatus"]) => {
		switch (status) {
			case "processing":
				return {
					icon: Loader2,
					color: "text-blue-600",
					tooltip: "Processing",
					animate: true,
				};
			case "done":
				return {
					icon: CheckCircle,
					color: "text-green-600",
					tooltip: "Completed",
					animate: false,
				};
			case "failed":
				return {
					icon: XCircle,
					color: "text-red-600",
					tooltip: "Failed",
					animate: false,
				};
			case "no-company-info":
				return {
					icon: Building2,
					color: "text-orange-600",
					tooltip: "No company info found",
					animate: false,
				};
			case "no-job-info":
				return {
					icon: Briefcase,
					color: "text-orange-600",
					tooltip: "No job info found",
					animate: false,
				};
			case "no-application-form":
				return {
					icon: FileText,
					color: "text-orange-600",
					tooltip: "No application form found",
					animate: false,
				};
			default:
				return {
					icon: Loader2,
					color: "text-gray-600",
					tooltip: "Unknown status",
					animate: false,
				};
		}
	};

	const config = getStatusConfig(status);
	const IconComponent = config.icon;

	return (
		<div className="relative inline-block">
			<div
				role="tooltip"
				className={`cursor-help ${className}`}
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
			>
				<IconComponent
					size={20}
					className={`${config.color} ${config.animate ? "animate-spin" : ""}`}
				/>
			</div>
			{showTooltip && (
				<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg z-50 whitespace-nowrap">
					{config.tooltip}
					<div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
				</div>
			)}
		</div>
	);
}
