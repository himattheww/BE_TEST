export const success = <T>(data: T) => ({ success: true as const, data });

export const failure = (code: string, message: string, details?: unknown) => ({
  success: false as const,
  error: { code, message, ...(details === undefined ? {} : { details }) },
});
