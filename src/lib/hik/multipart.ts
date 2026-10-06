/**
 * Incremental parser for the `multipart/mixed` framing Hikvision uses on
 * `/ISAPI/Event/notification/alertStream`.
 *
 * Byte-oriented on purpose: decoding as text while chunks are still arriving
 * can split a multibyte sequence across a chunk boundary and corrupt the XML.
 * Chunks are therefore concatenated as bytes and only decoded once a whole
 * part has been delimited.
 */

export type MultipartPart = {
  headers: Record<string, string>;
  body: string;
};

/** `subarray` widens the backing-buffer type, so pin it explicitly. */
type Bytes = Uint8Array<ArrayBufferLike>;

const CRLF = new Uint8Array([0x0d, 0x0a]);
const DOUBLE_CRLF = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]);
/** Byte 0x3e: the last byte of any XML element. */
const GREATER_THAN = 0x3e;

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function indexOf(haystack: Bytes, needle: Bytes, from: number): number {
  const limit = haystack.length - needle.length;
  outer: for (let i = from; i <= limit; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function startsWith(haystack: Bytes, needle: Bytes, at: number): boolean {
  for (let j = 0; j < needle.length; j += 1) {
    if (haystack[at + j] !== needle[j]) {
      return false;
    }
  }
  return true;
}

function concat(a: Bytes, b: Bytes): Bytes {
  const merged = new Uint8Array(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  return merged;
}

/** Trim the trailing CRLF that belongs to the delimiter, not the payload. */
function stripTrailingCrLf(body: Bytes): Bytes {
  if (
    body.length >= 2 &&
    body[body.length - 2] === 0x0d &&
    body[body.length - 1] === 0x0a
  ) {
    return body.subarray(0, body.length - 2);
  }
  return body;
}

function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers[line.slice(0, separator).trim().toLowerCase()] = line
        .slice(separator + 1)
        .trim();
    }
  }
  return headers;
}

/** Pull `boundary=` out of a `multipart/mixed; boundary=...` header. */
export function extractBoundary(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const value = match?.[1] ?? match?.[2];
  return value ? value.trim() : null;
}

/** Whether a payload looks like XML, the framing ISAPI uses for alerts. */
export function looksLikeXml(text: string): boolean {
  const head = text.trimStart().slice(0, 200);
  return head.startsWith("<");
}

/**
 * Minimal recursive-descent XML parser producing ISAPI's JSON shape.
 *
 * ISAPI advertises `?format=json`, but firmware commonly ignores it on the
 * alert stream and returns XML instead. Rather than assume JSON, this parses
 * XML into the same shape the JSON endpoint would have returned, so the event
 * normalizer has a single input format.
 *
 * Scope is deliberately narrow: elements, attributes and text. No entities
 * beyond the five predefined ones, no CDATA, no namespaces, no mixed content
 * arrays. Anything it cannot represent degrades to a string.
 */

const NAME = "[A-Za-z_][\\w.:-]*";
const TAG_RE = new RegExp(`<(${NAME})((?:"[^"]*"|'[^']*'|[^>"'])*)>`, "g");
const ATTR_RE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos);/g,
    (entity) => ENTITIES[entity] ?? entity,
  );
}

function assign(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    target[key] = [existing, value];
  }
}

function appendText(node: Record<string, unknown>, raw: string): void {
  const text = decodeEntities(raw.trim());
  if (text.length > 0) {
    assign(node, "#text", text);
  }
}

function parseAttributes(attrSource: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match = ATTR_RE.exec(attrSource);
  while (match !== null) {
    // `@` prefix mirrors the convention ISAPI's own JSON output uses.
    attributes[`@${match[1]}`] = decodeEntities(match[2] ?? match[3] ?? "");
    match = ATTR_RE.exec(attrSource);
  }
  return attributes;
}

/**
 * Parse an element body. Returns a plain string for a leaf element so the
 * shape matches ISAPI's own JSON output (`<subEventType>1</subEventType>`
 * becomes `"1"`, not `{ "#text": "1" }`).
 */
