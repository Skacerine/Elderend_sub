import { EventEmitter } from "events";

// Replaces RabbitMQ — in-process pub/sub for geofence events
const eventBus = new EventEmitter();
eventBus.setMaxListeners(20);

export default eventBus;
