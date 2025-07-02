import {
	integer,
	pgTable,
	varchar,
	text,
	timestamp,
	boolean,
	serial,
	json,
	date,
	unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	first_name: varchar('first_name', { length: 255 }).notNull(),
	last_name: varchar('last_name', { length: 255 }).notNull(),
	password_hash: text('password_hash').notNull(),
	permission_id: integer('permission_id').notNull(),
	created_at: timestamp('created_at').defaultNow().notNull(),
	updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const userSessions = pgTable('user_sessions', {
	id: varchar('id', { length: 255 }).primaryKey(),
	expires_at: timestamp('expires_at').notNull(),
	user_id: integer('user_id').notNull(),
	created_at: timestamp('created_at').defaultNow().notNull(),
	updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const permissions = pgTable('permissions', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	allowed_paths: text('allowed_paths'),
	disallowed_paths: text('disallowed_paths'),
	created_at: timestamp('created_at').defaultNow().notNull(),
	updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const halls = pgTable('halls', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique(),
	color: text('color').notNull(),
	capacity: integer('capacity').notNull(),
	plan: integer('plan').references(() => plans.id),
	description: text('description'),
	// Add allowedDays field for permanent blocks
	allowedDays: json('allowed_days')
		.$type<string[]>()
		.default(['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned']),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	allow_reservations: boolean('allow_reservations').default(false).notNull(),
	custom_layouts: boolean('custom_layouts').default(false).notNull(),
	force_layouts: boolean('force_layouts').default(false).notNull(),
	allow_feedback: boolean('allow_feedback').default(false).notNull()
});

export const reservations = pgTable('reservations', {
	id: serial('id').primaryKey(),
	hall_id: integer('hall_id').notNull(),
	user_id: integer('user_id').notNull(),
	date: date('date').notNull(),
	created_at: timestamp('created_at').defaultNow().notNull(),
	updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const plans = pgTable('plans', {
	id: serial('id').primaryKey(),
	data: json('data').notNull(),
	user_id: integer('user_id').notNull(),
	preview: text('preview').notNull(),
	created_at: timestamp('created_at').defaultNow().notNull(),
	updated_at: timestamp('updated_at').defaultNow().notNull()
});

export const eventBlocks = pgTable('event_blocks', {
	id: serial('id').primaryKey(),
	hallId: integer('hall_id')
		.notNull()
		.references(() => halls.id, { onDelete: 'cascade' }),
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	reason: text('reason').notNull(),
	// Store blocked days as JSON array for weekly patterns
	blockedDays: json('blocked_days').$type<string[]>().default([]),
	// Type: 'temporary' for date ranges, 'permanent' for weekly patterns
	type: text('type').notNull().default('temporary'),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const hallLayouts = pgTable('hall_layouts', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	hallId: integer('hall_id').notNull().references(() => halls.id, { onDelete: 'cascade' }),
	layoutData: json('layout_data').notNull(),
	isDefault: boolean('is_default').default(false),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const events = pgTable('events', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	description: text('description').notNull(),
	hallId: integer('hall_id').notNull().references(() => halls.id, { onDelete: 'cascade' }),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	startDate: timestamp('start_date', { withTimezone: true }).notNull(),
	endDate: timestamp('end_date', { withTimezone: true }).notNull(),
	maxParticipants: integer('max_participants'),
	currentParticipants: integer('current_participants').default(0),
	isPublic: boolean('is_public').default(true),
	allowRegistration: boolean('allow_registration').default(true),
	status: varchar('status', { length: 50 }).default('planned'), // 'planned', 'active', 'completed', 'cancelled'
	layoutId: integer('layout_id').references(() => hallLayouts.id, { onDelete: 'set null' }),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// Optional: Add a table for event registrations if you plan to track attendees
export const eventRegistrations = pgTable('event_registrations', {
	id: serial('id').primaryKey(),
	eventId: integer('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	status: varchar('status', { length: 50 }).default('registered'), // 'registered', 'attended', 'cancelled'
	registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow(),
	notes: text('notes')
}, (table) => ({
	// Ensure a user can only register once per event
	uniqueRegistration: unique().on(table.eventId, table.userId)
}));

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
	permission: one(permissions, {
		fields: [users.permission_id],
		references: [permissions.id]
	}),
	sessions: many(userSessions),
	reservations: many(reservations),
	plans: many(plans)
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
	user: one(users, {
		fields: [userSessions.user_id],
		references: [users.id]
	})
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
	users: many(users)
}));

export const hallsRelations = relations(halls, ({ one, many }) => ({
	planData: one(plans, {
		fields: [halls.plan],
		references: [plans.id]
	}),
	reservations: many(reservations)
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
	hall: one(halls, {
		fields: [reservations.hall_id],
		references: [halls.id]
	}),
	user: one(users, {
		fields: [reservations.user_id],
		references: [users.id]
	})
}));

export const plansRelations = relations(plans, ({ one }) => ({
	user: one(users, {
		fields: [plans.user_id],
		references: [users.id]
	}),
	hall: one(halls, {
		fields: [plans.id],
		references: [halls.plan]
	})
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
	hall: one(halls, {
		fields: [events.hallId],
		references: [halls.id]
	}),
	user: one(users, {
		fields: [events.userId],
		references: [users.id]
	}),
	layout: one(hallLayouts, {
		fields: [events.layoutId],
		references: [hallLayouts.id]
	}),
	registrations: many(eventRegistrations)
}));

export const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
	event: one(events, {
		fields: [eventRegistrations.eventId],
		references: [events.id]
	}),
	user: one(users, {
		fields: [eventRegistrations.userId],
		references: [users.id]
	})
}));

// Type exports for use in your application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;

export type Hall = typeof halls.$inferSelect;
export type NewHall = typeof halls.$inferInsert;

export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type EventBlock = typeof eventBlocks.$inferSelect;
export type NewEventBlock = typeof eventBlocks.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type NewEventRegistration = typeof eventRegistrations.$inferInsert;
