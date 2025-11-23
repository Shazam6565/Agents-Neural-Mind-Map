const { v4: uuidv4 } = require('uuid');

class WebSocketProtocol {
    static EVENT_TYPES = {
        // Dashboard -> IDE
        ROLLBACK_REQUESTED: 'state.rollback_requested',
        PAUSE_REQUESTED: 'agent.pause_requested',
        RESUME_REQUESTED: 'agent.resume_requested',
        BRANCH_REQUESTED: 'branch.create_requested',

        // IDE -> Dashboard
        STEP_CREATED: 'step.created',
        STATUS_CHANGED: 'agent.status_changed',
        ROLLBACK_COMPLETED: 'state.rollback_completed',
        BRANCH_CREATED: 'branch.created',

        // System
        ACK: 'system.ack',
        ERROR: 'system.error'
    };

    /**
     * Create a standardized message
     * @param {string} eventType - One of WebSocketProtocol.EVENT_TYPES
     * @param {Object} payload - The data payload
     * @param {string} [correlationId] - Optional correlation ID for request-response
     * @returns {Object} Formatted message
     */
    static createMessage(eventType, payload = {}, correlationId = null) {
        return {
            event_id: uuidv4(),
            event_type: eventType,
            correlation_id: correlationId || uuidv4(),
            timestamp: new Date().toISOString(),
            payload
        };
    }

    /**
     * Create an acknowledgement message for a received event
     * @param {Object} originalMessage - The message being acknowledged
     * @param {Object} payload - Optional payload
     * @returns {Object} Ack message
     */
    static createAck(originalMessage, payload = {}) {
        return {
            event_id: uuidv4(),
            event_type: this.EVENT_TYPES.ACK,
            correlation_id: originalMessage.event_id, // Correlate with the original event ID
            timestamp: new Date().toISOString(),
            payload
        };
    }

    /**
     * Create an error message
     * @param {Object} originalMessage - The message that caused the error (optional)
     * @param {string} code - Error code
     * @param {string} message - Human readable error message
     * @returns {Object} Error message
     */
    static createError(originalMessage, code, message) {
        return {
            event_id: uuidv4(),
            event_type: this.EVENT_TYPES.ERROR,
            correlation_id: originalMessage ? originalMessage.event_id : uuidv4(),
            timestamp: new Date().toISOString(),
            payload: {
                code,
                message
            }
        };
    }

    /**
     * Validate a message structure
     * @param {Object} message - The message to validate
     * @returns {boolean} True if valid, throws error otherwise
     */
    static validate(message) {
        if (!message || typeof message !== 'object') {
            throw new Error('Message must be an object');
        }
        if (!message.event_id) throw new Error('Missing event_id');
        if (!message.event_type) throw new Error('Missing event_type');
        if (!message.timestamp) throw new Error('Missing timestamp');
        if (!message.payload || typeof message.payload !== 'object') {
            throw new Error('Missing or invalid payload');
        }
        return true;
    }
}

module.exports = WebSocketProtocol;
