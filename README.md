# TaskSync MCP Server

Interactive feedback system with file monitoring and media support.

## 🌟 Features

- **ask_review** - Monitors `review.md` for real-time feedback loops
- **view_media** - Reads images/audio files (PNG, JPEG, GIF, WebP, BMP, SVG, MP3, WAV, OGG, FLAC)

## 🛠️ Setup

Add to `mcp.json`:
```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["-y", "tasksync-mcp@latest",".", "/path/to/workspace"]
    }
  }
}
```

For VS Code:
```json
		"tasksync": {
			"command": "npx",
			"args": [
				"-y",
				"tasksync-mcp@latest",
				"."
			],
			"type": "stdio"
		}
	},

```

## 📖 How to Use It

1. **Setup MCP** - Add TaskSync to your `mcp.json` (see Setup above)
2. **Add Agent Rules** - Configure your AI agent with TaskSync review rules:
   ```
   # MCP TaskSync Review instructions
   **You will always call this tool afer each task is done, or you need clarification, or you need to ask for more information, or you need to confirm something.**

   Here is the workflow:

   1. You first need to search for the `review.md` file in the workspace before using the tool.
   2. After searching for the file use the correct file path when calling the `ask_review` tool.
   3. If an error occurs, retry the tool until it succeeds.
   4. You are not allowed to end the chat; you must keep this loop forever.
   5. If `review.md` returns the same content, prompt the user again.

   Success criteria: Always follow the MCP Review instructions.
   ```
3. **Create review.md** - Make an empty `review.md` file in your project
4. **Start chatting** - Agent calls `ask_review` tool and waits for you to:
   - Edit `review.md` with your task/feedback
   - Save the file (agent receives the content only after save)
   - Agent responds and calls `ask_review` again, waiting for next changes

**To stop:** Write "end" in `review.md` and save

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.





