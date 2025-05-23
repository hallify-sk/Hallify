import {
	integer,
	pgTable,
	varchar,
	text,
	timestamp,
	boolean,
	serial,
	json,
	date
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
	name: varchar('name', { length: 255 }).notNull(),
	color: varchar('color', { length: 255 }).notNull(),
	allow_reservations: boolean('allow_reservations').default(false).notNull(),
	custom_layouts: boolean('custom_layouts').default(false).notNull(),
	force_layouts: boolean('force_layouts').default(false).notNull(),
	allow_feedback: boolean('allow_feedback').default(false).notNull(),
	plan: integer('plan'),
	created_at: timestamp('created_at').defaultNow().notNull(),
	updated_at: timestamp('updated_at').defaultNow().notNull()
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
