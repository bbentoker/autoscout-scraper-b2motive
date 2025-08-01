-- PostgreSQL Schema for AutoScout Scraper B2Motive
-- Generated from Sequelize models

-- Create autoscout_adverts table
CREATE TABLE autoscout_adverts (
    id SERIAL PRIMARY KEY,
    autoscout_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    seller_id INTEGER,
    seller_name VARCHAR(255),
    first_registration DATE,
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP,
    make VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL,
    model_version VARCHAR(255),
    location VARCHAR(255),
    price DECIMAL(10,2),
    price_currency VARCHAR(10),
    body_type VARCHAR(255),
    type VARCHAR(255),
    drivetrain VARCHAR(255),
    seats INTEGER,
    doors INTEGER,
    mileage VARCHAR(255),
    previous_owner INTEGER,
    full_service_history BOOLEAN,
    non_smoker_vehicle BOOLEAN,
    power VARCHAR(255),
    gearbox VARCHAR(255),
    engine_size VARCHAR(255),
    gears INTEGER,
    cylinders INTEGER,
    empty_weight VARCHAR(255),
    emission_class VARCHAR(255),
    fuel_type VARCHAR(255),
    fuel_consumption VARCHAR(255),
    co_2_emissions VARCHAR(255),
    comfort TEXT,
    entertainment TEXT,
    safety TEXT,
    extras TEXT,
    color VARCHAR(255),
    paint VARCHAR(255),
    upholstery_color VARCHAR(255),
    upholstery VARCHAR(255),
    description TEXT,
    link VARCHAR(500),
    sell_time INTEGER,
    image_url VARCHAR(500)
);

-- Create autoscout_controls table
CREATE TABLE autoscout_controls (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP
);

-- Create autoscout_seen_info table
CREATE TABLE autoscout_seen_info (
    id SERIAL PRIMARY KEY,
    control_id INTEGER,
    advert_id UUID,
    seen BOOLEAN
);

-- Create autoscout_inventory table
CREATE TABLE autoscout_inventory (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL,
    count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX idx_autoscout_adverts_make_model ON autoscout_adverts(make, model);
CREATE INDEX idx_autoscout_adverts_price ON autoscout_adverts(price);
CREATE INDEX idx_autoscout_adverts_is_active ON autoscout_adverts(is_active);
CREATE INDEX idx_autoscout_adverts_created_at ON autoscout_adverts(created_at);
CREATE INDEX idx_autoscout_seen_info_control_id ON autoscout_seen_info(control_id);
CREATE INDEX idx_autoscout_seen_info_advert_id ON autoscout_seen_info(advert_id);
CREATE INDEX idx_autoscout_inventory_seller_id ON autoscout_inventory(seller_id);
CREATE INDEX idx_autoscout_inventory_created_at ON autoscout_inventory(created_at);

-- Add foreign key constraints (optional - uncomment if needed)
-- ALTER TABLE autoscout_seen_info ADD CONSTRAINT fk_autoscout_seen_info_control_id FOREIGN KEY (control_id) REFERENCES autoscout_controls(id);
-- ALTER TABLE autoscout_seen_info ADD CONSTRAINT fk_autoscout_seen_info_advert_id FOREIGN KEY (advert_id) REFERENCES autoscout_adverts(id); 