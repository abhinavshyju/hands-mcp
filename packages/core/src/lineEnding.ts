export interface LineInfo {
  ending: "\n" | "\r\n" | "\r";
  trailingNewline: boolean;
}

export function detectLineInfo(text: string): LineInfo {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  let ending: LineInfo["ending"] = "\n";
  if (crlf >= lf && crlf >= cr && crlf > 0) ending = "\r\n";
  else if (cr > lf && cr > crlf) ending = "\r";
  return { ending, trailingNewline: /(?:\r\n|\n|\r)$/.test(text) };
}

export function applyLineInfo(text: string, info: LineInfo): string {
  let body = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (info.ending !== "\n") body = body.replace(/\n/g, info.ending);
  const hasTrail = /(?:\r\n|\n|\r)$/.test(body);
  if (info.trailingNewline && !hasTrail) body += info.ending;
  if (!info.trailingNewline && hasTrail) {
    body = body.replace(/(?:\r\n|\n|\r)+$/, "");
  }
  return body;
}
