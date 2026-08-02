// ============================================================================
// Update Error Classifier
// ----------------------------------------------------------------------------
// electron-updater surfaces failures as raw `HttpError` / network objects whose
// message contains request URLs, response headers, and internal stack context.
// That text must never reach the client UI. This module classifies the error
// into a small, stable set of user-facing reasons, each with a concise English
// fallback message. The renderer maps the `code` to localized copy; the raw
// error is still logged on the desktop side for diagnostics.
// ============================================================================

export type UpdateErrorCode =
  | "release-not-published"
  | "network"
  | "server-rejected"
  | "generic";

export interface ClassifiedUpdateError {
  code: UpdateErrorCode;
  message: string;
}

const RELEASE_NOT_PUBLISHED_PATTERN =
  /cannot find latest(?:-mac|-linux)?\.yml|release artifacts|404/;
const SERVER_REJECTED_PATTERN = /401|403|unauthorized|forbidden/i;
const NETWORK_PATTERN =
  /enotfound|econnrefused|econnreset|etimedout|enetunreach|getaddrinfo|network/i;

const FALLBACK_MESSAGES: Record<UpdateErrorCode, string> = {
  "release-not-published":
    "The latest release is not published yet. Try checking again later.",
  network:
    "Cannot reach the update server. Check your network connection and try again.",
  "server-rejected":
    "The update server rejected this request. If this keeps happening, reinstall the latest release.",
  generic: "Update check failed. Please try again later.",
};

/**
 * Map a raw updater error to a concise user-facing reason. The returned
 * `message` never contains request URLs, headers, or stack traces.
 */
export function classifyUpdateError(err: unknown): ClassifiedUpdateError {
  const message = err instanceof Error ? err.message : String(err);
  const code: UpdateErrorCode = classifyCode(message);
  return { code, message: FALLBACK_MESSAGES[code] };
}

function classifyCode(message: string): UpdateErrorCode {
  if (RELEASE_NOT_PUBLISHED_PATTERN.test(message)) return "release-not-published";
  if (SERVER_REJECTED_PATTERN.test(message)) return "server-rejected";
  if (NETWORK_PATTERN.test(message)) return "network";
  return "generic";
}
