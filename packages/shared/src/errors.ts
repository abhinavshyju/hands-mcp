export class HandsError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HandsError";
    this.code = code;
  }
}

export class PathJailError extends HandsError {
  constructor(message: string) {
    super("PATH_JAIL", message);
    this.name = "PathJailError";
  }
}

export class ApprovalDeniedError extends HandsError {
  constructor(message: string) {
    super("APPROVAL_DENIED", message);
    this.name = "ApprovalDeniedError";
  }
}

export class PolicyDeniedError extends HandsError {
  constructor(message: string) {
    super("POLICY_DENIED", message);
    this.name = "PolicyDeniedError";
  }
}

export class EditError extends HandsError {
  constructor(message: string) {
    super("EDIT_FAILED", message);
    this.name = "EditError";
  }
}

export class AuthError extends HandsError {
  constructor(message: string) {
    super("AUTH", message);
    this.name = "AuthError";
  }
}
