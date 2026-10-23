import React from 'react';
import { RunRecord } from '../src/core/draft/types';

export interface SummaryBarProps {
	runRecord: RunRecord;
}

export function SummaryBar({ runRecord }: SummaryBarProps) {
	const { claim_counts, timings, model, fallback_used, fallback_reason } =
		runRecord;

	return (
		<div
			aria-label="Run Summary"
			className="border border-gray-300 rounded bg-gray-50 p-3 text-xs font-mono space-y-2 text-gray-800"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
				<div className="flex flex-wrap items-center gap-3">
					<span className="font-sans font-semibold text-gray-900">
						Run Summary:
					</span>
					<span
						data-testid="count-verified"
						className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold"
					>
						VERIFIED: {claim_counts.verified}
					</span>
					<span
						data-testid="count-interpretation"
						className="inline-flex items-center px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300 font-bold"
					>
						INTERPRETATION: {claim_counts.interpretation}
					</span>
					<span
						data-testid="count-needs-input"
						className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold"
					>
						NEEDS INPUT: {claim_counts.needs_input}
					</span>
					<span className="text-gray-600">Total: {claim_counts.total}</span>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-gray-500">Model:</span>
					<span className="font-semibold text-gray-900">{model}</span>
					<span
						className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
							fallback_used
								? 'bg-amber-200 text-amber-900 border border-amber-400'
								: 'bg-gray-200 text-gray-700'
						}`}
					>
						Fallback: {fallback_used ? 'YES' : 'NO'}
					</span>
					{fallback_used && fallback_reason && (
						<span className="text-amber-800 text-[10px]">
							({fallback_reason})
						</span>
					)}
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-4 text-gray-600 text-[11px]">
				<span className="text-gray-500 font-semibold">Stage Durations:</span>
				<span>Scan: {timings.scan}ms</span>
				<span>Ledger: {timings.ledger}ms</span>
				<span>Generate: {timings.generate}ms</span>
				<span>Verify: {timings.verify}ms</span>
				<span className="font-bold text-gray-900">Total: {timings.total}ms</span>
			</div>
		</div>
	);
}
