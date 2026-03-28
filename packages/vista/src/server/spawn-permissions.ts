export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

export function isPermissionDeniedSpawnError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException | null;
  if (err?.code === 'EPERM' || err?.code === 'EACCES') {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('eperm') ||
    message.includes('eacces') ||
    message.includes('operation not permitted') ||
    message.includes('access is denied')
  );
}
