
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

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

const rl = createInterface({ input: stdin, output: stdout });

function ask(question) {
  return rl.question(question);
}

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

// Find processes listening on the requested TCP port.
function findListeningPids(port) {
  try {
    let output = "";

    if (isWindows) {
      const command =
        `Get-NetTCPConnection -LocalPort ${port} -State Listen ` +
        "-ErrorAction SilentlyContinue | " +
        "Select-Object -ExpandProperty OwningProcess -Unique";

      output = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", command],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } else {
      try {
        output = execFileSync(
          "lsof",
          ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
      } catch {
        output = execFileSync(
          "fuser",
          ["-n", "tcp", String(port)],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
      }
    }

    return [
      ...new Set(
        output
          .split(/\s+/)
          .map((value) => Number(value.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      ),
    ];
  } catch {
    return [];
  }
}

// Get a readable process name for the confirmation prompt.
function getProcessName(pid) {
  try {
    if (isWindows) {
      const output = execFileSync(
        "tasklist.exe",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );

      return output.match(/^"([^"]+)"/)?.[1] ?? "Unknown process";
    }

    return (
      execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || "Unknown process"
    );
  } catch {
    return "Unknown process";
  }
}

function killProcess(pid) {
  const result = isWindows
    ? spawnSync(
        "taskkill.exe",
        ["/PID", String(pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true },
      )
    : spawnSync("kill", ["-TERM", String(pid)], { stdio: "ignore" });

  return !result.error && result.status === 0;
}

function validatePort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

// Resolve port conflicts interactively instead of crashing on EADDRINUSE.
async function resolvePort(name, initialPort, getOtherPort) {
  let port = initialPort;

  while (true) {
    if (port === getOtherPort()) {
      console.log(
        `[start] ${name} port ${port} is already assigned to the other service.`,
      );
    } else if (await isPortAvailable(port)) {
      console.log(`[start] ${name} port ${port} is available.`);
      return port;
    } else {
      console.log(`\n[start] ${name} port ${port} is already in use.`);

      const pids = findListeningPids(port);

      if (pids.length > 0) {
        console.log("[start] Listening process(es):");

        for (const pid of pids) {
          console.log(`  PID ${pid}: ${getProcessName(pid)}`);
        }
      } else {
        console.log(
          "[start] Could not identify the process automatically.",
        );
      }

      console.log("\nChoose an option:");
      if (pids.length > 0) {
        console.log("  K - Terminate the listed process(es)");
      }
      console.log("  P - Use a different port");
      console.log("  Q - Quit");

      const choice = (
        await ask("Your choice: ")
      ).trim().toLowerCase();

      if (choice === "k" && pids.length > 0) {
        let failed = false;

        for (const pid of pids) {
          if (pid === process.pid) {
            console.log(
              "[start] Refusing to terminate the current launcher process.",
            );
            failed = true;
            continue;
          }

          console.log(`[start] Terminating PID ${pid}...`);

          if (!killProcess(pid)) {
            console.error(
              `[start] Could not terminate PID ${pid}. Check your permissions.`,
            );
            failed = true;
          }
        }

        // Give the operating system time to release the port.
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 700));

        if (failed) {
          console.log(
            "[start] Some processes could not be terminated. Try another port.",
          );
        }

        continue;
      }

      if (choice === "p") {
        const answer = await ask(
          `Enter a new ${name} port (1-65535): `,
        );

        const newPort = validatePort(answer.trim());

        if (!newPort) {
          console.log("[start] Invalid port number. Try again.");
          continue;
        }

        if (newPort === getOtherPort()) {
          console.log(
            "[start] API and web app must use different ports. Try again.",
          );
          continue;
        }

        port = newPort;
        continue;
      }

      if (choice === "q") {
        throw new Error("Startup cancelled by user.");
      }

      console.log("[start] Invalid choice. Try again.");
      continue;
    }
  }
}

let apiPort;
let webPort;

try {
  apiPort = readPort("API_PORT", "8080");
  webPort = readPort("WEB_PORT", "5173");

  if (apiPort === webPort) {
    throw new Error("API_PORT and WEB_PORT must be different.");
  }

  apiPort = await resolvePort("API", apiPort, () => webPort);
  webPort = await resolvePort("Web app", webPort, () => apiPort);
} catch (error) {
  console.error("[start]", error.message);
  rl.close();
  process.exit(1);
}

rl.close();

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
