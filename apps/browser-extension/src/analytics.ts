import { type ExtensionSession, readSession, saveSession } from "./extension-storage";

export type SignInMethod = "web" | "email";
export type SignInFailureCode = (typeof SIGN_IN_FAILURE_CODES)[number];
type Result = "succeeded" | "failed";
type ResultOrCancelled = Result | "cancelled";

export const SIGN_IN_FAILURE_CODES = [
  "invalid_sign_in_code",
  "invalid_company_sign_in_code",
  "company_sign_in_required",
  "auth_api_unavailable",
  "unknown",
] as const;

interface ExtensionEvents {
  extension_installed: { reason: "install" | "update"; from_version?: string };
  extension_opened: { signed_in: boolean };
  account_sign_in_completed: { method: SignInMethod; result: ResultOrCancelled; failure_code?: SignInFailureCode };
  account_sign_out: { reason: "user" | "session_ended" };
  message_send: { target: "chat" | "thread" | "new_thread" | "channel"; result: Result };
  voice_transcription: { result: Result; audio_duration_seconds: number; empty?: boolean };
  agent_action: { action: "create"; result: Result };
  channel_action: { action: "created"; result: Result };
  folder_action: { action: "created"; result: Result };
  agent_input_action: { kind: "prompt"; decision: "answered"; result: Result };
  x_reply_action: { action: string; attempts?: number; reached?: boolean };
  browser_sharing_action: { action: "site_removed" };
  browser_sharing_ask: { kind: string; choice: string };
  analytics_preference_changed: { enabled: false };
}

type EventName = keyof ExtensionEvents;

export async function analyticsLinked(_session: ExtensionSession | null): Promise<boolean> {
  return false;
}

export async function track<Name extends EventName>(_name: Name, _properties: ExtensionEvents[Name]): Promise<void> {}

export function withResult<T>(work: Promise<T>, _record: (result: Result) => unknown): Promise<T> {
  return work;
}

export async function identify(_session: ExtensionSession): Promise<void> {}

export async function setAnalyticsLinked(enabled: boolean): Promise<void> {
  const session = await readSession();
  if (!session) return;
  const updated = { ...session, user: { ...session.user, analyticsEnabled: enabled } };
  await saveSession(updated);
}
