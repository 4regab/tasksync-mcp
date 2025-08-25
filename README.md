# TaskSync MCP Server

 TaskSync provides tools for interactive user feedback and command execution in AI-assisted development with image view support.

## 🌟 Key Features

#### 🔄 Continuous Review Feedback
- **get_feedback** tool that reads `feedback.md` for real-time feedback
- Automatically creates `feedback.md` if it doesn't exist in the workspace
- File watcher automatically detects changes and notifies waiting processes
- Essential for iterative development and user feedback loops

#### 🖼️ Media Processing
- **view_media** tool for images files with base64 encoding
- Supports image formats: PNG, JPEG, GIF, WebP, BMP, SVG
- Efficient streaming for large files with proper MIME type detection

## 🛠️ Setup

Add to `mcp.json`:
```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["-y", "tasksync-mcp@latest", "/path/to/directory"]
    }
  }
}
```

For VS Code:
```json
{
	"servers": {
    "tasksync": {
      "command": "npx",
		"type": "stdio",
      	"args": ["-y", "tasksync-mcp@latest", "/path/to/directory"]
    }
  }
}
```

## 📖 How to Use It

1. **Setup MCP** - Add TaskSync MCP server to your `mcp.json` (you must configure the path to directory or workspace)
2. **Add Agent Rules** - Configure your AI agent with TaskSync feedback rules:
	```
	# MCP TaskSync Server Tool Rules
	
	Strictly follow mcp_tasksync_get_feedback tool descriptions and instructions.
	```
3. **Create review.md** - Make an empty `review.md` file in your project
4. **Start chatting** - Agent calls `get_feedback` tool and waits for you to:
   - Edit `feedback.md` with your task/feedback
   - Save the file (agent receives the content only after save)
   - Agent responds and calls `get_feedback` again, waiting for next changes
   - **To stop:** Write "end" in `feedback.md` and save

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.









