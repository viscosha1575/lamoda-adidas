// src/index.js
import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { startGiveawayReportScheduler } from '../services/giveawayReportScheduler.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('[config] MONGODB_URI is not set');
  process.exit(1);
}

mongoose.set('strictQuery', true);

let httpServer;
let stopGiveawayReportScheduler = null;

/** Подключение к MongoDB */
async function connectMongo() {
  try {
    await mongoose.connect(MONGODB_URI, {
      // при необходимости можно добавить:
      // maxPoolSize: 10,
      // serverSelectionTimeoutMS: 10000,
    });
    console.log('[mongo] connected');
  } catch (err) {
    console.error('[mongo] connection error:', err?.message || err);
    process.exit(1);
  }
}

/** Запуск HTTP-сервера */
async function startServer() {
  await connectMongo();

  stopGiveawayReportScheduler = startGiveawayReportScheduler();

  httpServer = app.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });

  httpServer.on('error', (err) => {
    console.error('[server] error:', err);
    process.exit(1);
  });
}

/** Корректное завершение */
async function shutdown(signal) {
  try {
    console.log(`[shutdown] received ${signal}`);
    if (stopGiveawayReportScheduler) {
      stopGiveawayReportScheduler();
      stopGiveawayReportScheduler = null;
      console.log('[giveawayReportScheduler] stopped');
    }
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('[server] closed');
    }
    await mongoose.connection.close();
    console.log('[mongo] disconnected');
  } catch (e) {
    console.error('[shutdown] error:', e);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  shutdown('unhandledRejection');
});

startServer();
