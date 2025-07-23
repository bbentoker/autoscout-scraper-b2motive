const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize,DataTypes) => {
  class SeenInfo extends Model {
    static associate(models) {
      SeenInfo.belongsTo(models.Control, {
        foreignKey: 'control_id',
        as: 'control'
      });
    }
  }

  SeenInfo.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      control_id: DataTypes.INTEGER,
      advert_id: DataTypes.UUID,
      seen:DataTypes.BOOLEAN
    },
    {
      sequelize,
      modelName: 'SeenInfo',
      tableName: 'autoscout_seen_info',
      timestamps: false,
    }
  );

  return SeenInfo;
};
