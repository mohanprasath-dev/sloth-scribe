import './globals.css';

export const metadata = {
	title: 'Sloth Scribe',
	description: 'Evidence-constrained write-up compiler',
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
