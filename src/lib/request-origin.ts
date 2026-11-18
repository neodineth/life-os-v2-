type OriginRequest = Pick<Request, "url" | "headers">;

// Next.js can use an internal hostname in request.url. Host identifies the
// address the browser actually requested; untrusted forwarded hosts are ignored.
export function requestOrigin(request: OriginRequest) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (host) url.host = host;
  return url.origin;
}

export function isSameOriginRequest(request: OriginRequest) {
  return request.headers.get("origin") === requestOrigin(request);
}
