CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand);

INSERT INTO products (name, brand, price, currency, stock)
VALUES
  ('Ultraboost Light', 'adidas', 15990.00, 'RUB', 12),
  ('Gazelle Indoor', 'adidas', 11990.00, 'RUB', 8),
  ('Campus 00s', 'adidas', 10990.00, 'RUB', 15)
ON CONFLICT DO NOTHING;
