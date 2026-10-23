import React from 'react';
import { VerifiedClaim } from '../src/core/verifier/types';

export interface SentenceChipProps {
	claim: VerifiedClaim;
	isSelected: boolean;
	onSelect: (claim: VerifiedClaim) => void;
}

export function SentenceChip({ claim, isSelected, onSelect }: SentenceChipProps) {
	const status = claim.status;

	let statusLabel = 'VERIFIED';
	let containerStyle =
		'border-solid border-2 border-emerald-700 bg-emerald-50 text-emerald-950';
	let badgeStyle = 'bg-emerald-200 text-emerald-900 border border-emerald-800';

	if (status === 'interpretation') {
		statusLabel = 'INTERPRETATION';
		containerStyle = 'border-dotted border-2 border-sky-700 bg-sky-50 text-sky-950';
		badgeStyle = 'bg-sky-200 text-sky-900 border border-sky-800';
	} else if (status === 'needs_input') {
		statusLabel = 'NEEDS INPUT';
		containerStyle = 'border-dashed border-2 border-amber-700 bg-amber-50 text-amber-950';
		badgeStyle = 'bg-amber-200 text-amber-900 border border-amber-800';
	}

	const selectedStyle = isSelected
		? 'ring-2 ring-black ring-offset-2 shadow-sm'
		: 'hover:shadow-sm';

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(claim);
		}
	};

	return (
		<span
			role="button"
			tabIndex={0}
			data-testid={`sentence-chip-${claim.claim_id}`}
			data-status={claim.status}
			aria-pressed={isSelected}
			onClick={() => onSelect(claim)}
			onKeyDown={handleKeyDown}
			className={`inline-flex flex-wrap items-baseline gap-1.5 p-1.5 m-1 rounded cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${containerStyle} ${selectedStyle}`}
		>
			<span
				data-testid="status-label"
				className={`text-xs font-bold font-mono px-1 py-0.5 rounded tracking-wide ${badgeStyle}`}
			>
				{statusLabel}
			</span>
			<span className="text-sm font-normal leading-relaxed">{claim.text}</span>
		</span>
	);
}
