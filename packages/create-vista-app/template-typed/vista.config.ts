const config = {
    engine: {
        // Engine options: 'default' or 'flashpack'
        variant: 'default',
    },
    images: {
        domains: ['example.com'],
    },
    experimental: {
        typedApi: {
            enabled: true,
            serialization: 'json',
        },
    },
    // Optional: override server port
    // server: {
    //     port: 3000
    // }
};

export default config;
