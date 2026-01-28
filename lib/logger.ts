type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const entry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...data,
  };
  // Structured log line
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};
