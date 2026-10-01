# Language Lab for VS Code

Open a `.lang` file for highlighting, Problems diagnostics, completion, hover, go-to-definition, references and document symbols. Open a folder containing `langlab.json` to run a multi-file project; unsaved editor buffers take precedence over disk.

Use **Language Lab: Run Project / File** (Ctrl+Enter / Cmd+Enter) to open the interactive App Preview beside your code. Inspector configuration is separate from application inputs. Source edits stop the old session; **Run latest source** rebuilds it. **Language Lab: Stop Application** terminates execution. **Language Lab: Export Standalone HTML** creates a complete offline app. **Language Lab: Build Windows Application** produces a native `.exe`, and **Language Lab: Build Android APK** packages the same app as an Android APK when the required native toolchains are installed.

Install the repository-built `language-lab.vsix` with **Extensions → … → Install from VSIX**. This is a local desktop extension, not a Marketplace publication. Execution and export require Workspace Trust. Remote desktop extension hosts use their own workspace filesystem; browser-only vscode.dev is not supported in this release.

See the repository's [VS Code guide](https://github.com/evanstom273/test-programming-language/blob/main/docs/vscode.md) for project limits, state and development instructions.
