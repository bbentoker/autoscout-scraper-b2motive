const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize,DataTypes) => {
  class Advert extends Model {
    static associate(models) {
    }
  }

  Advert.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      autoscout_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      seller_id: DataTypes.INTEGER,
      seller_name: DataTypes.STRING,
      first_registration: DataTypes.DATE,
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      last_seen: DataTypes.DATE,
      make: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      model: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      model_version: DataTypes.STRING,

      location: DataTypes.STRING,
      price: DataTypes.FLOAT,
      price_currency: DataTypes.STRING,
      
      body_type: DataTypes.STRING,
      type: DataTypes.STRING,
      drivetrain: DataTypes.STRING,
      seats: DataTypes.INTEGER,
      doors: DataTypes.INTEGER,
      mileage: DataTypes.STRING,
      previous_owner: DataTypes.INTEGER,
      full_service_history: DataTypes.BOOLEAN,
      non_smoker_vehicle: DataTypes.BOOLEAN,
      power: DataTypes.STRING,
      gearbox: DataTypes.STRING,
      engine_size: DataTypes.STRING,
      gears: DataTypes.INTEGER,
      cylinders: DataTypes.INTEGER,
      empty_weight: DataTypes.STRING,
      emission_class: DataTypes.STRING,
      fuel_type: DataTypes.STRING,
      fuel_consumption: DataTypes.STRING,
      co_2_emissions: DataTypes.STRING,
      comfort: DataTypes.STRING,
      entertainment: DataTypes.STRING,
      safety: DataTypes.STRING,
      extras: DataTypes.STRING,
      color: DataTypes.STRING,
      paint: DataTypes.STRING,
      upholstery_color: DataTypes.STRING,
      upholstery: DataTypes.STRING,
      description: DataTypes.TEXT,
      link:DataTypes.STRING,
      sell_time:DataTypes.INTEGER,
      image_url:DataTypes.STRING,
      original_image_url:DataTypes.STRING,
      is_initial_run_listing: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'Advert',
      tableName: 'autoscout_adverts',
      timestamps: false,
    }
  );

  return Advert;
};
