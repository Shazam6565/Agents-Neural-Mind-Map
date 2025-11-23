const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const socket = io('http://localhost:3001');

console.log('🎬 Dashboard Status Demo Starting...');

socket.on('connect', () => {
    console.log('✓ Connected to server');

    // Wait a moment then trigger PAUSE
    setTimeout(() => {
        console.log('\n📍 Sending PAUSE command...');
        socket.emit('agent.pause_requested', {
            event_id: uuidv4(),
            event_type: 'agent.pause_requested',
            timestamp: new Date().toISOString(),
            payload: {}
        });
    }, 2000);

    // After 5 seconds, send RESUME
    setTimeout(() => {
        console.log('\n📍 Sending RESUME command...');
        socket.emit('agent.resume_requested', {
            event_id: uuidv4(),
            event_type: 'agent.resume_requested',
            timestamp: new Date().toISOString(),
            payload: {}
        });
    }, 7000);

    // Exit after 10 seconds
    setTimeout(() => {
        console.log('\n✅ Demo complete');
        socket.disconnect();
        process.exit(0);
    }, 10000);
});

socket.on('agent-event', (message) => {
    if (message.event_type === 'agent.status_changed') {
        console.log(`   ⚡ Status changed to: ${message.payload.status}`);
    }
});
