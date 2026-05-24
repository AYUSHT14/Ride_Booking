import geolib from "geolib";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Ride from "../models/Ride.js";

// ── In-memory store: userId -> { socketId, coords } ──────
const onDutyRiders = new Map();

// ── Helper: send nearby riders to a customer socket ──────
function sendNearbyRiders(io, socket, location, ride = null) {
  if (!location || location.latitude === undefined) return [];

  const nearbyRiders = Array.from(onDutyRiders.entries())
    .map(([userId, rider]) => ({
      ...rider,
      userId,
      distance: geolib.getDistance(rider.coords, location),
    }))
    .filter((rider) => {
      // Must be within 500 km
      if (rider.distance > 500000) return false;
      // If a specific ride is requested, rider vehicle must match
      if (ride && ride.vehicle && rider.vehicle !== ride.vehicle) return false;
      return true;
    })
    .sort((a, b) => a.distance - b.distance);

  socket.emit("nearbyRiders", nearbyRiders);

  if (ride) {
    nearbyRiders.forEach((rider) => {
      io.to(rider.socketId).emit("rideOffer", ride);
    });
  }

  return nearbyRiders;
}

// ── Helper: push nearby riders to ALL connected customers ─
function updateAllCustomers(io) {
  io.sockets.sockets.forEach((sock) => {
    if (sock.user?.role === "customer" && sock.user.coords) {
      sendNearbyRiders(io, sock, sock.user.coords);
    }
  });
}

// ── Helper: get a rider's socket by userId ────────────────
function getRiderSocket(io, riderId) {
  const rider = onDutyRiders.get(String(riderId));
  return rider ? io.sockets.sockets.get(rider.socketId) : null;
}

// ── Core ride-search logic (extracted for reuse) ──────────
async function handleSearchRider(socket, user, io, rideId) {
  try {
    const ride = await Ride.findById(rideId).populate("customer rider");
    if (!ride) {
      socket.emit("error", { message: "Ride not found" });
      return;
    }

    // Subscribe this socket to ride-room updates
    socket.join(`ride_${rideId}`);

    const pickupCoords = {
      latitude: ride.pickup.latitude,
      longitude: ride.pickup.longitude,
    };

    let rideAccepted = false;
    let canceled = false;
    let retries = 0;
    const MAX_RETRIES = 20;

    const retrySearch = async () => {
      if (canceled) {
        clearInterval(retryInterval);
        return;
      }
      
      const freshRide = await Ride.findById(rideId);
      if (!freshRide || freshRide.status !== "SEARCHING_FOR_RIDER") {
        clearInterval(retryInterval);
        return;
      }

      retries++;
      console.log(
        `[Ride ${rideId}] Searching riders — attempt ${retries}/${MAX_RETRIES}`
      );

      sendNearbyRiders(io, socket, pickupCoords, freshRide);

      if (retries >= MAX_RETRIES) {
        clearInterval(retryInterval);
        if (freshRide.status === "SEARCHING_FOR_RIDER") {
          await Ride.findByIdAndDelete(rideId);
          socket.emit("error", {
            message: "No riders found. Please try again.",
          });
        }
      }
    };

    // Initial search immediately, then every 10 s
    await retrySearch();
    const retryInterval = setInterval(retrySearch, 10000);

    // Customer canceled
    socket.once(`cancelRide_${rideId}`, async () => {
      canceled = true;
      clearInterval(retryInterval);

      const freshRide = await Ride.findById(rideId);
      if (freshRide) {
        const riderRef = freshRide.rider;
        await Ride.findByIdAndDelete(rideId);
        socket.emit("rideCanceled", { message: "Your ride has been canceled." });

        if (riderRef) {
          const riderSock = getRiderSocket(io, riderRef);
          if (riderSock) {
            riderSock.emit("rideCanceled", {
              message: "Customer canceled the ride.",
            });
          }
        }
      }
      console.log(`[Ride ${rideId}] Customer ${user.id} canceled.`);
    });

    // Rider accepted (customer-side socket event)
    socket.once("rideAccepted", () => {
      rideAccepted = true;
      clearInterval(retryInterval);
    });
  } catch (error) {
    console.error("Error searching for rider:", error);
    socket.emit("error", {
      message: "Error searching for rider. Please try again.",
    });
  }
}

