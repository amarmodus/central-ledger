const RC = require('rc')('CLEDG', require('../../config/default.json'))

module.exports = {
  HOSTNAME: RC.HOSTNAME.replace(/\/$/, ''),
  PORT: RC.PORT,
  // ADMIN_PORT: RC.ADMIN_PORT,
  DATABASE_URI: RC.DATABASE_URI,
  DB_CONNECTION_POOL_MIN: RC.DB_CONNECTION.POOL_MIN,
  DB_CONNECTION_POOL_MAX: RC.DB_CONNECTION.POOL_MAX,
  MONGODB_URI: RC.MONGODB.URI,
  MONGODB_DISABLED: RC.MONGODB.DISABLED,
  AMOUNT: RC.AMOUNT,
  EXPIRES_TIMEOUT: RC.EXPIRES_TIMEOUT,
  SIDECAR: RC.SIDECAR,
  SIDECAR_DISABLED: RC.SIDECAR.DISABLED,
  ERROR_HANDLING: RC.ERROR_HANDLING,
  HANDLERS: RC.HANDLERS,
  HANDLERS_DISABLED: RC.HANDLERS.DISABLED,
  HANDLERS_API: RC.HANDLERS.API,
  HANDLERS_API_DISABLED: RC.HANDLERS.API.DISABLED,
  HANDLERS_CRON: RC.HANDLERS.CRON,
  HANDLERS_CRON_DISABLED: RC.HANDLERS.CRON.DISABLED,
  HANDLERS_CRON_TIMEXP: RC.HANDLERS.CRON.TIMEXP,
  HANDLERS_CRON_TIMEZONE: RC.HANDLERS.CRON.TIMEZONE,
  HANDLERS_TIMEOUT: RC.HANDLERS.TIMEOUT,
  HANDLERS_TIMEOUT_DISABLED: RC.HANDLERS.TIMEOUT.DISABLED,
  HANDLERS_TIMEOUT_TIMEXP: RC.HANDLERS.TIMEOUT.TIMEXP,
  HANDLERS_TIMEOUT_TIMEZONE: RC.HANDLERS.TIMEOUT.TIMEZONE,
  KAFKA_CONFIG: RC.KAFKA,
  PARTICIPANT_INITIAL_POSITION: RC.PARTICIPANT_INITIAL_POSITION,
  RUN_MIGRATIONS: !RC.MIGRATIONS.DISABLED,
  RUN_DATA_MIGRATIONS: RC.MIGRATIONS.RUN_DATA_MIGRATIONS,
  INTERNAL_TRANSFER_VALIDITY_SECONDS: RC.INTERNAL_TRANSFER_VALIDITY_SECONDS,
  HUB_ID: RC.HUB_PARTICIPANT.ID,
  HUB_NAME: RC.HUB_PARTICIPANT.NAME,
  HUB_ACCOUNTS: RC.HUB_PARTICIPANT.ACCOUNTS,
  INSTRUMENTATION_METRICS_DISABLED: RC.INSTRUMENTATION.METRICS.DISABLED,
  INSTRUMENTATION_METRICS_LABELS: RC.INSTRUMENTATION.METRICS.labels,
  INSTRUMENTATION_METRICS_CONFIG: RC.INSTRUMENTATION.METRICS.config
}
