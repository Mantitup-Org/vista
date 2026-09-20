const config = {
  images: {
    domains: ['example.com'],
    unoptimized: true,
  },
  deploy: {
    target: 'cloudflare',
    output: 'static',
  },
};

export default config;
