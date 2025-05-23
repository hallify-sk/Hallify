import {
	type CreationOptional,
	type InferAttributes,
	type InferCreationAttributes,
	Model,
	DataTypes,
	type NonAttribute,
	type HasOneGetAssociationMixin,
	type BelongsToGetAssociationMixin,
	type BelongsToSetAssociationMixin
} from '@sequelize/core';
import {
	Attribute,
	AutoIncrement,
	CreatedAt,
	Default,
	HasOne,
	NotNull,
	PrimaryKey,
	Unique,
	UpdatedAt
} from '@sequelize/core/decorators-legacy';

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
	@Attribute(DataTypes.INTEGER)
	@PrimaryKey
	@AutoIncrement
	declare id: CreationOptional<number>;

	@Attribute(DataTypes.STRING)
	@NotNull
	@Unique
	declare email: string;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare first_name: string;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare last_name: string;

	@Attribute(DataTypes.TEXT)
	@NotNull
	declare password_hash: string;

	@Attribute(DataTypes.INTEGER)
	@NotNull
	declare permission_id: number;

	@CreatedAt
	declare created_at: CreationOptional<Date>;

	@UpdatedAt
	declare updated_at: CreationOptional<Date>;
}

export class UserSession extends Model<
	InferAttributes<UserSession>,
	InferCreationAttributes<UserSession>
> {
	@Attribute(DataTypes.STRING)
	@PrimaryKey
	@AutoIncrement
	declare id: CreationOptional<string>;

	@Attribute(DataTypes.DATE)
	@NotNull
	declare expires_at: Date;

	@Attribute(DataTypes.INTEGER)
	@NotNull
	declare user_id: number;

	@CreatedAt
	declare created_at: CreationOptional<Date>;

	@UpdatedAt
	declare updated_at: CreationOptional<Date>;
}

export class Permission extends Model<
	InferAttributes<Permission>,
	InferCreationAttributes<Permission>
> {
	@Attribute(DataTypes.INTEGER)
	@PrimaryKey
	@AutoIncrement
	declare id: CreationOptional<number>;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare name: string;

	@Attribute(DataTypes.TEXT)
	@NotNull
	get allowed_paths(): Array<string> {
		return JSON.parse(this.getDataValue('allowed_paths') as unknown as string);
	}

	@Attribute(DataTypes.TEXT)
	@NotNull
	get disallowed_paths(): Array<string> {
		return JSON.parse(this.getDataValue('disallowed_paths') as unknown as string);
	}

	@CreatedAt
	declare created_at: CreationOptional<Date>;

	@UpdatedAt
	declare updated_at: CreationOptional<Date>;
}

export class Hall extends Model<InferAttributes<Hall>, InferCreationAttributes<Hall>> {
	@Attribute(DataTypes.INTEGER)
	@PrimaryKey
	@AutoIncrement
	declare id: CreationOptional<number>;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare name: string;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare color: CreationOptional<string>;

	@Attribute(DataTypes.BOOLEAN)
	@NotNull
	@Default(false)
	declare allow_reservations: CreationOptional<boolean>;

	@Attribute(DataTypes.BOOLEAN)
	@NotNull
	@Default(false)
	declare custom_layouts: CreationOptional<boolean>;

	@Attribute(DataTypes.BOOLEAN)
	@NotNull
	@Default(false)
	declare force_layouts: CreationOptional<boolean>;

	@Attribute(DataTypes.BOOLEAN)
	@NotNull
	@Default(false)
	declare allow_feedback: CreationOptional<boolean>;

	@CreatedAt
	declare created_at: CreationOptional<Date>;

	@UpdatedAt
	declare updated_at: CreationOptional<Date>;

	@Attribute(DataTypes.INTEGER)
	declare plan?: CreationOptional<number | null>;

	/** Defined by {@link Plan.hall} */
	declare planData: NonAttribute<Plan>;
	declare getPlanData: BelongsToGetAssociationMixin<Plan>;
	declare setPlanData: BelongsToSetAssociationMixin<Plan, Plan["id"]>;
}

export class Reservation extends Model<
	InferAttributes<Reservation>,
	InferCreationAttributes<Reservation>
> {
	@Attribute(DataTypes.INTEGER)
	@PrimaryKey
	@AutoIncrement
	declare id: CreationOptional<number>;

	@Attribute(DataTypes.INTEGER)
	@NotNull
	declare hall_id: number;

	@Attribute(DataTypes.INTEGER)
	@NotNull
	declare user_id: number;

	@Attribute(DataTypes.DATE)
	@NotNull
	declare date: Date;

	@CreatedAt
	declare created_at: CreationOptional<Date>;

	@UpdatedAt
	declare updated_at: CreationOptional<Date>;
}

export class Plan extends Model<InferAttributes<Plan>, InferCreationAttributes<Plan>> {
    @Attribute(DataTypes.INTEGER)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<number>;

    @Attribute(DataTypes.JSON)
    @NotNull
    declare data: object;

    @Attribute(DataTypes.INTEGER)
    @NotNull
    declare user_id: number;

	@HasOne(() => Hall, {foreignKey: "plan", inverse: "planData"})
	declare hall?: NonAttribute<Hall>;
	declare getHall: HasOneGetAssociationMixin<Hall>;

    @Attribute(DataTypes.TEXT)
    @NotNull
    declare preview: string;

    @CreatedAt
    declare created_at: CreationOptional<Date>;

    @UpdatedAt
    declare updated_at: CreationOptional<Date>;
}

import { Sequelize } from '@sequelize/core';
import { MySqlDialect } from '@sequelize/mysql';
import { SQLURI } from '$env/static/private';

export const sequelize = new Sequelize({
	dialect: MySqlDialect,
	url: SQLURI,
	pool: {
		max: 10,
		min: 0,
		acquire: 30000,
		idle: 10000
	},
	define: {
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		underscored: true
	},
	models: [User, UserSession, Permission, Hall, Reservation, Plan]
});
