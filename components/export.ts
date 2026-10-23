import { Draft } from '../src/core/draft/types';
import { VerifiedClaim } from '../src/core/verifier/types';

export function exportDraftToMarkdown(
	draft: Draft,
	verifiedClaims: VerifiedClaim[]
): string {
	const verifiedMap = new Map<string, VerifiedClaim>();
	for (const v of verifiedClaims) {
		verifiedMap.set(v.claim_id, v);
	}

	const paragraphTexts: string[] = [];

	for (const paragraph of draft.paragraphs) {
		const sentenceTexts: string[] = [];

		for (const claim of paragraph.claims) {
			const verified = verifiedMap.get(claim.claim_id);
			if (verified && verified.status === 'needs_input') {
				sentenceTexts.push(`[NEEDS INPUT: ${verified.reason}]`);
			} else {
				sentenceTexts.push(claim.text);
			}
		}

		if (sentenceTexts.length > 0) {
			paragraphTexts.push(sentenceTexts.join(' '));
		}
	}

	return paragraphTexts.join('\n\n');
}

export function downloadMarkdownFile(filename: string, content: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
