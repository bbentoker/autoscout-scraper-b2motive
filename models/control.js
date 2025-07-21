const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize,DataTypes) => {
  class Control extends Model {
    static associate(models) {
    }
  }

  Control.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      date: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Control',
      tableName: 'autoscout_controls',
      timestamps: false,
    }
  );

  return Control;
};
