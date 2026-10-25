/** @type {import('next').NextConfig} */
const nextConfig = {
	typescript: {
		tsconfigPath: 'tsconfig.next.json',
		ignoreBuildErrors: true,
	},
};

module.exports = nextConfig;

