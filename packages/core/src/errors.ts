export class NotFoundError extends Error {
  readonly code = "not_found";
  constructor(what = "Item") {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

export class InvalidInputError extends Error {
  readonly code = "invalid_input";
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "forbidden";
  constructor(readonly permission: string) {
    super("You do not have permission to do this.");
    this.name = "ForbiddenError";
  }
}
