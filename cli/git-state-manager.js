const simpleGit = require('simple-git');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class GitStateManager {
    constructor(repoPath) {
        this.repoPath = repoPath || process.cwd();
        this.git = simpleGit(this.repoPath);
    }

    async initialize() {
        try {
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                await this.git.init();
                console.log('Initialized empty Git repository');
            }

            // Configure user if not set (local to this repo)
            try {
                await this.git.getConfig('user.name');
            } catch (e) {
                await this.git.addConfig('user.name', 'Agent MindMap');
                await this.git.addConfig('user.email', 'agent@mindmap.local');
            }

            // Ensure notes ref exists or at least we can write to it
            // We don't need to explicitly create it, git notes add will handle it
        } catch (error) {
            console.error('Git initialization error:', error);
            throw error;
        }
    }

    async createStepCommit(stepId, stepNumber, decision, thought, file, metadata = {}) {
        try {
            // Stage all changes
            await this.git.add('.');

            // Construct structured commit message
            const message = `Step ${stepNumber}: ${decision}\n\nStep-ID: ${stepId}\nThought: ${thought}\nFile: ${file}`;

            const commitResult = await this.git.commit(message, { '--allow-empty': null });
            const commitHash = commitResult.commit;

            // Store full metadata in git notes
            if (metadata) {
                const noteContent = JSON.stringify(metadata, null, 2);
                await this.git.raw([
                    'notes',
                    '--ref=refs/notes/agent-steps',
                    'add',
                    '-f',
                    '-m',
                    noteContent,
                    commitHash
                ]);
            }

            return commitHash;
        } catch (error) {
            console.error('Error creating step commit:', error);
            throw error;
        }
    }

    async rollbackToCommit(sha) {
        try {
            // 1. Stash uncommitted changes
            const status = await this.git.status();
            if (!status.isClean()) {
                await this.git.stash(['push', '-m', `Auto-stash before rollback to ${sha}`]);
            }

            // 2. Create backup branch of current state
            const currentHead = await this.git.revparse(['HEAD']);
            const backupBranchName = `backup/rollback-${Date.now()}`;
            await this.git.branch([backupBranchName, currentHead]);
            console.log(`Created backup branch: ${backupBranchName}`);

            // 3. Hard reset to target SHA
            await this.git.reset(['--hard', sha]);
            console.log(`Rolled back to commit ${sha}`);

            return { success: true, backupBranch: backupBranchName };
        } catch (error) {
            console.error('Error rolling back to commit:', error);
            throw error;
        }
    }

    async createTimeline(fromSha, name) {
        try {
            // Create and checkout new branch from specific SHA
            const branchName = `timeline/${name}-${uuidv4().slice(0, 8)}`;
            await this.git.checkoutBranch(branchName, fromSha);
            console.log(`Created new timeline branch: ${branchName} from ${fromSha}`);
            return branchName;
        } catch (error) {
            console.error('Error creating timeline:', error);
            throw error;
        }
    }

    async getLog() {
        try {
            const log = await this.git.log();
            return log.all;
        } catch (error) {
            console.error('Git log error:', error);
            throw error;
        }
    }
}

module.exports = GitStateManager;
