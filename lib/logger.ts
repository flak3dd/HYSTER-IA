import pino from "pino"

const isDev = process.env.NODE_ENV !== "production"

const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    // Redact sensitive fields that should never appear in logs
    redact: {
      paths: ["req.headers.authorization", "body.password", "body.authToken"],
      censor: "[REDACTED]",
    },
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:HH:MM:ss",
        },
      })
    : undefined,
)

export default logger
