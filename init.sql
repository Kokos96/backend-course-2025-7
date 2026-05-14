CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    inventory_name VARCHAR(255) NOT NULL,
    description TEXT,
    photo VARCHAR(255)
);