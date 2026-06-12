import postgres from 'postgres';
import { DATABASE_URL } from '$env/static/private';

// Singleton connection pool
const sql = postgres(DATABASE_URL, { max: 10 });

export default sql;

// ─── Typed row shapes ─────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'user' | 'admin'; // legacy column, kept for compat
  is_platform_admin: boolean;
  account_type: 'client' | 'organization';
  created_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  current_org_id: string | null;
  expires_at: Date;
  created_at: Date;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  suspended_at: Date | null;
  created_at: Date;
}

export interface OrgMemberRow {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: Date;
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
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';

export interface SubscriptionRow {
  id: string;
  org_id: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrgSettingRow {
  org_id: string;
  key: string;
  value: unknown;
  updated_at: Date;
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
  allow_reservations: boolean;
  custom_layouts: boolean;
  force_layouts: boolean;
  allow_feedback: boolean;
  min_days_advance: number;
  address: string | null;
  pre_reservation_text: string | null;
  auto_approve: boolean;
  min_cancel_days: number;
  created_at: Date;
  // Public profile fields
  is_public: boolean;
  slug: string | null;
  cover_image_url: string | null;
  gallery_images: string[];
  amenities: string[];
  pricing_info: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_website: string | null;
  opening_hours: Record<string, HallDayHours>;
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
  created_at: Date;
}

export interface TemplateRow {
  id: string;
  hall_id: string;
  name: string;
  event_type: string | null;
  layout_json: unknown;
  created_at: Date;
}

export interface HallBlockRow {
  id: string;
  hall_id: string;
  block_type: 'date_range' | 'weekly';
  date_from: Date | null;
  date_to: Date | null;
  days_of_week: number[] | null;
  reason: string | null;
  created_at: Date;
}

export interface RsvpConfig {
  enabled?: boolean;
  primaryColor?: string;
  bgColor?: string;
  bgImage?: string;
  description?: string;
  style?: string;
  arrivalTime?: string;
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
  event_date: Date;
  start_time: string | null;
  end_time: string | null;
  status: ReservationStatus;
  invite_code: string;
  layout_json: unknown;
  rsvp_config: RsvpConfig;
  created_at: Date;
  // joined fields
  hall_name?: string;
  user_first_name?: string;
  user_last_name?: string;
  user_email?: string;
}

export interface RsvpTemplateRow {
  id: string;
  org_id: string;
  name: string;
  event_type: string | null;
  config: RsvpConfig;
  created_at: Date;
}

export interface RsvpRow {
  id: string;
  reservation_id: string;
  name: string;
  email: string | null;
  created_at: Date;
}

export interface TicketRow {
  id: string;
  org_id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: Date;
  updated_at: Date;
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
  body: string;
  message_type: 'text' | 'system';
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  edited_at: Date | null;
  created_at: Date;
  // joined fields
  sender_first_name?: string;
  sender_last_name?: string;
  sender_role?: string;
}

export interface SystemSettingRow {
  key: string;
  value: unknown;
  updated_at: Date;
}

export interface PasswordResetRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used: boolean;
  created_at: Date;
}

export interface EmailLogRow {
  id: string;
  recipient: string;
  subject: string;
  template: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: Date;
}

// ─── Channels (team messaging) ────────────────────────────────────────────────

export interface ChannelRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  type: 'general' | 'announcement';
  created_by: string | null;
  archived_at: Date | null;
  created_at: Date;
  // joined / computed
  unread_count?: number;
  last_message?: string | null;
  last_message_at?: Date | null;
}

export interface ChannelMessageRow {
  id: string;
  channel_id: string;
  org_id: string;
  sender_id: string;
  body: string;
  edited_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  // joined
  sender_first_name?: string;
  sender_last_name?: string;
  sender_role?: string;
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export interface UserPresenceRow {
  user_id: string;
  org_id: string;
  last_seen_at: Date;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'channel_message.new'
  | 'ticket.new'
  | 'ticket.reply'
  | 'reservation.new'
  | 'reservation.status_changed';

export interface OrgWebhookRow {
  id: string;
  org_id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret: string | null;
  enabled: boolean;
  created_at: Date;
}

export interface WebhookDeliveryRow {
  id: string;
  webhook_id: string;
  event: string;
  payload: unknown;
  status: 'delivered' | 'failed' | 'pending';
  response_code: number | null;
  error: string | null;
  delivered_at: Date;
}
