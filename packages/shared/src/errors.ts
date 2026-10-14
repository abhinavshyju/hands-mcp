export class EditerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EditerError";
    this.code = code;
  }
}

export class PathJailError extends EditerError {
  constructor(message: string) {
    super("PATH_JAIL", message);
    this.name = "PathJailError";
  }
}

export class ApprovalDeniedError extends EditerError {
  constructor(message: string) {
    super("APPROVAL_DENIED", message);
    this.name = "ApprovalDeniedError";
  }
}

export class PolicyDeniedError extends EditerError {
  constructor(message: string) {
    super("POLICY_DENIED", message);
    this.name = "PolicyDeniedError";
  }
}

export class EditError extends EditerError {
  constructor(message: string) {
    super("EDIT_FAILED", message);
    this.name = "EditError";
  }
}

export class AuthError extends EditerError {
  constructor(message: string) {
    super("AUTH", message);
    this.name = "AuthError";
  }
}
