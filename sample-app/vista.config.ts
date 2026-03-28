const config = {
  engine: {
    // Engine options: 'default' or 'flashpack'
    variant: 'default',
  },
  images: {
    domains: ['example.com'],
    // For static hosts where the /_vista/image endpoint is not available:
    // unoptimized: true,
  },
  // Optional: override server port
  // server: {
  //   port: 3003
  // }
};

export default config;
