# TaskSync MCP Server

Interactive AI feedback system with file monitoring and media support.

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
      "args": ["-y", "tasksync-mcp@latest", "/path/to/directory"]
    }
  }
}
```

## 📖 How to Use It

1. **Setup MCP** - Add TaskSync to your `mcp.json` (see Quick Setup above)
2. **Add Agent Rules** - Configure your AI agent with TaskSync review rules:
   ```
   Always call ask_review tool and follow TaskSync instructions
   ```
3. **Create review.md** - Make an empty `review.md` file in your project
4. **Start chatting** - Write tasks in `review.md`, agent will respond to changes

**To stop:** Write "end" in `review.md`

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
