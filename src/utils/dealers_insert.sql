-- PostgreSQL Insert Statements for Dealers from CSV
-- Generated from "Dealers to scrape - Namur.csv"

-- Note: role_id = 2 as specified in the prompt
-- status_id = 2 as requested
-- password will be set to a default value that should be changed
-- id will be auto-incremented

INSERT INTO users (
    zoho_id,
    name,
    email,
    company_name,
    phone_number,
    website,
    autoscout_url,
    role_id,
    status_id,
    language,
    country,
    password,
    created_at,
    updated_at
) VALUES
-- Click2move
(
    NULL,
    'Clement',
    'clement.salamon@declerc.com',
    'Click2move',
    '32475270087',
    NULL,
    'https://www.autoscout24.be/fr/professional/click2move-by-declerc-8-points-de-vente?sort=age&desc=1&page=3',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- DEX - Easy Car Shopping
(
    NULL,
    'Jess',
    'jess@dex.be',
    'DEX - Easy Car Shopping',
    NULL,
    NULL,
    'https://www.autoscout24.be/nl/verkopers/dex-easy-car-shopping',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Automaz24 Nannine
(
    NULL,
    'Automaz24 Nannine',
    'automaz24.nannine@placeholder.com',
    'Automaz24 Nannine',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/automaz24-nannine',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- MH Automobile
(
    NULL,
    'MH Automobile',
    'mh.automobile@placeholder.com',
    'MH Automobile',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/mh-automobile-wierde',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- TransakAuto Namur
(
    NULL,
    'TransakAuto Namur',
    'transakauto.namur@placeholder.com',
    'TransakAuto Namur',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/transakauto-namur',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Garage Steveny
(
    NULL,
    'Garage Steveny',
    'garage.steveny@placeholder.com',
    'Garage Steveny',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/garage-steveny',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Gego sa
(
    NULL,
    'Gego sa',
    'gego.sa@placeholder.com',
    'Gego sa',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/gego-sa',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Tavoiture.be
(
    NULL,
    'Tavoiture.be',
    'tavoiture.be@placeholder.com',
    'Tavoiture.be',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/tavoiture-be-assesse',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- STI Automobile
(
    NULL,
    'STI Automobile',
    'sti.automobile@placeholder.com',
    'STI Automobile',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/sti-automobile',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- LS Automobiles
(
    NULL,
    'LS Automobiles',
    'ls.automobiles@placeholder.com',
    'LS Automobiles',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/ls-automobiles-namur',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- L'agence Automobilière Namur-sud
(
    NULL,
    'L''agence Automobilière Namur-sud',
    'lagence.automobiliere.namur@placeholder.com',
    'L''agence Automobilière Namur-sud',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/l-agence-automobiliere-namur-sud',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Certified by CAR Avenue Namur
(
    NULL,
    'Certified by CAR Avenue Namur',
    'certified.car.avenue.namur@placeholder.com',
    'Certified by CAR Avenue Namur',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/certified-by-car-avenue-namur',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Garage Hennaux S.A.
(
    NULL,
    'Garage Hennaux S.A.',
    'garage.hennaux@placeholder.com',
    'Garage Hennaux S.A.',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/garage-hennaux-s-a',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Ets G. Lambert & co
(
    NULL,
    'Ets G. Lambert & co',
    'ets.g.lambert@placeholder.com',
    'Ets G. Lambert & co',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/ets-g-lambert-et-co',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Garage CWA s.a.
(
    NULL,
    'Garage CWA s.a.',
    'garage.cwa@placeholder.com',
    'Garage CWA s.a.',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/garage-cwa-s-a',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
),

-- Sud Motor sa
(
    NULL,
    'Sud Motor sa',
    'sud.motor@placeholder.com',
    'Sud Motor sa',
    NULL,
    NULL,
    'https://www.autoscout24.be/fr/professional/sud-motor-sa',
    2,
    2,
    'fr',
    'Belgium',
    '$2b$10$CBKB9kLd.OJFrA5I7cHNmuIv14xRW8wy/3q7G.wZ1zBx68wM.tKOC',
    NOW(),
    NOW()
); 