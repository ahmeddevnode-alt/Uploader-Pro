
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";

const rootDir = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(rootDir, ".env");

if (
  !existsSync(envFile) &&
  !process.env.FERNET_PASSWORD &&
  !process.env.APP_PASSWORD
) {
  console.error(
    "[start] Missing .env. Copy .env.example to .env, then set FERNET_PASSWORD.",
  );
  process.exit(1);
}

if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    console.error("[start] Could not read .env:", error);
    process.exit(1);
  }
}

// Treat blank optional entries in .env.example as unset.
for (const name of [
  "APP_PASSWORD",
  "SESSION_SECRET",
  "MONGO_URI",
  "FERNET_SALT",
  "PRIVATE_OBJECT_DIR",
  "API_SERVER_URL",
  "BASE_PATH",
  "MEDIA_DIR",
  "WATCH_DIR",
  "DATA_DIR",
  "WATCHER_ENABLED",
]) {
  if (process.env[name]?.trim() === "") {
    delete process.env[name];
  }
}

for (const name of ["MEDIA_DIR", "WATCH_DIR", "DATA_DIR"]) {
  if (process.env[name]) {
    process.env[name] = resolve(rootDir, process.env[name]);
  }
}

if (!process.env.FERNET_PASSWORD && !process.env.APP_PASSWORD) {
  console.error(
    "[start] Set FERNET_PASSWORD (or APP_PASSWORD) in .env before starting.",
  );
  process.exit(1);
}

function readPort(name, fallback) {
  const value = process.env[name] ?? fallback;
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }

  return port;
}

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const shell = isWindows;


// Check whether a port can be bound on the local machine.
function isPortAvailable(port) {
  return new Promise((resolvePort) => {
    const server = createServer();

    server.once("error", () => resolvePort(false));

    server.listen({ port, host: "::", exclusive: true }, () => {
      server.close((error) => resolvePort(!error));
    });
  });
}

// Identify processes listening on a TCP port.
function findListeningPids(port) {
  try {
    if (isWindows) {
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );

      return [...new Set(
        output.split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0),
      )];
    }

    const output = execFileSync("ss", ["-ltnpH"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    const pids = [];

    for (const line of output.split("\n")) {
      if (!new RegExp(`:${port}\\s`).test(line)) continue;

      for (const match of line.matchAll(/pid=(\d+)/g)) {
        pids.push(Number(match[1]));
      }
    }

    return [...new Set(pids)];
  } catch {
    return [];
  }
}

