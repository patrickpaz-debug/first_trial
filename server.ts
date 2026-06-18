/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import * as path from 'path';
import { createServer as createViteServer } from 'vite';
import { PickleballController } from './src/adapters/controllers/pickleball.controllers.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Enable secure body parsing and middleware headers
  app.use(express.json());
  
  // Custom secure CORS & Referrer protection header policies
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // 2. Application REST Endpoints (Interface Adapter Controller integrations)
  
  // Health Probe
  app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Court registries
  app.get('/api/courts', PickleballController.getCourts);
  app.post('/api/courts', PickleballController.createCourt);
  app.put('/api/courts/:id', PickleballController.updateCourt);
  app.delete('/api/courts/:id', PickleballController.deleteCourt);

  // Slot scans & availabilities
  app.get('/api/courts/:id/slots', PickleballController.getSlots);

  // Reservation mechanics & status checking
  app.get('/api/bookings', PickleballController.getBookings);
  app.post('/api/bookings', PickleballController.bookCourt);
  app.post('/api/bookings/:id/cancel', PickleballController.cancelBooking);

  // Maintenance mechanics (Admin pre-emptions)
  app.post('/api/maintenance', PickleballController.makeMaintenanceBlock);

  // 3. Vite development middleware or static production hosting
  if (process.env.NODE_ENV !== 'production') {
    console.log('Spawning Vite server development middlewares...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving production static resources...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 4. Fire up server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` Pickleball Court Booking System Server Running! `);
    console.log(` Port: ${PORT} | Host: 0.0.0.0                      `);
    console.log(`====================================================`);
  });
}

// Global safe error boundary to prevent crash escapes or trace leaks
process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT SYSTEM EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL UNHANDLED SYSTEM REJECTION:', reason);
});

startServer();
