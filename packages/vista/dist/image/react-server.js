"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageProps = exports.getImgProps = void 0;
exports.Image = Image;
const jsx_runtime_1 = require("react/jsx-runtime");
const get_img_props_1 = require("./get-img-props");
const image_config_1 = require("./image-config");
const image_loader_1 = require("./image-loader");
/**
 * React-server safe Image component.
 *
 * The full client Image implementation relies on browser-only hooks, so the
 * react-server condition uses a plain SSR-friendly <img> wrapper.
 */
function Image(props) {
    const imgProps = (0, get_img_props_1.getImgProps)(props, (0, image_config_1.resolveRuntimeImageConfig)(), image_loader_1.defaultLoader);
    return ((0, jsx_runtime_1.jsx)("img", { ...imgProps, decoding: props.priority ? 'sync' : 'async', fetchPriority: props.priority ? 'high' : undefined }));
}
var get_img_props_2 = require("./get-img-props");
Object.defineProperty(exports, "getImgProps", { enumerable: true, get: function () { return get_img_props_2.getImgProps; } });
Object.defineProperty(exports, "getImageProps", { enumerable: true, get: function () { return get_img_props_2.getImageProps; } });
exports.default = Image;
