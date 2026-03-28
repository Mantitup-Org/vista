"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorMessage = getErrorMessage;
exports.isPermissionDeniedSpawnError = isPermissionDeniedSpawnError;
function getErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return String(error);
}
function isPermissionDeniedSpawnError(error) {
    const err = error;
    if (err?.code === 'EPERM' || err?.code === 'EACCES') {
        return true;
    }
    const message = getErrorMessage(error).toLowerCase();
    return (message.includes('eperm') ||
        message.includes('eacces') ||
        message.includes('operation not permitted') ||
        message.includes('access is denied'));
}
