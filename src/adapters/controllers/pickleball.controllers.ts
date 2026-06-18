/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSONCourtRepository, JSONBookingRepository } from '../../frameworks/db/local-db.ts';
import {
  GetCourtsUseCase,
  ManageCourtUseCase,
  GetAvailableSlotsUseCase,
  BookCourtUseCase,
  CancelBookingUseCase,
  CreateMaintenanceBlockUseCase
} from '../../domain/usecases/pickleball.usecases.ts';

// Instantiate concrete repositories (drivers mapped to interface boundaries)
const courtRepo = new JSONCourtRepository();
const bookingRepo = new JSONBookingRepository();

// Instantiate Use Cases
const getCourtsUseCase = new GetCourtsUseCase(courtRepo);
const manageCourtUseCase = new ManageCourtUseCase(courtRepo);
const getAvailableSlotsUseCase = new GetAvailableSlotsUseCase(bookingRepo);
const bookCourtUseCase = new BookCourtUseCase(courtRepo, bookingRepo);
const cancelBookingUseCase = new CancelBookingUseCase(bookingRepo);
const createMaintenanceBlockUseCase = new CreateMaintenanceBlockUseCase(bookingRepo);

/**
 * Controller Adapter enforcing secure sanitization and validation boundaries
 */
export class PickleballController {
  
  /**
   * Helper to securely validate and sanitize input strings
   */
  private static sanitizeString(str: any, maxLength = 100): string {
    if (typeof str !== 'string') return '';
    let clean = str.trim();
    // basic HTML entity encoding to mitigate basic XSS
    clean = clean
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
    return clean.slice(0, maxLength);
  }

  /**
   * Helper to sanitize and validate request emails
   */
  private static sanitizeEmail(email: any): string {
    if (typeof email !== 'string') return '';
    const clean = email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(clean) ? clean : '';
  }

  /**
   * GET /api/courts
   */
  static async getCourts(req: any, res: any) {
    try {
      const includeInactive = req.query.admin === 'true';
      const courts = await getCourtsUseCase.execute(includeInactive);
      res.json({ success: true, courts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve courts securely.' });
    }
  }

  /**
   * POST /api/courts (Admin only)
   */
  static async createCourt(req: any, res: any) {
    try {
      const name = PickleballController.sanitizeString(req.body.name, 50);
      const type = req.body.type === 'Indoor' ? 'Indoor' : 'Outdoor';
      const surface = ['Cushioned', 'Concrete', 'Acrytech'].includes(req.body.surface) ? req.body.surface : 'Cushioned';
      const pricePerHour = parseFloat(req.body.pricePerHour);
      const hasLights = Boolean(req.body.hasLights);
      const description = PickleballController.sanitizeString(req.body.description, 300);
      const imageUrl = PickleballController.sanitizeString(req.body.imageUrl, 200);

      if (isNaN(pricePerHour) || pricePerHour < 0) {
        return res.status(400).json({ success: false, error: 'Price must be a positive number.' });
      }

      const court = await manageCourtUseCase.createCourt({
        name,
        type,
        surface,
        pricePerHour,
        hasLights,
        description: description || undefined,
        imageUrl: imageUrl || undefined,
        isActive: true
      });

      res.status(210).json({ success: true, court });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Error occurred while creating court record.' });
    }
  }

  /**
   * PUT /api/courts/:id (Admin only)
   */
  static async updateCourt(req: any, res: any) {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ success: false, error: 'Court ID parameter is invalid.' });
      }

