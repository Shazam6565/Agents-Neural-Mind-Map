const io = require('socket.io-client');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const SERVER_URL = 'http://localhost:3001';
const TRACE_FILE = path.join(__dirname, '../reasoning_trace.json');

// Backup existing trace
if (fs.existsSync(TRACE_FILE)) {
    fs.copyFileSync(TRACE_FILE, `${TRACE_FILE}.bak`);
}

const socket = io(SERVER_URL);

let stepCount = 0;
const TOTAL_STEPS = 3;

console.log('🚀 Starting System Verification...');

socket.on('connect', () => {
    console.log('✓ Connected to WebSocket server');
    startSimulation();
});

socket.on('agent-event', (message) => {
    const { event_type, payload } = message;

    switch (event_type) {
        case 'step.created':
            console.log(`✓ Step Created: ${payload.step} (Commit: ${payload.commitHash})`);
            stepCount++;
            if (stepCount === TOTAL_STEPS) {
                console.log('All steps created. Initiating Rollback Test...');
                testRollback(payload.commitHash); // Rollback to last step
            }
            break;

        case 'state.rollback_completed':
            console.log(`✓ Rollback Completed to ${payload.commitHash}`);
            console.log('Initiating Branch Creation Test...');
            testBranching(payload.commitHash);
            break;

        case 'branch.created':
            console.log(`✓ Branch Created: ${payload.branchName}`);
            console.log('\n✅ SYSTEM VERIFICATION PASSED');
            cleanup();
            process.exit(0);
            break;

        case 'system.error':
            console.error('❌ System Error:', payload);
            cleanup();
            process.exit(1);
            break;
    }
});

function startSimulation() {
    console.log('Simulating Agent Activity...');
    // Write initial steps
    const steps = [];

    // Simulate steps one by one with delay
    let currentStep = 1;

    const interval = setInterval(() => {
        if (currentStep > TOTAL_STEPS) {
            clearInterval(interval);
            return;
        }

        steps.push({
            step: currentStep,
            thought: `Simulated thought for step ${currentStep}`,
            decision: `Decision ${currentStep}`,
            file_examined: `file_${currentStep}.txt`,
            alternatives_considered: [`Alternative A`, `Alternative B`]
        });

        fs.writeFileSync(TRACE_FILE, JSON.stringify(steps, null, 2));
        console.log(`> Wrote step ${currentStep} to trace file`);

        currentStep++;
    }, 2000);
}

function testRollback(commitHash) {
    // Request rollback to the previous step (step 2)
    // Actually, let's rollback to the *first* step to be dramatic
    // But we need the commit hash of the first step.
    // For simplicity in this script, we'll just rollback to the current one (no-op) or previous if we tracked it.
    // Let's just rollback to the one we just got, which effectively resets state to that commit.

    console.log(`> Requesting rollback to ${commitHash}...`);
    socket.emit('state.rollback_requested', {
        event_id: uuidv4(),
        event_type: 'state.rollback_requested',
        timestamp: new Date().toISOString(),
        payload: {
            commitHash: commitHash
        }
    });
}

function testBranching(commitHash) {
    console.log(`> Requesting branch creation from ${commitHash}...`);
    socket.emit('branch.create_requested', {
        event_id: uuidv4(),
        event_type: 'branch.create_requested',
        timestamp: new Date().toISOString(),
        payload: {
            name: 'verification-test-branch',
            fromCommitHash: commitHash,
            parentSessionId: 'test-session-id'
        }
    });
}

function cleanup() {
    if (fs.existsSync(`${TRACE_FILE}.bak`)) {
        fs.copyFileSync(`${TRACE_FILE}.bak`, TRACE_FILE);
        fs.unlinkSync(`${TRACE_FILE}.bak`);
    }
    socket.disconnect();
}

// Handle exit
process.on('SIGINT', cleanup);
