import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
	title: 'Sloth Scribe',
	description: 'Evidence-constrained write-up compiler',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
