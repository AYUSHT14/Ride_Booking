import express from 'express';
import { createRide, updateRideStatus, acceptRide, getMyRides, verifyOTP, rateRide, updateFare } from '../controllers/ride.js';

const router = express.Router();

router.post('/create', createRide);
router.patch('/accept/:rideId', acceptRide);
router.patch('/update/:rideId', updateRideStatus);
router.get('/rides', getMyRides);
router.post('/verify-otp/:rideId', verifyOTP);
router.post('/rate/:rideId', rateRide);
router.post('/update-fare/:rideId', updateFare);

export default router;
