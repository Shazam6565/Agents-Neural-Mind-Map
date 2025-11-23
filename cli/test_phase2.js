const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001/api';

async function testPhase2() {
    console.log('=== Testing Phase 2: Time Travel & State Management ===\n');

    try {
        // 1. Test GET /api/sessions
        console.log('1. Fetching all sessions...');
        const sessionsRes = await fetch(`${BASE_URL}/sessions`);
        const sessions = await sessionsRes.json();
        console.log('   Raw sessions response:', sessions);
        console.log(`   ✓ Found ${sessions.length} sessions`);

        if (sessions.length === 0) {
            console.log('   ! No sessions found. Run test_phase1.py first.');
            return;
        }

        // 2. Test GET /api/sessions/:id/nodes
        const sessionId = sessions[0].session_id;
        console.log(`\n2. Loading nodes for session: ${sessionId.substring(0, 8)}...`);
        const nodesRes = await fetch(`${BASE_URL}/sessions/${sessionId}/nodes`);
        const nodes = await nodesRes.json();
        console.log(`   ✓ Loaded ${nodes.length} nodes`);

        // 3. Test GET /api/sessions/:id
        console.log(`\n3. Fetching session details...`);
        const sessionRes = await fetch(`${BASE_URL}/sessions/${sessionId}`);
        const session = await sessionRes.json();
        console.log(`   ✓ Session prompt: "${session.prompt}"`);

        // 4. Test POST /api/sessions/:id/branch
        if (nodes.length > 0) {
            const firstNodeId = nodes[0].id;
            console.log(`\n4. Creating branch from node ${firstNodeId}...`);
            const branchRes = await fetch(`${BASE_URL}/sessions/${sessionId}/branch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    checkpoint_node_id: firstNodeId,
                    prompt: 'Test Branch - Phase 2'
                })
            });
            const branchResult = await branchRes.json();
            console.log(`   ✓ Branch created: ${branchResult.new_session_id.substring(0, 8)}`);
            console.log(`   ✓ Parent session: ${branchResult.parent_session_id.substring(0, 8)}`);
        }

        // 5. Test POST /api/sessions/:id/resume
        if (nodes.length > 0) {
            const firstNodeId = nodes[0].id;
            console.log(`\n5. Testing resume from checkpoint ${firstNodeId}...`);
            const resumeRes = await fetch(`${BASE_URL}/sessions/${sessionId}/resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    checkpoint_node_id: firstNodeId
                })
            });
            const resumeResult = await resumeRes.json();
            console.log(`   ✓ State reconstructed successfully`);
            console.log(`   ✓ State contains ${Object.keys(resumeResult.state).length} keys`);
        }

        console.log('\n=== Phase 2 Test Complete ===');
        console.log('Next: Open dashboard at http://localhost:3000');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    }
}

testPhase2();