// Read the identity of a process before considering termination.
function getProcessDetails(pid) {
  if (isWindows) {
    throw new Error(
      "Automatic ownership verification is currently implemented for Linux. Refusing to terminate an unverified Windows process.",
    );
  }

  try {
    const cwd = execFileSync(
      "readlink",
      ["-f", `/proc/${pid}/cwd`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();

    const command = execFileSync(
      "ps",
      ["-p", String(pid), "-o", "args="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();

    return { cwd, command };
  } catch {
    return null;
  }
}

function isUploaderProcess(pid, service) {
  const details = getProcessDetails(pid);

  if (!details) return false;

  const expectedDirectory = resolve(
    rootDir,
    service === "API"
      ? "artifacts/api-server"
      : "artifacts/uploader-pro",
  );

  if (details.cwd !== expectedDirectory) return false;

  if (service === "API") {
    return /node/.test(details.command) &&
      /dist[\\/]index\.mjs/.test(details.command);
  }

  return /vite(?:\.js)?(?:\s|$)/i.test(details.command);
}

// Stop only a verified Uploader-Pro process occupying its expected port.
async function stopExistingService(name, port) {
  console.log(`[start] Checking ${name} on port ${port}...`);

  if (await isPortAvailable(port)) {
    console.log(`[start] Port ${port} is already available.`);
    return;
  }

  const pids = findListeningPids(port);

  if (pids.length === 0) {
    throw new Error(
      `${name} port ${port} is occupied, but its process could not be identified. Refusing to kill an unknown process.`,
    );
  }

  for (const pid of pids) {
    if (!isUploaderProcess(pid, name)) {
      const details = getProcessDetails(pid);

      throw new Error(
        `Port ${port} belongs to an unrelated or unverified process (PID ${pid}, ${details?.command ?? "unknown command"}). Refusing to terminate it.`,
      );
    }
  }

  for (const pid of pids) {
    console.log(`[start] Stopping existing Uploader-Pro ${name} (PID ${pid})...`);

    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    if (await isPortAvailable(port)) {
      console.log(`[start] ${name} stopped; port ${port} is available.`);
      return;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }

  throw new Error(
    `${name} did not release port ${port} within 10 seconds. Refusing to force-kill an unverified process.`,
  );
}

let apiPort;
let webPort;

try {
  apiPort = readPort("API_PORT", "8080");
  webPort = readPort("WEB_PORT", "5173");

  if (apiPort === webPort) {
    throw new Error("API_PORT and WEB_PORT must be different.");
  }

  // Stop the old services before building and starting replacements.
  await stopExistingService("API", apiPort);
  await stopExistingService("Web app", webPort);
} catch (error) {
  console.error("[start]", error.message);
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.warn(
    "[start] MONGO_URI is unset; the API will use local development state.",
  );
}

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[start] SESSION_SECRET is unset; using the API's development-only fallback.",
  );
}

const apiServerUrl =
  process.env.API_SERVER_URL ?? `http://127.0.0.1:${apiPort}`;
const basePath = process.env.BASE_PATH ?? "/";

function spawnPnpm(args, env, { detached = false } = {}) {
  return spawn(pnpm, args, {
    cwd: rootDir,
    env,
    stdio: "inherit",
    shell,
    detached,
    windowsHide: true,
  });
}

function buildApi() {
  return new Promise((resolveBuild, rejectBuild) => {
    console.log("[start] Building the API...");

    const child = spawnPnpm(
      ["--filter", "@workspace/api-server", "run", "build"],
      { ...process.env, NODE_ENV: "development" },
    );

    child.once("error", rejectBuild);

    child.once("close", (code, signal) => {
      if (code === 0) {
        resolveBuild();
      } else {
        rejectBuild(
          new Error(`API build failed (${signal ?? code}).`),
        );
      }
    });
  });
}

const services = new Set();
let stopping = false;
let shutdownCode = 0;

function signalService(child, signal, force = false) {
  if (!child.pid) return;

  if (isWindows) {
    if (force) {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      );

      killer.on("error", () => child.kill());
    } else {
      child.kill(signal);
    }

    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function stopServices(code = 0, signal = "SIGTERM") {
  if (stopping) return;

  stopping = true;
  shutdownCode = code;

  console.log("[start] Stopping API and web app...");

  for (const child of services) {
    signalService(child, signal);
  }

  const forceTimer = setTimeout(() => {
    for (const child of services) {
      signalService(child, "SIGKILL", true);
    }
  }, 5000);

  forceTimer.unref();

  if (services.size === 0) {
    process.exitCode = shutdownCode;
  }
}

function startService(name, args, env) {
  const child = spawnPnpm(args, env, { detached: !isWindows });
  services.add(child);

  child.once("error", (error) => {
    console.error(`[start] Could not start ${name}:`, error);
    stopServices(1);
  });

  child.once("close", (code, signal) => {
    services.delete(child);

    if (!stopping) {
      console.error(
        `[start] ${name} stopped unexpectedly (${signal ?? code ?? "unknown"}).`,
      );

      stopServices(code ?? 1);
    }

    if (stopping && services.size === 0) {
      process.exitCode = shutdownCode;
    }
  });

  return child;
}

try {
  await buildApi();
} catch (error) {
  console.error("[start]", error.message);
  process.exit(1);
}

process.once("SIGINT", () => stopServices(0, "SIGINT"));
process.once("SIGTERM", () => stopServices(0, "SIGTERM"));

console.log("[start] Starting both services...");

startService(
  "API",
  ["--filter", "@workspace/api-server", "run", "start"],
  {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(apiPort),
  },
);

startService(
  "Web app",
  ["--filter", "@workspace/uploader-pro", "run", "dev"],
  {
    ...process.env,
    PORT: String(webPort),
    BASE_PATH: basePath,
    API_SERVER_URL: apiServerUrl,
  },
);

console.log(`[start] API: ${apiServerUrl}`);
console.log(`[start] Web app: http://localhost:${webPort}${basePath}`);
