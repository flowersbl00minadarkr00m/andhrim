"use strict";

const dns = require("node:dns");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");
const { threadId } = require("node:worker_threads");

const metricsDirectory = process.env.AGENT_OR_NOT_EGRESS_METRICS_DIR;
const metricsLabel = process.env.AGENT_OR_NOT_EGRESS_METRICS_LABEL;
if (!metricsDirectory || !path.isAbsolute(metricsDirectory) || !/^(build|start|verify)$/u.test(metricsLabel ?? "")) {
  const error = new Error("PROVIDER_FREE_EGRESS_GUARD_CONFIG_INVALID");
  error.code = "PROVIDER_FREE_EGRESS_GUARD_CONFIG_INVALID";
  throw error;
}

const metricsPath = path.join(metricsDirectory, `${metricsLabel}-${process.pid}-${threadId}.json`);
const metrics = { schemaVersion: "provider-free-egress-v1", label: metricsLabel, pid: process.pid, threadId, attempted: 0, blocked: 0 };
let initialized = false;

function writeMetrics() {
  fs.writeFileSync(metricsPath, `${JSON.stringify(metrics)}\n`, {
    encoding: "utf8",
    flag: initialized ? "w" : "wx",
  });
  initialized = true;
}

function isLoopbackHostname(value) {
  if (typeof value !== "string") return false;
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/gu, "");
  const ipv4 = hostname.match(/^((?:0|[1-9]\d{0,2}))\.((?:0|[1-9]\d{0,2}))\.((?:0|[1-9]\d{0,2}))\.((?:0|[1-9]\d{0,2}))$/u);
  const octets = ipv4?.slice(1).map(Number);
  return hostname === "localhost"
    || hostname === "::1"
    || hostname === "0:0:0:0:0:0:0:1"
    || (octets?.[0] === 127 && octets.every((octet) => octet <= 255));
}

function hostFrom(value, fallback = "localhost") {
  if (value instanceof URL) return value.hostname;
  if (typeof value === "string") {
    try {
      return new URL(value).hostname;
    } catch {
      const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/u);
      if (bracketed) return bracketed[1];
      const colonCount = (value.match(/:/gu) ?? []).length;
      return colonCount === 1 ? value.split(":")[0] : value || fallback;
    }
  }
  if (value && typeof value === "object") return hostFrom(value.hostname || value.host || fallback, fallback);
  return fallback;
}

function blockNonLoopback(value) {
  const host = hostFrom(value);
  if (isLoopbackHostname(host)) return;
  metrics.attempted += 1;
  metrics.blocked += 1;
  writeMetrics();
  const error = new Error(`PROVIDER_FREE_NON_LOOPBACK_EGRESS_BLOCKED:${host}`);
  error.code = "PROVIDER_FREE_NON_LOOPBACK_EGRESS_BLOCKED";
  throw error;
}

function isLocalPipe(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const normalized = value.replace(/\//gu, "\\");
  return !normalized.startsWith("\\\\")
    || normalized.startsWith("\\\\.\\")
    || normalized.startsWith("\\\\localhost\\")
    || normalized.startsWith("\\\\127.0.0.1\\");
}

function guardNetArguments(args) {
  const first = args[0];
  if (typeof first === "string" && first.length > 0 && !(Number(first) >= 0)) {
    if (!isLocalPipe(first)) blockNonLoopback("remote-ipc.invalid");
    return;
  }
  const options = first && typeof first === "object" ? first : { port: first, host: args[1] };
  if (options.path) {
    if (!isLocalPipe(options.path)) blockNonLoopback("remote-ipc.invalid");
    return;
  }
  blockNonLoopback(options.host || options.hostname || "localhost");
}

function guardHttpArguments(args) {
  const first = args[0];
  const firstIsUrl = typeof first === "string" || first instanceof URL;
  const base = firstIsUrl ? { hostname: hostFrom(first) } : (first && typeof first === "object" ? first : {});
  const override = firstIsUrl && args[1] && typeof args[1] === "object" ? args[1] : {};
  const options = { ...base, ...override };
  if (options.socketPath) {
    if (!isLocalPipe(options.socketPath)) blockNonLoopback("remote-ipc.invalid");
    return;
  }
  blockNonLoopback(options.hostname || options.host || "localhost");
}

writeMetrics();

if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = function guardedFetch(input, init) {
    blockNonLoopback(input && typeof input === "object" && typeof input.url === "string" ? input.url : input);
    return originalFetch(input, init);
  };
}

for (const moduleValue of [http, https]) {
  const originalRequest = moduleValue.request;
  moduleValue.request = function guardedRequest(...args) {
    guardHttpArguments(args);
    return originalRequest.apply(this, args);
  };
  moduleValue.get = function guardedGet(...args) {
    const request = moduleValue.request(...args);
    request.end();
    return request;
  };
}

const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedSocketConnect(...args) {
  guardNetArguments(args);
  return originalSocketConnect.apply(this, args);
};
for (const method of ["connect", "createConnection"]) {
  const original = net[method];
  net[method] = function guardedNetConnect(...args) {
    guardNetArguments(args);
    return original.apply(this, args);
  };
}

const originalTlsConnect = tls.connect;
tls.connect = function guardedTlsConnect(...args) {
  guardNetArguments(args);
  return originalTlsConnect.apply(this, args);
};

for (const method of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
  if (typeof dns[method] !== "function") continue;
  const original = dns[method];
  dns[method] = function guardedDns(hostname, ...args) {
    blockNonLoopback(hostname);
    return original.call(this, hostname, ...args);
  };
}
