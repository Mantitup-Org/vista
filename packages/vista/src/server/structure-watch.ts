/**
 * Vista Structure Watch Service
 *
 * Watches app/, components/, and vista.config.* for file changes
 * and re-validates the structure on each batch of events.
 *
 * Emits normalized validation results that can be consumed by
 * the dev server SSE channel and build pipeline.
 */

import path from 'path';
import { EventEmitter } from 'events';
import {
  validateAppStructure,
  type StructureValidationResult,
  type ValidateAppStructureInput,
} from './structure-validator';
import { BUILD_DIR } from '../constants';

// ============================================================================
// Types
// ============================================================================

export interface StructureWatchEvent {
  state: 'ok' | 'error';
  issues: StructureValidationResult['issues'];
  changedPaths: string[];
  timestamp: number;
}

export interface StructureWatchOptions {
  cwd: string;
  debounceMs?: number;
  notFoundRoute?: string;
}

// ============================================================================
// Watch Service
// ============================================================================

export class StructureWatcher extends EventEmitter {
  private cwd: string;
  private debounceMs: number;
  private notFoundRoute: string | undefined;
  private watcher: any = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: string[] = [];
  private currentState: StructureValidationResult | null = null;

  constructor(options: StructureWatchOptions) {
    super();
    this.cwd = options.cwd;
    this.debounceMs = options.debounceMs ?? 60;
    this.notFoundRoute = options.notFoundRoute;
  }

  /**
   * Start watching. Performs an initial validation immediately.
   */
  async start(): Promise<StructureValidationResult> {
    // Initial validation
    const initialResult = this.validate([]);
    this.currentState = initialResult;

    // Set up chokidar watcher
    try {
      const chokidar = require('chokidar');
      const watchPaths = [
        path.join(this.cwd, 'app', '**', '*'),
        path.join(this.cwd, 'components', '**', '*'),
        path.join(this.cwd, 'vista.config.ts'),
        path.join(this.cwd, 'vista.config.js'),
      ];

      this.watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        ignored: ['**/node_modules/**', `**/${BUILD_DIR}/**`, '**/dist/**'],
        persistent: true,
      });

      this.watcher.on('all', (event: string, filePath: string) => {
        this.pendingChanges.push(filePath);
        this.scheduleBatch();
      });
    } catch {
      console.warn(
        '[vista:validate] chokidar not available. Structure watching is disabled. Install chokidar for live validation.'
      );
    }

    return initialResult;
  }

  /**
   * Stop the watcher and clean up resources.
   */
  stop(): void {
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
  getState(): StructureValidationResult | null {
    return this.currentState;
  }

  /**
   * Update the notFoundRoute from a newly resolved root.
   */
  setNotFoundRoute(route: string | undefined): void {
    this.notFoundRoute = route;
  }

  /**
   * Run validation manually (e.g. after build config change).
   */
  runValidation(): StructureValidationResult {
    const result = this.validate([]);
    this.currentState = result;
    return result;
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  private scheduleBatch(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flushBatch();
    }, this.debounceMs);
  }

  private flushBatch(): void {
    const changedPaths = [...this.pendingChanges];
    this.pendingChanges = [];
    this.debounceTimer = null;

    const result = this.validate(changedPaths);
    this.currentState = result;

    const event: StructureWatchEvent = {
      state: result.state,
      issues: result.issues,
      changedPaths,
      timestamp: result.timestamp,
    };

    this.emit('validation', event);

    if (result.state === 'error') {
      this.emit('structure-error', event);
    } else {
      this.emit('structure-ok', event);
    }
  }

  private validate(changedPaths: string[]): StructureValidationResult {
    const input: ValidateAppStructureInput = {
      cwd: this.cwd,
      notFoundRoute: this.notFoundRoute,
    };

    return validateAppStructure(input);
  }
}

/**
 * Convenience factory to create and start a watcher.
 */
export async function createStructureWatcher(
  options: StructureWatchOptions
): Promise<{ watcher: StructureWatcher; initialResult: StructureValidationResult }> {
  const watcher = new StructureWatcher(options);
  const initialResult = await watcher.start();
  return { watcher, initialResult };
}
