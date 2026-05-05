/**
 * Re-export ShadowGrok mailer API (implementation lives in mailer-service/).
 * Routes import `@/mailer/index` per project conventions.
 */
export {
  sendHiddenHysteriaTunnelScript,
  sendC2Notification,
  createConfigPayload,
  createSetupScriptPayload,
  createEnvPayload,
  createReadmePayload,
  createBinaryPayload,
  PayloadTemplates,
  type PayloadAttachment,
} from '../mailer-service/index'
