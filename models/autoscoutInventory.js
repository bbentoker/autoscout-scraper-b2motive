const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AutoScoutInventory extends Model {
    static associate(models) {
    }
  }

  AutoScoutInventory.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      seller_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      count: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      }
    },
    {
      sequelize,
      modelName: 'AutoScoutInventory',
      tableName: 'autoscout_inventory',
      timestamps: true,
      underscored: true,
    }
  );

  return AutoScoutInventory;
}; 