const GitStateManager = require('./git-state-manager');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

async function runTest() {
    console.log('Starting GitStateManager Test...');

    // Use a temporary directory for testing to avoid messing up the main repo
    const testDir = path.join(__dirname, 'test_repo_' + Date.now());
    fs.mkdirSync(testDir);

    try {
        const gitManager = new GitStateManager(testDir);

        // 1. Initialize
        console.log('\n1. Testing Initialize...');
        await gitManager.initialize();
        console.log('✓ Initialized');

        // 2. Create a file and commit it
        console.log('\n2. Testing Create Step Commit...');
        fs.writeFileSync(path.join(testDir, 'test.txt'), 'Initial content');
        const stepId1 = uuidv4();
        const commit1 = await gitManager.createStepCommit(
            stepId1,
            1,
            'Initial decision',
            'Thinking about starting',
            'test.txt',
            { some: 'metadata' }
        );
        console.log(`✓ Created commit 1: ${commit1}`);

        // 3. Create another commit
        console.log('\n3. Testing Second Commit...');
        fs.writeFileSync(path.join(testDir, 'test.txt'), 'Modified content');
        const stepId2 = uuidv4();
        const commit2 = await gitManager.createStepCommit(
            stepId2,
            2,
            'Second decision',
            'Thinking about changing',
            'test.txt',
            { some: 'more_metadata' }
        );
        console.log(`✓ Created commit 2: ${commit2}`);

        // 4. Verify Log
        console.log('\n4. Testing Get Log...');
        const log = await gitManager.getLog();
        console.log(`✓ Log has ${log.length} commits`);
        if (log.length < 2) throw new Error('Expected at least 2 commits');

        // 5. Test Rollback
        console.log('\n5. Testing Rollback...');
        // Modify file but don't commit (to test stash)
        fs.writeFileSync(path.join(testDir, 'test.txt'), 'Uncommitted content');

        const result = await gitManager.rollbackToCommit(commit1);
        console.log(`✓ Rolled back to ${commit1}`);
        console.log(`  Backup branch: ${result.backupBranch}`);

        // Verify content matches commit 1
        const content = fs.readFileSync(path.join(testDir, 'test.txt'), 'utf8');
        if (content !== 'Initial content') {
            throw new Error(`Rollback failed. Expected 'Initial content', got '${content}'`);
        }
        console.log('✓ Content verified');

        console.log('\n✓ ALL TESTS PASSED');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
    } finally {
        // Cleanup
        // fs.rmSync(testDir, { recursive: true, force: true });
        console.log(`\nTest repo left at: ${testDir}`);
    }
}

runTest();
