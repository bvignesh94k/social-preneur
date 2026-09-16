export type FormState =
  | {
      ok?: boolean;
      message?: string;
      errors?: Record<string, string>;
      values?: Record<string, string>;
    }
  | undefined;
