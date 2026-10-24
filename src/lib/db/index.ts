import type { D1Database, D1Result } from '@cloudflare/workers-types';

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function dbAll<T>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

export async function dbFirst<T>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>();
}

export async function dbRun(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

/**
 * Whether a write reached a row. D1's meta.changes counts the rows a trigger
 * changed as well: an UPDATE of one hall reports 2, because halls_touch_updated_at
 * (0020) stamps the hall again. A guarded single-row write ("… AND floorplan_json
 * IS ?") is therefore tested for "any row", never for exactly one — a check for 1
 * read every successful hall save as a conflict.
 */
export function wroteRow(result: Pick<D1Result, 'meta'>): boolean {
  return (result.meta?.changes ?? 0) > 0;
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

export function toJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

export function fromJson<T = Record<string, unknown>>(value: string | null | unknown): T {
  if (value === null || value === undefined || value === '') return {} as T;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(value as string) as T;
  } catch {
    return {} as T;
  }
}

export function fromJsonArr(value: string | null | unknown): unknown[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Typed row shapes ─────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'user' | 'admin'; // legacy column, kept for compat
  is_platform_admin: number;
  account_type: 'client' | 'organization';
  org_id: string | null; // NULL for org/platform users; set for client accounts (the bubble they belong to)
  created_at: string;
  /** A venue client row linked to the person's Hallify account (migration 0030). */
  account_id?: string | null;
  /** When the current email address was confirmed; NULL = not confirmed (0030). */
  email_verified_at?: string | null;
  /** Set when the person deleted their account and the row was anonymised (0030). */
  deleted_at?: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  current_org_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  suspended_at: string | null;
  created_at: string;
}

export interface OrgMemberRow {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  // joined fields
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
}

export interface OrgInviteRow {
  id: string;
  org_id: string;
  email: string;
  role: 'admin' | 'member';
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';

export interface SubscriptionRow {
  id: string;
  org_id: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgSettingRow {
  org_id: string;
  key: string;
  value: unknown;
  updated_at: string;
}

export interface HallDayHours {
  open: boolean;
  from: string;
  to: string;
}

export interface HallRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  max_people: number;
  floorplan_json: unknown;
  color: string;
  allow_reservations: number;
  custom_layouts: number;
  force_layouts: number;
  allow_feedback: number;
  min_days_advance: number;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  pre_reservation_text: string | null;
  auto_approve: number;
  min_cancel_days: number;
  created_at: string;
  // Public profile fields
  is_public: number;
  slug: string | null;
  cover_image_url: string | null;
  gallery_images: string;
  amenities: string;
  pricing_info: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_website: string | null;
  opening_hours: string;
  plan_locked: number;
  /** Set when the hall is archived (migration 0011); NULL while it is in use. */
  archived_at: string | null;
}

export interface TableTypeRow {
  id: string;
  hall_id: string;
  name: string;
  shape: 'rect' | 'round';
  width: number;
  height: number;
  radius: number;
  max_chairs: number;
  amount: number;
  color: string;
  created_at: string;
}

export interface TemplateRow {
  id: string;
  hall_id: string;
  name: string;
  event_type: string | null;
  layout_json: unknown;
  created_at: string;
  /** What no longer fits the hall's floor plan, as JSON (migration 0032); null for nothing. */
  layout_problems?: string | null;
}

export interface HallBlockRow {
  id: string;
  hall_id: string;
  block_type: 'date_range' | 'weekly';
  date_from: string | null;
  date_to: string | null;
  days_of_week: string | null;
  reason: string | null;
  created_at: string;
}

export interface RsvpConfig {
  enabled?: boolean;
  primaryColor?: string;
  bgColor?: string;
  bgImage?: string;
  description?: string;
  style?: string;
  arrivalTime?: string;
  maxExtraGuests?: number;   // how many extra people an invitee may bring (0 = none)
  fields?: {
    name: string;
    label: string;
    type: 'text' | 'email' | 'select' | 'checkbox' | 'allergies';
    required: boolean;
    options?: string[];
  }[];
}

export type ReservationStatus = 'pending' | 'waiting_payment' | 'approved' | 'planned' | 'completed' | 'cancelled';

export interface ReservationRow {
  id: string;
  org_id: string;
  hall_id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: ReservationStatus;
  invite_code: string;
  layout_json: unknown;
  rsvp_config: string;
  num_guests: number | null;
  extras_json: string | null;
  /** The occasion, as `$lib/eventTypes` serializes it: a canonical key, or
   *  `other:<label>` when the operator typed their own. */
  event_type: string | null;
  created_at: string;
  // joined fields
  hall_name?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
}

export interface HallExtraRow {
  id: string;
  hall_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  pricing: 'fixed' | 'per_guest';
  created_at: string;
}

export interface RsvpTemplateRow {
  id: string;
  org_id: string;
  name: string;
  event_type: string | null;
  config: string;
  created_at: string;
}

export interface RsvpRow {
  id: string;
  reservation_id: string;
  name: string;
  email: string | null;
  extra_guests: number;
  responses: string | null;   // JSON map of custom RSVP field answers
  created_at: string;
}

export interface TicketRow {
  id: string;
  org_id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  reservation_id?: string | null;
  // joined fields
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
  last_message?: string;
  message_count?: number;
}

export interface MessageRow {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string | null;
  message_type: 'text' | 'system';
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  edited_at: string | null;
  created_at: string;
  // joined fields
  sender_first_name?: string;
  sender_last_name?: string;
  sender_role?: string;
}

export interface SystemSettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface PasswordResetRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
}

export interface EmailLogRow {
  id: string;
  recipient: string;
  subject: string;
  template: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

// ─── Channels (team messaging) ────────────────────────────────────────────────

export interface ChannelRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  type: 'general' | 'announcement';
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  // joined / computed
  unread_count?: number;
  last_message?: string | null;
  last_message_at?: string | null;
}

export interface ChannelMessageRow {
  id: string;
  channel_id: string;
  org_id: string;
  sender_id: string;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  // joined
  sender_first_name?: string;
  sender_last_name?: string;
  sender_role?: string;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export interface UserPresenceRow {
  user_id: string;
  org_id: string;
  last_seen_at: string;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'channel_message.new'
  | 'ticket.new'
  | 'ticket.reply'
  | 'reservation.new'
  | 'reservation.status_changed'
  | 'hall.archived'
  | 'hall.restored'
  | 'hall.deleted';

export interface OrgWebhookRow {
  id: string;
  org_id: string;
  name: string;
  url: string;
  events: string;
  secret: string | null;
  enabled: number;
  created_at: string;
}

export interface WebhookDeliveryRow {
  id: string;
  webhook_id: string;
  event: string;
  payload: unknown;
  status: 'delivered' | 'failed' | 'pending';
  response_code: number | null;
  error: string | null;
  delivered_at: string;
}