function parseFragment(inner: string): unknown {
  const node: Record<string, unknown> = {};
  let cursor = 0;

  TAG_RE.lastIndex = 0;
  let match = TAG_RE.exec(inner);
  while (match !== null) {
    const [full, name, attrSource = ""] = match;
    appendText(node, inner.slice(cursor, match.index));

    const tagEnd = match.index + full.length;

    if (attrSource.trimEnd().endsWith("/")) {
      assign(node, name, parseAttributes(attrSource.replace(/\/\s*$/, "")));
      cursor = tagEnd;
    } else {
      const closeTag = `</${name}>`;
      const closeIndex = inner.indexOf(closeTag, tagEnd);
      if (closeIndex === -1) {
        // Unterminated element: treat as empty and resynchronise on the next
        // tag rather than abandoning the whole payload.
        assign(node, name, parseAttributes(attrSource));
        cursor = tagEnd;
      } else {
        let child = parseFragment(inner.slice(tagEnd, closeIndex));
        if (typeof child === "object" && child !== null) {
          child = { ...child, ...parseAttributes(attrSource) };
        } else if (Object.keys(parseAttributes(attrSource)).length > 0) {
          child = { "@value": child, ...parseAttributes(attrSource) };
        }
        assign(node, name, child);
        cursor = closeIndex + closeTag.length;
      }
    }

    TAG_RE.lastIndex = cursor;
    match = TAG_RE.exec(inner);
  }

  appendText(node, inner.slice(cursor));

  if (Object.keys(node).length === 1 && "#text" in node) {
    return node["#text"];
  }
  return node;
}

/**
 * Convert an ISAPI XML document to the JSON shape its JSON endpoint produces.
 * Returns `null` when the payload is not a single-rooted XML element.
 */
