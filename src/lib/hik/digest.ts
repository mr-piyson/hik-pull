import { createHash, randomBytes } from "node:crypto";

/**
 * RFC 7616 HTTP Digest authentication, scoped to what Hikvision ISAPI
 * firmware actually speaks: `algorithm=MD5` / `MD5-SESS` and `qop=auth`.
 * SHA-256 is not implemented by Hikvision firmware, so it is rejected loudly
 * rather than silently downgraded.
 *
 * ## Why this is stateless
 *
 * Some Hikvision firmware (observed on DS-K2702WX V1.7.4) issues *single-use*
 * nonces: replaying one — even with an incremented `nc`, which RFC 7616
 * permits — is rejected with a 401 that carries no fresh challenge. Caching a
 * challenge is therefore not merely an optimisation, it is actively broken.
 * Worse, a shared mutable cache races when concurrent requests interleave:
 * one handler caches nonce X, another consumes it, the first then replays a
 * dead nonce and gets an unparseable failure.
 *
 * So this module holds no nonce state at all. It computes an Authorization
 * header from the challenge handed to it, with a fresh `cnonce` and
 * `nc=00000001` every call. That makes one instance safe for unsynchronized
 * concurrent use, and costs exactly one extra round-trip per request.
 */

export type DigestChallenge = {
  realm: string;
  nonce: string;
  /** `null` when the device omits `qop` (RFC 2069 fallback). */
  qop: string | null;
  algorithm: string;
  opaque: string | null;
};

const TOKEN_RE = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g;

const UNSUPPORTED_ALGORITHMS = new Set([
  "SHA-256",
  "SHA-256-SESS",
  "SHA-512-256",
  "SHA-512-256-SESS",
]);

/** Parse a `WWW-Authenticate` header value into a challenge. */
export function parseChallenge(header: string): DigestChallenge {
  let rest = header.trim();
  if (rest.toLowerCase().startsWith("digest")) {
    rest = rest.slice("digest".length).trimStart();
  }

  const params = new Map<string, string>();
  // RegExp with /g needs a fresh lastIndex for each parse; the literal below
  // is module-scoped so we reset rather than share it across callers.
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(rest);
  while (match !== null) {
    const key = match[1].toLowerCase();
    const quoted = match[2];
    // Unescape backslash escapes inside a quoted-string (RFC 7230).
    params.set(
      key,
      quoted === undefined
        ? (match[3] ?? "")
        : quoted.replace(/\\(.)/g, (_full, char: string) => char),
    );
    match = TOKEN_RE.exec(rest);
  }

  const nonce = params.get("nonce");
  if (!nonce) {
    throw new Error(`WWW-Authenticate challenge has no nonce: ${header}`);
  }

  const rawQop = params.get("qop");
  let qop: string | null = null;
  if (rawQop) {
    const offered = rawQop.split(",").map((value) => value.trim());
    qop = offered.includes("auth") ? "auth" : (offered[0] ?? null);
  }

  return {
    realm: params.get("realm") ?? "",
    nonce,
    qop,
    algorithm: (params.get("algorithm") ?? "MD5").toUpperCase(),
    opaque: params.get("opaque") ?? null,
  };
}

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

export type DigestAuthorizationInput = {
  username: string;
  password: string;
  challenge: DigestChallenge;
  method: string;
  /**
   * Request URI exactly as it appears on the request line (path plus query).
   * It feeds the HA2 hash, so the caller MUST send the same URI it passes
   * here — a mismatch produces a response hash the device cannot verify.
   */
  uri: string;
};

/** Build the `Authorization` header value for one request. */
export function buildDigestAuthorization(
  input: DigestAuthorizationInput,
): string {
  const { username, password, challenge, method, uri } = input;
  const { realm, nonce, qop, algorithm, opaque } = challenge;

  if (UNSUPPORTED_ALGORITHMS.has(algorithm)) {
    throw new Error(
      `Device requested unsupported digest algorithm ${algorithm}; Hikvision firmware speaks MD5 only.`,
    );
  }

  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");

  let ha1 = md5Hex(`${username}:${realm}:${password}`);
  if (algorithm === "MD5-SESS") {
    ha1 = md5Hex(`${ha1}:${nonce}:${cnonce}`);
  }

  const ha2 = md5Hex(`${method}:${uri}`);
  const response =
    qop === null
      ? md5Hex(`${ha1}:${nonce}:${ha2}`)
      : md5Hex(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
  ];
  if (qop !== null) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (opaque !== null) {
    parts.push(`opaque="${opaque}"`);
  }

  return `Digest ${parts.join(", ")}`;
}
