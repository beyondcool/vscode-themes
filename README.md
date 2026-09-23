# vscode-themes README

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**

## Export vsix
你以后每次的流程（改完主题后重新打包安装）

```shell
bash pkg_and_install.sh          # 打包 + 安装（推荐）
```

或者手动分两步：

```shell
npx @vscode/vsce package          # 生成新的 .vsix
```

## Install vsix

```shell
code --install-extension zhouhe-dark.vsix --force   # 覆盖安装
```

## 扩展功能：单词高亮接管

这个 `vsix` 里同时有**主题**（`contributes.themes`）和**扩展代码**（`extension.js`），
所以执行 `pkg_and_install.sh` 后，主题和扩展功能会一起装进 VS Code。

扩展提供的能力：

| 命令（命令面板搜索 `zhouhe-dark`） | 作用 |
| --- | --- |
| `zhouhe-dark: 应用主题与推荐设置` | 应用主题 + 推荐设置，并启用单词高亮接管 |
| `zhouhe-dark: 开关「单词高亮接管」` | 临时开启 / 关闭接管 |
| `zhouhe-dark: 恢复 VS Code 内置高亮` | 归还给 VS Code 内置实现 |

### 它改了什么逻辑

VS Code 内置的「高亮选中单词 / 出现处」由 `editor.selectionHighlight`
和 `editor.occurrencesHighlight` 控制，行为固定、配色也固定。

接管后（**仅在 `zhouhe-dark` 主题下生效**）：

1. 自动把上面两个内置设置关闭；
2. 由扩展自己绘制高亮，颜色取自主题自身的色键，所以和主题完全一致；
3. 只有**选区正好等于一个完整单词**时才高亮（光标停下不算，选区多/少一个字符也不算）；
4. 行为可通过设置调整 —— 搜索 `zhouhe-dark`：

- `wordHighlight.highlightOnCursor`：**默认 `false`** —— 只有光标、没有选区时不高亮
- `wordHighlight.mode`：`currentFile`（仅当前文件）/ `openFiles`（含所有已打开文件）
- `wordHighlight.matchCase`：**默认 `true`**，区分大小写 —— 选中 `order` 不会高亮 `Order`
- `wordHighlight.wholeWord`：**默认 `always`**，全词匹配 —— `orderBook`、`order_book`、`order2` 都不会被高亮
- `wordHighlight.minWordLength`
- `wordHighlight.wordSeparators`：自定义单词边界
- `wordHighlight.currentStyle` / `matchStyle`：当前那处 / 其余出现处的配色，
  可选 `selection`、`word`、`strong`、`find`，对应主题里的
  `editor.selectionHighlightBackground` 等色键
- `autoApplyOnThemeChange`：切换主题时是否自动应用推荐设置

> 切换回别的主题，或者停用 / 卸载本扩展时，会自动把内置设置还原成你原来的值。

### 开发调试

在 VS Code 里按 `F5`（`.vscode/launch.json` 已配好 `extensionHost`），
会在一个新窗口里加载主题 + 扩展功能。