// ── Main socket handler ───────────────────────────────────
const handleSocketConnection = (io) => {
  // ── Auth middleware ──────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.access_token ||
        socket.handshake.headers.access_token ||
        socket.handshake.query?.access_token;

      if (!token) return next(new Error("Authentication invalid: No token"));

      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(payload.id);
      if (!user)
        return next(new Error("Authentication invalid: User not found"));

      socket.user = { id: String(payload.id), role: user.role, coords: null };
      next();
    } catch (error) {
      console.error("Socket Auth Error:", error.message);
      next(new Error("Authentication invalid: Token verification failed"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    console.log(
      `[Socket] Connected: ${user.id} (${user.role}) [${socket.id}]`
    );

    // ── RIDER events ─────────────────────────────────────
    if (user.role === "rider") {
      socket.on("goOnDuty", (data) => {
        // Support old format (coords directly) or new format ({coords, vehicle})
        const coords = data.coords || data;
        const vehicle = data.vehicle || "bike"; // Default to bike

        if (
          !coords ||
          coords.latitude === undefined ||
          coords.longitude === undefined
        ) {
          socket.emit("error", { message: "Invalid coordinates for goOnDuty" });
          return;
        }
        onDutyRiders.set(user.id, { socketId: socket.id, coords, vehicle });
        socket.join("onDuty");
        console.log(`[Rider ${user.id}] On duty at`, coords, `with ${vehicle}`);
        updateAllCustomers(io);
        socket.emit("dutyStatus", { onDuty: true });
      });

      socket.on("goOffDuty", () => {
        onDutyRiders.delete(user.id);
        socket.leave("onDuty");
        console.log(`[Rider ${user.id}] Off duty.`);
        updateAllCustomers(io);
        socket.emit("dutyStatus", { onDuty: false });
      });

      socket.on("updateLocation", (coords) => {
        if (
          !coords ||
          coords.latitude === undefined ||
          coords.longitude === undefined
        )
          return;
        if (onDutyRiders.has(user.id)) {
          onDutyRiders.get(user.id).coords = coords;
          updateAllCustomers(io);
          socket
            .to(`rider_${user.id}`)
            .emit("riderLocationUpdate", { riderId: user.id, coords });
        }
      });
    }

    // ── CUSTOMER events ──────────────────────────────────
    if (user.role === "customer") {
      socket.on("subscribeToZone", (customerCoords) => {
        if (!customerCoords || customerCoords.latitude === undefined) return;
        socket.user.coords = customerCoords;
        sendNearbyRiders(io, socket, customerCoords);
      });

      // New frontend sends "searchRider"
      socket.on("searchRider", (rideId) => {
        handleSearchRider(socket, user, io, rideId);
      });

      // Legacy frontend sends "searchrider" (lowercase)
      socket.on("searchrider", (rideId) => {
        handleSearchRider(socket, user, io, rideId);
      });

      socket.on("cancelRide", (rideId) => {
        // Emit the per-ride cancel event that handleSearchRider listens for
        socket.emit(`cancelRide_${rideId}`);
      });
    }

    // ── SHARED events ────────────────────────────────────
    socket.on("subscribeToriderLocation", (riderId) => {
      const rider = onDutyRiders.get(String(riderId));
      if (rider) {
        socket.join(`rider_${riderId}`);
        socket.emit("riderLocationUpdate", { riderId, coords: rider.coords });
        console.log(
          `[Socket] ${user.id} subscribed to rider ${riderId} location.`
        );
      } else {
        socket.emit("riderLocationUpdate", { riderId, coords: null });
      }
    });

    socket.on("subscribeRide", async (rideId) => {
      socket.join(`ride_${rideId}`);
      try {
        const rideData = await Ride.findById(rideId).populate("customer rider");
        socket.emit("rideData", rideData);
      } catch (error) {
        socket.emit("error", { message: "Failed to receive ride data" });
      }
    });

    socket.on("disconnect", () => {
      if (user.role === "rider" && onDutyRiders.has(user.id)) {
        onDutyRiders.delete(user.id);
        console.log(
          `[Rider ${user.id}] Disconnected — removed from on-duty list.`
        );
        updateAllCustomers(io);
      }
      console.log(`[Socket] Disconnected: ${user.role} ${user.id}`);
    });
  });
};

export default handleSocketConnection;
