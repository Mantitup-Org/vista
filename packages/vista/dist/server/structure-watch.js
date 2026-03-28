"use strict";
/**
 * Vista Structure Watch Service
 *
 * Watches app/, components/, and vista.config.* for file changes
 * and re-validates the structure on each batch of events.
 *
 * Emits normalized validation results that can be consumed by
 * the dev server SSE channel and build pipeline.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructureWatcher = void 0;
exports.createStructureWatcher = createStructureWatcher;
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const structure_validator_1 = require("./structure-validator");
const constants_1 = require("../constants");
// ============================================================================
// Watch Service
// ============================================================================
class StructureWatcher extends events_1.EventEmitter {
    cwd;
    debounceMs;
    notFoundRoute;
    watcher = null;
    debounceTimer = null;
    pendingChanges = [];
    currentState = null;
    constructor(options) {
        super();
        this.cwd = options.cwd;
        this.debounceMs = options.debounceMs ?? 60;
        this.notFoundRoute = options.notFoundRoute;
    }
    /**
     * Start watching. Performs an initial validation immediately.
     */
    async start() {
        // Initial validation
        const initialResult = this.validate([]);
        this.currentState = initialResult;
        // Set up chokidar watcher
        try {
            const chokidar = require('chokidar');
            const watchPaths = [
                path_1.default.join(this.cwd, 'app', '**', '*'),
                path_1.default.join(this.cwd, 'components', '**', '*'),
                path_1.default.join(this.cwd, 'vista.config.ts'),
                path_1.default.join(this.cwd, 'vista.config.js'),
            ];
            this.watcher = chokidar.watch(watchPaths, {
                ignoreInitial: true,
                ignored: ['**/node_modules/**', `**/${constants_1.BUILD_DIR}/**`, '**/dist/**'],
                persistent: true,
            });
            this.watcher.on('all', (event, filePath) => {
                this.pendingChanges.push(filePath);
                this.scheduleBatch();
            });
        }
        catch {
            console.warn('[vista:validate] chokidar not available. Structure watching is disabled. Install chokidar for live validation.');
        }
        return initialResult;
    }
    /**
     * Stop the watcher and clean up resources.
     */
    stop() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        this.pendingChanges = [];
    }
    /**
     * Get the most recent validation result.
     */
    getState() {
        return this.currentState;
    }
    /**
     * Update the notFoundRoute from a newly resolved root.
     */
    setNotFoundRoute(route) {
        this.notFoundRoute = route;
    }
    /**
     * Run validation manually (e.g. after build config change).
     */
    runValidation() {
        const result = this.validate([]);
        this.currentState = result;
        return result;
    }
    // --------------------------------------------------------------------------
    // Internals
    // --------------------------------------------------------------------------
    scheduleBatch() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.flushBatch();
        }, this.debounceMs);
    }
    flushBatch() {
        const changedPaths = [...this.pendingChanges];
        this.pendingChanges = [];
        this.debounceTimer = null;
        const result = this.validate(changedPaths);
        this.currentState = result;
        const event = {
            state: result.state,
            issues: result.issues,
            changedPaths,
            timestamp: result.timestamp,
        };
        this.emit('validation', event);
        if (result.state === 'error') {
            this.emit('structure-error', event);
        }
        else {
            this.emit('structure-ok', event);
        }
    }
    validate(changedPaths) {
        const input = {
            cwd: this.cwd,
            notFoundRoute: this.notFoundRoute,
        };
        return (0, structure_validator_1.validateAppStructure)(input);
    }
}
exports.StructureWatcher = StructureWatcher;
/**
 * Convenience factory to create and start a watcher.
 */
async function createStructureWatcher(options) {
    const watcher = new StructureWatcher(options);
    const initialResult = await watcher.start();
    return { watcher, initialResult };
}
