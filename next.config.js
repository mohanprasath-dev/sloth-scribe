/** @type {import('next').NextConfig} */
const nextConfig = {
	typescript: {
		tsconfigPath: 'tsconfig.next.json',
		ignoreBuildErrors: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
};

module.exports = nextConfig;