      const updates: any = {};
      if (req.body.name !== undefined) updates.name = PickleballController.sanitizeString(req.body.name, 50);
      if (req.body.type !== undefined) updates.type = req.body.type === 'Indoor' ? 'Indoor' : 'Outdoor';
      if (req.body.surface !== undefined) {
        updates.surface = ['Cushioned', 'Concrete', 'Acrytech'].includes(req.body.surface) ? req.body.surface : 'Cushioned';
      }
      if (req.body.pricePerHour !== undefined) {
        const val = parseFloat(req.body.pricePerHour);
        if (isNaN(val) || val < 0) {
          return res.status(400).json({ success: false, error: 'Price must be a positive value.' });
        }
        updates.pricePerHour = val;
      }
      if (req.body.hasLights !== undefined) updates.hasLights = Boolean(req.body.hasLights);
      if (req.body.description !== undefined) updates.description = PickleballController.sanitizeString(req.body.description, 300);
      if (req.body.imageUrl !== undefined) updates.imageUrl = PickleballController.sanitizeString(req.body.imageUrl, 200);
      if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);

      const court = await manageCourtUseCase.updateCourt(id, updates);
      res.json({ success: true, court });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Court update operation failed.' });
    }
  }

  /**
   * DELETE /api/courts/:id (Admin only)
   */
  static async deleteCourt(req: any, res: any) {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ success: false, error: 'Court ID parameter is invalid.' });
      }

      const ok = await manageCourtUseCase.deleteCourt(id);
      res.json({ success: ok, message: ok ? 'Court deleted successfully.' : 'Court delete failed.' });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Court deletion operation failed.' });
    }
  }

  /**
   * GET /api/courts/:id/slots?date=YYYY-MM-DD
   */
  static async getSlots(req: any, res: any) {
    try {
      const { id } = req.params;
      const { date } = req.query;

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ success: false, error: 'Valid Court ID required.' });
      }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'Date field is empty or not in YYYY-MM-DD format.' });
      }

      const slots = await getAvailableSlotsUseCase.execute(id, date);
      res.json({ success: true, slots });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Unable to scan court scheduled slots at this time.' });
    }
  }

  /**
   * POST /api/bookings
   */
  static async bookCourt(req: any, res: any) {
    try {
      const courtId = PickleballController.sanitizeString(req.body.courtId, 20);
      const playerName = PickleballController.sanitizeString(req.body.playerName, 40);
      const playerEmail = PickleballController.sanitizeEmail(req.body.playerEmail);
      const date = PickleballController.sanitizeString(req.body.date, 15);
      const startTime = parseInt(req.body.startTime, 10);
      const paymentToken = PickleballController.sanitizeString(req.body.paymentToken, 50);

      // Guard entries
      if (!courtId) {
        return res.status(400).json({ success: false, error: 'A valid court ID selection is required.' });
      }
      if (!playerName) {
        return res.status(400).json({ success: false, error: 'Player name is required.' });
      }
      if (!playerEmail) {
        return res.status(400).json({ success: false, error: 'A valid checkout email address is required.' });
      }
      if (isNaN(startTime)) {
        return res.status(400).json({ success: false, error: 'Start time must be a valid hour number.' });
      }

      const booking = await bookCourtUseCase.execute({
        courtId,
        playerName,
        playerEmail,
        date,
        startTime,
        paymentToken: paymentToken || undefined,
      });

      res.status(210).json({ success: true, booking });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to place booking.' });
    }
  }

  /**
   * GET /api/bookings?email=...
   */
  static async getBookings(req: any, res: any) {
    try {
      const email = PickleballController.sanitizeEmail(req.query.email);
      const viewAll = req.query.admin === 'true';

      let bookings;
      if (viewAll) {
        // Admin view
        bookings = await bookingRepo.findAll();
      } else {
        // Player specific filter (default to empty list if email is not provided)
        if (!email) {
          return res.json({ success: true, bookings: [] });
        }
        bookings = await bookingRepo.findByPlayerEmail(email);
      }

      // Sort bookings chronologically: descending by created date
      bookings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ success: true, bookings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Failed to retrieve booking histories securely.' });
    }
  }

  /**
   * POST /api/bookings/:id/cancel
   */
  static async cancelBooking(req: any, res: any) {
    try {
      const { id } = req.params;
      const email = PickleballController.sanitizeEmail(req.body.email);
      const isAdmin = req.body.admin === true;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing booking ID parameter' });
      }

      const booking = await cancelBookingUseCase.execute(id, email || undefined, isAdmin);
      res.json({ success: true, booking });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to cancel the reservation.' });
    }
  }

  /**
   * POST /api/maintenance (Admin only - blockout creation)
   */
  static async makeMaintenanceBlock(req: any, res: any) {
    try {
      const courtId = PickleballController.sanitizeString(req.body.courtId, 20);
      const date = PickleballController.sanitizeString(req.body.date, 15);
      const startTime = parseInt(req.body.startTime, 10);

      if (!courtId) {
        return res.status(400).json({ success: false, error: 'A valid court ID selection is required.' });
      }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'A target blockout date in YYYY-MM-DD format is required.' });
      }
      if (isNaN(startTime)) {
        return res.status(400).json({ success: false, error: 'Start time hour numeral is mandatory.' });
      }

      const maintBlock = await createMaintenanceBlockUseCase.execute({
        courtId,
        date,
        startTime
      });

      res.status(210).json({ success: true, block: maintBlock });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'Failed to block court out for maintenance.' });
    }
  }
}
