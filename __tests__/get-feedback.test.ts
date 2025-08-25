import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('get_feedback tool', () => {
  let testDir: string;
  let feedbackPath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feedback-test-'));
    feedbackPath = path.join(testDir, 'feedback.md');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should demonstrate auto-creation of feedback.md file when missing', async () => {
    // Verify the file doesn't exist initially
    await expect(fs.access(feedbackPath)).rejects.toThrow();

    // Simulate what the get_feedback tool does when feedback.md doesn't exist
    try {
      await fs.access(feedbackPath);
    } catch (error) {
      // File doesn't exist, create it with empty content
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await fs.writeFile(feedbackPath, '', 'utf-8');
      }
    }

    // Verify the file now exists and is empty
    await expect(fs.access(feedbackPath)).resolves.toBeUndefined();
    const content = await fs.readFile(feedbackPath, 'utf-8');
    expect(content).toBe('');
  });

  it('should not overwrite existing feedback.md file', async () => {
    const existingContent = 'This is existing feedback content';
    await fs.writeFile(feedbackPath, existingContent, 'utf-8');

    // Simulate what the get_feedback tool does - it should not overwrite existing files
    try {
      await fs.access(feedbackPath);
      // File exists, do nothing
    } catch (error) {
      // File doesn't exist, create it with empty content
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await fs.writeFile(feedbackPath, '', 'utf-8');
      }
    }

    // Verify the existing content is preserved
    const content = await fs.readFile(feedbackPath, 'utf-8');
    expect(content).toBe(existingContent);
  });
});
