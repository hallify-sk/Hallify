import {type CreationOptional, type InferAttributes, type InferCreationAttributes, Model, DataTypes} from '@sequelize/core';
import { Attribute, AutoIncrement, CreatedAt, NotNull, PrimaryKey, Unique, UpdatedAt } from '@sequelize/core/decorators-legacy';

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
};

export class UserSession extends Model<InferAttributes<UserSession>, InferCreationAttributes<UserSession>> {
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
};

export class Permission extends Model<InferAttributes<Permission>, InferCreationAttributes<Permission>> {
	@Attribute(DataTypes.STRING)
    @PrimaryKey
    @AutoIncrement
    declare id: CreationOptional<string>;

	@Attribute(DataTypes.STRING)
	@NotNull
	declare name: string;

	@Attribute(DataTypes.TEXT)
	@NotNull
	get allowed_paths(): Array<string> {
		return JSON.parse(this.getDataValue("allowed_paths") as unknown as string);
	}

	@Attribute(DataTypes.TEXT)
	@NotNull
	get disallowed_paths(): Array<string> {
		return JSON.parse(this.getDataValue("disallowed_paths") as unknown as string);
	}
	
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
	models: [User, UserSession, Permission]
});