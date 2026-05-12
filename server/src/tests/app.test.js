import test from "node:test";
import assert from "node:assert/strict";

import { Router } from "express";
import request from "supertest";

import { createApp } from "../app.js";

function createTestApp() {
  const products = [
    {
      id: 1,
      name: "Ultraboost Light",
      brand: "adidas",
      price: "15990.00",
      currency: "RUB",
      stock: 12,
    },
  ];

  const app = createApp({
    config: {
      corsOrigins: ["http://localhost:5173"],
    },
    pool: {
      async query() {
        return { rows: [{ "?column?": 1 }] };
      },
    },
    authRouter: Router(),
    gameRouter: Router(),
    productsController: {
      async getAll(_request, response) {
        response.json({ data: products });
      },
      async getById(request, response) {
        const product = products.find((item) => item.id === Number(request.params.id));

        if (!product) {
          response.status(404).json({
            error: {
              message: "Product not found",
              details: null,
            },
          });
          return;
        }

        response.json({ data: product });
      },
      async create(request, response) {
        response.status(201).json({
          data: {
            id: 2,
            ...request.body,
          },
        });
      },
    },
  });

  return app;
}

test("GET /api/health returns service status", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/health");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.database, "connected");
});

test("GET /api/products returns product list", async () => {
  const app = createTestApp();
  const response = await request(app).get("/api/products");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].brand, "adidas");
});

test("POST /api/products creates a product", async () => {
  const app = createTestApp();
  const response = await request(app).post("/api/products").send({
    name: "Superstar",
    brand: "adidas",
    price: 9990,
    currency: "RUB",
    stock: 4,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.name, "Superstar");
});