export function xmlToJson(text: string): Record<string, unknown> | null {
  // Real ISAPI payloads lead with `<?xml version="1.0" encoding="UTF-8" ?>`, so
  // the prolog has to be skipped before the root element can be matched.
  const prolog = /^(?:\s*<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/.exec(
    text,
  );
  const body = (prolog ? text.slice(prolog[0].length) : text).trim();
  if (!body.startsWith("<")) {
    return null;
  }

  TAG_RE.lastIndex = 0;
  const match = TAG_RE.exec(body);
  if (!match) {
    return null;
  }

  const [full, rootName, attrSource = ""] = match;
  const tagEnd = match.index + full.length;
  const attributes = parseAttributes(attrSource.replace(/\/\s*$/, ""));

  if (attrSource.trimEnd().endsWith("/")) {
    return { [rootName]: attributes };
  }

  const closeTag = `</${rootName}>`;
  const closeIndex = body.indexOf(closeTag, tagEnd);
  if (closeIndex === -1) {
    return null;
  }

  const root = parseFragment(body.slice(tagEnd, closeIndex));
  const rootObject =
    typeof root === "object" && root !== null
      ? { ...root, ...attributes }
      : attributes;
  return { [rootName]: rootObject };
}

type ScanResult = {
  parts: MultipartPart[];
  /** Bytes that belong to a part not yet fully received. */
  rest: Bytes;
  /** True once the terminating `--boundary--` was seen. */
  finished: boolean;
};

/**
 * Pull every complete part out of `buffer`.
 *
 * When `flush` is set (the stream ended without a terminating delimiter) a
 * trailing partial part is emitted anyway, so the final event of a dropped
 * connection is not silently lost.
 */
function scanParts(
  buffer: Bytes,
  delimiter: Bytes,
  decoder: TextDecoder,
  flush: boolean,
): ScanResult {
  const parts: MultipartPart[] = [];
  let finished = false;

  for (;;) {
    const start = indexOf(buffer, delimiter, 0);
    if (start === -1) {
      // No part boundary at all: nothing complete to emit. Keep the tail,
      // since a delimiter could straddle this chunk boundary.
      if (buffer.length > delimiter.length * 2) {
        buffer = buffer.subarray(buffer.length - delimiter.length);
      }
      break;
    }

    // `--boundary--` is the terminating delimiter.
    if (startsWith(buffer, encode("--"), start + delimiter.length)) {
      finished = true;
      break;
    }

    let bodyStart = start + delimiter.length;
    if (startsWith(buffer, CRLF, bodyStart)) {
      bodyStart += 2;
    } else if (buffer[bodyStart] === 0x0a) {
      bodyStart += 1;
    }

    const separator = indexOf(buffer, DOUBLE_CRLF, bodyStart);
    if (separator === -1) {
      break;
    }

    const headers = parseHeaders(
      decoder.decode(buffer.subarray(bodyStart, separator)),
    );
    const contentStart = separator + 4;

    // ISAPI declares a Content-Length per part. Preferring it matters: on a
    // long-lived stream a part is otherwise only released once the *next*
    // part's delimiter arrives, which would leave the most recent event
    // invisible until somebody else triggered one.
    const declared = Number(headers["content-length"]);
    const lengthIsUsable =
      Number.isFinite(declared) &&
      declared > 0 &&
      contentStart + declared <= buffer.length;

    // A Content-Length only counts if it lands exactly on the next delimiter.
    // Some firmware misreports it, and trusting a bad value silently swallows
    // the following part, so verify before committing.
    let bodyEnd = 0;
    let resumeAt = 0;
    let trustLength = false;
    if (lengthIsUsable) {
      const candidate = contentStart + declared;
      let probe = candidate;
      if (buffer[probe] === 0x0d) {
        probe += 1;
      }
      if (buffer[probe] === 0x0a) {
        probe += 1;
      }
      if (startsWith(buffer, delimiter, probe)) {
        trustLength = true;
        // Content-Length covers the payload only; the CRLF ahead of the next
        // delimiter is framing and must not be stripped.
        bodyEnd = candidate;
        resumeAt = candidate;
      }
    }

    if (!trustLength) {
      const next = indexOf(buffer, delimiter, contentStart);
      if (next === -1) {
        if (!flush) {
          break;
        }
        // Flushing because the stream went idle or ended without a
        // terminating delimiter. Require the payload to look complete first —
        // an XML alert always ends with a closing tag — so a slow link that
        // has only delivered half a part is left buffered rather than emitted
        // truncated and silently dropped downstream. Trailing keep-alive
        // whitespace is ignored.
        const pending = stripTrailingCrLf(buffer.subarray(contentStart));
        let last = pending.length - 1;
        while (last >= 0 && isWhitespace(pending[last] as number)) {
          last -= 1;
        }
        if (last < 0 || pending[last] !== GREATER_THAN) {
          break;
        }
        bodyEnd = buffer.length;
        resumeAt = buffer.length;
      } else {
        bodyEnd = buffer[next - 2] === 0x0a ? next - 1 : next;
        resumeAt = next;
      }
    }

    const raw = buffer.subarray(contentStart, bodyEnd);
    const body = trustLength
      ? decoder.decode(raw)
      : decoder.decode(stripTrailingCrLf(raw));

    buffer = buffer.subarray(resumeAt);
    if (body.trim().length > 0) {
      parts.push({ headers, body });
    }
  }

  return { parts, rest: buffer, finished };
}

const IDLE_FLUSH_MS = 400;

export async function* parseMultipart(
  stream: ReadableStream<Uint8Array>,
  boundary: string,
): AsyncGenerator<MultipartPart> {
  const delimiter = encode(`--${boundary}`);
  const decoder = new TextDecoder("utf-8");
  const reader = stream.getReader();

  let buffer: Bytes = new Uint8Array(0);
  let finished = false;
  let ended = false;
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  const drain = (flush: boolean) => {
    const result = scanParts(buffer, delimiter, decoder, flush);
    buffer = result.rest;
    finished = result.finished;
    return result.parts;
  };

  try {
    while (!finished) {
      for (const part of drain(false)) {
        yield part;
      }
      if (finished || ended) {
        break;
      }

      // `for await` gives no hook to time out a wait, and on a long-lived
      // stream a part that arrives without a Content-Length would otherwise
      // stay buffered until some *later* event happened to push it out.
      //
      // Exactly one read may be in flight: abandoning a pending read and
      // issuing another would leave the first one to silently swallow a chunk
      // whose result nobody awaits.
      pending ??= reader.read();

      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), IDLE_FLUSH_MS);
      });

      let chunk: ReadableStreamReadResult<Uint8Array> | null;
      try {
        chunk = await Promise.race([pending, idle]);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
      if (chunk !== null) {
        pending = null;
      }

      if (chunk === null) {
        for (const part of drain(true)) {
          yield part;
        }
        continue;
      }
      if (chunk.done) {
        ended = true;
        break;
      }
      buffer = concat(buffer, chunk.value);
    }

    if (!finished) {
      for (const part of drain(true)) {
        yield part;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream was already released by the consumer's cancel path.
    }
  }
}
