/**
 * react-server-dom-webpack/client.node calls __webpack_require__ while decoding
 * Flight into a React tree. Vista SSR/SSG run in plain Node, so this shim maps
 * webpack specifiers (including file:// URLs) onto require().
 */
export declare function installSSRWebpackShim(): void;
