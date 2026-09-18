function postgresCode(error: unknown): string | undefined {
  // Drizzle wraps driver errors, so the SQLSTATE code may sit one or two causes deep.
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown) => postgresCode(error) === "23505";
export const isForeignKeyViolation = (error: unknown) => postgresCode(error) === "23503";
