'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageProps = exports.getImgProps = exports.Image = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const get_img_props_1 = require("./get-img-props");
const image_config_1 = require("./image-config");
const image_loader_1 = require("./image-loader");
// Blur placeholder styles
const blurStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: 'blur(20px)',
    transform: 'scale(1.1)',
    transition: 'opacity 0.3s ease-in-out',
};
const wrapperStyle = {
    position: 'relative',
    overflow: 'hidden',
};
exports.Image = (0, react_1.forwardRef)((props, ref) => {
    const { placeholder, blurDataURL, onLoadingComplete, onError, priority, ...restProps } = props;
    const [isLoaded, setIsLoaded] = (0, react_1.useState)(false);
    const [useDirectSrc, setUseDirectSrc] = (0, react_1.useState)(false);
    // Combine refs
    const setRefs = (0, react_1.useCallback)((node) => {
        if (node && node.complete && node.naturalWidth > 0) {
            setIsLoaded(true);
        }
        if (typeof ref === 'function') {
            ref(node);
        }
        else if (ref) {
            ref.current = node;
        }
    }, [ref]);
    // Handle image load complete
    const handleLoad = (0, react_1.useCallback)((event) => {
        const img = event.currentTarget;
        setIsLoaded(true);
        if (onLoadingComplete) {
            onLoadingComplete({
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
            });
        }
    }, [onLoadingComplete]);
    const handleError = (0, react_1.useCallback)((event) => {
        if (!useDirectSrc) {
            // If optimizer endpoint fails (common on static hosts), fall back to raw src.
            setUseDirectSrc(true);
        }
        if (typeof onError === 'function') {
            onError(event);
        }
    }, [onError, useDirectSrc]);
    // Get processed img props
    const imgProps = (0, get_img_props_1.getImgProps)({ ...restProps, priority, unoptimized: useDirectSrc || restProps.unoptimized }, (0, image_config_1.resolveRuntimeImageConfig)(), image_loader_1.defaultLoader);
    const fallbackSrc = String(restProps.src || '');
    const effectiveSrc = useDirectSrc ? fallbackSrc : imgProps.src;
    const effectiveSrcSet = useDirectSrc ? undefined : imgProps.srcSet;
    // Determine if we should show blur placeholder
    const showBlur = placeholder === 'blur' && blurDataURL && !isLoaded;
    const needsWrapper = showBlur;
    // Render image element
    const imageElement = ((0, jsx_runtime_1.jsx)("img", { ...imgProps, ref: setRefs, onLoad: handleLoad, onError: handleError, style: {
            ...imgProps.style,
            ...(showBlur ? {
                opacity: isLoaded ? 1 : 0,
                transition: 'opacity 0.5s ease-in-out'
            } : {}),
        }, src: effectiveSrc, srcSet: effectiveSrcSet, decoding: priority ? 'sync' : 'async', fetchPriority: priority ? 'high' : undefined }));
    // Wrap with blur placeholder if needed
    if (needsWrapper) {
        return ((0, jsx_runtime_1.jsxs)("span", { style: {
                ...wrapperStyle,
                display: imgProps.style?.display || 'inline-block',
                width: imgProps.width,
                height: imgProps.height,
            }, children: [(0, jsx_runtime_1.jsx)("span", { style: {
                        ...blurStyle,
                        backgroundImage: `url("${blurDataURL}")`,
                        opacity: isLoaded ? 0 : 1,
                    }, "aria-hidden": "true" }), imageElement] }));
    }
    return imageElement;
});
exports.Image.displayName = 'Image';
var get_img_props_2 = require("./get-img-props");
Object.defineProperty(exports, "getImgProps", { enumerable: true, get: function () { return get_img_props_2.getImgProps; } });
Object.defineProperty(exports, "getImageProps", { enumerable: true, get: function () { return get_img_props_2.getImageProps; } });
exports.default = exports.Image;
