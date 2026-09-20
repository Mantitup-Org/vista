"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_LOADERS = exports.imageConfigDefault = void 0;
exports.resolveRuntimeImageConfig = resolveRuntimeImageConfig;
const constants_1 = require("../constants");
exports.imageConfigDefault = {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    path: constants_1.IMAGE_ENDPOINT,
    loader: 'default',
    loaderFile: '',
    domains: [],
    disableStaticImages: false,
    minimumCacheTTL: 60,
    formats: ['image/webp'],
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
    contentDispositionType: 'inline',
    remotePatterns: [],
    unoptimized: false,
};
function envDisablesImageOptimization() {
    return (process.env.VISTA_IMAGES_UNOPTIMIZED === '1' ||
        process.env.VISTA_DEPLOY_OUTPUT === 'static' ||
        process.env.CF_PAGES === '1' ||
        process.env.NETLIFY === 'true');
}
/** Merge defaults with build-time env (`VISTA_IMAGES_UNOPTIMIZED`, static deploy). */
function resolveRuntimeImageConfig(overrides) {
    return {
        ...exports.imageConfigDefault,
        ...overrides,
        unoptimized: overrides?.unoptimized === true ||
            exports.imageConfigDefault.unoptimized ||
            envDisablesImageOptimization(),
    };
}
exports.VALID_LOADERS = ['default', 'imgix', 'cloudinary', 'akamai', 'custom'];
