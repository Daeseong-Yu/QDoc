import { NextResponse, type NextRequest } from "next/server";

const forwardedRequestHeaders = new Set(["accept", "accept-language", "content-type", "cookie", "user-agent"]);

function getApiBaseUrl() {
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("API_BASE_URL is required in production");
  }

  return "http://127.0.0.1:4000";
}

function getApiBase() {
  const apiBase = new URL(getApiBaseUrl());

  if (apiBase.protocol !== "http:" && apiBase.protocol !== "https:") {
    throw new Error("API_BASE_URL must use http or https");
  }

  return apiBase;
}

function getTargetUrl(request: NextRequest, path: string[]) {
  const url = new URL(request.url);
  const apiBase = getApiBase();
  const encodedPath = path.map((segment) => {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("Invalid proxy path");
    }

    return encodeURIComponent(segment);
  });
  const basePath = apiBase.pathname.replace(/\/+$/, "");
  const target = new URL(`${basePath}/${encodedPath.join("/")}`, apiBase.origin);
  target.search = url.search;
  return target;
}

function getForwardedHeaders(request: NextRequest) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (forwardedRequestHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  let target: URL;

  try {
    target = getTargetUrl(request, path);
  } catch {
    return NextResponse.json({ error: "invalid_proxy_target" }, { status: 400 });
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers: getForwardedHeaders(request),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  const setCookie = upstream.headers.get("set-cookie");

  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }

  if (setCookie) {
    responseHeaders.set("set-cookie", setCookie);
  }

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
